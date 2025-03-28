import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import {
  runWithSSE,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
} from '../mcpclient/officialmcpclient';
import { mcpInterface } from '../mcpclient/mcpinterfaceToContentScript';

// Default MCP server URL
const DEFAULT_MCP_SERVER_URL = 'http://localhost:3006/sse';

// Initialize theme storage
exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

// Initialize server URL from storage or use default
async function initializeServerUrl(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('mcpServerUrl');
    const serverUrl = result.mcpServerUrl || DEFAULT_MCP_SERVER_URL;
    console.log(`Loaded MCP server URL from storage: ${serverUrl}`);
    return serverUrl;
  } catch (error) {
    console.error('Error loading MCP server URL from storage:', error);
    return DEFAULT_MCP_SERVER_URL;
  }
}

/**
 * Attempts to connect to the MCP server with retry logic
 * @param uri The URI of the SSE endpoint
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Delay between retries in milliseconds
 */
async function connectWithRetry(uri: string, maxRetries = 3, retryDelay = 5000): Promise<void> {
  let retries = 0;

  // Update the server URL in the MCP interface
  mcpInterface.updateServerUrl(uri);

  // Set connection status to false initially
  mcpInterface.updateConnectionStatus(false);

  while (retries <= maxRetries) {
    try {
      if (retries > 0) {
        console.log(`Retry attempt ${retries}/${maxRetries}...`);
      }

      console.log(`Initializing MCP client and connecting to SSE endpoint: ${uri}`);
      await runWithSSE(uri);
      console.log('MCP client connected successfully');

      // Update connection status to true on successful connection
      mcpInterface.updateConnectionStatus(true);

      return; // Success, exit the function
    } catch (error) {
      console.error(`Connection attempt ${retries + 1} failed:`, error);

      if (retries >= maxRetries) {
        console.error(`Maximum retry attempts (${maxRetries}) reached. Giving up.`);
        break;
      }

      // Wait before retrying
      console.log(`Waiting ${retryDelay}ms before next retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retries++;
    }
  }

  // If we get here, all retries failed
  console.error('Failed to connect to MCP server after multiple attempts');
  mcpInterface.updateConnectionStatus(false);
}

// Initialize MCP client with the stored server URL
initializeServerUrl().then(serverUrl => {
  connectWithRetry(serverUrl).catch(error => {
    console.error('All connection attempts failed:', error);
    mcpInterface.updateConnectionStatus(false);
  });
});

// Set up a periodic check to ensure the MCP server is still connected
setInterval(async () => {
  console.log('Performing periodic MCP server connection check');

  // Check if the server is connected using the more accurate method
  const isConnected = await checkMcpServerConnection();
  console.log(`MCP server connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);

  // Update the interface with the current status
  mcpInterface.updateConnectionStatus(isConnected);

  // If not connected, try to reconnect
  if (!isConnected) {
    console.log('MCP server is disconnected, attempting to reconnect...');
    const serverUrl = await initializeServerUrl();
    connectWithRetry(serverUrl, 1, 1000).catch(error => {
      console.error('Reconnection attempt failed:', error);
    });
  }
}, 60000); // Check every minute

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// Log active connections periodically
setInterval(() => {
  const connectionCount = mcpInterface.getConnectionCount();
  console.log(`Active MCP content script connections: ${connectionCount}`);
}, 30000); // Log every 30 seconds
