import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ITransportPlugin, PluginMetadata, PluginConfig } from '../../types/plugin.js';

export class StreamableHttpPlugin implements ITransportPlugin {
  readonly metadata: PluginMetadata = {
    name: 'StreamableHttpPlugin',
    version: '1.0.0',
    transportType: 'streamable-http',
    description: 'Streamable HTTP transport for MCP protocol',
    author: 'MCP SuperAssistant'
  };

  private transport: Transport | null = null;

  async initialize(config: PluginConfig): Promise<void> {
    // Configuration can be used for future enhancements
    console.log(`[StreamableHttpPlugin] Initialized with config:`, config);
  }

  async connect(uri: string): Promise<Transport> {
    console.log(`[StreamableHttpPlugin] Creating transport for: ${uri}`);

    try {
      const transport = await this.createConnection(uri);
      this.transport = transport;
      console.log('[StreamableHttpPlugin] Transport created successfully');
      return transport;
    } catch (error) {
      console.error('[StreamableHttpPlugin] Transport creation failed:', error);
      throw error;
    }
  }

  private async createConnection(uri: string): Promise<Transport> {
    try {
      // Validate and parse URI
      const url = new URL(uri);
      console.log(`[StreamableHttpPlugin] Creating Streamable HTTP transport for: ${url.toString()}`);

      // Create streamable HTTP transport
      const transport = new StreamableHTTPClientTransport(url);

      // Return the transport without testing
      // The main client will handle the connection test
      console.log('[StreamableHttpPlugin] Streamable HTTP transport created successfully');
      return transport;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Enhanced error messages for Streamable HTTP-specific issues
      let enhancedError = errorMessage;
      if (errorMessage.includes('404')) {
        enhancedError = 'Streamable HTTP endpoint not found (404). Verify the server URL and endpoint path.';
      } else if (errorMessage.includes('timeout')) {
        enhancedError = 'Streamable HTTP connection timeout. The server may be slow or unreachable.';
      } else if (errorMessage.includes('Failed to fetch')) {
        enhancedError = 'Streamable HTTP connection failed. Check if the server is running and accessible.';
      } else if (errorMessage.includes('protocol')) {
        enhancedError = 'Streamable HTTP protocol error. The server may not support streamable HTTP.';
      }

      throw new Error(`StreamableHttpPlugin: ${enhancedError}`);
    }
  }

  async disconnect(): Promise<void> {
    console.log('[StreamableHttpPlugin] Disconnecting...');

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.warn('[StreamableHttpPlugin] Error during transport cleanup:', error);
      }
    }

    this.transport = null;

    console.log('[StreamableHttpPlugin] Disconnected');
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
      fallbackToSSE: false,
      maxRetries: 2,
    };
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnected() || !this.transport) {
      return false;
    }

    try {
      // For streamable HTTP, we assume healthy if transport exists
      // The streamable HTTP transport handles its own health monitoring
      return true;
    } catch (error) {
      console.warn('[StreamableHttpPlugin] Health check failed:', error);
      return false;
    }
  }

  async callTool(client: Client, toolName: string, args: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('StreamableHttpPlugin: Not connected');
    }

    console.log(`[StreamableHttpPlugin] Calling tool: ${toolName}`);

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      console.log(`[StreamableHttpPlugin] Tool call completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`[StreamableHttpPlugin] Tool call failed: ${toolName}`, error);
      throw error;
    }
  }

  async getPrimitives(client: Client): Promise<any[]> {
    if (!this.isConnected()) {
      throw new Error('StreamableHttpPlugin: Not connected');
    }

    console.log('[StreamableHttpPlugin] Getting primitives...');

    try {
      const capabilities = client.getServerCapabilities();
      const primitives: any[] = [];
      const promises: Promise<void>[] = [];

      if (capabilities?.resources) {
        promises.push(
          client.listResources().then(({ resources }) => {
            resources.forEach(item => primitives.push({ type: 'resource', value: item }));
          }).catch(error => {
            console.warn('[StreamableHttpPlugin] Failed to list resources:', error);
          }),
        );
      }

      if (capabilities?.tools) {
        promises.push(
          client.listTools().then(({ tools }) => {
            tools.forEach(item => primitives.push({ type: 'tool', value: item }));
          }).catch(error => {
            console.warn('[StreamableHttpPlugin] Failed to list tools:', error);
          }),
        );
      }

      if (capabilities?.prompts) {
        promises.push(
          client.listPrompts().then(({ prompts }) => {
            prompts.forEach(item => primitives.push({ type: 'prompt', value: item }));
          }).catch(error => {
            console.warn('[StreamableHttpPlugin] Failed to list prompts:', error);
          }),
        );
      }

      await Promise.all(promises);
      console.log(`[StreamableHttpPlugin] Retrieved ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      console.error('[StreamableHttpPlugin] Failed to get primitives:', error);
      return [];
    }
  }
}