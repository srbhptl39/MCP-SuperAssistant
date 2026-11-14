// Declare global window properties for TypeScript
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('streamingObservers');

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
import { extractParameters, containsFunctionCalls, extractLanguageTag } from '../parser/index';
import { scheduleWork } from '../utils/index';
import { extractJSONParameters } from '../parser/jsonFunctionParser';

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

  // Check if enough time has passed since last check
  if (now - tracker.lastCheckTime < COMPLETION_STABILITY_THRESHOLD) {
    return false; // Too soon, not stable
  }

  // Increment consecutive checks
  tracker.consecutiveCompletionChecks++;
  tracker.lastCheckTime = now;

  // Consider stable after required number of checks
  if (tracker.consecutiveCompletionChecks >= REQUIRED_STABLE_CHECKS) {
    tracker.isStable = true;
    return true;
  }

  return false;
};

// Performance cache for pattern matching
const PATTERN_CACHE = {
  allFunctionPatterns: /(<function_calls>|<\/function_calls>|<invoke[^>]*>|<\/invoke>|<parameter[^>]*>|<\/parameter>)/g,
};

// Debounced rendering to prevent rapid-fire updates
const renderingDebouncer = new Map<string, ReturnType<typeof setTimeout>>();
const RENDER_DEBOUNCE_MS = 50; // 50ms debounce for smooth rendering

// Make resyncingBlocks globally accessible to prevent re-rendering during resync
if (typeof window !== 'undefined') {
  (window as any).resyncingBlocks = resyncingBlocks;
}

// Track parameter content during streaming to prevent loss
const parameterContentCache = new Map<string, Map<string, string>>(); // blockId -> paramName -> content

/**
 * Store parameter content to prevent loss during streaming (supports both XML and JSON)
 */
const cacheParameterContent = (blockId: string, content: string): void => {
  // Detect format
  const isJSON =
    content.includes('"type"') && (content.includes('function_call_start') || content.includes('parameter'));

  let params;
  if (isJSON) {
    // Extract JSON parameters
    const jsonParams = extractJSONParameters(content);

    // Convert to array format
    params = Object.entries(jsonParams).map(([name, value]) => ({
      name,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }));
  } else {
    // Extract XML parameters
    params = extractParameters(content);
  }

  if (params.length > 0) {
    const blockCache = parameterContentCache.get(blockId) || new Map();

    params.forEach(param => {
      // Only update if new content is longer (more complete)
      const existing = blockCache.get(param.name) || '';
      if (param.value.length > existing.length) {
        blockCache.set(param.name, param.value);
      }
    });

    parameterContentCache.set(blockId, blockCache);

    if (CONFIG.debug) {
      logger.debug(
        `Cached ${isJSON ? 'JSON' : 'XML'} parameter content for ${blockId}:`,
        Array.from(blockCache.entries()),
      );
    }
  }
};

/**
 * Get cached parameter content to prevent loss
 */
const getCachedParameterContent = (blockId: string): Map<string, string> => {
  return parameterContentCache.get(blockId) || new Map();
};

/**
 * Optimized debounced rendering to prevent excessive updates
 */
const scheduleOptimizedRender = (blockId: string, target: HTMLElement): void => {
  // Clear any existing debounce timer
  const existingTimer = renderingDebouncer.get(blockId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule new render with debouncing
  const timer = setTimeout(() => {
    renderingDebouncer.delete(blockId);

    // Only render if not completed or resyncing
    if (!completedStreams.has(blockId) && !resyncingBlocks.has(blockId)) {
      // Cache latest parameter content once per debounce window (consumed by resyncWithOriginalContent)
      cacheParameterContent(blockId, target.textContent || '');

      // Update the queue for rendering
      const targetQueue = window._updateQueue || updateQueue;
      targetQueue.set(blockId, target);

      // Process updates using the global function if available
      if (typeof window !== 'undefined' && window._processUpdateQueue) {
        window._processUpdateQueue();
      }
    }
  }, RENDER_DEBOUNCE_MS);

  renderingDebouncer.set(blockId, timer);
};

/**
 * Monitors a node for changes to detect streaming content updates
 *
 * @param node The HTML element to monitor
 * @param blockId ID of the function block
 */
export const monitorNode = (node: HTMLElement, blockId: string): void => {
  if (streamingObservers.has(blockId)) return;

  const content = node.textContent?.substring(0, 100) || '';
  const isJSON = content.includes('"type"');

  if (CONFIG.debug) {
    logger.debug(
      `Setting up monitoring for block: ${blockId}, element: ${node.tagName}, format: ${isJSON ? 'JSON' : 'XML'}`,
    );
    logger.debug(`Content preview:`, content);
  }

  // Initialize the last updated timestamp
  streamingLastUpdated.set(blockId, Date.now());

  // Set an attribute on the node for easier identification
  node.setAttribute('data-monitored-node', blockId);

  // Track consecutive inactive periods (no content changes)
  let inactivePeriods = 0;
  let lastContentLength = node.textContent?.length || 0;
  let detectedIncompleteTags = false;

  // Setup a periodic checker for this node that can detect abrupt endings
  const periodicChecker = setInterval(() => {
    // Stop checking completed blocks so intervals don't accumulate in long chats
    if (completedStreams.has(blockId)) {
      clearInterval(periodicChecker);
      return;
    }

    // If node is no longer in the DOM, clean up
    if (!document.body.contains(node)) {
      clearInterval(periodicChecker);
      return;
    }

    const currentContent = node.textContent || '';
    const currentLength = currentContent.length;

    // Check if content has incomplete tags (XML or JSON)
    const hasOpenFunctionCallsTag =
      currentContent.includes('<function_calls>') && !currentContent.includes('</function_calls>');
    const hasOpenInvokeTag = currentContent.includes('<invoke') && !currentContent.includes('</invoke>');
    const hasOpenParameterTags =
      (currentContent.match(/<parameter[^>]*>/g) || []).length > (currentContent.match(/<\/parameter>/g) || []).length;

    // Check for incomplete JSON — count starts vs ends so a stalled SECOND call is
    // still detected once the first call's function_call_end already exists.
    const jsonStarts = (currentContent.match(/function_call_start/g) || []).length;
    const jsonEnds = (currentContent.match(/function_call_end/g) || []).length;
    const hasIncompleteJSON = jsonStarts > jsonEnds;

    // Detect incomplete tags (XML or JSON)
    if (hasOpenFunctionCallsTag || hasOpenInvokeTag || hasOpenParameterTags || hasIncompleteJSON) {
      detectedIncompleteTags = true;
    }

    // If we previously detected incomplete tags, but content hasn't changed in 3 checks,
    // this might be an abruptly ended stream
    if (detectedIncompleteTags && currentLength === lastContentLength) {
      inactivePeriods++;

      if (inactivePeriods >= 3) {
        // This stream has likely ended abruptly
        abruptlyEndedStreams.add(blockId);

        // Signal this as stalled right away instead of waiting for timeout
        const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
        if (functionBlock && functionBlock.classList.contains('function-loading')) {
          // Use our custom event to trigger stalled stream handling
          const event = new CustomEvent('stream-abruptly-ended', {
            detail: { blockId, element: functionBlock },
          });
          document.dispatchEvent(event);

          if (CONFIG.debug) {
            logger.debug(`Detected abruptly ended stream for block ${blockId}`);
          }

          // We can clear this interval now
          clearInterval(periodicChecker);
        }
      }
    } else {
      // Reset if content changed
      inactivePeriods = 0;
      lastContentLength = currentLength;
    }
  }, 1000); // Check every second

  const observer = new MutationObserver(mutations => {
    const isProcessingFlag = window._isProcessing !== undefined ? window._isProcessing : isProcessing;
    if (isProcessingFlag) return;

    // Skip if this block is already complete to prevent thrashing
    if (completedStreams.has(blockId)) return;

    // Skip if block is currently transitioning to prevent conflicts
    const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
    if (functionBlock?.hasAttribute('data-completing')) return;

    if (CONFIG.debug) {
      logger.debug(`Mutation detected for blockId: ${blockId}, mutations: ${mutations.length}`);
    }

    let contentChanged = false;
    let significantChange = false;
    let functionCallPattern = false;

    // Batch analyze all mutations for better performance
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        contentChanged = true;

        // Get the content once for analysis
        const targetNode = mutation.target;
        const textContent = targetNode.textContent || '';

        // Use fast pattern matching for both XML and JSON
        if (!functionCallPattern) {
          PATTERN_CACHE.allFunctionPatterns.lastIndex = 0;
          const hasXMLPattern = PATTERN_CACHE.allFunctionPatterns.test(textContent);
          const hasJSONPattern =
            textContent.includes('"type"') &&
            (textContent.includes('function_call') || textContent.includes('parameter'));
          functionCallPattern = hasXMLPattern || hasJSONPattern;
        }

        // Check for significant size changes in content
        if (mutation.type === 'characterData') {
          const newValue = textContent;
          significantChange = newValue.length !== (mutation.oldValue || '').length;
        }

        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          significantChange = true;
        }
      }
    }

    if (contentChanged) {
      // Reset the inactive periods counter since we've seen new content
      inactivePeriods = 0;
      lastContentLength = node.textContent?.length || 0;

      // Update the last updated timestamp when content changes
      streamingLastUpdated.set(blockId, Date.now());

      // Remove from abruptly ended if it was previously marked
      if (abruptlyEndedStreams.has(blockId)) {
        abruptlyEndedStreams.delete(blockId);
      }

      // Find the nearest element that contains our monitored node
      let target = node;
      while (target && !CONFIG.targetSelectors.some(selector => target.matches(selector))) {
        target = target.parentElement as HTMLElement;
        if (!target) break;
      }

      if (target) {
        // Log significant changes if debugging is enabled
        if (CONFIG.debug && (significantChange || functionCallPattern)) {
          logger.debug(`Significant content change detected in block ${blockId}`, {
            significantChange,
            functionCallPattern,
          });
        }

        // Use optimized scheduling for better performance
        scheduleOptimizedRender(blockId, target);
      }
    }
  });

  // Configure the observer to watch the node and its descendants with optimized options
  observer.observe(node, {
    childList: true,
    characterData: true,
    characterDataOldValue: true, // Track old values for better change detection
    subtree: true,
    // Optimize by focusing only on critical attributes that indicate streaming state
    attributes: false, // Disable general attribute watching for performance
    // Only watch specific attributes if needed
    // attributeFilter: ['class', 'data-status'],
  });

  // Store the observer for later cleanup
  streamingObservers.set(blockId, observer);
};

/**
 * Check for streaming updates in all active blocks
 */
export const checkStreamingUpdates = (): void => {
  if (CONFIG.debug) {
    logger.debug('Checking streaming updates...');
  }
  const targetContainers = [];
  for (const selector of CONFIG.streamingContainerSelectors) {
    const containers = document.querySelectorAll<HTMLElement>(selector);
    targetContainers.push(...Array.from(containers));
  }

  // Find all elements in these containers
  for (const container of targetContainers) {
    for (const selector of CONFIG.targetSelectors) {
      const elements = container.querySelectorAll<HTMLElement>(selector);
      for (const element of elements) {
        const blockId = element.getAttribute('data-block-id');
        if (!blockId) continue;

        renderFunctionCall(element as HTMLPreElement, { current: false });
      }
    }
  }
};

/**
 * Start progressive updates for large streaming content
 */
export let progressiveUpdateTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Perform seamless completion transition without DOM disruption
 *
 * @param blockId ID of the function block to complete
 * @param finalContent Final content of the stream
 */
const performSeamlessCompletion = (blockId: string, finalContent: string): void => {
  if (CONFIG.debug) {
    logger.debug(`Performing seamless completion for block ${blockId}`);
  }

  // Find the function block
  const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
  if (!functionBlock) {
    if (CONFIG.debug) {
      logger.debug(`Function block not found for completion: ${blockId}`);
    }
    return;
  }

  // Skip if already completed or currently transitioning
  if (functionBlock.classList.contains('function-complete') || functionBlock.hasAttribute('data-completing')) {
    if (CONFIG.debug) {
      logger.debug(`Block ${blockId} already completed or completing`);
    }
    return;
  }

  // Mark as transitioning to prevent duplicate completion attempts
  functionBlock.setAttribute('data-completing', 'true');

  // Schedule the completion transition (must run even when the tab is hidden)
  scheduleWork(() => {
    scheduleWork(() => {
      // Remove loading state and add complete state
      functionBlock.classList.remove('function-loading');
      functionBlock.classList.add('function-complete');

      // Remove spinner if present
      const spinner = functionBlock.querySelector('.spinner');
      if (spinner) {
        spinner.remove();
      }

      // Remove data-completing attribute
      functionBlock.removeAttribute('data-completing');

      // Mark as completed
      completedStreams.set(blockId, true);
    });
  });
};

/**
 * Re-sync the rendered function block with the original pre block content
 * This is a truly seamless update that never removes or replaces DOM elements
 *
 * @param blockId ID of the function block to re-sync
 */
export const resyncWithOriginalContent = (blockId: string): void => {
  if (CONFIG.debug) {
    logger.debug(`Starting seamless content resync for block ${blockId}`);
  }

  // Skip if already completed to prevent jitter
  if (completedStreams.has(blockId)) {
    if (CONFIG.debug) {
      logger.debug(`Skipping resync for already completed block ${blockId}`);
    }
    resyncingBlocks.delete(blockId);
    return;
  }

  // Mark as resyncing to prevent conflicting updates
  resyncingBlocks.add(blockId);

  // Find the original pre element
  const originalPre = document.querySelector(`div[data-block-id="${blockId}"]`);
  if (!originalPre || !originalPre.textContent) {
    if (CONFIG.debug) {
      logger.debug(`Original pre element not found for block ${blockId}`);
    }
    resyncingBlocks.delete(blockId);
    return;
  }

  // Find the rendered function block
  const functionBlock = document.querySelector(`.function-block[data-block-id="${blockId}"]`);
  if (!functionBlock) {
    if (CONFIG.debug) {
      logger.debug(`Rendered function block not found for block ${blockId}`);
    }
    resyncingBlocks.delete(blockId);
    return;
  }

  // Extract final parameters from the original content
  const originalContent = originalPre.textContent.trim();
  const originalParams = extractParameters(originalContent);

  // Get cached parameter content to ensure we don't lose any streaming content
  const cachedParams = getCachedParameterContent(blockId);

  // Merge original parameters with cached content (cached takes priority if longer)
  const mergedParams = originalParams.map(param => {
    const cachedContent = cachedParams.get(param.name);
    if (cachedContent && cachedContent.length > param.value.length) {
      return { ...param, value: cachedContent };
    }
    return param;
  });

  // Extract function name directly
  const invokeMatch = originalContent.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/);
  const originalFunctionName = invokeMatch && invokeMatch[1] ? invokeMatch[1] : null;

  if (CONFIG.debug) {
    logger.debug(`Resync found ${mergedParams.length} parameters and function name: ${originalFunctionName}`);
  }

  // **CRITICAL**: Only update content seamlessly within existing elements
  // NEVER disconnect observers or modify DOM structure
  // Use minimal, gradual updates to prevent jitter

  // Check if the function block is already stable before making changes
  const isAlreadyComplete = functionBlock.classList.contains('function-complete');
  const isCurrentlyLoading = functionBlock.classList.contains('function-loading');

  // Batch all updates; schedule so it still runs when the tab is hidden
  scheduleWork(() => {
    // Only update function name if it's actually different and won't cause jitter
    if (originalFunctionName && !isAlreadyComplete) {
      const functionNameElement = functionBlock.querySelector('.function-name-text');
      if (functionNameElement && functionNameElement.textContent !== originalFunctionName) {
        functionNameElement.textContent = originalFunctionName;
      }
    }

    // Update parameter content with minimal disruption
    let hasContentChanges = false;
    mergedParams.forEach(param => {
      const paramId = `${blockId}-${param.name}`;
      const paramValueElement = functionBlock.querySelector(`.param-value[data-param-id="${paramId}"]`);

      if (paramValueElement) {
        const currentContent = paramValueElement.textContent || '';
        if (currentContent !== param.value) {
          // Find or create pre element for seamless update
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

    // Only transition to complete state if there were actual content changes and we're not already complete
    if (hasContentChanges && isCurrentlyLoading && !isAlreadyComplete) {
      // Use the seamless completion function
      performSeamlessCompletion(blockId, originalContent);
    } else if (isAlreadyComplete || !isCurrentlyLoading) {
      // Already in a stable state, just clean up
      completedStreams.set(blockId, true);
    }

    // Always clean up the resync state quickly
    setTimeout(() => {
      resyncingBlocks.delete(blockId);
    }, 150);
  });
};

/**
 * Start progressive updates for large streaming content
 */
export const startProgressiveUpdates = (): void => {
  if (progressiveUpdateTimer) {
    clearInterval(progressiveUpdateTimer);
  }

  progressiveUpdateTimer = setInterval(() => {
    if (!document.body.contains(document.querySelector('.large-content'))) {
      // No more large content visible, stop the timer
      clearInterval(progressiveUpdateTimer!);
      progressiveUpdateTimer = null;
      return;
    }

    checkStreamingUpdates();
  }, CONFIG.progressiveUpdateInterval);
};
