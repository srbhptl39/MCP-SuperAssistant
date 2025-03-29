/**
 * Base Site Adapter
 *
 * This file implements a base adapter class with common functionality
 * that can be extended by site-specific adapters.
 */

import type { SiteAdapter, ToolDetector } from '../../utils/siteAdapter';
import { logMessage } from '../../utils/helpers';
import { clearTrackedElements, getTrackedElementCount } from '../../utils/elementTracker';
import type { SimpleToolDetector } from '../../utils/toolDetector';
import { createToolDetector } from '../../utils/toolDetector';
import { SidebarManager } from '../../components/sidebar';

export abstract class BaseAdapter implements SiteAdapter {
  abstract name: string;
  abstract hostname: string | string[];
  urlPatterns?: RegExp[];
  protected sidebarManager: any = null;
  protected toolDetector: SimpleToolDetector = createToolDetector();

  // Abstract methods that must be implemented by site-specific adapters
  protected abstract initializeSidebarManager(): void;
  protected abstract initializeObserver(forceReset?: boolean): void;
  protected abstract clearProcessedData(): void;
  protected abstract getProcessedToolOutputs(): any[];
  protected abstract getProcessedMarkdownContents(): any[];

  // Abstract methods for text insertion and form submission
  abstract insertTextIntoInput(text: string): void;
  abstract triggerSubmission(): void;

  // Default implementation for getToolCommandElements
  // Site-specific adapters should override this with more targeted logic
  getToolCommandElements(root: Element = document.body): Element[] {
    // Default implementation looks for pre and code elements which often contain tool commands
    const preElements = Array.from(root.querySelectorAll('pre'));
    const codeElements = Array.from(root.querySelectorAll('code'));

    // Combine and return unique elements
    const elements = [...preElements, ...codeElements];

    // Log the found elements
    if (elements.length > 0) {
      logMessage(`Default getToolCommandElements found ${elements.length} potential elements in ${this.name}`);
    }

    return elements;
  }

  initialize(): void {
    logMessage(`Initializing ${this.name} adapter`);

    // Clear any existing data to start fresh
    this.clearProcessedData();
    clearTrackedElements();
    logMessage('Cleared all existing data for fresh start');

    // Initialize the unified observer
    logMessage(`Initializing unified observer for ${this.name} elements`);
    this.initializeObserver(true);

    // Initialize the sidebar manager
    this.initializeSidebarManager();
    logMessage(`${this.name} sidebar manager initialized`);

    // Log the initial state after a short delay
    setTimeout(() => {
      const toolOutputs = this.getProcessedToolOutputs();
      const mcpTools = this.getProcessedMarkdownContents().filter(c => c.mcpToolContents);

      logMessage(`Currently tracking ${getTrackedElementCount()} elements`);
      logMessage(`Processed ${toolOutputs.length} tool outputs and ${mcpTools.length} MCP tools`);

      // Log DOM indices for debugging
      if (mcpTools.length > 0) {
        logMessage(`MCP Tools DOM indices: ${mcpTools.map(c => c.domIndex || -1).join(', ')}`);
      }
      if (toolOutputs.length > 0) {
        logMessage(`Tool Outputs DOM indices: ${toolOutputs.map(o => o.domIndex).join(', ')}`);
      }

      // Show the sidebar with tool outputs instead of default card
      this.showSidebarWithToolOutputs();
    }, 2000);
  }

  cleanup(): void {
    logMessage(`Cleaning up ${this.name} adapter`);
    this.clearProcessedData();
    clearTrackedElements();

    if (this.sidebarManager) {
      this.sidebarManager.destroy();
      this.sidebarManager = null;
    }

    // Disconnect the tool detector
    this.toolDetector.disconnect();
  }

  forceRescan(): void {
    logMessage(`Forcing rescan of ${this.name} elements`);
    this.initializeObserver(true);

    // After rescanning, update the sidebar with the latest tool outputs
    setTimeout(() => {
      this.showSidebarWithToolOutputs();
    }, 1000);
  }

  /**
   * Show the sidebar with tool outputs
   */
  showSidebarWithToolOutputs(): void {
    if (this.sidebarManager) {
      this.sidebarManager.showWithToolOutputs();
      logMessage('Showing sidebar with tool outputs');
    }
  }

  toggleSidebar(): void {
    if (this.sidebarManager) {
      if (this.sidebarManager.getIsVisible()) {
        this.sidebarManager.hide();
      } else {
        this.sidebarManager.showWithToolOutputs();
        logMessage('Showing sidebar with tool outputs');
      }
    }
  }

  updateConnectionStatus(isConnected: boolean): void {
    logMessage(`Updating ${this.name} connection status: ${isConnected}`);
    // Implement connection status update if needed
    // if (this.overlayManager) {
    //   this.overlayManager.updateConnectionStatus(isConnected);
    // }
  }

  /**
   * Get the tool detector for this adapter
   * @returns A tool detector that can be used to detect MCP tools
   */
  getToolDetector(): ToolDetector {
    return this.toolDetector;
  }

  /**
   * Force refresh the sidebar content
   * This can be called to manually refresh the sidebar when needed
   */
  refreshSidebarContent(): void {
    logMessage(`Forcing sidebar content refresh for ${this.name}`);
    if (this.sidebarManager) {
      this.sidebarManager.refreshContent();
      logMessage('Sidebar content refreshed');
    }
  }

  /**
   * Check if the site supports file upload
   * Default implementation returns false, override in site-specific adapters if supported
   */
  supportsFileUpload(): boolean {
    return false;
  }

  /**
   * Attach a file to the chat input
   * Default implementation returns a rejected promise, override in site-specific adapters if supported
   * @param file The file to attach
   */
  async attachFile(file: File): Promise<boolean> {
    logMessage(`File attachment not supported for ${this.name}`);
    return Promise.resolve(false);
  }
}
