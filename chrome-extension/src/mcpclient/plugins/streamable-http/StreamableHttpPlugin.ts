import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ITransportPlugin, PluginMetadata, PluginConfig } from '../../types/plugin.js';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('StreamableHttpPlugin');

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
    logger.debug(`Initialized with config:`, config);
  }

  async connect(uri: string): Promise<Transport> {
    logger.debug(`Creating transport for: ${uri}`);

    try {
      const transport = await this.createConnection(uri);
      this.transport = transport;
      logger.debug('[StreamableHttpPlugin] Transport created successfully');
      return transport;
    } catch (error) {
      logger.error('[StreamableHttpPlugin] Transport creation failed:', error);
      throw error;
    }
  }

  private async createConnection(uri: string): Promise<Transport> {
    try {
      // Validate and parse URI
      const url = new URL(uri);
      logger.debug(`Creating Streamable HTTP transport for: ${url.toString()}`);

      // Create streamable HTTP transport
      const transport = new StreamableHTTPClientTransport(url);

      // Return the transport without testing
      // The main client will handle the connection test
      logger.debug('[StreamableHttpPlugin] Streamable HTTP transport created successfully');
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
    logger.debug('[StreamableHttpPlugin] Disconnecting...');

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        logger.warn('[StreamableHttpPlugin] Error during transport cleanup:', error);
      }
    }

    this.transport = null;

    logger.debug('[StreamableHttpPlugin] Disconnected');
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
      logger.warn('[StreamableHttpPlugin] Health check failed:', error);
      return false;
    }
  }

  async callTool(client: Client, toolName: string, args: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('StreamableHttpPlugin: Not connected');
    }

    logger.debug(`Calling tool: ${toolName}`);

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      logger.debug(`Tool call completed: ${toolName}`);
      return result;
    } catch (error) {
      logger.error(`Tool call failed: ${toolName}`, error);
      throw error;
    }
  }

  async getPrimitives(client: Client): Promise<any[]> {
    if (!this.isConnected()) {
      throw new Error('StreamableHttpPlugin: Not connected');
    }

    logger.debug('[StreamableHttpPlugin] Getting primitives...');

    try {
      const capabilities = client.getServerCapabilities();
      const primitives: any[] = [];
      const promises: Promise<void>[] = [];

      if (capabilities?.resources) {
        promises.push(
          client.listResources().then(({ resources }) => {
            resources.forEach(item => primitives.push({ type: 'resource', value: item }));
          }).catch(error => {
            logger.warn('[StreamableHttpPlugin] Failed to list resources:', error);
          }),
        );
      }

      if (capabilities?.tools) {
        promises.push(
          client.listTools().then(({ tools }) => {
            tools.forEach(item => primitives.push({ type: 'tool', value: item }));
          }).catch(error => {
            logger.warn('[StreamableHttpPlugin] Failed to list tools:', error);
          }),
        );
      }

      if (capabilities?.prompts) {
        promises.push(
          client.listPrompts().then(({ prompts }) => {
            prompts.forEach(item => primitives.push({ type: 'prompt', value: item }));
          }).catch(error => {
            logger.warn('[StreamableHttpPlugin] Failed to list prompts:', error);
          }),
        );
      }

      await Promise.all(promises);
      logger.debug(`Retrieved ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      logger.error('[StreamableHttpPlugin] Failed to get primitives:', error);
      return [];
    }
  }
}