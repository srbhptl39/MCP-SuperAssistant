import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import type { ITransportPlugin, PluginMetadata, PluginConfig } from '../../types/plugin.js';
import type { WebSocketPluginConfig } from '../../types/config.js';
import { WebSocketTransport } from './WebSocketTransport.js';

export class WebSocketPlugin implements ITransportPlugin {
  readonly metadata: PluginMetadata = {
    name: 'WebSocket Transport Plugin',
    version: '1.0.0',
    transportType: 'websocket',
    description: 'WebSocket transport for MCP protocol with real-time bidirectional communication',
    author: 'MCP SuperAssistant',
  };

  private config: WebSocketPluginConfig = {};
  private transport: WebSocketTransport | null = null;
  private isConnectedFlag: boolean = false;
  private connectionPromise: Promise<Transport> | null = null;
  private lastPingTime: number = 0;

  async initialize(config: PluginConfig): Promise<void> {
    this.config = {
      protocols: ['mcp-v1'],
      pingInterval: 30000,
      pongTimeout: 5000,
      maxReconnectAttempts: 3,
      binaryType: 'arraybuffer',
      ...config,
    } as WebSocketPluginConfig;

    console.log(`[WebSocketPlugin] Initialized with config:`, this.config);
  }

  async connect(uri: string): Promise<Transport> {
    console.log(`[WebSocketPlugin] Creating transport for: ${uri}`);

    try {
      const transport = await this.createConnection(uri);
      this.transport = transport as unknown as WebSocketTransport;
      console.log('[WebSocketPlugin] Transport created successfully');
      return transport;
    } catch (error) {
      console.error('[WebSocketPlugin] Transport creation failed:', error);
      throw error;
    }
  }

  private async createConnection(uri: string): Promise<Transport> {
    try {
      // Validate and parse URI
      const url = new URL(uri);

      // Ensure WebSocket protocol
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        throw new Error(`Invalid WebSocket protocol: ${url.protocol}. Expected ws: or wss:`);
      }

      console.log(`[WebSocketPlugin] Creating WebSocket transport for: ${url.toString()}`);

      // Create WebSocket transport with plugin config
      const transport = new WebSocketTransport(url.toString(), {
        protocols: this.config.protocols,
        pingInterval: this.config.pingInterval,
        pongTimeout: this.config.pongTimeout,
        binaryType: this.config.binaryType,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
      });

      // Set up event listeners for monitoring
      transport.on('close', (event: any) => {
        console.log(`[WebSocketPlugin] Transport closed: ${event.code} ${event.reason}`);
        this.isConnectedFlag = false;
      });

      transport.on('error', (error: any) => {
        console.error('[WebSocketPlugin] Transport error:', error);
        // Don't immediately mark as disconnected for ping/pong errors
        // Let MCP protocol handle connection management
        if (!error.message.includes('Pong timeout')) {
          this.isConnectedFlag = false;
        }
      });

      // Return the transport without connecting - the main client will handle connection
      console.log('[WebSocketPlugin] WebSocket transport created successfully');
      return transport as unknown as Transport;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Enhanced error messages for WebSocket-specific issues
      let enhancedError = errorMessage;
      if (errorMessage.includes('timeout')) {
        enhancedError = 'WebSocket connection timeout. The server may be slow or unreachable.';
      } else if (errorMessage.includes('Failed to construct')) {
        enhancedError = 'Invalid WebSocket URL format. Check the URI syntax.';
      } else if (errorMessage.includes('connection failed')) {
        enhancedError = 'WebSocket connection failed. Check if the server is running and accessible.';
      } else if (errorMessage.includes('protocol')) {
        enhancedError = 'WebSocket protocol error. The server may not support the requested protocols.';
      }

      throw new Error(`WebSocket Plugin: ${enhancedError}`);
    }
  }

  async disconnect(): Promise<void> {
    console.log('[WebSocketPlugin] Disconnecting...');

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.warn('[WebSocketPlugin] Error during transport cleanup:', error);
      }
    }

    this.transport = null;
    this.isConnectedFlag = false;
    this.connectionPromise = null;

    console.log('[WebSocketPlugin] Disconnected');
  }

  isConnected(): boolean {
    // The plugin creates transports but doesn't manage connection state
    // Connection state is managed by the main client
    return this.transport !== null;
  }

  isSupported(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'ws:' || url.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  getDefaultConfig(): PluginConfig {
    return {
      protocols: ['mcp-v1'],
      maxReconnectAttempts: 3,
      binaryType: 'arraybuffer',
      // Removed ping/pong settings - using MCP protocol connection management
    };
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnected() || !this.transport) {
      return false;
    }

    try {
      // Check WebSocket connection state
      const readyState = this.transport.getReadyState();
      const isOpen = readyState === WebSocket.OPEN;

      if (!isOpen) {
        console.warn(`[WebSocketPlugin] WebSocket not in OPEN state: ${readyState}`);
        return false;
      }

      // Additional health check - verify connection hasn't been stale for too long
      const pingInterval = this.config.pingInterval || 30000;

      // If we haven't pinged recently and ping interval is enabled, consider it healthy
      // The ping/pong mechanism in WebSocketTransport handles connectivity monitoring
      if (pingInterval > 0) {
        return true; // Transport handles its own health monitoring
      }

      return true;
    } catch (error) {
      console.warn('[WebSocketPlugin] Health check failed:', error);
      return false;
    }
  }

  async callTool(client: Client, toolName: string, args: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('WebSocket Plugin: Not connected');
    }

    console.log(`[WebSocketPlugin] Calling tool: ${toolName}`);

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      console.log(`[WebSocketPlugin] Tool call completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`[WebSocketPlugin] Tool call failed: ${toolName}`, error);

      // Check if this is a connection-related error
      if (!this.isConnected()) {
        this.isConnectedFlag = false;
        throw new Error(`WebSocket connection lost during tool call: ${toolName}`);
      }

      throw error;
    }
  }

  async getPrimitives(client: Client): Promise<any[]> {
    if (!this.isConnected()) {
      throw new Error('WebSocket Plugin: Not connected');
    }

    console.log('[WebSocketPlugin] Getting primitives...');

    try {
      const capabilities = client.getServerCapabilities();
      const primitives: any[] = [];
      const promises: Promise<void>[] = [];

      if (capabilities?.resources) {
        promises.push(
          client.listResources().then(({ resources }) => {
            resources.forEach(item => primitives.push({ type: 'resource', value: item }));
          }),
        );
      }

      if (capabilities?.tools) {
        promises.push(
          client.listTools().then(({ tools }) => {
            tools.forEach(item => primitives.push({ type: 'tool', value: item }));
          }),
        );
      }

      if (capabilities?.prompts) {
        promises.push(
          client.listPrompts().then(({ prompts }) => {
            prompts.forEach(item => primitives.push({ type: 'prompt', value: item }));
          }),
        );
      }

      await Promise.all(promises);
      console.log(`[WebSocketPlugin] Retrieved ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      console.error('[WebSocketPlugin] Failed to get primitives:', error);

      // Check if this is a connection-related error
      if (!this.isConnected()) {
        this.isConnectedFlag = false;
        throw new Error('WebSocket connection lost while getting primitives');
      }

      throw error;
    }
  }
}
