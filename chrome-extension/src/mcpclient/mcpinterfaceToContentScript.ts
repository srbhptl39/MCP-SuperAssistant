import {
  invokeMcpTool,
  fetchMcpPrimitives,
  isMcpServerConnected,
  forceReconnectToMcpServer,
  checkMcpServerConnection,
} from './officialmcpclient';

// Define the Primitive type locally
type PrimitiveType = 'resource' | 'tool' | 'prompt';
type PrimitiveValue = {
  name: string;
  description?: string;
  uri?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: unknown[];
};
type Primitive = {
  type: PrimitiveType;
  value: PrimitiveValue;
};

// Define a more specific type for messages from content scripts
interface ContentScriptMessage {
  type: string;
  command?: string; // For messages handled by chrome.runtime.onMessage
  requestId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  uri?: string;
  forceRefresh?: boolean;
  config?: { uri: string };
  timestamp?: number; // For HEARTBEAT
  forceCheck?: boolean; // For CHECK_CONNECTION
  status?: string; // For RECONNECT_STATUS
  success?: boolean; // For RECONNECT_RESULT
  isConnected?: boolean; // For RECONNECT_RESULT and CONNECTION_STATUS
  errorType?: string;
  errorMessage?: string;
  eventName?: string; // For analytics
  eventParams?: Record<string, unknown>; // For analytics
  [key: string]: any; // Allow other properties, but try to define known ones
}

/**
 * Class that manages communication between background script and content scripts
 * for MCP tool calling functionality.
 */
class McpInterface {
  private static instance: McpInterface | null = null;
  private connections: Map<string, chrome.runtime.Port> = new Map();
  private serverUrl: string = 'http://localhost:3006/sse'; // Default fallback, will be loaded from storage
  private isConnected: boolean = false;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private connectionCheckIntervalTime: number = 10000; // Reduced from 30000 to 10000ms
  private connectionLastActiveTimestamps: Map<string, number> = new Map();
  private connectionActivityCheckInterval: NodeJS.Timeout | null = null;
  private connectionActivityCheckTime: number = 15000; // 15 seconds
  private connectionTimeoutThreshold: number = 30000; // 30 seconds of inactivity before considered stale
  private isInitialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.setupConnectionListener();
    this.initializeServerUrl().then(() => {
      this.startConnectionCheck();
      this.startConnectionActivityCheck();
      this.isInitialized = true;
      console.log('[MCP Interface] Initialized with server URL:', this.serverUrl);
    });
  }

  /**
   * Initialize server URL from storage
   */
  private async initializeServerUrl(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('mcpServerUrl');
      if (result.mcpServerUrl) {
        this.serverUrl = result.mcpServerUrl;
        console.log(`[MCP Interface] Loaded server URL from storage: ${this.serverUrl}`);
      } else {
        console.log(`[MCP Interface] No stored server URL found, using default: ${this.serverUrl}`);
      }
    } catch (error) {
      console.error('[MCP Interface] Error loading server URL from storage:', error);
      console.log(`[MCP Interface] Using default server URL: ${this.serverUrl}`);
    }
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
   * Wait for the interface to be fully initialized (server URL loaded from storage)
   */
  public async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    // Poll until initialized
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (this.isInitialized) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Get the current server URL
   */
  public getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Start connection check - only run once on initialization
   * CRITICAL: No automatic reconnection - all reconnection is user-driven
   */
  private startConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    // Only do an initial check, no periodic checks
    // This ensures we only check once during page load and never automatically reconnect
    console.log('[MCP Interface] Performing initial connection check (one-time only)');
    this.checkServerConnection()
      .then(isConnected => {
        console.log(`[MCP Interface] Initial connection check result: ${isConnected ? 'Connected' : 'Disconnected'}`);
        this.isConnected = isConnected;
        this.broadcastConnectionStatus();
      })
      .catch(error => {
        console.error('[MCP Interface] Error during initial connection check:', error);
        this.isConnected = false;
        this.broadcastConnectionStatus();
      });

    // No interval is set - reconnection will only happen when explicitly requested by the user
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
   * Enhanced tool verification that checks if a tool exists without causing disconnection
   * This is more efficient than the current verifyToolExists method
   */
  private async enhancedToolVerification(
    toolName: string,
  ): Promise<{ exists: boolean; reason?: string; cached: boolean }> {
    try {
      const now = Date.now();
      const VERIFICATION_CACHE_TTL = 60000; // 1 minute cache for verification results

      // Check if we have recent primitives cache
      const hasFreshCache =
        this.toolDetailsCache.primitives.length > 0 && now - this.toolDetailsCache.lastFetch < VERIFICATION_CACHE_TTL;

      if (hasFreshCache) {
        // Use cached primitives for verification
        const toolExists = this.toolDetailsCache.primitives.some(
          (primitive: Primitive) => primitive.type === 'tool' && primitive.value.name === toolName,
        );

        return {
          exists: toolExists,
          reason: toolExists ? 'Found in cache' : `Tool '${toolName}' not found in cached primitives`,
          cached: true,
        };
      }

      // If no fresh cache, do a lightweight verification call
      console.log(`[MCP Interface] Performing lightweight verification for tool '${toolName}'`);

      // Get fresh primitives but don't update the main cache to avoid race conditions
      const primitives: Primitive[] = await fetchMcpPrimitives(this.serverUrl, false);

      const toolExists = primitives.some(
        (primitive: Primitive) => primitive.type === 'tool' && primitive.value.name === toolName,
      );

      if (toolExists) {
        return { exists: true, reason: 'Verified with server', cached: false };
      } else {
        // Generate a helpful list of available tools for debugging
        const availableTools = primitives
          .filter((p: Primitive) => p.type === 'tool')
          .map((p: Primitive) => p.value.name) // Ensure p is typed here if not inferred
          .slice(0, 5); // Limit to first 5 tools

        const toolList =
          availableTools.length > 0
            ? ` Available tools include: ${availableTools.join(', ')}${primitives.filter((p: Primitive) => p.type === 'tool').length > 5 ? '...' : ''}` // Ensure p is typed here
            : ' No tools are currently available from the server.';

        return {
          exists: false,
          reason: `Tool '${toolName}' not found on server.${toolList}`,
          cached: false,
        };
      }
    } catch (error) {
      console.warn(`[MCP Interface] Enhanced verification failed for '${toolName}':`, error);
      // For verification failures, be optimistic but log the issue
      return {
        exists: true,
        reason: 'Verification failed, proceeding optimistically',
        cached: false,
      };
    }
  }

  /**
   * Handle messages from content scripts
   */
  private async handleMessage(connectionId: string, message: ContentScriptMessage): Promise<void> {
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
  private sendHeartbeatResponse(connectionId: string, timestamp: number | undefined): void {
    const port = this.connections.get(connectionId);
    if (port) {
      try {
        port.postMessage({
          type: 'HEARTBEAT_RESPONSE',
          timestamp: timestamp !== undefined ? timestamp : Date.now(), // Provide a default if undefined
          serverTimestamp: Date.now(),
        });
      } catch (error) {
        // Explicitly type error
        const typedError = error instanceof Error ? error : new Error(String(error));
        console.error(`[MCP Interface] Error sending heartbeat response to ${connectionId}:`, typedError);
        // Remove the connection if we can't send messages to it
        this.connections.delete(connectionId);
        this.connectionLastActiveTimestamps.delete(connectionId);
      }
    }
  }

  /**
   * Handle tool call requests from content scripts with enhanced verification
   */
  private async handleToolCall(connectionId: string, message: ContentScriptMessage): Promise<void> {
    const { requestId, toolName, args } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    if (!requestId || !toolName) {
      console.error(`[MCP Interface] Invalid tool call request:`, message);
      this.sendError(connectionId, 'INVALID_REQUEST', 'Invalid tool call request');
      return;
    }

    console.log(`[MCP Interface] Handling tool call for ${toolName} with request ${requestId}`);

    try {
      // First, verify the tool exists using enhanced verification
      const verification = await this.enhancedToolVerification(toolName);

      if (!verification.exists) {
        console.warn(`[MCP Interface] Tool '${toolName}' not found on server:`, verification.reason);
        // This is a tool-specific error, not a connection error
        this.sendError(
          connectionId,
          'TOOL_NOT_FOUND',
          verification.reason || `Tool '${toolName}' is not available on the MCP server`,
          requestId,
        );
        return;
      }

      // Tool exists, proceed with the call
      console.log(
        `[MCP Interface] Tool '${toolName}' verified (${verification.cached ? 'cached' : 'fresh'}), proceeding with call`,
      );

      // Validate and sanitize arguments
      console.log(
        `[MCP Interface] Args type: ${typeof args}, isArray: ${Array.isArray(args)}, keys: ${args ? Object.keys(args) : 'null'}`,
      );
      console.log(`[MCP Interface] Calling tool ${toolName} with args:`, args);

      // Sanitize arguments to ensure they're serializable
      let sanitizedArgs: { [key: string]: unknown } = {};
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        try {
          // Deep clone and sanitize the arguments
          sanitizedArgs = JSON.parse(JSON.stringify(args)) as { [key: string]: unknown };
          console.log(`[MCP Interface] Sanitized args:`, sanitizedArgs);
        } catch (sanitizeError) {
          console.error(`[MCP Interface] Error sanitizing arguments:`, sanitizeError);
          this.sendError(
            connectionId,
            'INVALID_ARGS',
            `Invalid arguments: ${sanitizeError instanceof Error ? sanitizeError.message : String(sanitizeError)}`,
            requestId,
          );
          return;
        }
      } else if (args === null || args === undefined) {
        sanitizedArgs = {}; // Default to empty object if args are null or undefined
      } else {
        // This case should ideally not be reached if types are enforced earlier,
        // but it's a safeguard.
        console.error(`[MCP Interface] Invalid arguments type for tool ${toolName}:`, typeof args, args);
        this.sendError(
          connectionId,
          'INVALID_ARGS',
          `Invalid arguments type: expected object, got ${typeof args}`,
          requestId,
        );
        return;
      }

      // Call the tool with enhanced error handling
      const result = await invokeMcpTool(this.serverUrl, toolName, sanitizedArgs);

      console.log(`[MCP Interface] Tool call ${requestId} completed successfully`);

      // Send success response
      port.postMessage({
        type: 'TOOL_CALL_RESULT',
        requestId,
        result,
      });
    } catch (error) {
      console.error(`[MCP Interface] Tool call ${requestId} failed:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Enhanced error categorization to prevent unnecessary disconnections
      const errorCategory = this.categorizeError(error as Error);

      // CRITICAL: Only update connection status for actual connection errors
      if (errorCategory.isConnectionError && !errorCategory.isToolError) {
        console.warn(`[MCP Interface] Connection error detected, updating status: ${errorMessage}`);
        this.isConnected = false;
        this.broadcastConnectionStatus();
      } else {
        console.log(
          `[MCP Interface] ${errorCategory.category} error (not updating connection status): ${errorMessage}`,
        );
        // Don't update connection status for tool-specific errors or unknown errors
      }

      // Send error response with appropriate error type
      const errorType = errorCategory.isToolError
        ? 'TOOL_CALL_ERROR'
        : errorCategory.isConnectionError
          ? 'CONNECTION_ERROR'
          : 'UNKNOWN_ERROR';

      this.sendError(connectionId, errorType, errorMessage, requestId);
    }
  }

  /**
   * Verify if a tool exists before calling it with enhanced caching
   */
  private async verifyToolExists(toolName: string): Promise<{ exists: boolean; reason?: string }> {
    try {
      // Get the current primitives (this will use cache if available)
      const primitives = await this.getAvailableToolsFromServer(false);

      // Check if the tool exists in the primitives list
      const toolExists = primitives.some(primitive => primitive.type === 'tool' && primitive.value.name === toolName);

      if (toolExists) {
        console.log(`[MCP Interface] Tool verification for '${toolName}': exists`);
        return { exists: true };
      } else {
        const availableTools = primitives
          .filter(p => p.type === 'tool')
          .map(p => p.value.name)
          .slice(0, 10); // Show first 10 tools

        console.log(
          `[MCP Interface] Tool '${toolName}' not found. Available tools (first 10): ${availableTools.join(', ')}`,
        );

        return {
          exists: false,
          reason: `Tool '${toolName}' is not available. ${availableTools.length > 0 ? `Available tools include: ${availableTools.join(', ')}${primitives.filter(p => p.type === 'tool').length > 10 ? '...' : ''}` : 'No tools are currently available.'}`,
        };
      }
    } catch (error) {
      console.warn(
        `[MCP Interface] Could not verify tool existence for '${toolName}', allowing call to proceed:`,
        error,
      );
      // If we can't verify, allow the call to proceed (fail-open approach)
      return { exists: true, reason: 'Verification failed, proceeding optimistically' };
    }
  }

  /**
   * Enhanced error categorization to prevent unnecessary disconnections
   */
  private categorizeError(error: Error): { isConnectionError: boolean; isToolError: boolean; category: string } {
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
      /filesystem\.read_file not found/i, // Specific filesystem tool error
      /tool '[^']+' is not available/i, // Generic tool availability error
      /mcp error.*tool.*not found/i, // MCP specific tool not found
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
      /server not available/i,
      /could not connect/i,
      /connection failed/i,
      /transport error/i,
      /socket error/i,
      /fetch failed/i,
      /cors error/i,
      /http 500/i,
      /http 502/i,
      /http 503/i,
    ];

    // Special case: 404 and 403 errors from server availability checks should be connection errors
    // But 404/403 in tool responses might be tool-specific
    const serverAvailabilityErrorPatterns = [
      /http 404.*considering available/i,
      /http 403.*considering available/i,
      /method not allowed.*considering available/i,
    ];

    // Check if it's a tool-specific error first (highest priority)
    const isToolError = toolErrorPatterns.some(pattern => pattern.test(errorMessage));
    if (isToolError) {
      return {
        isConnectionError: false,
        isToolError: true,
        category: 'tool_error',
      };
    }

    // Check if it's a server availability error
    const isServerAvailabilityError = serverAvailabilityErrorPatterns.some(pattern => pattern.test(errorMessage));
    if (isServerAvailabilityError) {
      return {
        isConnectionError: true,
        isToolError: false,
        category: 'server_availability_error',
      };
    }

    // Check if it's a connection error
    const isConnectionError = connectionErrorPatterns.some(pattern => pattern.test(errorMessage));
    if (isConnectionError) {
      return {
        isConnectionError: true,
        isToolError: false,
        category: 'connection_error',
      };
    }

    // For ambiguous errors, be conservative and don't treat as connection errors
    return {
      isConnectionError: false,
      isToolError: false,
      category: 'unknown_error',
    };
  }

  // Cache for tool details to reduce server requests
  private toolDetailsCache: {
    primitives: Primitive[];
    lastFetch: number;
    fetchPromise: Promise<Primitive[]> | null;
    inProgress: boolean;
  } = {
    primitives: [],
    lastFetch: 0,
    fetchPromise: null,
    inProgress: false,
  };

  /**
   * Handle get tool details requests from content scripts with caching
   */
  private async handleGetToolDetails(connectionId: string, message: ContentScriptMessage): Promise<void> {
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
      // Check if server is connected first
      const isConnected = await this.checkServerConnection();
      if (!isConnected) {
        console.error(`[MCP Interface] Cannot get tool details: MCP server is not connected`);
        this.sendError(
          connectionId,
          'SERVER_UNAVAILABLE',
          'MCP server is not available. Please check your connection settings.',
          requestId,
        );
        return;
      }

      // Check if we can use the cache (cache is valid for 20 seconds)
      const now = Date.now();
      const CACHE_TTL = 20000; // 20 seconds

      // Use cache if available and not force refreshing and cache is fresh
      if (
        !forceRefresh &&
        this.toolDetailsCache.primitives.length > 0 &&
        now - this.toolDetailsCache.lastFetch < CACHE_TTL
      ) {
        console.log(
          `[MCP Interface] Using cached primitives for request ${requestId} (age: ${now - this.toolDetailsCache.lastFetch}ms)`,
        );

        // Filter to only include tools
        const tools = this.toolDetailsCache.primitives.filter(p => p.type === 'tool');

        // Send the cached result back to the content script
        port.postMessage({
          type: 'TOOL_DETAILS_RESULT',
          result: tools,
          requestId,
        });

        console.log(
          `[MCP Interface] Tool details request ${requestId} completed successfully with ${tools.length} tools (from cache)`,
        );
        return;
      }

      // If there's already a request in progress, wait for it to complete
      if (this.toolDetailsCache.inProgress && this.toolDetailsCache.fetchPromise) {
        console.log(`[MCP Interface] Waiting for in-progress fetch to complete for request ${requestId}`);
        try {
          const primitivesFromCache = await this.toolDetailsCache.fetchPromise;
          // Filter to only include tools
          const toolsFromCache = primitivesFromCache.filter(p => p.type === 'tool');
          port.postMessage({ type: 'TOOL_DETAILS_RESULT', result: toolsFromCache, requestId });
          console.log(
            `[MCP Interface] Tool details request ${requestId} completed successfully with ${toolsFromCache.length} tools (from shared request)`,
          );
          return;
        } catch (error) {
          // Type annotation for error
          console.error(`[MCP Interface] Shared request failed for ${requestId}, will attempt new request:`, error);
        }
      }

      // Start a new fetch request
      this.toolDetailsCache.inProgress = true;
      const fetchPrimitivesPromise = this.getAvailableToolsFromServer(!!forceRefresh);
      this.toolDetailsCache.fetchPromise = fetchPrimitivesPromise; // Store the promise

      const primitives = await fetchPrimitivesPromise; // Await the local promise variable

      // Update the cache (only if successful)
      this.toolDetailsCache.primitives = primitives; // Store all primitives
      this.toolDetailsCache.lastFetch = Date.now();

      const tools = primitives.filter(p => p.type === 'tool'); // Filter for sending

      // Send the result back to the content script
      port.postMessage({
        type: 'TOOL_DETAILS_RESULT',
        result: tools,
        requestId,
      });

      console.log(
        `[MCP Interface] Tool details request ${requestId} completed successfully with ${tools.length} tools (fresh fetch)`,
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
    } finally {
      // Mark request as complete
      this.toolDetailsCache.inProgress = false;
      this.toolDetailsCache.fetchPromise = null;
    }
  }

  /**
   * Handle force reconnect requests from content scripts
   */
  private async handleForceReconnect(connectionId: string, message: ContentScriptMessage): Promise<void> {
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

      // Force reconnect to the MCP server with improved error handling
      try {
        await forceReconnectToMcpServer(this.serverUrl);
      } catch (reconnectError) {
        // Check if this is a permanent failure (connection limits exceeded)
        if (reconnectError instanceof Error && reconnectError.message.includes('Connection permanently failed')) {
          console.error(`[MCP Interface] Permanent connection failure:`, reconnectError.message);

          // Send specific error about permanent failure
          this.sendError(
            connectionId,
            'PERMANENT_CONNECTION_FAILURE',
            `Connection failed permanently. Please check your server configuration and restart the extension if needed. ${reconnectError.message}`,
            requestId,
          );
          return;
        }

        // Check for specific server errors and provide better feedback
        if (reconnectError instanceof Error) {
          let userFriendlyMessage = reconnectError.message;

          if (reconnectError.message.includes('404') || reconnectError.message.includes('not found')) {
            userFriendlyMessage =
              'Server URL not found (404). Please verify your MCP server URL is correct and the server is running.';
          } else if (reconnectError.message.includes('403')) {
            userFriendlyMessage = 'Access forbidden (403). Please check server permissions and authentication.';
          } else if (
            reconnectError.message.includes('500') ||
            reconnectError.message.includes('502') ||
            reconnectError.message.includes('503')
          ) {
            userFriendlyMessage = 'Server error detected. The MCP server may be experiencing issues.';
          } else if (
            reconnectError.message.includes('Connection refused') ||
            reconnectError.message.includes('ECONNREFUSED')
          ) {
            userFriendlyMessage = 'Connection refused. Please verify the MCP server is running at the configured URL.';
          } else if (reconnectError.message.includes('timeout')) {
            userFriendlyMessage = 'Connection timeout. The server may be slow to respond or unreachable.';
          } else if (reconnectError.message.includes('ENOTFOUND')) {
            userFriendlyMessage = 'Server not found. Please check the server URL and your network connection.';
          } else if (reconnectError.message.includes('Could not connect to server')) {
            userFriendlyMessage =
              'Unable to connect to the MCP server. Please verify the server URL and ensure the server is running.';
          }

          this.sendError(connectionId, 'SERVER_CONNECTION_ERROR', userFriendlyMessage, requestId);
          return;
        }

        // For other errors, re-throw to be handled by the general catch block
        throw reconnectError;
      }

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
  }

  /**
   * Get available tools from the MCP server
   * Uses the getPrimitivesWithSSE function to get all primitives directly
   * @param forceRefresh Whether to force a fresh request and bypass cache
   */
  private async getAvailableToolsFromServer(forceRefresh: boolean = false): Promise<Primitive[]> {
    try {
      console.log(`[MCP Interface] Getting available primitives from server (forceRefresh: ${forceRefresh})`);
      const primitives = await fetchMcpPrimitives(this.serverUrl, forceRefresh);
      console.log(`[MCP Interface] Found ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      // Added type annotation for error
      const typedError = error instanceof Error ? error : new Error(String(error));
      console.error('[MCP Interface] Failed to get available primitives:', typedError);

      if (
        typedError.message.includes('Could not connect to server') ||
        typedError.message.includes('Failed to fetch')
      ) {
        this.isConnected = false;
        this.broadcastConnectionStatus();
        throw new Error('Unable to connect to MCP server. Please check your server configuration and try again.');
      }
      return []; // Return empty for other errors to be resilient
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
    this.serverUrl = url;
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
  private async handleGetServerConfig(connectionId: string, message: ContentScriptMessage): Promise<void> {
    const { requestId } = message;
    const port = this.connections.get(connectionId);

    if (!port) {
      console.error(`[MCP Interface] Connection ${connectionId} not found`);
      return;
    }

    console.log(`[MCP Interface] Handling get server config request ${requestId}`);

    try {
      // CRITICAL FIX: Always fetch the latest value from storage instead of using cached serverUrl
      // This ensures we return the actual stored config, not potentially stale in-memory value
      let currentServerUrl = this.serverUrl; // Default fallback

      try {
        const result = await chrome.storage.local.get('mcpServerUrl');
        if (result.mcpServerUrl) {
          currentServerUrl = result.mcpServerUrl;
          // Also update our in-memory cache to stay in sync
          this.serverUrl = result.mcpServerUrl;
          console.log(`[MCP Interface] Retrieved server URL from storage: ${currentServerUrl}`);
        } else {
          console.log(`[MCP Interface] No server URL in storage, using current: ${currentServerUrl}`);
        }
      } catch (storageError) {
        console.error(`[MCP Interface] Error reading from storage, using cached value:`, storageError);
        // Continue with the cached value as fallback
      }

      // Send the current server URL back to the content script
      port.postMessage({
        type: 'SERVER_CONFIG_RESULT',
        config: { uri: currentServerUrl },
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
  private async handleUpdateServerConfig(connectionId: string, message: ContentScriptMessage): Promise<void> {
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

      // Update the server URL
      this.updateServerUrl(config.uri);

      // Save the server URL to storage
      try {
        await chrome.storage.local.set({ mcpServerUrl: config.uri });
        console.log(`[MCP Interface] Saved server URL to storage: ${config.uri}`);
      } catch (storageError) {
        console.error(`[MCP Interface] Error saving server URL to storage:`, storageError);
        // Continue even if storage fails - we've already updated the in-memory URL
      }

      // Force reconnect to the new server
      console.log(`[MCP Interface] Forcing reconnection to new server URL: ${config.uri}`);
      try {
        await forceReconnectToMcpServer(config.uri);
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
