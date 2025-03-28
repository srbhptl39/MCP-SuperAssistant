/**
 * Content Script
 *
 * This is the entry point for the content script that runs on web pages.
 * Tailwind CSS is imported for future styling needs.
 */

import './tailwind-input.css';
import { logMessage } from '@src/utils/helpers';
import { mcpHandler } from '@src/utils/mcpHandler';
import { getTrackedElementCount, clearTrackedElements } from '@src/utils/elementTracker';

// Import the adapter registry
import { adapterRegistry } from '@src/adapters/adapterRegistry';

// Import and register all site adapters
import './adapters';

// Import common functions from both adapters for message handling
import {
  getProcessedToolOutputs,
  getProcessedMarkdownContents,
  clearProcessedToolOutputs,
  clearProcessedMarkdownContents,
} from '@src/components/websites/perplexity';

/**
 * Content Script Entry Point
 */
logMessage('Content script loaded');

// Initialize MCP handler and set up connection status listener
mcpHandler.onConnectionStatusChanged(isConnected => {
  logMessage(`MCP connection status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);

  // Update connection status in the current site adapter
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);
  if (adapter) {
    adapter.updateConnectionStatus(isConnected);
  }
});

// Initialize the appropriate site adapter for the current website
const currentHostname = window.location.hostname;
const adapter = adapterRegistry.getAdapter(currentHostname);
if (adapter) {
  logMessage(`Initializing site adapter for ${adapter.name}`);
  adapter.initialize();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in content script:', message);
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);

  // Handle commands from popup or background script
  if (message.command === 'getToolOutputs') {
    const outputs = getProcessedToolOutputs();
    sendResponse({ success: true, outputs });
  } else if (message.command === 'getMarkdownContents') {
    const contents = getProcessedMarkdownContents();
    sendResponse({ success: true, contents });
  } else if (message.command === 'clearTracking') {
    clearTrackedElements();
    clearProcessedToolOutputs();
    clearProcessedMarkdownContents();
    sendResponse({ success: true });
  } else if (message.command === 'forceRescan') {
    // Use the site adapter to force rescan
    logMessage('Forcing complete rescan of all elements');
    if (adapter) {
      adapter.forceRescan();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active site adapter' });
    }
  } else if (message.command === 'getStats') {
    sendResponse({
      success: true,
      stats: {
        trackedElements: getTrackedElementCount(),
        processedOutputs: getProcessedToolOutputs().length,
        processedMarkdownContents: getProcessedMarkdownContents().length,
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
  }

  // Always return true if you want to use sendResponse asynchronously
  return true;
});

// Example of how to call an MCP tool from the content script
// This could be triggered by a UI element or other event
function exampleToolCall() {
  mcpHandler.callTool('example_tool_name', { param1: 'value1', param2: 'value2' }, (result, error) => {
    if (error) {
      logMessage(`Tool call failed: ${error}`);
    } else {
      logMessage(`Tool call succeeded with result: ${JSON.stringify(result)}`);
      // Process the result here
    }
  });
}

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
  // Clean up site adapter resources
  const currentHostname = window.location.hostname;
  const adapter = adapterRegistry.getAdapter(currentHostname);
  if (adapter) {
    adapter.cleanup();
  }
});
