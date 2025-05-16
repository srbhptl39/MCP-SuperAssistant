import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../../pages/content/src/types/mcp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

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
  private serverConfig: ServerConfig = { uri: '' };
  private isConnected: boolean = false;
  private connectionPromise: Promise<Client> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private lastConnectionCheck: number = 0;
  private connectionCheckInterval: number = 30000; // 30 seconds
  private primitives: Primitive[] | null = null;
  private primitivesLastFetched: number = 0;
  private primitivesMaxAge: number = 300000; // 5 minutes

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
   * @param config The server configuration containing URI and optional token
   * @returns Promise that resolves to the client instance
   */
  public async connect(config: ServerConfig): Promise<Client> {
    const { uri, token } = config;

    // If we're already connecting, return the existing promise
    if (
      this.connectionPromise &&
      this.serverConfig.uri === uri &&
      this.serverConfig.token === token &&
      this.isConnected
    ) {
      return this.connectionPromise;
    }

    // If the URL or token has changed, disconnect first
    if ((this.serverConfig.uri !== uri || this.serverConfig.token !== token) && this.isConnected) {
      await this.disconnect();
    }

    this.serverConfig = config;

    // Create a new connection promise
    this.connectionPromise = this.createConnection(this.serverConfig);
    return this.connectionPromise;
  }

  /**
   * Create a connection to the MCP server
   * @param config The server configuration containing URI and optional token
   * @returns Promise that resolves to the client instance
   */
  private async createConnection(config: ServerConfig): Promise<Client> {
    const { uri, token } = config;
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

      const serverUrl = `${baseUrl.protocol}//${baseUrl.host}`;
      spinner.success(`URI validated: ${serverUrl}`);

      // Check server availability
      spinner.success(`Checking if server at ${serverUrl} is available...`);
      const isAvailable = await isServerAvailable(config);
      if (!isAvailable) {
        throw new Error(`Server at ${serverUrl} is not available`);
      }
      spinner.success(`Server at ${serverUrl} is available`);

      // Create transport and client with auth token if provided
      spinner.success(`Creating MCP client and connecting to server...`);

      let transportOptions: SSEClientTransportOptions = {};

      // Set up authorization headers if token is provided
      if (token) {
        const headers = {
          Authorization: `Bearer ${token}`
        };

        transportOptions = {
          eventSourceInit: {
            fetch: (url, init) => fetch(url, { ...init, headers }),
          },
          requestInit: {
            headers,
          },
        };
        console.log('[PersistentMcpClient] Using Bearer token for authentication');
      }

      this.transport = new SSEClientTransport(new URL(uri), transportOptions);
      this.client = await createClient();
      await this.client.connect(this.transport);

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      this.isConnected = true;
      this.lastConnectionCheck = Date.now();

      spinner.success(`Connected to MCP server`);
      return this.client;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      spinner.error(errorMessage);
      this.isConnected = false;

      // Schedule reconnect if appropriate
      this.scheduleReconnect();

      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  public async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      const spinner = createSpinner(`Disconnecting from MCP server...`);
      try {
        await this.client.close();
        this.isConnected = false;
        this.client = null;
        this.transport = null;
        this.connectionPromise = null;
        spinner.success(`Disconnected from MCP server`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        spinner.error(errorMessage);
        // Force reset connection state even if disconnect fails
        this.isConnected = false;
        this.client = null;
        this.transport = null;
        this.connectionPromise = null;
      }
    }

    // Clear any pending reconnect
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[PersistentMcpClient] Maximum reconnect attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(
      `[PersistentMcpClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (this.serverConfig.uri) {
        this.connectionPromise = this.createConnection(this.serverConfig);
      }
    }, delay);
  }

  /**
   * Check if the connection is still valid and reconnect if needed
   * @returns Promise that resolves to the client instance
   */
  public async ensureConnection(): Promise<Client> {
    // If we've never connected, throw an error
    if (!this.serverConfig.uri) {
      throw new Error('No server URL set, call connect() first');
    }

    // If we're already connected and it's been less than connectionCheckInterval since the last check, return the client
    if (this.isConnected && this.client && Date.now() - this.lastConnectionCheck < this.connectionCheckInterval) {
      return this.client;
    }

    // If we're not connected or it's been too long since the last check, reconnect
    this.connectionPromise = this.createConnection(this.serverConfig);
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

      // If there was an error, the connection might be invalid
      this.isConnected = false;

      throw error;
    }
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

      // If there was an error, the connection might be invalid
      this.isConnected = false;

      throw error;
    }
  }

  /**
   * Get the connection status
   * @returns True if connected, false otherwise
   */
  public getConnectionStatus(): boolean {
    // If we haven't checked the connection in a while, do a quick check
    const timeSinceLastCheck = Date.now() - this.lastConnectionCheck;
    if (timeSinceLastCheck > 5000) {
      // 5 seconds
      // Don't wait for the promise to resolve, just trigger the check
      this.checkConnectionStatus();
    }
    return this.isConnected;
  }

  /**
   * Actively check if the server is still available
   * This is an async method that updates the isConnected flag
   */
  private async checkConnectionStatus(): Promise<boolean> {
    try {
      // If we don't have a server URL, we're not connected
      if (!this.serverConfig.uri) {
        this.isConnected = false;
        return false;
      }

      // Parse the URL to get the server URL
      const baseUrl = new URL(this.serverConfig.uri);
      const serverUrl = `${baseUrl.protocol}//${baseUrl.host}`;

      // Check if the server is available
      const isAvailable = await isServerAvailable(this.serverConfig);

      // Update the connection status
      const wasConnected = this.isConnected;
      this.isConnected = isAvailable;

      // If the status changed, log it
      if (wasConnected !== this.isConnected) {
        console.log(`[PersistentMcpClient] Connection status changed: ${this.isConnected}`);

        // If we were connected but now we're not, schedule a reconnect
        if (wasConnected && !this.isConnected) {
          this.scheduleReconnect();
        }
      }

      // Update the last check time
      this.lastConnectionCheck = Date.now();

      return this.isConnected;
    } catch (error) {
      // If there was an error, we're not connected
      this.isConnected = false;
      this.lastConnectionCheck = Date.now();
      return false;
    }
  }

  /**
   * Force a reconnection to the MCP server
   */
  public async forceReconnect(): Promise<void> {
    // Clear the primitives cache to ensure we get fresh data from the new server
    this.clearCache();

    // Disconnect and reconnect
    await this.disconnect();
    if (this.serverConfig.uri) {
      await this.connect(this.serverConfig);
    }
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
    return this.serverConfig.uri;
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
 * Utility function to check if a server is available
 * @param config The server configuration containing URI and optional token
 * @returns Promise that resolves to true if server is available, false otherwise
 */
async function isServerAvailable(config: ServerConfig): Promise<boolean> {
  try {
    const { uri, token } = config;
    
    if (!uri) {
      console.log('No server URI provided');
      return false;
    }
    
    // Parse the URL to get the server URL
    const baseUrl = new URL(uri);
    const serverUrl = `${baseUrl.protocol}//${baseUrl.host}`;
    
    // Create an abort controller with timeout to prevent long waits
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      // Set up headers if token is provided
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Use fetch with HEAD method to check if server is available
      await fetch(serverUrl, {
        method: 'HEAD',
        mode: 'no-cors', // Use no-cors to avoid CORS issues during check
        signal: controller.signal,
        headers,
      });

      // If we get here, the server is available
      console.log(`Server at ${serverUrl} appears to be available`);
      return true;
    } catch (fetchError) {
      // Any fetch error means the server is not available
      console.log(`Server at ${serverUrl} is not available (fetch failed)`);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // This catch block handles any other errors that might occur
    console.log(`Error checking server availability:`, error);
    return false;
  }
}

async function createClient(): Promise<Client> {
  const client = new Client({ name: 'mcp-cli', version: '1.0.0' }, { capabilities: {} });
  client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
    console.debug('[server log]:', notification.params.data);
  });
  return client;
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
 * Call a tool on the MCP server using the persistent connection
 * @param config The server configuration containing URI and optional token
 * @param toolName The name of the tool to call
 * @param args The arguments to pass to the tool as an object with string keys
 * @returns Promise that resolves to the result of the tool call
 */
export async function callToolWithSSE(config: ServerConfig, toolName: string, args: { [key: string]: unknown }): Promise<any> {
  try {
    // Connect to the server if not already connected
    await persistentClient.connect(config);

    // Call the tool using the persistent connection
    return await persistentClient.callTool(toolName, args);
  } catch (error) {
    console.error(`Error calling tool ${toolName}:`, error);
    throw error;
  }
}

/**
 * Get all primitives from the MCP server using the persistent connection
 * @param config The server configuration containing URI and optional token
 * @param forceRefresh Whether to force a refresh and ignore the cache
 * @returns Promise that resolves to an array of primitives (resources, tools, and prompts)
 */
export async function getPrimitivesWithSSE(config: ServerConfig, forceRefresh: boolean = false): Promise<Primitive[]> {
  try {
    // Connect to the server if not already connected
    await persistentClient.connect(config);

    // Clear cache if force refresh is requested
    if (forceRefresh) {
      console.log('[getPrimitivesWithSSE] Force refresh requested, clearing cache');
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
 * Check if the MCP server is connected
 * @returns True if connected, false otherwise
 */
export function isMcpServerConnected(): boolean {
  return persistentClient.getConnectionStatus();
}

/**
 * Actively check the MCP server connection status
 * This performs a real-time check of the server availability
 * @returns Promise that resolves to true if connected, false otherwise
 */
export async function checkMcpServerConnection(): Promise<boolean> {
  try {
    // If we don't have a client or it's not connected, return false
    if (!persistentClient.getConnectionStatus()) {
      return false;
    }

    // Get the server URL
    const serverUrl = persistentClient.getServerUrl();
    if (!serverUrl) {
      return false;
    }

    // Parse the URL to get the server URL
    const baseUrl = new URL(serverUrl);
    const hostUrl = `${baseUrl.protocol}//${baseUrl.host}`;

    // Check if the server is available - we don't have access to the token here
    return await isServerAvailable({ uri: hostUrl, token: undefined });
  } catch (error) {
    console.error('Error checking MCP server connection:', error);
    return false;
  }
}

/**
 * Force a reconnection to the MCP server
 * @param config The server configuration containing URI and optional token
 * @returns Promise that resolves when reconnection is complete
 */
export async function forceReconnectToMcpServer(config: ServerConfig): Promise<void> {
  // Clear the cache to ensure we get fresh data from the new server
  persistentClient.clearCache();

  // Disconnect and reconnect
  await persistentClient.disconnect();
  await persistentClient.connect(config);
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
 * @param config The server configuration containing URI and optional token
 * @returns Promise that resolves when the connection is established
 */
export async function runWithSSE(config: ServerConfig): Promise<void> {
  try {
    console.log(`Attempting to connect to SSE endpoint: ${config.uri}`);

    // First check if the server is available before attempting to connect
    const baseUrl = new URL(config.uri);
    const serverUrl = `${baseUrl.protocol}//${baseUrl.host}`;
    const isAvailable = await isServerAvailable(config);

    if (!isAvailable) {
      throw new Error(`Server at ${serverUrl} is not available`);
    }

    // Connect to the server using the persistent client
    await persistentClient.connect(config);

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
    console.error('Error in SSE connection setup:', error);
    throw error;
  }
}

// Export the callTool function for direct use
export { callTool, prettyPrint, createSpinner, listPrimitives };
