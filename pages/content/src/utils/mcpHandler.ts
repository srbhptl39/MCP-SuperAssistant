import { logMessage } from './helpers';
import { ToolCallCallback, ConnectionStatusCallback, ToolCallRequest, Primitive } from '../types/mcp';

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
  private lastConnectionCheck: number = 0;
  private connectionCheckInterval: number = 15000;
  private connectionCheckTimeoutId: number | null = null;
  private heartbeatInterval: number | null = null;
  private heartbeatFrequency: number = 5000;
  private lastHeartbeatResponse: number = 0;
  private heartbeatTimeoutThreshold: number = 15000;
  private pendingRequestTimeoutMs: number = 30000;
  private staleRequestCleanupInterval: number | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.connectionId = `mcp-connection-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.connect();

    // Listen for page visibility changes to reconnect if needed
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastCheck = Date.now() - this.lastConnectionCheck;
        if (timeSinceLastCheck > this.connectionCheckInterval && !this.port) {
          logMessage('[MCP Handler] Page became visible after inactivity, reconnecting...');
          this.connect();
        } else {
          this.checkConnectionStatus();
        }
      }
    });

    // Start periodic connection check
    this.startConnectionCheck();
    
    // Start the heartbeat to keep the connection alive
    this.startHeartbeat();
    
    // Start cleanup of stale requests
    this.startStaleRequestCleanup();

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
   * Start periodic connection check
   */
  private startConnectionCheck(): void {
    if (this.connectionCheckTimeoutId !== null) {
      window.clearTimeout(this.connectionCheckTimeoutId);
      this.connectionCheckTimeoutId = null;
    }

    this.connectionCheckTimeoutId = window.setTimeout(() => {
      this.connectionCheckTimeoutId = null;

      if (!this.isReconnecting) {
        this.checkConnectionStatus();
      }

      this.startConnectionCheck();
    }, this.connectionCheckInterval);
  }

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
            logMessage(`[MCP Handler] Error in timeout callback for ${requestId}: ${error instanceof Error ? error.message : String(error)}`);
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
      if (!this.port) {
        // If we don't have a port, try to reconnect
        if (!this.isReconnecting) {
          logMessage('[MCP Handler] No port in heartbeat, attempting to reconnect');
          this.connect();
        }
        return;
      }

      // Calculate time since last heartbeat response
      const timeSinceLastHeartbeat = this.lastHeartbeatResponse > 0 
        ? Date.now() - this.lastHeartbeatResponse 
        : 0;

      // If we haven't received a heartbeat response in too long, reconnect
      if (this.lastHeartbeatResponse > 0 && 
          timeSinceLastHeartbeat > this.heartbeatTimeoutThreshold) {
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
        logMessage('[MCP Handler] Sent heartbeat');
      } catch (error) {
        logMessage(`[MCP Handler] Error sending heartbeat: ${error instanceof Error ? error.message : String(error)}`);
        // Try to reconnect on heartbeat error
        this.disconnect(false);
        this.connect();
      }
    }, this.heartbeatFrequency);
  }

  /**
   * Connect to the background script
   */
  private connect(): void {
    try {
      if (this.isReconnecting) {
        logMessage('[MCP Handler] Already reconnecting, skipping connect request');
        return;
      }

      this.isReconnecting = true;

      this.disconnect(false);

      logMessage(`[MCP Handler] Connecting to background script with ID: ${this.connectionId}`);
      this.port = chrome.runtime.connect({ name: this.connectionId });

      this.port.onMessage.addListener(message => this.handleMessage(message));

      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          logMessage(`[MCP Handler] Connection error: ${error.message}`);
        }

        logMessage('[MCP Handler] Disconnected from background script');
        this.port = null;
        this.isConnected = false;
        this.notifyConnectionStatus();

        // Always try to reconnect regardless of isReconnecting flag, but check if we should
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          logMessage('[MCP Handler] Maximum reconnect attempts reached, giving up automatic reconnection');
          this.isReconnecting = false;
        }
      });

      this.checkConnectionStatus();

      this.lastConnectionCheck = Date.now();
      this.lastHeartbeatResponse = Date.now(); // Initialize heartbeat tracker

      this.isReconnecting = false;

      logMessage('[MCP Handler] Connected to background script');
    } catch (error) {
      logMessage(`[MCP Handler] Failed to connect: ${error instanceof Error ? error.message : String(error)}`);

      this.isReconnecting = false;

      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the background script
   * @param clearReconnect Whether to clear reconnect attempts
   */
  private disconnect(clearReconnect: boolean = true): void {
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
   * the background service can respond
   */
  private checkConnectionStatus(): void {
    if (this.port) {
      try {
        // Send a connectivity check message
        this.port.postMessage({
          type: 'CHECK_CONNECTION',
          forceCheck: true,
          timestamp: Date.now(),
        });

        this.lastConnectionCheck = Date.now();
      } catch (error) {
        // If we get an error sending a message, the port is dead
        logMessage(`[MCP Handler] Error sending connection check: ${error instanceof Error ? error.message : String(error)}`);
        this.port = null;
        this.isConnected = false;
        this.notifyConnectionStatus();
        
        // Schedule a reconnect
        if (!this.isReconnecting) {
          this.scheduleReconnect();
        }
      }
    } else if (!this.isReconnecting) {
      // If we don't have a port and aren't already reconnecting, try to reconnect
      logMessage('[MCP Handler] No port during connection check, attempting to reconnect');
      this.connect();
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
        this.notifyConnectionStatus();
        break;

      case 'TOOL_CALL_RESULT':
        this.handleToolCallResult(message.requestId, message.result);
        break;

      case 'TOOL_CALL_STATUS':
        // Could handle intermediate status updates here
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

    if (requestId) {
      const request = this.pendingRequests.get(requestId);
      if (request) {
        request.callback(null, errorMessage);
        this.pendingRequests.delete(requestId);
      }
    }
  }

  /**
   * Notify all registered callbacks about connection status changes
   */
  private notifyConnectionStatus(): void {
    logMessage(`[MCP Handler] Connection status changed: ${this.isConnected}`);
    this.connectionStatusCallbacks.forEach(callback => {
      try {
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
    this.port.postMessage({
      type: 'CALL_TOOL',
      toolName,
      args,
      requestId,
    });

    logMessage(`[MCP Handler] Sent tool call request: ${requestId} for tool: ${toolName}`);

    return requestId;
  }

  /**
   * Get available tool primitives from the MCP server
   *
   * This method communicates with the background script which uses getPrimitivesWithSSE
   * to retrieve all primitives from the MCP server and filters to return only tools.
   *
   * @param callback Callback function to receive the tool primitives or error
   * @returns A request ID that can be used to track the request
   */
  public getAvailableToolPrimitives(callback: ToolCallCallback): string {
    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `tool-details-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      toolName: '',
      args: {},
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    this.port.postMessage({
      type: 'GET_TOOL_DETAILS',
      requestId,
    });

    logMessage(`[MCP Handler] Sent tool details request: ${requestId}`);

    return requestId;
  }

  /**
   * Force a reconnection to the MCP server
   *
   * @param callback Callback function to receive the result or error
   * @returns A request ID that can be used to track the request
   */
  public forceReconnect(callback: ToolCallCallback): string {
    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `reconnect-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      toolName: '',
      args: {},
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    this.port.postMessage({
      type: 'FORCE_RECONNECT',
      requestId,
    });

    logMessage(`[MCP Handler] Sent force reconnect request: ${requestId}`);

    return requestId;
  }

  /**
   * Get available tools from the MCP server (alias for getAvailableToolPrimitives)
   *
   * @deprecated Use getAvailableToolPrimitives instead for better clarity
   * @param callback Callback function to receive the tool details or error
   * @returns A request ID that can be used to track the request
   */
  public getAvailableTools(callback: ToolCallCallback): string {
    return this.getAvailableToolPrimitives(callback);
  }

  /**
   * Register a callback for connection status changes
   */
  public onConnectionStatusChanged(callback: ConnectionStatusCallback): void {
    this.connectionStatusCallbacks.add(callback);

    // Immediately notify about current status
    try {
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
   * Get the server configuration from the background script
   * @returns Promise that resolves to the server configuration
   */
  public getServerConfig(callback: ToolCallCallback): string {
    if (!this.port) {
      logMessage('[MCP Handler] Not connected to background script');
      callback(null, 'Not connected to background script');
      return '';
    }

    const requestId = `server-config-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Store the request
    this.pendingRequests.set(requestId, {
      requestId,
      toolName: '',
      args: {},
      callback,
      timestamp: Date.now(),
    });

    // Send the request to the background script
    this.port.postMessage({
      type: 'GET_SERVER_CONFIG',
      requestId,
    });

    logMessage(`[MCP Handler] Sent server config request: ${requestId}`);

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
      toolName: '',
      args: {},
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
    if (this.connectionCheckTimeoutId !== null) {
      window.clearTimeout(this.connectionCheckTimeoutId);
      this.connectionCheckTimeoutId = null;
    }

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
}

// Export the singleton instance and the class for testing
export const mcpHandler = McpHandler.getInstance();
export { McpHandler };
