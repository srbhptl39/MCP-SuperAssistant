import type { ConnectionType } from '../../../types/stores';
import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useMcpCommunication } from '@src/hooks/useMcpCommunication';
import { useConnectionStatus, useServerConfig } from '../../../hooks';
import { logMessage } from '@src/utils/helpers';
import { eventBus } from '@src/events/event-bus';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';

interface ServerStatusProps {
  status: string;
}

const ServerStatus: React.FC<ServerStatusProps> = ({ status: initialStatus }) => {
  // Use Zustand hooks for connection status and server config
  const {
    status: connectionStatus,
    isConnected,
    isReconnecting: storeIsReconnecting,
    error: connectionError
  } = useConnectionStatus();

  const { config: serverConfig, setConfig: setServerConfig } = useServerConfig();

  // Local UI state
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastReconnectTime, setLastReconnectTime] = useState<string>('');
  const [serverUri, setServerUri] = useState<string>(serverConfig.uri || '');
  const [connectionType, setConnectionType] = useState<ConnectionType>(serverConfig.connectionType || 'sse');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [hasBackgroundError, setHasBackgroundError] = useState<boolean>(false);
  const [isEditingUri, setIsEditingUri] = useState<boolean>(false);
  const [isEditingConnectionType, setIsEditingConnectionType] = useState<boolean>(false);
  const [lastErrorMessage, setLastErrorMessage] = useState<string>('');
  const [configFetched, setConfigFetched] = useState<boolean>(false);

  // Animation states
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [settingsAnimating, setSettingsAnimating] = useState(false);
  const [detailsAnimating, setDetailsAnimating] = useState(false);

  // Get communication methods with error handling (still needed for some operations)
  const communicationMethods = useMcpCommunication();

  // Use connection status from store, fallback to prop
  const status = connectionStatus || initialStatus || 'unknown';

  // Debug logging to track status changes
  useEffect(() => {
    console.debug(`[ServerStatus] Status update - connectionStatus: ${connectionStatus}, initialStatus: ${initialStatus}, final: ${status}, isConnected: ${isConnected}`);
  }, [connectionStatus, initialStatus, status, isConnected]);

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

  // Get the last connection error from the background communication hook
  const backgroundConnectionError = communicationMethods.lastConnectionError || '';

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

  const getServerConfig = useCallback(
    async () => {
      try {
        if (!communicationMethods.getServerConfig) {
          throw new Error('Communication method unavailable');
        }
        return await communicationMethods.getServerConfig();
      } catch (error) {
        logMessage(`[ServerStatus] Get server config error: ${error instanceof Error ? error.message : String(error)}`);
        setHasBackgroundError(true);
        throw error; // Don't fallback to default, let caller handle the error
      }
    },
    [communicationMethods],
  );

  const updateServerConfig = useCallback(
    async (config: { uri: string; connectionType: ConnectionType }) => {
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

  // Update server URI and connection type when config changes
  useEffect(() => {
    if (serverConfig.uri && !isEditingUri) {
      setServerUri(serverConfig.uri);
      logMessage(`[ServerStatus] Updated server URI from config: ${serverConfig.uri}`);
    }
    // Only update connection type from store if user is not actively editing it
    if (serverConfig.connectionType && !isEditingConnectionType) {
      setConnectionType(serverConfig.connectionType);
      logMessage(`[ServerStatus] Updated connection type from config: ${serverConfig.connectionType}`);
    }
  }, [serverConfig.uri, serverConfig.connectionType, isEditingUri, isEditingConnectionType]);

  // Force immediate connection status check on mount
  useEffect(() => {
    const checkImmediateStatus = async () => {
      if (communicationMethods.forceConnectionStatusCheck) {
        try {
          logMessage('[ServerStatus] Forcing immediate connection status check on mount');
          await communicationMethods.forceConnectionStatusCheck();
        } catch (error) {
          logMessage(`[ServerStatus] Immediate status check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    // Small delay to ensure everything is initialized
    const timeoutId = setTimeout(checkImmediateStatus, 100);
    return () => clearTimeout(timeoutId);
  }, []); // Run only once on mount

  // Update status message based on connection state from store
  useEffect(() => {
    // During reconnection, don't override the status message
    if (isReconnecting || storeIsReconnecting) {
      return;
    }

    if (hasBackgroundError) {
      setStatusMessage('Extension background services unavailable. Try reloading the page.');
    } else {
      switch (status) {
        case 'connected':
          setStatusMessage('MCP Server is connected and ready');
          // Brief success indication for new connections
          if (!isConnected) {
            setShowSuccessAnimation(true);
            setTimeout(() => setShowSuccessAnimation(false), 1000);
          }
          break;
        case 'disconnected':
          setStatusMessage('MCP Server is unavailable. Some features will be limited.');
          break;
        case 'error':
          setStatusMessage(connectionError || 'Error connecting to extension services. Try reloading the page.');
          break;
        default:
          setStatusMessage('Checking MCP Server status...');
      }
    }
  }, [status, connectionError, hasBackgroundError, isReconnecting, storeIsReconnecting, isConnected]);

  // Enhanced event bus integration for real-time status updates
  useEffect(() => {
    const unsubscribeCallbacks: (() => void)[] = [];

    // Listen for connection status changes from the event bus
    const unsubscribeConnection = eventBus.on('connection:status-changed', (data) => {
      logMessage(`[ServerStatus] Connection status event: ${data.status}${data.error ? ` (${data.error})` : ''}`);

      // Update local error state if there's an error
      if (data.error) {
        setLastErrorMessage(data.error);
      } else {
        setLastErrorMessage('');
      }

      // Update last reconnect time for successful connections
      if (data.status === 'connected') {
        setLastReconnectTime(new Date().toLocaleTimeString());
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 1000);
      }
    });
    unsubscribeCallbacks.push(unsubscribeConnection);

    // Listen for context bridge events
    const unsubscribeBridgeInvalidated = eventBus.on('context:bridge-invalidated', (data) => {
      logMessage(`[ServerStatus] Context bridge invalidated: ${data.error}`);
      setHasBackgroundError(true);
      setStatusMessage(`Extension context invalidated: ${data.error}`);
    });
    unsubscribeCallbacks.push(unsubscribeBridgeInvalidated);

    const unsubscribeBridgeRestored = eventBus.on('context:bridge-restored', () => {
      logMessage('[ServerStatus] Context bridge restored');
      setHasBackgroundError(false);
      // Don't automatically reconnect here - let user decide
    });
    unsubscribeCallbacks.push(unsubscribeBridgeRestored);

    // Listen for heartbeat events to monitor connection health
    const unsubscribeHeartbeat = eventBus.on('connection:heartbeat', (data) => {
      // Update connection health indicator if needed
      logMessage(`[ServerStatus] Heartbeat received: ${data.timestamp}`);
    });
    unsubscribeCallbacks.push(unsubscribeHeartbeat);

    // Cleanup all event listeners
    return () => {
      unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    };
  }, []);

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
    // Only fetch server configuration on initial mount - don't refetch while user is editing
    const fetchInitialServerConfig = async () => {
      try {
        logMessage('[ServerStatus] Fetching initial server configuration from background storage');
        const config = await getServerConfig();
        if (config) {
          if (config.uri) {
            setServerUri(config.uri);
            logMessage(`[ServerStatus] Initial server URI loaded: ${config.uri}`);
          }
          if (config.connectionType) {
            setConnectionType(config.connectionType);
            logMessage(`[ServerStatus] Initial connection type loaded: ${config.connectionType}`);
          }
          setConfigFetched(true);
        } else {
          logMessage('[ServerStatus] No valid server configuration received from background storage');
          setServerUri(''); // Set empty string to indicate no config loaded
          setConfigFetched(true);
        }
      } catch (error) {
        logMessage(
          `[ServerStatus] Error fetching server config: ${error instanceof Error ? error.message : String(error)}`,
        );
        setServerUri(''); // Set empty string to indicate fetch failed
        setConfigFetched(true);
      }
    };

    // Fetch initial server configuration on mount only once
    if (
      communicationMethods &&
      typeof communicationMethods.getServerConfig === 'function' &&
      !configFetched &&
      !isEditingUri &&
      !isEditingConnectionType
    ) {
      fetchInitialServerConfig().catch(() => {
        logMessage('[ServerStatus] Failed to fetch server configuration');
        setServerUri(''); // Set empty string as last resort
      });
    }
  }, [communicationMethods, isEditingUri, isEditingConnectionType, configFetched, getServerConfig]); // Add configFetched dependency

  // Set status message based on connection state
  useEffect(() => {
    // During reconnection, don't override the status message set by handleSaveServerConfig
    if (isReconnecting) {
      return;
    }

    if (hasBackgroundError) {
      setStatusMessage('Extension background services unavailable. Try reloading the page.');
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
  }, [status, hasBackgroundError, isReconnecting]);

  const handleReconnect = async () => {
    const startTime = Date.now();
    const minDisplayDuration = 1200; // Minimum display time for smooth UX

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

      // Ensure minimum display duration before updating final state
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        logMessage(`[ServerStatus] Waiting ${remainingTime}ms for smooth transition`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      // Set appropriate status message based on reconnection result
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
      // Ensure minimum display time even for errors
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      logMessage(`[ServerStatus] Reconnection error: ${error instanceof Error ? error.message : String(error)}`);

      // Use the enhanced error message from the error object and store it
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastErrorMessage(errorMessage); // Store the detailed error message

      // Display the enhanced error message in the status
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        setStatusMessage(
          'Server URL not found (404). Please verify your MCP server URL and ensure the server is running.',
        );
      } else if (errorMessage.includes('403')) {
        setStatusMessage('Access forbidden (403). Please check server permissions and authentication settings.');
      } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        setStatusMessage('Server error detected. The MCP server may be experiencing issues.');
      } else if (errorMessage.includes('Connection refused') || errorMessage.includes('ECONNREFUSED')) {
        setStatusMessage('Connection refused. Please verify the MCP server is running at the configured URL.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        setStatusMessage('Connection timeout. The server may be slow to respond or unreachable.');
      } else if (errorMessage.includes('ENOTFOUND')) {
        setStatusMessage('Server not found. Please check the server URL and your network connection.');
      } else {
        setStatusMessage(`Connection failed: ${errorMessage}`);
      }
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDetails = () => {
    setDetailsAnimating(true);
    setTimeout(() => {
      setShowDetails(!showDetails);
      setDetailsAnimating(false);
    }, 150);
    logMessage(`[ServerStatus] Details ${showDetails ? 'hidden' : 'shown'}, status: ${status}`);
  };

  const handleSettings = () => {
    setSettingsAnimating(true);
    setTimeout(() => {
      setShowSettings(!showSettings);
      setSettingsAnimating(false);
    }, 150);
    logMessage(`[ServerStatus] Settings ${showSettings ? 'hidden' : 'shown'}`);
  };

  const handleServerUriChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerUri(e.target.value);
    setIsEditingUri(true); // Mark as editing when user types
  };

  const handleServerUriFocus = () => {
    setIsEditingUri(true); // Mark as editing when user focuses the input
  };

  const handleServerUriBlur = () => {
    // Don't immediately clear editing flag - wait for save or cancel
  };

  const handleConnectionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConnectionType(e.target.value as ConnectionType);
    setIsEditingConnectionType(true); // Mark as editing when user changes
  };

  const handleConnectionTypeFocus = () => {
    setIsEditingConnectionType(true); // Mark as editing when user focuses the select
  };

  const handleConnectionTypeBlur = () => {
    // Don't immediately clear editing flag - wait for save or cancel
  };

  const handleSaveServerConfig = async () => {
    if (!communicationMethods.updateServerConfig || hasBackgroundError) {
      logMessage('[ServerStatus] Background communication not available');
      return;
    }

    // Set stable loading state and prevent rapid UI changes
    setIsReconnecting(true);
    setLastReconnectTime(new Date().toLocaleTimeString());

    // Use a single stable message throughout the process to prevent flickers
    const stableMessage = 'Saving configuration and connecting...';
    setStatusMessage(stableMessage);

    // Clear any existing error
    setLastErrorMessage('');

    // Track the start time to ensure minimum display duration
    const startTime = Date.now();
    const minDisplayDuration = 1500; // Minimum 1.5 seconds to prevent jitter

    try {
      logMessage(`[ServerStatus] Saving server URI: ${serverUri} with connection type: ${connectionType}`);

      // Update server config using Zustand store
      setServerConfig({ uri: serverUri, connectionType });

      // Also update via background communication for backward compatibility
      await updateServerConfig({ uri: serverUri, connectionType });
      logMessage('[ServerStatus] Server config updated successfully');

      // Clear the editing flags since we successfully saved
      setIsEditingUri(false);
      setIsEditingConnectionType(false);

      // Trigger reconnect
      const success = await forceReconnect();
      logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

      // Calculate remaining time to ensure minimum display duration
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        logMessage(`[ServerStatus] Waiting ${remainingTime}ms to prevent visual jitter`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      // Single final UI update to prevent flickers
      if (success) {
        setStatusMessage('Successfully connected to MCP server');

        // Refresh tools silently without UI updates
        try {
          const tools = await refreshTools(true);
          logMessage(`[ServerStatus] Successfully refreshed ${tools.length} tools after server change`);
        } catch (refreshError) {
          logMessage(
            `[ServerStatus] Error refreshing tools: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
        }
      } else {
        setStatusMessage('Failed to connect to new MCP server');
      }

      // Close settings on success
      setShowSettings(false);
    } catch (error) {
      // Still ensure minimum display time even for errors
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayDuration - elapsed);

      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastErrorMessage(errorMessage);
      setStatusMessage(`Configuration failed: ${errorMessage}`);
      logMessage(`[ServerStatus] Save config error: ${errorMessage}`);
      // Keep settings open on error
    } finally {
      // Always reset reconnecting state
      setIsReconnecting(false);
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
    <div
      className={cn(
        'relative px-4 py-3 border-b border-slate-200 dark:border-slate-800 transition-all duration-300 ease-out server-status-stable',
        // Add conditional styling for disconnected/error states with smooth transitions
        isDisconnectedOrError &&
          'bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/10 dark:to-red-900/10 border border-rose-200 dark:border-rose-800/50 rounded-sm shadow-sm',
      )}>
      {/* Success animation overlay - subtle */}
      {showSuccessAnimation && (
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-100 to-green-100 dark:from-emerald-900/20 dark:to-green-900/20 opacity-30 animate-pulse rounded-sm" />
      )}

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ease-out server-status-icon',
              statusInfo.bgColor,
              // Simplified animations to prevent flickers
              isReconnecting ? 'animate-spin' : isDisconnectedOrError && 'animate-pulse',
            )}>
            <div className="transition-transform duration-200">{statusInfo.icon}</div>
          </div>

          <div className="flex flex-col">
            <Typography
              variant="body"
              className={cn(
                'font-semibold transition-colors duration-200 leading-tight',
                // Enhanced text styling with smooth color transitions
                isDisconnectedOrError
                  ? 'text-rose-700 dark:text-rose-400'
                  : status === 'connected'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-200',
              )}>
              Server {statusInfo.label}
            </Typography>

            {/* Status message with stable height to prevent layout shifts */}
            <div
              className={cn(
                'text-xs mt-0.5 transition-all duration-200 ease-out max-h-20 overflow-hidden status-message-stable',
                isDisconnectedOrError
                  ? 'text-rose-600 dark:text-rose-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400',
              )}>
              {statusMessage}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Simplified reconnect button */}
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={cn(
              'group relative p-2 rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95',
              isReconnecting ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md',
              // Dynamic button styling based on state
              isDisconnectedOrError
                ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/30'
                : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/30',
            )}
            aria-label="Reconnect to server"
            title="Reconnect to server">
            <Icon
              name="refresh"
              size="sm"
              className={cn(
                'transition-transform duration-300',
                isReconnecting ? 'animate-spin' : 'group-hover:rotate-180',
              )}
            />
          </button>

          {/* Simplified settings button */}
          <button
            onClick={handleSettings}
            disabled={settingsAnimating}
            className={cn(
              'group relative p-2 rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95',
              'text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-md dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800',
            )}
            aria-label="Server settings"
            title="Server settings">
            <Icon
              name="settings"
              size="sm"
              className={cn('transition-transform duration-200', showSettings ? 'rotate-90' : 'group-hover:rotate-45')}
            />
          </button>

          {/* Simplified details button */}
          <button
            onClick={handleDetails}
            disabled={detailsAnimating}
            className={cn(
              'group relative p-2 rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95',
              'text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:shadow-md dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800',
            )}
            aria-label="Show details"
            title="Show details">
            <Icon name="info" size="sm" className="transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>
      </div>

      {/* Add prominent alert for disconnected/error states with detailed error message */}
      {isDisconnectedOrError && (
        <div className="mt-2 p-2 bg-rose-100 dark:bg-rose-900/20 rounded-md border border-rose-200 dark:border-rose-800/50">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400" />
            <div className="flex-1">
              <Typography variant="small" className="text-rose-600 dark:text-rose-400 font-medium">
                {status === 'disconnected'
                  ? 'Server connection lost. Click the refresh button to reconnect.'
                  : 'Server connection error. Check your configuration and try again.'}
              </Typography>
              {/* Show detailed error message if available - prefer background error over local error */}
              {(backgroundConnectionError || lastErrorMessage) && (
                <Typography variant="small" className="text-rose-500 dark:text-rose-300 mt-1 text-xs">
                  Details: {backgroundConnectionError || lastErrorMessage}
                </Typography>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Add connecting status indicator for background communication issues */}
      {(hasBackgroundError || !communicationMethods.sendMessage) && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200/50 dark:border-amber-800/30 p-2 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="animate-spin w-3 h-3 border border-amber-500 border-t-transparent rounded-full"></div>
            <Typography variant="caption" className="text-amber-700 dark:text-amber-300 text-xs">
              Connecting to extension services...
            </Typography>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
          <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
            <CardContent className="p-4 text-xs text-slate-700 dark:text-slate-300">
              <Typography variant="h4" className="mb-3 text-slate-800 dark:text-slate-100 font-semibold">
                Server Configuration
              </Typography>
              
              <div className="mb-4">
                <label htmlFor="connection-type" className="block mb-2 text-slate-600 dark:text-slate-400 font-medium">
                  Connection Type
                </label>
                <select
                  id="connection-type"
                  value={connectionType}
                  onChange={handleConnectionTypeChange}
                  onFocus={handleConnectionTypeFocus}
                  onBlur={handleConnectionTypeBlur}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent outline-none transition-all duration-200 hover:border-slate-400 dark:hover:border-slate-500"
                >
                  <option value="sse">Server-Sent Events (SSE)</option>
                  <option value="websocket">WebSocket</option>
                  <option value="streamable-http">Streamable HTTP</option>
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {connectionType === 'sse' 
                    ? 'HTTP-based streaming connection (traditional)' 
                    : connectionType === 'websocket'
                      ? 'Full-duplex WebSocket connection (faster, more features)'
                      : 'Advanced HTTP streaming (modern MCP protocol)'}
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="server-uri" className="block mb-2 text-slate-600 dark:text-slate-400 font-medium">
                  Server URI
                </label>
                <input
                  id="server-uri"
                  type="text"
                  value={serverUri}
                  onChange={handleServerUriChange}
                  onFocus={handleServerUriFocus}
                  onBlur={handleServerUriBlur}
                  placeholder={connectionType === 'sse' 
                    ? "http://localhost:3006/sse" 
                    : connectionType === 'websocket'
                      ? "ws://localhost:3006/message"
                      : "http://localhost:3006/mcp"}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent outline-none transition-all duration-200 hover:border-slate-400 dark:hover:border-slate-500"
                />
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="mb-2">
                    <strong>To start MCP SuperAssistant Proxy:</strong>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded font-mono text-xs border">
                    npx @srbhptl39/mcp-superassistant-proxy@latest --config ./config.json --outputTransport {connectionType === 'sse' ? 'sse' : connectionType === 'websocket' ? 'ws' : 'streamableHttp'}
                  </div>
                  <div className="mt-2 text-xs">
                    <div className="mb-1">
                      Available transports: <code>streamableHttp</code>, <code>sse</code>, <code>ws</code>
                    </div>
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                      <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">📡 Public Endpoints Supported:</div>
                      <div className="text-blue-700 dark:text-blue-300 space-y-1">
                        <div>• <strong>Zapier:</strong> Public MCP endpoints with CORS enabled</div>
                        <div>• <strong>Composio:</strong> SSE and Streamable HTTP endpoints</div>
                        <div>• <strong>Custom servers:</strong> Any MCP server with CORS headers</div>
                      </div>
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        <strong>Note:</strong> WebSocket connections require local servers or proxy due to browser security restrictions.
                      </div>
                    </div>
                    {/* <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <div className="font-medium text-green-800 dark:text-green-200 mb-2">🌍 Example Public Endpoints:</div>
                      <div className="text-green-700 dark:text-green-300 space-y-1 text-xs">
                        <div><strong>SSE:</strong></div>
                        <div className="ml-2">• <code>https://api.zapier.com/v1/mcp/sse</code></div>
                        <div className="ml-2">• <code>https://composio.dev/api/mcp/sse</code></div>
                        <div className="mt-2"><strong>Streamable HTTP:</strong></div>
                        <div className="ml-2">• <code>https://api.zapier.com/v1/mcp</code></div>
                        <div className="ml-2">• <code>https://composio.dev/api/mcp</code></div>
                        <div className="ml-2">• <code>https://your-server.com/mcp</code></div>
                      </div>
                    </div> */}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setShowSettings(false);
                    setIsEditingUri(false);
                    setIsEditingConnectionType(false);
                    // Reset to stored config when canceling
                    if (serverConfig.uri) {
                      setServerUri(serverConfig.uri);
                    }
                    if (serverConfig.connectionType) {
                      setConnectionType(serverConfig.connectionType);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveServerConfig}
                  variant="default"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white dark:text-white save-button-stable"
                  disabled={hasBackgroundError || isReconnecting}>
                  {isReconnecting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </div>
                  ) : (
                    'Save & Reconnect'
                  )}
                </Button>
              </div>

              {hasBackgroundError && (
                <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                  <div className="flex items-center gap-2">
                    <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400" />
                    <p className="font-medium">Extension background services unavailable. Try reloading the page.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Details panel */}
      {showDetails && (
        <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
          <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
            <CardContent className="p-4 text-xs text-slate-700 dark:text-slate-300">
              <Typography variant="h4" className="mb-3 text-slate-800 dark:text-slate-100 font-semibold">
                Connection Details
              </Typography>

              <div className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Status:</span>
                  <span
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      status === 'connected'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : status === 'disconnected'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-900/20 dark:text-slate-400',
                    )}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="flex justify-between items-start py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Server URI:</span>
                  <span className="text-right text-slate-600 dark:text-slate-300 max-w-[200px] break-all">
                    {serverUri || 'Not configured'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Connection Type:</span>
                  <span className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    connectionType === 'websocket' 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      : connectionType === 'streamable-http'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
                  )}>
                    {connectionType === 'websocket' ? 'WebSocket' : connectionType === 'streamable-http' ? 'Streamable HTTP' : 'SSE'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Last updated:</span>
                  <span className="text-slate-600 dark:text-slate-300">{new Date().toLocaleTimeString()}</span>
                </div>

                {lastReconnectTime && (
                  <div className="flex justify-between items-center py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Last reconnect:</span>
                    <span className="text-slate-600 dark:text-slate-300">{lastReconnectTime}</span>
                  </div>
                )}
              </div>

              {status === 'disconnected' && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <Icon name="info" size="sm" className="text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-medium mb-2">Troubleshooting tips:</p>
                      <ul className="list-disc ml-4 space-y-1 text-xs">
                        <li>Check if the MCP server is running at the configured URI</li>
                        <li>Verify network connectivity to the server</li>
                        <li>Restart the MCP server if needed</li>
                        <li>Use the Reconnect button to try again</li>
                      </ul>
                      {/* Show detailed error in troubleshooting section - prefer background error */}
                      {(backgroundConnectionError || lastErrorMessage) && (
                        <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-800/50 rounded border border-amber-200 dark:border-amber-700">
                          <p className="font-medium text-xs mb-1">Last Error:</p>
                          <p className="text-xs break-words">{backgroundConnectionError || lastErrorMessage}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {hasBackgroundError && (
                <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" size="sm" className="text-rose-600 dark:text-rose-400 mt-0.5" />
                    <div>
                      <p className="font-medium mb-2">Extension Communication Issue:</p>
                      <ul className="list-disc ml-4 space-y-1 text-xs">
                        <li>Try reloading the current page</li>
                        <li>If the issue persists, restart your browser</li>
                        <li>You may need to reinstall the extension if problems continue</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ServerStatus;
