import { logMessage } from './helpers';
import type { ToolCallCallback, ConnectionStatusCallback, ToolCallRequest } from '../types/mcp';
import { Primitive } from '../types/mcp';

/**
 * Class that handles communication with the background script for MCP tool calls
 */
class McpHandler {
  private static instance: McpHandler | null = null;
  private port: chrome.runtime.Port | null = null;
  private connectionId: string = '';
  private isConnected: boolean = false;
  private pendingRequests: Map<string, ToolCallRequest> = new Map();
  private connectionStatusCallbacks: Set<ConnectionStatusCallback> = new Set();
  private broadcastToolUpdateCallbacks: Set<(primitives: any[]) => void> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 2000;
  private reconnectTimeoutId: number | null = null;
  private isReconnecting: boolean = false;
  // private lastConnectionCheck: number = 0; // Removed, heartbeat is primary
  // private connectionCheckInterval: number = 15000; // Removed
  // private connectionCheckTimeoutId: number | null = null; // Removed
  private heartbeatInterval: number | null = null;
  private heartbeatFrequency: number = 10000;
  private lastHeartbeatResponse: number = 0;
  private heartbeatTimeoutThreshold: number = 15000;
  private pendingRequestTimeoutMs: number = 30000;
  private staleRequestCleanupInterval: number | null = null;
  private extensionContextValid: boolean = true;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.connectionId = `mcp-connection-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Start with a clean initialization - don't connect immediately
    // Just set up the handlers and let the first visibility check or manual action connect

    // Listen for page visibility changes to reconnect if needed
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.extensionContextValid) {
        if (!this.port) {
          logMessage('[MCP Handler] Page became visible and port is not connected, attempting to connect.');
          this.connect(); // Attempt to connect if no port
        } else {
          // If port exists, heartbeat will take care of checking.
          // Optionally, could send an explicit CHECK_CONNECTION here if desired,
          // but let's rely on heartbeat first.
          logMessage('[MCP Handler] Page became visible, port exists. Heartbeat will validate.');
        }
      }
    });

    // Start cleanup of stale requests
    this.startStaleRequestCleanup();

    // Attempt initial connection with a small delay to ensure extension is ready
    setTimeout(() => {
      this.connect();
      // Heartbeat will be started by connect() on successful connection
    }, 500);

    logMessage('[MCP Handler] Initialized');
  }

  /**
   * Get the singleton instance of McpHandler
   */
  public static getInstance(): McpHandler {
    if (!McpHandler.instance) {
      McpHandler.instance = new McpHandler();
    }
    return McpHandler.instance;
  }

  /**
   * Periodic connection check via `startConnectionCheck` has been removed.
   * Heartbeat and `onDisconnect` are the primary mechanisms for connection maintenance.
   */

  /**
   * Start cleanup interval for stale pending requests
   */
  private startStaleRequestCleanup(): void {
    if (this.staleRequestCleanupInterval !== null) {
      window.clearInterval(this.staleRequestCleanupInterval);
    }

    this.staleRequestCleanupInterval = window.setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;

      this.pendingRequests.forEach((request, requestId) => {
        if (now - request.timestamp > this.pendingRequestTimeoutMs) {
          // Request has timed out, notify the callback
          try {
            request.callback(null, 'Request timed out');
          } catch (error) {
            logMessage(
              `[MCP Handler] Error in timeout callback for ${requestId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          // Delete the request
          this.pendingRequests.delete(requestId);
          expiredCount++;
        }
      });

      if (expiredCount > 0) {
        logMessage(`[MCP Handler] Cleaned up ${expiredCount} stale requests`);
      }
    }, 10000); // Check for stale requests every 10 seconds
  }

  /**
   * Start heartbeat to keep connection alive and detect disconnections early
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.heartbeatInterval = window.setInterval(() => {
      // If extension context is invalid, stop heartbeat
      if (!this.extensionContextValid) {
        this.stopHeartbeat();
        return;
      }

      if (!this.port) {
        // If we don't have a port, and heartbeat is still running,
        // it means we are in a disconnected state. Connect should have been
        // scheduled by onDisconnect or another mechanism. Heartbeat should just wait.
        logMessage('[MCP Handler] No port in heartbeat, waiting for reconnection.');
        return;
      }

      // Calculate time since last heartbeat response
      const timeSinceLastHeartbeat = this.lastHeartbeatResponse > 0 ? Date.now() - this.lastHeartbeatResponse : 0;

      // If we haven't received a heartbeat response in too long, reconnect
      if (this.lastHeartbeatResponse > 0 && timeSinceLastHeartbeat > this.heartbeatTimeoutThreshold) {
        logMessage(`[MCP Handler] Heartbeat timeout: No response in ${timeSinceLastHeartbeat}ms, reconnecting`);
        this.disconnect(false);
        this.connect();
        return;
      }

      // Send heartbeat
      try {
        this.port.postMessage({
          type: 'HEARTBEAT',
          timestamp: Date.now(),
        });
        // logMessage('[MCP Handler] Sent heartbeat');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`[MCP Handler] Error sending heartbeat: ${errorMessage}`);

        // Check for extension context invalidation
        if (errorMessage.includes('Extension context invalidated')) {
          this.handleExtensionContextInvalidated();
          return;
        }

        // Try to reconnect on heartbeat error
        this.disconnect(false);
        this.connect();
      }
    }, this.heartbeatFrequency);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logMessage('[MCP Handler] Heartbeat stopped');
    }
  }

  /**
   * Handle extension context invalidation
   * This is a special case when the extension is being reloaded/updated
   */
  private handleExtensionContextInvalidated(): void {
    logMessage('[MCP Handler] Extension context invalidated, stopping reconnection attempts');
    this.extensionContextValid = false;
    this.isConnected = false;
    this.notifyConnectionStatus();

    // Clean up all intervals and timeouts
    this.stopHeartbeat();

    // connectionCheckTimeoutId was removed
    // if (this.connectionCheckTimeoutId !== null) {
    //   window.clearTimeout(this.connectionCheckTimeoutId);
    //   this.connectionCheckTimeoutId = null;
    // }

    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.staleRequestCleanupInterval !== null) {
      window.clearInterval(this.staleRequestCleanupInterval);
      this.staleRequestCleanupInterval = null;
    }

    // Fail all pending requests
    this.pendingRequests.forEach(request => {
      try {
        request.callback(null, 'Extension context invalidated');
      } catch (callbackError) {
        // Ignore errors in callbacks
      }
    });
    this.pendingRequests.clear();

    this.port = null;
    this.isReconnecting = false;
  }

  /**
   * Connect to the background script
   */
  private connect(): void {
    try {
      // Don't attempt connection if context is invalid
      if (!this.extensionContextValid) {
        logMessage('[MCP Handler] Extension context invalid, skipping connection attempt');
        return;
      }

      if (this.isReconnecting) {
        logMessage('[MCP Handler] Already reconnecting, skipping connect request');
        return;
      }

      this.isReconnecting = true;

      this.disconnect(false);

      logMessage(`[MCP Handler] Connecting to background script with ID: ${this.connectionId}`);

      try {
        this.port = chrome.runtime.connect({ name: this.connectionId });
      } catch (connectError) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);

        if (errorMessage.includes('Extension context invalidated')) {
          this.handleExtensionContextInvalidated();
          return;
        }

        throw connectError; // Re-throw for the outer catch block
      }

      this.port.onMessage.addListener(message => this.handleMessage(message));

      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        const errorMessage = error ? error.message || 'Unknown error' : 'No error provided';

        if (error) {
          logMessage(`[MCP Handler] Connection error: ${errorMessage}`);

          if (errorMessage.includes('Extension context invalidated')) {
            this.handleExtensionContextInvalidated();
            return;
          }
        }

        logMessage('[MCP Handler] Disconnected from background script');
        this.port = null;
        this.isConnected = false;
        this.notifyConnectionStatus();

        // Always try to reconnect regardless of isReconnecting flag, but check if we should
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.extensionContextValid) {
          this.scheduleReconnect();
        } else {
          logMessage('[MCP Handler] Maximum reconnect attempts reached, giving up automatic reconnection');
          this.isReconnecting = false;
        }
      });

      // Removed explicit checkConnectionStatus() call from here.
      // Port listeners are set up; successful connection is determined by messages or disconnect.
      // this.checkConnectionStatus();

      this.lastHeartbeatResponse = Date.now(); // Initialize heartbeat tracker
      // lastConnectionCheck was removed

      this.isReconnecting = false;
      this.startHeartbeat(); // Start heartbeat on successful connection

      logMessage('[MCP Handler] Connected to background script');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[MCP Handler] Failed to connect: ${errorMessage}`);

      if (errorMessage.includes('Extension context invalidated')) {
        this.handleExtensionContextInvalidated();
        return;
      }

      this.isReconnecting = false;

      if (this.extensionContextValid) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from the background script
   * @param clearReconnect Whether to clear reconnect attempts
   */
  private disconnect(clearReconnect: boolean = true): void {
    this.stopHeartbeat(); // Stop heartbeat whenever disconnecting

    if (this.port) {
      try {
        this.port.disconnect();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.port = null;
    }

    if (clearReconnect && this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    // Don't schedule reconnects if extension context is invalid
    if (!this.extensionContextValid) {
      return;
    }

    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logMessage('[MCP Handler] Maximum reconnect attempts reached, giving up');
      this.isReconnecting = false;
      return;
    }

    this.reconnectAttempts++;
    // Use a gentler backoff strategy: base delay * (1.2^attempts) instead of 1.5
    const delay = this.reconnectDelay * Math.pow(1.2, this.reconnectAttempts - 1);

    logMessage(
      `[MCP Handler] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, delay);
  }

  /**
   * Check the connection status with the background script
   * This performs both a check of the port itself and sends a message to verify
   * the background service can respond.
   * This is now primarily for an explicit check if needed, e.g. on visibility change,
   * but not part of a periodic timer.
   */
  private checkConnectionStatus(): void {
    if (!this.extensionContextValid) {
      logMessage('[MCP Handler] checkConnectionStatus: Context invalid.');
      return;
    }

    if (this.port) {
      logMessage('[MCP Handler] checkConnectionStatus: Port exists, sending CHECK_CONNECTION.');
      try {
        this.port.postMessage({ type: 'CHECK_CONNECTION', forceCheck: true, timestamp: Date.now() });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`[MCP Handler] Error sending connection check (during checkConnectionStatus): ${errorMessage}`);
        if (errorMessage.includes('Extension context invalidated')) {
          this.handleExtensionContextInvalidated();
          return;
        }
        // If postMessage fails, port is likely dead. Disconnect and scheduleReconnect.
        this.port = null; // Mark port as null before calling disconnect
        this.disconnect(false); // Don't clear reconnect attempts here, scheduleReconnect will handle it
        this.scheduleReconnect();
      }
    } else if (!this.isReconnecting) {
      logMessage('[MCP Handler] checkConnectionStatus: No port and not reconnecting, attempting to connect.');
      this.connect();
    } else {
      logMessage('[MCP Handler] checkConnectionStatus: No port but already reconnecting.');
    }
  }

  /**
   * Handle messages from the background script
   */
  private handleMessage(message: any): void {
    logMessage(`[MCP Handler] Received message: ${message.type}`);

    // Update the heartbeat response time for any message received
    this.lastHeartbeatResponse = Date.now();

    switch (message.type) {
      case 'HEARTBEAT_RESPONSE':
        // Just a heartbeat response, no need to do anything other than update lastHeartbeatResponse
        break;

      case 'CONNECTION_STATUS':
        this.isConnected = message.isConnected;
        logMessage(`[MCP Handler] Connection status updated to: ${message.isConnected ? 'Connected' : 'Disconnected'}`);
        this.notifyConnectionStatus();
        break;

      case 'TOOL_CALL_RESULT':
        this.handleToolCallResult(message.requestId, message.result);
        break;

      case 'TOOL_CALL_STATUS':
        // Could handle intermediate status updates here
        break;

      case 'RECONNECT_STATUS':
        // Handle reconnect status updates
        if (message.hasOwnProperty('isConnected')) {
          this.isConnected = message.isConnected;
          logMessage(
            `[MCP Handler] Reconnect status updated connection to: ${message.isConnected ? 'Connected' : 'Disconnected'}`,
          );
          this.notifyConnectionStatus();
        }
        break;

      case 'TOOL_DETAILS_RESULT':
        // Check if this is a broadcast update (special requestId)
        if (message.requestId === 'broadcast-tools-update') {
          logMessage(`[MCP Handler] Received broadcast tools update with ${message.result?.length || 0} tools`);
          // Notify all broadcast tool update callbacks
          this.notifyBroadcastToolUpdate(message.result || []);

          // Find any pending requests for tool details and resolve them with the broadcast data
          this.pendingRequests.forEach((request, reqId) => {
            if (reqId.startsWith('tool-details-')) {
              logMessage(`[MCP Handler] Resolving pending tool details request ${reqId} with broadcast data`);
              request.callback(message.result);
              this.pendingRequests.delete(reqId);
            }
          });
        } else {
          // Handle normal tool details result
          this.handleToolDetailsResult(message.requestId, message.result);
        }
        break;

      case 'RECONNECT_RESULT':
        this.handleReconnectResult(message.requestId, message.success, message.isConnected);
        break;

      case 'SERVER_CONFIG_RESULT':
        this.handleServerConfigResult(message.requestId, message.config);
        break;

      case 'UPDATE_SERVER_CONFIG_RESULT':
        this.handleUpdateServerConfigResult(message.requestId, message.success);
        break;

      case 'ERROR':
        this.handleError(message);
        break;

      default:
        logMessage(`[MCP Handler] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle tool call results from the background script
   */
  private handleToolCallResult(requestId: string, result: any): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      logMessage(`[MCP Handler] Tool call ${requestId} completed successfully`);
      request.callback(result);
      this.pendingRequests.delete(requestId);
    } else {
      logMessage(`[MCP Handler] Received result for unknown request: ${requestId}`);
    }
  }

  /**
   * Handle tool details results from the background script
   */
  private handleToolDetailsResult(requestId: string, result: any): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      logMessage(`[MCP Handler] Tool details request ${requestId} completed successfully`);
      request.callback(result);
      this.pendingRequests.delete(requestId);
    } else {
      logMessage(`[MCP Handler] Received tool details for unknown request: ${requestId}`);
    }
  }

  /**
   * Handle reconnect results from the background script
   */
  private handleReconnectResult(requestId: string, success: boolean, isConnected: boolean): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      logMessage(`[MCP Handler] Reconnect request ${requestId} completed with success: ${success}`);

      this.isConnected = isConnected;
      this.notifyConnectionStatus();

      request.callback({ success, isConnected });
      this.pendingRequests.delete(requestId);
    } else {
      logMessage(`[MCP Handler] Received reconnect result for unknown request: ${requestId}`);
    }
  }

  /**
   * Handle server config results from the background script
   */
  private handleServerConfigResult(requestId: string, config: any): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      logMessage(`[MCP Handler] Server config request ${requestId} completed successfully`);
      request.callback(config);
      this.pendingRequests.delete(requestId);
    } else {
      logMessage(`[MCP Handler] Received server config for unknown request: ${requestId}`);
    }
  }

  /**
   * Handle update server config results from the background script
   */
  private handleUpdateServerConfigResult(requestId: string, success: boolean): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      logMessage(`[MCP Handler] Update server config request ${requestId} completed with success: ${success}`);
      request.callback({ success });
      this.pendingRequests.delete(requestId);
    } else {
      logMessage(`[MCP Handler] Received update server config result for unknown request: ${requestId}`);
    }
  }

  /**
   * Handle errors from the background script
   */
  private handleError(message: any): void {
    const { errorType, errorMessage, requestId } = message;

    logMessage(`[MCP Handler] Error: ${errorType} - ${errorMessage}`);

    // Enhanced detection of server-related errors with specific categorization
    const isServerRelatedError =
      errorType === 'RECONNECT_ERROR' ||
      errorType === 'CONNECTION_ERROR' ||
      errorType === 'SERVER_ERROR' ||
      errorType === 'SERVER_CONNECTION_ERROR' ||
      errorType === 'TIMEOUT_ERROR' ||
      errorType === 'PERMANENT_CONNECTION_FAILURE' ||
      errorType === 'SERVER_UNAVAILABLE' ||
      errorMessage.includes('Server') ||
      errorMessage.includes('server') ||
      errorMessage.includes('not available') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('unavailable') ||
      errorMessage.includes('404') ||
      errorMessage.includes('403') ||
      errorMessage.includes('500') ||
      errorMessage.includes('Connection refused') ||
      errorMessage.includes('not found');

    // Tool-specific errors that should NOT trigger connection status changes
    const isToolSpecificError =
      errorType === 'TOOL_NOT_FOUND' ||
      errorType === 'TOOL_CALL_ERROR' ||
      errorType === 'INVALID_ARGS' ||
      (errorMessage.includes('Tool') && errorMessage.includes('not found')) ||
      errorMessage.includes('not found in cached primitives') ||
      errorMessage.includes('MCP error -32602') ||
      errorMessage.includes('MCP error -32601') ||
      errorMessage.includes('MCP error -32600');

    // Only update connection status for actual server/connection errors, not tool errors
    if (isServerRelatedError && !isToolSpecificError) {
      logMessage(
        `[MCP Handler] Server-related error detected (${errorType}), updating connection status to disconnected`,
      );
      this.isConnected = false;
      this.notifyConnectionStatus();
    } else if (isToolSpecificError) {
      logMessage(`[MCP Handler] Tool-specific error detected (${errorType}), maintaining current connection status`);
      // Don't change connection status for tool-specific errors
    }

    if (requestId) {
      const request = this.pendingRequests.get(requestId);
      if (request) {
        logMessage(`[MCP Handler] Calling error callback for request: ${requestId}`);

        // Transform tool-specific error messages to be more user-friendly
        let userFriendlyError = errorMessage;
        if (
          errorMessage.includes('not found in cached primitives') ||
          errorMessage.includes('Tool not found') ||
          errorType === 'TOOL_NOT_FOUND'
        ) {
          // Extract tool name from the error message if possible
          const toolNameMatch = errorMessage.match(/Tool '([^']+)'/);
          const toolName = toolNameMatch ? toolNameMatch[1] : 'requested tool';
          userFriendlyError = `Tool '${toolName}' is not found in the current MCP Server. Check the list of available tools in the sidebar.`;
        }

        request.callback(null, userFriendlyError);
        this.pendingRequests.delete(requestId);
      } else {
        logMessage(`[MCP Handler] Received error for unknown request: ${requestId}`);
      }
    }
  }

  /**
   * Notify all registered callbacks about connection status changes
   */
  private notifyConnectionStatus(): void {
    logMessage(
      `[MCP Handler] Connection status changed: ${this.isConnected}, notifying ${this.connectionStatusCallbacks.size} callbacks`,
    );

    if (this.connectionStatusCallbacks.size === 0) {
      logMessage('[MCP Handler] WARNING: No connection status callbacks registered!');
    }

    this.connectionStatusCallbacks.forEach(callback => {
      try {
        logMessage(`[MCP Handler] Calling connection status callback with isConnected=${this.isConnected}`);
        callback(this.isConnected);
      } catch (error) {
        logMessage(
          `[MCP Handler] Error in connection status callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  /**
   * Notify all registered callbacks about broadcast tool updates
   */
  private notifyBroadcastToolUpdate(primitives: any[]): void {
    logMessage(`[MCP Handler] Notifying ${this.broadcastToolUpdateCallbacks.size} callbacks about tool update`);
    this.broadcastToolUpdateCallbacks.forEach(callback => {
      try {
        callback(primitives);
      } catch (error) {
        logMessage(
          `[MCP Handler] Error in broadcast tool update callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  /**
   * Call an MCP tool through the background script
   *
   * @param toolName The name of the tool to call
   * @param args The arguments to pass to the tool
   * @param callback Callback function to receive the result or error
   * @returns A request ID that can be used to track the request
   */
  public callTool(toolName: string, args: { [key: string]: unknown }, callback: ToolCallCallback): string {
    if (!this.extensionContextValid) {
      callback(null, 'Extension context invalidated');
      return '';
    }

    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `tool-call-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      toolName,
      args,
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    try {
      this.port.postMessage({
        type: 'CALL_TOOL',
        toolName,
        args,
        requestId,
      });

      logMessage(`[MCP Handler] Sent tool call request: ${requestId} for tool: ${toolName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[MCP Handler] Error sending tool call: ${errorMessage}`);

      if (errorMessage.includes('Extension context invalidated')) {
        this.handleExtensionContextInvalidated();
      }

      this.pendingRequests.delete(requestId);
      callback(null, `Failed to send tool call: ${errorMessage}`);
      return '';
    }

    return requestId;
  }

  /**
   * Get available tool primitives from the MCP server
   *
   * This method communicates with the background script which uses getPrimitivesWithSSE
   * to retrieve all primitives from the MCP server and filters to return only tools.
   *
   * @param callback Callback function to receive the tool primitives or error
   * @param forceRefresh Whether to force a fresh request bypassing any caches
   * @returns A request ID that can be used to track the request
   */
  public getAvailableToolPrimitives(callback: ToolCallCallback, forceRefresh: boolean = false): string {
    if (!this.extensionContextValid) {
      callback(null, 'Extension context invalidated');
      return '';
    }

    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `tool-details-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      // toolName and args are optional and not applicable here
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    try {
      this.port.postMessage({
        type: 'GET_TOOL_DETAILS',
        requestId,
        forceRefresh, // Include the forceRefresh flag
      });

      logMessage(`[MCP Handler] Sent tool details request: ${requestId} (forceRefresh: ${forceRefresh})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[MCP Handler] Error sending get tool details: ${errorMessage}`);

      if (errorMessage.includes('Extension context invalidated')) {
        this.handleExtensionContextInvalidated();
      }

      this.pendingRequests.delete(requestId);
      callback(null, `Failed to send tool details request: ${errorMessage}`);
      return '';
    }

    return requestId;
  }

  /**
   * Force a reconnection to the MCP server
   *
   * @param callback Callback function to receive the result or error
   * @returns A request ID that can be used to track the request
   */
  public forceReconnect(callback: ToolCallCallback): string {
    if (!this.extensionContextValid) {
      callback(null, 'Extension context invalidated');
      return '';
    }

    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `reconnect-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      // toolName and args are optional and not applicable here
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    try {
      this.port.postMessage({
        type: 'FORCE_RECONNECT',
        requestId,
      });

      logMessage(`[MCP Handler] Sent force reconnect request: ${requestId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[MCP Handler] Error sending force reconnect: ${errorMessage}`);

      if (errorMessage.includes('Extension context invalidated')) {
        this.handleExtensionContextInvalidated();
      }

      this.pendingRequests.delete(requestId);
      callback(null, `Failed to send reconnect request: ${errorMessage}`);
      return '';
    }

    return requestId;
  }

  /**
   * Register a callback for connection status changes
   */
  public onConnectionStatusChanged(callback: ConnectionStatusCallback): void {
    this.connectionStatusCallbacks.add(callback);
    logMessage(`[MCP Handler] Registered connection status callback, total: ${this.connectionStatusCallbacks.size}`);

    // Immediately notify about current status
    try {
      logMessage(`[MCP Handler] Immediately calling new callback with current status: ${this.isConnected}`);
      callback(this.isConnected);
    } catch (error) {
      logMessage(
        `[MCP Handler] Error in connection status callback: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Unregister a connection status callback
   */
  public offConnectionStatusChanged(callback: ConnectionStatusCallback): void {
    this.connectionStatusCallbacks.delete(callback);
  }

  /**
   * Register a callback for broadcast tool updates
   */
  public onBroadcastToolUpdate(callback: (primitives: any[]) => void): void {
    this.broadcastToolUpdateCallbacks.add(callback);
    logMessage(
      `[MCP Handler] Registered broadcast tool update callback, total: ${this.broadcastToolUpdateCallbacks.size}`,
    );
  }

  /**
   * Unregister a broadcast tool update callback
   */
  public offBroadcastToolUpdate(callback: (primitives: any[]) => void): void {
    this.broadcastToolUpdateCallbacks.delete(callback);
    logMessage(
      `[MCP Handler] Unregistered broadcast tool update callback, remaining: ${this.broadcastToolUpdateCallbacks.size}`,
    );
  }

  /**
   * Get the current connection status
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get the server configuration from the background script with request deduplication
   * @returns Promise that resolves to the server configuration
   */
  public getServerConfig(callback: ToolCallCallback): string {
    if (!this.extensionContextValid) {
      callback(null, 'Extension context invalidated');
      return '';
    }
    if (!this.port) {
      logMessage('[MCP Handler] getServerConfig: Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    // Debouncing logic removed.
    const requestId = `server-config-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    this.pendingRequests.set(requestId, {
      requestId,
      toolName: 'getServerConfig', // Store toolname for context
      // args is optional and not applicable here
      callback,
      timestamp: Date.now(),
    });

    try {
      this.port.postMessage({
        type: 'GET_SERVER_CONFIG',
        requestId,
      });
      logMessage(`[MCP Handler] Sent server config request: ${requestId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[MCP Handler] Error sending getServerConfig: ${errorMessage}`);
      if (errorMessage.includes('Extension context invalidated')) {
        this.handleExtensionContextInvalidated();
      }
      this.pendingRequests.delete(requestId);
      callback(null, `Failed to send getServerConfig request: ${errorMessage}`);
      return '';
    }
    return requestId;
  }

  /**
   * Update the server configuration in the background script
   * @param config The new server configuration
   * @returns Promise that resolves to a boolean indicating success
   */
  public updateServerConfig(config: { uri: string }, callback: ToolCallCallback): string {
    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `update-server-config-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      // toolName and args are optional and not applicable here
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    this.port.postMessage({
      type: 'UPDATE_SERVER_CONFIG',
      config,
      requestId,
    });

    logMessage(`[MCP Handler] Sent update server config request: ${requestId} with URI: ${config.uri}`);

    return requestId;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    // connectionCheckTimeoutId was removed
    // if (this.connectionCheckTimeoutId !== null) {
    //   window.clearTimeout(this.connectionCheckTimeoutId);
    //   this.connectionCheckTimeoutId = null;
    // }

    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.staleRequestCleanupInterval !== null) {
      window.clearInterval(this.staleRequestCleanupInterval);
      this.staleRequestCleanupInterval = null;
    }

    this.disconnect(true);

    this.pendingRequests.clear();
    this.connectionStatusCallbacks.clear();
    this.broadcastToolUpdateCallbacks.clear();
    McpHandler.instance = null;
  }

  /**
   * Get available tools from the MCP server (alias for getAvailableToolPrimitives)
   *
   * @deprecated Use getAvailableToolPrimitives instead for better clarity
   * @param callback Callback function to receive the tool details or error
   * @param forceRefresh Whether to force a fresh request bypassing any caches
   * @returns A request ID that can be used to track the request
   */
  public getAvailableTools(callback: ToolCallCallback, forceRefresh: boolean = false): string {
    return this.getAvailableToolPrimitives(callback, forceRefresh);
  }
}

// Export the singleton instance and the class for testing
export const mcpHandler = McpHandler.getInstance();
export { McpHandler };
