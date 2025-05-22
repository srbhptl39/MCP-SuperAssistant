import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSiteAdapter } from '@src/adapters/adapterRegistry';
import ServerStatus from './ServerStatus/ServerStatus';
import AvailableTools from './AvailableTools/AvailableTools';
import InstructionManager from './Instructions/InstructionManager';
import InputArea from './InputArea/InputArea';
import { useBackgroundCommunication } from './hooks/backgroundCommunication';
import { logMessage, debugShadowDomStyles } from '@src/utils/helpers';
import { Typography, Toggle, ToggleWithoutLabel, ResizeHandle, Icon, Button } from './ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';
import type { SidebarPreferences } from '@src/utils/storage';
import { getSidebarPreferences, saveSidebarPreferences } from '@src/utils/storage';
// Simpler import approach to avoid TS module errors
const mcpTools = typeof window !== 'undefined' ? (window as any).mcpTools || {} : {};
const getMasterToolDict = () => mcpTools.getMasterToolDict?.() || {};
const clearAllTools = (callIds?: string[]) => mcpTools.clearAllTools?.(callIds);

// Define Theme type
type Theme = SidebarPreferences['theme'];
const THEME_CYCLE: Theme[] = ['light', 'dark', 'system']; // Define the cycle order

// Define a constant for minimized width (should match BaseSidebarManager and CSS logic)
const SIDEBAR_MINIMIZED_WIDTH = 56;
const SIDEBAR_DEFAULT_WIDTH = 320;

// Define types for detected tools
type DetectedTool = {
  name: string;
  description?: string;
  callId?: string;
};

const Sidebar: React.FC = () => {
  const adapter = useSiteAdapter();
  // Get communication methods with fallback for failed initialization
  const communicationMethods = useBackgroundCommunication();
  
  // Use a single source of truth for server status from the useBackgroundCommunication hook
  // This is the most reliable source as it's already set up to handle all connection status updates
  const serverStatus = communicationMethods?.serverStatus || 'disconnected';
  const availableTools = communicationMethods?.availableTools || [];
  const sendMessage = communicationMethods?.sendMessage || (async () => 'Error: Communication unavailable');
  const refreshTools = communicationMethods?.refreshTools || (async () => []);
  const forceReconnect = communicationMethods?.forceReconnect || (async () => false);
  
  // Debug logging for serverStatus changes
  useEffect(() => {
    logMessage(`[Sidebar] serverStatus changed to: "${serverStatus}", passing to ServerStatus component`);
  }, [serverStatus]);

  const [isMinimized, setIsMinimized] = useState(false);
  const [detectedTools, setDetectedTools] = useState<DetectedTool[]>([]);
  const [activeTab, setActiveTab] = useState<'availableTools' | 'instructions'>('availableTools');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isPushMode, setIsPushMode] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [isTransitioning, setIsTransitioning] = useState(false); // Single state for all transitions
  const [isInitialRender, setIsInitialRender] = useState(true);
  const [isInputMinimized, setIsInputMinimized] = useState(false);
  // Add a state to track if component loading is complete, regardless of background services
  const [isComponentLoadingComplete, setIsComponentLoadingComplete] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const previousWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const transitionTimerRef = useRef<number | null>(null);

  // --- Theme Application Logic ---
  const applyTheme = useCallback((selectedTheme: Theme) => {
    const sidebarManager = (window as any).activeSidebarManager;
    if (!sidebarManager) {
      logMessage('[Sidebar] Cannot apply theme: Sidebar manager not found.');
      return;
    }

    // Use the BaseSidebarManager's applyThemeClass method instead of direct manipulation
    const success = sidebarManager.applyThemeClass(selectedTheme);
    if (!success) {
      logMessage('[Sidebar] Failed to apply theme using sidebar manager.');
    }
  }, []);

  // Effect to apply theme and listen for system changes
  useEffect(() => {
    applyTheme(theme); // Apply theme initially

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system'); // Re-apply system theme on change
      }
    };

    // Add listener regardless of theme, but only re-apply if theme is 'system'
    mediaQuery.addEventListener('change', handleChange);

    // Cleanup listener
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme, applyTheme]);
  // --- End Theme Application Logic ---

  // Load preferences from storage on initial render
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const preferences = await getSidebarPreferences();
        logMessage(`[Sidebar] Loaded preferences: ${JSON.stringify(preferences)}`);

        // Apply stored settings
        setIsPushMode(preferences.isPushMode);
        setSidebarWidth(preferences.sidebarWidth || SIDEBAR_DEFAULT_WIDTH);
        setIsMinimized(preferences.isMinimized ?? false);
        setAutoSubmit(preferences.autoSubmit || false);
        setTheme(preferences.theme || 'system');
        previousWidthRef.current = preferences.sidebarWidth || SIDEBAR_DEFAULT_WIDTH;
      } catch (error) {
        logMessage(`[Sidebar] Error loading preferences: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        isInitialLoadRef.current = false;

        // Delay disabling the initial render flag to prevent flickering
        setTimeout(() => {
          setIsInitialRender(false);
          setIsComponentLoadingComplete(true);
        }, 200);
      }
    };

    loadPreferences();

    // Ensure loading completes even if preferences fail
    const timeoutId = setTimeout(() => {
      if (!isComponentLoadingComplete) {
        logMessage('[Sidebar] Forcing component loading complete after timeout');
        setIsComponentLoadingComplete(true);
        setIsInitialRender(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  // Save preferences when they change
  useEffect(() => {
    // Skip saving on initial load when we're just restoring from storage
    if (isInitialLoadRef.current) return;

    // Use debounce for width changes to avoid excessive writes
    const saveTimeout = setTimeout(() => {
      saveSidebarPreferences({
        isPushMode,
        sidebarWidth,
        isMinimized,
        autoSubmit,
        theme,
      }).catch(error => {
        logMessage(`[Sidebar] Error saving preferences: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 300);

    return () => clearTimeout(saveTimeout);
  }, [isPushMode, sidebarWidth, isMinimized, autoSubmit, theme]);

  // useEffect(() => {
  //   // Function to update detected tools
  //   const updateDetectedTools = () => {
  //     try {
  //       const toolDict = getMasterToolDict();
  //       const mcpTools = Object.values(toolDict) as DetectedTool[];

  //       // Update the detected tools state
  //       setDetectedTools(mcpTools);

  //       if (mcpTools.length > 0) {
  //         // logMessage(`[Sidebar] Found ${mcpTools.length} MCP tools`);
  //       }
  //     } catch (error) {
  //       // If getMasterToolDict fails, just log the error
  //       console.error("Error updating detected tools:", error);
  //     }
  //   };

  //   // Set up interval to check for new tools
  //   const updateInterval = setInterval(updateDetectedTools, 1000);

  //   // Track URL changes to clear detected tools on navigation
  //   let lastUrl = window.location.href;
  //   const checkUrlChange = () => {
  //     const currentUrl = window.location.href;
  //     if (currentUrl !== lastUrl) {
  //       lastUrl = currentUrl;
  //       // Clear detected tools in the UI immediately on URL change
  //       setDetectedTools([]);
  //       logMessage('[Sidebar] URL changed, cleared detected tools');
  //     }
  //   };

  //   // Check for URL changes frequently
  //   const urlCheckInterval = setInterval(checkUrlChange, 300);

  //   // Initial check
  //   // updateDetectedTools();

  //   return () => {
  //     clearInterval(updateInterval);
  //     clearInterval(urlCheckInterval);
  //   };
  // }, [adapter]);

  // Effect to apply push mode and width changes to the manager
  useEffect(() => {
    const sidebarManager = (window as any).activeSidebarManager; // Or get it via context/props if available
    if (sidebarManager) {
      // Only apply push mode settings if the sidebar is currently visible
      if (sidebarManager.getIsVisible()) {
        logMessage(
          `[Sidebar] Applying push mode (${isPushMode}, minimized: ${isMinimized}) and width (${sidebarWidth}) to BaseSidebarManager`,
        );
        // Pass minimized width if minimized, otherwise sidebarWidth
        sidebarManager.setPushContentMode(
          isPushMode,
          isMinimized ? SIDEBAR_MINIMIZED_WIDTH : sidebarWidth,
          isMinimized,
        );

        // If only width changed while push mode is active, update styles
        // Added checks to prevent unnecessary updates during resize or initial load
        if (isPushMode && !isInitialLoadRef.current && !isResizingRef.current) {
          sidebarManager.updatePushModeStyles(isMinimized ? SIDEBAR_MINIMIZED_WIDTH : sidebarWidth);
        }
      } else {
        logMessage('[Sidebar] Sidebar is hidden, skipping application of push mode/width preferences.');
        // Ensure push mode is explicitly turned off if the sidebar should be hidden
        sidebarManager.setPushContentMode(false);
      }
    } else {
      logMessage('[Sidebar] Sidebar manager not found when trying to apply push mode/width.');
    }

    // Mark initial load as complete after the first run
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    }
    // Reset resize ref after applying changes
    isResizingRef.current = false;
  }, [isPushMode, sidebarWidth, isMinimized, adapter]); // Re-run when these change

  // Simple transition management
  const startTransition = () => {
    // Clear any existing timer
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }

    setIsTransitioning(true);

    // Set timeout to end transition
    transitionTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, 500) as unknown as number;
  };

  const toggleMinimize = () => {
    startTransition();
    setIsMinimized(!isMinimized);
  };

  const toggleInputMinimize = () => setIsInputMinimized(prev => !prev);

  const handleResize = useCallback(
    (width: number) => {
      // Mark as resizing to prevent unnecessary updates
      if (!isResizingRef.current) {
        isResizingRef.current = true;

        if (sidebarRef.current) {
          sidebarRef.current.classList.add('resizing');
        }
      }

      // Enforce minimum width constraint
      const constrainedWidth = Math.max(SIDEBAR_DEFAULT_WIDTH, width);

      // Update push mode styles if enabled
      if (isPushMode) {
        try {
          const sidebarManager = (window as any).activeSidebarManager;
          if (sidebarManager && typeof sidebarManager.updatePushModeStyles === 'function') {
            sidebarManager.updatePushModeStyles(constrainedWidth);
          }
        } catch (error) {
          logMessage(
            `[Sidebar] Error updating push mode styles: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Debounce the state update for better performance
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          setSidebarWidth(constrainedWidth);

          // End resize after a short delay
          if (transitionTimerRef.current !== null) {
            clearTimeout(transitionTimerRef.current);
          }

          transitionTimerRef.current = window.setTimeout(() => {
            if (sidebarRef.current) {
              sidebarRef.current.classList.remove('resizing');
            }

            // Store current width for future reference
            previousWidthRef.current = constrainedWidth;
            isResizingRef.current = false;
            transitionTimerRef.current = null;
          }, 200) as unknown as number;
        });
      } else {
        setSidebarWidth(constrainedWidth);
      }
    },
    [isPushMode],
  );

  const handlePushModeToggle = (checked: boolean) => {
    setIsPushMode(checked);
    logMessage(`[Sidebar] Push mode ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleAutoSubmitToggle = (checked: boolean) => {
    setAutoSubmit(checked);
    logMessage(`[Sidebar] Auto submit ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleClearTools = () => {
    // Store call IDs before clearing for future reference
    const toolsWithCallIds = detectedTools.filter(tool => tool.callId);
    const callIds: string[] = [];

    if (toolsWithCallIds.length > 0) {
      toolsWithCallIds.forEach(tool => {
        if (tool.callId) {
          callIds.push(tool.callId);
        }
      });
      logMessage(`[Sidebar] Storing ${callIds.length} call IDs for future reference: ${callIds.join(', ')}`);
    }

    // Clear tools in the UI and detector
    setDetectedTools([]);
    clearAllTools(callIds); // Pass the call IDs to the clearAllTools function
    logMessage(`[Sidebar] Cleared all detected tools`);
  };

  const handleRefreshTools = async () => {
    logMessage('[Sidebar] Refreshing tools');
    setIsRefreshing(true);
    try {
      await refreshTools(true);
      logMessage('[Sidebar] Tools refreshed successfully');
    } catch (error) {
      logMessage(`[Sidebar] Error refreshing tools: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleThemeToggle = () => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    const nextTheme = THEME_CYCLE[nextIndex];
    setTheme(nextTheme);
    logMessage(`[Sidebar] Theme toggled to: ${nextTheme}`);
  };

  // Transform availableTools to match the expected format for InstructionManager
  const formattedTools = availableTools.map(tool => ({
    name: tool.name,
    schema: tool.schema,
    description: tool.description || '', // Ensure description is always a string
  }));

  // Expose availableTools globally for popover access
  if (typeof window !== 'undefined') {
    (window as any).availableTools = availableTools;
  }

  // Helper to get the current theme icon name
  const getCurrentThemeIcon = (): 'sun' | 'moon' | 'laptop' => {
    switch (theme) {
      case 'light':
        return 'sun';
      case 'dark':
        return 'moon';
      case 'system':
        return 'laptop';
      default:
        return 'laptop'; // Default to system
    }
  };

  return (
    <div
      ref={sidebarRef}
      className={cn(
        'fixed top-0 right-0 h-screen bg-white dark:bg-slate-900 shadow-lg z-50 flex flex-col border-l border-slate-200 dark:border-slate-700 sidebar',
        isPushMode ? 'push-mode' : '',
        isResizingRef.current ? 'resizing' : '',
        isMinimized ? 'collapsed' : '',
        isTransitioning ? 'sidebar-transitioning' : '',
        isInitialRender ? 'initial-render' : '',
      )}
      style={{ width: isMinimized ? `${SIDEBAR_MINIMIZED_WIDTH}px` : `${sidebarWidth}px` }}>
      {/* Resize Handle - only visible when not minimized */}
      {!isMinimized && (
        <ResizeHandle
          onResize={handleResize}
          minWidth={SIDEBAR_DEFAULT_WIDTH}
          maxWidth={500}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-indigo-400 dark:hover:bg-indigo-600 z-[60] transition-colors duration-300"
        />
      )}

      {/* Header - Adjust content based on isMinimized */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between flex-shrink-0 shadow-sm sidebar-header">
        {!isMinimized ? (
          <>
            <div className="flex items-center space-x-2">
              {/* Replace settings icon with logo, make it larger and linkable */}
              <a
                href="https://mcpsuperassistant.ai/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit MCP Super Assistant Website"
                className="block">
                {' '}
                {/* Make link block for sizing */}
                <img
                  src={chrome.runtime.getURL('icon-34.png')}
                  alt="MCP Logo"
                  className="w-8 h-8 rounded-md " // Increase size & add rounded corners
                />
              </a>
              {isComponentLoadingComplete ? (
                <>
                  {/* Wrap title in link */}
                  <a
                    href="https://mcpsuperassistant.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-800 dark:text-slate-100 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-150 no-underline"
                    aria-label="Visit MCP Super Assistant Website">
                    <Typography variant="h4" className="font-semibold">
                      MCP SuperAssistant
                    </Typography>
                  </a>
                  {/* Existing icon link */}
                  <a
                    href="https://mcpsuperassistant.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors duration-150"
                    aria-label="Visit MCP Super Assistant Website">
                    <Icon name="arrow-up-right" size="xs" className="inline-block align-baseline" />
                  </a>
                </>
              ) : (
                <Typography variant="h4" className="font-semibold text-slate-800 dark:text-slate-100">
                  MCP SuperAssistant
                </Typography>
              )}
            </div>
            <div className="flex items-center space-x-2 pr-1">
              {/* Theme Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleThemeToggle}
                aria-label={`Toggle theme (current: ${theme})`}
                className="hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all duration-200 hover:scale-105">
                <Icon
                  name={getCurrentThemeIcon()}
                  size="sm"
                  className="transition-all text-indigo-600 dark:text-indigo-400"
                />
                <span className="sr-only">Toggle theme</span>
              </Button>
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMinimize}
                aria-label="Minimize sidebar"
                className="hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all duration-200 hover:scale-105">
                <Icon name="chevron-right" className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              </Button>
            </div>
          </>
        ) : (
          // Expand Button when minimized
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMinimize}
            aria-label="Expand sidebar"
            className="mx-auto hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all duration-200 hover:scale-110">
            <Icon name="chevron-left" className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </Button>
        )}
      </div>

      {/* Main Content Area - Using sliding panel approach */}
      <div className="sidebar-inner-content flex-1 relative overflow-hidden bg-white dark:bg-slate-900">
        {/* Virtual slide - content always at full width */}
        <div
          ref={contentRef}
          className={cn(
            'absolute top-0 bottom-0 right-0 transition-transform duration-200 ease-in-out',
            isMinimized ? 'translate-x-full' : 'translate-x-0',
            isTransitioning ? 'will-change-transform' : '',
          )}
          style={{ width: `${sidebarWidth}px` }}>
          <div className="flex flex-col h-full">
            {/* Status and Settings section */}
            <div className="py-4 px-4 space-y-4 overflow-y-auto flex-shrink-0">
              <ServerStatus status={serverStatus} />

              {/* Settings */}
              <Card className="sidebar-card border-slate-200 dark:border-slate-700 dark:bg-slate-800 flex-shrink-0 overflow-hidden rounded-lg shadow-sm transition-shadow duration-300">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Typography variant="subtitle" className="text-slate-700 dark:text-slate-300 font-medium">
                      Push Content Mode
                    </Typography>
                    <ToggleWithoutLabel
                      label="Push Content Mode"
                      checked={isPushMode}
                      onChange={handlePushModeToggle}
                    />
                  </div>
                  {/* <div className="flex items-center justify-between">
                    <Typography variant="subtitle" className="text-slate-700 dark:text-slate-300 font-medium">
                      Auto Submit Tool Results
                    </Typography>
                    <ToggleWithoutLabel
                      label="Auto Submit Tool Results"
                      checked={autoSubmit}
                      onChange={handleAutoSubmitToggle}
                    />
                  </div> */}

                  {/* DEBUG BUTTON - ONLY FOR DEVELOPMENT - REMOVE IN PRODUCTION */}
                  {process.env.NODE_ENV === 'development' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2 border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                      onClick={() => {
                        const shadowHost = (window as any).activeSidebarManager?.getShadowHost();
                        if (shadowHost && shadowHost.shadowRoot) {
                          debugShadowDomStyles(shadowHost.shadowRoot);
                          logMessage('Running Shadow DOM style debug');
                        } else {
                          logMessage('Cannot debug: Shadow DOM not found');
                        }
                      }}>
                      Debug Styles
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Tabs for Tools/Instructions */}
              <div className="border-b border-slate-200 dark:border-slate-700 mb-2">
                <div className="flex">
                  <button
                    className={cn(
                      'py-2 px-4 font-medium text-sm transition-all duration-200',
                      activeTab === 'availableTools'
                        ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-lg',
                    )}
                    onClick={() => setActiveTab('availableTools')}>
                    Available Tools
                  </button>
                  <button
                    className={cn(
                      'py-2 px-4 font-medium text-sm transition-all duration-200',
                      activeTab === 'instructions'
                        ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-lg',
                    )}
                    onClick={() => setActiveTab('instructions')}>
                    Instructions
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Content Area - scrollable area with flex-grow to fill available space */}
            <div className="flex-1 min-h-0 px-4 pb-4 overflow-hidden">
              {/* AvailableTools */}
              <div
                className={cn(
                  'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent',
                  { hidden: activeTab !== 'availableTools' },
                )}>
                <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
                  <CardContent className="p-0">
                    <AvailableTools
                      tools={availableTools}
                      onExecute={sendMessage}
                      onRefresh={handleRefreshTools}
                      isRefreshing={isRefreshing}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Instructions */}
              <div
                className={cn(
                  'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent',
                  { hidden: activeTab !== 'instructions' },
                )}>
                <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
                  <CardContent className="p-0">
                    <InstructionManager adapter={adapter} tools={formattedTools} />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Input Area (Always at the bottom) */}
            <div className="border-t border-slate-200 dark:border-slate-700 flex-shrink-0 bg-white dark:bg-slate-800 shadow-inner">
              {!isInputMinimized ? (
                <div className="relative">
                  <Button variant="ghost" size="sm" onClick={toggleInputMinimize} className="absolute top-2 right-2">
                    <Icon name="chevron-down" size="sm" />
                  </Button>
                  <InputArea
                    onSubmit={async text => {
                      adapter.insertTextIntoInput(text);
                      await new Promise(resolve => setTimeout(resolve, 300));
                      await adapter.triggerSubmission();
                    }}
                    onToggleMinimize={toggleInputMinimize}
                  />
                </div>
              ) : (
                <Button variant="default" size="sm" onClick={toggleInputMinimize} className="w-full h-10">
                  <Icon name="chevron-up" size="sm" className="mr-2" />
                  Show Input
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
