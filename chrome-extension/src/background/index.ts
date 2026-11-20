import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import { RemoteConfigManager } from './remote-config-manager';
import {
  runWithBackwardsCompatibility,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
  onMcpConnectionStatusChange,
  getMcpDiagnostics,
  callToolWithBackwardsCompatibility,
  getPrimitivesWithBackwardsCompatibility,
  resetMcpConnectionState,
  resetMcpConnectionStateForRecovery,
  normalizeToolsFromPrimitives as normalizeTools,
  createMcpClient,
  type TransportType,
  type ConnectionRequest
} from '../mcpclient/index';
import { telemetry, TELEMETRY_ALARM, HEARTBEAT_EVERY_MINUTES } from '../../utils/telemetry';
import { failReason, msBucket, proxyVersion, serverCount } from '../../utils/telemetry-core';
import type { DropCause } from '../../utils/telemetry-core';
import { telemetryStorage } from '@extension/storage';
import { getBrowserTools, executeBrowserTool, listTabsRaw, readTabRaw } from './browser-tools';
import { browserBridgeStorage } from '@extension/storage';
import { initCaptureFlow, handleContentReady } from './browser-tools/capture';

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
let mcpToolCount = 0;
let markConnectionChecked!: () => void;
const connectionChecked = new Promise<void>(resolve => (markConnectionChecked = resolve));

/**
 * Initialize server URL from Chrome storage
 * Replaces mcpInterface initialization functionality
 */
async function initializeServerConfig(): Promise<void> {
  try {
    const result = await chrome.storage.local.get<{ mcpServerUrl?: string; mcpConnectionType?: ConnectionType }>(['mcpServerUrl', 'mcpConnectionType']);
    
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
// Connection-health telemetry (in memory; a restarted worker simply records a fresh connect).
let connectedAt = 0;
let pendingConnectReport = false; // sent with the tool list, once it is known
let nextDropCause: DropCause | undefined;
let lastProxyVersion = 'unknown';

function updateConnectionStatus(status: boolean): void {
  if (status && !isConnected) {
    void telemetry.connected(connectionType);
    connectedAt = Date.now();
    pendingConnectReport = true;
  }
  if (!status && isConnected) {
    void telemetry.conn.dropped({
      transport: connectionType,
      proxyVersion: lastProxyVersion,
      cause: nextDropCause ?? 'other',
      connectedMs: Date.now() - connectedAt,
      inFlight: getMcpDiagnostics().inFlight,
    });
  }
  nextDropCause = undefined;
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
  
  // Run the initial connection attempt immediately; the telemetry heartbeat waits for it
  checkInitialConnectionStatus().finally(markConnectionChecked);
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
    isConnecting = false; // Left true, the periodic check skipped forever and never noticed a lost server.
  } catch (error: any) {
    const errorCategory = categorizeToolError(error instanceof Error ? error : new Error(String(error)));

    logger.warn(`MCP server connection failed (${errorCategory.category}): ${error.message || String(error)}`);
    void telemetry.conn.connectFailed({ transport: type, message: error?.message, attempt: connectionAttemptCount });
    logger.debug('Extension will continue to function with limited capabilities');

    // Only update connection status for actual connection errors
    if (errorCategory.isConnectionError) {
      // An unreachable server is "disconnected", not an error (WebSocket said "Error" while SSE said "Disconnected").
      updateConnectionStatus(false);
      broadcastConnectionStatusToContentScripts(false);
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

/** Applies a health result: on a change, store it, tell the pages, and on a drop start reconnecting. */
function applyStatus(ok: boolean, cause?: DropCause): void {
  if (ok === getConnectionStatus()) return;
  if (!ok) nextDropCause = cause;
  logger.debug(`Connection status changed: ${!ok} -> ${ok}`);
  updateConnectionStatus(ok);
  broadcastConnectionStatusToContentScripts(ok);
  if (!ok && !isConnecting) {
    connectionAttemptCount = 0;
    tryConnectToServer(getServerUrl(), connectionType).catch(() => {});
  }
}

// The client reports drops it noticed itself (WebSocket close, failed call): show them now, not at the next check.
// Connects and deliberate disconnects are handled by their callers, so only drops are acted on.
onMcpConnectionStatusChange(event => {
  if (!event.dropped) return;
  logger.debug('[Background] Connection dropped:', event.detail);
  applyStatus(false, /websocket/i.test(event.detail ?? '') ? 'socket_closed' : 'call_lost');
});

// One health check at a time; everyone asking while it runs shares it.
let lastHealthCheckAt = 0;
let healthCheckInFlight: Promise<boolean> | null = null;
function checkHealth(): Promise<boolean> {
  healthCheckInFlight ??= checkMcpServerConnection()
    .then(ok => {
      lastHealthCheckAt = Date.now();
      // also covers a check that finishes after the caller stopped waiting
      applyStatus(ok, getMcpDiagnostics().lastHealthFailure === 'timeout' ? 'health_timeout' : 'health_unreachable');
      return ok;
    })
    .finally(() => {
      healthCheckInFlight = null;
    });
  return healthCheckInFlight;
}

/**
 * Status for content scripts. Timers do not run while the worker is asleep, so the cached flag can lag:
 * if the last real check is old, run one now (bounded, so heartbeats stay inside their 5s timeout).
 */
const STATUS_MAX_AGE = 10000;
const STATUS_WAIT = 4000;
async function getFreshConnectionStatus(): Promise<boolean> {
  if (isConnecting || Date.now() - lastHealthCheckAt < STATUS_MAX_AGE) return getConnectionStatus();
  const wait = new Promise<boolean>(resolve => setTimeout(() => resolve(getConnectionStatus()), STATUS_WAIT));
  return Promise.race([checkHealth(), wait]);
}

// Set up a periodic connection check with enhanced recovery logic
const PERIODIC_CHECK_INTERVAL = 15000; // real ping each time, so a stopped proxy shows within ~15s
setInterval(async () => {
  if (isConnecting) {
    return; // Skip if already connecting
  }

  // checkHealth applies a change (store, broadcast, start reconnect) itself.
  const wasConnected = getConnectionStatus();
  const isConnected = await checkHealth();

  if (isConnected && !wasConnected) {
    // Came back without tryConnectToServer: also hand the pages the tools.
    try {
      const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), true, connectionType);
      broadcastToolsUpdateToContentScripts(normalizeTools(primitives));
    } catch (error) {
      logger.warn('[Background] Error broadcasting tools after status change:', error);
    }
  } else if (wasConnected === isConnected) {
    // Keep content scripts in sync even when nothing changed.
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
// Telemetry gets a code only, never the message or stack.
self.addEventListener('unhandledrejection', event => {
  logger.error('Unhandled rejection in service worker:', event.reason);
  void telemetry.error('sw_unhandled');
});

self.addEventListener('error', event => {
  logger.error('Uncaught error in service worker:', event.error);
  void telemetry.error('sw_unhandled');
});

// --- Lifecycle Events ---

chrome.runtime.onInstalled.addListener(async details => {
  logger.debug('Extension installed or updated:', details.reason);
  void telemetry.installed(details.reason, details.previousVersion);

  const currentVersion = chrome.runtime.getManifest().version;
  const installDate = new Date().toISOString();

  // Perform initial setup on first install
  if (details.reason === 'install') {
    logger.debug('Performing first-time installation setup.');

    await chrome.storage.local.set({ installDate, version: currentVersion });

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
    markConnectionChecked();
  });

// --- Telemetry: daily heartbeat + rollup, once the initial connection check has settled ---
const telemetryTick = () =>
  connectionChecked.then(() => telemetry.tick({ connected: isConnected, transport: connectionType, tools: mcpToolCount }));
void telemetryTick();
void telemetry.setUninstallUrl();
telemetryStorage.subscribe(() => void telemetry.setUninstallUrl());
chrome.alarms.get(TELEMETRY_ALARM).then(a => {
  // Re-creating on every worker start would reset the period, so only create it once.
  if (!a) void chrome.alarms.create(TELEMETRY_ALARM, { periodInMinutes: HEARTBEAT_EVERY_MINUTES });
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === TELEMETRY_ALARM) void telemetryTick();
void telemetry.setUninstallUrl();
telemetryStorage.subscribe(() => void telemetry.setUninstallUrl());
});

logger.debug('Background script loaded');
logger.debug("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// --- Browser Bridge wiring ---
initCaptureFlow();

// When browser-bridge settings change (e.g. tools toggled on/off), re-broadcast the
// merged tool list so the sidebar reflects the new toggle immediately.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['browser-bridge-settings']) return;
  (async () => {
    let mcpTools: any[] = [];
    if (isMcpServerConnected()) {
      try {
        const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), false, connectionType);
        mcpTools = normalizeTools(primitives);
      } catch (error) {
        logger.warn('[Background] Could not refresh MCP tools on settings change:', error);
      }
    }
    broadcastToolsUpdateToContentScripts(mcpTools);
  })().catch(err => logger.error('[Background] Error broadcasting tools on settings change:', err));
});

// Granting browser access (from Settings or the access window) turns the AI browser tools on;
// the user can still switch either toggle off afterwards.
chrome.permissions.onAdded.addListener(p => {
  if (!p.origins?.includes('<all_urls>')) return;
  void browserBridgeStorage.set(s => ({ ...s, browserToolsEnabled: true, browserControlEnabled: true }));
});

let grantWindowId: number | undefined;

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

  // Browser Bridge: content script announcing it's ready to receive a queued capture
  if (message.type === 'browser-bridge:content-ready') {
    handleContentReady(sender, sendResponse);
    return true; // Async response
  }

  // Browser Bridge: user-initiated tab picker (NOT an AI tool call; not gated on browserToolsEnabled).
  // Still enforces denylist / excluded hosts / <all_urls> via the shared raw helpers.
  if (message.type === 'browser-bridge:list-tabs') {
    (async () => {
      const { domainDenylist } = await browserBridgeStorage.get();
      const [tabs, hasAllUrls] = await Promise.all([
        listTabsRaw(domainDenylist),
        chrome.permissions.contains({ origins: ['<all_urls>'] }),
      ]);
      sendResponse({ success: true, tabs, senderTabId: sender.tab?.id, hasAllUrls });
    })().catch(e => sendResponse({ success: false, error: String(e) }));
    return true; // Async response
  }

  if (message.type === 'browser-bridge:get-tab-content') {
    const { tabId, maxChars } = message.payload ?? {};
    readTabRaw(Number(tabId), { maxChars })
      .then(r => {
        if (r.ok) void telemetry.record('tab_attach', sender.url ?? sender.tab?.url);
        sendResponse(
          r.ok
            ? { success: true, title: r.title, url: r.url, content: r.content, truncated: r.truncated }
            : { success: false, error: r.error, needsPermission: r.needsPermission },
        );
      })
      .catch(e => sendResponse({ success: false, error: String(e) }));
    return true; // Async response
  }

  // Content scripts can't call chrome.permissions.request, so open a small extension window
  // centered over the sender's window; one click there brings up Chrome's own prompt.
  // Firefox only: usage statistics need the browser's data consent, which updaters were never asked for.
  if (message.type === 'telemetry:consent-needed') {
    (async () => {
      const perms = (await chrome.permissions.getAll()) as { data_collection?: string[] };
      const { consentPromptDismissed } = await chrome.storage.local.get('consentPromptDismissed');
      const needed =
        !!perms.data_collection &&
        !perms.data_collection.includes('technicalAndInteraction') &&
        (await telemetryStorage.get()).enabled &&
        !consentPromptDismissed;
      sendResponse({ needed });
    })().catch(() => sendResponse({ needed: false }));
    return true;
  }
  if (message.type === 'telemetry:consent-dismiss') {
    void chrome.storage.local.set({ consentPromptDismissed: true });
    return false;
  }

  if (message.type === 'browser-bridge:request-access' || message.type === 'telemetry:request-consent') {
    const page = message.type === 'telemetry:request-consent' ? '#consent' : '#grant';
    (async () => {
      // Re-clicking "Allow access" focuses the open window instead of stacking another.
      if (grantWindowId !== undefined) {
        try {
          await chrome.windows.update(grantWindowId, { focused: true });
          return;
        } catch {
          grantWindowId = undefined; // closed since
        }
      }
      const width = 420;
      const height = 280;
      const parent = sender.tab ? await chrome.windows.get(sender.tab.windowId) : undefined;
      const left = parent?.left !== undefined ? Math.round(parent.left + ((parent.width ?? width) - width) / 2) : undefined;
      const top = parent?.top !== undefined ? Math.round(parent.top + ((parent.height ?? height) - height) / 3) : undefined;
      const win = await chrome.windows.create({
        url: chrome.runtime.getURL(`options/index.html${page}`),
        type: 'popup',
        width,
        height,
        left,
        top,
        focused: true,
      });
      grantWindowId = win?.id;
    })().catch(e => logger.warn('[Background] Could not open access window:', e));
    return false;
  }

  // Usage statistics from content scripts: only these features; the site comes from the sender URL.
  if (message.type === 'telemetry') {
    const where = sender.url ?? sender.tab?.url;
    if (sender.tab && ['auto_execute', 'chip', 'sidebar'].includes(message.feature)) {
      void telemetry.record(message.feature, where);
    } else if (sender.tab && message.feature === 'instructions') {
      void telemetry.instructions(where);
    } else if (sender.tab && message.feature === 'card') {
      void telemetry.card(where);
    } else if (sender.tab && message.feature === 'setup_copy') {
      void telemetry.setupCopied(where);
    }
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
        const { toolName, args, adapterName } = payload as CallToolRequest & { adapterName?: string };
        if (!toolName) {
          throw new Error('Tool name is required');
        }

        // Virtual browser tools execute locally in the background, not over MCP.
        const isBrowserTool = toolName.startsWith('browser_');
        const where = sender.url ?? sender.tab?.url;
        const callStart = Date.now();
        const callCtx = () => ({ transport: connectionType, proxy_version: lastProxyVersion, duration: msBucket(Date.now() - callStart) });
        try {
          if (isBrowserTool) {
            logger.debug(`Executing local browser tool: ${toolName}`);
            result = await executeBrowserTool(toolName, args || {}, sender);
          } else {
            logger.debug(`Calling tool: ${toolName} from adapter: ${adapterName || 'unknown'}`);
            result = await callToolWithBackwardsCompatibility(getServerUrl(), toolName, args || {}, adapterName);
          }
          logger.debug(`Tool call completed: ${toolName}`);
        } catch (error) {
          const reason = failReason(error instanceof Error ? error.message : String(error));
          if (!isBrowserTool) void telemetry.conn.toolCall({ ok: false, reason, ms: Date.now() - callStart });
          void telemetry
            .toolRun(isBrowserTool, false, where)
            .then(() => telemetry.error('tool_failed', where, reason, isBrowserTool ? {} : callCtx()));
          throw error;
        }
        const toolOk = result?.isError !== true;
        if (!isBrowserTool)
          void telemetry.conn.toolCall({ ok: toolOk, reason: toolOk ? undefined : 'tool_error', ms: Date.now() - callStart });
        void telemetry
          .toolRun(isBrowserTool, toolOk, where)
          .then(() => (toolOk ? undefined : telemetry.error('tool_failed', where, 'tool_error', isBrowserTool ? {} : callCtx())));
        break;
      }

      case 'mcp:get-connection-status': {
        logger.debug('[Background] Getting current connection status');
        
        // Double-check the connection status to ensure accuracy
        const actualStatus = await getFreshConnectionStatus(); // applies and broadcasts a change itself
        
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

        let mcpTools: any[] = [];
        try {
          const primitives = await getPrimitivesWithBackwardsCompatibility(getServerUrl(), forceRefresh, connectionType);
          logger.debug(`Retrieved ${primitives.length} primitives from server`);

          // Use the helper function to normalize tools with proper schema handling
          mcpTools = normalizeTools(primitives);
          logger.debug(`Returning ${mcpTools.length} normalized tools to content script`);
        } catch (error) {
          logger.error('[Background] Error getting tools:', error);
          // Keep going with an empty MCP list so virtual browser tools still surface.
          mcpTools = [];
        }

        // Merge virtual browser tools (gated on browserToolsEnabled) even when MCP is down.
        const browserTools = await getBrowserTools();
        result = [...mcpTools, ...browserTools];
        break;
      }

      case 'mcp:force-reconnect': {
        logger.debug('[Background] Force reconnect requested via context bridge');
        void telemetry.conn.manualReconnect();
        
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
          pendingConnectReport ||= isConnected; // report the (possibly new) proxy version and tool count

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
          void telemetry.conn.connectFailed({
            transport: connectionType,
            message: error instanceof Error ? error.message : String(error),
            attempt: 1,
          });
          
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
        const stored = await chrome.storage.local.get<{ mcpServerUrl?: string; mcpConnectionType?: ConnectionType }>(['mcpServerUrl', 'mcpConnectionType']);
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
            void telemetry.conn.manualReconnect();
            await forceReconnectToMcpServer(config.uri, newType);
            const isConnected = await checkMcpServerConnection();
            updateConnectionStatus(isConnected);
            pendingConnectReport ||= isConnected;
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
            void telemetry.conn.connectFailed({
              transport: newType,
              message: error instanceof Error ? error.message : String(error),
              attempt: 1,
            });
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
        const isConnected = await getFreshConnectionStatus();
        
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
async function broadcastToolsUpdateToContentScripts(mcpTools: any[]) {
  mcpToolCount = mcpTools.length;
  if (isConnected) void telemetry.toolsListed(connectionType, mcpTools.length);
  if (isConnected && pendingConnectReport) {
    pendingConnectReport = false;
    const d = getMcpDiagnostics();
    lastProxyVersion = proxyVersion(d.serverName, d.serverVersion);
    void telemetry.conn.connected({
      transport: connectionType,
      proxyVersion: lastProxyVersion,
      tools: mcpTools.length,
      servers: serverCount(mcpTools.map(t => String(t?.name ?? ''))),
    });
  }
  // Always fold in the virtual browser tools (gated internally on settings).
  const browserTools = await getBrowserTools();
  const tools = [...mcpTools, ...browserTools];
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

