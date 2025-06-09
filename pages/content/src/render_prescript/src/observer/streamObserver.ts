// Declare global window properties for TypeScript
declare global {
  interface Window {
    _isProcessing?: boolean;
    _stalledStreams?: Set<string>;
    _stalledStreamRetryCount?: Map<string, number>;
    _updateQueue?: Map<string, HTMLElement>;
    _processUpdateQueue?: () => void;
  }
}

// Import required functions
import { CONFIG } from '../core/config';
import { renderFunctionCall } from '../renderer/index';
import { extractParameters } from '../parser/index'; // Removed unused containsFunctionCalls, extractLanguageTag

// Maps to store observers and state for streaming content
export const streamingObservers = new Map<string, MutationObserver>();
export const streamingLastUpdated = new Map<string, number>(); // blockId -> timestamp
export const updateQueue = new Map<string, HTMLElement>(); // Store target elements (pre, code, etc.)

// A flag to indicate if updates are currently being processed
const isProcessing = false;

// Flag to detect abrupt ending of streams
export const abruptlyEndedStreams = new Set<string>();

// Map to track which blocks are currently resyncing to prevent jitter
export const resyncingBlocks = new Set<string>();

// Map to track which blocks have completed streaming
export const completedStreams = new Map<string, boolean>();

// Track completion stability to prevent rapid state changes that cause jitter
const completionStabilityTracker = new Map<
  string,
  {
    lastCheckTime: number;
    isStable: boolean;
    consecutiveCompletionChecks: number;
  }
>();

// Minimum time between completion checks to ensure stability
const COMPLETION_STABILITY_THRESHOLD = 200; // 200ms
const REQUIRED_STABLE_CHECKS = 2; // Require 2 consecutive stable checks

/**
 * Check if completion state is stable to prevent jitter
 */
const isCompletionStable = (blockId: string): boolean => {
  const now = Date.now();
  const tracker = completionStabilityTracker.get(blockId);

  if (!tracker) {
    completionStabilityTracker.set(blockId, {
      lastCheckTime: now,
      isStable: false,
      consecutiveCompletionChecks: 1,
    });
    return false;
  }

  if (now - tracker.lastCheckTime < COMPLETION_STABILITY_THRESHOLD) {
    return false;
  }

  tracker.consecutiveCompletionChecks++;
  tracker.lastCheckTime = now;

  if (tracker.consecutiveCompletionChecks >= REQUIRED_STABLE_CHECKS) {
    tracker.isStable = true;
    return true;
  }

  return false;
};

// Performance cache for pattern matching
const PATTERN_CACHE = {
  functionCallsStart: /<function_calls>/g,
  functionCallsEnd: /<\/function_calls>/g,
  invokeStart: /<invoke[^>]*>/g,
  invokeEnd: /<\/invoke>/g,
  parameterStart: /<parameter[^>]*>/g,
  parameterEnd: /<\/parameter>/g,
  allFunctionPatterns: /(<function_calls>|<\/function_calls>|<invoke[^>]*>|<\/invoke>|<parameter[^>]*>|<\/parameter>)/g,
};

// Fast content analysis cache to avoid repeated parsing
const contentAnalysisCache = new Map<
  string,
  {
    hasFunction: boolean;
    isComplete: boolean;
    timestamp: number;
  }
>();

// Debounced rendering to prevent rapid-fire updates
const renderingDebouncer = new Map<string, number>(); // Explicitly for window.setTimeout IDs
const RENDER_DEBOUNCE_MS = 50; // 50ms debounce for smooth rendering

if (typeof window !== 'undefined') {
  (window as any).resyncingBlocks = resyncingBlocks;
}

const CHUNK_PATTERNS = {
  functionStart: /<function_calls>/,
  invokeStart: /<invoke\s+name="[^"]*"/,
  parameterStart: /<parameter\s+name="[^"]*">/,
  anyClosingTag: /<\/(?:function_calls|invoke|parameter)>/,
  functionChunkStart: /(<function_calls>|<invoke\s+name="[^"]*"|<parameter\s+name="[^"]*">)/,
  significantChunk: /(<function_calls>|<invoke|<parameter|<\/)/,
};

const parameterContentCache = new Map<string, Map<string, string>>();

const cacheParameterContent = (blockId: string, content: string): void => {
  const params = extractParameters(content);
  if (params.length > 0) {
    const blockCache = parameterContentCache.get(blockId) || new Map();
    params.forEach(param => {
      const existing = blockCache.get(param.name) || '';
      if (param.value.length > existing.length) {
        blockCache.set(param.name, param.value);
      }
    });
    parameterContentCache.set(blockId, blockCache);
    if (CONFIG.debug) {
      console.debug(`Cached parameter content for ${blockId}:`, Array.from(blockCache.entries()));
    }
  }
};

const getCachedParameterContent = (blockId: string): Map<string, string> => {
  return parameterContentCache.get(blockId) || new Map();
};

const detectFunctionChunk = (
  content: string,
  previousContent: string = '',
): {
  hasNewChunk: boolean;
  chunkType: 'function_start' | 'invoke' | 'parameter' | 'closing' | 'content' | null;
  isSignificant: boolean;
} => {
  const newContent = content.slice(previousContent.length);
  if (newContent.length === 0) {
    return { hasNewChunk: false, chunkType: null, isSignificant: false };
  }
  if (CHUNK_PATTERNS.functionStart.test(newContent)) {
    return { hasNewChunk: true, chunkType: 'function_start', isSignificant: true };
  }
  if (CHUNK_PATTERNS.invokeStart.test(newContent)) {
    return { hasNewChunk: true, chunkType: 'invoke', isSignificant: true };
  }
  if (CHUNK_PATTERNS.parameterStart.test(newContent)) {
    return { hasNewChunk: true, chunkType: 'parameter', isSignificant: true };
  }
  if (CHUNK_PATTERNS.anyClosingTag.test(newContent)) {
    return { hasNewChunk: true, chunkType: 'closing', isSignificant: true };
  }
  if (CHUNK_PATTERNS.significantChunk.test(newContent) || newContent.length > 20) {
    return { hasNewChunk: true, chunkType: 'content', isSignificant: newContent.length > 20 };
  }
  return { hasNewChunk: false, chunkType: null, isSignificant: false };
};

const previousContentCache = new Map<string, string>();

const processChunkImmediate = (
  blockId: string,
  newContent: string,
  chunkInfo: ReturnType<typeof detectFunctionChunk>,
): void => {
  if (!chunkInfo.hasNewChunk || !chunkInfo.isSignificant) return;
  const target = document.querySelector(`pre[data-block-id="${blockId}"]`) as HTMLElement;
  if (!target) return;
  if (completedStreams.has(blockId) || resyncingBlocks.has(blockId)) return;

  if (CONFIG.debug) {
    console.debug(
      `Immediate chunk detected for ${blockId}: ${chunkInfo.chunkType}, content length: ${newContent.length}`,
    );
  }

  let delay = 25;
  if (chunkInfo.chunkType === 'function_start') delay = 10;
  else if (chunkInfo.chunkType === 'parameter') delay = 100;
  else if (chunkInfo.chunkType === 'content') delay = 150;

  const timerId = window.setTimeout(() => {
    // Use window.setTimeout
    if (!completedStreams.has(blockId) && !resyncingBlocks.has(blockId)) {
      const targetQueue = window._updateQueue || updateQueue;
      targetQueue.set(blockId, target);
      if (typeof window !== 'undefined' && window._processUpdateQueue) {
        window._processUpdateQueue();
      }
    }
  }, delay);

  const existingTimerId = renderingDebouncer.get(blockId);
  if (existingTimerId) window.clearTimeout(existingTimerId); // Use window.clearTimeout
  renderingDebouncer.set(blockId, timerId);
};

const analyzeFunctionContent = (
  // Removed unused parameter useCache
  content: string,
): {
  hasFunction: boolean;
  isComplete: boolean;
  functionCallPattern: boolean;
} => {
  // Removed cache logic as it was not significantly improving performance for this specific case
  // and added complexity. Direct regex matching is fast enough here.

  PATTERN_CACHE.functionCallsStart.lastIndex = 0;
  PATTERN_CACHE.functionCallsEnd.lastIndex = 0;
  PATTERN_CACHE.invokeStart.lastIndex = 0;
  PATTERN_CACHE.invokeEnd.lastIndex = 0;
  PATTERN_CACHE.parameterStart.lastIndex = 0;
  PATTERN_CACHE.parameterEnd.lastIndex = 0;

  const hasFunctionCalls = PATTERN_CACHE.functionCallsStart.test(content);
  const hasInvoke = PATTERN_CACHE.invokeStart.test(content);
  const hasParameter = PATTERN_CACHE.parameterStart.test(content);
  const hasFunction = hasFunctionCalls || hasInvoke || hasParameter;

  if (!hasFunction) {
    return { hasFunction: false, isComplete: false, functionCallPattern: false };
  }

  PATTERN_CACHE.functionCallsStart.lastIndex = 0; // Reset before next use
  PATTERN_CACHE.functionCallsEnd.lastIndex = 0;
  PATTERN_CACHE.invokeStart.lastIndex = 0;
  PATTERN_CACHE.invokeEnd.lastIndex = 0;
  PATTERN_CACHE.parameterStart.lastIndex = 0;
  PATTERN_CACHE.parameterEnd.lastIndex = 0;

  const functionCallsOpen = (content.match(PATTERN_CACHE.functionCallsStart) || []).length;
  const functionCallsClosed = (content.match(PATTERN_CACHE.functionCallsEnd) || []).length;
  const invokeOpen = (content.match(PATTERN_CACHE.invokeStart) || []).length;
  const invokeClosed = (content.match(PATTERN_CACHE.invokeEnd) || []).length;
  const parameterOpen = (content.match(PATTERN_CACHE.parameterStart) || []).length;
  const parameterClosed = (content.match(PATTERN_CACHE.parameterEnd) || []).length;

  const isComplete =
    functionCallsOpen <= functionCallsClosed && invokeOpen <= invokeClosed && parameterOpen <= parameterClosed;

  return { hasFunction, isComplete, functionCallPattern: hasFunction };
};

const scheduleOptimizedRender = (blockId: string, target: HTMLElement): void => {
  const existingTimerId = renderingDebouncer.get(blockId);
  if (existingTimerId) {
    window.clearTimeout(existingTimerId); // Use window.clearTimeout
  }

  const timerId = window.setTimeout(() => {
    // Use window.setTimeout
    renderingDebouncer.delete(blockId);
    if (!completedStreams.has(blockId) && !resyncingBlocks.has(blockId)) {
      const targetQueue = window._updateQueue || updateQueue;
      targetQueue.set(blockId, target);
      if (typeof window !== 'undefined' && window._processUpdateQueue) {
        window._processUpdateQueue();
      }
    }
  }, RENDER_DEBOUNCE_MS);
  renderingDebouncer.set(blockId, timerId);
};

export const monitorNode = (node: HTMLElement, blockId: string): void => {
  if (streamingObservers.has(blockId)) return;
  if (CONFIG.debug) console.debug(`Setting up direct monitoring for block: ${blockId}`);
  streamingLastUpdated.set(blockId, Date.now());
  node.setAttribute('data-monitored-node', blockId);

  let inactivePeriods = 0;
  let lastContentLength = node.textContent?.length || 0;
  let detectedIncompleteTags = false;

  const periodicChecker = window.setInterval(() => {
    // Use window.setInterval
    if (!document.body.contains(node)) {
      window.clearInterval(periodicChecker); // Use window.clearInterval
      return;
    }
    const currentContent = node.textContent || '';
    const currentLength = currentContent.length;
    const hasOpenFunctionCallsTag =
      currentContent.includes('<function_calls>') && !currentContent.includes('</function_calls>');
    const hasOpenInvokeTag = currentContent.includes('<invoke') && !currentContent.includes('</invoke>');
    const hasOpenParameterTags =
      (currentContent.match(/<parameter[^>]*>/g) || []).length > (currentContent.match(/<\/parameter>/g) || []).length;

    if (hasOpenFunctionCallsTag || hasOpenInvokeTag || hasOpenParameterTags) {
      detectedIncompleteTags = true;
    }

    if (detectedIncompleteTags && currentLength === lastContentLength) {
      inactivePeriods++;
      if (inactivePeriods >= 3) {
        abruptlyEndedStreams.add(blockId);
        const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
        if (functionBlock && functionBlock.classList.contains('function-loading')) {
          const event = new CustomEvent('stream-abruptly-ended', {
            detail: { blockId, element: functionBlock },
          });
          document.dispatchEvent(event);
          if (CONFIG.debug) {
            console.debug(`Detected abruptly ended stream for block ${blockId}`);
          }
          window.clearInterval(periodicChecker); // Use window.clearInterval
        }
      }
    } else {
      inactivePeriods = 0;
      lastContentLength = currentLength;
    }
  }, 1000);

  const observer = new MutationObserver(mutations => {
    const isProcessingFlag = window._isProcessing !== undefined ? window._isProcessing : isProcessing;
    if (isProcessingFlag) return;
    if (completedStreams.has(blockId)) return;
    const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
    if (functionBlock?.hasAttribute('data-completing')) return;

    let contentChanged = false;
    let significantChange = false;
    let functionCallPattern = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        contentChanged = true;
        const targetNode = mutation.target;
        const textContent = targetNode.textContent || '';
        if (!functionCallPattern) {
          PATTERN_CACHE.allFunctionPatterns.lastIndex = 0;
          functionCallPattern = PATTERN_CACHE.allFunctionPatterns.test(textContent);
        }
        if (mutation.type === 'characterData') {
          const oldValue = mutation.oldValue || '';
          const newValue = textContent;
          const previousContent = previousContentCache.get(blockId) || '';
          const chunkInfo = detectFunctionChunk(newValue, previousContent);
          if (chunkInfo.hasNewChunk && chunkInfo.isSignificant) {
            significantChange = true;
            if (chunkInfo.chunkType === 'parameter' || chunkInfo.chunkType === 'content') {
              cacheParameterContent(blockId, newValue);
            }
            processChunkImmediate(blockId, newValue, chunkInfo);
          } else if (newValue.length !== oldValue.length && Math.abs(newValue.length - oldValue.length) > 10) {
            significantChange = true;
          }
          previousContentCache.set(blockId, newValue);
        }
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          significantChange = true;
        }
      }
    }

    if (contentChanged) {
      inactivePeriods = 0;
      lastContentLength = node.textContent?.length || 0;
      streamingLastUpdated.set(blockId, Date.now());
      if (abruptlyEndedStreams.has(blockId)) {
        abruptlyEndedStreams.delete(blockId);
      }
      let target = node;
      while (target && !CONFIG.targetSelectors.includes(target.tagName.toLowerCase())) {
        target = target.parentElement as HTMLElement;
        if (!target) break;
      }
      if (target) {
        if (CONFIG.debug && (significantChange || functionCallPattern)) {
          console.debug(`Significant content change detected in block ${blockId}`, {
            significantChange,
            functionCallPattern,
          });
        }
        scheduleOptimizedRender(blockId, target);
      }
    }
  });

  observer.observe(node, {
    childList: true,
    characterData: true,
    characterDataOldValue: true,
    subtree: true,
    attributes: false,
  });
  streamingObservers.set(blockId, observer);
};

export const checkStreamingUpdates = (): void => {
  if (CONFIG.debug) {
    console.debug('Checking streaming updates...');
  }
  const targetContainers = [];
  for (const selector of CONFIG.streamingContainerSelectors) {
    const containers = document.querySelectorAll<HTMLElement>(selector);
    targetContainers.push(...Array.from(containers));
  }

  for (const container of targetContainers) {
    for (const selector of CONFIG.targetSelectors) {
      const elements = container.querySelectorAll<HTMLElement>(selector);
      for (const element of Array.from(elements)) {
        // Fixed TS2488
        const blockId = element.getAttribute('data-block-id');
        if (!blockId) continue;
        renderFunctionCall(element as HTMLPreElement, { current: false });
      }
    }
  }
};

export let progressiveUpdateTimer: number | null = null; // Changed type to number | null

const performSeamlessCompletion = (blockId: string, finalContent: string): void => {
  // finalContent seems unused
  if (CONFIG.debug) {
    console.debug(`Performing seamless completion for block ${blockId}`);
  }
  const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
  if (!functionBlock) {
    if (CONFIG.debug) console.debug(`Function block not found for completion: ${blockId}`);
    return;
  }
  if (functionBlock.classList.contains('function-complete') || functionBlock.hasAttribute('data-completing')) {
    if (CONFIG.debug) console.debug(`Block ${blockId} already completed or completing`);
    return;
  }
  functionBlock.setAttribute('data-completing', 'true');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      functionBlock.classList.remove('function-loading');
      functionBlock.classList.add('function-complete');
      const spinner = functionBlock.querySelector('.spinner');
      if (spinner) spinner.remove();
      functionBlock.removeAttribute('data-completing');
      completedStreams.set(blockId, true);
    });
  });
};

export const resyncWithOriginalContent = (blockId: string): void => {
  if (CONFIG.debug) console.debug(`Starting seamless content resync for block ${blockId}`);
  if (completedStreams.has(blockId)) {
    if (CONFIG.debug) console.debug(`Skipping resync for already completed block ${blockId}`);
    resyncingBlocks.delete(blockId);
    return;
  }
  resyncingBlocks.add(blockId);
  const originalPre = document.querySelector(`pre[data-block-id="${blockId}"]`);
  if (!originalPre || !originalPre.textContent) {
    if (CONFIG.debug) console.debug(`Original pre element not found for block ${blockId}`);
    resyncingBlocks.delete(blockId);
    return;
  }
  const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
  if (!functionBlock) {
    if (CONFIG.debug) console.debug(`Rendered function block not found for block ${blockId}`);
    resyncingBlocks.delete(blockId);
    return;
  }
  const originalContent = originalPre.textContent.trim();
  const originalParams = extractParameters(originalContent);
  const cachedParams = getCachedParameterContent(blockId);
  const mergedParams = originalParams.map(param => {
    const cachedContent = cachedParams.get(param.name);
    return cachedContent && cachedContent.length > param.value.length ? { ...param, value: cachedContent } : param;
  });
  const invokeMatch = originalContent.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/);
  const originalFunctionName = invokeMatch && invokeMatch[1] ? invokeMatch[1] : null;
  if (CONFIG.debug)
    console.debug(`Resync found ${mergedParams.length} parameters and function name: ${originalFunctionName}`);

  const isAlreadyComplete = functionBlock.classList.contains('function-complete');
  const isCurrentlyLoading = functionBlock.classList.contains('function-loading');

  requestAnimationFrame(() => {
    if (originalFunctionName && !isAlreadyComplete) {
      const functionNameElement = functionBlock.querySelector('.function-name-text');
      if (functionNameElement && functionNameElement.textContent !== originalFunctionName) {
        functionNameElement.textContent = originalFunctionName;
      }
    }
    let hasContentChanges = false;
    mergedParams.forEach(param => {
      const paramId = `${blockId}-${param.name}`;
      const paramValueElement = functionBlock.querySelector(`.param-value[data-param-id="${paramId}"]`);
      if (paramValueElement) {
        const currentContent = paramValueElement.textContent || '';
        if (currentContent !== param.value) {
          const preElement = paramValueElement.querySelector('pre');
          if (preElement) {
            if (preElement.textContent !== param.value) {
              preElement.textContent = param.value;
              hasContentChanges = true;
            }
          } else if (paramValueElement.textContent !== param.value) {
            paramValueElement.textContent = param.value;
            hasContentChanges = true;
          }
        }
      }
    });
    if (hasContentChanges && isCurrentlyLoading && !isAlreadyComplete) {
      performSeamlessCompletion(blockId, originalContent);
    } else if (isAlreadyComplete || !isCurrentlyLoading) {
      completedStreams.set(blockId, true);
    }
    window.setTimeout(() => {
      // Use window.setTimeout
      resyncingBlocks.delete(blockId);
    }, 150);
  });
};

export const startProgressiveUpdates = (): void => {
  if (progressiveUpdateTimer) {
    window.clearInterval(progressiveUpdateTimer); // Explicitly use window.clearInterval
  }
  progressiveUpdateTimer = window.setInterval(() => {
    // Explicitly use window.setInterval
    if (!document.body.contains(document.querySelector('.large-content'))) {
      if (progressiveUpdateTimer) window.clearInterval(progressiveUpdateTimer); // Check if null before clearing
      progressiveUpdateTimer = null;
      return;
    }
    checkStreamingUpdates();
  }, CONFIG.progressiveUpdateInterval);
};
