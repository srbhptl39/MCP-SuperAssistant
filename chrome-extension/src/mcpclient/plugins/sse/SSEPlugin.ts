import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import type { ITransportPlugin, PluginMetadata, PluginConfig } from '../../types/plugin.js';
import type { SSEPluginConfig } from '../../types/config.js';

export class SSEPlugin implements ITransportPlugin {
  readonly metadata: PluginMetadata = {
    name: 'SSE Transport Plugin',
    version: '1.0.0',
    transportType: 'sse',
    description: 'Server-Sent Events transport for MCP protocol',
    author: 'MCP SuperAssistant',
  };

  private config: SSEPluginConfig = {};
  private transport: Transport | null = null;
  private isConnectedFlag: boolean = false;
  private connectionPromise: Promise<Transport> | null = null;

  async initialize(config: PluginConfig): Promise<void> {
    this.config = {
      keepAlive: true,
      connectionTimeout: 5000,
      readTimeout: 30000,
      ...config,
    } as SSEPluginConfig;

    console.log(`[SSEPlugin] Initialized with config:`, this.config);
  }

  async connect(uri: string): Promise<Transport> {
    console.log(`[SSEPlugin] Creating transport for: ${uri}`);

    try {
      const transport = await this.createConnection(uri);
      this.transport = transport;
      console.log('[SSEPlugin] Transport created successfully');
      return transport;
    } catch (error) {
      console.error('[SSEPlugin] Transport creation failed:', error);
      throw error;
    }
  }

  private async createConnection(uri: string): Promise<Transport> {
    try {
      // Validate and parse URI
      const url = new URL(uri);
      console.log(`[SSEPlugin] Creating SSE transport for: ${url.toString()}`);

      // Create SSE transport
      const transport = new SSEClientTransport(url);

      // Return the transport without testing
      // The main client will handle the connection test
      console.log('[SSEPlugin] SSE transport created successfully');
      return transport;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Enhanced error messages for SSE-specific issues
      let enhancedError = errorMessage;
      if (errorMessage.includes('404')) {
        enhancedError = 'SSE endpoint not found (404). Verify the server URL and SSE endpoint path.';
      } else if (errorMessage.includes('timeout')) {
        enhancedError = 'SSE connection timeout. The server may be slow or the endpoint may not support SSE.';
      } else if (errorMessage.includes('Failed to fetch')) {
        enhancedError = 'SSE connection failed. Check if the server is running and accessible.';
      }

      throw new Error(`SSE Plugin: ${enhancedError}`);
    }
  }

  async disconnect(): Promise<void> {
    console.log('[SSEPlugin] Disconnecting...');

    if (this.transport) {
      try {
        // SSE transport may not have explicit close method, but we clean up references
        if ('close' in this.transport && typeof this.transport.close === 'function') {
          await (this.transport as any).close();
        }
      } catch (error) {
        console.warn('[SSEPlugin] Error during transport cleanup:', error);
      }
    }

    this.transport = null;
    this.isConnectedFlag = false;
    this.connectionPromise = null;

    console.log('[SSEPlugin] Disconnected');
  }

  isConnected(): boolean {
    // The plugin creates transports but doesn't manage connection state
    // Connection state is managed by the main client
    return this.transport !== null;
  }

  isSupported(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  getDefaultConfig(): PluginConfig {
    return {
      keepAlive: true,
      connectionTimeout: 5000,
      readTimeout: 30000,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    };
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnected() || !this.transport) {
      return false;
    }

    try {
      // For SSE, we can't easily ping the server, so we assume healthy if connected
      // In a real implementation, you might want to track last received event timestamp
      return true;
    } catch (error) {
      console.warn('[SSEPlugin] Health check failed:', error);
      return false;
    }
  }

  async callTool(client: Client, toolName: string, args: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('SSE Plugin: Not connected');
    }

    console.log(`[SSEPlugin] Calling tool: ${toolName}`);

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      console.log(`[SSEPlugin] Tool call completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`[SSEPlugin] Tool call failed: ${toolName}`, error);
      throw error;
    }
  }

  async getPrimitives(client: Client): Promise<any[]> {
    if (!this.isConnected()) {
      throw new Error('SSE Plugin: Not connected');
    }

    console.log('[SSEPlugin] Getting primitives...');

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
      console.log(`[SSEPlugin] Retrieved ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      console.error('[SSEPlugin] Failed to get primitives:', error);
      throw error;
    }
  }
}
