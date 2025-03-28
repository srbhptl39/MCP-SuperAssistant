import React from 'react';
import { createRoot } from 'react-dom/client';
import { logMessage } from '@src/utils/helpers';
import { injectShadowDomCSS, debugShadowDomStyling, applyDarkMode, applyLightMode, injectTailwindToShadowDom } from '@src/utils/shadowDom';
import '@src/components/sidebar/styles/sidebar.css';

/**
 * Interface for the tool output handler
 */
export interface ToolOutputHandler {
  getProcessedToolOutputs: () => any[];
  getMcpToolContents: () => any[];
  insertToolResultToChatInput?: (result: string) => boolean;
}

/**
 * Type definition for the site type
 */
export type SiteType = 'perplexity' | 'chatgpt' | 'grok' | 'gemini' | 'aistudio';

/**
 * BaseSidebarManager is a base class for creating sidebar managers
 * that can be extended by specific implementations.
 */
export abstract class BaseSidebarManager {
  protected container: HTMLDivElement | null = null;
  protected root: ReturnType<typeof createRoot> | null = null;
  protected _isVisible: boolean = false;
  protected siteType: SiteType;
  protected shadowHost: HTMLDivElement | null = null;
  protected shadowRoot: ShadowRoot | null = null;
  protected _isPushContentMode: boolean = false;

  constructor(siteType: SiteType) {
    this.siteType = siteType;
  }

  /**
   * Get the Shadow DOM host element
   * @returns The shadow host element or null if not initialized
   */
  public getShadowHost(): HTMLDivElement | null {
    return this.shadowHost;
  }

  /**
   * Apply theme class to the Shadow DOM host element
   * @param theme The theme to apply: 'light', 'dark', or 'system'
   * @returns Whether the theme was successfully applied
   */
  public applyThemeClass(theme: 'light' | 'dark' | 'system'): boolean {
    if (!this.shadowHost || !this.shadowRoot) {
      logMessage('[BaseSidebarManager] Cannot apply theme: Shadow host or root not found.');
      return false;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Remove existing theme classes first
    this.shadowHost.classList.remove('light', 'dark');
    
    if (theme === 'dark' || (theme === 'system' && prefersDark)) {
      this.shadowHost.classList.add('dark');
      
      // Apply dark mode styles to the shadow root
      applyDarkMode(this.shadowRoot);
      
      logMessage(`[BaseSidebarManager] Applied dark theme (Selected: ${theme}, System Prefers Dark: ${prefersDark})`);
    } else {
      this.shadowHost.classList.add('light');
      
      // Apply light mode styles to the shadow root
      applyLightMode(this.shadowRoot);
      
      logMessage(`[BaseSidebarManager] Applied light theme (Selected: ${theme}, System Prefers Dark: ${prefersDark})`);
    }
    
    // Force a re-render to ensure theme changes are applied
    this.render();
    
    return true;
  }

  /**
   * Set push content mode
   * This is the single source of truth for push mode functionality
   * @param enabled Whether push mode should be enabled
   * @param sidebarWidth Optional width of the sidebar (for collapsed state handling)
   * @param isCollapsed Optional flag indicating if the sidebar is collapsed
   */
  public setPushContentMode(enabled: boolean, sidebarWidth?: number, isCollapsed?: boolean): void {
    this._isPushContentMode = enabled;
    
    if (enabled) {
      // Set sidebar width CSS variable
      const width = isCollapsed ? 56 : (sidebarWidth || 320);
      document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
      
      // Apply specific inline styles directly to the HTML element
      document.documentElement.style.setProperty('position', 'relative');
      document.documentElement.style.setProperty('margin-right', `${width}px`);
      document.documentElement.style.setProperty('width', `calc(100% - ${width}px)`);
      document.documentElement.style.setProperty('min-height', '100vh');
      
      // Add classes to HTML root for CSS-based layout adjustments
      document.documentElement.classList.add('push-mode-enabled');
      
      // Add collapsed state class if needed
      if (isCollapsed) {
        document.documentElement.classList.add('sidebar-collapsed');
      } else {
        document.documentElement.classList.remove('sidebar-collapsed');
      }
    } else {
      // Remove all inline styles when push mode is disabled
      document.documentElement.style.removeProperty('position');
      document.documentElement.style.removeProperty('margin-right');
      document.documentElement.style.removeProperty('width');
      document.documentElement.style.removeProperty('min-height');
      
      // Remove push mode classes when disabled
      document.documentElement.classList.remove('push-mode-enabled', 'sidebar-collapsed');
    }
    
    // Ensure push mode styles are in the document
    this.ensurePushModeStyles();
    
    logMessage(`BaseSidebarManager: Push mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Update push mode styles for resize operations
   * @param width The new width of the sidebar
   */
  public updatePushModeStyles(width: number): void {
    if (this._isPushContentMode) {
      document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
      document.documentElement.style.setProperty('margin-right', `${width}px`);
      document.documentElement.style.setProperty('width', `calc(100% - ${width}px)`);
    }
  }

  /**
   * Remove all push mode styles (used for cleanup)
   */
  public removePushModeStyles(): void {
    document.documentElement.style.removeProperty('position');
    document.documentElement.style.removeProperty('margin-right');
    document.documentElement.style.removeProperty('width');
    document.documentElement.style.removeProperty('min-height');
    document.documentElement.classList.remove('push-mode-enabled', 'sidebar-collapsed');
  }
  
  /**
   * Ensures that push mode styles are added to the document
   */
  private ensurePushModeStyles(): void {
    if (!document.getElementById('mcp-sidebar-push-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'mcp-sidebar-push-styles';
      styleEl.textContent = `
        html.push-mode-enabled {
          overflow-x: hidden;
          transition: margin-right 0.3s ease, width 0.3s ease;
        }
        
        /* Ensure fixed elements don't overlap with sidebar */
        html.push-mode-enabled .sidebar {
          right: 0;
        }

        /* Add smooth resize styles */
        .sidebar {
          transition: width 0.3s ease;
        }
        
        .sidebar.resizing {
          transition: none !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }

  /**
   * Get current push content mode state
   */
  public getPushContentMode(): boolean {
    return this._isPushContentMode;
  }

  /**
   * Get whether the sidebar is currently visible
   */
  public getIsVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Initialize the sidebar container and root within a Shadow DOM
   */
  public async initialize(): Promise<void> {
    if (this.shadowHost) {
      logMessage('Sidebar manager already initialized.');
      return;
    }

    try {
      // Create and setup the shadow host
      this.shadowHost = document.createElement('div');
      this.shadowHost.id = 'mcp-sidebar-shadow-host';
      this.shadowHost.style.position = 'fixed';
      this.shadowHost.style.top = '0';
      this.shadowHost.style.right = '0';
      this.shadowHost.style.zIndex = '9999';
      this.shadowHost.style.height = '100vh';
      this.shadowHost.style.pointerEvents = 'none';
      // Add specific attributes for Shadow DOM targeting
      this.shadowHost.setAttribute('data-shadow-host', 'true');

      document.body.appendChild(this.shadowHost);

      // Attach shadow root
      this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

      // Create container for React
      this.container = document.createElement('div');
      this.container.id = 'sidebar-container';
      this.container.style.pointerEvents = 'auto';
      this.container.style.height = '100%';
      this.container.style.width = '100%';
      this.shadowRoot.appendChild(this.container);

      // Inject CSS into Shadow DOM using our specialized utility
      try {
        await injectTailwindToShadowDom(this.shadowRoot);
      } catch (cssError) {
        console.error('Failed to inject CSS into Shadow DOM:', cssError);
        // Fallback to the old method if needed
        await injectShadowDomCSS(this.shadowRoot, 'content/index.css');
      }

      // Create React root
      this.root = createRoot(this.container);
      logMessage('Sidebar manager initialized with Shadow DOM.');
      
      // Add debug mode in development
      if (process.env.NODE_ENV === 'development') {
        // Debug the Shadow DOM styling after a short delay to ensure all styles are loaded
        setTimeout(() => {
          if (this.shadowRoot) {
            debugShadowDomStyling(this.shadowRoot);
          }
        }, 2000);
      }

      // Apply default theme based on system preference
      this.applyThemeClass('system');

    } catch (error) {
      console.error('Error initializing Sidebar manager with Shadow DOM:', error);
      logMessage(`Error initializing Sidebar manager with Shadow DOM: ${error instanceof Error ? error.message : String(error)}`);
      this.destroy();
    }
  }

  /**
   * Show the sidebar
   */
  public async show(): Promise<void> {
    if (!this.shadowHost || !this.root) {
      await this.initialize();
      if (!this.shadowHost || !this.root) {
        logMessage('Sidebar initialization failed, cannot show.');
        return;
      }
    }

    if (this.shadowHost) {
      this.shadowHost.style.display = 'block';
    }

    this._isVisible = true;
    this.render();
    logMessage('Sidebar shown');
  }

  /**
   * Hide the sidebar
   */
  public hide(): void {
    if (!this._isVisible) {
      return;
    }

    if (this.shadowHost) {
      this.shadowHost.style.display = 'none';
    }

    this._isVisible = false;
    logMessage('Sidebar hidden');
  }

  /**
   * Toggle the sidebar visibility
   */
  public toggle(): void {
    if (this._isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Render the sidebar
   */
  protected render(): void {
    if (!this.root || !this.container) {
      logMessage('Cannot render: Root or container not available.');
      return;
    }

    try {
      const sidebarContent = this.createSidebarContent();
      if (!sidebarContent) {
         logMessage('createSidebarContent returned null or undefined.');
         this.root.render(null);
      } else {
         logMessage('Rendering sidebar content into container.');
         this.root.render(sidebarContent);
      }
    } catch (error) {
       console.error('Error during React render:', error);
       logMessage(`Error during React render: ${error instanceof Error ? error.message : String(error)}`);
       this.root.render(React.createElement('div', { style: { color: 'red', padding: '10px' }}, 'Error rendering sidebar content.'));
    }
  }

  /**
   * Create sidebar content
   * This should be implemented by subclasses
   */
  protected abstract createSidebarContent(): React.ReactNode;

  /**
   * Destroy the sidebar manager
   */
  public destroy(): void {
    window.removeEventListener('mcpToolsUpdated', this.handleToolsUpdated);

    // Ensure all push mode styles are removed
    this.removePushModeStyles();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.root) {
      try {
        this.root.unmount();
      } catch (error) {
        console.error('Error unmounting React root:', error);
      }
      this.root = null;
    }

    if (this.shadowHost && this.shadowHost.parentNode) {
      try {
        this.shadowHost.parentNode.removeChild(this.shadowHost);
      } catch (error) {
        console.error('Error removing shadow host from DOM:', error);
      }
    }

    this.shadowHost = null;
    this.shadowRoot = null;
    this.container = null;
    this._isVisible = false;

    logMessage('Sidebar manager destroyed');
  }

  /**
   * Handle tools updated event
   */
  protected handleToolsUpdated = (): void => {
    if (this._isVisible) {
      this.refreshContent();
    }
  };

  /**
   * Refresh interval for periodic updates
   */
  protected refreshInterval: NodeJS.Timeout | null = null;

  /**
   * Refresh the sidebar content
   * This should be implemented by subclasses
   */
  public abstract refreshContent(): void;

  /**
   * Show the sidebar with tool outputs
   * This should be implemented by subclasses
   */
  public abstract showWithToolOutputs(): void;
}
