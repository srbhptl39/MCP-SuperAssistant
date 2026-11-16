/**
 * Capture shortcut flow: `capture-page` command → extract the active tab's
 * readable content → route it to the user's default AI platform tab (focus an
 * existing one or open a new one) → deliver via targeted message or a pending
 * queue that the content script drains once it's ready.
 */
import { AI_PLATFORMS, browserBridgeStorage, platformForUrl } from '@extension/storage';
import { createLogger } from '@extension/shared/lib/logger';
import { extractReadableContent } from './extractor';
import { telemetry } from '../../../utils/telemetry';

const logger = createLogger('CaptureFlow');

const CAPTURE_MAX_CHARS = 20000;
const PENDING_TTL = 90_000;

interface PendingCapture {
  text: string;
  autoSubmit: boolean;
  ts: number;
}

const pending = new Map<number, PendingCapture>();

/** Register the command listener. Call once at background startup. */
export function initCaptureFlow(): void {
  chrome.commands.onCommand.addListener(command => {
    if (command !== 'capture-page') return;
    handleCapture().catch(err => logger.error('[CaptureFlow] capture failed:', err));
  });
}

/**
 * Handle a `browser-bridge:content-ready` message from a content script.
 * Delivers any queued capture for that tab, then drops it.
 */
export function handleContentReady(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { pending?: { text: string; autoSubmit: boolean } }) => void,
): void {
  const tabId = sender.tab?.id;
  if (tabId != null) {
    const payload = pending.get(tabId);
    if (payload) {
      pending.delete(tabId);
      if (Date.now() - payload.ts < PENDING_TTL) {
        sendResponse({ pending: { text: payload.text, autoSubmit: payload.autoSubmit } });
        return;
      }
    }
  }
  sendResponse({});
}

async function handleCapture(): Promise<void> {
  const settings = await browserBridgeStorage.get();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  let u: URL;
  try {
    u = new URL(tab.url);
  } catch {
    return;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  // Don't capture an AI platform tab into itself.
  if (platformForUrl(tab.url)) return;

  let data;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractReadableContent,
      args: [settings.captureMode, CAPTURE_MAX_CHARS, true],
    });
    data = injection?.result;
  } catch (err) {
    logger.error('[CaptureFlow] extraction failed:', err);
    return;
  }
  if (!data) return;

  // Function replacers avoid `$`-sequence interpretation in the page content.
  const text = settings.captureTemplate
    .replace(/{title}/g, () => data.title)
    .replace(/{url}/g, () => data.url)
    .replace(/{content}/g, () => data.content);

  await routeToTarget(text, settings.autoSubmitCapture, settings.defaultAiPlatform, settings.openBehavior);
  void telemetry.record('capture', settings.defaultAiPlatform);
}

async function routeToTarget(
  text: string,
  autoSubmit: boolean,
  platformId: keyof typeof AI_PLATFORMS,
  openBehavior: 'focus-existing' | 'always-new-tab',
): Promise<void> {
  const platform = AI_PLATFORMS[platformId];
  const matchesPlatform = (url?: string): boolean => {
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return platform.hostPatterns.some(p => host === p || host.endsWith(`.${p}`));
    } catch {
      return false;
    }
  };

  if (openBehavior === 'focus-existing') {
    const all = await chrome.tabs.query({});
    const matches = all.filter(t => matchesPlatform(t.url));
    if (matches.length) {
      const target = matches.slice().sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
      if (target.id != null) {
        await chrome.tabs.update(target.id, { active: true });
        if (target.windowId != null) await chrome.windows.update(target.windowId, { focused: true });
        try {
          await chrome.tabs.sendMessage(target.id, {
            type: 'browser-bridge:insert-capture',
            payload: { text, autoSubmit },
          });
        } catch {
          // Content script not ready yet — queue for its content-ready ping.
          pending.set(target.id, { text, autoSubmit, ts: Date.now() });
        }
        return;
      }
    }
  }

  const created = await chrome.tabs.create({ url: platform.newChatUrl });
  if (created.id != null) pending.set(created.id, { text, autoSubmit, ts: Date.now() });
}
