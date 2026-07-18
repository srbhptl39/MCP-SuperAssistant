/**
 * Receives captures pushed from the background (capture shortcut) and inserts
 * them into the active AI adapter's chat input. If no adapter is active yet the
 * payload is buffered and flushed when one activates.
 */
import { eventBus } from '../events/event-bus';
import { useAdapterStore } from '../stores/adapter.store';
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('CaptureReceiver');

export interface CapturePayload {
  text: string;
  autoSubmit: boolean;
}

const AUTO_SUBMIT_DELAY = 1500;

let buffered: CapturePayload | null = null;
let flushListenerAttached = false;

/** Handle an incoming capture (from a targeted message or the pending queue). */
export function receiveCapture(payload: CapturePayload): void {
  const plugin = useAdapterStore.getState().getActiveAdapter()?.plugin;
  if (!plugin?.insertText) {
    buffered = payload;
    attachFlushListener();
    logger.debug('[CaptureReceiver] No active adapter yet, buffering capture');
    return;
  }
  void insertCapture(payload);
}

function attachFlushListener(): void {
  if (flushListenerAttached) return;
  flushListenerAttached = true;
  eventBus.on('adapter:activated', () => {
    if (!buffered) return;
    const plugin = useAdapterStore.getState().getActiveAdapter()?.plugin;
    if (!plugin?.insertText) return;
    const payload = buffered;
    buffered = null;
    void insertCapture(payload);
  });
}

const INSERT_RETRIES = 15;
const INSERT_RETRY_DELAY = 1000;

async function insertCapture(payload: CapturePayload): Promise<void> {
  // On a freshly-opened AI tab the adapter activates before the site's SPA has
  // rendered its chat input, so insertText can fail at first — retry briefly.
  for (let attempt = 0; attempt < INSERT_RETRIES; attempt++) {
    const plugin = useAdapterStore.getState().getActiveAdapter()?.plugin;
    try {
      if (plugin?.insertText && (await plugin.insertText(payload.text, { source: 'capture' })) !== false) {
        logger.debug('[CaptureReceiver] Capture inserted');
        if (payload.autoSubmit && plugin.submitForm) {
          setTimeout(() => {
            plugin.submitForm?.().catch(err => logger.error('[CaptureReceiver] Auto-submit failed:', err));
          }, AUTO_SUBMIT_DELAY);
        }
        return;
      }
    } catch (err) {
      logger.debug(`[CaptureReceiver] Insert attempt ${attempt + 1} failed:`, err);
    }
    await new Promise(r => setTimeout(r, INSERT_RETRY_DELAY));
  }
  logger.error('[CaptureReceiver] Failed to insert capture after retries (chat input never appeared?)');
}
