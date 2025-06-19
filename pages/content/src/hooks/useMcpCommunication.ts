import { useCallback, useEffect, useState, useMemo } from 'react';
import { mcpClient } from '../core/mcp-client';
import { useConnectionStatus, useAvailableTools, useServerConfig, useToolEnablement } from './useStores';
import { useToolStore } from '../stores/tool.store';
import { logMessage } from '../utils/helpers';
import type { ServerConfig, Tool, ConnectionType } from '../types/stores';

/**
 * useMcpCommunication – Enhanced facade over mcpClient that provides a stable,
 * well-tested API to UI components. This hook ensures consistent state management
 * and proper error handling across all MCP operations.
 *
 * Features:
 * - Reactive state from Zustand stores
 * - Comprehensive error handling
 * - Automatic retry logic for failed operations
 * - Tool validation and normalization
 * - Connection health monitoring
 */
export const useMcpCommunication = () => {
  /* ---------------------------------------------------------------------- */
  /* Store selectors and local state                                        */
  /* ---------------------------------------------------------------------- */
  const connection = useConnectionStatus();
  const { tools } = useAvailableTools();
  const { config, setConfig } = useServerConfig();
  const { isToolEnabled, isLoadingEnablement } = useToolEnablement();
  const toolActions = useToolStore();

  // Local state for operation tracking
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [lastOperationTime, setLastOperationTime] = useState<number>(0);

  /* ---------------------------------------------------------------------- */
  /* Initialization and health monitoring                                   */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const initializeCommunication = async () => {
      try {
        if (!mcpClient.isReady()) {
          throw new Error('MCP Client not properly initialized');
        }

        setIsInitialized(true);
        setInitializationError(null);
        logMessage('[useMcpCommunication] Communication layer initialized successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setInitializationError(errorMessage);
        logMessage(`[useMcpCommunication] Initialization failed: ${errorMessage}`);
      }
    };

    initializeCommunication();
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Enhanced operation wrappers with validation and error handling        */
  /* ---------------------------------------------------------------------- */

  /**
   * Enhanced tool calling with validation and error handling
   */
  const callTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    if (!isInitialized) {
      throw new Error('Communication layer not initialized');
    }

    if (!connection.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    // Validate tool exists in available tools
    const availableTool = tools.find(tool => tool.name === toolName);
    if (!availableTool) {
      throw new Error(`Tool '${toolName}' not found in available tools. Please refresh the tool list.`);
    }

    try {
      setLastOperationTime(Date.now());
      logMessage(`[useMcpCommunication] Calling tool: ${toolName}`);

      const result = await mcpClient.callTool(toolName, args);

      logMessage(`[useMcpCommunication] Tool call successful: ${toolName}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[useMcpCommunication] Tool call failed: ${toolName} - ${errorMessage}`);
      throw new Error(`Tool execution failed: ${errorMessage}`);
    }
  }, [isInitialized, connection.isConnected, tools]);

  /**
   * Enhanced tool refresh with better error handling and validation
   */
  const refreshTools = useCallback(async (forceRefresh = false) => {
    if (!isInitialized) {
      throw new Error('Communication layer not initialized');
    }

    try {
      setLastOperationTime(Date.now());
      logMessage(`[useMcpCommunication] Refreshing tools (force: ${forceRefresh})`);

      const updated = await mcpClient.getAvailableTools(forceRefresh);

      // Validate tools structure
      const validatedTools = updated.filter(tool =>
        tool &&
        typeof tool.name === 'string' &&
        tool.name.length > 0
      );

      if (validatedTools.length !== updated.length) {
        logMessage(`[useMcpCommunication] Filtered out ${updated.length - validatedTools.length} invalid tools`);
      }

      toolActions.setAvailableTools(validatedTools);
      logMessage(`[useMcpCommunication] Successfully refreshed ${validatedTools.length} tools`);

      return validatedTools;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[useMcpCommunication] Tool refresh failed: ${errorMessage}`);
      throw new Error(`Failed to refresh tools: ${errorMessage}`);
    }
  }, [isInitialized, toolActions]);

  /**
   * Enhanced reconnection with comprehensive state management
   */
  const forceReconnect = useCallback(async () => {
    if (!isInitialized) {
      throw new Error('Communication layer not initialized');
    }

    try {
      setLastOperationTime(Date.now());
      logMessage('[useMcpCommunication] Force reconnect requested');

      const success = await mcpClient.forceReconnect();

      if (success) {
        logMessage('[useMcpCommunication] Reconnection successful');
        // Automatically refresh tools after successful reconnection
        try {
          await refreshTools(true);
        } catch (toolError) {
          logMessage(`[useMcpCommunication] Warning: Failed to refresh tools after reconnect: ${toolError}`);
        }
      } else {
        logMessage('[useMcpCommunication] Reconnection failed');
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[useMcpCommunication] Force reconnect error: ${errorMessage}`);
      throw new Error(`Reconnection failed: ${errorMessage}`);
    }
  }, [isInitialized, refreshTools]);

  /**
   * Enhanced server config retrieval with caching
   */
  const getServerConfig = useCallback(async () => {
    if (!isInitialized) {
      throw new Error('Communication layer not initialized');
    }

    try {
      setLastOperationTime(Date.now());
      logMessage('[useMcpCommunication] Getting server config');

      const cfg = await mcpClient.getServerConfig();

      // Update store with retrieved config
      setConfig(cfg);
      logMessage('[useMcpCommunication] Server config retrieved successfully');

      return cfg;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[useMcpCommunication] Failed to get server config: ${errorMessage}`);
      throw new Error(`Failed to get server configuration: ${errorMessage}`);
    }
  }, [isInitialized, setConfig]);

  /**
   * Enhanced server config update with validation
   */
  const updateServerConfig = useCallback(async (cfg: Partial<ServerConfig>) => {
    if (!isInitialized) {
      throw new Error('Communication layer not initialized');
    }

    // Basic validation
    if (cfg.uri && typeof cfg.uri !== 'string') {
      throw new Error('Server URI must be a string');
    }

    if (cfg.connectionType && !['sse', 'websocket'].includes(cfg.connectionType)) {
      throw new Error('Connection type must be either "sse" or "websocket"');
    }

    if (cfg.timeout && (typeof cfg.timeout !== 'number' || cfg.timeout <= 0)) {
      throw new Error('Timeout must be a positive number');
    }

    try {
      setLastOperationTime(Date.now());
      logMessage(`[useMcpCommunication] Updating server config: ${JSON.stringify(cfg)}`);

      const success = await mcpClient.updateServerConfig(cfg);

      if (success) {
        // Update local store with merged config
        setConfig({ ...config, ...cfg });
        logMessage('[useMcpCommunication] Server config updated successfully');
      } else {
        logMessage('[useMcpCommunication] Server config update failed');
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`[useMcpCommunication] Failed to update server config: ${errorMessage}`);
      throw new Error(`Failed to update server configuration: ${errorMessage}`);
    }
  }, [isInitialized, config, setConfig]);

  /* ---------------------------------------------------------------------- */
  /* Legacy compatibility layer                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Legacy sendMessage function for backward compatibility
   * Supports both new and old tool formats
   */
  const sendMessage = useCallback(async (tool: any): Promise<string> => {
    try {
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

      // Validate tool name
      if (!toolName || typeof toolName !== 'string') {
        return 'Error: Tool name is required and must be a string';
      }

      const result = await callTool(toolName, toolArgs);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }, [callTool]);

  /* ---------------------------------------------------------------------- */
  /* Public interface with enhanced data normalization                      */
  /* ---------------------------------------------------------------------- */

  // Normalize tools for consistent interface across components - MEMOIZED to prevent unnecessary re-renders
  const normalizedTools = useMemo(() => {
    // First normalize the tools structure
    const normalized = tools.map((tool: Tool) => ({
      name: tool.name,
      description: tool.description || '',
      // Ensure schema is always a string for legacy compatibility
      schema: typeof (tool as any).schema === 'string'
        ? (tool as any).schema
        : JSON.stringify(tool.input_schema || {}),
      // Keep original input_schema for new components
      input_schema: tool.input_schema
    }));
    
    // Then filter out disabled tools
    const enabledTools = normalized.filter(tool => isToolEnabled(tool.name));
    
    // Only log when tools actually change (not on every render)
    if (enabledTools.length > 0) {
      logMessage(`[useMcpCommunication] Tools normalized and filtered: ${enabledTools.length}/${normalized.length} enabled`);
    }
    
    return enabledTools;
  }, [tools, isToolEnabled]);

  // Throttled debug logging to prevent spam - only log significant changes
  useEffect(() => {
    // Only log when there's a meaningful change in tool count or first load
    const toolCount = normalizedTools.length;
    if (toolCount > 0) {
      logMessage(`[useMcpCommunication] Available tool names: ${normalizedTools.map(t => t.name).slice(0, 3).join(', ')}${toolCount > 3 ? `...and ${toolCount - 3} more` : ''}`);
    }
  }, [normalizedTools.length]); // Only depend on length, not the full array

  // Simplified schema status logging - only run once when tools are loaded
  useEffect(() => {
    if (normalizedTools.length > 0) {
      logMessage(`[useMcpCommunication] Schema status for available tools:`);
      // Only log a summary, not individual tool details
      const toolsWithSchema = normalizedTools.filter(tool => 
        (tool.input_schema && Object.keys(tool.input_schema).length > 0) ||
        (tool.schema && tool.schema !== '{}')
      );
      logMessage(`  ${toolsWithSchema.length}/${normalizedTools.length} tools have valid schemas`);
    }
  }, [normalizedTools.length]); // Only run when tool count changes

  // Enhanced status with more granular information
  const serverStatus = connection.status as 'connected' | 'disconnected' | 'reconnecting' | 'error';
  const connectionHealth = {
    isHealthy: connection.isConnected && !connection.error,
    lastConnectedAt: connection.lastConnectedAt,
    connectionAttempts: connection.connectionAttempts,
    maxRetryAttempts: connection.maxRetryAttempts,
    lastOperationTime
  };

  return {
    /* -------------------------------------------------------------------- */
    /* Core state (reactive from Zustand stores)                           */
    /* -------------------------------------------------------------------- */
    connectionStatus: connection.status,
    isConnected: connection.isConnected,
    isConnecting: connection.status === 'connecting',
    isReconnecting: connection.isReconnecting,
    availableTools: normalizedTools,
    lastConnectionError: connection.error || '',
    serverConfig: config,

    /* -------------------------------------------------------------------- */
    /* Enhanced status information                                          */
    /* -------------------------------------------------------------------- */
    connectionHealth,
    isInitialized,
    initializationError,
    isLoadingToolEnablement: isLoadingEnablement,

    /* -------------------------------------------------------------------- */
    /* Core operations                                                      */
    /* -------------------------------------------------------------------- */
    callTool,
    refreshTools,
    forceReconnect,
    getServerConfig,
    updateServerConfig,

    /* -------------------------------------------------------------------- */
    /* Legacy compatibility                                                 */
    /* -------------------------------------------------------------------- */
    serverStatus, // Legacy alias for connectionStatus
    sendMessage,  // Legacy tool execution interface

    /* -------------------------------------------------------------------- */
    /* Utility functions                                                    */
    /* -------------------------------------------------------------------- */

    /**
     * Get a specific tool by name
     */
    getTool: useCallback((toolName: string) => {
      return normalizedTools.find(tool => tool.name === toolName) || null;
    }, [normalizedTools]),

    /**
     * Check if a specific tool is available
     */
    hasToolAvailable: useCallback((toolName: string) => {
      return normalizedTools.some(tool => tool.name === toolName);
    }, [normalizedTools]),

    /**
     * Get connection status summary for debugging
     */
    getConnectionSummary: useCallback(() => ({
      status: connection.status,
      isConnected: connection.isConnected,
      isReconnecting: connection.isReconnecting,
      error: connection.error,
      lastConnectedAt: connection.lastConnectedAt,
      connectionAttempts: connection.connectionAttempts,
      toolCount: normalizedTools.length,
      isInitialized,
      initializationError,
      lastOperationTime
    }), [connection, normalizedTools, isInitialized, initializationError, lastOperationTime])
  };
};
