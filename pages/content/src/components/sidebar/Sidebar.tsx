import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCurrentAdapter } from '@src/hooks/useAdapter';
import { useTheme, useSidebarState, useUserPreferences, useConnectionStatus } from '@src/hooks';
import ServerStatus from './ServerStatus/ServerStatus';
import AvailableTools from './AvailableTools/AvailableTools';
import InstructionManager from './Instructions/InstructionManager';
import InputArea from './InputArea/InputArea';
import { useMcpCommunication } from '@src/hooks/useMcpCommunication';
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

interface SidebarProps {
  initialPreferences?: SidebarPreferences | null;
}

const Sidebar: React.FC<SidebarProps> = ({ initialPreferences }) => {
  // Add unique ID to track component instances
  const componentId = useRef(`sidebar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  logMessage(
    `[Sidebar] Component initializing with preferences: ${initialPreferences ? 'loaded' : 'null'} (ID: ${componentId.current})`,
  );

  const currentAdapter = useCurrentAdapter();

  // Create a compatibility adapter for legacy components
  const adapter = useMemo(() => ({
    // Legacy methods for backward compatibility
    insertTextIntoInput: (text: string) => currentAdapter.insertText(text),
    triggerSubmission: () => currentAdapter.submitForm(),
    supportsFileUpload: () => currentAdapter.hasCapability('file-attachment'),
    attachFile: (file: File) => currentAdapter.attachFile(file),
    // Pass through other properties that might be needed
    name: currentAdapter.activeAdapterName || 'Unknown',
    isReady: currentAdapter.isReady,
    status: currentAdapter.status,
    capabilities: currentAdapter.capabilities
  }), [currentAdapter]);

  // Use Zustand hooks for state management
  const { theme, setTheme } = useTheme();
  const {
    isVisible: sidebarVisible,
    isMinimized: storeSidebarMinimized,
    width: storeSidebarWidth,
    toggleSidebar,
    resizeSidebar,
    setSidebarVisibility
  } = useSidebarState();
  const { preferences, updatePreferences } = useUserPreferences();
  const { status: connectionStatus } = useConnectionStatus();

  // No error states that could block rendering
  const [initializationError, setInitializationError] = useState<string | null>(null);

  // Get communication methods with guaranteed safe fallbacks
  const communicationMethods = useMcpCommunication();

  // Always render immediately - use safe defaults for all communication methods
  const serverStatus = connectionStatus || communicationMethods?.serverStatus || 'disconnected';
  const availableTools = communicationMethods?.availableTools || [];
  const sendMessage = communicationMethods?.sendMessage || (async () => 'Communication not available');
  const refreshTools = communicationMethods?.refreshTools || (async () => []);
  const forceReconnect = communicationMethods?.forceReconnect || (async () => false);

  // Debug logging for serverStatus changes
  useEffect(() => {
    logMessage(`[Sidebar] serverStatus changed to: "${serverStatus}", passing to ServerStatus component`);
  }, [serverStatus]);

  // Get initial state from shadow host to prevent flash
  const getInitialMinimizedState = (): boolean => {
    // Use passed preferences first (most reliable)
    if (initialPreferences !== undefined && initialPreferences !== null) {
      const value = initialPreferences.isMinimized ?? false;
      logMessage(`[Sidebar] Using initialPreferences for isMinimized: ${value}`);
      return value;
    }

    // Fallback to shadow host attribute
    try {
      const sidebarManager = (window as any).activeSidebarManager;
      const shadowHost = sidebarManager?.getShadowHost();
      if (shadowHost) {
        const attrValue = shadowHost.getAttribute('data-initial-minimized');
        logMessage(`[Sidebar] DEBUG: Raw attribute value: ${JSON.stringify(attrValue)}`);

        if (attrValue === null || attrValue === undefined) {
          logMessage(`[Sidebar] WARNING: data-initial-minimized attribute is null/undefined, defaulting to false`);
          return false;
        }

        const isMinimized = attrValue === 'true';
        logMessage(
          `[Sidebar] Shadow host attribute 'data-initial-minimized' = '${attrValue}', interpreted as: ${isMinimized}`,
        );
        return isMinimized;
      } else {
        logMessage(`[Sidebar] Shadow host not found, defaulting to false`);
        return false;
      }
    } catch (error) {
      logMessage(`[Sidebar] Error reading initial state, defaulting to false: ${error}`);
      return false;
    }
  };

  // Initialize states with proper defaults to prevent flash
  const isInitiallyMinimized = getInitialMinimizedState();

  // CRITICAL FIX: If attribute was null but we expect it to have a value, set it
  useEffect(() => {
    try {
      const sidebarManager = (window as any).activeSidebarManager;
      const shadowHost = sidebarManager?.getShadowHost();
      if (shadowHost) {
        const currentAttr = shadowHost.getAttribute('data-initial-minimized');
        if (currentAttr === null || currentAttr === undefined) {
          // Attribute was not set properly, set it now based on our initialization
          const valueToSet = isInitiallyMinimized ? 'true' : 'false';
          shadowHost.setAttribute('data-initial-minimized', valueToSet);
          logMessage(`[Sidebar] CORRECTED: Set missing data-initial-minimized to '${valueToSet}'`);
        }
      }
    } catch (error) {
      logMessage(`[Sidebar] Error correcting data-initial-minimized: ${error}`);
    }
  }, [isInitiallyMinimized]);

  // Use store values with fallbacks to initial preferences
  const isMinimized = storeSidebarMinimized ?? (initialPreferences?.isMinimized ?? false);
  const sidebarWidth = storeSidebarWidth || initialPreferences?.sidebarWidth || SIDEBAR_DEFAULT_WIDTH;
  const isPushMode = preferences.isPushMode ?? initialPreferences?.isPushMode ?? false;
  const autoSubmit = preferences.autoSubmit ?? initialPreferences?.autoSubmit ?? false;

  // Local UI state that doesn't need to be in the store
  const [detectedTools, setDetectedTools] = useState<DetectedTool[]>([]);
  const [activeTab, setActiveTab] = useState<'availableTools' | 'instructions'>('availableTools');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isInputMinimized, setIsInputMinimized] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(initialPreferences !== null);

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
      logMessage('[Sidebar] Sidebar manager not available for theme application - will apply when ready.');
      return;
    }

    // OPTIMIZATION: Theme application is now CSS-only and doesn't trigger re-renders
    try {
      const success = sidebarManager.applyThemeClass(selectedTheme);
      if (!success) {
        logMessage('[Sidebar] Theme application failed but continuing...');
      }
    } catch (error) {
      logMessage(`[Sidebar] Theme application error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  // Effect to apply theme and listen for system changes
  // OPTIMIZATION: Throttle theme changes to avoid excessive calls
  const lastThemeChangeRef = useRef<number>(0);

  useEffect(() => {
    // Throttle theme applications to once every 100ms
    const now = Date.now();
    if (now - lastThemeChangeRef.current < 100) {
      return;
    }
    lastThemeChangeRef.current = now;

    // Apply theme safely without blocking
    try {
      applyTheme(theme);
    } catch (error) {
      logMessage(
        `[Sidebar] Theme application error during useEffect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const changeNow = Date.now();
        if (changeNow - lastThemeChangeRef.current < 100) {
          return; // Throttle system theme changes
        }
        lastThemeChangeRef.current = changeNow;

        try {
          applyTheme('system'); // Re-apply system theme on change
        } catch (error) {
          logMessage(`[Sidebar] Theme reapplication error: ${error instanceof Error ? error.message : String(error)}`);
        }
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

  // Load preferences immediately but never block rendering - only if not provided initially
  useEffect(() => {
    // Skip loading if preferences were already provided
    if (initialPreferences !== null) {
      logMessage('[Sidebar] Using initial preferences, skipping async load');
      isInitialLoadRef.current = false;
      return;
    }

    const loadPreferences = async () => {
      try {
        logMessage('[Sidebar] Loading preferences...');
        const preferences = await getSidebarPreferences();
        logMessage(`[Sidebar] Loaded preferences: ${JSON.stringify(preferences)}`);

        // Apply stored settings - now handled by the store
        logMessage(
          `[Sidebar] Applying preferences - isPushMode: ${preferences.isPushMode}, isMinimized: ${preferences.isMinimized}, sidebarWidth: ${preferences.sidebarWidth}`,
        );
        // Update preferences through the store
        updatePreferences(preferences);
        previousWidthRef.current = preferences.sidebarWidth || SIDEBAR_DEFAULT_WIDTH;

        logMessage('[Sidebar] Preferences applied successfully');

        // Mark preferences as loaded
        logMessage('[Sidebar] Setting preferencesLoaded to true');
        setPreferencesLoaded(true);

        // Clean up initial state attributes after preferences are applied
        setTimeout(() => {
          try {
            const sidebarManager = (window as any).activeSidebarManager;
            const shadowHost = sidebarManager?.getShadowHost();
            if (shadowHost?.getAttribute('data-initial-minimized') && !preferences.isMinimized) {
              // Only remove if we're not actually minimized
              shadowHost.removeAttribute('data-initial-minimized');
              shadowHost.style.removeProperty('width');
              logMessage('[Sidebar] Cleaned up initial state attributes');
            }
          } catch (error) {
            logMessage(
              `[Sidebar] Error cleaning up initial state: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }, 100);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`[Sidebar] Error loading preferences (non-blocking): ${errorMessage}`);
        // Never block the UI for preference loading failures
        setPreferencesLoaded(true); // Mark as loaded even on error to prevent blocking
      } finally {
        isInitialLoadRef.current = false;
      }
    };

    // Start loading immediately but don't wait
    loadPreferences();
  }, [initialPreferences]); // Load preferences once on mount or when initialPreferences changes

  // Save preferences when they change - now handled by the store
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
        customInstructions: preferences.customInstructions,
        customInstructionsEnabled: preferences.customInstructionsEnabled,
      }).catch(error => {
        logMessage(`[Sidebar] Error saving preferences: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 300);

    return () => clearTimeout(saveTimeout);
  }, [isPushMode, sidebarWidth, isMinimized, autoSubmit, theme, preferences]);

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

  // Apply push mode and width changes safely - only when preferences are first loaded
  useEffect(() => {
    // Only run when preferences are loaded for the first time
    if (!preferencesLoaded) {
      return;
    }

    logMessage(`[Sidebar] Preferences loaded - applying initial push mode settings`);

    const sidebarManager = (window as any).activeSidebarManager;
    if (sidebarManager) {
      try {
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
      } catch (error) {
        logMessage(
          `[Sidebar] Error applying push mode settings: ${error instanceof Error ? error.message : String(error)}`,
        );
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
  }, [preferencesLoaded]); // Only depend on preferencesLoaded

  // Separate effect for handling live changes to push mode settings
  useEffect(() => {
    // Skip if preferences haven't been loaded yet
    if (!preferencesLoaded) {
      return;
    }

    // Skip during initial load to prevent duplicate applications
    if (isInitialLoadRef.current) {
      return;
    }

    logMessage(`[Sidebar] Push mode settings changed - updating BaseSidebarManager`);

    const sidebarManager = (window as any).activeSidebarManager;
    if (sidebarManager) {
      try {
        if (sidebarManager.getIsVisible()) {
          logMessage(
            `[Sidebar] Updating push mode (${isPushMode}, minimized: ${isMinimized}) and width (${sidebarWidth}) to BaseSidebarManager`,
          );
          sidebarManager.setPushContentMode(
            isPushMode,
            isMinimized ? SIDEBAR_MINIMIZED_WIDTH : sidebarWidth,
            isMinimized,
          );

          if (isPushMode && !isResizingRef.current) {
            sidebarManager.updatePushModeStyles(isMinimized ? SIDEBAR_MINIMIZED_WIDTH : sidebarWidth);
          }
        } else {
          sidebarManager.setPushContentMode(false);
        }
      } catch (error) {
        logMessage(
          `[Sidebar] Error updating push mode settings: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }, [isPushMode, sidebarWidth, isMinimized, adapter]); // Dependencies for live updates

  // Simple transition management
  const startTransition = () => {
    // Clear any existing timer
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }

    setIsTransitioning(true);

    // Add visual feedback to sidebar during transition
    if (sidebarRef.current) {
      sidebarRef.current.classList.add('sidebar-transitioning');
    }

    // Set timeout to end transition
    transitionTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      if (sidebarRef.current) {
        sidebarRef.current.classList.remove('sidebar-transitioning');
      }
      transitionTimerRef.current = null;
    }, 500) as unknown as number;
  };

  const toggleMinimize = () => {
    startTransition();

    // Add a subtle bounce effect to the toggle
    if (sidebarRef.current) {
      sidebarRef.current.style.transform = 'scale(0.98)';
      setTimeout(() => {
        if (sidebarRef.current) {
          sidebarRef.current.style.transform = '';
        }
      }, 100);
    }

    toggleSidebar();
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
          resizeSidebar(constrainedWidth);

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
        resizeSidebar(constrainedWidth);
      }
    },
    [isPushMode],
  );

  const handlePushModeToggle = (checked: boolean) => {
    updatePreferences({ isPushMode: checked });
    logMessage(`[Sidebar] Push mode ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleAutoSubmitToggle = (checked: boolean) => {
    updatePreferences({ autoSubmit: checked });
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
      logMessage(
        `[Sidebar] Error refreshing tools (non-blocking): ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't show error to user - this is a background operation
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
              {/* Always show the header content immediately */}
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
            {/* Critical Error Display - Only show for severe failures, never block UI */}
            {initializationError && (
              <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-start space-x-2">
                    <Icon name="alert-triangle" size="sm" className="text-red-600 dark:text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <Typography variant="subtitle" className="text-red-800 dark:text-red-200 font-medium">
                        Warning
                      </Typography>
                      <Typography variant="caption" className="text-red-700 dark:text-red-300">
                        Some features may be limited: {initializationError}
                      </Typography>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInitializationError(null)}
                    className="border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-800">
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

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
                      await adapter.insertTextIntoInput(text);
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
