import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSiteAdapter } from '@src/adapters/adapterRegistry';
import ServerStatus from './ServerStatus/ServerStatus';
import AvailableTools from './AvailableTools/AvailableTools';
import DetectedTools from './DetectedTools/DetectedTools';
import InstructionManager from './Instructions/InstructionManager';
import InputArea from './InputArea/InputArea';
import { useBackgroundCommunication } from './hooks/backgroundCommunication';
import { logMessage, debugShadowDomStyles } from '@src/utils/helpers';
import { Typography, Toggle, ToggleWithoutLabel, ResizeHandle, Icon, Button } from './ui';
import { cn } from '@src/lib/utils';
import { Card, CardContent } from '@src/components/ui/card';
import type { SidebarPreferences } from '@src/utils/storage';
import { getSidebarPreferences, saveSidebarPreferences } from '@src/utils/storage';

// Define interface for detected tools
interface DetectedTool {
  id: string;
  name: string;
  args: any;
}

// Define Theme type
type Theme = SidebarPreferences['theme'];
const THEME_CYCLE: Theme[] = ['light', 'dark', 'system']; // Define the cycle order

const Sidebar: React.FC = () => {
  const adapter = useSiteAdapter();
  const { serverStatus, availableTools, sendMessage, refreshTools } = useBackgroundCommunication();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [detectedTools, setDetectedTools] = useState<DetectedTool[]>([]);
  const [activeTab, setActiveTab] = useState<'availableTools' | 'detectedTools' | 'instructions'>('detectedTools');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isPushMode, setIsPushMode] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

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
        setSidebarWidth(preferences.sidebarWidth);
        setIsCollapsed(preferences.isCollapsed);
        setAutoSubmit(preferences.autoSubmit || false);
        setTheme(preferences.theme || 'system');
      } catch (error) {
        logMessage(`[Sidebar] Error loading preferences: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        isInitialLoadRef.current = false;
      }
    };

    loadPreferences();
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
        isCollapsed,
        autoSubmit,
        theme,
      }).catch(error => {
        logMessage(`[Sidebar] Error saving preferences: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 300);

    return () => clearTimeout(saveTimeout);
  }, [isPushMode, sidebarWidth, isCollapsed, autoSubmit, theme]);

  useEffect(() => {
    const toolDetector = adapter.getToolDetector();

    // Use functional state update to properly handle existing tools
    toolDetector.onDetect((newTools: DetectedTool[]) => {
      setDetectedTools(prevTools => {
        // Create a map of existing tools by ID for quick lookup
        const existingToolsMap = new Map(prevTools.map(tool => [tool.id, tool]));

        // Add new tools that don't already exist
        newTools.forEach(tool => {
          if (!existingToolsMap.has(tool.id)) {
            existingToolsMap.set(tool.id, tool);
          }
        });

        // Convert map back to array
        return Array.from(existingToolsMap.values());
      });
    });

    return () => {
      toolDetector.disconnect();
    };
  }, [adapter]);

  // Apply push mode effect using CSS classes on the body
  useEffect(() => {
    // Get the current active sidebar manager and update push mode
    try {
      // Find the sidebar manager instance from the window object
      const sidebarManager = (window as any).activeSidebarManager;
      if (sidebarManager && typeof sidebarManager.setPushContentMode === 'function') {
        // Pass all necessary parameters to the BaseSidebarManager
        sidebarManager.setPushContentMode(isPushMode, sidebarWidth, isCollapsed);
        logMessage(`[Sidebar] Applied push mode (${isPushMode}) to BaseSidebarManager`);
      } else {
        logMessage('[Sidebar] Could not find sidebar manager to apply push mode');
      }
    } catch (error) {
      logMessage(`[Sidebar] Error applying push mode: ${error instanceof Error ? error.message : String(error)}`);
    }

    return () => {
      // Clean up when component unmounts - disable push mode
      try {
        const sidebarManager = (window as any).activeSidebarManager;
        if (sidebarManager) {
          // Use the proper cleanup method if available
          if (typeof sidebarManager.removePushModeStyles === 'function') {
            sidebarManager.removePushModeStyles();
            logMessage(`[Sidebar] Cleaned up push mode styles using removePushModeStyles`);
          } else if (typeof sidebarManager.setPushContentMode === 'function') {
            sidebarManager.setPushContentMode(false);
            logMessage(`[Sidebar] Cleaned up push mode by setting enabled=false`);
          }
        }
      } catch (error) {
        logMessage(`[Sidebar] Error cleaning up push mode: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }, [sidebarWidth, isCollapsed, isPushMode]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleResize = (width: number) => {
    // Only update the state when not actively resizing
    if (!isResizingRef.current) {
      isResizingRef.current = true;
      if (sidebarRef.current) {
        sidebarRef.current.classList.add('resizing');
      }
    }

    // Update the styles for push mode
    if (isPushMode) {
      try {
        const sidebarManager = (window as any).activeSidebarManager;
        if (sidebarManager && typeof sidebarManager.updatePushModeStyles === 'function') {
          sidebarManager.updatePushModeStyles(width);
        } else {
          // Fallback if sidebar manager isn't available
          document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
        }
      } catch (error) {
        logMessage(
          `[Sidebar] Error updating push mode styles: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Debounce the state update to avoid excessive renders
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        setSidebarWidth(width);

        // After a short delay, remove the resizing class and update the ref
        setTimeout(() => {
          if (sidebarRef.current) {
            sidebarRef.current.classList.remove('resizing');
          }
          isResizingRef.current = false;
        }, 50);
      });
    } else {
      setSidebarWidth(width);
    }
  };

  const handlePushModeToggle = (checked: boolean) => {
    setIsPushMode(checked);

    // The useEffect hook will take care of calling the sidebar manager's setPushContentMode method
    logMessage(`[Sidebar] Push mode ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleAutoSubmitToggle = (checked: boolean) => {
    setAutoSubmit(checked);
    logMessage(`[Sidebar] Auto submit ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleAutoExecuteToggle = (checked: boolean) => {
    setAutoExecute(checked);
    logMessage(`[Sidebar] Auto execute tools ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleClearTools = () => {
    setDetectedTools([]);
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
        'fixed top-0 right-0 h-screen bg-slate-50 dark:bg-slate-900 shadow-lg z-50 flex flex-col border-l border-slate-200 dark:border-slate-700 overflow-hidden sidebar',
        isCollapsed ? 'w-14' : '',
        isPushMode ? 'push-mode' : '',
      )}
      style={{ width: isCollapsed ? '3.5rem' : `${sidebarWidth}px` }}>
      {/* Resize Handle - only visible when not collapsed */}
      {!isCollapsed && (
        <ResizeHandle
          onResize={handleResize}
          minWidth={300}
          maxWidth={600}
          className="sidebar-resize-handle hover:bg-slate-200 dark:hover:bg-slate-700"
        />
      )}

      {/* Header - always visible */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
        {!isCollapsed ? (
          <>
            <div className="flex items-center flex-grow">
              <div className="mr-2 flex items-center">
                <Icon name="settings" className="w-6 h-6 text-slate-700 dark:text-slate-300" />
              </div>
              <Typography variant="h4" className="text-slate-900 mr-auto dark:text-slate-50">
                MCP SuperAssistant
              </Typography>
            </div>
            <div className="flex items-center space-x-1">
              {/* Theme Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleThemeToggle}
                aria-label={`Toggle theme (current: ${theme})`}
                className="hover:bg-slate-100 dark:hover:bg-slate-700">
                <Icon
                  name={getCurrentThemeIcon()}
                  size="sm"
                  className="transition-all text-slate-700 dark:text-slate-300"
                />
                <span className="sr-only">Toggle theme</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                aria-label="Collapse sidebar"
                className="hover:bg-slate-100 dark:hover:bg-slate-700">
                <Icon name="chevron-right" className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            aria-label="Expand sidebar"
            className="mx-auto hover:bg-slate-100 dark:hover:bg-slate-700">
            <Icon name="chevron-left" className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </Button>
        )}
      </div>

      {/* Content - only visible when not collapsed */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900 dark:text-slate-300">
          {/* Server Status Card */}
          <div className="p-4 space-y-3 overflow-y-auto flex-1 flex flex-col">
            <ServerStatus status={serverStatus} />

            {/* Settings */}
            <Card className="sidebar-card border-slate-200 dark:border-slate-700 dark:bg-slate-800">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Typography variant="subtitle" className="text-slate-700 dark:text-slate-300">
                    Push Content Mode
                  </Typography>
                  <ToggleWithoutLabel label="Push Content Mode" checked={isPushMode} onChange={handlePushModeToggle} />
                </div>
                <div className="flex items-center justify-between">
                  <Typography variant="subtitle" className="text-slate-700 dark:text-slate-300">
                    Auto Submit Tool Results
                  </Typography>
                  <ToggleWithoutLabel
                    label="Auto Submit Tool Results"
                    checked={autoSubmit}
                    onChange={handleAutoSubmitToggle}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Typography variant="subtitle" className="text-slate-700 dark:text-slate-300">
                    Auto Execute Detected Tools
                  </Typography>
                  <ToggleWithoutLabel
                    label="Auto Execute Detected Tools"
                    checked={autoExecute}
                    onChange={handleAutoExecuteToggle}
                  />
                </div>

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
            <div className="border-b border-slate-200 dark:border-slate-700 mb-3">
              <div className="flex">
                <button
                  className={cn(
                    'py-2 px-4 font-medium text-sm',
                    activeTab === 'detectedTools'
                      ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
                  )}
                  onClick={() => setActiveTab('detectedTools')}>
                  Detected Tools
                </button>
                <button
                  className={cn(
                    'py-2 px-4 font-medium text-sm',
                    activeTab === 'availableTools'
                      ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
                  )}
                  onClick={() => setActiveTab('availableTools')}>
                  Available Tools
                </button>
                <button
                  className={cn(
                    'py-2 px-4 font-medium text-sm',
                    activeTab === 'instructions'
                      ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
                  )}
                  onClick={() => setActiveTab('instructions')}>
                  Instructions
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {activeTab === 'availableTools' && (
                <div className="flex flex-col gap-4">
                  <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
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
              )}

              {activeTab === 'detectedTools' && (
                <div className="flex flex-col gap-4">
                  <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
                    <CardContent className="p-0">
                      <DetectedTools
                        tools={detectedTools}
                        onExecute={sendMessage}
                        onInsert={adapter.insertTextIntoInput}
                        onAttachAsFile={adapter.attachFile}
                        autoSubmit={autoSubmit}
                        autoExecute={autoExecute}
                        triggerSubmission={adapter.triggerSubmission}
                        onClearTools={handleClearTools}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'instructions' && (
                <div className="p-0">
                  <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
                    <CardContent className="p-0">
                      <InstructionManager adapter={adapter} tools={formattedTools} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Now outside the scrollable content area */}
          <div className="border-t border-slate-200 dark:border-slate-700 mt-auto">
            <InputArea
              onSubmit={async text => {
                adapter.insertTextIntoInput(text);
                // Add a delay of 300ms before triggering submission
                await new Promise(resolve => setTimeout(resolve, 300));
                await adapter.triggerSubmission();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
