import type React from 'react';
import { useState, useEffect } from 'react';
import { useBackgroundCommunication } from '../hooks/backgroundCommunication';
import { logMessage } from '@src/utils/helpers';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';

interface ServerStatusProps {
  status: string;
}

const ServerStatus: React.FC<ServerStatusProps> = ({ status }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastReconnectTime, setLastReconnectTime] = useState<string>('');
  const [serverUri, setServerUri] = useState<string>('');
  const { forceReconnect, refreshTools, getServerConfig, updateServerConfig } = useBackgroundCommunication();

  useEffect(() => {
    // Fetch current server configuration when component mounts
    const fetchServerConfig = async () => {
      try {
        const config = await getServerConfig();
        if (config && config.uri) {
          setServerUri(config.uri);
        }
      } catch (error) {
        logMessage(
          `[ServerStatus] Error fetching server config: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    fetchServerConfig();
  }, [getServerConfig]);

  const handleReconnect = async () => {
    logMessage('[ServerStatus] Reconnect button clicked');
    setIsReconnecting(true);

    try {
      logMessage('[ServerStatus] Calling forceReconnect method');
      const success = await forceReconnect();
      logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

      // Update last reconnect time
      const now = new Date();
      setLastReconnectTime(now.toLocaleTimeString());

      // If reconnection was successful, fetch fresh tool list
      if (success) {
        logMessage('[ServerStatus] Reconnection successful, fetching fresh tool list');
        try {
          const tools = await refreshTools(true);
          logMessage(`[ServerStatus] Successfully fetched ${tools.length} tools after reconnection`);
        } catch (refreshError) {
          logMessage(
            `[ServerStatus] Error fetching tools after reconnection: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
          );
        }
      }
    } catch (error) {
      logMessage(`[ServerStatus] Reconnection error: ${error instanceof Error ? error.message : String(error)}`);
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

  const handleServerUriChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerUri(e.target.value);
  };

  const handleSaveServerConfig = async () => {
    try {
      logMessage(`[ServerStatus] Saving server URI: ${serverUri}`);
      await updateServerConfig({ uri: serverUri });
      logMessage('[ServerStatus] Server config updated successfully');

      // Reconnect to apply new settings and refresh tools
      setIsReconnecting(true);

      try {
        logMessage('[ServerStatus] Reconnecting to apply new server settings');
        const success = await forceReconnect();
        logMessage(`[ServerStatus] Reconnection ${success ? 'succeeded' : 'failed'}`);

        // Update last reconnect time
        const now = new Date();
        setLastReconnectTime(now.toLocaleTimeString());

        // If reconnection was successful, explicitly refresh tools with a delay
        // to ensure the server has fully initialized
        if (success) {
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
        }
      } catch (reconnectError) {
        logMessage(
          `[ServerStatus] Reconnection error: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
        );
      } finally {
        setIsReconnecting(false);
      }

      // Close settings panel
      setShowSettings(false);
    } catch (error) {
      logMessage(
        `[ServerStatus] Error saving server config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Determine status color and icon
  const getStatusInfo = () => {
    // Define base colors, assuming dark mode variants are handled by Tailwind prefixes
    const baseColors = {
      emerald: { text: 'text-emerald-500', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-900/20' },
      amber: { text: 'text-amber-500', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-900/20' },
      rose: { text: 'text-rose-500', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-900/20' },
    };

    switch (status) {
      case 'connected':
        return {
          color: baseColors.emerald.text,
          bgColor: cn(baseColors.emerald.bg, baseColors.emerald.darkBg),
          icon: <Icon name="check" className={baseColors.emerald.text} />,
        };
      case 'reconnecting':
        return {
          color: baseColors.amber.text,
          bgColor: cn(baseColors.amber.bg, baseColors.amber.darkBg),
          icon: <Icon name="refresh" className={cn(baseColors.amber.text, 'animate-spin')} />,
        };
      case 'disconnected':
        return {
          color: baseColors.rose.text,
          bgColor: cn(baseColors.rose.bg, baseColors.rose.darkBg),
          icon: <Icon name="x" className={baseColors.rose.text} />,
        };
      default: // Unknown status
        return {
          color: baseColors.amber.text,
          bgColor: cn(baseColors.amber.bg, baseColors.amber.darkBg),
          icon: <Icon name="info" className={baseColors.amber.text} />,
        };
    }
  };

  // Use the actual status or the reconnecting state
  const displayStatus = isReconnecting ? 'reconnecting' : status;
  const statusInfo = getStatusInfo();

  return (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full',
              statusInfo.bgColor,
              // Text color is applied directly to the icon, no need here unless there's text inside
            )}>
            {statusInfo.icon}
          </div>
          <Typography variant="body" className="font-medium text-slate-700 dark:text-slate-200">
            Server {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
          </Typography>
        </div>
        <div className="flex items-center gap-2">
          {(status !== 'connected' || isReconnecting) && (
            <Button
              onClick={handleReconnect}
              disabled={isReconnecting}
              size="sm"
              variant={isReconnecting ? 'outline' : 'default'}
              className="h-7 text-xs">
              {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
            </Button>
          )}
          {/* Settings and Details buttons already have dark mode styles */}
          <button
            onClick={handleSettings}
            className="p-1 text-slate-500 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Server settings">
            <Icon name="settings" size="sm" />
          </button>
          <button
            onClick={handleDetails}
            className="p-1 text-slate-500 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Show details">
            <Icon name="info" size="sm" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <Card className="mt-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
            <Typography variant="h4" className="mb-2 text-slate-800 dark:text-slate-100">
              Server Configuration
            </Typography>
            <div className="mb-3">
              {/* Label already has dark mode styles */}
              <label htmlFor="server-uri" className="block mb-1 text-slate-600 dark:text-slate-400">
                Server URI
              </label>
              {/* Input already has dark mode styles */}
              <input
                id="server-uri"
                type="text"
                value={serverUri}
                onChange={handleServerUriChange}
                placeholder="Enter server URI"
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 outline-none"
              />
            </div>
            <div className="flex justify-end">
              {/* Assuming Button component handles dark mode variants */}
              <Button onClick={() => setShowSettings(false)} variant="outline" size="sm" className="h-7 mr-2 text-xs">
                Cancel
              </Button>
              <Button onClick={handleSaveServerConfig} variant="default" size="sm" className="h-7 text-xs">
                Save & Reconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details panel */}
      {showDetails && (
        <Card className="mt-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="p-3 text-xs text-slate-700 dark:text-slate-300">
            {/* Paragraphs already have dark mode styles */}
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Status:</span> {displayStatus}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Server URI:</span>{' '}
              {serverUri || 'Not configured'}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ServerStatus;
