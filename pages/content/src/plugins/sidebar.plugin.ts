import type { AdapterPlugin, PluginContext, AdapterCapability } from './plugin-types';
import { SidebarManager } from '../components/sidebar/SidebarManager';
import type { SiteType } from '../components/sidebar/base/BaseSidebarManager';
import { useUIStore } from '../stores/ui.store';

/**
 * SidebarPlugin - Manages the sidebar as a plugin in the new architecture
 * 
 * This plugin:
 * - Automatically shows the sidebar when the page loads
 * - Integrates with Zustand stores and event system
 * - Manages sidebar lifecycle independently of site adapters
 * - Provides backward compatibility with legacy adapter system
 */
export class SidebarPlugin implements AdapterPlugin {
  readonly name = 'sidebar-plugin';
  readonly version = '1.0.0';
  readonly hostnames = [/.*/]; // Match all hostnames - sidebar is universal
  readonly capabilities: AdapterCapability[] = ['dom-manipulation'];

  private context: PluginContext | null = null;
  private sidebarManager: SidebarManager | null = null;
  private isActive = false;
  private cleanupFunctions: (() => void)[] = [];
  private isShowingSidebar = false; // Track sidebar state to prevent loops

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    
    context.logger.debug('[SidebarPlugin] Initializing sidebar plugin...');
    
    // Set up event listeners for sidebar management
    this.setupEventListeners();
    
    context.logger.debug('[SidebarPlugin] Sidebar plugin initialized successfully');
  }

  async activate(): Promise<void> {
    if (this.isActive) {
      this.context?.logger.warn('[SidebarPlugin] Plugin already active');
      return;
    }

    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    // Handle all GitHub domains
    if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
      // Only support GitHub Copilot pages
      if (!pathname.startsWith('/copilot')) {
        this.context?.logger.debug(`[SidebarPlugin] Skipping activation on GitHub page: ${pathname}`);
        return;
      }
    }

    this.context?.logger.debug('[SidebarPlugin] Activating sidebar plugin...');

    try {
      // Initialize sidebar manager for current site
      await this.initializeSidebarManager();
      
      // Show sidebar automatically on activation
      await this.showSidebar();
      
      this.isActive = true;
      this.context?.logger.debug('[SidebarPlugin] Sidebar plugin activated successfully');
      
      // Emit activation event
      this.context?.eventBus.emit('plugin:activated', {
        pluginName: this.name,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.context?.logger.error('[SidebarPlugin] Failed to activate:', error);
      throw error;
    }
  }

  async deactivate(): Promise<void> {
    if (!this.isActive) {
      this.context?.logger.warn('[SidebarPlugin] Plugin not active');
      return;
    }

    this.context?.logger.debug('[SidebarPlugin] Deactivating sidebar plugin...');

    try {
      // Hide sidebar
      this.hideSidebar();

      // Reset state
      this.isActive = false;
      this.isShowingSidebar = false;

      this.context?.logger.debug('[SidebarPlugin] Sidebar plugin deactivated successfully');

    } catch (error) {
      this.context?.logger.error('[SidebarPlugin] Error during deactivation:', error);
    }
  }

  async cleanup(): Promise<void> {
    this.context?.logger.debug('[SidebarPlugin] Cleaning up sidebar plugin...');

    try {
      // Deactivate if still active
      if (this.isActive) {
        await this.deactivate();
      }

      // Clean up sidebar manager
      if (this.sidebarManager) {
        this.sidebarManager.destroy();
        this.sidebarManager = null;
      }

      // Run cleanup functions
      this.cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          this.context?.logger.error('[SidebarPlugin] Error in cleanup function:', error);
        }
      });
      this.cleanupFunctions = [];

      // Reset all state
      this.isActive = false;
      this.isShowingSidebar = false;

      this.context?.logger.debug('[SidebarPlugin] Sidebar plugin cleanup completed');

    } catch (error) {
      this.context?.logger.error('[SidebarPlugin] Error during cleanup:', error);
    }
  }

  isSupported(): boolean {
    // Sidebar is supported on all sites
    return true;
  }

  getStatus(): 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending' {
    if (!this.context) return 'pending';
    if (this.isActive) return 'active';
    return 'inactive';
  }

  // Plugin-specific methods

  /**
   * Show the sidebar
   */
  async showSidebar(): Promise<void> {
    // Prevent infinite loops
    if (this.isShowingSidebar) {
      this.context?.logger.warn('[SidebarPlugin] Sidebar already showing, skipping to prevent loop');
      return;
    }

    if (!this.sidebarManager) {
      await this.initializeSidebarManager();
    }

    if (this.sidebarManager) {
      this.context?.logger.debug('[SidebarPlugin] Showing sidebar...');

      // Set flag to prevent loops
      this.isShowingSidebar = true;

      try {
        // Show sidebar with tool outputs (includes preferences loading)
        this.sidebarManager.showWithToolOutputs();

        // Update UI store to reflect sidebar visibility (without emitting event)
        useUIStore.setState(state => ({
          sidebar: { ...state.sidebar, isVisible: true }
        }));

        this.context?.logger.debug('[SidebarPlugin] Sidebar shown successfully');
      } catch (error) {
        this.context?.logger.error('[SidebarPlugin] Error showing sidebar:', error);
        this.isShowingSidebar = false; // Reset flag on error
        throw error;
      }
    }
  }

  /**
   * Hide the sidebar
   */
  hideSidebar(): void {
    if (this.sidebarManager) {
      this.context?.logger.debug('[SidebarPlugin] Hiding sidebar...');

      // Reset showing flag
      this.isShowingSidebar = false;

      // Hide sidebar
      this.sidebarManager.hide();

      // Update UI store to reflect sidebar visibility (without emitting event)
      useUIStore.setState(state => ({
        sidebar: { ...state.sidebar, isVisible: false }
      }));

      this.context?.logger.debug('[SidebarPlugin] Sidebar hidden successfully');
    }
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar(): void {
    // Use our internal state to determine visibility to avoid store dependency
    if (this.isShowingSidebar) {
      this.hideSidebar();
    } else {
      this.showSidebar();
    }
  }

  /**
   * Get sidebar manager instance
   */
  getSidebarManager(): SidebarManager | null {
    return this.sidebarManager;
  }

  // Private methods

  private async initializeSidebarManager(): Promise<void> {
    if (this.sidebarManager) {
      return; // Already initialized
    }

    try {
      this.context?.logger.debug('[SidebarPlugin] Initializing sidebar manager...');
      
      // Determine site type from current hostname
      const hostname = window.location.hostname;
      const siteType = this.determineSiteType(hostname);
      
      // Create sidebar manager instance
      this.sidebarManager = SidebarManager.getInstance(siteType);
      
      // Expose sidebar manager globally for backward compatibility
      (window as any).activeSidebarManager = this.sidebarManager;
      
      this.context?.logger.debug(`[SidebarPlugin] Sidebar manager initialized for site type: ${siteType}`);
      
    } catch (error) {
      this.context?.logger.error('[SidebarPlugin] Failed to initialize sidebar manager:', error);
      throw error;
    }
  }

  private determineSiteType(hostname: string): SiteType {
    // Map hostnames to site types (same logic as legacy adapters)
    if (hostname.includes('perplexity.ai')) return 'perplexity';
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'chatgpt';
    if (hostname.includes('x.ai') || hostname.includes('grok')) return 'grok';
    if (hostname.includes('gemini.google.com')) return 'gemini';
    if (hostname.includes('z.ai')) return 'zai';
    if (hostname.includes('aistudio.google.com')) return 'aistudio';
    if (hostname.includes('openrouter.ai')) return 'openrouter';
    if (hostname.includes('chat.deepseek.com')) return 'deepseek';
    if (hostname.includes('kagi.com')) return 'kagi';
    if (hostname.includes('t3.chat')) return 't3chat';

    // Default to perplexity for unknown sites
    return 'perplexity';
  }

  private setupEventListeners(): void {
    if (!this.context) return;

    // REMOVED: ui:sidebar-toggle listener to prevent circular dependency
    // The plugin should only respond to external events, not its own actions

    // Listen for app initialization events to auto-show sidebar
    const unsubscribeAppInit = this.context.eventBus.on('app:initialized', () => {
      this.context?.logger.debug('[SidebarPlugin] App initialized, auto-showing sidebar...');

      // Auto-show sidebar after app initialization with a small delay
      setTimeout(() => {
        if (this.isActive && !this.isShowingSidebar) {
          this.showSidebar();
        }
      }, 1000); // 1 second delay to ensure everything is ready
    });

    // Listen for site changes to reinitialize sidebar manager
    const unsubscribeSiteChange = this.context.eventBus.on('app:site-changed', async (data) => {
      this.context?.logger.debug(`[SidebarPlugin] Site changed to: ${data.hostname}`);

      // Determine if this is actually a different site or just a URL change within the same site
      const currentSiteType = this.determineSiteType(data.hostname);
      const existingSiteType = this.sidebarManager ? this.determineSiteType(window.location.hostname) : null;

      if (existingSiteType && currentSiteType === existingSiteType) {
        this.context?.logger.debug(`[SidebarPlugin] URL changed within same site (${currentSiteType}), preserving sidebar manager`);
        return; // Don't destroy and recreate for same site
      }

      this.context?.logger.debug(`[SidebarPlugin] Actual site change detected: ${existingSiteType} -> ${currentSiteType}`);

      // Reset showing state
      this.isShowingSidebar = false;

      // Cleanup existing sidebar manager only if it's a different site
      if (this.sidebarManager) {
        this.sidebarManager.destroy();
        this.sidebarManager = null;
      }

      // Reinitialize for new site
      if (this.isActive) {
        await this.initializeSidebarManager();
        await this.showSidebar();
      }
    });

    // Store cleanup functions
    this.cleanupFunctions.push(unsubscribeAppInit, unsubscribeSiteChange);
  }

  // Event handlers for backward compatibility
  onPageChanged?(url: string, oldUrl?: string): void {
    this.context?.logger.debug(`[SidebarPlugin] Page changed from ${oldUrl} to ${url}`);

    // Reinitialize sidebar manager if needed
    if (this.isActive && oldUrl && new URL(url).hostname !== new URL(oldUrl).hostname) {
      this.initializeSidebarManager().then(() => {
        this.showSidebar();
      }).catch(error => {
        this.context?.logger.error('[SidebarPlugin] Error reinitializing after page change:', error);
      });
    }
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context?.logger.debug(`[SidebarPlugin] Host changed from ${oldHost} to ${newHost}`);

    // Reinitialize sidebar manager for new host
    if (this.isActive) {
      this.initializeSidebarManager().then(() => {
        this.showSidebar();
      }).catch(error => {
        this.context?.logger.error('[SidebarPlugin] Error reinitializing after host change:', error);
      });
    }
  }
}
