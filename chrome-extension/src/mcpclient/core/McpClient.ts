import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import { EventEmitter } from './EventEmitter.js';
import { PluginRegistry } from './PluginRegistry.js';
import { SSEPlugin } from '../plugins/sse/SSEPlugin.js';
import { WebSocketPlugin } from '../plugins/websocket/WebSocketPlugin.js';
import { StreamableHttpPlugin } from '../plugins/streamable-http/StreamableHttpPlugin.js';
import type { ClientConfig, ConnectionRequest } from '../types/config.js';
import { DEFAULT_CLIENT_CONFIG } from '../types/config.js';
import type { TransportType, ITransportPlugin, PluginConfig } from '../types/plugin.js';
import type { Primitive, NormalizedTool, PrimitivesResponse } from '../types/primitives.js';
import type { AllEvents } from '../types/events.js';

export class McpClient extends EventEmitter<AllEvents> {
  private registry: PluginRegistry;
  private config: ClientConfig;
  private client: Client | null = null;
  private activePlugin: ITransportPlugin | null = null;
  private activeTransport: Transport | null = null;
  private isConnectedFlag: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private primitivesCache: PrimitivesResponse | null = null;
  private primitivesCacheTime: number = 0;
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(config: Partial<ClientConfig> = {}) {
    super();

    this.config = {
      ...DEFAULT_CLIENT_CONFIG,
      ...config,
      global: {
        ...DEFAULT_CLIENT_CONFIG.global,
        ...config.global,
      },
      plugins: {
        ...DEFAULT_CLIENT_CONFIG.plugins,
        ...config.plugins,
      },
    };

    this.registry = new PluginRegistry();

    // Forward registry events
    this.registry.on('registry:plugin-registered', data => {
      this.emit('registry:plugin-registered', data);
    });

    this.registry.on('registry:plugins-loaded', data => {
      this.emit('registry:plugins-loaded', data);
    });

    console.log('[McpClient] Initialized with config:', this.config);
    this.emit('client:initialized', { config: this.config });
  }

  async initialize(): Promise<void> {
    try {
      console.log('[McpClient] Loading default plugins...');
      await this.registry.loadDefaultPlugins();
      console.log('[McpClient] Initialization complete');
    } catch (error) {
      console.error('[McpClient] Initialization failed:', error);
      console.log('[McpClient] Attempting manual plugin registration as fallback...');

      try {
        // Try manual registration as fallback for Service Worker environments
        await this.manualPluginRegistration();
        console.log('[McpClient] Manual plugin registration successful');
      } catch (fallbackError) {
        console.error('[McpClient] Manual plugin registration also failed:', fallbackError);
        throw error; // Throw original error
      }
    }
  }

  private async manualPluginRegistration(): Promise<void> {
    // Use static imports that are available at module level
    await this.registry.register(new SSEPlugin());
    await this.registry.register(new WebSocketPlugin());
    await this.registry.register(new StreamableHttpPlugin());

    console.log('[McpClient] Manual plugin registration completed');
  }

  async connect(request: ConnectionRequest): Promise<void> {
    // If same connection type and already connected, skip
    if (this.isConnectedFlag && this.activePlugin?.metadata.transportType === request.type) {
      console.log(`[McpClient] Already connected via ${request.type}, skipping`);
      return;
    }

    // If there's a connection in progress, wait for it but check if it's for the same URI
    if (this.connectionPromise) {
      console.log('[McpClient] Connection already in progress, waiting...');
      try {
        await this.connectionPromise;
        // Check if the completed connection is what we wanted
        if (this.isConnectedFlag && this.activePlugin?.metadata.transportType === request.type) {
          console.log('[McpClient] Existing connection matches request');
          return;
        }
      } catch (error) {
        console.log('[McpClient] Previous connection failed, starting new one');
        // Clear the failed promise to allow new connection
        this.connectionPromise = null;
      }
    }

    // Disconnect from current connection if switching types
    if (this.isConnectedFlag && this.activePlugin?.metadata.transportType !== request.type) {
      console.log(`[McpClient] Switching from ${this.activePlugin?.metadata.transportType} to ${request.type}`);
      await this.disconnect();
    }

    this.connectionPromise = this.performConnection(request);

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async performConnection(request: ConnectionRequest): Promise<void> {
    const { uri, type, config: pluginConfig } = request;

    try {
      console.log(`[McpClient] Connecting to ${uri} via ${type}`);
      this.emit('client:connecting', { uri, type });

      // Disconnect from current connection if exists
      if (this.isConnectedFlag) {
        await this.disconnect();
      }

      // Get the plugin configuration
      const finalConfig = {
        ...this.config.plugins[type],
        ...pluginConfig,
      };

      // Get and initialize the plugin
      const plugin = await this.registry.getInitializedPlugin(type, finalConfig);

      if (!plugin.isSupported(uri)) {
        throw new Error(`Plugin ${type} does not support URI: ${uri}`);
      }

      // Get transport from plugin (plugin creates but doesn't connect)
      const transport = await plugin.connect(uri);

      // Set up disconnection callback for WebSocket plugin
      if (type === 'websocket' && 'setDisconnectionCallback' in plugin) {
        (plugin as any).setDisconnectionCallback((reason: string, code?: number, details?: string) => {
          console.log(`[McpClient] WebSocket disconnection detected: ${reason} (code: ${code})`);
          
          // Mark as disconnected immediately
          this.isConnectedFlag = false;
          
          // Emit disconnection event with details
          this.emit('connection:status-changed', {
            isConnected: false,
            type: 'websocket',
            error: `WebSocket disconnected: ${reason}${code ? ` (code: ${code})` : ''}${details ? ` - ${details}` : ''}`
          });

          // Clean up connection state
          this.cleanup().catch(error => {
            console.error('[McpClient] Error during cleanup after WebSocket disconnection:', error);
          });
        });
      }

      // Create MCP client
      this.client = new Client(
        {
          name: `mcp-client-${type}`,
          version: '1.0.0',
        },
        { capabilities: {} },
      );

      // Set up logging notification handler
      this.client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
        console.debug(`[McpClient] Server log:`, notification.params.data);
      });

      // Connect client to transport (this will start the transport)
      console.log(`[McpClient] Starting MCP client connection to transport...`);

      // Add timeout to prevent hanging
      const connectionTimeout = 30000; // 30 seconds
      const connectionPromise = this.client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`MCP client connection timeout after ${connectionTimeout}ms`));
        }, connectionTimeout);
      });

      await Promise.race([connectionPromise, timeoutPromise]);
      console.log(`[McpClient] MCP client connected successfully`);

      // Store connection state
      this.activePlugin = plugin;
      this.activeTransport = transport;
      this.isConnectedFlag = true;

      // Clear cache on new connection
      this.clearPrimitivesCache();

      // Start health monitoring
      this.startHealthMonitoring();

      console.log(`[McpClient] Successfully connected via ${type}`);
      this.emit('client:connected', { uri, type });
      this.emit('connection:status-changed', {
        isConnected: true,
        type,
        error: undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[McpClient] Connection failed:`, error);

      // Clean up partial connection state
      await this.cleanup();

      this.emit('client:error', {
        error: error instanceof Error ? error : new Error(errorMessage),
        context: 'connection',
      });
      this.emit('connection:status-changed', {
        isConnected: false,
        type,
        error: errorMessage,
      });

      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnectedFlag) {
      console.log('[McpClient] Already disconnected');
      return;
    }

    const currentType = this.activePlugin?.metadata.transportType;
    console.log(`[McpClient] Disconnecting from ${currentType || 'unknown'}`);

    if (currentType) {
      this.emit('client:disconnecting', { type: currentType });
    }

    try {
      await this.cleanup();
      console.log('[McpClient] Disconnected successfully');

      if (currentType) {
        this.emit('client:disconnected', { type: currentType });
      }
      this.emit('connection:status-changed', {
        isConnected: false,
        type: currentType || null,
      });
    } catch (error) {
      console.error('[McpClient] Error during disconnect:', error);
      this.emit('client:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'disconnect',
      });
    }
  }

  private async cleanup(): Promise<void> {
    // Stop health monitoring
    this.stopHealthMonitoring();

    // Close client connection
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn('[McpClient] Error closing client:', error);
      }
      this.client = null;
    }

    // Disconnect plugin
    if (this.activePlugin) {
      try {
        await this.activePlugin.disconnect();
      } catch (error) {
        console.warn('[McpClient] Error disconnecting plugin:', error);
      }
      this.activePlugin = null;
    }

    this.activeTransport = null;
    this.isConnectedFlag = false;
    this.clearPrimitivesCache();
  }

  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.isConnectedFlag || !this.activePlugin || !this.client) {
      throw new Error('Not connected to any MCP server');
    }

    const startTime = Date.now();
    this.emit('tool:call-started', { toolName, args });

    try {
      console.log(`[McpClient] Calling tool: ${toolName}`);
      const result = await this.activePlugin.callTool(this.client, toolName, args);

      const duration = Date.now() - startTime;
      this.emit('tool:call-completed', { toolName, result, duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const toolError = error instanceof Error ? error : new Error(String(error));

      this.emit('tool:call-failed', { toolName, error: toolError, duration });

      // Check if connection is still healthy after error
      if (!(await this.isHealthy())) {
        this.isConnectedFlag = false;
        this.emit('connection:status-changed', {
          isConnected: false,
          type: this.activePlugin?.metadata.transportType || null,
          error: 'Connection lost during tool call',
        });
      }

      throw toolError;
    }
  }

  async getPrimitives(forceRefresh: boolean = false): Promise<PrimitivesResponse> {
    if (!this.isConnectedFlag || !this.activePlugin || !this.client) {
      throw new Error('Not connected to any MCP server');
    }

    // Check cache first
    if (!forceRefresh && this.primitivesCache && this.isCacheValid()) {
      console.log('[McpClient] Returning cached primitives');
      return this.primitivesCache;
    }

    try {
      console.log('[McpClient] Fetching primitives from server...');
      const primitives = await this.activePlugin.getPrimitives(this.client);

      // Normalize tools
      const tools = this.normalizeTools(primitives.filter(p => p.type === 'tool'));
      const resources = primitives.filter(p => p.type === 'resource').map(p => p.value);
      const prompts = primitives.filter(p => p.type === 'prompt').map(p => p.value);

      const response: PrimitivesResponse = {
        tools,
        resources,
        prompts,
        timestamp: Date.now(),
      };

      // Cache the response
      this.primitivesCache = response;
      this.primitivesCacheTime = Date.now();

      // Emit tools update event
      this.emit('tools:list-updated', {
        tools,
        type: this.activePlugin.metadata.transportType,
      });

      console.log(
        `[McpClient] Retrieved ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`,
      );
      return response;
    } catch (error) {
      console.error('[McpClient] Failed to get primitives:', error);

      // Check if connection is still healthy after error
      if (!(await this.isHealthy())) {
        this.isConnectedFlag = false;
        this.emit('connection:status-changed', {
          isConnected: false,
          type: this.activePlugin?.metadata.transportType || null,
          error: 'Connection lost while getting primitives',
        });
      }

      throw error;
    }
  }

  private normalizeTools(toolPrimitives: Primitive[]): NormalizedTool[] {
    return toolPrimitives.map(p => {
      const tool = p.value;
      return {
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.inputSchema || tool.input_schema || {},
        schema: tool.inputSchema
          ? JSON.stringify(tool.inputSchema)
          : tool.input_schema
            ? JSON.stringify(tool.input_schema)
            : '{}',
        ...(tool.uri && { uri: tool.uri }),
        ...(tool.arguments && { arguments: tool.arguments }),
      };
    });
  }

  private clearPrimitivesCache(): void {
    this.primitivesCache = null;
    this.primitivesCacheTime = 0;
  }

  private isCacheValid(): boolean {
    return Date.now() - this.primitivesCacheTime < this.CACHE_TTL;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnectedFlag || !this.activePlugin) {
      return false;
    }

    try {
      return await this.activePlugin.isHealthy();
    } catch (error) {
      console.warn('[McpClient] Health check failed:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isConnectedFlag && this.activePlugin?.isConnected() === true;
  }

  getConnectionInfo(): {
    isConnected: boolean;
    type: TransportType | null;
    uri: string | null;
    pluginInfo: any;
  } {
    return {
      isConnected: this.isConnectedFlag,
      type: this.activePlugin?.metadata.transportType || null,
      uri: null, // Could store this if needed
      pluginInfo: this.activePlugin?.metadata || null,
    };
  }

  getAvailableTransports(): TransportType[] {
    return this.registry.listAvailable();
  }

  async switchTransport(request: ConnectionRequest): Promise<void> {
    const currentType = this.activePlugin?.metadata.transportType || null;

    if (currentType === request.type) {
      console.log(`[McpClient] Already using ${request.type}, reconnecting...`);
    } else {
      console.log(`[McpClient] Switching from ${currentType} to ${request.type}`);
      this.emit('client:plugin-switched', { from: currentType, to: request.type });
    }

    await this.connect(request);
  }

  private startHealthMonitoring(): void {
    const interval = this.config.global.healthCheckInterval;
    if (interval <= 0) return;

    this.healthCheckTimer = setInterval(async () => {
      if (!this.isConnectedFlag) {
        this.stopHealthMonitoring();
        return;
      }

      try {
        const healthy = await this.isHealthy();
        const type = this.activePlugin?.metadata.transportType || null;

        if (type) {
          this.emit('connection:health-check', {
            healthy,
            type,
            timestamp: Date.now(),
          });
        }

        if (!healthy) {
          console.warn(`[McpClient] Health check failed for ${type}`);
          this.isConnectedFlag = false;
          this.emit('connection:status-changed', {
            isConnected: false,
            type,
            error: 'Health check failed',
          });
        }
      } catch (error) {
        console.error('[McpClient] Health check error:', error);
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  getConfig(): ClientConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ClientConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      global: {
        ...this.config.global,
        ...newConfig.global,
      },
      plugins: {
        ...this.config.plugins,
        ...newConfig.plugins,
      },
    };

    console.log('[McpClient] Configuration updated');
  }
}
