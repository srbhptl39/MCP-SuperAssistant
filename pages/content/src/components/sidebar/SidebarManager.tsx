import type React from 'react';
import type { SiteType } from './base/BaseSidebarManager';
import { BaseSidebarManager } from './base/BaseSidebarManager';
import { logMessage } from '@src/utils/helpers';
import Sidebar from './Sidebar';
import type { UserPreferences } from '@src/types/stores';
import { useUIStore } from '@src/stores/ui.store';

// Helper function to get preferences from Zustand store
const getZustandPreferences = (): UserPreferences => {
  try {
    const zustandState = JSON.parse(localStorage.getItem('mcp-super-assistant-ui-store') || '{}');
    if (zustandState.state && zustandState.state.preferences) {
      return zustandState.state.preferences;
    }
  } catch (error) {
    logMessage(`[SidebarManager] Error reading Zustand store: ${error}`);
  }
  
  // Return default preferences
  return {
    autoSubmit: false,
    autoInsert: false,
    autoExecute: false,
    notifications: true,
    theme: 'system',
    language: navigator.language || 'en-US',
    isPushMode: false,
    sidebarWidth: 320,
    isMinimized: false,
    customInstructions: '',
    customInstructionsEnabled: false,
  };
};

// Declare a global Window interface extension to include activeSidebarManager property
declare global {
  interface Window {
    activeSidebarManager?: SidebarManager;
  }
}

/**
 * SidebarManager is a concrete implementation of BaseSidebarManager
 * that can be used for both Perplexity and ChatGPT.
 */
export class SidebarManager extends BaseSidebarManager {
  private static perplexityInstance: SidebarManager | null = null;
  private static chatgptInstance: SidebarManager | null = null;
  private static grokInstance: SidebarManager | null = null;
  private static geminiInstance: SidebarManager | null = null;
  private static aistudioInstance: SidebarManager | null = null;
  private static openrouterInstance: SidebarManager | null = null;
  private static deepseekInstance: SidebarManager | null = null;
  private static kagiInstance: SidebarManager | null = null;
  private static t3chatInstance: SidebarManager | null = null;
  private lastToolOutputsHash: string = '';
  private lastMcpToolsHash: string = '';
  private isFirstLoad: boolean = true;
  private isRendering: boolean = false; // CRITICAL FIX: Prevent multiple concurrent renders
  private lastRenderTime: number = 0; // CRITICAL FIX: Throttle renders
  private isInitializing: boolean = false; // CRITICAL FIX: Prevent multiple simultaneous initializations
  private initializationTimeout: NodeJS.Timeout | null = null; // Debounce initialization

  private constructor(siteType: SiteType) {
    super(siteType);

    // Store reference to current instance in window for external access
    window.activeSidebarManager = this;

    // Add event listeners
    // window.addEventListener('mcpToolsUpdated', this.handleToolsUpdated);

    // // Add a periodic refresh to catch any updates that might be missed
    // this.refreshInterval = setInterval(() => {
    //   if (this._isVisible) {
    //     this.refreshContent();
    //   }
    // }, 5000);
  }

  /**
   * Get the singleton instance of the SidebarManager for the specified site
   */
  public static getInstance(siteType: SiteType): SidebarManager {
    switch (siteType) {
      case 'perplexity':
        if (!SidebarManager.perplexityInstance) {
          SidebarManager.perplexityInstance = new SidebarManager(siteType);
        }
        return SidebarManager.perplexityInstance;
      case 'aistudio':
        if (!SidebarManager.aistudioInstance) {
          SidebarManager.aistudioInstance = new SidebarManager(siteType);
        }
        return SidebarManager.aistudioInstance;
      case 'chatgpt':
        if (!SidebarManager.chatgptInstance) {
          SidebarManager.chatgptInstance = new SidebarManager(siteType);
        }
        return SidebarManager.chatgptInstance;
      case 'grok':
        if (!SidebarManager.grokInstance) {
          SidebarManager.grokInstance = new SidebarManager(siteType);
        }
        return SidebarManager.grokInstance;
      case 'gemini':
        if (!SidebarManager.geminiInstance) {
          SidebarManager.geminiInstance = new SidebarManager(siteType);
        }
        return SidebarManager.geminiInstance;
      case 'openrouter':
        if (!SidebarManager.openrouterInstance) {
          SidebarManager.openrouterInstance = new SidebarManager(siteType);
        }
        return SidebarManager.openrouterInstance;
      case 'deepseek':
        if (!SidebarManager.deepseekInstance) {
          SidebarManager.deepseekInstance = new SidebarManager(siteType);
        }
        return SidebarManager.deepseekInstance;
      case 'kagi':
        if (!SidebarManager.kagiInstance) {
          SidebarManager.kagiInstance = new SidebarManager(siteType);
        }
        return SidebarManager.kagiInstance;
      case 't3chat':
        if (!SidebarManager.t3chatInstance) {
          SidebarManager.t3chatInstance = new SidebarManager(siteType);
        }
        return SidebarManager.t3chatInstance;
      default:
        // For any unexpected site type, create and return a new instance
        logMessage(`Creating new SidebarManager for unknown site type: ${siteType}`);
        return new SidebarManager(siteType);
    }
  }

  /**
   * Override show method to ensure preferences are loaded before rendering
   */
  public async show(): Promise<void> {
    // CRITICAL FIX: Always ensure window reference is set before showing
    if (!window.activeSidebarManager || window.activeSidebarManager !== this) {
      logMessage('[SidebarManager] Ensuring window.activeSidebarManager reference is set during show()');
      window.activeSidebarManager = this;
    }

    // CRITICAL FIX: Always load preferences from Zustand store before showing sidebar
    logMessage('[SidebarManager] Loading preferences from Zustand store before show()');
    try {
      const userPreferences = getZustandPreferences();
      logMessage(`[SidebarManager] Loaded Zustand preferences for show(): ${JSON.stringify(userPreferences)}`);

      // Set the data-initial-minimized attribute based on loaded preferences
      await this.initialize(); // Ensure initialized
      if (this.shadowHost) {
        const wasMinimized = userPreferences.isMinimized ?? false;
        this.shadowHost.setAttribute('data-initial-minimized', wasMinimized ? 'true' : 'false');
        logMessage(`[SidebarManager] Set data-initial-minimized to '${wasMinimized ? 'true' : 'false'}'`);
      }

      // CRITICAL FIX: Sync Zustand store with actual visibility state when showing
      this.syncZustandVisibilityState(true);
    } catch (error) {
      logMessage(
        `[SidebarManager] Error loading Zustand preferences in show(): ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue with default preferences and let Sidebar component handle it
    }

    // Now call the parent show method which will render with proper preferences
    return super.show();
  }

  /**
   * Create sidebar content
   */
  protected createSidebarContent(): React.ReactNode {
    // Always get fresh preferences from Zustand store
    const userPreferences = getZustandPreferences();
    logMessage('[SidebarManager] Creating sidebar content with fresh Zustand preferences');

    return <Sidebar initialPreferences={userPreferences} />;
  }

  /**
   * Show the sidebar with tool outputs - Using Zustand store for preferences
   */
  public showWithToolOutputs(): void {
    // CRITICAL FIX: Ensure window reference is set immediately
    if (!window.activeSidebarManager || window.activeSidebarManager !== this) {
      logMessage('[SidebarManager] Ensuring window.activeSidebarManager reference is set in showWithToolOutputs()');
      window.activeSidebarManager = this;
    }

    // CRITICAL FIX: Prevent multiple simultaneous initializations
    if (this.isInitializing) {
      logMessage('[SidebarManager] Already initializing, skipping duplicate call');
      return;
    }

    // CRITICAL FIX: Debounce initialization to prevent race conditions
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }

    this.isInitializing = true;

    // Add delay to ensure host website has fully loaded and won't interfere
    logMessage('[SidebarManager] Scheduling sidebar initialization with 500ms delay');

    this.initializationTimeout = setTimeout(async () => {
      try {
        logMessage('[SidebarManager] Starting delayed sidebar initialization');

        // Verify window reference is still set after delay
        if (!window.activeSidebarManager || window.activeSidebarManager !== this) {
          logMessage('[SidebarManager] Re-setting window.activeSidebarManager reference after delay');
          window.activeSidebarManager = this;
        }

        // Check if MCP is enabled from persistent state before showing sidebar
        const zustandState = JSON.parse(localStorage.getItem('mcp-super-assistant-ui-store') || '{}');
        const mcpEnabled = zustandState.state?.mcpEnabled ?? false;
        
        logMessage(`[SidebarManager] MCP enabled from persisted state: ${mcpEnabled}`);
        
        if (mcpEnabled) {
          // MCP is enabled, so show the sidebar
          logMessage('[SidebarManager] MCP is enabled, showing sidebar');
          // Initialize with collapsed state to restore preferences including push mode
          await this.initializeCollapsedStateWithErrorHandling();
          logMessage('[SidebarManager] Sidebar shown successfully with preferences restored');
        } else {
          // MCP is disabled, ensure sidebar is hidden but still initialize for later use
          logMessage('[SidebarManager] MCP is disabled, initializing sidebar but keeping it hidden');
          // Initialize without showing the sidebar
          await this.safeInitialize();
          // Keep sidebar hidden
          if (this.shadowHost) {
            this.shadowHost.style.display = 'none';
            this.shadowHost.style.opacity = '0';
            this._isVisible = false;
          }
          logMessage('[SidebarManager] Sidebar initialized but kept hidden due to MCP being disabled');
        }
      } catch (error) {
        logMessage(
          `[SidebarManager] Error during initialization: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fallback to basic show method with error handling
        await this.fallbackInitialization();
      } finally {
        // Always mark initialization as complete
        this.isInitializing = false;
        this.isFirstLoad = false;
        this.initializationTimeout = null;
      }
    }, 500);
  }

  /**
   * Get initialization status
   * @returns Whether the sidebar has been initialized
   */
  public getIsInitialized(): boolean {
    return !this.isFirstLoad;
  }

  /**
   * Initialize the sidebar in collapsed state on first load,
   * then expand it if previously expanded
   */
  private async initializeCollapsedState(): Promise<void> {
    this.isFirstLoad = false;

    // CRITICAL FIX: Ensure window reference is set before initialization
    if (!window.activeSidebarManager || window.activeSidebarManager !== this) {
      logMessage('[SidebarManager] Ensuring window.activeSidebarManager reference is set in initializeCollapsedState()');
      window.activeSidebarManager = this;
    }

    // Initialize the sidebar DOM without rendering React yet
    await this.initialize();

    try {
      // Get preferences from Zustand store
      const preferences = getZustandPreferences();
      const wasMinimized = preferences.isMinimized ?? false;
      const isPushMode = preferences.isPushMode ?? false;
      const sidebarWidth = preferences.sidebarWidth || 320;

      logMessage(
        `[SidebarManager] Using Zustand preferences for initialization: minimized=${wasMinimized}, pushMode=${isPushMode}, width=${sidebarWidth}`,
      );

      // Set ALL attributes and styles BEFORE making sidebar visible and rendering React
      if (this.shadowHost) {
        // Set initial state attributes FIRST - this is what React will read
        if (wasMinimized) {
          this.shadowHost.setAttribute('data-initial-minimized', 'true');
          // Force immediate width for minimized state
          this.shadowHost.style.width = '56px';
        } else {
          // Ensure the attribute is explicitly set to false for expanded state
          this.shadowHost.setAttribute('data-initial-minimized', 'false');
        }

        // Make sidebar visible
        this.shadowHost.style.display = 'block';
        this.shadowHost.style.opacity = '1';
        this.shadowHost.classList.add('initialized');
      }
      this._isVisible = true;

      // CRITICAL FIX: Sync Zustand store with actual visibility state
      this.syncZustandVisibilityState(true);

      // Set push content mode with appropriate width immediately
      if (isPushMode) {
        const initialWidth = wasMinimized ? 56 : sidebarWidth;
        this.setPushContentMode(true, initialWidth, wasMinimized);

        // Verify push mode was applied correctly and retry if needed
        this.verifyAndRetryPushMode(initialWidth, wasMinimized);
      }

      // Render React component with all setup complete
      setTimeout(() => {
        // CRITICAL FIX: Final verification of window reference before React render
        if (!window.activeSidebarManager || window.activeSidebarManager !== this) {
          logMessage('[SidebarManager] Final check: Re-setting window.activeSidebarManager reference before React render');
          window.activeSidebarManager = this;
        }
        
        logMessage('[SidebarManager] Rendering React component with all initial state ready');
        this.render();

        // Mark as fully initialized
        logMessage(`[SidebarManager] Sidebar fully initialized: minimized=${wasMinimized}, pushMode=${isPushMode}`);
      }, 20);
    } catch (error) {
      logMessage(
        `[SidebarManager] Error during initialization: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback initialization
      await this.initialize();
      if (this.shadowHost) {
        this.shadowHost.setAttribute('data-initial-minimized', 'false');
        this.shadowHost.style.display = 'block';
        this.shadowHost.style.opacity = '1';
        this.shadowHost.classList.add('initialized');
        this._isVisible = true;

        this.render();
        logMessage('[SidebarManager] Fallback initialization completed');
      }
    }
  }

  /**
   * Initialize the sidebar in collapsed state with comprehensive error handling
   */
  private async initializeCollapsedStateWithErrorHandling(): Promise<void> {
    try {
      await this.initializeCollapsedState();
    } catch (error) {
      logMessage(
        `[SidebarManager] Error in initializeCollapsedState: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback to basic initialization
      await this.fallbackInitialization();
    }
  }

  /**
   * Safe initialization that won't throw errors
   */
  private async safeInitialize(): Promise<void> {
    try {
      await this.initialize();
    } catch (error) {
      logMessage(
        `[SidebarManager] Error in safeInitialize: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue without throwing - just log the error
    }
  }

  /**
   * Fallback initialization when normal initialization fails
   */
  private async fallbackInitialization(): Promise<void> {
    try {
      await this.initialize();
      if (this.shadowHost) {
        this.shadowHost.setAttribute('data-initial-minimized', 'false');
        this.shadowHost.style.display = 'block';
        this.shadowHost.style.opacity = '1';
        this.shadowHost.classList.add('initialized');
        this._isVisible = true;

        // Sync Zustand store with actual visibility state
        this.syncZustandVisibilityState(true);

        // Single render call with error protection
        setTimeout(() => {
          try {
            this.render();
            logMessage('[SidebarManager] Fallback initialization completed');
          } catch (renderError) {
            logMessage(
              `[SidebarManager] Fallback render failed: ${renderError instanceof Error ? renderError.message : String(renderError)}`,
            );
          }
        }, 50);
      }
    } catch (error) {
      logMessage(
        `[SidebarManager] Even fallback initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verify that push mode has been applied correctly and retry if needed
   * @param width The expected sidebar width
   * @param isCollapsed Whether the sidebar should be in collapsed state
   */
  private verifyAndRetryPushMode(width: number, isCollapsed: boolean): void {
    // Check if push mode styles are actually applied
    const hasClass = document.documentElement.classList.contains('push-mode-enabled');
    const hasMargin = document.documentElement.style.marginRight !== '';
    const hasWidth = document.documentElement.style.width !== '';

    const isPushModeApplied = hasClass && hasMargin && hasWidth;

    // Also check computed styles to see if they match what we set
    const computedStyle = window.getComputedStyle(document.documentElement);
    const computedMarginRight = computedStyle.marginRight;
    const expectedMargin = `${width}px`;
    const marginApplied = computedMarginRight === expectedMargin;

    if (!isPushModeApplied || !marginApplied) {
      logMessage(`[SidebarManager] Push mode verification failed. Applied: ${isPushModeApplied}, Margin correct: ${marginApplied} (expected: ${expectedMargin}, got: ${computedMarginRight})`);

      if (!marginApplied) {
        // If margin-based approach isn't working, try transform-based approach
        logMessage('[SidebarManager] Falling back to transform-based push mode');
        document.documentElement.classList.add('push-mode-transform');
        document.documentElement.style.setProperty('transform', `translateX(-${width}px)`, 'important');
      }

      // Retry applying push mode after a short delay
      setTimeout(() => {
        this.setPushContentMode(true, width, isCollapsed);

        // Verify again after retry
        setTimeout(() => {
          const retryHasClass = document.documentElement.classList.contains('push-mode-enabled');
          const retryHasMargin = document.documentElement.style.marginRight !== '';
          const retryHasWidth = document.documentElement.style.width !== '';
          const retryComputedStyle = window.getComputedStyle(document.documentElement);
          const retryMarginApplied = retryComputedStyle.marginRight === expectedMargin || 
                                    retryComputedStyle.transform.includes('translateX');

          if (retryHasClass && (retryHasMargin || retryMarginApplied)) {
            logMessage('[SidebarManager] Push mode successfully applied after retry');
          } else {
            logMessage('[SidebarManager] Push mode still failed after retry - website may be interfering');
            logMessage(`[SidebarManager] Final state - margin-right: ${retryComputedStyle.marginRight}, transform: ${retryComputedStyle.transform}`);
          }
        }, 100);
      }, 50);
    } else {
      logMessage('[SidebarManager] Push mode verification successful');
    }
  }

  /**
   * Refresh the sidebar content
   * OPTIMIZATION: Instead of re-rendering the entire React tree, use React's
   * built-in state management and data flow to update content
   */
  public refreshContent(): void {
    logMessage('[SidebarManager] Content refresh requested - relying on React state updates instead of full re-render');

    // REMOVED: Direct render() call that destroys and recreates the entire component tree
    // this.render();

    // The sidebar content will automatically update through:
    // 1. Background communication hooks that manage state
    // 2. Component re-renders triggered by state changes
    // 3. useEffect hooks that respond to data changes

    // If a full re-render is absolutely necessary (rare), it should be done
    // through specific state updates in the React component, not here

    // Optional: Trigger a custom event that components can listen to
    if (this.shadowHost) {
      const refreshEvent = new CustomEvent('mcpSidebarRefresh', {
        detail: { timestamp: Date.now() },
      });
      this.shadowHost.dispatchEvent(refreshEvent);
    }
  }

  /**
   * Override render method to prevent multiple concurrent renders
   */
  protected render(): void {
    const now = Date.now();

    // CRITICAL FIX: Prevent multiple renders in quick succession
    if (this.isRendering) {
      logMessage('[SidebarManager] BLOCKED: Render already in progress, skipping duplicate render');
      return;
    }

    // CRITICAL FIX: Throttle renders to at most once every 100ms
    if (now - this.lastRenderTime < 100) {
      logMessage('[SidebarManager] BLOCKED: Render throttled, too soon since last render');
      return;
    }

    this.isRendering = true;
    this.lastRenderTime = now;

    try {
      logMessage('[SidebarManager] Starting protected render');
      super.render();
      logMessage('[SidebarManager] Protected render completed successfully');
    } catch (error) {
      logMessage(
        `[SidebarManager] Error in protected render: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Allow future renders after a brief delay
      setTimeout(() => {
        this.isRendering = false;
      }, 50);
    }
  }

  /**
   * Sync Zustand store visibility state with SidebarManager internal state
   * @param isVisible Whether the sidebar should be visible
   */
  private syncZustandVisibilityState(isVisible: boolean): void {
    try {
      // Use the proper Zustand action to update visibility
      const store = useUIStore.getState();
      store.setSidebarVisibility(isVisible, 'sidebar-manager-sync');
      logMessage(`[SidebarManager] Synced Zustand visibility state to: ${isVisible}`);
    } catch (error) {
      logMessage(`[SidebarManager] Error syncing Zustand visibility state: ${error}`);
      
      // Fallback to direct localStorage manipulation if store access fails
      try {
        const zustandState = JSON.parse(localStorage.getItem('mcp-super-assistant-ui-store') || '{}');
        if (zustandState.state && zustandState.state.sidebar) {
          zustandState.state.sidebar.isVisible = isVisible;
          localStorage.setItem('mcp-super-assistant-ui-store', JSON.stringify(zustandState));
          logMessage(`[SidebarManager] Fallback: Synced Zustand visibility state to: ${isVisible}`);
        } else {
          logMessage('[SidebarManager] Could not find Zustand sidebar state to update');
        }
      } catch (fallbackError) {
        logMessage(`[SidebarManager] Fallback sync also failed: ${fallbackError}`);
      }
    }
  }

  /**
   * Destroy the sidebar manager
   * Override the parent destroy method to also remove the window reference and clear singleton
   */
  public destroy(): void {
    // Remove the window reference
    if (window.activeSidebarManager === this) {
      window.activeSidebarManager = undefined;
    }

    // Clear the appropriate singleton instance
    switch (this.siteType) {
      case 'perplexity':
        if (SidebarManager.perplexityInstance === this) {
          SidebarManager.perplexityInstance = null;
        }
        break;
      case 'chatgpt':
        if (SidebarManager.chatgptInstance === this) {
          SidebarManager.chatgptInstance = null;
        }
        break;
      case 'grok':
        if (SidebarManager.grokInstance === this) {
          SidebarManager.grokInstance = null;
        }
        break;
      case 'gemini':
        if (SidebarManager.geminiInstance === this) {
          SidebarManager.geminiInstance = null;
        }
        break;
      case 'aistudio':
        if (SidebarManager.aistudioInstance === this) {
          SidebarManager.aistudioInstance = null;
        }
        break;
      case 'openrouter':
        if (SidebarManager.openrouterInstance === this) {
          SidebarManager.openrouterInstance = null;
        }
        break;
      case 'deepseek':
        if (SidebarManager.deepseekInstance === this) {
          SidebarManager.deepseekInstance = null;
        }
        break;
      case 'kagi':
        if (SidebarManager.kagiInstance === this) {
          SidebarManager.kagiInstance = null;
        }
        break;
      case 't3chat':
        if (SidebarManager.t3chatInstance === this) {
          SidebarManager.t3chatInstance = null;
        }
        break;
    }

    logMessage(`[SidebarManager] Destroyed sidebar manager for site type: ${this.siteType}`);

    // Call the parent destroy method
    super.destroy();
  }

  /**
   * Check if this is a navigation-based cleanup (should preserve sidebar) vs actual destroy
   */
  private isNavigationEvent(): boolean {
    // If we're on a supported site and the URL is still valid, this is likely navigation
    return window.location.hostname === 'gemini.google.com' && 
           window.location.href.includes('/app');
  }

  /**
   * Safe destroy that checks if this is navigation vs actual cleanup
   */
  public safeDestroy(): void {
    if (this.isNavigationEvent()) {
      logMessage(`[SidebarManager] Skipping destroy during navigation for ${this.siteType}`);
      return;
    }
    
    logMessage(`[SidebarManager] Performing actual destroy for ${this.siteType}`);
    this.destroy();
  }

  /**
   * Override hide method to sync Zustand store visibility state
   */
  public async hide(): Promise<void> {
    // Sync Zustand store with actual visibility state when hiding
    this.syncZustandVisibilityState(false);
    
    // Call the parent hide method
    return super.hide();
  }
}
