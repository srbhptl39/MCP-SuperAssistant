import { CONFIG } from '../core/config';
import { debounce } from '../utils/index';
import { renderFunctionCall, renderedFunctionBlocks, processedElements } from '../renderer/index';
import {
  monitorNode,
  streamingObservers,
  updateQueue,
  streamingLastUpdated,
  startProgressiveUpdates,
} from './streamObserver';
import { streamingContentLengths } from '../parser/index';
import {
  preExistingIncompleteBlocks,
  startStalledStreamDetection,
  stopStalledStreamDetection,
} from './stalledStreamHandler';
import { createLogger } from '@extension/shared/lib/logger';

// State for processing and observers
let isProcessing = false;
let functionCallObserver: MutationObserver | null = null;
let updateThrottleTimer: ReturnType<typeof setTimeout> | null = null;

const logger = createLogger('MutationObserver');

// Extend window type
declare global {
  interface Window {
    _isProcessing?: boolean;
    _updateQueue?: Map<string, HTMLElement>;
    _stalledStreams?: Set<string>;
    _stalledStreamRetryCount?: Map<string, number>;
    _processUpdateQueue?: () => void;
    preExistingIncompleteBlocks?: Set<string>;
  }
}

/**
 * Process queued updates with stabilization for smoothness
 */
export const processUpdateQueue = (): void => {
  const validUpdates = new Map<string, HTMLElement>();
  updateQueue.forEach((node, blockId) => {
    if (document.body.contains(node)) {
      validUpdates.set(blockId, node);
      // Update the last updated timestamp
      streamingLastUpdated.set(blockId, Date.now());
      // If previously marked as stalled, remove that marker
      if (window._stalledStreams && window._stalledStreams.has(blockId)) {
        window._stalledStreams.delete(blockId);
        const stalledIndicator = document.querySelector(`.stalled-indicator[data-stalled-for="${blockId}"]`);
        if (stalledIndicator) stalledIndicator.remove();
      }
    } else {
      if (CONFIG.debug) logger.debug(`Node for block ${blockId} removed, skipping update and cleaning up.`);
      const observer = streamingObservers.get(blockId);
      if (observer) {
        observer.disconnect();
        streamingObservers.delete(blockId);
      }
      renderedFunctionBlocks.delete(blockId);
      // Also drop per-segment cards (multi-call blocks render blockId-s1, blockId-s2, …).
      Array.from(renderedFunctionBlocks.keys())
        .filter(k => k.startsWith(`${blockId}-s`))
        .forEach(k => renderedFunctionBlocks.delete(k));
      streamingLastUpdated.delete(blockId);
      if (window._stalledStreams) window._stalledStreams.delete(blockId);
      // Clean up keys starting with blockId- from streamingContentLengths
      Array.from(streamingContentLengths.keys())
        .filter(key => key.startsWith(`${blockId}-`))
        .forEach(key => streamingContentLengths.delete(key));
    }
  });

  if (validUpdates.size === 0) {
    updateQueue.clear();
    if (isProcessing) {
      isProcessing = false;
      window._isProcessing = false;
    }
    return;
  }

  updateQueue.clear();
  validUpdates.forEach((node, blockId) => updateQueue.set(blockId, node));

  if (isProcessing) return;
  isProcessing = true;
  window._isProcessing = true;

  try {
    updateQueue.forEach((node, blockId) => {
      if (CONFIG.debug) logger.debug(`Processing update for block: ${blockId}`);
      renderFunctionCall(node as HTMLPreElement, { current: isProcessing });
    });

    updateQueue.clear();

    const hasLargeStreaming = Array.from(streamingContentLengths.values()).some(
      length => length > CONFIG.largeContentThreshold,
    );

    if (hasLargeStreaming) {
      startProgressiveUpdates();
    }
  } catch (e) {
    logger.error('Error processing update queue:', e);
  } finally {
    isProcessing = false;
    window._isProcessing = false;
  }
};

// Expose shared state to window
if (typeof window !== 'undefined') {
  window._isProcessing = isProcessing;
  window._updateQueue = updateQueue;
  window._stalledStreams = window._stalledStreams || new Set<string>();
  window._stalledStreamRetryCount = window._stalledStreamRetryCount || new Map<string, number>();
  window.preExistingIncompleteBlocks = preExistingIncompleteBlocks;
  window._processUpdateQueue = processUpdateQueue;
}

/**
 * Process all function calls in the document
 */
export const processFunctionCalls = (): number => {
  const processedCount = checkForUnprocessedFunctionCalls();
  return processedCount;
};

// element -> textContent at which renderFunctionCall last declined it (not a tool call).
const nonToolText = new WeakMap<Element, string>();

/**
 * Check for unprocessed function calls in the document
 */
export const checkForUnprocessedFunctionCalls = (): number => {
  let processedCount = 0;

  // Sites that swap a code block's element after hydration (ChatGPT renders a placeholder, then the
  // final data-code-block node) leave the first card behind with no source; the new node gets its own
  // card below, so drop cards whose source is gone. Multi-call cards use `${blockId}-s${i}`.
  document.querySelectorAll<HTMLElement>('.function-block[data-block-id^="block-"]').forEach(card => {
    // Fast path: the card's own source is still attached. Only fall back to the document-wide
    // query (O(DOM) per card) when it isn't, e.g. the site replaced it with a same-id node.
    if (card._mcpSource?.isConnected) return;
    const sourceId = card.getAttribute('data-block-id')!.replace(/-s\d+$/, '');
    if (!document.querySelector(`[data-block-id="${sourceId}"]:not(.function-block)`)) card.remove();
  });

  // Get all pre/code elements in the document that might contain function calls
  const getTargetElements = (): HTMLElement[] => {
    const elements: HTMLElement[] = [];
    for (const selector of CONFIG.targetSelectors) {
      const found = document.querySelectorAll<HTMLElement>(selector);
      elements.push(...Array.from(found));
    }
    return elements;
  };

  // Process each target element
  const elements = getTargetElements();
  for (const element of elements) {
    if (!processedElements.has(element) && !element.closest('.function-block')) {
      // Ordinary code blocks never enter processedElements; skip re-parsing them until their text changes.
      const text = element.textContent ?? '';
      if (nonToolText.get(element) === text) continue;

      const blockId =
        element.getAttribute('data-block-id') || `block-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const result = renderFunctionCall(element as HTMLPreElement, { current: false });
      if (result) {
        processedCount++;
        monitorNode(element, blockId);
      } else if (!processedElements.has(element)) {
        nonToolText.set(element, text);
      }
    }
  }

  return processedCount;
};

// XML or (lenient, possibly partial/streaming) JSON function-call text. textContent is read once by
// the caller; the regex avoids trim() copying large subtrees' text.
const hasCallPattern = (text: string, allowArray = false): boolean =>
  text.includes('<function_calls>') ||
  text.includes('<invoke') ||
  (text.includes('"type"') && (text.includes('function_call') || text.includes('parameter'))) ||
  (text.length < 50 && (allowArray ? /^\s*[{[]/ : /^\s*\{/).test(text));

/**
 * Start direct monitoring of content for function calls
 */
export const startDirectMonitoring = (): void => {
  if (!CONFIG.enableDirectMonitoring) return;

  // Start with a clean slate
  stopDirectMonitoring();

  // Process any existing function calls
  processFunctionCalls();

  // Set up stalled stream detection
  startStalledStreamDetection();

  // Define a function to observe DOM changes and process new function calls
  const handleDomChanges = debounce(() => {
    if (!isProcessing) {
      const processedCount = checkForUnprocessedFunctionCalls();
      if (processedCount > 0 && CONFIG.debug) {
        logger.debug(`Processed ${processedCount} new function blocks`);
      }
    }
  }, CONFIG.updateThrottle);

  // Create a mutation observer to watch for changes to the DOM
  functionCallObserver = new MutationObserver(mutations => {
    const targetSel = CONFIG.targetSelectors;
    const targetSelJoined = targetSel.join(',');
    const streamSel = CONFIG.streamingContainerSelectors;
    const streamSelJoined = streamSel.join(',');
    let shouldProcess = false;
    let potentialFunctionCall = false;

    for (const mutation of mutations) {
      // Per-block observers own already-monitored subtrees; the doc observer only needs
      // to detect *new* blocks. Skip mutations inside a monitored node or rendered block
      // so streaming chunks don't trigger a full-document rescan (O(n²) with chat length).
      const t: Node = mutation.target;
      const el = t.nodeType === Node.ELEMENT_NODE ? (t as Element) : t.parentElement;
      if (el && (el.closest('[data-monitored-node]') || el.closest('.function-block'))) continue;

      // Check if any added nodes might contain function calls
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.classList.contains('function-block')) continue; // our own card

            // Cheapest checks first; querySelector stops at the first match (querySelectorAll walked all).
            if (
              targetSel.some(sel => element.matches(sel)) ||
              element.querySelector(targetSelJoined) ||
              streamSel.some(sel => element.matches(sel)) ||
              element.querySelector(streamSelJoined) ||
              hasCallPattern(element.textContent || '')
            ) {
              potentialFunctionCall = true;
              shouldProcess = true;
              break;
            }
          } else if (node.nodeType === Node.TEXT_NODE && hasCallPattern(node.textContent || '')) {
            potentialFunctionCall = true;
            shouldProcess = true;
            break;
          }
        }
      } else if (mutation.type === 'characterData' && hasCallPattern(mutation.target.textContent || '', true)) {
        potentialFunctionCall = true;
        shouldProcess = true;
      }

      if (shouldProcess) break;
    }

    if (shouldProcess) {
      if (potentialFunctionCall && CONFIG.debug) {
        logger.debug('Potential function call detected, processing DOM changes');
      }
      // MutationObserver callbacks run before the next paint: rendering here (not after a
      // debounce) swaps raw call text for the card before it is ever painted. Already-rendered
      // blocks are skipped above, so this only scans until a new block gets its card.
      if (!isProcessing) checkForUnprocessedFunctionCalls();
      else handleDomChanges();
    }
  });

  // Configure the observer to watch for changes to the document
  functionCallObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true, // Also watch for text content changes
  });

  if (CONFIG.debug) logger.debug('Direct monitoring started for function calls');
};

/**
 * Stop direct monitoring of content for function calls
 */
export const stopDirectMonitoring = (): void => {
  // Disconnect the main mutation observer
  if (functionCallObserver) {
    functionCallObserver.disconnect();
    functionCallObserver = null;
  }

  // Disconnect all streaming observers
  streamingObservers.forEach(observer => observer.disconnect());
  streamingObservers.clear();

  // Clear the streaming update timer
  if (updateThrottleTimer) {
    clearTimeout(updateThrottleTimer);
    updateThrottleTimer = null;
  }

  // Stop stalled stream detection
  stopStalledStreamDetection();

  if (CONFIG.debug) logger.debug('Direct monitoring stopped for function calls');
};

/**
 * Initialize the observer for function calls
 */
export const initializeObserver = (): void => {
  if (CONFIG.enableDirectMonitoring) {
    startDirectMonitoring();
  }
};
