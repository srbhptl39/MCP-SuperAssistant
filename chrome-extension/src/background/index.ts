import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import { RemoteConfigManager } from './remote-config-manager';
import {
  runWithBackwardsCompatibility,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
  callToolWithBackwardsCompatibility,
  getPrimitivesWithBackwardsCompatibility,
  resetMcpConnectionState,
  resetMcpConnectionStateForRecovery,
  normalizeToolsFromPrimitives as normalizeTools,
  createMcpClient,
  type TransportType,
  type ConnectionRequest
} from '../mcpclient/index';
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
import { createLogger } from '@extension/shared/lib/logger';

// Default MCP server URLs

const logger = createLogger('BACKGROUND');

const DEFAULT_SSE_URL = 'http://localhost:3006/sse';
const DEFAULT_WEBSOCKET_URL = 'ws://localhost:3006/message';
const DEFAULT_STREAMABLE_HTTP_URL = 'http://localhost:3006';

// Connection type management
type ConnectionType = TransportType;
const DEFAULT_CONNECTION_TYPE: ConnectionType = 'sse';

// Remote Config Manager
let remoteConfigManager: RemoteConfigManager | null = null;

// Background script state management with connection type support
let serverUrl: string = DEFAULT_SSE_URL;
let connectionType: ConnectionType = DEFAULT_CONNECTION_TYPE;
let isConnected: boolean = false;
let connectionCount: number = 0;
let isInitialized: boolean = false;

/**
 * Initialize server URL from Chrome storage
 * Replaces mcpInterface initialization functionality
 */
async function initializeServerConfig(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['mcpServerUrl', 'mcpConnectionType']);
    
    // Load connection type first to determine default URL
    connectionType = (result.mcpConnectionType as ConnectionType) || DEFAULT_CONNECTION_TYPE;
    const defaultUrl = connectionType === 'websocket' 
      ? DEFAULT_WEBSOCKET_URL 
      : connectionType === 'streamable-http'
        ? DEFAULT_STREAMABLE_HTTP_URL
        : DEFAULT_SSE_URL;
    
    serverUrl = result.mcpServerUrl || defaultUrl;
    isInitialized = true;
    
    logger.debug('[Background] Server config loaded from storage:', {
      url: serverUrl,
      type: connectionType
    });
  } catch (error) {
    logger.warn('[Background] Failed to load server config from storage, using defaults:', error);
    connectionType = DEFAULT_CONNECTION_TYPE;
    serverUrl = DEFAULT_SSE_URL;
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
 * Update the server configuration
 * Replaces mcpInterface.updateServerUrl()
 */
function updateServerConfig(url: string, type?: ConnectionType): void {
  serverUrl = url;
  if (type) {
    connectionType = type;
  }
  logger.debug('[Background] Server config updated to:', { url, type: connectionType });
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
  logger.debug('[Background] Connection status updated to:', status);
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
  logger.debug('Extension initializing...');

  // Initialize theme
  try {
    const theme = await exampleThemeStorage.get();
    logger.debug('Theme initialized:', theme);
  } catch (error) {
    logger.warn('Error initializing theme, continuing with defaults:', error);
  }

  // Initialize server configuration from storage
  await initializeServerConfig();

  // Wait for initialization to complete
  await waitForInitialization();

  // Get the loaded server URL
  const serverUrl = getServerUrl();
  logger.debug('Background script initialized with server URL:', serverUrl);

  // Set initial connection status
  updateConnectionStatus(false);

  // Initialize Remote Config Manager
  await initializeRemoteConfig();

  logger.debug('Extension initialized successfully');

  // After initialization is complete, attempt connection and broadcast initial status immediately
  const checkInitialConnectionStatus = async () => {
    const serverUrl = getServerUrl();
    
    logger.debug(`Attempting initial connection to ${serverUrl} with transport: ${connectionType}`);
    
    // Try to connect to the server immediately
    let isConnected = false;
    try {
      await tryConnectToServer(serverUrl, connectionType);
      // After connection attempt, check if we're actually connected
      isConnected = await checkMcpServerConnection();
      logger.debug(`Initial connection attempt result: ${isConnected ? 'connected' : 'failed'}`);
    } catch (error) {
      logger.debug(`Initial connection attempt failed: ${error instanceof Error ? error.message : String(error)}`);
      isConnected = false;
    }
    
    // Update and broadcast the actual connection status
    updateConnectionStatus(isConnected);
    broadcastConnectionStatusToContentScripts(isConnected);
    
    logger.debug(`Initial connection status broadcast: ${isConnected ? 'connected' : 'disconnected'}`);
    
    // If connected, also broadcast tools
    if (isConnected) {
      try {
        logger.debug('[Background] Server connected, fetching and broadcasting initial tools...');
        const primitives = await getPrimitivesWithBackwardsCompatibility(serverUrl, false, connectionType);
        logger.debug(`Retrieved ${primitives.length} primitives for initial broadcast`);
        
        const tools = normalizeTools(primitives);
        logger.debug(`Broadcasting ${tools.length} normalized initial tools`);
        
        broadcastToolsUpdateToContentScripts(tools);
      } catch (error) {
        logger.warn('[Background] Error broadcasting initial tools:', error);
      }
    }
  };
  
  // Run the initial connection attempt immediately
  checkInitialConnectionStatus();
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
async function tryConnectToServer(uri: string, type: ConnectionType = connectionType): Promise<void> {
  if (isConnecting) {
    logger.debug('Connection attempt already in progress, skipping');
    return;
  }

  isConnecting = true;
  connectionAttemptCount++;

  logger.debug(
    `Attempting to connect to MCP server via ${type} (attempt ${connectionAttemptCount}/${MAX_CONNECTION_ATTEMPTS}): ${uri}`,
  );

  try {
    await runWithBackwardsCompatibility(uri, type);

    logger.debug('MCP client connected successfully');
    updateConnectionStatus(true);
    broadcastConnectionStatusToContentScripts(true);
    
    // Also broadcast available tools after successful connection
    try {
      logger.debug('[Background] Connection successful, fetching and broadcasting tools...');
      const primitives = await getPrimitivesWithBackwardsCompatibility(uri, true, type);
      logger.debug(`Retrieved ${primitives.length} primitives after connection`);
      
      const tools = normalizeTools(primitives);
      logger.debug(`Broadcasting ${tools.length} normalized tools after successful connection`);
      
      broadcastToolsUpdateToContentScripts(tools);
    } catch (toolsError) {
      logger.warn('[Background] Error broadcasting tools after connection:', toolsError);
    }
    
    connectionAttemptCount = 0; // Reset counter on success
  } catch (error: any) {
    const errorCategory = categorizeToolError(error instanceof Error ? error : new Error(String(error)));

    logger.warn(`MCP server connection failed (${errorCategory.category}): ${error.message || String(error)}`);
    logger.debug('Extension will continue to function with limited capabilities');

    // Only update connection status for actual connection errors
    if (errorCategory.isConnectionError) {
      updateConnectionStatus(false);
      broadcastConnectionStatusToContentScripts(false, error.message || String(error));
    } else {
      logger.debug('Error categorized as tool-related, not updating connection status');
    }

    // Schedule another attempt if we haven't reached the limit
    if (connectionAttemptCount < MAX_CONNECTION_ATTEMPTS) {
      const delayMs = Math.min(5000 * connectionAttemptCount, 15000); // Exponential backoff with cap
      logger.debug(`Scheduling next connection attempt in ${delayMs / 1000} seconds...`);

      setTimeout(() => {
        isConnecting = false; // Reset connecting flag
        tryConnectToServer(uri).catch(() => {}); // Try again
      }, delayMs);
    } else {
      logger.debug('Maximum connection attempts reached. Will try again during periodic check.');
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
    logger.debug(`Connection status changed: ${wasConnected} -> ${isConnected}`);
    broadcastConnectionStatusToContentScripts(isConnected);
    
    // If connected, also broadcast available tools
    if (isConnected) {
      try {
        logger.debug('[Background] Periodic check: Connection established, fetching and broadcasting tools...');
        const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), true, connectionType);
        logger.debug(`Periodic check: Retrieved ${primitives.length} primitives`);
        
        const tools = normalizeTools(primitives);
        logger.debug(`Periodic check: Broadcasting ${tools.length} normalized tools`);
        
        broadcastToolsUpdateToContentScripts(tools);
      } catch (error) {
        logger.warn('[Background] Error broadcasting tools after status change:', error);
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
    logger.debug('Periodic check: MCP server not connected, attempting to connect');
    const serverUrl = getServerUrl();
    
    // Reset the client's failure state periodically to prevent permanent disconnection
    // This is critical to fix the issue where only browser restart would work
    try {
      logger.debug('[Background] Resetting MCP client connection state for periodic recovery attempt');
      resetMcpConnectionStateForRecovery(); // Use recovery reset instead of full reset
    } catch (error) {
      logger.warn('[Background] Error resetting MCP connection state:', error);
    }
    
    tryConnectToServer(serverUrl, connectionType).catch(() => {});
  }
}, PERIODIC_CHECK_INTERVAL);

// Log active connections periodically
setInterval(() => {
  const connectionCount = getConnectionCount();
  if (connectionCount > 0) {
    logger.debug(`Active MCP content script connections: ${connectionCount}`);
  }
}, 60000);

// --- Error Handling ---
// Listen for unhandled errors in the service worker
// Note: This may not catch all async errors perfectly depending on how they propagate
self.addEventListener('unhandledrejection', event => {
  logger.error('Unhandled rejection in service worker:', event.reason);
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
  logger.error('Uncaught error in service worker:', event.error);
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

chrome.runtime.onInstalled.addListener(async details => {
  logger.debug('Extension installed or updated:', details.reason);
  sendAnalyticsEvent('extension_installed', { reason: details.reason });
  
  const currentVersion = chrome.runtime.getManifest().version;

  // Perform initial setup on first install
  if (details.reason === 'install') {
    logger.debug('Performing first-time installation setup.');
    
    // Set install date for Remote Config targeting
    await chrome.storage.local.set({ 
      installDate: new Date().toISOString(),
      version: currentVersion
    });
    
    // Initialize Remote Config after installation
    if (remoteConfigManager && remoteConfigManager.initialized) {
      await remoteConfigManager.fetchConfig(true);
    }
    
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion || 'unknown';
    logger.debug(`Extension updated from ${previousVersion} to ${currentVersion}`);
    
    // Store version information
    await chrome.storage.local.set({ 
      version: currentVersion,
      previousVersion: previousVersion,
      lastUpdateDate: new Date().toISOString()
    });
    
    // Notify Remote Config about version update
    if (remoteConfigManager && remoteConfigManager.initialized) {
      await remoteConfigManager.fetchConfig(true);
    }
    
    // Broadcast version update to content scripts
    setTimeout(() => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'app:version-updated',
              data: {
                oldVersion: previousVersion,
                newVersion: currentVersion,
                timestamp: Date.now()
              }
            }).catch(() => {
              // Ignore errors for tabs that can't receive messages
            });
          }
        });
      });
    }, 1000); // Delay to ensure content scripts are ready
  }

  // Re-initialize after install/update (optional, depending on setup)
  // initializeExtension().catch(err => logger.error("Error re-initializing after install:", err));
});

chrome.runtime.onStartup.addListener(() => {
  logger.debug('Browser startup detected.');
  sendAnalyticsEvent('browser_startup', {});
  // Re-check connection on startup
  initializeExtension().catch(err => logger.error('Error initializing on startup:', err));
});

// Start extension initialization
initializeExtension()
  .then(() => {
    logger.debug('Extension startup complete');
  })
  .catch(error => {
    logger.error('Error during extension initialization:', error);
    logger.debug('Extension will continue running with limited functionality');
  });

logger.debug('Background script loaded');
logger.debug("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// --- Enhanced Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Enhanced logging for debugging
  logger.debug('[Background] Received message:', {
    type: message.type || message.command,
    origin: message.origin || 'unknown',
    id: message.id,
    hasPayload: !!message.payload,
    from: sender.tab ? `tab-${sender.tab.id}` : 'extension'
  });

  // Handle MCP client connection status changes
  if (message.type === 'mcp:connection-status-changed' && message.origin === 'mcpclient') {
    logger.debug('[Background] Received connection status change from MCP client:', message.payload);
    
    // Update internal connection status
    const { isConnected, error } = message.payload;
    updateConnectionStatus(isConnected);
    
    // Broadcast the status change to all content scripts
    broadcastConnectionStatusToContentScripts(isConnected, error);
    
    // No response needed
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Legacy analytics bridge                                             */
  /* ------------------------------------------------------------------ */
  if (message.command === 'trackAnalyticsEvent') {
    if (message.eventName && message.eventParams) {
      sendAnalyticsEvent(message.eventName, message.eventParams)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logger.error('[Background] Error tracking analytics event from message:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true; // Async response
    }
    logger.warn('[Background] Invalid trackAnalyticsEvent message received:', message);
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

  /* ------------------------------------------------------------------ */
  /* Remote Config integration                                           */
  /* ------------------------------------------------------------------ */
  if (typeof message.type === 'string' && message.type.startsWith('remote-config:')) {
    // Handle Remote Config messages asynchronously
    handleRemoteConfigMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }

  // Fallback – message not handled here
  logger.debug('[Background] Message not handled, ignoring:', message.type || message.command);
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

    logger.debug(`Processing MCP message: ${messageType}`);

    switch (messageType) {
      case 'mcp:call-tool': {
        const { toolName, args } = payload as CallToolRequest;
        if (!toolName) {
          throw new Error('Tool name is required');
        }
        
        logger.debug(`Calling tool: ${toolName}`);
        result = await callToolWithBackwardsCompatibility(getServerUrl(), toolName, args || {});
        logger.debug(`Tool call completed: ${toolName}`);
        break;
      }

      case 'mcp:get-connection-status': {
        logger.debug('[Background] Getting current connection status');
        
        // Double-check the connection status to ensure accuracy
        const storedStatus = getConnectionStatus();
        const actualStatus = await checkMcpServerConnection();
        
        logger.debug(`Stored status: ${storedStatus}, Actual status: ${actualStatus}`);
        
        // Update stored status if they don't match
        if (storedStatus !== actualStatus) {
          logger.debug('[Background] Status mismatch detected, updating and broadcasting...');
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
        logger.debug(`Getting tools (forceRefresh: ${forceRefresh})`);
        
        try {
          const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), forceRefresh, connectionType);
          logger.debug(`Retrieved ${primitives.length} primitives from server`);
          
          // Use the helper function to normalize tools with proper schema handling
          const tools = normalizeTools(primitives);
          logger.debug(`Returning ${tools.length} normalized tools to content script`);
          
          result = tools;
        } catch (error) {
          logger.error('[Background] Error getting tools:', error);
          // Return empty array instead of throwing to prevent UI crashes
          result = [];
        }
        break;
      }

      case 'mcp:force-reconnect': {
        logger.debug('[Background] Force reconnect requested via context bridge');
        
        try {
          // Broadcast reconnection started status
          broadcastConnectionStatusToContentScripts(false, 'Reconnecting...');
          
          logger.debug('[Background] Starting force reconnection process...');
          
          // ENHANCED: Reset connection state before attempting reconnection
          // This ensures we don't get blocked by consecutive failure limits
          resetMcpConnectionState();
          
          // Set a reasonable timeout for the reconnection process
          const reconnectionPromise = forceReconnectToMcpServer(getServerUrl(), connectionType);
          const timeoutPromise = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Reconnection timeout after 20 seconds')), 20000)
          );
          
          await Promise.race([reconnectionPromise, timeoutPromise]);
          logger.debug('[Background] Force reconnect completed successfully');
          
          // Update connection status
          const isConnected = await checkMcpServerConnection();
          updateConnectionStatus(isConnected);
          
          // Broadcast the new status to all content scripts
          broadcastConnectionStatusToContentScripts(isConnected);
          
          // If connected, also refresh and broadcast tools
          if (isConnected) {
            try {
              logger.debug('[Background] Fetching tools after successful reconnection...');
              const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), true, connectionType);
              logger.debug(`Retrieved ${primitives.length} primitives after reconnection`);
              
              const tools = normalizeTools(primitives);
              logger.debug(`Broadcasting ${tools.length} normalized tools after reconnection`);
              
              broadcastToolsUpdateToContentScripts(tools);
            } catch (toolsError) {
              logger.error('[Background] Error fetching tools after reconnect:', toolsError);
            }
          }
          
          result = { isConnected, message: 'Reconnection completed' };
        } catch (error) {
          logger.error('[Background] Force reconnect failed:', error);
          
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
        const stored = await chrome.storage.local.get(['mcpServerUrl', 'mcpConnectionType']);
        const defaultUrl = connectionType === 'websocket' ? DEFAULT_WEBSOCKET_URL : DEFAULT_SSE_URL;
        result = { 
          uri: stored.mcpServerUrl || defaultUrl,
          connectionType: stored.mcpConnectionType || connectionType
        };
        break;
      }

      case 'mcp:update-server-config': {
        const { config } = payload;
        if (!config || typeof config.uri !== 'string') {
          throw new Error('Invalid server config: uri is required');
        }

        // Auto-detect connection type from URI if not specified
        let newType = config.connectionType as ConnectionType;
        logger.debug(`Received connection type: ${config.connectionType}, parsed as: ${newType}`);
        if (!newType) {
          try {
            const url = new URL(config.uri);
            newType = (url.protocol === 'ws:' || url.protocol === 'wss:') ? 'websocket' : 'sse';
          } catch {
            newType = connectionType; // fallback to current type
          }
        }
        logger.debug(`Updating server config to: ${config.uri} (${newType})`);
        
        // Update storage and background script state
        await chrome.storage.local.set({ 
          mcpServerUrl: config.uri,
          mcpConnectionType: newType
        });
        updateServerConfig(config.uri, newType);
        
        // Broadcast config update immediately
        broadcastConfigUpdateToContentScripts({ uri: config.uri, connectionType: newType });
        
        // Start async reconnection but don't block the response
        const reconnectPromise = (async () => {
          try {
            logger.debug('[Background] Starting async reconnection after config update...');
            await forceReconnectToMcpServer(config.uri, newType);
            const isConnected = await checkMcpServerConnection();
            updateConnectionStatus(isConnected);
            broadcastConnectionStatusToContentScripts(isConnected);
            logger.debug(`Async reconnection completed, connected: ${isConnected}`);
            
            // If connected, fetch and broadcast tools
            if (isConnected) {
              try {
                const primitives = await getPrimitivesWithBackwardsCompatibility(config.uri, true, newType);
                const tools = normalizeTools(primitives);
                broadcastToolsUpdateToContentScripts(tools);
                logger.debug(`Broadcasted ${tools.length} normalized tools after config update`);
              } catch (toolError) {
                logger.warn('[Background] Failed to fetch tools after config update:', toolError);
              }
            }
          } catch (error) {
            logger.warn('[Background] Async reconnect after config update failed:', error);
            const isConnected = await checkMcpServerConnection();
            updateConnectionStatus(isConnected);
            const errorMessage = error instanceof Error ? error.message : String(error);
            broadcastConnectionStatusToContentScripts(isConnected, errorMessage);
          }
        })();
        
        // Don't await the reconnection, just start it
        reconnectPromise.catch(error => {
          logger.error('[Background] Unhandled error in async reconnection:', error);
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
    logger.debug(`MCP message ${messageType} processed in ${processingTime}ms`);

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
    
    logger.error(`MCP message handling error (${processingTime}ms):`, error);
    
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
  
  logger.debug(`Broadcasting connection status: ${status} (connected: ${isConnected})`);
  
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
  logger.debug(`Broadcasting tools update to content scripts: ${tools.length} tools`);
  
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
function broadcastConfigUpdateToContentScripts(config: { uri: string; connectionType?: string }) {
  logger.debug(`Broadcasting config update to content scripts: ${config.uri}`);
  
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
 * Enhanced Remote Config message handler
 * 
 * @param message - The message received from the content script
 * @param sender - Chrome runtime message sender information
 * @param sendResponse - Callback function to send response back to sender
 */
async function handleRemoteConfigMessage(
  message: any, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response: any) => void
) {
  const startTime = Date.now();
  
  try {
    logger.debug(`Processing Remote Config message: ${message.type}`);
    
    if (!remoteConfigManager || !remoteConfigManager.initialized) {
      throw new Error('Remote Config Manager not initialized');
    }
    
    let result: any = null;

    switch (message.type) {
      case 'remote-config:fetch': {
        const { force = false } = message.payload || {};
        logger.debug(`Fetching remote config (force: ${force})`);
        await remoteConfigManager.fetchConfig(force);
        result = { success: true, timestamp: Date.now() };
        break;
      }

      case 'remote-config:get-feature-flag': {
        const { flagName } = message.payload || {};
        if (!flagName) {
          throw new Error('Feature flag name is required');
        }
        
        logger.debug(`Getting feature flag: ${flagName}`);
        result = await remoteConfigManager.getFeatureFlag(flagName);
        break;
      }

      case 'remote-config:get-config': {
        const { key } = message.payload || {};
        if (key) {
          logger.debug(`Getting specific config for key: ${key}`);
          result = await remoteConfigManager.getSpecificConfig(key);
        } else {
          logger.debug('[Background] Getting all remote config');
          result = await remoteConfigManager.getAllConfig();
        }
        //development
        // logger.debug('[Background] Remote config retrieved:', result);
        break;
      }

      case 'remote-config:get-status': {
        logger.debug('[Background] Getting remote config status');
        result = {
          initialized: remoteConfigManager.initialized,
          lastFetchTime: await remoteConfigManager.getLastFetchTimePublic(),
          timestamp: Date.now()
        };
        break;
      }

      case 'remote-config:clear-cache': {
        logger.debug('[Background] Clearing remote config cache and refreshing');
        const success = await remoteConfigManager.clearCacheAndRefresh();
        result = {
          success,
          timestamp: Date.now()
        };
        break;
      }

      default:
        throw new Error(`Unknown remote config message type: ${message.type}`);
    }

    // Send success response
    const response = {
      success: true,
      data: result,
      processingTime: Date.now() - startTime,
      timestamp: Date.now()
    };
    
    logger.debug(`Remote Config message processed successfully: ${message.type} (${response.processingTime}ms)`);
    sendResponse(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing Remote Config message ${message.type}:`, error);
    
    // Send error response
    const response = {
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime,
      timestamp: Date.now()
    };
    
    sendResponse(response);
  }
}

/**
 * Initialize Remote Config Manager
 */
async function initializeRemoteConfig(): Promise<void> {
  try {
    remoteConfigManager = new RemoteConfigManager();
    await remoteConfigManager.initialize();
    logger.debug('[Background] Remote Config Manager initialized successfully');
    
    // Make RemoteConfigManager globally accessible for testing
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).remoteConfigManager = remoteConfigManager;
      logger.debug('[Background] RemoteConfigManager is now accessible globally as window.remoteConfigManager');
    }
  } catch (error) {
    logger.error('[Background] Failed to initialize Remote Config Manager:', error);
    // Don't throw - let the extension continue without remote config
  }
}

