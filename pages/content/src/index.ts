/**
 * Content Script
 *
 * This is the entry point for the content script that runs on web pages.
 * Tailwind CSS is imported for future styling needs.
 */

import './tailwind-input.css';
// import { sendAnalyticsEvent, trackError } from '../../../../chrome-extension/utils/analytics'; // Removed direct import
import { logMessage } from '@src/utils/helpers';
import { mcpHandler } from '@src/utils/mcpHandler';

// Import the render script functions
import {
  initialize as initializeRenderer,
  startDirectMonitoring,
  stopDirectMonitoring,
  processFunctionCalls as renderFunctionCalls, // Expose a function to trigger rendering
  checkForUnprocessedFunctionCalls, // Allow checking for missed calls
  configureFunctionCallRenderer, // Allow configuration from sidebar/background
} from '@src/render_prescript/src/index';

// Import the adapter registry
import { adapterRegistry, getCurrentAdapter } from '@src/adapters/adapterRegistry';

// Import and register all site adapters
import './adapters';

// Add this as a global recovery mechanism for the sidebar
function setupSidebarRecovery(): void {
  // Watch for the case where push mode is enabled but sidebar isn't visible
  const recoveryInterval = setInterval(() => {
    try {
      // Check if there's an active sidebar manager
      const sidebarManager = (window as any).activeSidebarManager;
      if (!sidebarManager) return;

      // Get HTML element to check for push-mode-enabled class
      const htmlElement = document.documentElement;

      // Check if push mode is enabled but host is invisible or missing
      if (htmlElement.classList.contains('push-mode-enabled')) {
        const shadowHost = sidebarManager.getShadowHost();

        // If shadow host exists but is not visible, force it
        if (shadowHost) {
          if (
            shadowHost.style.display !== 'block' ||
            window.getComputedStyle(shadowHost).display === 'none' ||
            shadowHost.style.opacity !== '1' ||
            parseFloat(window.getComputedStyle(shadowHost).opacity) < 0.9
          ) {
            logMessage('[SidebarRecovery] Detected invisible sidebar with push mode enabled, forcing visibility');
            shadowHost.style.display = 'block';
            shadowHost.style.opacity = '1';
            shadowHost.classList.add('initialized');

            // OPTIMIZATION: Don't force a re-render unless absolutely necessary
            // The sidebar content should automatically update through React state management
            logMessage(
              '[SidebarRecovery] Sidebar visibility restored - skipping re-render to avoid performance issues',
            );
            // sidebarManager.refreshContent();
          }
        } else {
          // If shadow host doesn't exist but push mode is enabled,
          // try to re-initialize the sidebar
          logMessage('[SidebarRecovery] Push mode enabled but shadow host missing, re-initializing sidebar');
          sidebarManager.initialize().then(() => {
            sidebarManager.show();
          });
        }
      }
    } catch (error) {
      console.error('[SidebarRecovery] Error:', error);
    }
  }, 1000); // Check every second

  // Clean up when navigating away
  window.addEventListener('unload', () => {
    clearInterval(recoveryInterval);
  });

  logMessage('[SidebarRecovery] Sidebar recovery mechanism set up');
}

// Track which adapters have been initialized to prevent redundant initialization
const initializedAdapters = new Set<string>();

/**
 * Content Script Entry Point
 */
logMessage('Content script loaded');

// Initialize URL change tracking for demographic analytics
// We'll use a polling approach to detect URL changes and send analytics via message passing
let lastUrl = window.location.href;
const demographicData = collectDemographicData();

// Track initial page view with demographic data
try {
  chrome.runtime.sendMessage({
    command: 'trackAnalyticsEvent',
    eventName: 'page_view',
    eventParams: {
      page_title: document.title,
      page_location: document.location.href,
      ...demographicData,
    },
  });
  logMessage('[Analytics] Initial page view tracked with demographic data');
} catch (error) {
  console.error(
    '[ContentScript] Error sending page view analytics:',
    error instanceof Error ? error.message : String(error),
  );
}

// Set up URL change detection
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    logMessage(`[Analytics] URL changed from ${lastUrl} to ${currentUrl}`);

    // Send URL change event with demographic data
    try {
      chrome.runtime.sendMessage({
        command: 'trackAnalyticsEvent',
        eventName: 'url_change',
        eventParams: {
          page_title: document.title,
          page_location: currentUrl,
          previous_page: lastUrl,
          ...demographicData,
        },
      });
      lastUrl = currentUrl;
    } catch (error) {
      console.error(
        '[ContentScript] Error sending URL change analytics:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}, 1000); // Check every second

// Ask background script to track the event
try {
  chrome.runtime.sendMessage({
    command: 'trackAnalyticsEvent',
    eventName: 'content_script_loaded',
    eventParams: {
      hostname: window.location.hostname,
      path: window.location.pathname,
    },
  });
} catch (error) {
  // This catch block is primarily for the rare case where the background script context is invalidated
  // during the sendMessage call (e.g., extension update/reload). It won't catch errors in the background handler.
  console.error(
    '[ContentScript] Error sending analytics tracking message:',
    error instanceof Error ? error.message : String(error),
  );
}

// Add this call right before your existing script loads
setupSidebarRecovery();

/**
 * Collects demographic data about the user's environment.
 * This includes browser info, OS, language, screen size, and device type.
 */
function collectDemographicData(): { [key: string]: any } {
  try {
    const userAgent = navigator.userAgent;
    const language = navigator.language || '';

    let browser = 'Unknown';
    let browserVersion = 'Unknown';
    let os = 'Unknown';
    let osVersion = 'Unknown'; // Stores OS version, especially for mobile

    // Simplified browser detection
    if (userAgent.includes('Firefox/')) {
      browser = 'Firefox';
      browserVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Edg/')) {
      browser = 'Edge';
      browserVersion = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
      browser = 'Chrome';
      browserVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
      browser = 'Safari';
      browserVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
    }
    // IE detection removed for simplification

    // Simplified OS detection
    if (userAgent.includes('Windows NT')) {
      os = 'Windows';
      // osVersion for Windows is not collected for simplicity
    } else if (userAgent.includes('Mac OS X')) {
      os = 'macOS';
      // osVersion for macOS is not collected for simplicity
    } else if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
      os = 'Linux';
      // osVersion for Linux is not collected for simplicity
    } else if (userAgent.includes('Android')) {
      os = 'Android';
      osVersion = userAgent.match(/Android ([\d\.]+)/)?.[1] || 'Unknown';
      // Attempt to identify mobile browser more specifically
      if (userAgent.includes('Chrome/')) {
        browser = 'Chrome Mobile'; // browserVersion from generic Chrome regex might be okay
      } else if (userAgent.includes('Firefox/')) {
        browser = 'Firefox Mobile'; // browserVersion from generic Firefox regex might be okay
      } else {
        browser = 'Android Browser'; // Generic fallback
        browserVersion = osVersion; // Fallback browser version to OS version if specific browser not identified
      }
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      os = 'iOS';
      osVersion = userAgent.match(/OS ([\d_]+)/)?.[1].replace(/_/g, '.') || 'Unknown';
      // iOS browser is typically Safari, version often tied to OS or in 'Version/X.X'
      if (userAgent.includes('CriOS/')) {
        // Chrome on iOS
        browser = 'Chrome iOS';
        browserVersion = userAgent.match(/CriOS\/(\d+\.\d+)/)?.[1] || 'Unknown';
      } else if (userAgent.includes('FxiOS/')) {
        // Firefox on iOS
        browser = 'Firefox iOS';
        browserVersion = userAgent.match(/FxiOS\/(\d+\.\d+)/)?.[1] || 'Unknown';
      } else {
        browser = 'Mobile Safari'; // Default for iOS
        // browserVersion for Mobile Safari might be from generic Safari 'Version/' regex or OS version
        if (browserVersion === 'Unknown' && osVersion !== 'Unknown') {
          // browserVersion = osVersion; // Fallback if not found via Version/
        }
      }
    }

    const data: { [key: string]: any } = {
      browser,
      browser_version: browserVersion,
      operating_system: os,
      language,
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      device_type: /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
        ? /iPad|tablet/i.test(userAgent)
          ? 'tablet'
          : 'mobile'
        : 'desktop',
    };

    // Only add os_version if it's for a mobile OS and meaningfully determined
    if ((os === 'Android' || os === 'iOS') && osVersion !== 'Unknown') {
      data.os_version = osVersion;
    }
    // Fields like pixelRatio and region (derived from language) remain removed.

    return data;
  } catch (error) {
    console.error('[Analytics] Error collecting demographic data:', error);
    return {
      error: 'Failed to collect demographic data',
      browser: 'Unknown',
      operating_system: 'Unknown',
      language: navigator.language || 'Unknown',
    };
  }
}

// Initialize the renderer at the earliest possible moment (styles are injected automatically)
// This ensures function call blocks are hidden before they can be seen by the user
(function instantInitialize() {
  try {
    // This will set up early observers to hide function blocks before they render
    initializeRenderer();
    logMessage('Function call renderer initialized immediately at script load');
  } catch (error) {
    console.error('Error in immediate renderer initialization:', error);
    // If this fails, we'll try again with the standard approach
  }
})();

// Initialize the current site adapter regardless of MCP connection status
(function initializeCurrentAdapter() {
  try {
    const currentHostname = window.location.hostname;
    const adapter = adapterRegistry.getAdapter(currentHostname);

    if (adapter) {
      const adapterId = adapter.name;

      if (!initializedAdapters.has(adapterId)) {
        logMessage(`Initializing site adapter for ${adapter.name} (regardless of MCP connection)`);

        // Always initialize the adapter to ensure UI is visible
        adapter.initialize();

        // Mark this adapter as initialized
        initializedAdapters.add(adapterId);

        // Set the adapter globally
        window.mcpAdapter = adapter;
        logMessage(`Exposed adapter ${adapter.name} to global window.mcpAdapter`);
      } else {
        logMessage(`Adapter ${adapter.name} already initialized, skipping initialization`);
      }
    } else {
      logMessage('No adapter found for current hostname, cannot initialize');
    }
  } catch (error) {
    console.error('Error initializing current adapter:', error);
  }
})();

// Initialize MCP handler and set up connection status listener
mcpHandler.onConnectionStatusChanged(isConnected => {
  logMessage(`MCP connection status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);

  // Update connection status in the current site adapter
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);
  if (adapter) {
    // Update connection status regardless of initialization state
    adapter.updateConnectionStatus(isConnected);

    // Ensure the adapter is always set globally
    window.mcpAdapter = adapter;
  }
});

// Improved initialization strategy for the function call renderer
let rendererInitialized = false;

// More robust initialization with retries if immediate initialization failed
const initRendererWithRetry = (retries = 3, delay = 300) => {
  if (rendererInitialized) return; // Don't try again if already initialized

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try {
      initializeRenderer();
      rendererInitialized = true;
      logMessage('Function call renderer initialized successfully on retry.');

      // Process any function calls that might have been missed
      setTimeout(() => {
        if (rendererInitialized) {
          renderFunctionCalls();
          checkForUnprocessedFunctionCalls();
        }
      }, 500);
    } catch (error) {
      console.error('Error initializing function call renderer:', error);
      if (retries > 0) {
        logMessage(`Retrying renderer initialization in ${delay}ms... (${retries} retries left)`);
        setTimeout(() => initRendererWithRetry(retries - 1, delay), delay);
      } else {
        logMessage('Failed to initialize function call renderer after multiple retries.');
      }
    }
  } else {
    // DOM not fully ready, schedule another check
    logMessage('DOM not ready for renderer initialization, retrying...');
    setTimeout(() => initRendererWithRetry(retries, delay), 100); // Use shorter delay for readyState check
  }
};

// Also set up the standard initialization path as a fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!rendererInitialized) {
      initRendererWithRetry();
    }
  });
} else {
  // If DOMContentLoaded already fired but initialization failed earlier
  if (!rendererInitialized) {
    initRendererWithRetry();
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logMessage(`Message received in content script: ${JSON.stringify(message)}`); // Log all incoming messages
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);

  if (message.command === 'getStats') {
    sendResponse({
      success: true,
      stats: {
        mcpConnected: mcpHandler.getConnectionStatus(),
        activeSite: adapter?.name || 'Unknown',
      },
    });
  } else if (message.command === 'toggleSidebar') {
    // Use the site adapter to toggle sidebar
    if (adapter) {
      adapter.toggleSidebar();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active site adapter' });
    }
  } else if (message.command === 'showSidebarWithToolOutputs') {
    // Show the sidebar with tool outputs
    if (adapter) {
      adapter.showSidebarWithToolOutputs();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active site adapter' });
    }
  } else if (message.command === 'callMcpTool') {
    // Handle MCP tool call requests from popup
    const { toolName, args } = message;
    if (toolName && args) {
      mcpHandler.callTool(toolName, args, (result, error) => {
        if (error) {
          sendResponse({ success: false, error });
        } else {
          sendResponse({ success: true, result });
        }
      });
      return true; // Indicate we'll respond asynchronously
    } else {
      sendResponse({ success: false, error: 'Invalid tool call request' });
    }
  } else if (message.command === 'refreshSidebarContent') {
    // Refresh the sidebar content
    if (adapter) {
      adapter.refreshSidebarContent();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active site adapter' });
    }
  } else if (message.command === 'setFunctionCallRendering') {
    // Handle toggling function call rendering
    const { enabled } = message;
    if (rendererInitialized) {
      if (enabled) {
        logMessage('Starting function call monitoring.');
        startDirectMonitoring();
        // Run a check immediately after enabling
        renderFunctionCalls();
        checkForUnprocessedFunctionCalls();
      } else {
        logMessage('Stopping function call monitoring.');
        stopDirectMonitoring();
      }
      sendResponse({ success: true });
    } else {
      logMessage('Cannot toggle function call rendering: Renderer not initialized.');
      sendResponse({ success: false, error: 'Renderer not initialized' });
    }
  } else if (message.command === 'forceRenderFunctionCalls') {
    // Force a re-render/check for function calls
    if (rendererInitialized) {
      logMessage('Forcing function call render check.');
      renderFunctionCalls();
      checkForUnprocessedFunctionCalls();
      sendResponse({ success: true });
    } else {
      logMessage('Cannot force render: Renderer not initialized.');
      sendResponse({ success: false, error: 'Renderer not initialized' });
    }
  } else if (message.command === 'configureRenderer') {
    // Configure the renderer
    if (rendererInitialized) {
      logMessage(`Configuring function call renderer with options: ${JSON.stringify(message.options)}`);
      configureFunctionCallRenderer(message.options);
      sendResponse({ success: true });
    } else {
      logMessage('Cannot configure renderer: Not initialized.');
      sendResponse({ success: false, error: 'Renderer not initialized' });
    }
  }

  // Always return true if you want to use sendResponse asynchronously
  return true;
});

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
  // Clean up site adapter resources
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);
  if (adapter) {
    adapter.cleanup();
  }

  // Clear the initialized adapters set
  initializedAdapters.clear();
});

// Expose mcpHandler to the global window object for renderer access
(window as any).mcpHandler = mcpHandler;
console.debug('[Content Script] mcpHandler exposed to window object for renderer use.');

// Set the current adapter to global window object
const currentAdapter = getCurrentAdapter();
if (currentAdapter) {
  window.mcpAdapter = currentAdapter;
  console.debug(`[Content Script] Current adapter (${currentAdapter.name}) exposed to window object as mcpAdapter.`);
}
