import { CONFIG } from '../core/config';
import { streamingLastUpdated, checkStreamingUpdates } from './streamObserver';
import { renderedFunctionBlocks, renderFunctionCall } from '../renderer/index';

// Extend Window interface to include our custom properties
declare global {
  interface Window {
    _isProcessing?: boolean;
    _stalledStreams?: Set<string>;
    _stalledStreamRetryCount?: Map<string, number>;
    _updateQueue?: Map<string, HTMLElement>;
    _processUpdateQueue?: () => void;
    preExistingIncompleteBlocks?: Set<string>;
    customRenderEvent?: boolean;
  }
}

// Tracking stalled streams
export const stalledStreams = new Set<string>(); // Set of stalled blockIds
export const stalledStreamRetryCount = new Map<string, number>(); // Track retry attempts
export const preExistingIncompleteBlocks = new Set<string>(); // Track function calls that were incomplete at page load

// Timer for stalled stream detection
export let stalledStreamCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Create an SVG element with the specified paths for stalled messages
 *
 * @param isPreExisting Whether to create a clock icon (pre-existing) or warning icon (stalled)
 * @returns SVG element
 */
const createStalledSvgIcon = (isPreExisting: boolean): SVGSVGElement => {
  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');

  if (isPreExisting) {
    // Clock icon for pre-existing incomplete blocks
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M8 15A7 7 0 108 1a7 7 0 000 14z');
    path1.setAttribute('stroke', 'currentColor');
    path1.setAttribute('stroke-opacity', '0.8');
    path1.setAttribute('stroke-width', '1.5');
    path1.setAttribute('fill', 'none');

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M8 4v4.5l3 1.5');
    path2.setAttribute('stroke', 'currentColor');
    path2.setAttribute('stroke-opacity', '0.8');
    path2.setAttribute('stroke-width', '1.5');
    path2.setAttribute('stroke-linecap', 'round');
    path2.setAttribute('stroke-linejoin', 'round');
    path2.setAttribute('fill', 'none');

    svg.appendChild(path1);
    svg.appendChild(path2);
  } else {
    // Warning icon for stalled streams
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M7.5 1.5l-5.6 8.8c-.5.8.1 1.7 1 1.7h11.2c.9 0 1.5-.9 1-1.7l-5.6-8.8c-.5-.7-1.5-.7-2 0z');
    path1.setAttribute('stroke', 'currentColor');
    path1.setAttribute('stroke-width', '1.5');
    path1.setAttribute('fill', 'none');

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M8 6v2.5');
    path2.setAttribute('stroke', 'currentColor');
    path2.setAttribute('stroke-width', '1.5');
    path2.setAttribute('stroke-linecap', 'round');
    path2.setAttribute('fill', 'none');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '0.75');
    circle.setAttribute('fill', 'currentColor');

    svg.appendChild(path1);
    svg.appendChild(path2);
    svg.appendChild(circle);
  }

  return svg;
};

/**
 * Detect pre-existing incomplete blocks at page load
 */
export const detectPreExistingIncompleteBlocks = (): void => {
  if (!document.body) return; // Guard against calling before document.body is available

  // Find all function blocks that are incomplete
  const functionBlocks = document.querySelectorAll('.function-block.function-loading');

  // Also try to find potential function call content that might not be properly marked yet
  const potentialFunctionCalls = Array.from(document.querySelectorAll('pre, code')).filter(el => {
    const content = el.textContent || '';
    return content.includes('<function_calls>') || content.includes('<invoke') || content.includes('<parameter');
  });

  // Create a set of elements to process
  const elementsToProcess = new Set([...Array.from(functionBlocks), ...potentialFunctionCalls]);

  // Mark each block as pre-existing incomplete
  for (const block of elementsToProcess) {
    const blockId =
      block.getAttribute('data-block-id') || `pre-existing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Set block ID if not already present
    if (!block.getAttribute('data-block-id')) {
      block.setAttribute('data-block-id', blockId);
    }

    preExistingIncompleteBlocks.add(blockId);

    // Add an indicator to the block if needed
    if (!block.querySelector(`.stalled-indicator[data-pre-existing="true"]`)) {
      const indicator = document.createElement('div');
      indicator.className = 'stalled-indicator';
      indicator.setAttribute('data-stalled-for', blockId);
      indicator.setAttribute('data-pre-existing', 'true');

      const message = document.createElement('div');
      message.className = 'stalled-message';

      // Create the SVG icon using DOM methods
      const svg = createStalledSvgIcon(true);

      // Create and append the message text
      const span = document.createElement('span');
      span.textContent = 'This function call was incomplete when the page loaded.';

      // Append elements
      message.appendChild(svg);
      message.appendChild(span);
      indicator.appendChild(message);
      block.appendChild(indicator);
    }

    // Try to initiate rendering for this block
    const event = new CustomEvent('render-function-call', {
      detail: { blockId, element: block },
    });
    document.dispatchEvent(event);
  }
};

/**
 * Calculate retry delay with exponential backoff
 */
const calculateRetryDelay = (retryCount: number, baseDelay: number): number => {
  if (!CONFIG.exponentialBackoff) return baseDelay;
  // Exponential backoff with a maximum delay of 30 seconds
  return Math.min(baseDelay * Math.pow(2, retryCount), 30000);
};

/**
 * Handle retry attempt for a stalled stream
 */
const handleRetryAttempt = (blockId: string, block: HTMLElement): void => {
  const retryCount = stalledStreamRetryCount.get(blockId) || 0;
  const maxRetries = CONFIG.maxRetryAttempts;
  
  if (retryCount >= maxRetries) {
    // Max retries reached, update UI to show permanent stall
    block.classList.add('function-permanently-stalled');
    const indicator = block.querySelector(`.stalled-indicator[data-stalled-for="${blockId}"]`);
    if (indicator) {
      const message = indicator.querySelector('.stalled-message span');
      if (message) {
        message.textContent = `Stream permanently stalled after ${maxRetries} retry attempts.`;
      }
      // Remove retry button
      const retryButton = indicator.querySelector('.stalled-retry-button');
      retryButton?.remove();
    }
    return;
  }

  // Increment retry count
  stalledStreamRetryCount.set(blockId, retryCount + 1);
  
  // Calculate delay with exponential backoff
  const delay = calculateRetryDelay(retryCount, CONFIG.retryDelay);
  
  // Update UI to show retry attempt
  const indicator = block.querySelector(`.stalled-indicator[data-stalled-for="${blockId}"]`);
  if (indicator) {
    const message = indicator.querySelector('.stalled-message span');
    if (message) {
      message.textContent = `Retrying... (Attempt ${retryCount + 1}/${maxRetries})`;
    }
  }

  // Attempt retry after delay
  setTimeout(() => {
    // Remove stalled status
    stalledStreams.delete(blockId);
    block.classList.remove('function-stalled');
    
    // Trigger re-render
    const functionBlock = block.closest('pre');
    if (functionBlock instanceof HTMLPreElement) {
      renderFunctionCall(functionBlock, { current: false });
    }
    
    // Force check for updates
    checkStreamingUpdates();
  }, delay);
};

/**
 * Create a stalled indicator for the specified block
 */
export const createStalledIndicator = (blockId: string, block: HTMLElement, isAbrupt: boolean = false): void => {
  // Mark as stalled
  stalledStreams.add(blockId);
  stalledStreamRetryCount.set(blockId, 0);

  // Remove the loading spinner
  block.classList.remove('function-loading');
  // Add a stalled class for styling
  block.classList.add('function-stalled');

  // Remove any existing stalled indicators to avoid duplicates
  const existingIndicator = block.querySelector(`.stalled-indicator[data-stalled-for="${blockId}"]`);
  if (existingIndicator) {
    existingIndicator.remove();
  }

  // Add visual indicator
  const indicator = document.createElement('div');
  indicator.className = 'stalled-indicator';
  indicator.setAttribute('data-stalled-for', blockId);
  // Add a specific class if the stream ended abruptly
  if (isAbrupt) {
    indicator.classList.add('abruptly-ended-indicator');
  }

  const message = document.createElement('div');
  message.className = 'stalled-message';

  // Create the message text
  const span = document.createElement('span');
  span.textContent = isAbrupt
    ? 'Stream ended abruptly. Function call may be incomplete.'
    : 'Stream appears to be stalled. Updates may be incomplete.';

  // Only add the icon if it's a stalled stream, not an abruptly ended one
  if (!isAbrupt) {
    const svg = createStalledSvgIcon(false); // False indicates warning icon
    message.appendChild(svg);
  }
  message.appendChild(span);

  // Add a retry button with enhanced retry logic
  const retryButton = document.createElement('button');
  retryButton.className = 'stalled-retry-button';
  retryButton.textContent = 'Check for updates';
  retryButton.onclick = () => {
    handleRetryAttempt(blockId, block);
  };

  indicator.appendChild(message);
  indicator.appendChild(retryButton);

  // Append the indicator to the end of the block
  block.appendChild(indicator);
};

/**
 * Check for stalled streams with improved detection
 */
export const checkStalledStreams = (): void => {
  if (!CONFIG.enableStalledStreamDetection) return;

  const now = Date.now();
  
  // Get all function blocks
  document.querySelectorAll('.function-block').forEach(block => {
    const blockId = block.getAttribute('data-block-id');
    if (!blockId) return;

    const lastUpdate = streamingLastUpdated.get(blockId) || 0;
    const timeSinceUpdate = now - lastUpdate;

    // Check if block is incomplete
    const isIncomplete = block.classList.contains('function-loading');
    
    // Check if stream is stalled
    if (isIncomplete && timeSinceUpdate > CONFIG.stalledStreamTimeout) {
      // Don't re-create indicator if already marked as stalled
      if (!stalledStreams.has(blockId)) {
        createStalledIndicator(blockId, block as HTMLElement);
      }
    }
  });
};

// We should also update the stalled timeout configuration to be more aggressive
export const updateStalledStreamTimeoutConfig = (): void => {
  // Set a more aggressive timeout to catch abruptly stopped streams faster
  if (CONFIG.stalledStreamTimeout > 3000) {
    CONFIG.stalledStreamTimeout = 3000; // 3 seconds is enough to detect abrupt stops
  }

  // Ensure check interval is frequent enough
  if (CONFIG.stalledStreamCheckInterval > 1000) {
    CONFIG.stalledStreamCheckInterval = 1000;
  }
};

/**
 * Start monitoring for stalled streams
 */
export const startStalledStreamDetection = (): void => {
  if (!CONFIG.enableStalledStreamDetection) return;

  // Update timeout configuration for better detection
  updateStalledStreamTimeoutConfig();

  // Clear any existing timer
  if (stalledStreamCheckTimer) {
    clearInterval(stalledStreamCheckTimer);
  }

  // Create a custom event for rendering function calls
  if (typeof window !== 'undefined' && !window.hasOwnProperty('customRenderEvent')) {
    window.customRenderEvent = true;

    // Event listener for render-function-call events
    document.addEventListener('render-function-call', (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.element) {
        // Attempt to render this function call directly using the imported function
        renderFunctionCall(detail.element, { current: false });
      }
    });

    // Event listener for abruptly ended streams
    document.addEventListener('stream-abruptly-ended', (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.element && detail.blockId) {
        if (CONFIG.debug) {
          console.debug('Handling abruptly ended stream', detail);
        }
        // Create a stalled indicator with the abrupt message
        createStalledIndicator(detail.blockId, detail.element, true);
      }
    });
  }

  // Add styles for the stalled state
  addStalledStreamStyles();

  // Set up detection at the configured interval
  // stalledStreamCheckTimer = setInterval(
  //     checkStalledStreams,
  //     CONFIG.stalledStreamCheckInterval
  // );

  // Detect pre-existing incomplete blocks on startup
  detectPreExistingIncompleteBlocks();
};

/**
 * Stop monitoring for stalled streams
 */
export const stopStalledStreamDetection = (): void => {
  if (stalledStreamCheckTimer) {
    clearInterval(stalledStreamCheckTimer);
    stalledStreamCheckTimer = null;
  }
};

/**
 * Add styles for stalled streams
 */
const addStalledStreamStyles = (): void => {
  // Check if styles already exist
  if (document.getElementById('stalled-stream-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'stalled-stream-styles';
  styles.textContent = `
        .function-stalled .stalled-indicator {
            background-color: rgba(255, 200, 0, 0.1);
            border-left: 3px solid #ff9800;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .function-stalled .abruptly-ended-indicator {
            /* Optional: Style abruptly ended indicators differently */
            /* background-color: rgba(255, 100, 0, 0.1); */
            /* border-left-color: #e65100; */
            border-top: 1px solid rgba(255, 152, 0, 0.3); /* Add a top border */
            border-left: none; /* Remove left border */
            margin-top: 15px; /* Add some space above */
            padding-top: 15px; /* Add padding above */
        }
        
        .function-stalled .stalled-message {
            display: flex;
            align-items: center;
            color: #e65100;
            font-size: 14px;
            margin-bottom: 8px;
        }
        
        .function-stalled .stalled-message svg {
            margin-right: 8px;
            flex-shrink: 0;
        }
        
        .function-stalled .stalled-retry-button {
            background-color: #ff9800;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        }
        
        .function-stalled .stalled-retry-button:hover {
            background-color: #f57c00;
        }
    `;
  document.head.appendChild(styles);
};
