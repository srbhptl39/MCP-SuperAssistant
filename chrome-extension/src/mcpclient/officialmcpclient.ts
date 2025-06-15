import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
// import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; // DISABLED: Using SSE only
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * CRITICAL FIXES FOR CONNECTION ISSUES:
 * 
 * 1. CONSECUTIVE FAILURE LIMIT BUG: Fixed the bug where after 3 failed connection attempts,
 *    the client would permanently refuse to reconnect (requiring browser restart).
 *    Now allows recovery attempts during periodic checks and user-initiated reconnects.
 * 
 * 2. CONNECTION STATE INCONSISTENCY: Enhanced connection validation to actually test
 *    the connection health instead of just trusting internal flags. This detects
 *    when SSE connections drop silently.
 * 
 * 3. SSE CONNECTION MONITORING: Added connection monitoring to detect when SSE
 *    connections drop unexpectedly and mark the client as disconnected immediately.
 * 
 * 4. ENHANCED ERROR RECOVERY: Improved error categorization and recovery logic
 *    to prevent permanent disconnection states and allow automatic recovery.
 * 
 * 5. PERIODIC RECOVERY: Added background recovery mechanisms that reset failure
 *    counters periodically to ensure connections can be re-established automatically.
 * 
 * 6. STALE CONNECTION PREVENTION: Added aggressive connection cleanup (forceDisconnect)
 *    to properly terminate old connections before creating new ones. This prevents
 *    the timeout issues caused by stale SSE connections that aren't properly closed.
 *    - Reduced connection timeout from 10s to 5s for faster failure detection
 *    - Added background cleanup with timeout protection
 *    - Enhanced health checks every 30 seconds instead of 60 seconds
 */

// Define types for primitives
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

// Define spinner type
interface Spinner {
  success: (message?: string) => void;
  error: (message: string) => void;
}

/**
 * Singleton class to manage a persistent connection to the MCP server
 */
class PersistentMcpClient {
  private static instance: PersistentMcpClient | null = null;
  private client: Client | null = null;
  private transport: Transport | null = null;
  private serverUrl: string = '';
  private isConnected: boolean = false;
  private connectionPromise: Promise<Client> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3; // Reduced from 5 to 3
  private reconnectDelay: number = 2000;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private lastConnectionCheck: number = 0;
  private connectionCheckInterval: number = 30000; // 30 seconds
  private primitives: Primitive[] | null = null;
  private primitivesLastFetched: number = 0;
  private primitivesMaxAge: number = 300000; // 5 minutes
  private lastConnectionError: string | null = null;
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    console.log('[PersistentMcpClient] Initialized');
  }

  /**
   * Get the singleton instance of PersistentMcpClient
   */
  public static getInstance(): PersistentMcpClient {
    if (!PersistentMcpClient.instance) {
      PersistentMcpClient.instance = new PersistentMcpClient();
    }
    return PersistentMcpClient.instance;
  }

  /**
   * Connect to the MCP server
   * @param uri The URI of the MCP server
   * @returns Promise that resolves to the client instance
   */
  public async connect(uri: string): Promise<Client> {
    // FIXED: Allow reconnection attempts during periodic checks and user-initiated reconnects
    // Only block connection if we've exceeded failures AND it's not a periodic check or force reconnect
    const isPeriodicOrForceReconnect = this.reconnectAttempts === 0; // Reset during forceReconnect
    if (this.consecutiveFailures >= this.maxConsecutiveFailures && !isPeriodicOrForceReconnect) {
      // Reset consecutive failures to allow periodic background reconnections
      // This prevents permanent connection blocking that requires browser restart
      console.warn(`[PersistentMcpClient] Resetting consecutive failures (${this.consecutiveFailures}) to allow reconnection attempts`);
      this.consecutiveFailures = Math.floor(this.maxConsecutiveFailures / 2); // Reduce but don't reset completely
    }

    // If we're already connecting to the same URI and have a valid promise, return it
    if (this.connectionPromise && this.serverUrl === uri && this.isConnected) {
      console.log('[PersistentMcpClient] Connection already established, returning existing client');
      return this.connectionPromise;
    }

    // If we're already trying to connect to the same URI, wait for that connection
    if (this.connectionPromise && this.serverUrl === uri) {
      console.log('[PersistentMcpClient] Connection already in progress, waiting for completion');
      try {
        return await this.connectionPromise;
      } catch (error) {
        console.warn('[PersistentMcpClient] Existing connection attempt failed, starting new one');
        this.connectionPromise = null;
      }
    }

    // ENHANCED: Always ensure complete disconnection before new connection attempts
    // This prevents stale connection issues that cause timeouts
    if (this.client || this.transport || this.connectionPromise) {
      console.log('[PersistentMcpClient] Existing connection detected, performing complete cleanup first');
      await this.forceDisconnect();
    }

    this.serverUrl = uri;

    // Create a new connection promise
    console.log(`[PersistentMcpClient] Creating new connection to ${uri}`);
    this.connectionPromise = this.createConnection(uri);
    
    try {
      const result = await this.connectionPromise;
      return result;
    } catch (error) {
      // Clear the connection promise on failure to avoid reusing failed promises
      this.connectionPromise = null;
      throw error;
    }
  }

  /**
   * Create a connection to the MCP server
   * @param uri The URI of the MCP server
   * @returns Promise that resolves to the client instance
   */
  private async createConnection(uri: string): Promise<Client> {
    const spinner = createSpinner(`Connecting to MCP server at ${uri}...`);

    try {
      // Validate URI
      if (!uri || typeof uri !== 'string') {
        throw new Error('URI must be a non-empty string');
      }

      // Parse and validate the URI
      let baseUrl: URL;
      try {
        baseUrl = new URL(uri);
      } catch (error) {
        throw new Error(`Invalid URI: ${uri}`);
      }

      spinner.success(`URI validated: ${uri}`);

      // Use SSE transport only (StreamableHTTP disabled)
      spinner.success(`Attempting connection with SSE transport...`);

      console.log('Connecting with SSE transport...');
      const client = new Client(
        {
          name: 'sse-client',
          version: '1.0.0',
        },
        { capabilities: {} },
      );

      // Set up notification handler
      client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
        console.debug('[server log]:', notification.params.data);
      });

      const transport = new SSEClientTransport(baseUrl);
      
      // ENHANCED: Reduce timeout to fail faster on stale connections
      const connectionTimeout = 5000; // 5 seconds instead of 10
      const connectionPromise = client.connect(transport);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timeout after ${connectionTimeout}ms. The server may be slow to respond or the SSE endpoint may not be functioning properly.`));
        }, connectionTimeout);
      });
      
      // Race between connection and timeout
      await Promise.race([connectionPromise, timeoutPromise]);

      console.log('Successfully connected using SSE transport');
      spinner.success(`Connected using SSE transport`);

      this.client = client;
      this.transport = transport;

      // ENHANCED: Add connection monitoring for SSE transport
      this.setupConnectionMonitoring(client, transport);

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.lastConnectionError = null;
      this.isConnected = true;
      this.lastConnectionCheck = Date.now();

      spinner.success(`Connected to MCP server`);
      return this.client;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // CRITICAL: Clean up all connection state on failure to prevent inconsistent state
      this.isConnected = false;
      this.client = null;
      this.transport = null;
      this.connectionPromise = null;

      // Enhanced error categorization for better user feedback
      let enhancedErrorMessage = errorMessage;
      if (errorMessage.includes('404') || errorMessage.includes('404 page not found')) {
        enhancedErrorMessage =
          'Server URL not found (404). Please check if the MCP server is running at the correct URL and verify the server configuration.';
      } else if (errorMessage.includes('403')) {
        enhancedErrorMessage = 'Access forbidden (403). Please check server permissions and authentication settings.';
      } else if (errorMessage.includes('429') || errorMessage.includes('HTTP 429')) {
        enhancedErrorMessage =
          'Rate limited (429). The server is temporarily blocking requests due to too many attempts. Please wait a moment and try again.';
      } else if (errorMessage.includes('405') || errorMessage.includes('Method Not Allowed')) {
        enhancedErrorMessage =
          'Method not allowed (405). The server is available but may not support the requested HTTP method. This is usually a temporary issue.';
      } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        enhancedErrorMessage =
          'Server error detected. The MCP server may be experiencing issues. Please try again later or contact your server administrator.';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused')) {
        enhancedErrorMessage =
          'Connection refused. Please verify the MCP server is running and accessible at the configured URL.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        enhancedErrorMessage =
          'Connection timeout. The server may be slow to respond or unreachable. Please check your network connection and server status.';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo ENOTFOUND')) {
        enhancedErrorMessage = 'Server not found. Please check the server URL and your network connection.';
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('SSE error')) {
        enhancedErrorMessage =
          'SSE connection failed. The server may be unreachable or not responding to Server-Sent Events. Please check if the MCP server is running and accessible.';
      } else if (errorMessage.includes('MCP endpoints not found')) {
        enhancedErrorMessage =
          'MCP endpoints not found (404). The server is running but does not have MCP service endpoints available. Please verify this is an MCP server.';
      } else if (errorMessage.includes('MCP server may be experiencing issues')) {
        enhancedErrorMessage =
          'The MCP server is experiencing internal errors. Please check server logs or contact the server administrator.';
      } else if (errorMessage.includes('MCP endpoints are not accessible')) {
        enhancedErrorMessage =
          'MCP service endpoints are not accessible. The server is running but MCP services may not be properly configured.';
      }

      this.lastConnectionError = enhancedErrorMessage;
      this.consecutiveFailures++;

      spinner.error(enhancedErrorMessage);

      // Log the failure count with enhanced message
      console.error(
        `[PersistentMcpClient] Connection attempt ${this.consecutiveFailures}/${this.maxConsecutiveFailures} failed: ${enhancedErrorMessage}`,
      );

      // Create a new error with the enhanced message
      const enhancedError = new Error(enhancedErrorMessage);
      enhancedError.stack = error instanceof Error ? error.stack : undefined;

      // Don't schedule reconnect - all reconnection is user-driven
      throw enhancedError;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  public async disconnect(): Promise<void> {
    const spinner = createSpinner(`Disconnecting from MCP server...`);
    
    try {
      // Attempt to close the client if we have one
      if (this.client) {
        try {
          await this.client.close();
          spinner.success(`Disconnected from MCP server`);
        } catch (closeError) {
          // Client close failed, but we still want to clean up state
          console.warn('[PersistentMcpClient] Client close failed, but cleaning up state:', closeError);
          spinner.success(`Cleaned up connection state (close failed but state reset)`);
        }
      }
      
      // Also try to close the transport directly if we have one
      if (this.transport) {
        try {
          // Some transports have a close method
          if ('close' in this.transport && typeof this.transport.close === 'function') {
            await this.transport.close();
          }
        } catch (transportError) {
          console.warn('[PersistentMcpClient] Transport close failed, but continuing cleanup:', transportError);
        }
      }
      
      if (!this.client && !this.transport) {
        spinner.success(`No active connection to disconnect`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[PersistentMcpClient] Disconnect error, but cleaning up state:', errorMessage);
      spinner.success(`Cleaned up connection state despite disconnect error`);
    } finally {
      // Always clean up all connection state regardless of errors
      this.isConnected = false;
      this.client = null;
      this.transport = null;
      this.connectionPromise = null;
      
      // Clear any pending reconnect
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      
      console.log('[PersistentMcpClient] Connection state fully reset');
    }
  }

  /**
   * Schedule a reconnection attempt
   * CRITICAL: No automatic reconnection - all reconnection is user-driven only
   */
  private scheduleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Log that we're not automatically reconnecting
    console.log('[PersistentMcpClient] No automatic reconnection - reconnection is user-driven only');

    // Reset reconnect attempts counter to ensure we don't hit the max limit
    // This allows user-initiated reconnects to always work
    this.reconnectAttempts = 0;

    // Do not schedule any automatic reconnection
    // All reconnection must be explicitly initiated by the user through the UI
  }

  /**
   * Check if the connection is still valid and reconnect if needed
   * @returns Promise that resolves to the client instance
   */
  public async ensureConnection(): Promise<Client> {
    // If we've never connected, throw an error
    if (!this.serverUrl) {
      throw new Error('No server URL set, call connect() first');
    }

    // ENHANCED: If we've exceeded consecutive failures, allow recovery attempt
    // but only reset failures if connection was previously established
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.log(`[PersistentMcpClient] Consecutive failures limit reached, attempting recovery...`);
      
      // Allow one recovery attempt by reducing failures
      this.consecutiveFailures = this.maxConsecutiveFailures - 1;
      console.log(`[PersistentMcpClient] Reduced consecutive failures to ${this.consecutiveFailures} for recovery attempt`);
    }

    // If we're already connected and it's been less than connectionCheckInterval since the last check, return the client
    if (this.isConnected && this.client && Date.now() - this.lastConnectionCheck < this.connectionCheckInterval) {
      return this.client;
    }

    // If we're not connected or it's been too long since the last check, reconnect
    // ENHANCED: Force cleanup before reconnection to prevent stale connection issues
    if (!this.isConnected || !this.client) {
      console.log('[PersistentMcpClient] Connection lost or invalid, performing cleanup before reconnection');
      await this.forceDisconnect();
    }
    
    this.connectionPromise = this.createConnection(this.serverUrl);
    return this.connectionPromise;
  }

  /**
   * Call a tool using the persistent connection
   * @param toolName The name of the tool to call
   * @param args The arguments to pass to the tool
   * @returns Promise that resolves to the result of the tool call
   */
  public async callTool(toolName: string, args: { [key: string]: unknown }): Promise<any> {
    const spinner = createSpinner(`Calling tool ${toolName}...`);

    try {
      // Ensure we have a valid connection
      const client = await this.ensureConnection();

      // Validate arguments
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Tool name must be a non-empty string');
      }

      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('Arguments must be an object with string keys');
      }

      // Call the tool
      console.log('Args: ', args);
      const result = await client.callTool({ name: toolName, arguments: args });
      spinner.success(`Tool ${toolName} called successfully`);
      prettyPrint(result);

      // Update last connection check time
      this.lastConnectionCheck = Date.now();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      spinner.error(errorMessage);

      // Check if this is a connection-related error that requires cleanup
      if (this.isConnectionError(errorMessage)) {
        console.warn('[PersistentMcpClient] Connection error detected during tool call, marking as disconnected');
        this.isConnected = false;
        this.client = null;
        this.transport = null;
        this.connectionPromise = null;
      }

      throw error;
    }
  }

  /**
   * Helper method to determine if an error is connection-related
   * Made public for external connection health checks
   */
  public isConnectionError(errorMessage: string): boolean {
    const connectionErrorPatterns = [
      /connection refused/i,
      /econnrefused/i,
      /timeout/i,
      /etimedout/i,
      /failed to fetch/i,
      /sse error/i,
      /network error/i,
      /server unavailable/i,
      /connection failed/i,
      /transport error/i,
      /socket error/i,
    ];

    return connectionErrorPatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Get all primitives using the persistent connection
   * @returns Promise that resolves to an array of primitives
   */
  public async getPrimitives(): Promise<Primitive[]> {
    // If we have cached primitives and they're not too old, return them
    if (
      this.primitives &&
      this.primitivesLastFetched &&
      Date.now() - this.primitivesLastFetched < this.primitivesMaxAge
    ) {
      return this.primitives;
    }

    const spinner = createSpinner(`Retrieving primitives...`);

    try {
      // Ensure we have a valid connection
      const client = await this.ensureConnection();

      // Get primitives
      spinner.success(`Retrieving primitives...`);
      const primitives = await listPrimitives(client);
      spinner.success(`Retrieved ${primitives.length} primitives`);

      // Cache primitives
      this.primitives = primitives;
      this.primitivesLastFetched = Date.now();

      // Update last connection check time
      this.lastConnectionCheck = Date.now();

      return primitives;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      spinner.error(errorMessage);

      // Check if this is a connection-related error that requires cleanup
      if (this.isConnectionError(errorMessage)) {
        console.warn('[PersistentMcpClient] Connection error detected during primitives fetch, marking as disconnected');
        this.isConnected = false;
        this.client = null;
        this.transport = null;
        this.connectionPromise = null;
      }

      throw error;
    }
  }

  /**
   * Get the connection status
   * @returns True if connected, false otherwise
   */
  public getConnectionStatus(): boolean {
    // For most calls, just return the current status without triggering checks
    // This prevents excessive network requests and false negatives

    // Only trigger a background check if we haven't checked in a very long time (60 seconds)
    const timeSinceLastCheck = Date.now() - this.lastConnectionCheck;
    if (timeSinceLastCheck > 60000) {
      // Don't wait for the promise to resolve, just trigger the check in background
      this.checkConnectionStatus().catch(error => {
        console.error('[PersistentMcpClient] Background connection check failed:', error);
      });
    }

    console.log(
      `[PersistentMcpClient] getConnectionStatus: ${this.isConnected} (last check: ${timeSinceLastCheck}ms ago)`,
    );
    return this.isConnected;
  }

  /**
   * Actively check if the server is still available
   * This is an async method that updates the isConnected flag
   */
  private async checkConnectionStatus(): Promise<boolean> {
    try {
      // If we don't have a server URL, we're not connected
      if (!this.serverUrl) {
        this.isConnected = false;
        return false;
      }

      // If we don't have an active client, we're definitely not connected
      if (!this.client) {
        this.isConnected = false;
        return false;
      }

      // For periodic connection checks, we should be conservative
      // Only mark as disconnected if we have clear evidence of connection failure
      // The client itself tracks connection state, so we trust that unless proven otherwise

      // Don't call isServerAvailable for periodic checks as it may give false negatives
      // The MCP client maintains its own connection state which is more reliable
      console.log(`[PersistentMcpClient] Connection check: client exists and marked as connected`);

      // Update the last check time
      this.lastConnectionCheck = Date.now();

      // Return the current connection state without changing it
      // Only actual connection errors should change this state
      return this.isConnected;
    } catch (error) {
      console.error(`[PersistentMcpClient] Error during connection status check:`, error);
      // Don't change connection status on check errors
      this.lastConnectionCheck = Date.now();
      return this.isConnected;
    }
  }

  /**
   * Force a reconnection to the MCP server
   * @param uri Optional new URI - if provided, will update the server URL before reconnecting
   */
  public async forceReconnect(uri?: string): Promise<void> {
    console.log('[PersistentMcpClient] Force reconnect initiated');
    
    // ENHANCED: Properly reset all failure counters and connection state for user-initiated reconnects
    this.consecutiveFailures = 0; // Complete reset for user-initiated reconnects
    this.lastConnectionError = null;
    this.reconnectAttempts = 0;

    // Clear the primitives cache to ensure we get fresh data from the new server
    this.clearCache();

    // ENHANCED: Use force disconnect for complete cleanup
    console.log('[PersistentMcpClient] Performing complete disconnection before reconnect');
    await this.forceDisconnect();

    // If a new URI is provided, update the server URL
    if (uri) {
      this.serverUrl = uri;
      console.log(`[PersistentMcpClient] Updated server URL to: ${uri}`);
    }

    // Reconnect with the current (possibly updated) server URL
    if (this.serverUrl) {
      console.log(`[PersistentMcpClient] Attempting reconnection to: ${this.serverUrl}`);
      await this.connect(this.serverUrl);
    } else {
      throw new Error('No server URL available for reconnection');
    }
  }

  /**
   * Cleanup old connections in background without blocking
   */
  private cleanupOldConnection(client: Client | null, transport: Transport | null): void {
    if (!client && !transport) {
      return;
    }

    // Run cleanup in background with timeout
    const cleanup = async () => {
      try {
        if (client) {
          await Promise.race([
            client.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Client close timeout')), 5000))
          ]);
        }
        
        if (transport && 'close' in transport && typeof transport.close === 'function') {
          await Promise.race([
            transport.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transport close timeout')), 5000))
          ]);
        }
        
        console.log('[PersistentMcpClient] Old connection cleaned up successfully');
      } catch (error) {
        console.warn('[PersistentMcpClient] Old connection cleanup failed (non-blocking):', error);
      }
    };

    cleanup(); // Run in background, don't await
  }

  /**
   * Clear the primitives cache to ensure we get fresh data from the server
   */
  public clearCache(): void {
    console.log('[PersistentMcpClient] Clearing primitives cache');
    this.primitives = null;
    this.primitivesLastFetched = 0;
  }

  /**
   * Get the server URL
   */
  public getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Get the client instance
   */
  public getClient(): Client | null {
    return this.client;
  }

  /**
   * Get detailed connection debug information
   */
  public getConnectionDebugInfo(): {
    isConnected: boolean;
    hasClient: boolean;
    hasTransport: boolean;
    hasConnectionPromise: boolean;
    serverUrl: string;
    consecutiveFailures: number;
    lastError: string | null;
    timeSinceLastCheck: number;
  } {
    return {
      isConnected: this.isConnected,
      hasClient: !!this.client,
      hasTransport: !!this.transport,
      hasConnectionPromise: !!this.connectionPromise,
      serverUrl: this.serverUrl,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastConnectionError,
      timeSinceLastCheck: Date.now() - this.lastConnectionCheck,
    };
  }

  /**
   * Reset the connection state completely
   * This is useful when the connection is in an inconsistent state
   */
  public resetConnectionState(): void {
    console.log('[PersistentMcpClient] Resetting connection state manually');
    this.isConnected = false;
    this.client = null;
    this.transport = null;
    this.connectionPromise = null;
    this.lastConnectionError = null;
    this.lastConnectionCheck = 0;
    
    // Clear any pending reconnect timers
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    // Don't reset failure counters here - those should persist for user feedback
    console.log('[PersistentMcpClient] Connection state reset complete');
  }

  /**
   * Abort any hanging connection and reset state
   * This is useful when a connection is stuck
   */
  public abortConnection(): void {
    console.log('[PersistentMcpClient] Aborting current connection');
    
    // Store references for background cleanup
    const clientToClose = this.client;
    const transportToClose = this.transport;
    
    // Immediately reset state
    this.isConnected = false;
    this.client = null;
    this.transport = null;
    this.connectionPromise = null;
    
    // Clean up old connections in background
    this.cleanupOldConnection(clientToClose, transportToClose);
    
    console.log('[PersistentMcpClient] Connection aborted');
  }

  /**
   * Reset connection state for recovery attempts
   * This method allows periodic background recovery without affecting ongoing connections
   */
  public resetForRecovery(): void {
    // Only reset if we're actually disconnected and have consecutive failures
    if (!this.isConnected && this.consecutiveFailures > 0) {
      console.log(`[PersistentMcpClient] Resetting connection state for recovery attempt (failures: ${this.consecutiveFailures})`);
      
      // Reduce consecutive failures to allow retry, but don't reset to 0 
      // to prevent excessive retries
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
      
      // Clear error state to allow fresh attempts
      if (this.consecutiveFailures === 0) {
        this.lastConnectionError = null;
      }
      
      console.log(`[PersistentMcpClient] Recovery reset complete, consecutive failures now: ${this.consecutiveFailures}`);
    }
  }

  /**
   * Set up connection monitoring for the SSE transport
   * This helps detect when the connection drops silently
   */
  private setupConnectionMonitoring(client: Client, transport: Transport): void {
    // Monitor for transport errors
    if ('addEventListener' in transport) {
      // If transport supports event listeners (like SSE), listen for errors
      try {
        (transport as any).addEventListener?.('error', (error: any) => {
          console.warn('[PersistentMcpClient] Transport error detected:', error);
          this.handleConnectionDrop('Transport error detected');
        });
        
        (transport as any).addEventListener?. ('close', () => {
          console.warn('[PersistentMcpClient] Transport closed unexpectedly');
          this.handleConnectionDrop('Transport closed unexpectedly');
        });
      } catch (error) {
        console.warn('[PersistentMcpClient] Could not set up transport event listeners:', error);
      }
    }

    // Set up a connection health check timer
    const healthCheckInterval = 30000; // 30 seconds - more frequent
    const healthCheckTimer = setInterval(async () => {
      if (!this.isConnected || !this.client) {
        clearInterval(healthCheckTimer);
        return;
      }

      try {
        // ENHANCED: More aggressive health check with timeout
        const healthCheckPromise = client.getServerCapabilities();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        );
        
        await Promise.race([healthCheckPromise, timeoutPromise]);
      } catch (error) {
        console.warn('[PersistentMcpClient] Health check failed, connection is stale:', error);
        clearInterval(healthCheckTimer);
        this.handleConnectionDrop('Health check failed - connection is stale');
      }
    }, healthCheckInterval);

    // Clean up timer when connection is closed
    const originalClose = client.close.bind(client);
    client.close = async () => {
      clearInterval(healthCheckTimer);
      return originalClose();
    };
  }

  /**
   * Handle connection drop scenarios with aggressive cleanup
   */
  private handleConnectionDrop(reason: string): void {
    console.warn(`[PersistentMcpClient] Connection drop detected: ${reason}`);
    
    // Mark as disconnected immediately
    this.isConnected = false;
    
    // ENHANCED: Force cleanup of all connection resources to prevent stale connections
    const clientToClose = this.client;
    const transportToClose = this.transport;
    
    // Clear references immediately
    this.client = null;
    this.transport = null;
    this.connectionPromise = null;
    
    // Clear primitives cache since connection is broken
    this.clearCache();
    
    // Force cleanup in background (don't wait to avoid blocking)
    this.performBackgroundCleanup(clientToClose, transportToClose);
    
    // Don't increment consecutiveFailures here as this is a drop, not a failed connection attempt
    console.log('[PersistentMcpClient] Connection marked as dropped, cleanup initiated');
  }

  /**
   * Perform cleanup in background without blocking
   */
  private performBackgroundCleanup(client: Client | null, transport: Transport | null): void {
    if (!client && !transport) return;

    const cleanup = async () => {
      try {
        if (client) {
          await Promise.race([
            client.close(),
            new Promise(resolve => setTimeout(resolve, 1000))
          ]);
        }
        if (transport && 'close' in transport) {
          await Promise.race([
            (transport as any).close(),
            new Promise(resolve => setTimeout(resolve, 1000))
          ]);
        }
      } catch (error) {
        console.warn('[PersistentMcpClient] Background cleanup error:', error);
      }
    };

    cleanup(); // Run in background
  }

  /**
   * Force disconnect with complete cleanup - prevents stale connection issues
   */
  private async forceDisconnect(): Promise<void> {
    console.log('[PersistentMcpClient] Force disconnect - cleaning up all resources');
    
    this.isConnected = false;
    
    const clientToClose = this.client;
    const transportToClose = this.transport;
    
    this.client = null;
    this.transport = null;
    this.connectionPromise = null;
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    // Cleanup with timeout protection
    const cleanupPromises: Promise<void>[] = [];
    
    if (clientToClose) {
      cleanupPromises.push(
        Promise.race([
          clientToClose.close().catch(() => {}),
          new Promise<void>(resolve => setTimeout(resolve, 2000))
        ])
      );
    }
    
    if (transportToClose && 'close' in transportToClose) {
      cleanupPromises.push(
        Promise.race([
          (transportToClose as any).close().catch(() => {}),
          new Promise<void>(resolve => setTimeout(resolve, 2000))
        ])
      );
    }
    
    await Promise.all(cleanupPromises);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('[PersistentMcpClient] Force disconnect completed');
  }
}

/**
 * Creates a simple spinner for console feedback
 * @param text The text to display with the spinner
 * @returns A spinner object with success and error methods
 */
function createSpinner(text: string): Spinner {
  console.log(`⏳ ${text}`);
  return {
    success: (message?: string) => {
      console.log(`✅ ${message || text} completed`);
    },
    error: (message: string) => {
      console.error(`❌ ${text} failed: ${message}`);
    },
  };
}

/**
 * Pretty prints an object to the console
 * @param obj The object to print
 */
function prettyPrint(obj: any): void {
  console.log(JSON.stringify(obj, null, 2));
}

/**
 * Utility function to check if an MCP server is available at the specific endpoint
 * @param url The complete MCP URL to check (including endpoint path)
 * @param requiresActiveClient Whether to require an active client connection (default: false)
 * @returns Promise that resolves to true if MCP server is available at this endpoint, false otherwise
 */
async function isServerAvailable(url: string, requiresActiveClient: boolean = false): Promise<boolean> {
  // If requiresActiveClient is true, check if we have an active client connection
  // and verify the hostname is still reachable
  if (requiresActiveClient) {
    // First check if we have an active client connection
    const hasActiveClient = persistentClient.getConnectionStatus() && !!persistentClient.getClient();
    if (!hasActiveClient) {
      return false;
    }

    // If we have an active client, verify the hostname/domain is still reachable
    // This provides a basic connectivity check without testing the specific MCP endpoint
    try {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? ':' + parsedUrl.port : ''}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // Shorter timeout for hostname check

      try {
        const response = await fetch(baseUrl, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors', // Use no-cors for basic connectivity check
        });

        console.log(`Hostname ${baseUrl} is reachable for active client`);
        return true;
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);

        // For no-cors requests, most responses will throw, so we need to be more lenient
        if (
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ERR_INTERNET_DISCONNECTED')
        ) {
          console.log(`Hostname ${baseUrl} is not reachable: ${errorMessage}`);
          return false;
        } else {
          // Other errors might indicate the server is actually reachable
          console.log(`Hostname ${baseUrl} appears reachable despite error: ${errorMessage}`);
          return true;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.log(`Error checking hostname availability for active client: ${error}`);
      return false;
    }
  }

  try {
    // Parse the URL to get hostname and port
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');

    // Create an abort controller with timeout to prevent long waits
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      // Check the exact MCP endpoint, not just the hostname
      // This is more accurate for MCP availability
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors', // Use CORS since MCP requires it
      });

      // Check for successful responses or expected MCP-related status codes
      if (response.ok || response.status === 200) {
        console.log(`MCP endpoint ${url} is available (status: ${response.status})`);
        return true;
      } else if (response.status === 405) {
        // Method not allowed usually means the endpoint exists but doesn't support HEAD
        // This is common for MCP endpoints
        console.log(`MCP endpoint ${url} exists but doesn't support HEAD (405) - considering available`);
        return true;
      } else if (response.status === 404) {
        console.log(`MCP endpoint ${url} not found (404) - not available`);
        return false;
      } else if (response.status === 403) {
        console.log(`MCP endpoint ${url} forbidden (403) - considering unavailable`);
        return false;
      } else if (response.status >= 500) {
        console.log(`MCP endpoint ${url} server error (${response.status}) - considering unavailable`);
        return false;
      } else {
        // For other status codes, be conservative and consider available
        console.log(`MCP endpoint ${url} returned status ${response.status} - considering available`);
        return true;
      }
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);

      // Network-level errors indicate the endpoint is not available
      if (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('CORS error') ||
        errorMessage.includes('ERR_INTERNET_DISCONNECTED')
      ) {
        console.log(`MCP endpoint ${url} is not reachable: ${errorMessage}`);
        return false;
      } else {
        // For other errors, be conservative and consider the endpoint potentially available
        console.log(
          `MCP endpoint ${url} check failed with non-network error: ${errorMessage} - considering potentially available`,
        );
        return true;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // This catch block handles URL parsing errors and other issues
    console.log(`Error checking MCP endpoint availability for ${url}:`, error);
    return false;
  }
}

async function listPrimitives(client: Client): Promise<Primitive[]> {
  const capabilities = client.getServerCapabilities() as ServerCapabilities;
  const primitives: Primitive[] = [];
  const promises: Promise<void>[] = [];

  if (capabilities.resources) {
    promises.push(
      client.listResources().then(({ resources }) => {
        resources.forEach(item => primitives.push({ type: 'resource', value: item }));
      }),
    );
  }
  if (capabilities.tools) {
    promises.push(
      client.listTools().then(({ tools }) => {
        tools.forEach(item => primitives.push({ type: 'tool', value: item }));
      }),
    );
  }
  if (capabilities.prompts) {
    promises.push(
      client.listPrompts().then(({ prompts }) => {
        prompts.forEach(item => primitives.push({ type: 'prompt', value: item }));
      }),
    );
  }
  await Promise.all(promises);
  return primitives;
}

// Get the persistent client instance
const persistentClient = PersistentMcpClient.getInstance();

/**
 * Call a tool on the MCP server using backwards compatible connection
 * @param uri The URI of the MCP server
 * @param toolName The name of the tool to call
 * @param args The arguments to pass to the tool as an object with string keys
 * @returns Promise that resolves to the result of the tool call
 */
export async function callToolWithBackwardsCompatibility(
  uri: string,
  toolName: string,
  args: { [key: string]: unknown },
): Promise<any> {
  try {
    // Connect to the server if not already connected (with SSE transport)
    await persistentClient.connect(uri);

    // Call the tool using the persistent connection
    return await persistentClient.callTool(toolName, args);
  } catch (error) {
    console.error(`Error calling tool ${toolName}:`, error);
    throw error;
  }
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use callToolWithBackwardsCompatibility instead
 */
export async function callToolWithSSE(uri: string, toolName: string, args: { [key: string]: unknown }): Promise<any> {
  return callToolWithBackwardsCompatibility(uri, toolName, args);
}

/**
 * Get all primitives from the MCP server using backwards compatible connection
 * @param uri The URI of the MCP server
 * @param forceRefresh Whether to force a refresh and ignore the cache
 * @returns Promise that resolves to an array of primitives (resources, tools, and prompts)
 */
export async function getPrimitivesWithBackwardsCompatibility(
  uri: string,
  forceRefresh: boolean = false,
): Promise<Primitive[]> {
  try {
    // Connect to the server if not already connected (with SSE transport)
    await persistentClient.connect(uri);

    // Clear cache if force refresh is requested
    if (forceRefresh) {
      console.log('[getPrimitivesWithBackwardsCompatibility] Force refresh requested, clearing cache');
      persistentClient.clearCache();
    }

    // Get primitives using the persistent connection
    return await persistentClient.getPrimitives();
  } catch (error) {
    console.error('Error getting primitives:', error);
    throw error;
  }
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use getPrimitivesWithBackwardsCompatibility instead
 */
export async function getPrimitivesWithSSE(uri: string, forceRefresh: boolean = false): Promise<Primitive[]> {
  return getPrimitivesWithBackwardsCompatibility(uri, forceRefresh);
}

/**
 * Check if the MCP server is connected
 * @returns True if connected, false otherwise
 */
export function isMcpServerConnected(): boolean {
  return persistentClient.getConnectionStatus();
}

/**
 * Actively check the MCP server connection status
 * This performs a real-time check of the server availability with actual connection testing
 * @returns Promise that resolves to true if connected, false otherwise
 */
export async function checkMcpServerConnection(): Promise<boolean> {
  try {
    // First check if we have a client and it's marked as connected
    const hasClient = !!persistentClient.getClient();
    const isMarkedConnected = persistentClient.getConnectionStatus();

    console.log(`[checkMcpServerConnection] hasClient: ${hasClient}, isMarkedConnected: ${isMarkedConnected}`);

    if (!hasClient || !isMarkedConnected) {
      console.log(`[checkMcpServerConnection] No client or not marked connected, returning false`);
      return false;
    }

    // Get the server URL
    const serverUrl = persistentClient.getServerUrl();
    if (!serverUrl) {
      console.log(`[checkMcpServerConnection] No server URL, returning false`);
      return false;
    }

    // ENHANCED: Actually test the connection instead of just trusting internal state
    try {
      const client = persistentClient.getClient();
      if (!client) {
        console.log(`[checkMcpServerConnection] Client became null during check`);
        return false;
      }

      // Test the connection by attempting to get server capabilities
      // This is a lightweight operation that will fail if connection is broken
      const capabilities = client.getServerCapabilities();
      
      // If we can get capabilities, the connection is likely healthy
      console.log(`[checkMcpServerConnection] Connection health test passed, capabilities available`);
      
      // Also do a basic ping test by trying to list resources (lightweight)
      // This will catch SSE transport issues that getServerCapabilities might miss
      try {
        await client.listResources();
        console.log(`[checkMcpServerConnection] Resource list test passed - connection is healthy`);
      } catch (listError) {
        // If listing resources fails, the connection is likely broken
        const errorMessage = listError instanceof Error ? listError.message : String(listError);
        console.warn(`[checkMcpServerConnection] Resource list test failed: ${errorMessage}`);
        
        // Mark as disconnected if this is a connection error
        if (persistentClient.isConnectionError && persistentClient.isConnectionError(errorMessage)) {
          console.log(`[checkMcpServerConnection] Detected connection error, marking as disconnected`);
          // Use internal method to mark as disconnected without incrementing failure count
          (persistentClient as any).handleConnectionDrop('Connection health check failed');
          return false;
        }
        
        // If it's not a connection error (e.g., no resources available), connection is still ok
        console.log(`[checkMcpServerConnection] Non-connection error during resource list, connection still valid`);
      }
      
      // Connection is healthy
      return true;
      
    } catch (testError) {
      const errorMessage = testError instanceof Error ? testError.message : String(testError);
      console.warn(`[checkMcpServerConnection] Connection test failed: ${errorMessage}`);
      
      // If this is a connection error, mark as disconnected
      if (persistentClient.isConnectionError && persistentClient.isConnectionError(errorMessage)) {
        console.log(`[checkMcpServerConnection] Connection test revealed broken connection, marking as disconnected`);
        (persistentClient as any).handleConnectionDrop('Connection health check failed');
        return false;
      }
      
      // For non-connection errors, assume connection is still valid but log the issue
      console.log(`[checkMcpServerConnection] Non-connection error during test, assuming connection is still valid`);
      return isMarkedConnected;
    }

  } catch (error) {
    console.error('Error checking MCP server connection:', error);
    return false;
  }
}

/**
 * Force a reconnection to the MCP server
 * @param uri The URI of the MCP server
 * @returns Promise that resolves when reconnection is complete
 */
export async function forceReconnectToMcpServer(uri: string): Promise<void> {
  // Reset all client state for the new URL
  await persistentClient.forceReconnect(uri);
}

/**
 * Reset the connection state completely
 * This is useful when the connection is in an inconsistent state
 */
export function resetMcpConnectionState(): void {
  persistentClient.resetConnectionState();
}

/**
 * Reset connection state for recovery attempts
 * This allows periodic background recovery without affecting ongoing connections
 */
export function resetMcpConnectionStateForRecovery(): void {
  persistentClient.resetForRecovery();
}

/**
 * Abort any hanging connection and reset state
 * This is useful when a connection is stuck
 */
export function abortMcpConnection(): void {
  persistentClient.abortConnection();
}

/**
 * Call a tool with the given name and arguments
 * @param client The MCP client instance
 * @param toolName The name of the tool to call
 * @param args The arguments to pass to the tool as an object with string keys
 * @returns Promise that resolves to the result of the tool call
 */
async function callTool(client: Client, toolName: string, args: { [key: string]: unknown }): Promise<any> {
  const spinner = createSpinner(`Calling tool ${toolName}...`);
  try {
    if (!client) {
      throw new Error('Client is not initialized');
    }

    if (!toolName || typeof toolName !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }

    // Validate arguments
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('Arguments must be an object with string keys');
    }

    const result = await client.callTool({ name: toolName, arguments: args });
    spinner.success(`Tool ${toolName} called successfully`);
    prettyPrint(result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.error(errorMessage);
    throw error;
  }
}

/**
 * Run the MCP client with SSE transport
 * This function is used by the background script to initialize the connection
 * It uses SSE transport only (StreamableHTTP disabled)
 * @param uri The URI of the MCP server
 * @returns Promise that resolves when the connection is established
 */
export async function runWithBackwardsCompatibility(uri: string): Promise<void> {
  try {
    console.log(`Attempting to connect to MCP server with SSE transport: ${uri}`);

    // Connect to the server using the persistent client (with SSE transport)
    await persistentClient.connect(uri);

    // Get primitives to verify the connection works
    const primitives = await persistentClient.getPrimitives();
    console.log(`Connected, found ${primitives.length} primitives`);

    // Log the primitives for debugging
    primitives.forEach(p => {
      console.log(`${p.type}: ${p.value.name} - ${p.value.description || 'No description'}`);
    });

    // Don't disconnect - keep the connection open
    return;
  } catch (error) {
    console.error('Error in MCP connection setup:', error);
    throw error;
  }
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use runWithBackwardsCompatibility instead
 */
export async function runWithSSE(uri: string): Promise<void> {
  return runWithBackwardsCompatibility(uri);
}

// Export the callTool function for direct use
export { callTool, prettyPrint, createSpinner, listPrimitives };
