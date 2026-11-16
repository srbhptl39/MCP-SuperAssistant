/**
 * Virtual "browser" tool server. Exposes browser_* tools that appear in the
 * sidebar / instruction prompt like real MCP tools but execute locally in the
 * background service worker. All permission enforcement lives here — never trust
 * the prompt.
 */
import { browserBridgeStorage, isDeniedHostname, normalizeHostname } from '@extension/storage';
import { createLogger } from '@extension/shared/lib/logger';
import { extractReadableContent, extractSelection, snapshotInteractive, doInteract, waitInPage } from './extractor';

const logger = createLogger('BrowserTools');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const DEFAULT_MAX_CHARS = 20000;
const NEED_PERMISSION_MSG =
  'Browser tools need browser access to read tabs. Ask the user to click "Allow access" under Browser access in the extension settings, then try again.';

// Hostnames that block content-script injection or should never be touched.
const EXCLUDED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com', 'addons.mozilla.org'];

/** Normalized tool shape the rest of the app expects. */
interface BrowserTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  schema: string;
}

const defineTool = (name: string, description: string, inputSchema: Record<string, unknown>): BrowserTool => ({
  name,
  description,
  input_schema: inputSchema,
  schema: JSON.stringify(inputSchema),
});

const noArgs = { type: 'object', properties: {}, additionalProperties: false } as const;

const READ_TOOLS: BrowserTool[] = [
  defineTool(
    'browser_list_tabs',
    'List the open browser tabs the user is willing to share (excludes browser/extension pages and denylisted sites). Returns a JSON array of {tabId, title, url, active, windowId, pinned}. Call this first to discover tabIds for the other browser tools.',
    noArgs,
  ),
  defineTool(
    'browser_read_tab',
    'Read the readable text content of an open browser tab. Pass the tabId from browser_list_tabs. Optional "mode": "article" (main readable content, default) or "full_text" (whole page text). Optional "maxChars" caps the returned length (default 20000); the result notes whether it was truncated. Optional "include_links" inlines hyperlink URLs as [text](url) (default true).',
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The tabId from browser_list_tabs.' },
        mode: { type: 'string', enum: ['article', 'full_text'], description: 'Extraction mode.' },
        maxChars: { type: 'number', description: 'Maximum characters of content to return.' },
        include_links: { type: 'boolean', description: 'Inline hyperlink URLs as [text](url). Default true.' },
      },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_snapshot_tab',
    'Snapshot the visible interactive elements (links, buttons, inputs, selects, etc.) of a tab and tag them with stable indices so browser_interact_tab can target them. Pass the tabId from browser_list_tabs. Optional "maxElements" caps how many are returned (default 60). Optional "query" returns only elements whose label matches the substring (case-insensitive); optional "scope" restricts to elements under a CSS selector — both cut token cost on large pages. Returns a JSON list of {index, tag, type, label} where type is the element\'s ARIA role when clearer than the tag.',
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'From browser_list_tabs.' },
        maxElements: { type: 'number', description: 'Cap (default 60).' },
        query: { type: 'string', description: 'Case-insensitive label substring filter.' },
        scope: { type: 'string', description: 'CSS selector to restrict the snapshot root.' },
      },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_get_selection',
    'Get the text the user currently has selected/highlighted in a tab, plus that tab title and url. Optional "tabId" (defaults to the active tab).',
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab to read the selection from. Defaults to the active tab.' },
      },
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_wait',
    "Wait for a condition in a tab before reading or acting on it. `wait` = 'selector' | 'text' | 'url_substring' | 'ms' | 'load'; the target is passed in `value` (a CSS selector, page text, a URL substring, or milliseconds — 'load' needs no value). Optional `timeout` ms (default 6000, max 20000). Use before browser_read_tab / browser_snapshot_tab when a page loads content asynchronously. (Also available as a step inside browser_interact_tab.)",
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'From browser_list_tabs.' },
        wait: {
          type: 'string',
          enum: ['selector', 'text', 'url_substring', 'ms', 'load'],
          description: "What to wait for (default 'load').",
        },
        value: { type: 'string', description: 'CSS selector / page text / url substring / ms (not needed for load).' },
        timeout: { type: 'number', description: 'ms deadline (default 6000, max 20000).' },
      },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
];

const ACT_TOOLS: BrowserTool[] = [
  defineTool(
    'browser_open_tab',
    'Open a new browser tab at an http/https URL. Optional "background": true opens it without switching to it. Returns {tabId, url}.',
    {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL to open.' },
        background: { type: 'boolean', description: 'Open in the background without focusing it.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_navigate',
    "Navigate a tab (by tabId): load a new http/https URL, or go back/forward/reload. Pass `url` to load, or `action` = 'back' | 'forward' | 'reload' (url then optional).",
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The tabId to navigate.' },
        url: { type: 'string', description: 'Absolute http(s) URL to load.' },
        action: { type: 'string', enum: ['back', 'forward', 'reload'], description: 'History/reload action (url optional).' },
      },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_focus_tab',
    'Bring a tab (by tabId) to the foreground and focus its window.',
    {
      type: 'object',
      properties: { tabId: { type: 'number', description: 'The tabId to focus.' } },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_close_tab',
    'Close a tab by tabId.',
    {
      type: 'object',
      properties: { tabId: { type: 'number', description: 'The tabId to close.' } },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
  defineTool(
    'browser_interact_tab',
    "Interact with a tab: run one action or a batched sequence of actions (click, fill, select, hover, check/uncheck, press a key, scroll, get an element's text/value/attr, or wait for a selector/text/url/load) in a single call. Provide `actions` as an array of step objects, or the legacy single-action params. Target elements by `index` (from browser_snapshot_tab) or CSS `selector`. Steps run in order and stop at the first failure; each step reports its result. Pass the tabId from browser_list_tabs.",
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'From browser_list_tabs.' },
        actions: {
          type: 'array',
          description: 'Steps run in order, stop on first failure. Preferred over the single-action params.',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['click', 'fill', 'select', 'hover', 'check', 'uncheck', 'press', 'press_enter', 'scroll', 'get', 'wait'],
              },
              index: { type: 'number', description: 'Element index from browser_snapshot_tab.' },
              selector: { type: 'string', description: 'CSS selector (alternative to index).' },
              value: {
                type: 'string',
                description:
                  "fill: text; select: option value/label; scroll: px or 'top'/'bottom'; press: key name e.g. 'Enter','Tab','ArrowDown'.",
              },
              modifiers: {
                type: 'array',
                items: { type: 'string', enum: ['ctrl', 'shift', 'alt', 'meta'] },
                description: 'For press: modifier keys held with the key.',
              },
              get: {
                type: 'string',
                enum: ['text', 'value', 'attr', 'exists'],
                description: 'For action=get: what to read.',
              },
              attr: { type: 'string', description: 'For get:attr — attribute name.' },
              wait: {
                type: 'string',
                enum: ['selector', 'text', 'url_substring', 'ms', 'load'],
                description: "For action=wait: what to wait for. arg comes from 'value'.",
              },
              timeout: { type: 'number', description: 'For action=wait: ms deadline (default 6000, max 20000).' },
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
        action: {
          type: 'string',
          enum: ['click', 'fill', 'select', 'hover', 'check', 'uncheck', 'press', 'press_enter', 'scroll', 'get', 'wait'],
          description: "Legacy single action (use 'actions' for sequences).",
        },
        index: { type: 'number' },
        selector: { type: 'string' },
        value: { type: 'string' },
        modifiers: { type: 'array', items: { type: 'string' } },
        get: { type: 'string' },
        attr: { type: 'string' },
        wait: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['tabId'],
      additionalProperties: false,
    },
  ),
];

const ACT_TOOL_NAMES = new Set(ACT_TOOLS.map(t => t.name));

/** Tools to advertise given the current settings (read gated on browserToolsEnabled, act on browserControlEnabled). */
export async function getBrowserTools(): Promise<BrowserTool[]> {
  const settings = await browserBridgeStorage.get();
  if (!settings.browserToolsEnabled) return [];
  return settings.browserControlEnabled ? [...READ_TOOLS, ...ACT_TOOLS] : [...READ_TOOLS];
}

/** MCP-style text result — matches what real tools return so the renderer + auto-insert work unchanged. */
const textResult = (text: string) => ({ content: [{ type: 'text', text }] });

/** Returns a human-readable reason the tab can't be accessed, or null if it's fine. */
const tabExclusionReason = (tab: chrome.tabs.Tab, denylist: string[]): string | null => {
  if (!tab.url) return 'That tab has no accessible URL.';
  let host: string;
  try {
    const u = new URL(tab.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'That tab is a browser or extension page and cannot be accessed.';
    }
    host = normalizeHostname(u.hostname);
  } catch {
    return 'That tab has an invalid URL.';
  }
  if (EXCLUDED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) {
    return 'That tab is a browser store page and cannot be accessed.';
  }
  if (isDeniedHostname(host, denylist)) return 'That tab is on your denylist and cannot be accessed.';
  return null;
};

const parseTabId = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const hasAllUrls = () => chrome.permissions.contains({ origins: ['<all_urls>'] });

/** Wait until a tab finishes loading (or timeout). */
async function waitForComplete(tabId: number, timeoutMs = 10000): Promise<chrome.tabs.Tab> {
  const start = Date.now();
  let tab = await chrome.tabs.get(tabId);
  while (Date.now() - start < timeoutMs && (tab.status !== 'complete' || tab.discarded)) {
    await new Promise(r => setTimeout(r, 200));
    tab = await chrome.tabs.get(tabId);
  }
  return tab;
}

/**
 * Wait for a condition on a tab. Shared by browser_wait and the interact_tab
 * batch loop. ms = sleep, load = tab status, url_substring = SW poll of tab.url,
 * selector/text = in-page poll via waitInPage.
 */
async function runWait(
  tabId: number,
  kind: string,
  arg: string,
  timeout: number,
): Promise<{ note: string; matched: boolean }> {
  if (kind === 'ms') {
    await sleep(Math.min(Number(arg) || 1000, 20000));
    return { note: 'wait ms: done', matched: true };
  }
  if (kind === 'load') {
    const t = await waitForComplete(tabId, timeout);
    return { note: `wait load: status ${t.status}`, matched: true };
  }
  if (kind === 'url_substring') {
    const deadline = Date.now() + timeout;
    let matched = false;
    while (Date.now() < deadline) {
      const cur = await chrome.tabs.get(tabId);
      if ((cur.url || '').indexOf(arg) >= 0) {
        matched = true;
        break;
      }
      await sleep(150);
    }
    return { note: `wait url_substring: ${matched ? 'matched' : 'timeout'}`, matched };
  }
  const [inj] = await chrome.scripting.executeScript({ target: { tabId }, func: waitInPage, args: [kind, arg, timeout] });
  const r = inj?.result;
  return { note: `wait ${kind}: ${r?.note ?? 'no result'}`, matched: !!(r && r.matched) };
}

/**
 * Execute a browser_* tool. Returns an MCP-style text result (errors included) —
 * never throws, so a tool failure doesn't flip connection state.
 */
export async function executeBrowserTool(
  toolName: string,
  args: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
) {
  try {
    const settings = await browserBridgeStorage.get();
    if (!settings.browserToolsEnabled) {
      return textResult('Browser tools are off. Ask the user to turn on "AI can read your tabs" in the extension settings.');
    }
    if (ACT_TOOL_NAMES.has(toolName) && !settings.browserControlEnabled) {
      return textResult(
        'Tab control is off. Ask the user to turn on "AI can control tabs" in the extension settings to let the AI open, navigate, focus, or close tabs.',
      );
    }

    const denylist = settings.domainDenylist;
    const callerTabId = sender.tab?.id;

    switch (toolName) {
      case 'browser_list_tabs':
        return await listTabs(denylist);
      case 'browser_read_tab':
        return await readTab(args);
      case 'browser_snapshot_tab':
        return await snapshotTab(args, denylist);
      case 'browser_get_selection':
        return await getSelection(args, denylist);
      case 'browser_wait':
        return await waitTab(args, denylist);
      case 'browser_interact_tab':
        return await interactTab(args, denylist, callerTabId);
      case 'browser_open_tab':
        return await openTab(args, denylist);
      case 'browser_navigate':
        return await navigate(args, denylist, callerTabId);
      case 'browser_focus_tab':
        return await focusTab(args, denylist);
      case 'browser_close_tab':
        return await closeTab(args, denylist, callerTabId);
      default:
        return textResult(`Unknown browser tool: ${toolName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[BrowserTools] ${toolName} failed:`, error);
    return textResult(`Error running ${toolName}: ${message}`);
  }
}

/** Tab shape returned to internal callers (UI tab picker). Includes favIconUrl. */
export interface TabInfo {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  pinned: boolean;
}

/** List shareable tabs (excludes browser/extension pages and denylisted sites). */
export async function listTabsRaw(denylist: string[]): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  return tabs
    .filter(t => !tabExclusionReason(t, denylist))
    .map(t => ({
      tabId: t.id as number,
      title: t.title || '',
      url: t.url as string,
      favIconUrl: t.favIconUrl,
      active: !!t.active,
      windowId: t.windowId,
      pinned: !!t.pinned,
    }));
}

export type ReadTabResult =
  | { ok: true; title: string; url: string; content: string; truncated: boolean }
  | { ok: false; error: string; needsPermission?: boolean };

/** Read readable content of a tab. Loads settings internally for denylist + default mode. */
export async function readTabRaw(
  tabId: number,
  opts?: { mode?: 'article' | 'full_text'; maxChars?: number; includeLinks?: boolean },
): Promise<ReadTabResult> {
  if (!Number.isFinite(tabId)) return { ok: false, error: 'A numeric tabId is required.' };
  if (!(await hasAllUrls())) return { ok: false, error: NEED_PERMISSION_MSG, needsPermission: true };

  const settings = await browserBridgeStorage.get();
  let tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, settings.domainDenylist);
  if (reason) return { ok: false, error: reason };

  if (tab.discarded) {
    await chrome.tabs.reload(tabId);
    tab = await waitForComplete(tabId);
  } else if (tab.status !== 'complete') {
    tab = await waitForComplete(tabId);
  }

  const mode = opts?.mode === 'full_text' || opts?.mode === 'article' ? opts.mode : settings.captureMode;
  const maxChars = Number.isFinite(opts?.maxChars) ? (opts!.maxChars as number) : DEFAULT_MAX_CHARS;
  const includeLinks = opts?.includeLinks !== false;

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractReadableContent,
    args: [mode, maxChars, includeLinks],
  });
  const data = injection?.result;
  if (!data) return { ok: false, error: 'Could not read that tab (the page may block content extraction).' };

  return {
    ok: true,
    title: data.title,
    url: data.url,
    content: data.content || '(no readable text found on this page)',
    truncated: data.truncated,
  };
}

async function listTabs(denylist: string[]) {
  // Strip favIconUrl so the MCP tool output stays byte-compatible with before.
  const rows = (await listTabsRaw(denylist)).map(({ favIconUrl, ...r }) => r);
  return textResult(JSON.stringify(rows, null, 2));
}

async function readTab(args: Record<string, unknown>) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_read_tab requires a numeric tabId (get one from browser_list_tabs).');

  const mode = args.mode === 'full_text' || args.mode === 'article' ? args.mode : undefined;
  const maxChars = parseTabId(args.maxChars) ?? undefined;
  const includeLinks = args.include_links !== false;

  const result = await readTabRaw(tabId, { mode, maxChars, includeLinks });
  if (!result.ok) return textResult(result.error);

  const header = `Title: ${result.title}\nURL: ${result.url}\nTruncated: ${result.truncated}\n\n`;
  return textResult(header + result.content);
}

async function snapshotTab(args: Record<string, unknown>, denylist: string[]) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) {
    return textResult('browser_snapshot_tab requires a numeric tabId (get one from browser_list_tabs).');
  }
  if (!(await hasAllUrls())) return textResult(NEED_PERMISSION_MSG);

  let tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);

  if (tab.discarded) {
    await chrome.tabs.reload(tabId);
    tab = await waitForComplete(tabId);
  } else if (tab.status !== 'complete') {
    tab = await waitForComplete(tabId);
  }

  const maxElements = parseTabId(args.maxElements) ?? 60;
  const query = args.query != null ? String(args.query) : '';
  const scope = args.scope != null ? String(args.scope) : '';

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: snapshotInteractive,
    args: [maxElements, query, scope],
  });
  const data = injection?.result;
  if (!data) return textResult('Could not snapshot that tab (the page may block content extraction).');

  const header = `Title: ${data.title}\nURL: ${data.url}\nInteractive elements: ${data.elements.length}\n\n`;
  return textResult(header + JSON.stringify(data.elements, null, 2));
}

// One step of a browser_interact_tab batch (also used to wrap a legacy single-action call).
interface InteractStep {
  action?: unknown;
  index?: unknown;
  selector?: unknown;
  value?: unknown;
  modifiers?: unknown;
  get?: unknown;
  attr?: unknown;
  wait?: unknown;
  timeout?: unknown;
}

async function interactTab(args: Record<string, unknown>, denylist: string[], callerTabId?: number) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_interact_tab requires a numeric tabId.');
  if (callerTabId != null && tabId === callerTabId) return textResult('Refusing to interact with the AI chat tab.');

  if (!(await hasAllUrls())) return textResult(NEED_PERMISSION_MSG);

  // Re-checked before every step: a click or Enter can navigate the tab onto a blocked site.
  // Also checks pendingUrl, so a navigation still in flight to a blocked site stops the batch.
  const blocked = async () => {
    const t = await chrome.tabs.get(tabId);
    return tabExclusionReason(t, denylist) ?? (t.pendingUrl ? tabExclusionReason({ ...t, url: t.pendingUrl }, denylist) : null);
  };
  const reason = await blocked();
  if (reason) return textResult(reason);

  const steps: InteractStep[] =
    Array.isArray(args.actions) && args.actions.length
      ? (args.actions as InteractStep[])
      : [
          {
            action: args.action,
            index: args.index,
            selector: args.selector,
            value: args.value,
            modifiers: args.modifiers,
            get: args.get,
            attr: args.attr,
            wait: args.wait,
            timeout: args.timeout,
          },
        ];

  const VALID = ['click', 'fill', 'select', 'hover', 'check', 'uncheck', 'press', 'press_enter', 'scroll', 'get', 'wait'];
  const results: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const action = String(s.action ?? '');
    if (i > 0) {
      const now = await blocked();
      if (now) {
        results.push(`step ${i + 1}: stopped. ${now}`);
        break;
      }
    }
    if (!VALID.includes(action)) {
      results.push(`step ${i + 1} ${action || '(none)'}: invalid action`);
      break;
    }

    if (action === 'wait') {
      const kind = String(s.wait ?? 'ms');
      const arg = s.value != null ? String(s.value) : '';
      const timeout = Math.min(Number(s.timeout) || 6000, 20000);
      const w = await runWait(tabId, kind, arg, timeout);
      results.push(`step ${i + 1} ${w.note}`);
      if (!w.matched) break;
      continue;
    }

    const index = s.index != null ? (parseTabId(s.index) ?? null) : null;
    const selector = s.selector != null ? String(s.selector) : null;
    const value = s.value != null ? String(s.value) : null;
    const modifiers = Array.isArray(s.modifiers) ? s.modifiers.map(String) : [];
    const getKind = s.get != null ? String(s.get) : null;
    const attr = s.attr != null ? String(s.attr) : null;

    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      func: doInteract,
      args: [action, index, selector, value, modifiers, getKind, attr],
    });
    const r = inj?.result;
    if (!r) {
      results.push(`step ${i + 1} ${action}: page blocked extraction`);
      break;
    }
    results.push(
      `step ${i + 1} ${action}: ${r.note}${r.value != null ? ' => ' + r.value : ''}${r.urlChanged ? ' (url changed)' : ''}`,
    );
    // A click/Enter may navigate — settle before the next step so re-injection hits the new context.
    if (r.urlChanged) await waitForComplete(tabId, 4000);
    if (!r.ok) break;
  }

  const finalTab = await chrome.tabs.get(tabId);
  return textResult(results.join('\n') + `\nFinal URL: ${finalTab.url}`);
}

async function waitTab(args: Record<string, unknown>, denylist: string[]) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_wait requires a numeric tabId.');
  if (!(await hasAllUrls())) return textResult(NEED_PERMISSION_MSG);

  const tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);

  const kind = String(args.wait ?? 'load');
  const arg = args.value != null ? String(args.value) : '';
  const timeout = Math.min(Number(args.timeout) || 6000, 20000);
  const w = await runWait(tabId, kind, arg, timeout);
  const finalTab = await chrome.tabs.get(tabId);
  return textResult(`${w.note}\nURL: ${finalTab.url}`);
}

async function getSelection(args: Record<string, unknown>, denylist: string[]) {
  let tabId = args.tabId != null ? parseTabId(args.tabId) : null;
  let tab: chrome.tabs.Tab | undefined;
  if (tabId === null) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
  } else {
    tab = await chrome.tabs.get(tabId);
  }
  if (!tab || tabId === null) return textResult('No tab found to read a selection from.');

  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);
  if (!(await hasAllUrls())) return textResult(NEED_PERMISSION_MSG);

  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: extractSelection });
  const data = injection?.result;
  if (!data) return textResult('Could not read the selection from that tab.');
  if (!data.selection) return textResult(`No text is currently selected in "${data.title}".`);
  return textResult(`Selection from "${data.title}" (${data.url}):\n\n${data.selection}`);
}

async function openTab(args: Record<string, unknown>, denylist: string[]) {
  const raw = String(args.url ?? '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return textResult('browser_open_tab requires a valid absolute URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return textResult('Only http(s) URLs can be opened.');
  const host = normalizeHostname(u.hostname);
  if (EXCLUDED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return textResult('Browser store pages cannot be opened.');
  if (isDeniedHostname(host, denylist)) return textResult('That destination is on your denylist.');
  const tab = await chrome.tabs.create({ url: raw, active: !args.background });
  return textResult(JSON.stringify({ tabId: tab.id, url: raw }, null, 2));
}

async function navigate(args: Record<string, unknown>, denylist: string[], callerTabId?: number) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_navigate requires a numeric tabId.');
  if (callerTabId != null && tabId === callerTabId) return textResult('Refusing to navigate the AI chat tab.');

  const tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);

  const navAction = args.action != null ? String(args.action) : '';
  if (navAction === 'back' || navAction === 'forward' || navAction === 'reload') {
    if (navAction === 'reload') {
      await chrome.tabs.reload(tabId);
    } else {
      // chrome.tabs.goBack/goForward misfire ("Cannot find a next page in history")
      // even with valid history; drive the page's own history API instead.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (dir: string) => {
          if (dir === 'forward') history.forward();
          else history.back();
        },
        args: [navAction],
      });
    }
    return textResult(`Tab ${tabId}: ${navAction}.`);
  }

  const raw = String(args.url ?? '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return textResult('browser_navigate requires a valid absolute URL (or action: back/forward/reload).');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return textResult('Only http(s) URLs are allowed.');
  const host = normalizeHostname(u.hostname);
  if (EXCLUDED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return textResult('Browser store pages cannot be opened.');
  if (isDeniedHostname(host, denylist)) return textResult('That destination is on your denylist.');

  await chrome.tabs.update(tabId, { url: raw });
  return textResult(`Navigated tab ${tabId} to ${raw}.`);
}

async function focusTab(args: Record<string, unknown>, denylist: string[]) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_focus_tab requires a numeric tabId.');
  const tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
  return textResult(`Focused tab ${tabId}.`);
}

async function closeTab(args: Record<string, unknown>, denylist: string[], callerTabId?: number) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_close_tab requires a numeric tabId.');
  if (callerTabId != null && tabId === callerTabId) return textResult('Refusing to close the AI chat tab.');
  const tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);
  await chrome.tabs.remove(tabId);
  return textResult(`Closed tab ${tabId}.`);
}
