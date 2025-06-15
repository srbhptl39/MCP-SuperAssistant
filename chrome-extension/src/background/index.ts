import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import {
  runWithSSE,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
  callToolWithSSE,
  getPrimitivesWithSSE,
  callToolWithBackwardsCompatibility,
  getPrimitivesWithBackwardsCompatibility,
  resetMcpConnectionState,
  resetMcpConnectionStateForRecovery
} from '../mcpclient/officialmcpclient';
import { sendAnalyticsEvent, trackError } from '../../utils/analytics';

// Import message types for type safety
import type {
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  McpMessageType,
  CallToolRequest,
  GetConnectionStatusRequest,
  GetToolsRequest,
  ForceReconnectRequest,
  GetServerConfigRequest,
  UpdateServerConfigRequest,
  HeartbeatRequest,
  ConnectionStatusChangedBroadcast,
  ToolUpdateBroadcast,
  ServerConfigUpdatedBroadcast,
  HeartbeatResponseBroadcast
} from '../../../pages/content/src/types/messages';

// Default MCP server URL
const DEFAULT_MCP_SERVER_URL = 'http://localhost:3006/sse';

// Background script state management - replaces legacy mcpInterface
let serverUrl: string = DEFAULT_MCP_SERVER_URL;
let isConnected: boolean = false;
let connectionCount: number = 0;
let isInitialized: boolean = false;

/**
 * Initialize server URL from Chrome storage
 * Replaces mcpInterface initialization functionality
 */
async function initializeServerUrl(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('mcpServerUrl');
    serverUrl = result.mcpServerUrl || DEFAULT_MCP_SERVER_URL;
    isInitialized = true;
    console.log('[Background] Server URL loaded from storage:', serverUrl);
  } catch (error) {
    console.warn('[Background] Failed to load server URL from storage, using default:', error);
    serverUrl = DEFAULT_MCP_SERVER_URL;
    isInitialized = true;
  }
}

/**
 * Wait for initialization to complete
 * Replaces mcpInterface.waitForInitialization()
 */
async function waitForInitialization(): Promise<void> {
  while (!isInitialized) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Get the current server URL
 * Replaces mcpInterface.getServerUrl()
 */
function getServerUrl(): string {
  return serverUrl;
}

/**
 * Update the server URL
 * Replaces mcpInterface.updateServerUrl()
 */
function updateServerUrl(url: string): void {
  serverUrl = url;
  console.log('[Background] Server URL updated to:', url);
}

/**
 * Get connection status
 * Replaces mcpInterface.getConnectionStatus()
 */
function getConnectionStatus(): boolean {
  return isConnected;
}

/**
 * Update connection status
 * Replaces mcpInterface.updateConnectionStatus()
 */
function updateConnectionStatus(status: boolean): void {
  isConnected = status;
  console.log('[Background] Connection status updated to:', status);
}

/**
 * Get connection count
 * Replaces mcpInterface.getConnectionCount()
 */
function getConnectionCount(): number {
  return connectionCount;
}

/**
 * Increment connection count
 */
function incrementConnectionCount(): void {
  connectionCount++;
}

/**
 * Decrement connection count
 */
function decrementConnectionCount(): void {
  connectionCount = Math.max(0, connectionCount - 1);
}

// Define server connection state
let isConnecting = false;
let connectionAttemptCount = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Enhanced error categorization for better tool vs connection error distinction
 * 
 * This function analyzes error messages to determine whether an error indicates
 * a connection problem (server unavailable) or a tool-specific issue (tool not found, invalid args, etc.)
 * This helps prevent unnecessary disconnection states when only tool execution fails.
 * 
 * @param error - The error to categorize
 * @returns Object containing categorization flags and category string
 */
function categorizeToolError(error: Error): { isConnectionError: boolean; isToolError: boolean; category: string } {
  const errorMessage = error.message.toLowerCase();

  // Tool-specific errors that definitely don't indicate connection issues
  const toolErrorPatterns = [
    /tool .* not found/i,
    /tool not found/i,
    /method not found/i,
    /invalid arguments/i,
    /invalid parameters/i,
    /mcp error -32602/i, // Invalid params
    /mcp error -32601/i, // Method not found
    /mcp error -32600/i, // Invalid request
    /tool '[^']+' is not available/i,
    /tool '[^']+' not found on server/i,
  ];

  // Connection-related errors that indicate server is unavailable
  const connectionErrorPatterns = [
    /connection refused/i,
    /econnrefused/i,
    /timeout/i,
    /etimedout/i,
    /enotfound/i,
    /network error/i,
    /server unavailable/i,
    /could not connect/i,
    /connection failed/i,
    /transport error/i,
    /fetch failed/i,
  ];

  // Check tool errors first (highest priority)
  if (toolErrorPatterns.some(pattern => pattern.test(errorMessage))) {
    return { isConnectionError: false, isToolError: true, category: 'tool_error' };
  }

  // Check connection errors
  if (connectionErrorPatterns.some(pattern => pattern.test(errorMessage))) {
    return { isConnectionError: true, isToolError: false, category: 'connection_error' };
  }

  // Default to tool error for ambiguous cases to prevent unnecessary disconnections
  return { isConnectionError: false, isToolError: true, category: 'unknown_tool_error' };
}

/**
 * Initialize the extension
 * 
 * This function is called once when the extension starts and handles:
 * - Theme initialization
 * - Server URL loading from storage
 * - Initial connection status check and broadcast
 * - Asynchronous server connection attempt if needed
 * - Initial tools fetching and broadcast if connected
 * 
 * The initialization is designed to be non-blocking and resilient to failures.
 */
async function initializeExtension() {
  sendAnalyticsEvent('extension_loaded', {});
  console.log('Extension initializing...');

  // Initialize theme
  try {
    const theme = await exampleThemeStorage.get();
    console.log('Theme initialized:', theme);
  } catch (error) {
    console.warn('Error initializing theme, continuing with defaults:', error);
  }

  // Initialize server URL from storage
  await initializeServerUrl();

  // Wait for initialization to complete
  await waitForInitialization();

  // Get the loaded server URL
  const serverUrl = getServerUrl();
  console.log('Background script initialized with server URL:', serverUrl);

  // Set initial connection status
  updateConnectionStatus(false);

  console.log('Extension initialized successfully');

  // After initialization is complete, check and broadcast initial connection status
  setTimeout(async () => {
    const serverUrl = getServerUrl();
    
    // Check initial connection status
    const isConnected = await checkMcpServerConnection();
    updateConnectionStatus(isConnected);
    
    // Broadcast initial status to any already-loaded content scripts
    broadcastConnectionStatusToContentScripts(isConnected);
    
    console.log(`[Background] Initial connection status broadcast: ${isConnected ? 'connected' : 'disconnected'}`);
    
    // Then try connecting to the server asynchronously if not connected
    if (!isConnected) {
      tryConnectToServer(serverUrl).catch(() => {
        // Silently ignore errors - we've already logged them
        // and the extension should continue running
      });
    } else {
      // If already connected, broadcast tools as well
      try {
        console.log('[Background] Server already connected, fetching and broadcasting initial tools...');
        const primitives = await getPrimitivesWithBackwardsCompatibility(serverUrl, false);
        console.log(`[Background] Retrieved ${primitives.length} primitives for initial broadcast`);
        
        const tools = normalizeToolsFromPrimitives(primitives);
        console.log(`[Background] Broadcasting ${tools.length} normalized initial tools`);
        
        broadcastToolsUpdateToContentScripts(tools);
      } catch (error) {
        console.warn('[Background] Error broadcasting initial tools:', error);
      }
    }
  }, 1000);
}

/**
 * Try to connect to the MCP server with retry logic
 * 
 * This function is separated from extension initialization to prevent blocking
 * and includes comprehensive error handling and retry logic with exponential backoff.
 * 
 * @param uri - The MCP server URI to connect to
 * @returns Promise that resolves when connection attempt is complete (success or failure)
 */
async function tryConnectToServer(uri: string): Promise<void> {
  if (isConnecting) {
    console.log('Connection attempt already in progress, skipping');
    return;
  }

  isConnecting = true;
  connectionAttemptCount++;

  console.log(
    `Attempting to connect to MCP server (attempt ${connectionAttemptCount}/${MAX_CONNECTION_ATTEMPTS}): ${uri}`,
  );

  try {
    await runWithSSE(uri);

    console.log('MCP client connected successfully');
    updateConnectionStatus(true);
    broadcastConnectionStatusToContentScripts(true);
    
    // Also broadcast available tools after successful connection
    try {
      console.log('[Background] Connection successful, fetching and broadcasting tools...');
      const primitives = await getPrimitivesWithBackwardsCompatibility(uri, true);
      console.log(`[Background] Retrieved ${primitives.length} primitives after connection`);
      
      const tools = normalizeToolsFromPrimitives(primitives);
      console.log(`[Background] Broadcasting ${tools.length} normalized tools after successful connection`);
      
      broadcastToolsUpdateToContentScripts(tools);
    } catch (toolsError) {
      console.warn('[Background] Error broadcasting tools after connection:', toolsError);
    }
    
    connectionAttemptCount = 0; // Reset counter on success
  } catch (error: any) {
    const errorCategory = categorizeToolError(error instanceof Error ? error : new Error(String(error)));

    console.warn(`MCP server connection failed (${errorCategory.category}): ${error.message || String(error)}`);
    console.log('Extension will continue to function with limited capabilities');

    // Only update connection status for actual connection errors
    if (errorCategory.isConnectionError) {
      updateConnectionStatus(false);
      broadcastConnectionStatusToContentScripts(false, error.message || String(error));
    } else {
      console.log('Error categorized as tool-related, not updating connection status');
    }

    // Schedule another attempt if we haven't reached the limit
    if (connectionAttemptCount < MAX_CONNECTION_ATTEMPTS) {
      const delayMs = Math.min(5000 * connectionAttemptCount, 15000); // Exponential backoff with cap
      console.log(`Scheduling next connection attempt in ${delayMs / 1000} seconds...`);

      setTimeout(() => {
        isConnecting = false; // Reset connecting flag
        tryConnectToServer(uri).catch(() => {}); // Try again
      }, delayMs);
    } else {
      console.log('Maximum connection attempts reached. Will try again during periodic check.');
      // ENHANCED: Don't give up permanently - periodic checks will retry with reset state
      isConnecting = false;
    }
  } finally {
    if (connectionAttemptCount >= MAX_CONNECTION_ATTEMPTS) {
      isConnecting = false;
    }
  }
}

// Set up a periodic connection check with enhanced recovery logic
const PERIODIC_CHECK_INTERVAL = 60000; // 1 minute
setInterval(async () => {
  if (isConnecting) {
    return; // Skip if already connecting
  }

  // Check current connection status with enhanced validation
  const wasConnected = getConnectionStatus();
  const isConnected = await checkMcpServerConnection();
  updateConnectionStatus(isConnected);

  // Broadcast status change if it changed
  if (wasConnected !== isConnected) {
    console.log(`[Background] Connection status changed: ${wasConnected} -> ${isConnected}`);
    broadcastConnectionStatusToContentScripts(isConnected);
    
    // If connected, also broadcast available tools
    if (isConnected) {
      try {
        console.log('[Background] Periodic check: Connection established, fetching and broadcasting tools...');
        const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), true);
        console.log(`[Background] Periodic check: Retrieved ${primitives.length} primitives`);
        
        const tools = normalizeToolsFromPrimitives(primitives);
        console.log(`[Background] Periodic check: Broadcasting ${tools.length} normalized tools`);
        
        broadcastToolsUpdateToContentScripts(tools);
      } catch (error) {
        console.warn('[Background] Error broadcasting tools after status change:', error);
      }
    }
  } else {
    // Even if status didn't change, periodically broadcast to ensure content scripts are in sync
    broadcastConnectionStatusToContentScripts(isConnected);
  }

  // ENHANCED: If not connected and we're not in the middle of connecting, try to connect
  // Reset connection attempt count periodically to allow recovery from permanent failure state
  if (!isConnected && !isConnecting) {
    connectionAttemptCount = 0; // Reset counter for periodic checks
    console.log('Periodic check: MCP server not connected, attempting to connect');
    const serverUrl = getServerUrl();
    
    // Reset the client's failure state periodically to prevent permanent disconnection
    // This is critical to fix the issue where only browser restart would work
    try {
      console.log('[Background] Resetting MCP client connection state for periodic recovery attempt');
      resetMcpConnectionStateForRecovery(); // Use recovery reset instead of full reset
    } catch (error) {
      console.warn('[Background] Error resetting MCP connection state:', error);
    }
    
    tryConnectToServer(serverUrl).catch(() => {});
  }
}, PERIODIC_CHECK_INTERVAL);

// Log active connections periodically
setInterval(() => {
  const connectionCount = getConnectionCount();
  if (connectionCount > 0) {
    console.log(`Active MCP content script connections: ${connectionCount}`);
  }
}, 60000);

// --- Error Handling ---
// Listen for unhandled errors in the service worker
// Note: This may not catch all async errors perfectly depending on how they propagate
self.addEventListener('unhandledrejection', event => {
  console.error('Unhandled rejection in service worker:', event.reason);
  if (event.reason instanceof Error) {
    trackError(event.reason, 'background_unhandled_rejection');
  } else {
    // Handle non-Error rejections if necessary
    sendAnalyticsEvent('extension_error', {
      error_message: `Unhandled rejection: ${JSON.stringify(event.reason)}`,
      error_context: 'background_unhandled_rejection_non_error',
    });
  }
});

self.addEventListener('error', event => {
  console.error('Uncaught error in service worker:', event.error);
  if (event.error instanceof Error) {
    trackError(event.error, 'background_uncaught_error');
  } else {
    sendAnalyticsEvent('extension_error', {
      error_message: `Uncaught error: ${event.message}`,
      error_context: 'background_uncaught_error_non_error',
    });
  }
});

// --- Lifecycle Events ---

chrome.runtime.onInstalled.addListener(details => {
  console.log('Extension installed or updated:', details.reason);
  sendAnalyticsEvent('extension_installed', { reason: details.reason });

  // Perform initial setup on first install
  if (details.reason === 'install') {
    // You might want to set default settings here
    console.log('Performing first-time installation setup.');
    // Example: Set default server URL if not already set (although initializeServerUrl handles this)
  } else if (details.reason === 'update') {
    console.log(`Extension updated from ${details.previousVersion}`);
    // Handle updates if needed
  }

  // Re-initialize after install/update (optional, depending on setup)
  // initializeExtension().catch(err => console.error("Error re-initializing after install:", err));
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Browser startup detected.');
  sendAnalyticsEvent('browser_startup', {});
  // Re-check connection on startup
  initializeExtension().catch(err => console.error('Error initializing on startup:', err));
});

// Start extension initialization
initializeExtension()
  .then(() => {
    console.log('Extension startup complete');
  })
  .catch(error => {
    console.error('Error during extension initialization:', error);
    console.log('Extension will continue running with limited functionality');
  });

console.log('Background script loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// --- Enhanced Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Enhanced logging for debugging
  console.debug('[Background] Received message:', {
    type: message.type || message.command,
    origin: message.origin || 'unknown',
    id: message.id,
    hasPayload: !!message.payload,
    from: sender.tab ? `tab-${sender.tab.id}` : 'extension'
  });

  /* ------------------------------------------------------------------ */
  /* Legacy analytics bridge                                             */
  /* ------------------------------------------------------------------ */
  if (message.command === 'trackAnalyticsEvent') {
    if (message.eventName && message.eventParams) {
      sendAnalyticsEvent(message.eventName, message.eventParams)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('[Background] Error tracking analytics event from message:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true; // Async response
    }
    console.warn('[Background] Invalid trackAnalyticsEvent message received:', message);
    sendResponse({ success: false, error: 'Invalid eventName or eventParams' });
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* MCP ContextBridge integration                                       */
  /* ------------------------------------------------------------------ */
  if (typeof message.type === 'string' && message.type.startsWith('mcp:')) {
    // Handle MCP messages asynchronously
    handleMcpMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }

  // Fallback – message not handled here
  console.debug('[Background] Message not handled, ignoring:', message.type || message.command);
  return false;
});

/**
 * Enhanced MCP message handler with proper error handling, type safety, and response formatting
 * 
 * @param message - The message received from the content script
 * @param sender - Chrome runtime message sender information
 * @param sendResponse - Callback function to send response back to sender
 */
async function handleMcpMessage(
  message: RequestMessage, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response: ResponseMessage) => void
) {
  const startTime = Date.now();
  const messageType = message.type as McpMessageType;
  
  try {
    let result: any = null;
    const payload = message.payload || {};

    console.log(`[Background] Processing MCP message: ${messageType}`);

    switch (messageType) {
      case 'mcp:call-tool': {
        const { toolName, args } = payload as CallToolRequest;
        if (!toolName) {
          throw new Error('Tool name is required');
        }
        
        console.log(`[Background] Calling tool: ${toolName}`);
        result = await callToolWithBackwardsCompatibility(getServerUrl(), toolName, args || {});
        console.log(`[Background] Tool call completed: ${toolName}`);
        break;
      }

      case 'mcp:get-connection-status': {
        console.log('[Background] Getting current connection status');
        
        // Double-check the connection status to ensure accuracy
        const storedStatus = getConnectionStatus();
        const actualStatus = await checkMcpServerConnection();
        
        console.log(`[Background] Stored status: ${storedStatus}, Actual status: ${actualStatus}`);
        
        // Update stored status if they don't match
        if (storedStatus !== actualStatus) {
          console.log('[Background] Status mismatch detected, updating and broadcasting...');
          updateConnectionStatus(actualStatus);
          broadcastConnectionStatusToContentScripts(actualStatus);
        }
        
        result = { 
          status: actualStatus ? 'connected' : 'disconnected',
          isConnected: actualStatus,
          timestamp: Date.now()
        };
        break;
      }

      case 'mcp:get-tools': {
        const { forceRefresh = false } = payload as GetToolsRequest;
        console.log(`[Background] Getting tools (forceRefresh: ${forceRefresh})`);
        
        try {
          const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), forceRefresh);
          console.log(`[Background] Retrieved ${primitives.length} primitives from server`);
          
          // Use the helper function to normalize tools with proper schema handling
          const tools = normalizeToolsFromPrimitives(primitives);
          console.log(`[Background] Returning ${tools.length} normalized tools to content script`);
          
          result = tools;
        } catch (error) {
          console.error('[Background] Error getting tools:', error);
          // Return empty array instead of throwing to prevent UI crashes
          result = [];
        }
        break;
      }

      case 'mcp:force-reconnect': {
        console.log('[Background] Force reconnect requested via context bridge');
        
        try {
          // Broadcast reconnection started status
          broadcastConnectionStatusToContentScripts(false, 'Reconnecting...');
          
          console.log('[Background] Starting force reconnection process...');
          
          // ENHANCED: Reset connection state before attempting reconnection
          // This ensures we don't get blocked by consecutive failure limits
          resetMcpConnectionState();
          
          // Set a reasonable timeout for the reconnection process
          const reconnectionPromise = forceReconnectToMcpServer(getServerUrl());
          const timeoutPromise = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Reconnection timeout after 20 seconds')), 20000)
          );
          
          await Promise.race([reconnectionPromise, timeoutPromise]);
          console.log('[Background] Force reconnect completed successfully');
          
          // Update connection status
          const isConnected = await checkMcpServerConnection();
          updateConnectionStatus(isConnected);
          
          // Broadcast the new status to all content scripts
          broadcastConnectionStatusToContentScripts(isConnected);
          
          // If connected, also refresh and broadcast tools
          if (isConnected) {
            try {
              console.log('[Background] Fetching tools after successful reconnection...');
              const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), true);
              console.log(`[Background] Retrieved ${primitives.length} primitives after reconnection`);
              
              const tools = normalizeToolsFromPrimitives(primitives);
              console.log(`[Background] Broadcasting ${tools.length} normalized tools after reconnection`);
              
              broadcastToolsUpdateToContentScripts(tools);
            } catch (toolsError) {
              console.error('[Background] Error fetching tools after reconnect:', toolsError);
            }
          }
          
          result = { isConnected, message: 'Reconnection completed' };
        } catch (error) {
          console.error('[Background] Force reconnect failed:', error);
          
          // Update connection status
          const isConnected = await checkMcpServerConnection();
          updateConnectionStatus(isConnected);
          
          // Broadcast the failure status
          const errorMessage = error instanceof Error ? error.message : String(error);
          broadcastConnectionStatusToContentScripts(isConnected, errorMessage);
          
          result = { isConnected, error: errorMessage };
        }
        break;
      }

      case 'mcp:get-server-config': {
        const stored = await chrome.storage.local.get('mcpServerUrl');
        result = { uri: stored.mcpServerUrl || DEFAULT_MCP_SERVER_URL };
        break;
      }

      case 'mcp:update-server-config': {
        const { config } = payload;
        if (!config || typeof config.uri !== 'string') {
          throw new Error('Invalid server config: uri is required');
        }

        console.log(`[Background] Updating server config to: ${config.uri}`);
        
        // Update storage and background script state
        await chrome.storage.local.set({ mcpServerUrl: config.uri });
        updateServerUrl(config.uri);
        
        // Broadcast config update immediately
        broadcastConfigUpdateToContentScripts({ uri: config.uri });
        
        // Start async reconnection but don't block the response
        const reconnectPromise = (async () => {
          try {
            console.log('[Background] Starting async reconnection after config update...');
            await forceReconnectToMcpServer(config.uri);
            const isConnected = await checkMcpServerConnection();
            updateConnectionStatus(isConnected);
            broadcastConnectionStatusToContentScripts(isConnected);
            console.log(`[Background] Async reconnection completed, connected: ${isConnected}`);
            
            // If connected, fetch and broadcast tools
            if (isConnected) {
              try {
                const primitives = await getPrimitivesWithBackwardsCompatibility(config.uri, true);
                const tools = normalizeToolsFromPrimitives(primitives);
                broadcastToolsUpdateToContentScripts(tools);
                console.log(`[Background] Broadcasted ${tools.length} normalized tools after config update`);
              } catch (toolError) {
                console.warn('[Background] Failed to fetch tools after config update:', toolError);
              }
            }
          } catch (error) {
            console.warn('[Background] Async reconnect after config update failed:', error);
            const isConnected = await checkMcpServerConnection();
            updateConnectionStatus(isConnected);
            const errorMessage = error instanceof Error ? error.message : String(error);
            broadcastConnectionStatusToContentScripts(isConnected, errorMessage);
          }
        })();
        
        // Don't await the reconnection, just start it
        reconnectPromise.catch(error => {
          console.error('[Background] Unhandled error in async reconnection:', error);
        });
        
        result = { success: true };
        break;
      }

      case 'mcp:heartbeat': {
        // Handle heartbeat from content script
        const { timestamp } = payload;
        const isConnected = isMcpServerConnected();
        
        result = {
          timestamp: Date.now(),
          isConnected,
          receivedTimestamp: timestamp
        };

        // Also broadcast heartbeat response via context bridge
        if (message.id) {
          // Send heartbeat response event to all tabs
          setTimeout(() => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, {
                    type: 'mcp:heartbeat-response',
                    payload: { timestamp: Date.now(), isConnected },
                    origin: 'background',
                    timestamp: Date.now()
                  }).catch(() => {
                    // Ignore errors for tabs that can't receive messages
                  });
                }
              });
            });
          }, 0);
        }
        break;
      }

      default:
        throw new Error(`Unhandled MCP message type: ${messageType}`);
    }

    // Calculate processing time
    const processingTime = Date.now() - startTime;
    console.log(`[Background] MCP message ${messageType} processed in ${processingTime}ms`);

    // Send successful response with proper structure
    sendResponse({ 
      type: `${messageType}:response`,
      payload: result,
      success: true,
      timestamp: Date.now(),
      processingTime,
      origin: 'background',
      id: message.id
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`[Background] MCP message handling error (${processingTime}ms):`, error);
    
    // Send error response with proper structure
    sendResponse({ 
      type: `${messageType}:response`,
      error: errorMessage,
      success: false,
      timestamp: Date.now(),
      processingTime,
      origin: 'background',
      id: message.id
    });
  }
}

/**
 * Broadcast connection status to all content scripts via context bridge
 * 
 * @param isConnected - Whether the MCP server is connected
 * @param error - Optional error message if connection failed
 */
function broadcastConnectionStatusToContentScripts(isConnected: boolean, error?: string) {
  const status = error ? 'error' : (isConnected ? 'connected' : 'disconnected');
  
  console.log(`[Background] Broadcasting connection status: ${status} (connected: ${isConnected})`);
  
  const broadcastMessage: BaseMessage & { payload: ConnectionStatusChangedBroadcast } = {
    type: 'connection:status-changed',
    payload: {
      status: status as any, // Type assertion needed due to status calculation
      error: error || undefined,
      isConnected,
      timestamp: Date.now()
    },
    origin: 'background',
    timestamp: Date.now()
  };
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, broadcastMessage).catch(() => {
          // Ignore errors for tabs that can't receive messages
        });
      }
    });
  });
}

/**
 * Broadcast tools update to all content scripts via context bridge
 * 
 * @param tools - Array of available MCP tools
 */
function broadcastToolsUpdateToContentScripts(tools: any[]) {
  console.log(`[Background] Broadcasting tools update to content scripts: ${tools.length} tools`);
  
  const broadcastMessage: BaseMessage & { payload: ToolUpdateBroadcast } = {
    type: 'mcp:tool-update',
    payload: {
      tools
    },
    origin: 'background',
    timestamp: Date.now()
  };
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, broadcastMessage).catch(() => {
          // Ignore errors for tabs that can't receive messages
        });
      }
    });
  });
}

/**
 * Broadcast server config update to all content scripts via context bridge
 * 
 * @param config - The updated server configuration
 */
function broadcastConfigUpdateToContentScripts(config: { uri: string }) {
  console.log(`[Background] Broadcasting config update to content scripts: ${config.uri}`);
  
  const broadcastMessage: BaseMessage & { payload: ServerConfigUpdatedBroadcast } = {
    type: 'mcp:server-config-updated',
    payload: {
      config: config as any // Type assertion due to partial config structure
    },
    origin: 'background',
    timestamp: Date.now()
  };
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, broadcastMessage).catch(() => {
          // Ignore errors for tabs that can't receive messages
        });
      }
    });
  });
}

/**
 * Normalize tool schema property names for consistent content script consumption
 * Converts MCP server's camelCase 'inputSchema' to snake_case 'input_schema'
 * 
 * @param primitives - Array of primitives from MCP server
 * @returns Array of normalized tools with proper schema property names
 */
function normalizeToolsFromPrimitives(primitives: any[]): any[] {
  const tools = primitives
    .filter(p => p.type === 'tool')
    .map(p => {
      const tool = p.value as any; // Cast to any to handle both inputSchema and input_schema properties
      
      // Log the raw tool structure for debugging (only first tool to avoid spam)
      if (p === primitives.find(prim => prim.type === 'tool')) {
        console.log(`[Background] Sample raw tool structure:`, JSON.stringify(tool, null, 2));
      }
      
      // Normalize schema property names: inputSchema (camelCase from MCP) -> input_schema (snake_case for content script)
      const normalizedTool = {
        name: tool.name,
        description: tool.description || '',
        // Convert camelCase inputSchema to snake_case input_schema for content script compatibility
        input_schema: tool.inputSchema || tool.input_schema || {},
        // Keep legacy schema field for backwards compatibility (as string)
        schema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : 
                tool.input_schema ? JSON.stringify(tool.input_schema) : '{}',
        // Preserve URI if present (for resources)
        ...(tool.uri && { uri: tool.uri }),
        // Preserve arguments if present
        ...(tool.arguments && { arguments: tool.arguments })
      };
      
      return normalizedTool;
    });
    
  console.log(`[Background] Normalized ${tools.length} tools with schemas. Sample schema sizes: ${tools.slice(0, 3).map(t => `${t.name}:${t.schema.length}chars`).join(', ')}`);
  return tools;
}
