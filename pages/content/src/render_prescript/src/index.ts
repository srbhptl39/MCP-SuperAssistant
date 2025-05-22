import type { FunctionCallRendererConfig } from './core/config';
import { CONFIG } from './core/config';
import { styles } from './renderer/styles';
import {
  processFunctionCalls,
  checkForUnprocessedFunctionCalls,
  startDirectMonitoring,
  stopDirectMonitoring,
  initializeObserver,
  processFunctionResults,
  checkForUnprocessedFunctionResults,
  startFunctionResultMonitoring,
  stopFunctionResultMonitoring,
  initializeFunctionResultObserver,
  processUpdateQueue,
  checkStreamingUpdates,
  checkStalledStreams,
  detectPreExistingIncompleteBlocks,
  startStalledStreamDetection,
  updateStalledStreamTimeoutConfig,
} from './observer/index';
import { renderFunctionCall, renderedFunctionBlocks } from './renderer/index';
// Import the website-specific components
// import { initPerplexityComponents } from './websites_components/perplexity';
// import { initGrokComponents } from './websites_components/grok';

// Ensure styles are injected only once
let stylesInjected = false;
const injectStyles = () => {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return; // Guard against non-browser env
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
  stylesInjected = true;
};

// Initialize the stalled stream detection config early for faster detection
updateStalledStreamTimeoutConfig();

// Main initialization function
const initializeRenderer = () => {
  // Guard against running in non-browser environments
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn('Function Call Renderer: Not running in a browser environment.');
    return;
  }

  injectStyles();
  processFunctionCalls(); // Initial processing of existing blocks
  
  // Process function results if selectors are configured
  if (CONFIG.function_result_selector && CONFIG.function_result_selector.length > 0) {
    processFunctionResults(); // Initial processing of existing function results
  }

  // Register the global event listener for function call rendering before starting the observer
  // document.addEventListener('render-function-call', (event: Event) => {
  //     const customEvent = event as CustomEvent;
  //     if (customEvent.detail && customEvent.detail.element) {
  //         if (CONFIG.debug) {
  //             console.debug('Custom render event triggered', customEvent.detail);
  //         }

  //         // Attempt to render this function call
  //         renderFunctionCall(customEvent.detail.element, { current: false });
  //     }
  // });

  // Initialize the mutation observer
  initializeObserver(); // Start the main MutationObserver
  startDirectMonitoring(); // Start direct monitoring if enabled
  
  // Initialize the function result observer if selectors are configured
  if (CONFIG.function_result_selector && CONFIG.function_result_selector.length > 0) {
    initializeFunctionResultObserver(); // Start the function result observer
  }

  // Make sure stalled stream detection is explicitly started
  startStalledStreamDetection();

  // // Initialize website-specific components
  // // Check if we're on Perplexity website
  // if (window.location.href.includes('perplexity.ai')) {
  //     console.debug("Initializing Perplexity-specific components");
  //     initPerplexityComponents();
  // }
  // // Check if we're on Grok website
  // else if (window.location.href.includes('grok.x.ai') || window.location.href.includes('grok.ai')) {
  //     console.debug("Initializing Grok-specific components");
  //     initGrokComponents();
  // }

  console.debug('Function call renderer initialized with improved parameter extraction and streaming support.');
};

// Configuration function
const configure = (options: Partial<FunctionCallRendererConfig>) => {
  let monitoringRestart = false;

  // Override specific options if provided, respecting the original script's logic
  const userOptions = { ...options }; // Clone to avoid modifying the input

  // Force specific settings from the original script (if desired)
  CONFIG.usePositionFixed = false;
  CONFIG.largeContentThreshold = Number.MAX_SAFE_INTEGER;
  CONFIG.maxContentPreviewLength = Number.MAX_SAFE_INTEGER;

  // Apply user overrides selectively
  if (userOptions.knownLanguages !== undefined) CONFIG.knownLanguages = [...userOptions.knownLanguages];
  if (userOptions.handleLanguageTags !== undefined) CONFIG.handleLanguageTags = !!userOptions.handleLanguageTags;
  if (userOptions.maxLinesAfterLangTag !== undefined) CONFIG.maxLinesAfterLangTag = userOptions.maxLinesAfterLangTag;
  if (userOptions.updateThrottle !== undefined) {
    CONFIG.updateThrottle = userOptions.updateThrottle;
    monitoringRestart = true;
  }
  if (userOptions.enableDirectMonitoring !== undefined) {
    CONFIG.enableDirectMonitoring = !!userOptions.enableDirectMonitoring;
    monitoringRestart = true;
  }
  if (userOptions.streamingContainerSelectors !== undefined)
    CONFIG.streamingContainerSelectors = [...userOptions.streamingContainerSelectors];
  if (userOptions.function_result_selector !== undefined) {
    const oldLength = CONFIG.function_result_selector?.length || 0;
    CONFIG.function_result_selector = [...userOptions.function_result_selector];
    
    // If function_result_selector was empty before and now has items, or vice versa,
    // we need to restart monitoring
    if ((oldLength === 0 && CONFIG.function_result_selector.length > 0) ||
        (oldLength > 0 && CONFIG.function_result_selector.length === 0)) {
      monitoringRestart = true;
    }
  }
  if (userOptions.streamingMonitoringInterval !== undefined) {
    CONFIG.streamingMonitoringInterval = userOptions.streamingMonitoringInterval;
    monitoringRestart = true;
  }
  // Allow user to override forced settings if they provide them
  if (userOptions.largeContentThreshold !== undefined) CONFIG.largeContentThreshold = userOptions.largeContentThreshold;
  if (userOptions.maxContentPreviewLength !== undefined)
    CONFIG.maxContentPreviewLength = userOptions.maxContentPreviewLength;
  if (userOptions.usePositionFixed !== undefined) CONFIG.usePositionFixed = !!userOptions.usePositionFixed;
  // ----
  if (userOptions.progressiveUpdateInterval !== undefined) {
    CONFIG.progressiveUpdateInterval = userOptions.progressiveUpdateInterval;
    monitoringRestart = true;
  }
  if (userOptions.stabilizeTimeout !== undefined) CONFIG.stabilizeTimeout = userOptions.stabilizeTimeout;
  if (userOptions.debug !== undefined) CONFIG.debug = !!userOptions.debug;

  // New stalled stream detection configuration
  if (userOptions.enableStalledStreamDetection !== undefined) {
    CONFIG.enableStalledStreamDetection = !!userOptions.enableStalledStreamDetection;
    monitoringRestart = true;
  }
  if (userOptions.stalledStreamTimeout !== undefined) {
    CONFIG.stalledStreamTimeout = userOptions.stalledStreamTimeout;
  }
  if (userOptions.stalledStreamCheckInterval !== undefined) {
    CONFIG.stalledStreamCheckInterval = userOptions.stalledStreamCheckInterval;
    monitoringRestart = true;
  }

  if (monitoringRestart) {
    // Restart function call monitoring
    stopDirectMonitoring();
    if (CONFIG.enableDirectMonitoring) {
      startDirectMonitoring();
    }
    
    // Restart function result monitoring if selectors are configured
    stopFunctionResultMonitoring();
    if (CONFIG.function_result_selector && CONFIG.function_result_selector.length > 0) {
      startFunctionResultMonitoring();
    }
  }

  console.debug('Function call renderer configuration updated:', CONFIG);

  // Re-process immediately after config change might be needed
  processFunctionCalls();
};

// Expose functions to the window object for global access
// if (typeof window !== 'undefined') {
//     (window as any).configureFunctionCallRenderer = configure;
//     (window as any).startFunctionCallMonitoring = startDirectMonitoring;
//     (window as any).stopFunctionCallMonitoring = stopDirectMonitoring;
//     (window as any).checkForFunctionCalls = checkForUnprocessedFunctionCalls;
//     (window as any).forceStreamingUpdate = checkStreamingUpdates;
//     (window as any).renderFunctionCalls = processFunctionCalls;
//     (window as any).checkStalledStreams = checkStalledStreams;
//     (window as any).detectPreExistingIncompleteBlocks = detectPreExistingIncompleteBlocks;

//     // Initialize automatically when the script loads in a browser
//     // Use DOMContentLoaded to ensure the body exists for the observer
//     if (document.readyState === 'loading') {
//         document.addEventListener('DOMContentLoaded', initializeRenderer);
//     } else {
//         // DOMContentLoaded has already fired
//         initializeRenderer();
//     }
// }

// --- Exports for potential module usage ---
export {
  CONFIG,
  styles,
  processFunctionCalls,
  checkForUnprocessedFunctionCalls,
  processFunctionResults,
  checkForUnprocessedFunctionResults,
  startDirectMonitoring,
  stopDirectMonitoring,
  startFunctionResultMonitoring,
  stopFunctionResultMonitoring,
  configure as configureFunctionCallRenderer,
  initializeRenderer as initialize,
  processUpdateQueue as forceStreamingUpdate,
  checkStalledStreams,
  detectPreExistingIncompleteBlocks,
};

export type { FunctionCallRendererConfig };
