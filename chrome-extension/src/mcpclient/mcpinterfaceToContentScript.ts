import {
  callToolWithSSE,
  getPrimitivesWithSSE,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
} from './officialmcpclient';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { ServerConfig } from '../../../pages/content/src/types/mcp';

// Define the Primitive type locally since it's not exported from officialmcpclient
type PrimitiveType = 'resource' | 'tool' | 'prompt';
type PrimitiveValue = {
  name: string;
  description?: string;
  uri?: string;
  inputSchema?: any;
  arguments?: any[];
};
type Primitive = {
  type: PrimitiveType;
  value: PrimitiveValue;
};

/**
 * Class that manages communication between background script and content scripts
 * for MCP tool calling functionality.
 */
class McpInterface {
  private static instance: McpInterface | null = null;
  private connections: Map<string, chrome.runtime.Port> = new Map();
  private serverConfig: ServerConfig = { uri: 'http://localhost:3006/sse', token: undefined };
  private isConnected: boolean = false;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private connectionCheckIntervalTime: number = 10000; // Reduced from 30000 to 10000ms
  private connectionLastActiveTimestamps: Map<string, number> = new Map();
  private connectionActivityCheckInterval: NodeJS.Timeout | null = null;
  private connectionActivityCheckTime: number = 15000; // 15 seconds
  private connectionTimeoutThreshold: number = 30000; // 30 seconds of inactivity before considered stale

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.setupConnectionListener();
    this.startConnectionCheck();
    this.startConnectionActivityCheck();
    console.log('[MCP Interface] Initialized');
  }

  /**
   * Get the singleton instance of McpInterface
   */
  public static getInstance(): McpInterface {
    if (!McpInterface.instance) {
      McpInterface.instance = new McpInterface();
    }
    return McpInterface.instance;
  }

  /**
   * Start periodic connection check
   */
  private startConnectionCheck(): void {
    // Clear any existing interval
    if (this.connectionCheckInterval !== null) {
      clearInterval(this.connectionCheckInterval);
    }

    // Set up new interval
    this.connectionCheckInterval = setInterval(() => {
      this.checkServerConnection().then(isConnected => {
        // Only broadcast if the status has changed
        if (isConnected !== this.isConnected) {
          console.log(`[MCP Interface] Connection status changed: ${isConnected}`);
          this.isConnected = isConnected;
          this.broadcastConnectionStatus();
        }
      });
    }, this.connectionCheckIntervalTime);
  }

  /**
   * Start periodic connection activity check to detect and clean up stale connections
   */
  private startConnectionActivityCheck(): void {
    if (this.connectionActivityCheckInterval !== null) {
      clearInterval(this.connectionActivityCheckInterval);
    }

    this.connectionActivityCheckInterval = setInterval(() => {
      const now = Date.now();
      let staleConnections = 0;

      // Check each connection for activity
      this.connections.forEach((port, connectionId) => {
        const lastActivity = this.connectionLastActiveTimestamps.get(connectionId) || 0;
        const inactiveTime = now - lastActivity;

        if (inactiveTime > this.connectionTimeoutThreshold) {
          console.log(
            `[MCP Interface] Connection ${connectionId} is stale (inactive for ${inactiveTime}ms), cleaning up`,
          );

          try {
            // Attempt to notify the content script before disconnecting
            port.postMessage({
              type: 'CONNECTION_STATUS',
              isConnected: false,
              reason: 'TIMEOUT',
            });

            // Then disconnect
            port.disconnect();
          } catch (error) {
            // Ignore errors during disconnect
          }

          // Remove from our maps
          this.connections.delete(connectionId);
          this.connectionLastActiveTimestamps.delete(connectionId);
          staleConnections++;
        }
      });

      if (staleConnections > 0) {
        console.log(`[MCP Interface] Cleaned up ${staleConnections} stale connections`);
      }
    }, this.connectionActivityCheckTime);
  }

  /**
   * Check if the server is connected
   * @returns Promise that resolves to true if connected, false otherwise
   */
  private async checkServerConnection(): Promise<boolean> {
    try {
      // Use the checkMcpServerConnection function for a more accurate check
      return await checkMcpServerConnection();
    } catch (error) {
      console.error('[MCP Interface] Error checking server connection:', error);
      return false;
    }
  }

  /**
   * Handle messages from content scripts
   */
  private handleMessage(connectionId: string, message: any): void {
    console.log(`[MCP Interface] Received message from ${connectionId}:`, message.type);

    // Update the last active timestamp for this connection
    this.connectionLastActiveTimestamps.set(connectionId, Date.now());

    switch (message.type) {
      case 'HEARTBEAT':
        // Respond to heartbeat immediately to keep connection alive
        this.sendHeartbeatResponse(connectionId, message.timestamp);
        break;

      case 'CALL_TOOL':
        console.log('[MCP Interface] Handling tool call:', message);
        this.handleToolCall(connectionId, message);
        break;

      case 'CHECK_CONNECTION':
        this.sendConnectionStatus(connectionId, message.forceCheck === true);
        break;

      case 'GET_TOOL_DETAILS':
        this.handleGetToolDetails(connectionId, message);
        break;

      case 'FORCE_RECONNECT':
        this.handleForceReconnect(connectionId, message);
        break;

      case 'GET_SERVER_CONFIG':
        this.handleGetServerConfig(connectionId, message);
        break;

      case 'UPDATE_SERVER_CONFIG':
        this.handleUpdateServerConfig(connectionId, message);
        break;

      default:
        console.warn(`[MCP Interface] Unknown message type: ${message.type}`);
        this.sendError(connectionId, 'UNKNOWN_MESSAGE', `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Send heartbeat response back to the content script
   */
  private sendHeartbeatResponse(connectionId: string, timestamp: number): void {
    const port = this.connections.get(connectionId);
    if (port) {
      try {
        port.postMessage({
          type: 'HEARTBEAT_RESPONSE',
          timestamp,
          serverTimestamp: Date.now(),
        });
      } catch (error) {
        console.error(`[MCP Interface] Error sending heartbeat response to ${connectionId}:`, error);
        // Remove the connection if we can't send messages to it
        this.connections.delete(connectionId);
        this.connectionLastActiveTimestamps.delete(connectionId);
      }
    }
  }

  /**
   * Handle tool call requests from content scripts
   */
  private async handleToolCall(connectionId: string, message: any): Promise<void> {
    const { toolName, args, requestId } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    if (!toolName || !args || !requestId) {
      console.error(`[MCP Interface] Invalid tool call request:`, message);
      this.sendError(connectionId, 'INVALID_REQUEST', 'Invalid tool call request', requestId);
      return;
    }

    // First check if server is connected
    const isConnected = await this.checkServerConnection();
    if (!isConnected) {
      console.error(`[MCP Interface] Cannot call tool ${toolName}: MCP server is not connected`);
      this.sendError(
        connectionId,
        'SERVER_UNAVAILABLE',
        'MCP server is not available. Please check your connection settings.',
        requestId,
      );
      return;
    }

    // Check if args is an empty object when it shouldn't be
    if (typeof args === 'object' && Object.keys(args).length === 0) {
      console.warn(`[MCP Interface] Warning: Empty arguments object for tool ${toolName}`);
    }

    // Log the actual args object with its prototype chain
    console.log(`[MCP Interface] Args type: ${typeof args}, isArray: ${Array.isArray(args)}, keys:`, Object.keys(args));
    console.log(`[MCP Interface] Calling tool ${toolName} with args:`, JSON.parse(JSON.stringify(args)));

    try {
      // Ensure args is a proper object before passing it
      let processedArgs = typeof args === 'object' && args !== null ? args : {};

      // Send a status update that we're processing
      port.postMessage({
        type: 'TOOL_CALL_STATUS',
        status: 'PROCESSING',
        requestId,
      });

      // Sanitize args to ensure it's valid JSON
      let sanitizedArgs;
      try {
        // First convert to string and back to strip any non-serializable properties
        const argsString = JSON.stringify(processedArgs);
        sanitizedArgs = JSON.parse(argsString);

        // Log the sanitized args for debugging
        console.log(`[MCP Interface] Sanitized args:`, sanitizedArgs);
      } catch (error) {
        console.error(`[MCP Interface] Error sanitizing args:`, error);
        // If JSON serialization fails, fall back to an empty object
        sanitizedArgs = {};
        this.sendError(connectionId, 'INVALID_ARGS', 'Arguments could not be properly serialized to JSON', requestId);
      }

      // Replace the processed args with the sanitized version
      processedArgs = sanitizedArgs;

      // Call the tool with the processed args using the persistent connection
      const result = await callToolWithSSE(this.serverConfig, toolName, processedArgs);

      // Send the result back to the content script
      port.postMessage({
        type: 'TOOL_CALL_RESULT',
        result,
        requestId,
      });

      console.log(`[MCP Interface] Tool call ${requestId} completed successfully`);

      // Update connection status after successful call
      this.isConnected = true;
      this.broadcastConnectionStatus();
    } catch (error) {
      console.error(`[MCP Interface] Tool call ${requestId} failed:`, error);

      // Update connection status after failed call
      const isConnected = await this.checkServerConnection();
      if (this.isConnected !== isConnected) {
        this.isConnected = isConnected;
        this.broadcastConnectionStatus();
      }

      this.sendError(
        connectionId,
        'TOOL_CALL_ERROR',
        error instanceof Error ? error.message : String(error),
        requestId,
      );
    }
  }

  /**
   * Handle get tool details requests from content scripts
   */
  private async handleGetToolDetails(connectionId: string, message: any): Promise<void> {
    const { requestId, forceRefresh } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    if (!requestId) {
      console.error(`[MCP Interface] Invalid tool details request:`, message);
      this.sendError(connectionId, 'INVALID_REQUEST', 'Invalid tool details request');
      return;
    }

    console.log(`[MCP Interface] Getting available tools for request ${requestId} (forceRefresh: ${!!forceRefresh})`);

    try {
      // Get the primitives from the server using the persistent connection
      // Use forceRefresh flag if provided in the message
      const primitives = await this.getAvailableToolsFromServer(!!forceRefresh);

      // Filter to only include tools
      const tools = primitives.filter(p => p.type === 'tool');

      // Send the result back to the content script
      port.postMessage({
        type: 'TOOL_DETAILS_RESULT',
        result: tools,
        requestId,
      });

      console.log(
        `[MCP Interface] Tool details request ${requestId} completed successfully with ${tools.length} tools`,
      );

      // Update connection status after successful call
      this.isConnected = true;
      this.broadcastConnectionStatus();
    } catch (error) {
      console.error(`[MCP Interface] Tool details request ${requestId} failed:`, error);

      // Update connection status after failed call
      const isConnected = await this.checkServerConnection();
      if (this.isConnected !== isConnected) {
        this.isConnected = isConnected;
        this.broadcastConnectionStatus();
      }

      this.sendError(
        connectionId,
        'TOOL_DETAILS_ERROR',
        error instanceof Error ? error.message : String(error),
        requestId,
      );
    }
  }

  /**
   * Handle force reconnect requests from content scripts
   */
  private async handleForceReconnect(connectionId: string, message: any): Promise<void> {
    const { requestId } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    console.log(`[MCP Interface] Handling force reconnect request ${requestId}`);

    try {
      // Send a status update that we're processing
      port.postMessage({
        type: 'RECONNECT_STATUS',
        status: 'PROCESSING',
        requestId,
      });

      // Force reconnect to the MCP server
      await forceReconnectToMcpServer(this.serverConfig);

      // Check the new connection status
      const isConnected = await this.checkServerConnection();
      this.isConnected = isConnected;

      // Explicitly refresh tools after reconnection
      if (isConnected) {
        console.log(`[MCP Interface] Fetching fresh tools after reconnection`);
        try {
          // Clear any cached primitives to ensure we get fresh data
          const freshTools = await this.getAvailableToolsFromServer(true);
          console.log(`[MCP Interface] Successfully fetched ${freshTools.length} tools after reconnection`);

          // Broadcast the fresh tools to all connected content scripts
          this.broadcastToolsUpdate(freshTools);
        } catch (toolsError) {
          console.error(`[MCP Interface] Error fetching tools after reconnection:`, toolsError);
          // Continue even if tool fetching fails - we'll still send success for the reconnect
        }
      }

      // Send the result back to the content script
      port.postMessage({
        type: 'RECONNECT_RESULT',
        success: true,
        isConnected: this.isConnected,
        requestId,
      });

      // Broadcast the new connection status to all connected content scripts
      this.broadcastConnectionStatus();

      console.log(`[MCP Interface] Force reconnect request ${requestId} completed successfully`);
    } catch (error) {
      console.error(`[MCP Interface] Force reconnect request ${requestId} failed:`, error);

      // Check the connection status after the error
      const isConnected = await this.checkServerConnection();
      if (this.isConnected !== isConnected) {
        this.isConnected = isConnected;
        this.broadcastConnectionStatus();
      }

      this.sendError(
        connectionId,
        'RECONNECT_ERROR',
        error instanceof Error ? error.message : String(error),
        requestId,
      );
    }
  }  /**
   * Get available tools from the MCP server
   * Uses the getPrimitivesWithSSE function to get all primitives directly
   * @param forceRefresh Whether to force a fresh request and bypass cache
   */
  private async getAvailableToolsFromServer(forceRefresh: boolean = false): Promise<Primitive[]> {
    try {
      console.log(`[MCP Interface] Getting available primitives from server (forceRefresh: ${forceRefresh})`);

      // Use getPrimitivesWithSSE to get all primitives directly using the persistent connection
      const primitives = await getPrimitivesWithSSE(this.serverConfig, forceRefresh);

      console.log(`[MCP Interface] Found ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      console.error('[MCP Interface] Failed to get available primitives:', error);
      // Return an empty array instead of throwing to be more resilient
      return [];
    }
  }

  /**
   * Send connection status to a specific content script
   * @param connectionId The ID of the connection to send the status to
   * @param forceCheck Whether to force a thorough check of the connection
   */
  private async sendConnectionStatus(connectionId: string, forceCheck: boolean = false): Promise<void> {
    const port = this.connections.get(connectionId);
    if (port) {
      // Check the current connection status
      const isConnected = forceCheck
        ? await this.checkServerConnection() // Use the more thorough check if requested
        : this.isConnected; // Otherwise use the cached status

      // Update the stored status if it has changed
      if (this.isConnected !== isConnected) {
        this.isConnected = isConnected;
        this.broadcastConnectionStatus();
      } else {
        // Just send to the requesting connection
        try {
          port.postMessage({
            type: 'CONNECTION_STATUS',
            isConnected: this.isConnected,
            message: this.isConnected
              ? 'Connected to MCP server'
              : 'MCP server unavailable - extension running with limited capabilities',
          });
        } catch (error) {
          console.error(`[MCP Interface] Error sending connection status to ${connectionId}:`, error);
          // Remove the connection if we can't send messages to it
          this.connections.delete(connectionId);
          this.connectionLastActiveTimestamps.delete(connectionId);
        }
      }
    }
  }

  /**
   * Send error message to a specific content script
   */
  private sendError(connectionId: string, errorType: string, errorMessage: string, requestId?: string): void {
    const port = this.connections.get(connectionId);
    if (port) {
      port.postMessage({
        type: 'ERROR',
        errorType,
        errorMessage,
        requestId,
      });
    }
  }

  /**
   * Update the MCP server connection status
   */
  public updateConnectionStatus(isConnected: boolean): void {
    console.log(`[MCP Interface] Updating connection status: ${isConnected}`);
    this.isConnected = isConnected;
    this.broadcastConnectionStatus();
  }

  /**
   * Update the MCP server URL
   */
  public updateServerUrl(url: string): void {
    console.log(`[MCP Interface] Updating server URL: ${url}`);
    this.serverConfig = { ...this.serverConfig, uri: url };
  }
  
  /**
   * Update the MCP server auth token
   */
  public updateAuthToken(token?: string): void {
    console.log(`[MCP Interface] Updating auth token: ${token ? '(token provided)' : '(no token)'}`);
    this.serverConfig = { ...this.serverConfig, token };
  }
  
  /**
   * Update the server configuration
   */
  public updateServerConfig(config: ServerConfig): void {
    console.log(`[MCP Interface] Updating server config: ${config.uri}${config.token ? ' with token' : ''}`);
    this.serverConfig = { ...config };
  }

  /**
   * Get the number of active connections
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.connectionCheckInterval !== null) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    if (this.connectionActivityCheckInterval !== null) {
      clearInterval(this.connectionActivityCheckInterval);
      this.connectionActivityCheckInterval = null;
    }

    // Clean up all connections
    this.connections.forEach((port, connectionId) => {
      try {
        port.disconnect();
      } catch (error) {
        // Ignore errors during disconnect
      }
    });

    this.connections.clear();
    this.connectionLastActiveTimestamps.clear();
  }

  /**
   * Handle get server config requests from content scripts
   */
  private async handleGetServerConfig(connectionId: string, message: any): Promise<void> {
    const { requestId } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    console.log(`[MCP Interface] Handling get server config request ${requestId}`);

    try {
      // Send the current server config back to the content script
      port.postMessage({
        type: 'SERVER_CONFIG_RESULT',
        config: { ...this.serverConfig },
        requestId,
      });

      console.log(`[MCP Interface] Get server config request ${requestId} completed successfully`);
    } catch (error) {
      console.error(`[MCP Interface] Get server config request ${requestId} failed:`, error);
      this.sendError(
        connectionId,
        'SERVER_CONFIG_ERROR',
        `Failed to get server config: ${error instanceof Error ? error.message : String(error)}`,
        requestId,
      );
    }
  }

  /**
   * Handle update server config requests from content scripts
   */
  private async handleUpdateServerConfig(connectionId: string, message: any): Promise<void> {
    const { requestId, config } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    if (!config || !config.uri) {
      console.error(`[MCP Interface] Invalid update server config request:`, message);
      this.sendError(connectionId, 'INVALID_REQUEST', 'Invalid server config update request', requestId);
      return;
    }

    console.log(`[MCP Interface] Handling update server config request ${requestId} with URI: ${config.uri}`);

    try {
      // Validate the URI
      let baseUrl: URL;
      try {
        baseUrl = new URL(config.uri);
      } catch (error) {
        throw new Error(`Invalid URI: ${config.uri}`);
      }

      // Update the server URL and auth token
      this.updateServerUrl(config.uri);
      this.updateAuthToken(config.token);

      // Save the server URL and token to storage
      try {
        await chrome.storage.local.set({ 
          mcpServerUrl: config.uri,
          mcpAuthToken: config.token
        });
        console.log(`[MCP Interface] Saved server config to storage: ${config.uri}${config.token ? ' with token' : ''}`);
      } catch (storageError) {
        console.error(`[MCP Interface] Error saving server config to storage:`, storageError);
        // Continue even if storage fails - we've already updated the in-memory values
      }

      // Force reconnect to the new server
      console.log(`[MCP Interface] Forcing reconnection to new server URL: ${config.uri}${config.token ? ' with token' : ''}`);
      try {
        await forceReconnectToMcpServer(config);
        console.log(`[MCP Interface] Successfully reconnected to new server URL: ${config.uri}`);

        // Check the new connection status
        const isConnected = await this.checkServerConnection();
        this.isConnected = isConnected;

        // Broadcast the new connection status to all connected content scripts
        this.broadcastConnectionStatus();

        // Explicitly refresh tools after reconnection
        if (isConnected) {
          console.log(`[MCP Interface] Fetching fresh tools from new server: ${config.uri}`);
          try {
            // Clear any cached primitives to ensure we get fresh data
            const freshTools = await this.getAvailableToolsFromServer(true);
            console.log(`[MCP Interface] Successfully fetched ${freshTools.length} tools from new server`);

            // Broadcast the fresh tools to all connected content scripts
            this.broadcastToolsUpdate(freshTools);
          } catch (toolsError) {
            console.error(`[MCP Interface] Error fetching tools from new server:`, toolsError);
            // Continue even if tool fetching fails - we'll still send success for the config update
          }
        }
      } catch (reconnectError) {
        console.error(`[MCP Interface] Error reconnecting to new server URL: ${config.uri}`, reconnectError);
        // Continue even if reconnection fails - we'll still send success for the config update
      }

      // Send success response back to the content script
      port.postMessage({
        type: 'UPDATE_SERVER_CONFIG_RESULT',
        success: true,
        requestId,
      });

      console.log(`[MCP Interface] Update server config request ${requestId} completed successfully`);
    } catch (error) {
      console.error(`[MCP Interface] Update server config request ${requestId} failed:`, error);
      this.sendError(
        connectionId,
        'SERVER_CONFIG_UPDATE_ERROR',
        `Failed to update server config: ${error instanceof Error ? error.message : String(error)}`,
        requestId,
      );
    }
  }

  /**
   * Broadcast tools update to all connected content scripts
   */
  private broadcastToolsUpdate(tools: Primitive[]): void {
    console.log(`[MCP Interface] Broadcasting tools update to ${this.connections.size} connections`);

    // Filter to only include tools
    const toolPrimitives = tools.filter(p => p.type === 'tool');

    this.connections.forEach((port, connectionId) => {
      try {
        port.postMessage({
          type: 'TOOL_DETAILS_RESULT',
          result: toolPrimitives,
          // Use a special requestId to indicate this is a broadcast
          requestId: 'broadcast-tools-update',
        });
        console.log(`[MCP Interface] Sent tools update to ${connectionId}: ${toolPrimitives.length} tools`);
      } catch (error) {
        console.error(`[MCP Interface] Error sending tools update to ${connectionId}:`, error);
      }
    });
  }

  /**
   * Set up listener for connections from content scripts
   */
  private setupConnectionListener(): void {
    chrome.runtime.onConnect.addListener(port => {
      if (port.name.startsWith('mcp-connection-')) {
        const connectionId = port.name;
        console.log(`[MCP Interface] New connection established: ${connectionId}`);

        // Store the connection
        this.connections.set(connectionId, port);
        this.connectionLastActiveTimestamps.set(connectionId, Date.now());

        // Set up message listener for this connection
        port.onMessage.addListener(message => this.handleMessage(connectionId, message));

        // Set up disconnect listener
        port.onDisconnect.addListener(() => {
          console.log(`[MCP Interface] Connection disconnected: ${connectionId}`);
          this.connections.delete(connectionId);
          this.connectionLastActiveTimestamps.delete(connectionId);
        });

        // Check current connection status and send it to the new connection
        this.checkServerConnection().then(isConnected => {
          this.isConnected = isConnected;
          this.sendConnectionStatus(connectionId);
        });
      }
    });
  }

  /**
   * Broadcast connection status to all connected content scripts
   */
  private broadcastConnectionStatus(): void {
    this.connections.forEach((port, connectionId) => {
      try {
        port.postMessage({
          type: 'CONNECTION_STATUS',
          isConnected: this.isConnected,
          message: this.isConnected
            ? 'Connected to MCP server'
            : 'MCP server unavailable - extension running with limited capabilities',
        });
        console.log(`[MCP Interface] Sent connection status to ${connectionId}: ${this.isConnected}`);
      } catch (error) {
        console.error(`[MCP Interface] Error sending connection status to ${connectionId}:`, error);
        // Remove the connection if we can't send messages to it
        this.connections.delete(connectionId);
        this.connectionLastActiveTimestamps.delete(connectionId);
      }
    });
  }
}

// Export the singleton instance
export const mcpInterface = McpInterface.getInstance();
