import { contextBridge } from './context-bridge';
import { useConnectionStore } from '../stores/connection.store';
import { useToolStore } from '../stores/tool.store';
import { eventBus } from '../events/event-bus';
import type { ServerConfig } from '../types/stores';

/**
 * McpClient – thin wrapper around ContextBridge for communicating with the
 * background script. It forwards results to the relevant Zustand stores so that
 * UI components can simply subscribe to store slices instead of passing
 * callbacks around.
 */
class McpClient {
  private static instance: McpClient | null = null;
  private constructor() {
    // Listen for connection status broadcasts coming from background script
    contextBridge.onMessage('connection:status-changed', message => {
      const { status, error } = message.payload ?? {};
      const store = useConnectionStore.getState();

      switch (status) {
        case 'connected':
          store.setConnected(Date.now());
          break;
        case 'reconnecting':
          store.startReconnecting();
          break;
        case 'error':
          store.setDisconnected(error ?? 'Unknown connection error');
          break;
        default:
          store.setDisconnected();
      }
    });

    // Listen for tool-list updates (broadcast by background when primitives
    // change or when we explicitly request a refresh).
    contextBridge.onMessage('mcp:tool-update', message => {
      const tools = Array.isArray(message.payload) ? message.payload : [];
      useToolStore.getState().setAvailableTools(tools);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public API wrappers                                                */
  /* ------------------------------------------------------------------ */

  /** Call a tool on the MCP server. */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    return contextBridge.sendMessage('background', 'mcp:call-tool', { toolName, args }, { timeout: 30_000 });
  }

  /** Retrieve the list of available tools. */
  async getAvailableTools(forceRefresh = false): Promise<any[]> {
    const tools = await contextBridge.sendMessage('background', 'mcp:get-tools', { forceRefresh }, { timeout: 10_000 });
    // Update store for consumers.
    useToolStore.getState().setAvailableTools(tools);
    return tools;
  }

  /** Force a reconnect to the MCP SSE endpoint. */
  async forceReconnect(): Promise<boolean> {
    useConnectionStore.getState().startReconnecting();
    const { isConnected } = await contextBridge.sendMessage('background', 'mcp:force-reconnect', {}, { timeout: 15_000 });
    if (isConnected) {
      useConnectionStore.getState().setConnected(Date.now());
    } else {
      useConnectionStore.getState().setDisconnected('Reconnect attempt failed');
    }
    return isConnected;
  }

  /** Fetch current server configuration from background storage. */
  async getServerConfig(): Promise<ServerConfig> {
    return contextBridge.sendMessage('background', 'mcp:get-server-config', {}, { timeout: 5_000 });
  }

  /** Update server configuration in background storage. */
  async updateServerConfig(config: Partial<ServerConfig>): Promise<boolean> {
    const { success } = await contextBridge.sendMessage('background', 'mcp:update-server-config', { config }, { timeout: 5_000 });
    return !!success;
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
}

// Export the singleton for app-wide use
export const mcpClient = McpClient.getInstance();
export type { McpClient };
