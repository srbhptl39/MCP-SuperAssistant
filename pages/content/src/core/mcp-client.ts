import { contextBridge } from './context-bridge';
import { useConnectionStore } from '../stores/connection.store';
import { useToolStore } from '../stores/tool.store';
import { eventBus } from '../events/event-bus';
import type { ServerConfig, ConnectionStatus } from '../types/stores';
import { logMessage } from '../utils/helpers';
import { pluginRegistry } from '../plugins';
import { META_TOOLS, runMetaTool } from './metaTools';

// Wording that marks a tool error as an argument/validation failure worth
// answering with the expected schema ("requires"/"must be one of" are the
// browser tools' phrasing; the rest matches proxy/Zod errors).
const SCHEMA_HINT_TRIGGER = /invalid|requir|schema|argument|parameter|missing|must be|expected/i;

/**
 * McpClient – Enhanced wrapper around ContextBridge for communicating with the
 * background script and managing MCP (Model Context Protocol) connections.
 * 
 * This class provides:
 * - Type-safe communication with the background script
 * - Automatic state synchronization with Zustand stores
 * - Connection heartbeat and health monitoring
 * - Tool execution and management
 * - Server configuration handling
 * - Comprehensive error handling and recovery
 * 
 * The client follows a singleton pattern to ensure consistent state management
 * across the entire content script lifecycle.
 */
class McpClient {
  private static instance: McpClient | null = null;
  private isInitialized = false;
  private heartbeatInterval: number | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  private constructor() {
    this.initialize();
  }

  /**
   * Initialize the MCP client and set up message listeners with enhanced error handling
   */
  private initialize(): void {
    if (this.isInitialized) {
      logMessage('[McpClient] Already initialized');
      return;
    }

    try {
      logMessage('[McpClient] Starting initialization...');

      // Initialize context bridge first
      contextBridge.initialize();
      logMessage('[McpClient] Context bridge initialized');

      // Set up message listeners for background script communication
      this.setupMessageListeners();
      logMessage('[McpClient] Message listeners setup complete');

      // Start heartbeat to maintain connection awareness
      this.startHeartbeat();
      logMessage('[McpClient] Heartbeat started');

      // Mark as initialized before requesting initial state to prevent race conditions
      this.isInitialized = true;

      // Request initial connection status and server config (async, don't block initialization)
      this.requestInitialState().catch(error => {
        logMessage(`[McpClient] Initial state request failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`);
      });

      logMessage('[McpClient] Initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Initialization failed: ${errorMessage}`);
      
      // Reset initialization flag on failure
      this.isInitialized = false;
      
      // Emit error event for other components to handle
      eventBus.emit('error:unhandled', { 
        error: error instanceof Error ? error : new Error(errorMessage),
        context: 'mcp-client-initialization'
      });
      
      throw error;
    }
  }

  /**
   * Request initial state from background script with enhanced error handling
   */
  private async requestInitialState(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        logMessage(`[McpClient] Requesting initial state from background (attempt ${retryCount + 1}/${maxRetries})...`);
        
        // First, get current connection status with timeout
        try {
          const statusResponse = await this.getCurrentConnectionStatus();
          if (statusResponse) {
            logMessage(`[McpClient] Initial connection status: ${statusResponse.status} (isConnected: ${statusResponse.isConnected})`);
            // Cast status to ConnectionStatus type since background returns a string
            const connectionStatus = statusResponse.status as ConnectionStatus;
            this.handleConnectionStatusChange(connectionStatus, undefined);
          }
        } catch (statusError) {
          logMessage(`[McpClient] Failed to get initial connection status: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
          // Don't fail the entire initialization, continue with other operations
        }
        
        // Get server config
        try {
          const config = await this.getServerConfig();
          useConnectionStore.getState().setServerConfig(config);
          logMessage(`[McpClient] Initial server config loaded: ${JSON.stringify(config)}`);
        } catch (configError) {
          logMessage(`[McpClient] Failed to get server config: ${configError instanceof Error ? configError.message : String(configError)}`);
          // Use default config if loading fails
          useConnectionStore.getState().setServerConfig({
            uri: 'http://localhost:3006/sse',
            connectionType: 'sse',
            timeout: 5000,
            retryAttempts: 3,
            retryDelay: 2000
          });
        }

        // Get available tools to populate initial state (force refresh to ensure fresh data)
        try {
          const tools = await this.getAvailableTools(true);
          logMessage(`[McpClient] Initial tools loaded: ${tools.length} tools`);
        } catch (toolsError) {
          logMessage(`[McpClient] Failed to get initial tools: ${toolsError instanceof Error ? toolsError.message : String(toolsError)}`);
          // Continue without tools - they can be loaded later
        }
        
        logMessage('[McpClient] Initial state request completed successfully');
        return; // Success, exit retry loop
        
      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`[McpClient] Initial state request attempt ${retryCount} failed: ${errorMessage}`);
        
        if (retryCount >= maxRetries) {
          logMessage(`[McpClient] All ${maxRetries} initial state request attempts failed. Continuing with degraded functionality.`);
          
          // Emit error event but don't throw - let the client continue to work
          eventBus.emit('error:unhandled', {
            error: error instanceof Error ? error : new Error(errorMessage),
            context: 'mcp-client-initial-state'
          });
          
          return;
        }
        
        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
        logMessage(`[McpClient] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Set up message listeners for various background script communications with enhanced error handling
   */
  private setupMessageListeners(): void {
    // Listen for connection status broadcasts coming from background script
    contextBridge.onMessage('connection:status-changed', message => {
      try {
        // Extract status from the payload (should now be properly structured)
        const { status, error, isConnected } = message.payload ?? {};
        
        // Log the raw message for debugging
        logMessage(`[McpClient] Received connection status message: ${JSON.stringify(message)}`);
        
        // Ensure we handle the status properly
        if (status) {
          logMessage(`[McpClient] Processing status: ${status}, error: ${error}, isConnected: ${isConnected}`);
          this.handleConnectionStatusChange(status, error);
        } else {
          logMessage(`[McpClient] Warning: No status in connection message payload. Received: ${JSON.stringify(message)}`);
        }
      } catch (error) {
        logMessage(`[McpClient] Error processing connection status message: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Listen for tool-list updates (broadcast by background when primitives change)
    contextBridge.onMessage('mcp:tool-update', message => {
      try {
        // Background broadcasts { payload: { tools: [...] } }; tolerate a bare array too.
        const payload = message.payload;
        const tools = Array.isArray(payload) ? payload : Array.isArray(payload?.tools) ? payload.tools : [];
        logMessage(`[McpClient] Received tool update: ${tools.length} tools`);
        this.handleToolUpdate(tools);
      } catch (error) {
        logMessage(`[McpClient] Error processing tool update: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Listen for server config updates
    contextBridge.onMessage('mcp:server-config-updated', message => {
      try {
        const { config } = message.payload ?? {};
        if (config) {
          logMessage(`[McpClient] Received server config update: ${JSON.stringify(config)}`);
          this.handleServerConfigUpdate(config);
        } else {
          logMessage(`[McpClient] Warning: No config in server config update message`);
        }
      } catch (error) {
        logMessage(`[McpClient] Error processing server config update: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Listen for heartbeat responses
    contextBridge.onMessage('mcp:heartbeat-response', message => {
      try {
        const { timestamp, isConnected } = message.payload ?? {};
        if (timestamp) {
          // Also update connection status based on heartbeat
          if (typeof isConnected === 'boolean') {
            const currentStatus = useConnectionStore.getState().status;
            const expectedStatus = isConnected ? 'connected' : 'disconnected';
            
            if (currentStatus !== expectedStatus) {
              logMessage(`[McpClient] Heartbeat indicates status should be ${expectedStatus}, updating from ${currentStatus}`);
              this.handleConnectionStatusChange(expectedStatus);
            }
          }
          this.handleHeartbeatResponse(timestamp);
        } else {
          logMessage(`[McpClient] Warning: No timestamp in heartbeat response`);
        }
      } catch (error) {
        logMessage(`[McpClient] Error processing heartbeat response: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    logMessage('[McpClient] Message listeners configured successfully');
  }

  /**
   * Handle connection status changes from background script
   */
  private handleConnectionStatusChange(status: ConnectionStatus, error?: string): void {
    const store = useConnectionStore.getState();

    logMessage(`[McpClient] Connection status changed to: ${status}${error ? ` (${error})` : ''}`);

    switch (status) {
      case 'connected':
        store.setConnected(Date.now());
        // Emit event for other components
        eventBus.emit('connection:status-changed', { status, error: undefined });
        logMessage(`[McpClient] Emitted connected status to event bus`);
        
        // Automatically fetch tools when connected
        this.getAvailableTools(true).then(tools => {
          logMessage(`[McpClient] Auto-fetched ${tools.length} tools after connection`);
        }).catch(error => {
          logMessage(`[McpClient] Failed to auto-fetch tools after connection: ${error instanceof Error ? error.message : String(error)}`);
        });
        break;
      case 'reconnecting':
        store.startReconnecting();
        eventBus.emit('connection:status-changed', { status, error: undefined });
        logMessage(`[McpClient] Emitted reconnecting status to event bus`);
        break;
      case 'error':
        store.setDisconnected(error ?? 'Unknown connection error');
        eventBus.emit('connection:status-changed', { status, error: error ?? 'Unknown connection error' });
        logMessage(`[McpClient] Emitted error status to event bus`);
        break;
      case 'disconnected':
      default:
        store.setDisconnected(error);
        eventBus.emit('connection:status-changed', { status: 'disconnected', error });
        logMessage(`[McpClient] Emitted disconnected status to event bus`);
    }
  }

  /**
   * Handle tool updates from background script
   */
  private handleToolUpdate(tools: any[]): void {
    logMessage(`[McpClient] Received tool update with ${tools.length} tools`);

    // Normalize tool data to ensure consistent schema
    const normalizedTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.input_schema || tool.schema || {},
      // Legacy support
      schema: typeof tool.schema === 'string' ? tool.schema : JSON.stringify(tool.input_schema || {})
    }));

    useToolStore.getState().setAvailableTools(normalizedTools);
    eventBus.emit('tool:list-updated', { tools: normalizedTools });
  }

  /**
   * Handle server config updates from background script
   */
  private handleServerConfigUpdate(config: Partial<ServerConfig>): void {
    logMessage('[McpClient] Server config updated from background');
    useConnectionStore.getState().setServerConfig(config);
  }

  /**
   * Handle heartbeat responses to maintain connection awareness
   */
  private handleHeartbeatResponse(timestamp: number): void {
    // Update last heartbeat time in connection store if needed
    eventBus.emit('connection:heartbeat', { timestamp });
  }

  /**
   * Start heartbeat to maintain connection awareness
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat().catch(error => {
        logMessage(`[McpClient] Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, this.HEARTBEAT_INTERVAL);

    logMessage('[McpClient] Heartbeat started');
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logMessage('[McpClient] Heartbeat stopped');
    }
  }

  /**
   * Send heartbeat to background script
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await contextBridge.sendMessage('background', 'mcp:heartbeat', { timestamp: Date.now() }, { timeout: 5000 });
    } catch (error) {
      // Heartbeat failure might indicate connection issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Heartbeat failed: ${errorMessage}`);

      // Don't automatically change connection status on heartbeat failure
      // Let the background script handle connection status updates
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public API wrappers                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Call a tool on the MCP server with enhanced error handling and validation
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    if (!toolName || typeof toolName !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    // Meta-tools (get_tool_schema / tool_lookup) resolve entirely client-side
    // from the tool store — no MCP server needed. Intercept BEFORE the
    // connection guard and BEFORE contextBridge so they work offline and never
    // reach the background/MCP proxy. Same result shape as a real tool call.
    if (META_TOOLS.has(toolName)) {
      logMessage(`[McpClient] Handling meta-tool locally: ${toolName}`);
      return runMetaTool(toolName, args || {});
    }

    // Validate connection status before making the call.
    // Virtual browser_* tools execute locally in the background and work with no
    // MCP server connected — only gate real MCP tools on connection status.
    const connectionStore = useConnectionStore.getState();
    if (!toolName.startsWith('browser_') && connectionStore.status !== 'connected') {
      throw new Error(`Not connected to MCP server. Current status: ${connectionStore.status}. Please check your connection.`);
    }

    logMessage(`[McpClient] Calling tool: ${toolName} with args: ${JSON.stringify(args)}`);

    const adapterName = pluginRegistry.getActivePlugin()?.name || 'unknown';

    // Generate execution ID for tracking
    const executionId = useToolStore.getState().startToolExecution(toolName, args);

    try {
      const result = await contextBridge.sendMessage(
        'background',
        'mcp:call-tool',
        { toolName, args, adapterName }, // Pass adapter name to background
        { timeout: 30_000 }
      );

      logMessage(`[McpClient] Tool call successful: ${toolName}`);

      // Tool errors usually come back as RESOLVED results (proxy: isError:true;
      // browser tools: plain text starting with the tool name), not thrown errors —
      // append the schema hint here too so the model can self-correct.
      this.appendSchemaHint(toolName, result);

      // Update tool execution with success
      useToolStore.getState().completeToolExecution(executionId, result, 'success');

      // Emit event for tracking
      eventBus.emit('tool:execution-completed', {
        execution: {
          id: executionId,
          toolName,
          parameters: args,
          result,
          timestamp: Date.now(),
          status: 'success' as const
        }
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Tool call failed: ${toolName} - ${errorMessage}`);

      // Update tool execution with error
      useToolStore.getState().completeToolExecution(executionId, null, 'error', errorMessage);

      // Emit error event
      eventBus.emit('tool:execution-failed', {
        toolName,
        error: errorMessage,
        callId: executionId
      });

      // Check if this is a connection-related error
      if (this.isConnectionError(errorMessage)) {
        logMessage(`[McpClient] Tool call failed due to connection issue, updating connection status`);
        connectionStore.setDisconnected(`Tool call failed: ${errorMessage}`);
      }

      // Schema-on-error: if this looks like a validation error and we know the
      // tool's schema client-side, append it so the model can self-correct.
      const failedTool = useToolStore.getState().availableTools.find(x => x.name === toolName);
      if (failedTool && SCHEMA_HINT_TRIGGER.test(errorMessage)) {
        throw new Error(
          `${errorMessage}\n\nExpected input_schema for ${toolName}:\n` +
            JSON.stringify(failedTool.input_schema, null, 2),
        );
      }

      throw error;
    }
  }

  /**
   * Mutates an error-looking RESOLVED tool result to append the tool's
   * input_schema. Proxy errors arrive as isError:true results; browser-tool
   * validation errors arrive as short plain-text results starting with the tool
   * name (e.g. "browser_read_tab requires a numeric tabId ..."). Legit content
   * results never match both the error shape and the validation wording.
   */
  private appendSchemaHint(toolName: string, result: any): void {
    const item = Array.isArray(result?.content)
      ? result.content.find((c: any) => c?.type === 'text' && typeof c.text === 'string')
      : undefined;
    if (!item) return;
    const text: string = item.text;
    const looksLikeError =
      result?.isError === true || text.startsWith('Error') || text.startsWith(`${toolName} `);
    if (!looksLikeError || text.length > 600 || text.includes('Expected input_schema')) return;
    if (!SCHEMA_HINT_TRIGGER.test(text)) return;
    const tool = useToolStore.getState().availableTools.find(t => t.name === toolName);
    if (!tool) return;
    item.text = `${text}\n\nExpected input_schema for ${toolName}:\n${JSON.stringify(tool.input_schema, null, 2)}`;
  }

  /**
   * Check if an error message indicates a connection problem
   */
  private isConnectionError(errorMessage: string): boolean {
    const connectionErrorPatterns = [
      /connection refused/i,
      /econnrefused/i,
      /timeout/i,
      /etimedout/i,
      /network error/i,
      /server unavailable/i,
      /could not connect/i,
      /connection failed/i,
      /transport error/i,
      /fetch failed/i,
      /chrome runtime error/i
    ];

    return connectionErrorPatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Retrieve the list of available tools with enhanced caching and validation
   */
  async getAvailableTools(forceRefresh = false): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage(`[McpClient] Getting available tools (forceRefresh: ${forceRefresh})`);

    try {
      const tools = await contextBridge.sendMessage(
        'background',
        'mcp:get-tools',
        { forceRefresh },
        { timeout: 10_000 }
      );

      // Validate and normalize tools
      const validatedTools = Array.isArray(tools) ? tools : [];
      const normalizedTools = validatedTools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.input_schema || tool.schema || {},
        // Legacy support
        schema: typeof tool.schema === 'string' ? tool.schema : JSON.stringify(tool.input_schema || {})
      }));

      // Update store for consumers
      useToolStore.getState().setAvailableTools(normalizedTools);

      logMessage(`[McpClient] Retrieved ${normalizedTools.length} tools`);
      return normalizedTools;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Failed to get available tools: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Force a reconnect to the MCP SSE endpoint with enhanced state management
   */
  async forceReconnect(): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage('[McpClient] Force reconnect requested');

    const connectionStore = useConnectionStore.getState();

    try {
      // Set reconnecting state
      connectionStore.startReconnecting();

      // Emit reconnecting event immediately
      eventBus.emit('connection:status-changed', { status: 'reconnecting', error: undefined });

      const response = await contextBridge.sendMessage(
        'background',
        'mcp:force-reconnect',
        {},
        { timeout: 25_000 } // Increased timeout for reconnection
      );

      const isConnected = response?.isConnected ?? false;

      if (isConnected) {
        connectionStore.setConnected(Date.now());
        logMessage('[McpClient] Force reconnect successful');

        // Emit connected event for other components
        eventBus.emit('connection:status-changed', { status: 'connected', error: undefined });

        // Refresh tools after successful reconnection
        try {
          await this.getAvailableTools(true);
          logMessage('[McpClient] Tools refreshed after successful reconnection');
        } catch (toolError) {
          logMessage(`[McpClient] Failed to refresh tools after reconnect: ${toolError instanceof Error ? toolError.message : String(toolError)}`);
          // Don't fail the reconnection just because tool refresh failed
        }
      } else {
        const errorMsg = response?.error || 'Reconnect attempt failed';
        connectionStore.setDisconnected(errorMsg);
        logMessage(`[McpClient] Force reconnect failed: ${errorMsg}`);

        // Emit disconnected event for other components
        eventBus.emit('connection:status-changed', { status: 'disconnected', error: errorMsg });
      }

      return isConnected;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      connectionStore.setDisconnected(`Reconnect failed: ${errorMessage}`);
      logMessage(`[McpClient] Force reconnect error: ${errorMessage}`);

      // Emit error event for other components
      eventBus.emit('connection:status-changed', { status: 'error', error: `Reconnect failed: ${errorMessage}` });

      throw error;
    }
  }

  /**
   * Force an immediate connection status check
   */
  async forceConnectionStatusCheck(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage('[McpClient] Forcing immediate connection status check');

    try {
      const statusResponse = await this.getCurrentConnectionStatus();
      if (statusResponse) {
        logMessage(`[McpClient] Immediate connection status: ${statusResponse.status} (isConnected: ${statusResponse.isConnected})`);
        const connectionStatus = statusResponse.status as ConnectionStatus;
        this.handleConnectionStatusChange(connectionStatus, undefined);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Failed to get immediate connection status: ${errorMessage}`);
      // Don't throw - this is a best-effort check
    }
  }

  /**
   * Fetch current server configuration from background storage
   */
  async getServerConfig(): Promise<ServerConfig> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage('[McpClient] Getting server config');

    try {
      const config = await contextBridge.sendMessage(
        'background',
        'mcp:get-server-config',
        {},
        { timeout: 5_000 }
      );

      logMessage('[McpClient] Server config retrieved successfully');
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Failed to get server config: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get current connection status from background script
   */
  async getCurrentConnectionStatus(): Promise<{ status: string; isConnected: boolean; timestamp: number }> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage('[McpClient] Getting current connection status');

    try {
      const statusResponse = await contextBridge.sendMessage(
        'background',
        'mcp:get-connection-status',
        {},
        { timeout: 5_000 }
      );

      logMessage(`[McpClient] Current connection status retrieved: ${statusResponse.status}`);
      return statusResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Failed to get current connection status: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update server configuration in background storage
   */
  async updateServerConfig(config: Partial<ServerConfig>): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('McpClient not initialized');
    }

    logMessage(`[McpClient] Updating server config: ${JSON.stringify(config)}`);

    try {
      const response = await contextBridge.sendMessage(
        'background',
        'mcp:update-server-config',
        { config },
        { timeout: 15_000 } // Increased timeout for reconnection process
      );

      const success = !!response?.success;

      if (success) {
        // Update local store
        useConnectionStore.getState().setServerConfig(config);
        logMessage('[McpClient] Server config updated successfully');
      } else {
        logMessage('[McpClient] Server config update failed');
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[McpClient] Failed to update server config: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return useConnectionStore.getState().status;
  }

  /**
   * Check if client is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopHeartbeat();
    this.isInitialized = false;
    logMessage('[McpClient] Cleanup completed');
  }

  /* ------------------------------------------------------------------ */
  /* Singleton helper                                                   */
  /* ------------------------------------------------------------------ */
  public static getInstance(): McpClient {
    if (!McpClient.instance) {
      McpClient.instance = new McpClient();
    }
    return McpClient.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (McpClient.instance) {
      McpClient.instance.cleanup();
      McpClient.instance = null;
    }
  }
}

// Export the singleton for app-wide use
export const mcpClient = McpClient.getInstance();
export type { McpClient };
