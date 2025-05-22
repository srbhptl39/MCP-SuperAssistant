// pages/content/src/utils/backgroundCommunication.ts

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { mcpHandler } from '@src/utils/mcpHandler';
import type { Primitive, Tool, BackgroundCommunication, ServerConfig } from '@src/types/mcp';
import { logMessage } from '@src/utils/helpers';
import Ajv from 'ajv';

/**
 * Custom hook to handle communication with the background script via mcpHandler
 */
export const useBackgroundCommunication = (): BackgroundCommunication => {
  // Default config as a constant
  const DEFAULT_CONFIG: ServerConfig = { uri: 'http://localhost:3006/sse' };

  // Connection management constants
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RETRY_DELAY_MS = 5000; // 5 seconds
  const MAX_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes
  const CIRCUIT_BREAKER_RESET_MS = 15 * 60 * 1000; // 15 minutes

  // State for server connection status
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'error' | 'reconnecting'>(
    'disconnected',
  );
  // State for list of available tools
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  // Keep a ref in sync with availableTools so we can access the latest value
  const availableToolsRef = useRef<Tool[]>([]);
  
  // Connection management state
  const [retryCount, setRetryCount] = useState<number>(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const lastConnectionAttemptRef = useRef<number>(0);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState<boolean>(false);
  const circuitBreakerTimeoutRef = useRef<number | null>(null);
  const logThrottleRef = useRef<{[key: string]: number}>({});
  
  // Function to fetch available tools from the MCP server - declare early to avoid reference errors
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
  
  // Track tool fetch requests to prevent duplicates with improved locking mechanism
  const toolFetchRequestRef = useRef<{ 
    inProgress: boolean; 
    lastFetch: number; 
    promise: Promise<Tool[]> | null;
    lockAcquired: boolean;
    lockTimestamp: number;
    toolsHash: string; // Hash to detect changes in tool list
  }>({ 
    inProgress: false, 
    lastFetch: 0,
    promise: null,
    lockAcquired: false,
    lockTimestamp: 0,
    toolsHash: ''
  });
  
  // Function to calculate a simple hash of the tools list to detect changes
  const calculateToolsHash = useCallback((tools: Tool[]): string => {
    // Sort tools by name to ensure consistent hash
    const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    // Create a string with tool names and descriptions
    const toolsString = sortedTools.map(tool => `${tool.name}:${tool.description}`).join('|');
    // Return a simple hash of the string
    return String(toolsString.split('').reduce((a, b) => (a * 31 + b.charCodeAt(0)) | 0, 0));
  }, []);
  
  // Function to refresh the tools list with smarter caching and better locking
  const refreshTools = useCallback(
    async (forceRefresh: boolean = false): Promise<Tool[]> => {
      // Acquire lock with timeout to prevent deadlocks
      const acquireLock = (): boolean => {
        const now = Date.now();
        // If lock is already acquired by this request, return true
        if (toolFetchRequestRef.current.lockAcquired) {
          return true;
        }
        // If another request has the lock but it's older than 10 seconds, consider it stale and take over
        if (now - toolFetchRequestRef.current.lockTimestamp > 10000) {
          toolFetchRequestRef.current.lockAcquired = true;
          toolFetchRequestRef.current.lockTimestamp = now;
          return true;
        }
        // If lock is not acquired and not stale, try to acquire it
        if (!toolFetchRequestRef.current.inProgress) {
          toolFetchRequestRef.current.lockAcquired = true;
          toolFetchRequestRef.current.lockTimestamp = now;
          return true;
        }
        // Lock is held by another request
        return false;
      };

      // Release lock
      const releaseLock = () => {
        toolFetchRequestRef.current.lockAcquired = false;
      };

      // Check if we already have tools and if a recent fetch was made (within last 30 seconds)
      const now = Date.now();
      const CACHE_TTL = 30000; // 30 seconds cache
      
      // If we have tools and it's not a force refresh, use the cache
      if (!forceRefresh && availableToolsRef.current.length > 0 && (now - toolFetchRequestRef.current.lastFetch < CACHE_TTL)) {
        logMessage('[Background Communication] Using cached tools list (recent fetch)');
        return availableToolsRef.current;
      }
      
      // If there's already a request in progress, return the existing promise
      if (toolFetchRequestRef.current.inProgress && toolFetchRequestRef.current.promise) {
        logMessage('[Background Communication] Tool fetch already in progress, reusing request');
        return toolFetchRequestRef.current.promise;
      }
      
      // Try to acquire lock
      if (!acquireLock()) {
        // If we couldn't acquire the lock, wait for the existing request
        logMessage('[Background Communication] Waiting for lock to be released');
        // Wait for up to 5 seconds for the lock to be released
        for (let i = 0; i < 50; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!toolFetchRequestRef.current.inProgress) {
            // Lock was released, return the cached tools
            logMessage('[Background Communication] Lock released, using cached tools');
            return availableToolsRef.current;
          }
        }
        // If we still couldn't acquire the lock after waiting, use cached tools or continue with a new request
        if (availableToolsRef.current.length > 0) {
          logMessage('[Background Communication] Lock timeout, using cached tools');
          return availableToolsRef.current;
        }
      }
      
      logMessage(`[Background Communication] Refreshing tools list (forceRefresh: ${forceRefresh})`);

      // Create a new promise for this fetch request
      const fetchPromise = (async () => {
        try {
          // Check connection status first
          const isConnected = mcpHandler.getConnectionStatus();
          if (!isConnected) {
            logMessage('[Background Communication] Not connected, using cached tools if available');
            if (availableToolsRef.current.length > 0) {
              return availableToolsRef.current;
            }
            // If no cached tools, continue with the fetch attempt
          }

          // Get available tools from the server
          logMessage('[Background Communication] Fetching tools from server');

          // Use a new promise to ensure we get a fresh request
          const tools = await new Promise<Tool[]>((resolve, reject) => {
            // Generate a unique request ID
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
            }, forceRefresh); // Pass forceRefresh parameter

            logMessage(
              `[Background Communication] Sent tools request with ID: ${uniqueRequestId} (forceRefresh: ${forceRefresh})`,
            );
          });

          logMessage(`[Background Communication] Tools refreshed successfully, found ${tools.length} tools`);

          // Calculate hash of the new tools list
          const newToolsHash = calculateToolsHash(tools);
          const hashChanged = newToolsHash !== toolFetchRequestRef.current.toolsHash;
          
          if (hashChanged) {
            logMessage('[Background Communication] Tool list has changed, updating cache');
            // Update the tools hash
            toolFetchRequestRef.current.toolsHash = newToolsHash;
          }

          // Update the tools list
          setAvailableTools(tools);
          availableToolsRef.current = tools;
          
          // Update the last fetch time
          toolFetchRequestRef.current.lastFetch = Date.now();

          return tools;
        } catch (error) {
          logMessage(
            `[Background Communication] Error refreshing tools: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Return current tools on error
          return availableToolsRef.current;
        } finally {
          // Mark request as complete
          toolFetchRequestRef.current.inProgress = false;
          // Release the lock
          releaseLock();
        }
      })();
      
      // Store the promise and mark request as in progress
      toolFetchRequestRef.current.promise = fetchPromise;
      toolFetchRequestRef.current.inProgress = true;
      
      return fetchPromise;
    },
    [getAvailableTools],
  );

  // Sync ref on each tools update
  useEffect(() => {
    availableToolsRef.current = availableTools;
  }, [availableTools]);
  // State to track if we're currently reconnecting
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  // Initialize server config with default value to prevent loading issues
  const [serverConfigCache, setServerConfigCache] = useState<ServerConfig>(DEFAULT_CONFIG);
  // Track if a config request is in progress
  const configRequestInProgressRef = useRef<boolean>(false);
  // Last fetch timestamp for throttling
  const lastConfigFetchRef = useRef<number>(0);
  // Track initialization status
  const isInitializedRef = useRef<boolean>(false);
  // Initialization complete
  const [isInitComplete, setIsInitComplete] = useState<boolean>(false);

  const ajv = useMemo(() => new Ajv(), []);

  // Preload the config on mount to ensure components can load
  useEffect(() => {
    const initializeConfig = async () => {
      try {
        logMessage('[Background Communication] Starting initial server config fetch');
        const config = await fetchServerConfig();
        setServerConfigCache(config);
        lastConfigFetchRef.current = Date.now();
      } catch (error) {
        logMessage(
          `[Background Communication] Error in initial config fetch: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Keep using the default config that was set in useState
      } finally {
        setIsInitComplete(true);
        isInitializedRef.current = true;
      }
    };

    // Start initialization but don't await it
    initializeConfig();

    // Force completion after a timeout
    const timeoutId = setTimeout(() => {
      if (!isInitializedRef.current) {
        logMessage('[Background Communication] Force completing initialization after timeout');
        isInitializedRef.current = true;
        setIsInitComplete(true);
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, []);

  /**
   * Helper function to throttle log messages to reduce logging frequency
   * Only logs if the specified time has passed since the last log with the same key
   */
  const throttledLogMessage = useCallback((message: string, key: string, minIntervalMs: number = 60000) => {
    const now = Date.now();
    const lastLog = logThrottleRef.current[key] || 0;
    
    if (now - lastLog >= minIntervalMs) {
      logMessage(message);
      logThrottleRef.current[key] = now;
    }
  }, []);

  /**
   * Calculate the exponential backoff delay based on retry count
   * Uses a more aggressive exponential factor (2.0) with a maximum cap
   */
  const calculateBackoffDelay = useCallback((retryAttempt: number): number => {
    // Use exponential backoff: BASE_DELAY * (2^retryAttempt)
    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryAttempt);
    // Cap the delay at the maximum value
    return Math.min(delay, MAX_RETRY_DELAY_MS);
  }, []);

  /**
   * Reset the connection state and clear any pending timeouts
   */
  const resetConnectionState = useCallback(() => {
    // Clear any pending retry timeout
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    // Clear any pending circuit breaker timeout
    if (circuitBreakerTimeoutRef.current !== null) {
      window.clearTimeout(circuitBreakerTimeoutRef.current);
      circuitBreakerTimeoutRef.current = null;
    }
    
    // Reset retry count and circuit breaker state
    setRetryCount(0);
    setCircuitBreakerOpen(false);
  }, []);

  /**
   * Attempt to connect to the server with exponential backoff
   * This function is now primarily user-driven and will only be called
   * when explicitly requested by the user or in very limited automatic scenarios
   */
  const connectToServer = useCallback(() => {
    // Don't attempt to connect if the circuit breaker is open
    if (circuitBreakerOpen) {
      throttledLogMessage(
        '[Background Communication] Circuit breaker open, skipping automatic reconnection',
        'circuit-breaker',
        60000
      );
      return;
    }
    
    // Record the connection attempt time
    lastConnectionAttemptRef.current = Date.now();
    
    // Attempt to connect using mcpHandler
    mcpHandler.forceReconnect((result, error) => {
      if (error) {
        // Connection failed
        throttledLogMessage(
          `[Background Communication] Connection attempt ${retryCount + 1}/${MAX_RECONNECT_ATTEMPTS} failed: ${error}`,
          'connection-failed',
          60000
        );
        
        // Increment retry count
        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);
        
        // Check if we've reached the maximum retry attempts
        if (newRetryCount >= MAX_RECONNECT_ATTEMPTS) {
          // Open the circuit breaker
          throttledLogMessage(
            '[Background Communication] Maximum retry attempts reached, opening circuit breaker',
            'circuit-breaker-open',
            60000
          );
          setCircuitBreakerOpen(true);
          
          // Schedule circuit breaker reset
          circuitBreakerTimeoutRef.current = window.setTimeout(() => {
            throttledLogMessage(
              '[Background Communication] Circuit breaker reset after timeout',
              'circuit-breaker-reset',
              60000
            );
            setCircuitBreakerOpen(false);
            setRetryCount(0);
            circuitBreakerTimeoutRef.current = null;
          }, CIRCUIT_BREAKER_RESET_MS);
        } else {
          // We no longer automatically schedule retries
          // This makes reconnection primarily user-driven
          throttledLogMessage(
            `[Background Communication] Connection failed. User can manually reconnect via the UI.`,
            'manual-reconnect-required',
            60000
          );
        }
      } else {
        // Connection successful
        const isConnected = result?.isConnected || false;
        if (isConnected) {
          throttledLogMessage(
            '[Background Communication] Connection successful',
            'connection-success',
            60000
          );
          // Reset connection state on successful connection
          resetConnectionState();
          // Refresh tools
          refreshTools(true).catch(err => {
            throttledLogMessage(
              `[Background Communication] Error refreshing tools after connection: ${err instanceof Error ? err.message : String(err)}`,
              'refresh-error',
              60000
            );
          });
        }
      }
    });
  }, [retryCount, circuitBreakerOpen, calculateBackoffDelay, resetConnectionState, refreshTools, throttledLogMessage]);

  // Subscribe to connection status changes
  useEffect(() => {
    const handleConnectionStatus = (isConnected: boolean) => {
    const prevStatus = serverStatus;
    const newStatus = isConnected ? 'connected' : 'disconnected';
    
    // CRITICAL FIX: Always log connection status changes for debugging
    logMessage(`[Background Communication] Connection status change received: ${isConnected ? 'Connected' : 'Disconnected'}, current UI status: ${prevStatus}`);
    
    // CRITICAL FIX: ALWAYS update the UI status to match the actual connection status
    // This ensures the UI always reflects the actual server status, regardless of any conditions
    logMessage(`[Background Communication] FORCE UPDATING status from ${prevStatus} to ${newStatus} (isReconnecting: ${isReconnecting})`);
    setServerStatus(newStatus);
    
    // Handle disconnection
    if (newStatus === 'disconnected') {
      logMessage('[Background Communication] Server disconnected. User can manually reconnect via the UI.');
      
      // Force a state update to ensure the UI reflects the disconnected state
      setTimeout(() => {
        if (serverStatus !== 'disconnected') {
          logMessage('[Background Communication] Forcing disconnected state update after timeout');
          setServerStatus('disconnected');
        }
      }, 500);
    }
    // Handle connection
    else if (newStatus === 'connected') {
      resetConnectionState();
      
      // If we have no tools cached, fetch them
      if (availableToolsRef.current.length === 0) {
        logMessage('[Background Communication] Connected with empty tool cache, refreshing tools');
        refreshTools(true).catch(err => {
          logMessage(`[Background Communication] Error refreshing tools after connection: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    }
    
    // We no longer attempt automatic reconnection for disconnected states
    // This is now handled through the UI's reconnect button
  };

    // Register the callback with mcpHandler
    mcpHandler.onConnectionStatusChanged(handleConnectionStatus);

    // Cleanup: Unregister the callback when the component unmounts
    return () => {
      mcpHandler.offConnectionStatusChanged(handleConnectionStatus);
    };
  }, [isReconnecting, refreshTools]);

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
  const callTool = useCallback(
    async (toolName: string, args: { [key: string]: unknown }): Promise<any> => {
      // Schema validation for tool arguments
      const toolEntry = availableTools.find(t => t.name === toolName);
      if (toolEntry) {
        try {
          const schemaObj = JSON.parse(toolEntry.schema);
          const validate = ajv.compile(schemaObj);
          if (!validate(args)) {
            const errorText = ajv.errorsText(validate.errors);
            throw new Error(`Invalid arguments for ${toolName}: ${errorText}`);
          }
        } catch (e) {
          logMessage(
            `[Background Communication] Schema validation error for ${toolName}: ${e instanceof Error ? e.message : String(e)}`,
          );
          throw e;
        }
      }

      return new Promise((resolve, reject) => {
        mcpHandler.callTool(toolName, args, (result, error) => {
          if (error) {
            reject(new Error(error));
          } else {
            resolve(result);
          }
        });
      });
    },
    [availableTools, ajv],
  );

  // Function declaration moved up to fix reference error

  // Function to get server configuration with caching
  const getServerConfig = useCallback(async (): Promise<ServerConfig> => {
    // If initialization hasn't completed, return the current cache (which at minimum has the default)
    if (!isInitComplete) {
      return serverConfigCache;
    }

    // If we have a cached config and it's been less than 5 minutes since the last fetch, return it
    const now = Date.now();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (now - lastConfigFetchRef.current < CACHE_TTL) {
      // logMessage('[Background Communication] Using cached server configuration');
      return serverConfigCache;
    }

    // If there's already a request in progress, wait for it to complete
    if (configRequestInProgressRef.current) {
      // Wait for the current request to finish and update the cache
      let retryCount = 0;
      while (configRequestInProgressRef.current && retryCount < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
      }

      // Return current cache regardless
      return serverConfigCache;
    }

    try {
      const config = await fetchServerConfig();
      return config;
    } catch (error) {
      logMessage(`[Background Communication] Error fetching config, using current cache`);
      return serverConfigCache;
    }
  }, [serverConfigCache, isInitComplete]);

  // Extract the actual fetch logic to a separate function
  const fetchServerConfig = useCallback(async (): Promise<ServerConfig> => {
    // Mark that we're starting a request
    configRequestInProgressRef.current = true;

    try {
      // Set up a timeout promise to ensure we don't wait too long
      const timeoutPromise = new Promise<ServerConfig>(resolve => {
        setTimeout(() => {
          resolve(serverConfigCache); // Resolve with current cache on timeout
        }, 3000); // 3 second timeout
      });

      // Actual fetch promise
      const fetchPromise = new Promise<ServerConfig>((resolve, reject) => {
        try {
          mcpHandler.getServerConfig((result, error) => {
            if (error) {
              logMessage(`[Background Communication] Error getting server config: ${error}`);
              reject(new Error(error));
            } else {
              logMessage(`[Background Communication] Server config retrieved successfully`);
              resolve(result || DEFAULT_CONFIG);
            }
          });
        } catch (innerError) {
          reject(innerError);
        }
      });

      // Race between the fetch and the timeout
      const config = await Promise.race([fetchPromise, timeoutPromise]);

      // Update cache and timestamp
      setServerConfigCache(config);
      lastConfigFetchRef.current = Date.now();
      return config;
    } catch (error) {
      // If fetch fails, return current cache
      return serverConfigCache;
    } finally {
      // Mark request as complete
      configRequestInProgressRef.current = false;
    }
  }, [serverConfigCache]);

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
          // Update cache when config is successfully updated
          setServerConfigCache(config);
          lastConfigFetchRef.current = Date.now();
          resolve(result?.success || false);
        }
      });
    });
  }, []);

  // Function declaration moved up to fix reference error

  // Function to force reconnect to the MCP server (user-initiated)
  const forceReconnect = useCallback(async (): Promise<boolean> => {
    throttledLogMessage('[Background Communication] User-initiated reconnection to MCP server', 'force-reconnect', 1000);
    
    // Reset connection state before attempting reconnection
    resetConnectionState();
    
    // Update UI state
    setIsReconnecting(true);
    setServerStatus('reconnecting');

    return new Promise((resolve, reject) => {
      // Record the connection attempt time
      lastConnectionAttemptRef.current = Date.now();
      
      mcpHandler.forceReconnect((result, error) => {
        setIsReconnecting(false);

        if (error) {
          throttledLogMessage(`[Background Communication] User-initiated reconnection failed: ${error}`, 'force-reconnect-failed', 1000);
          setServerStatus('error');
          reject(new Error(error));
        } else {
          const isConnected = result?.isConnected || false;
          throttledLogMessage(`[Background Communication] User-initiated reconnection completed, connected: ${isConnected}`, 'force-reconnect-complete', 1000);
          setServerStatus(isConnected ? 'connected' : 'disconnected');

          // If connected, refresh the tools list with force refresh to ensure we get fresh data
          if (isConnected) {
            throttledLogMessage('[Background Communication] Connection successful, forcing tools refresh', 'force-reconnect-refresh', 1000);
            getAvailableTools()
              .then(tools => {
                setAvailableTools(tools);
                throttledLogMessage(
                  `[Background Communication] Successfully refreshed ${tools.length} tools after reconnection`,
                  'force-reconnect-refresh-success',
                  1000
                );

                // Force a second refresh to ensure we have the latest tools from the new server
                return refreshTools(true);
              })
              .then(tools => {
                setAvailableTools(tools);
                throttledLogMessage(
                  `[Background Communication] Second refresh completed, found ${tools.length} tools`,
                  'force-reconnect-second-refresh',
                  1000
                );
                resolve(true);
              })
              .catch(refreshError => {
                throttledLogMessage(
                  `[Background Communication] Error refreshing tools: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
                  'force-reconnect-refresh-error',
                  1000
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
  }, [getAvailableTools, refreshTools, resetConnectionState, throttledLogMessage]);

  // Function to send a message to execute a tool (used by sidebar components)
  const sendMessage = useCallback(
    async (tool: any): Promise<string> => {
      try {
        // Handle both standard tools and MCPTools
        let toolName = tool.name;
        let toolArgs = tool.args || {};

        // If it's an MCPTool (has toolName and rawArguments properties)
        if (tool.toolName && tool.rawArguments !== undefined) {
          toolName = tool.toolName;
          try {
            toolArgs = JSON.parse(tool.rawArguments);
          } catch (e) {
            console.error('Error parsing MCPTool arguments:', e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            return `Error: Invalid JSON arguments: ${errorMessage}`;
          }
        }

        const result = await callTool(toolName, toolArgs);
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

  // Debug logging for serverStatus changes
  useEffect(() => {
    logMessage(`[Background Communication] serverStatus changed to: ${serverStatus}`);
  }, [serverStatus]);

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
