/**
 * Virtual "browser" tool server. Exposes browser_* tools that appear in the
 * sidebar / instruction prompt like real MCP tools but execute locally in the
 * background service worker. All permission enforcement lives here — never trust
 * the prompt.
 */
import { browserBridgeStorage, isDeniedHostname } from '@extension/storage';
import { createLogger } from '@extension/shared/lib/logger';
import { extractReadableContent, extractSelection } from './extractor';

const logger = createLogger('BrowserTools');

const DEFAULT_MAX_CHARS = 20000;
const NEED_PERMISSION_MSG =
  'Browser tools need full page access to read arbitrary tabs. Open the extension options page and enable "Browser tools full access" (grants <all_urls>), then try again.';

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
    'Read the readable text content of an open browser tab. Pass the tabId from browser_list_tabs. Optional "mode": "article" (main readable content, default) or "full_text" (whole page text). Optional "maxChars" caps the returned length (default 20000); the result notes whether it was truncated.',
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The tabId from browser_list_tabs.' },
        mode: { type: 'string', enum: ['article', 'full_text'], description: 'Extraction mode.' },
        maxChars: { type: 'number', description: 'Maximum characters of content to return.' },
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
    'Navigate an existing tab (by tabId) to a new http/https URL.',
    {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The tabId to navigate.' },
        url: { type: 'string', description: 'Absolute http(s) URL to load.' },
      },
      required: ['tabId', 'url'],
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
    host = u.hostname;
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
      return textResult('Browser tools are disabled. Enable "Browser tools" in the extension options page.');
    }
    if (ACT_TOOL_NAMES.has(toolName) && !settings.browserControlEnabled) {
      return textResult(
        'Browser control is disabled. Enable "Browser control" in the extension options page to let the AI open, navigate, focus, or close tabs.',
      );
    }

    const denylist = settings.domainDenylist;
    const callerTabId = sender.tab?.id;

    switch (toolName) {
      case 'browser_list_tabs':
        return await listTabs(denylist);
      case 'browser_read_tab':
        return await readTab(args);
      case 'browser_get_selection':
        return await getSelection(args, denylist);
      case 'browser_open_tab':
        return await openTab(args);
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
  opts?: { mode?: 'article' | 'full_text'; maxChars?: number },
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

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractReadableContent,
    args: [mode, maxChars],
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

  const result = await readTabRaw(tabId, { mode, maxChars });
  if (!result.ok) return textResult(result.error);

  const header = `Title: ${result.title}\nURL: ${result.url}\nTruncated: ${result.truncated}\n\n`;
  return textResult(header + result.content);
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

async function openTab(args: Record<string, unknown>) {
  const raw = String(args.url ?? '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return textResult('browser_open_tab requires a valid absolute URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return textResult('Only http(s) URLs can be opened.');
  const tab = await chrome.tabs.create({ url: raw, active: !args.background });
  return textResult(JSON.stringify({ tabId: tab.id, url: raw }, null, 2));
}

async function navigate(args: Record<string, unknown>, denylist: string[], callerTabId?: number) {
  const tabId = parseTabId(args.tabId);
  if (tabId === null) return textResult('browser_navigate requires a numeric tabId.');
  if (callerTabId != null && tabId === callerTabId) return textResult('Refusing to navigate the AI chat tab.');

  const raw = String(args.url ?? '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return textResult('browser_navigate requires a valid absolute URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return textResult('Only http(s) URLs are allowed.');
  if (isDeniedHostname(u.hostname, denylist)) return textResult('That destination is on your denylist.');

  const tab = await chrome.tabs.get(tabId);
  const reason = tabExclusionReason(tab, denylist);
  if (reason) return textResult(reason);

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
