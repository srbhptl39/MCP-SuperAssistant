import { useCallback } from 'react';
import { mcpClient } from '../core/mcp-client';
import { useConnectionStatus, useAvailableTools, useServerConfig } from './useStores';
import { useToolStore } from '../stores/tool.store';
import type { ServerConfig } from '../types/stores';

/**
 * useMcpCommunication – thin facade over mcpClient that exposes a stable API to
 * UI components while relying entirely on Zustand stores for reactive state.
 *
 * All expensive logic (heartbeat, retries, etc.) lives in the background script
 * – the client merely forwards calls through ContextBridge.
 */
export const useMcpCommunication = () => {
  /* ---------------------------------------------------------------------- */
  /* Store selectors                                                         */
  /* ---------------------------------------------------------------------- */
  const connection = useConnectionStatus();
  const { tools } = useAvailableTools();
  const { config, setConfig } = useServerConfig();
  const toolActions = useToolStore();

  /* ---------------------------------------------------------------------- */
  /* Helper callbacks                                                        */
  /* ---------------------------------------------------------------------- */
  const callTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    return mcpClient.callTool(toolName, args);
  }, []);

  const refreshTools = useCallback(async (forceRefresh = false) => {
    const updated = await mcpClient.getAvailableTools(forceRefresh);
    toolActions.setAvailableTools(updated);
    return updated;
  }, [toolActions]);

  const forceReconnect = useCallback(async () => {
    return mcpClient.forceReconnect();
  }, []);

  const getServerConfig = useCallback(async () => {
    const cfg = await mcpClient.getServerConfig();
    setConfig(cfg);
    return cfg;
  }, [setConfig]);

  const updateServerConfig = useCallback(async (cfg: Partial<ServerConfig>) => {
    const ok = await mcpClient.updateServerConfig(cfg);
    if (ok) {
      setConfig({ ...config, ...cfg });
    }
    return ok;
  }, [config, setConfig]);

  /* ---------------------------------------------------------------------- */
  /* Public interface                                                        */
  /* ---------------------------------------------------------------------- */
  const serverStatus = connection.status as 'connected' | 'disconnected' | 'reconnecting' | 'error';

  const sendMessage = async (tool: any): Promise<string> => {
    let toolName = tool.name;
    let toolArgs: Record<string, unknown> = tool.args || {};

    // Support legacy MCPTool shape
    if (tool.toolName && tool.rawArguments !== undefined) {
      toolName = tool.toolName;
      try {
        toolArgs = JSON.parse(tool.rawArguments);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error: Invalid JSON arguments: ${msg}`;
      }
    }

    try {
      const result = await callTool(toolName, toolArgs);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  };

  return {
    // Legacy aliases
    serverStatus,
    sendMessage,

    // Native fields
    connectionStatus: connection.status,
    isConnected: connection.isConnected,
    isReconnecting: connection.isReconnecting,
    availableTools: tools.map(t => ({
      name: t.name,
      description: t.description,
      schema: typeof (t as any).schema === 'string' ? (t as any).schema : JSON.stringify(t.input_schema ?? {}),
    })),
    lastConnectionError: connection.error || '',

    callTool,
    refreshTools,
    forceReconnect,
    getServerConfig,
    updateServerConfig,
  };
};
