// pages/content/src/utils/backgroundCommunication.ts

import { useState, useEffect, useCallback } from 'react';
import { mcpHandler } from '@src/utils/mcpHandler';
import { Primitive, Tool, BackgroundCommunication, ServerConfig } from '@src/types/mcp';
import { logMessage } from '@src/utils/helpers';

/**
 * Custom hook to handle communication with the background script via mcpHandler
 */
export const useBackgroundCommunication = (): BackgroundCommunication => {
  // State for server connection status
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'error' | 'reconnecting'>(
    'disconnected',
  );
  // State for list of available tools
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  // State to track if we're currently reconnecting
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // Subscribe to connection status changes
  useEffect(() => {
    const handleConnectionStatus = (isConnected: boolean) => {
      // Only update if we're not in the middle of a manual reconnect
      if (!isReconnecting) {
        setServerStatus(isConnected ? 'connected' : 'disconnected');
      }
    };

    // Register the callback with mcpHandler
    mcpHandler.onConnectionStatusChanged(handleConnectionStatus);

    // Cleanup: Unregister the callback when the component unmounts
    return () => {
      mcpHandler.offConnectionStatusChanged(handleConnectionStatus);
    };
  }, [isReconnecting]);

  // Fetch available tools when the connection status changes to 'connected'
  useEffect(() => {
    if (serverStatus === 'connected') {
      getAvailableTools()
        .then(tools => setAvailableTools(tools))
        .catch(() => {
          setServerStatus('error');
          setAvailableTools([]);
        });
    } else if (serverStatus === 'disconnected' || serverStatus === 'error') {
      setAvailableTools([]);
    }
  }, [serverStatus]);

  // Set up a listener for broadcast tool updates
  useEffect(() => {
    // Create a callback function to handle broadcast tool updates
    const handleBroadcastToolUpdate = (primitives: Primitive[]) => {
      logMessage(`[Background Communication] Received broadcast tool update with ${primitives.length} primitives`);

      // Transform the primitives into Tool objects
      const tools: Tool[] = primitives
        .filter((primitive: Primitive) => primitive.type === 'tool')
        .map((primitive: Primitive) => ({
          name: primitive.value.name,
          description: primitive.value.description || '',
          schema: JSON.stringify(primitive.value.inputSchema || {}),
        }));

      logMessage(`[Background Communication] Updating available tools with ${tools.length} tools from broadcast`);

      // Update the state with the new tools
      setAvailableTools(tools);
    };

    // Register the callback with mcpHandler
    mcpHandler.onBroadcastToolUpdate(handleBroadcastToolUpdate);

    // Cleanup: Unregister the callback when the component unmounts
    return () => {
      mcpHandler.offBroadcastToolUpdate(handleBroadcastToolUpdate);
    };
  }, []);

  // Function to call an MCP tool
  const callTool = useCallback(async (toolName: string, args: { [key: string]: unknown }): Promise<any> => {
    return new Promise((resolve, reject) => {
      mcpHandler.callTool(toolName, args, (result, error) => {
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      });
    });
  }, []);

  // Function to fetch available tools from the MCP server
  const getAvailableTools = useCallback(async (): Promise<Tool[]> => {
    return new Promise((resolve, reject) => {
      // Use getAvailableToolPrimitives instead of getAvailableTools
      mcpHandler.getAvailableToolPrimitives((result, error) => {
        if (error) {
          reject(new Error(error));
        } else {
          // Transform the result into an array of Tool objects
          // Filter to only include primitives of type 'tool'
          const tools: Tool[] = result
            .filter((primitive: Primitive) => primitive.type === 'tool')
            .map((primitive: Primitive) => ({
              name: primitive.value.name,
              description: primitive.value.description || '',
              schema: JSON.stringify(primitive.value.inputSchema || {}),
            }));
          resolve(tools);
        }
      });
    });
  }, []);

  // Function to get server configuration
  const getServerConfig = useCallback(async (): Promise<ServerConfig> => {
    logMessage('[Background Communication] Getting server configuration');

    return new Promise((resolve, reject) => {
      mcpHandler.getServerConfig((result, error) => {
        if (error) {
          logMessage(`[Background Communication] Error getting server config: ${error}`);
          reject(new Error(error));
        } else {
          logMessage(`[Background Communication] Server config retrieved successfully`);
          resolve(result || { uri: 'http://localhost:3006/sse' }); // Default if no config is returned
        }
      });
    });
  }, []);

  // Function to update server configuration
  const updateServerConfig = useCallback(async (config: ServerConfig): Promise<boolean> => {
    logMessage(`[Background Communication] Updating server configuration: ${JSON.stringify(config)}`);

    return new Promise((resolve, reject) => {
      mcpHandler.updateServerConfig(config, (result, error) => {
        if (error) {
          logMessage(`[Background Communication] Error updating server config: ${error}`);
          reject(new Error(error));
        } else {
          logMessage(`[Background Communication] Server config updated successfully`);
          resolve(result?.success || false);
        }
      });
    });
  }, []);

  // Function to refresh the tools list
  const refreshTools = useCallback(
    async (forceRefresh: boolean = false): Promise<Tool[]> => {
      logMessage(`[Background Communication] Refreshing tools list (forceRefresh: ${forceRefresh})`);

      try {
        if (forceRefresh) {
          // If force refresh is requested, we'll first try to reconnect to ensure a fresh connection
          logMessage('[Background Communication] Force refresh requested, checking connection first');

          // Check if we're already connected
          const isConnected = mcpHandler.getConnectionStatus();
          if (!isConnected) {
            logMessage('[Background Communication] Not connected, attempting to reconnect before refreshing tools');
            // We don't want to use forceReconnect here as it would cause a loop
            // Just wait a moment and continue with the refresh
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // Get available tools from the server with a fresh request
        logMessage('[Background Communication] Fetching tools from server with fresh request');

        // Use a new promise to ensure we get a fresh request
        const tools = await new Promise<Tool[]>((resolve, reject) => {
          // Generate a unique request ID to avoid any caching
          const uniqueRequestId = mcpHandler.getAvailableToolPrimitives((result, error) => {
            if (error) {
              logMessage(`[Background Communication] Error fetching tools: ${error}`);
              reject(new Error(error));
            } else {
              // Transform the result into an array of Tool objects
              // Filter to only include primitives of type 'tool'
              const tools: Tool[] = result
                .filter((primitive: Primitive) => primitive.type === 'tool')
                .map((primitive: Primitive) => ({
                  name: primitive.value.name,
                  description: primitive.value.description || '',
                  schema: JSON.stringify(primitive.value.inputSchema || {}),
                }));
              resolve(tools);
            }
          });

          logMessage(`[Background Communication] Sent fresh tools request with ID: ${uniqueRequestId}`);
        });

        logMessage(`[Background Communication] Tools refreshed successfully, found ${tools.length} tools`);

        // Update the state with the new tools
        setAvailableTools(tools);
        return tools;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`[Background Communication] Error refreshing tools: ${errorMessage}`);
        throw error;
      }
    },
    [getAvailableTools],
  );

  // Function to force reconnect to the MCP server
  const forceReconnect = useCallback(async (): Promise<boolean> => {
    logMessage('[Background Communication] Forcing reconnection to MCP server');
    setIsReconnecting(true);
    setServerStatus('reconnecting');

    return new Promise((resolve, reject) => {
      mcpHandler.forceReconnect((result, error) => {
        setIsReconnecting(false);

        if (error) {
          logMessage(`[Background Communication] Reconnection failed: ${error}`);
          setServerStatus('error');
          reject(new Error(error));
        } else {
          const isConnected = result?.isConnected || false;
          logMessage(`[Background Communication] Reconnection completed, connected: ${isConnected}`);
          setServerStatus(isConnected ? 'connected' : 'disconnected');

          // If connected, refresh the tools list with force refresh to ensure we get fresh data
          if (isConnected) {
            logMessage('[Background Communication] Connection successful, forcing tools refresh');
            getAvailableTools()
              .then(tools => {
                setAvailableTools(tools);
                logMessage(
                  `[Background Communication] Successfully refreshed ${tools.length} tools after reconnection`,
                );

                // Force a second refresh to ensure we have the latest tools from the new server
                return refreshTools(true);
              })
              .then(tools => {
                setAvailableTools(tools);
                logMessage(`[Background Communication] Second refresh completed, found ${tools.length} tools`);
                resolve(true);
              })
              .catch(refreshError => {
                logMessage(
                  `[Background Communication] Error refreshing tools: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
                );
                setServerStatus('error');
                setAvailableTools([]);
                resolve(false);
              });
          } else {
            setAvailableTools([]);
            resolve(false);
          }
        }
      });
    });
  }, [getAvailableTools, refreshTools]);

  // Function to send a message to execute a tool (used by sidebar components)
  const sendMessage = useCallback(
    async (tool: any): Promise<string> => {
      try {
        const result = await callTool(tool.name, tool.args || {});
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error) {
        console.error('Error executing tool:', error);
        // Safely handle error of unknown type
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    [callTool],
  );

  // Return the communication interface
  return {
    serverStatus,
    availableTools,
    callTool,
    getAvailableTools,
    sendMessage,
    refreshTools,
    forceReconnect,
    isReconnecting,
    getServerConfig,
    updateServerConfig,
  };
};
