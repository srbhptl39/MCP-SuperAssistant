import type React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBackgroundCommunication } from '../hooks/backgroundCommunication';
import { logMessage } from '@src/utils/helpers';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';
import { ServerConfig } from '@src/types/mcp';

type ConfigTab = 'default' | 'mcp-router';

interface ServerStatusProps {
  status: string;
}

const ServerStatus: React.FC<ServerStatusProps> = ({ status: initialStatus }) => {
  // Use local status state to ensure UI stability even with external status issues
  const [status, setStatus] = useState<string>(initialStatus || 'unknown');
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastReconnectTime, setLastReconnectTime] = useState<string>('');
  const [serverConfig, setServerConfig] = useState<ServerConfig>({ uri: '' });
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [hasBackgroundError, setHasBackgroundError] = useState<boolean>(false);
  // Add ref to track initialization status
  const isInitializedRef = useRef<boolean>(false);
  
  // Add state for tab navigation
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>('default');

  // Get communication methods with error handling
  const communicationMethods = useBackgroundCommunication();

  // Destructure with fallbacks in case useBackgroundCommunication fails
  const forceReconnect = useCallback(async () => {
    try {
      if (!communicationMethods.forceReconnect) {
        throw new Error('Communication method unavailable');
      }
      return await communicationMethods.forceReconnect();
    } catch (error) {
      logMessage(`[ServerStatus] Force reconnect error: ${error instanceof Error ? error.message : String(error)}`);
      setHasBackgroundError(true);
      return false;
    }
  }, [communicationMethods]);

  const refreshTools = useCallback(
    async (forceRefresh = false) => {
      try {
        if (!communicationMethods.refreshTools) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.refreshTools(forceRefresh);
      } catch (error) {
        logMessage(`[ServerStatus] Refresh tools error: ${error instanceof Error ? error.message : String(error)}`);
        setHasBackgroundError(true);
        return [];
      }
    },
    [communicationMethods],
  );

  const getServerConfig = useCallback(async () => {
    try {
      if (!communicationMethods.getServerConfig) {
        throw new Error('Communication method unavailable');
      }
      return await communicationMethods.getServerConfig();
    } catch (error) {
      logMessage(`[ServerStatus] Get server config error: ${error instanceof Error ? error.message : String(error)}`);
      setHasBackgroundError(true);
      return { uri: '' };
    }
  }, [communicationMethods]);

  const updateServerConfig = useCallback(
    async (config: ServerConfig) => {
      try {
        if (!communicationMethods.updateServerConfig) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.updateServerConfig(config);
      } catch (error) {
        logMessage(
          `[ServerStatus] Update server config error: ${error instanceof Error ? error.message : String(error)}`,
        );
        setHasBackgroundError(true);
        return false;
      }
    },
    [communicationMethods],
  );

  // CRITICAL FIX: Force the component to ALWAYS use the initialStatus prop directly
  // This ensures the UI always reflects the actual server status without any conditions
  useEffect(() => {
    // Always log the status for debugging
    logMessage(`[ServerStatus] Props received initialStatus: "${initialStatus}", current UI status: "${status}", isReconnecting: ${isReconnecting}`);
    
    // ALWAYS update the status from props, regardless of any other conditions
    if (initialStatus && initialStatus !== status) {
      logMessage(`[ServerStatus] FORCE UPDATING status from "${status}" to "${initialStatus}"`);
      setStatus(initialStatus);
      
      // Update status message based on the new status
      if (initialStatus === 'disconnected') {
        setStatusMessage('Server disconnected. Click the refresh button to reconnect.');
      } else if (initialStatus === 'connected') {
        setStatusMessage('Connected to MCP server');
      } else if (initialStatus === 'error') {
        setStatusMessage('Server connection error. Please check your configuration.');
      }
    }
  }, [initialStatus]); // Only depend on initialStatus to prevent circular dependencies

  // Check for background communication issues
  useEffect(() => {
    const checkBackgroundAvailability = () => {
      const methodsAvailable = !!(
        typeof communicationMethods.forceReconnect === 'function' &&
        typeof communicationMethods.refreshTools === 'function' &&
        typeof communicationMethods.getServerConfig === 'function' &&
        typeof communicationMethods.updateServerConfig === 'function'
      );

      if (!methodsAvailable && !hasBackgroundError) {
        setHasBackgroundError(true);
        setStatus('error');
        setStatusMessage('Extension background services unavailable. Try reloading the page.');
      } else if (methodsAvailable && hasBackgroundError) {
        // Background methods have become available again
        setHasBackgroundError(false);
      }
    };

    checkBackgroundAvailability();

    // Check less frequently to reduce excessive calls - reduced from 10s to 30s
    const intervalId = setInterval(checkBackgroundAvailability, 30000);
    return () => clearInterval(intervalId);
  }, [communicationMethods, hasBackgroundError]);

  useEffect(() => {
    // Fetch current server configuration on component mount
    const fetchServerConfig = async () => {
      try {
        logMessage('[ServerStatus] Fetching initial server configuration');
        const config = await getServerConfig();
        if (config && config.uri) {
          // Update config state
          setServerConfig(config);
          isInitializedRef.current = true;
          logMessage('[ServerStatus] Initial server configuration loaded successfully');
        } else {
          // Handle empty URI case - set a default or placeholder
          const defaultConfig = { uri: 'http://localhost:3006/sse' };
          setServerConfig(defaultConfig);
          logMessage('[ServerStatus] Using default server URI as config returned empty value');
        }
      } catch (error) {
        // Set default URI on error
        const defaultConfig = { uri: 'http://localhost:3006/sse' };
        setServerConfig(defaultConfig);
        logMessage(
          `[ServerStatus] Error fetching server config: ${error instanceof Error ? error.message : String(error)}`,
        );
        isInitializedRef.current = true; // Mark as initialized even on error
      }
    };

    // Always fetch on mount, but only once
    if (!isInitializedRef.current) {
      fetchServerConfig().catch(() => {
        // Set default URI as last resort
        setServerConfig({ uri: 'http://localhost:3006/sse' });
        logMessage('[ServerStatus] Setting default URI after fetch failure');
        isInitializedRef.current = true;
      });
    }
  }, [getServerConfig]); // Keep dependency

  // Add a secondary effect that checks if we need to retry initialization
  useEffect(() => {
    // If we have communicationMethods but initialization failed, try once more
    if (
      !isInitializedRef.current &&
      communicationMethods &&
      typeof communicationMethods.getServerConfig === 'function'
    ) {
      logMessage('[ServerStatus] Retrying server configuration fetch');
      const retryFetch = async () => {
        try {
          const config = await getServerConfig();
          if (config && config.uri) {
            setServerConfig(config);
          }
        } catch (error) {
          logMessage(`[ServerStatus] Retry fetch error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          isInitializedRef.current = true;
        }
      };

      retryFetch();
    }
  }, [communicationMethods, getServerConfig]);

  // ServerConfig is now the source of truth, with serverUri and serverToken kept for backward compatibility

  // Set status message based on connection state
  useEffect(() => {
    if (hasBackgroundError) {
      setStatusMessage('Extension background services unavailable. Try reloading the page.');
    } else if (isReconnecting) {
      setStatusMessage('Attempting to reconnect to MCP server...');
    } else {
      switch (status) {
        case 'connected':
          setStatusMessage('MCP Server is connected and ready');
          break;
        case 'disconnected':
          setStatusMessage('MCP Server is unavailable. Some features will be limited.');
          break;
        case 'error':
          setStatusMessage('Error connecting to extension services. Try reloading the page.');
          break;
        default:
          setStatusMessage('Checking MCP Server status...');
      }
    }
  }, [status, isReconnecting, hasBackgroundError]);

  const handleReconnect = async () => {
    try {
      logMessage('[ServerStatus] Reconnect button clicked');
      setIsReconnecting(true);
      setStatusMessage('Attempting to reconnect to MCP server...');

      // Check if we can connect to the background script first
      if (hasBackgroundError) {
        logMessage('[ServerStatus] Attempting to recover background connection');
        // Wait a bit to see if background services become available
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check again if background services are available
        if (!communicationMethods.forceReconnect) {
          throw new Error('Background services still unavailable');
        }

        // If we got here, background services have been restored
        setHasBackgroundError(false);
      }

      logMessage('[ServerStatus] Calling forceReconnect method');
      const success = await forceReconnect();
      logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

      // Update last reconnect time
      const now = new Date();
      setLastReconnectTime(now.toLocaleTimeString());

      // Update local status based on reconnection result
      setStatus(success ? 'connected' : 'disconnected');

      // Set appropriate status message
      if (success) {
        setStatusMessage('Successfully reconnected to MCP server');
        logMessage('[ServerStatus] Reconnection successful, fetching fresh tool list');
        try {
          const tools = await refreshTools(true);
          logMessage(`[ServerStatus] Successfully fetched ${tools.length} tools after reconnection`);
        } catch (refreshError) {
          logMessage(
            `[ServerStatus] Error fetching tools after reconnection: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
        }
      } else {
        setStatusMessage('Failed to reconnect to MCP server. Some features will be limited.');
      }
    } catch (error) {
      logMessage(`[ServerStatus] Reconnection error: ${error instanceof Error ? error.message : String(error)}`);
      setStatusMessage('Error reconnecting to MCP server. Some features will be limited.');
      setStatus('error');
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDetails = () => {
    setShowDetails(!showDetails);
    logMessage(`[ServerStatus] Details ${showDetails ? 'hidden' : 'shown'}, status: ${status}`);
  };

  const handleSettings = () => {
    setShowSettings(!showSettings);
    logMessage(`[ServerStatus] Settings ${showSettings ? 'hidden' : 'shown'}`);
  };

  const handleServerConfigChange = (fieldName: keyof ServerConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setServerConfig(prev => ({
      ...prev,
      [fieldName]: fieldName === 'token' && value === '' ? undefined : value
    }));
  };

  const handleSaveServerConfig = async () => {
    try {
      // Create a config based on the active tab
      const configToSave = { ...serverConfig };
      
      // If MCP Router tab is active, override the URI with the fixed value
      if (activeConfigTab === 'mcp-router') {
        configToSave.uri = 'http://localhost:3282/mcp/sse';
      }
      
      logMessage(`[ServerStatus] Saving server config: ${configToSave.uri}${configToSave.token ? ' with token' : ''}`);

      // Handle case where background connection is unavailable
      if (hasBackgroundError) {
        throw new Error('Background services unavailable');
      }

      // Use the appropriate config based on active tab
      await updateServerConfig(configToSave);
      logMessage('[ServerStatus] Server config updated successfully');

      // Reconnect to apply new settings and refresh tools
      setIsReconnecting(true);
      setStatusMessage('Reconnecting to apply new server settings...');

      try {
        logMessage('[ServerStatus] Reconnecting to apply new server settings');
        const success = await forceReconnect();
        logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

        // Update last reconnect time
        const now = new Date();
        setLastReconnectTime(now.toLocaleTimeString());

        // Update local status based on reconnection result
        setStatus(success ? 'connected' : 'disconnected');

        // Set appropriate status message
        if (success) {
          setStatusMessage('Successfully connected to new MCP server');
          logMessage('[ServerStatus] Reconnection successful, waiting for server initialization');

          // Wait a moment to ensure the server is fully initialized
          await new Promise(resolve => setTimeout(resolve, 1000));

          logMessage('[ServerStatus] Explicitly refreshing tools after server change');
          try {
            // Force a refresh to ensure we get fresh tools from the new server
            const tools = await refreshTools(true);
            logMessage(`[ServerStatus] Successfully refreshed ${tools.length} tools after server change`);

            // Wait a moment to ensure the UI has updated
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (refreshError) {
            logMessage(
              `[ServerStatus] Error refreshing tools after server change: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
            );

            // Try one more time with a longer delay
            logMessage('[ServerStatus] Retrying tool refresh after delay');
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
              const tools = await refreshTools(true);
              logMessage(`[ServerStatus] Second refresh attempt succeeded with ${tools.length} tools`);
            } catch (secondRefreshError) {
              logMessage(
                `[ServerStatus] Second refresh attempt failed: ${secondRefreshError instanceof Error ? secondRefreshError.message : String(secondRefreshError)}`,
              );
            }
          }
        } else {
          setStatusMessage('Failed to connect to new MCP server. Some features will be limited.');
        }
      } catch (reconnectError) {
        logMessage(
          `[ServerStatus] Reconnection error: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
        );
        setStatusMessage('Error connecting to new MCP server. Some features will be limited.');
        setStatus('error');
      } finally {
        setIsReconnecting(false);
      }

      // Close settings panel
      setShowSettings(false);
    } catch (error) {
      logMessage(
        `[ServerStatus] Error saving server config: ${error instanceof Error ? error.message : String(error)}`,
      );
      setStatusMessage('Error updating server configuration');
      // Don't close settings panel on error to allow the user to try again
    }
  };

  // Determine status color and icon
  const getStatusInfo = () => {
    // Define base colors, assuming dark mode variants are handled by Tailwind prefixes
    const baseColors = {
      emerald: { text: 'text-emerald-500', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-900/20' },
      amber: { text: 'text-amber-500', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-900/20' },
      rose: { text: 'text-rose-500', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-900/20' },
      slate: { text: 'text-slate-500', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-900/20' },
    };

    // Determine status display
    const displayStatus = isReconnecting ? 'reconnecting' : status;

    switch (displayStatus) {
      case 'connected':
        return {
          color: baseColors.emerald.text,
          bgColor: cn(baseColors.emerald.bg, baseColors.emerald.darkBg),
          icon: <Icon name="check" className={baseColors.emerald.text} />,
          label: 'Connected',
        };
      case 'reconnecting':
        return {
          color: baseColors.amber.text,
          bgColor: cn(baseColors.amber.bg, baseColors.amber.darkBg),
          icon: <Icon name="refresh" className={cn(baseColors.amber.text, 'animate-spin')} />,
          label: 'Reconnecting',
        };
      case 'disconnected':
        return {
          color: baseColors.rose.text,
          bgColor: cn(baseColors.rose.bg, baseColors.rose.darkBg),
          icon: <Icon name="x" className={baseColors.rose.text} />,
          label: 'Disconnected',
        };
      case 'error':
        return {
          color: baseColors.rose.text,
          bgColor: cn(baseColors.rose.bg, baseColors.rose.darkBg),
          icon: <Icon name="info" className={baseColors.rose.text} />,
          label: 'Error',
        };
      default: // Unknown status
        return {
          color: baseColors.slate.text,
          bgColor: cn(baseColors.slate.bg, baseColors.slate.darkBg),
          icon: <Icon name="info" className={baseColors.slate.text} />,
          label: 'Unknown',
        };
    }
  };

  // Get status info based on current state
  const statusInfo = getStatusInfo();

  // Determine if we should show enhanced visual cues for disconnected/error states
  const isDisconnectedOrError = status === 'disconnected' || status === 'error';
  
  return (
    <div className={cn(
      "px-4 py-3 border-b border-slate-200 dark:border-slate-800",
      // Add conditional styling for disconnected/error states
      isDisconnectedOrError && "bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-sm"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full', 
            statusInfo.bgColor,
            // Add animation for disconnected/error states
            isDisconnectedOrError && 'animate-pulse'
          )}>
            {statusInfo.icon}
          </div>
          <Typography 
            variant="body" 
            className={cn(
              "font-medium",
              // Change text color for disconnected/error states
              isDisconnectedOrError 
                ? "text-rose-600 dark:text-rose-400" 
                : "text-slate-700 dark:text-slate-200"
            )}>
            Server {statusInfo.label}
          </Typography>
        </div>
        <div className="flex items-center gap-2">
          {/* Enhanced reconnect button for disconnected states */}
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={cn(
              "p-1 rounded transition-colors",
              isReconnecting ? "opacity-50 cursor-not-allowed" : "",
              // Change button color for disconnected/error states
              isDisconnectedOrError 
                ? "text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/30" 
                : "text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/30",
              // Add animation for disconnected/error states when not reconnecting
              isDisconnectedOrError && !isReconnecting && "animate-pulse"
            )}
            aria-label="Reconnect to server"
            title="Reconnect to server">
            <Icon name="refresh" size="sm" className={isReconnecting ? 'animate-spin' : ''} />
          </button>
          {/* Settings and Details buttons already have dark mode styles */}
          <button
            onClick={handleSettings}
            className="p-1 text-slate-500 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Server settings"
            title="Server settings">
            <Icon name="settings" size="sm" />
          </button>
          <button
            onClick={handleDetails}
            className="p-1 text-slate-500 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Show details"
            title="Show details">
            <Icon name="info" size="sm" />
          </button>
        </div>
      </div>

      {/* Enhanced status message with better visibility for disconnected states */}
      <div className={cn(
        "mt-1 mb-1 text-xs",
        isDisconnectedOrError 
          ? "text-rose-600 dark:text-rose-400 font-medium" 
          : "text-slate-600 dark:text-slate-400"
      )}>
        {statusMessage}
      </div>
      
      {/* Add prominent alert for disconnected/error states */}
      {isDisconnectedOrError && (
        <div className="mt-2 p-2 bg-rose-100 dark:bg-rose-900/20 rounded-md border border-rose-200 dark:border-rose-800/50">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400" />
            <Typography variant="small" className="text-rose-600 dark:text-rose-400 font-medium">
              {status === 'disconnected' 
                ? "Server connection lost. Click the refresh button to reconnect." 
                : "Server connection error. Check your configuration and try again."}
            </Typography>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <Card className="mt-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
            <Typography variant="h4" className="mb-2 text-slate-800 dark:text-slate-100">
              Server Configuration
            </Typography>
            
            {/* Tab Navigation */}
            <div className="border-b border-slate-200 dark:border-slate-700 mb-2">
              <div className="flex">
                <button
                  className={cn(
                    'py-2 px-4 font-medium text-sm transition-all duration-200',
                    activeConfigTab === 'default'
                      ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-lg',
                  )}
                  onClick={() => setActiveConfigTab('default')}>
                  Default
                </button>
                <button
                  className={cn(
                    'py-2 px-4 font-medium text-sm transition-all duration-200',
                    activeConfigTab === 'mcp-router'
                      ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-lg',
                  )}
                  onClick={() => setActiveConfigTab('mcp-router')}>
                  MCP Router
                </button>
              </div>
            </div>
            
            {/* Default Tab Content */}
            {activeConfigTab === 'default' && (
              <>
                <div className="mb-3">
                  <label htmlFor="default-server-uri" className="block mb-1 text-slate-600 dark:text-slate-400">
                    Server URI
                  </label>
                  <input
                    id="default-server-uri"
                    type="text"
                    value={serverConfig.uri}
                    onChange={handleServerConfigChange('uri')}
                    placeholder="Enter server URI"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 outline-none"
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="default-server-token" className="block mb-1 text-slate-600 dark:text-slate-400">
                    Bearer Token (optional)
                  </label>
                  <input
                    id="default-server-token"
                    type="password"
                    value={serverConfig.token || ''}
                    onChange={handleServerConfigChange('token')}
                    placeholder="Enter authentication token"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 outline-none"
                  />
                </div>
              </>
            )}
            
            {/* MCP Router Tab Content */}
            {activeConfigTab === 'mcp-router' && (
              <>
                <div className="mb-3">
                  <a href="https://github.com/mcp-router/mcp-router" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs flex items-center" target="_blank" rel="noopener noreferrer">
                    <Icon name="info" size="xs" className="mr-1" />
                    What is MCP Router?
                  </a>
                </div>
                <div className="mb-3">
                  <label htmlFor="server-token" className="block mb-1 text-slate-600 dark:text-slate-400">
                    MCPR_TOKEN
                  </label>
                  <input
                    id="server-token"
                    type="password"
                    value={serverConfig.token || ''}
                    onChange={handleServerConfigChange('token')}
                    placeholder="Enter authentication token"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 outline-none"
                  />
                </div>
              </>
            )}
            
            {/* Save Button Area - Shown for both tabs */}
            <div className="flex justify-end mt-3">
              {/* Assuming Button component handles dark mode variants */}
              <Button onClick={() => setShowSettings(false)} variant="outline" size="sm" className="h-7 mr-2 text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSaveServerConfig}
                variant="default"
                size="sm"
                className="h-7 text-xs"
                disabled={hasBackgroundError || isReconnecting}>
                Save & Reconnect
              </Button>
            </div>

            {hasBackgroundError && (
              <div className="mt-3 p-2 bg-rose-50 dark:bg-rose-900/20 rounded text-rose-800 dark:text-rose-200">
                <p>Extension background services unavailable. Try reloading the page.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Details panel */}
      {showDetails && (
        <Card className="mt-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
            {/* Paragraphs already have dark mode styles */}
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Status:</span> {statusInfo.label}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Server URI:</span>{' '}
              {serverConfig.uri || 'Not configured'}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Bearer Token:</span>{' '}
              {serverConfig.token ? '••••••••' : 'Not configured'}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Last updated:</span>{' '}
              {new Date().toLocaleTimeString()}
            </p>
            {lastReconnectTime && (
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-700 dark:text-slate-200">Last reconnect attempt:</span>{' '}
                {lastReconnectTime}
              </p>
            )}
            {status === 'disconnected' && (
              <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-amber-800 dark:text-amber-200">
                <p className="font-medium">Troubleshooting tips:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>Check if the MCP server is running at the configured URI</li>
                  <li>Verify network connectivity to the server</li>
                  <li>Restart the MCP server if needed</li>
                  <li>Use the Reconnect button to try again</li>
                </ul>
              </div>
            )}
            {hasBackgroundError && (
              <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-900/20 rounded text-rose-800 dark:text-rose-200">
                <p className="font-medium">Extension Communication Issue:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>Try reloading the current page</li>
                  <li>If the issue persists, restart your browser</li>
                  <li>You may need to reinstall the extension if problems continue</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ServerStatus;
