import type React from 'react';
import type { SiteType, ToolOutputHandler } from './base/BaseSidebarManager';
import { BaseSidebarManager } from './base/BaseSidebarManager';
import { logMessage } from '@src/utils/helpers';
import Sidebar from './Sidebar';

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
  private toolOutputHandler: ToolOutputHandler;
  private lastToolOutputsHash: string = '';
  private lastMcpToolsHash: string = '';

  private constructor(siteType: SiteType, toolOutputHandler: ToolOutputHandler) {
    super(siteType);

    this.toolOutputHandler = toolOutputHandler;

    // Store reference to current instance in window for external access
    window.activeSidebarManager = this;

    // Add event listeners
    window.addEventListener('mcpToolsUpdated', this.handleToolsUpdated);

    // Add a periodic refresh to catch any updates that might be missed
    this.refreshInterval = setInterval(() => {
      if (this._isVisible) {
        this.refreshContent();
      }
    }, 5000);
  }

  /**
   * Get the singleton instance of the SidebarManager for the specified site
   */
  public static getInstance(siteType: SiteType, toolOutputHandler: ToolOutputHandler): SidebarManager {
    switch (siteType) {
      case 'perplexity':
        if (!SidebarManager.perplexityInstance) {
          SidebarManager.perplexityInstance = new SidebarManager(siteType, toolOutputHandler);
        }
        return SidebarManager.perplexityInstance;
      case 'aistudio':
        if (!SidebarManager.aistudioInstance) {
          SidebarManager.aistudioInstance = new SidebarManager(siteType, toolOutputHandler);
        }
        return SidebarManager.aistudioInstance;
      case 'chatgpt':
        if (!SidebarManager.chatgptInstance) {
          SidebarManager.chatgptInstance = new SidebarManager(siteType, toolOutputHandler);
        }
        return SidebarManager.chatgptInstance;
      case 'grok':
        if (!SidebarManager.grokInstance) {
          SidebarManager.grokInstance = new SidebarManager(siteType, toolOutputHandler);
        }
        return SidebarManager.grokInstance;
      case 'gemini':
        if (!SidebarManager.geminiInstance) {
          SidebarManager.geminiInstance = new SidebarManager(siteType, toolOutputHandler);
        }
        return SidebarManager.geminiInstance;
      default:
        // For any unexpected site type, create and return a new instance
        logMessage(`Creating new SidebarManager for unknown site type: ${siteType}`);
        return new SidebarManager(siteType as SiteType, toolOutputHandler);
    }
  }

  /**
   * Create sidebar content
   */
  protected createSidebarContent(): React.ReactNode {
    return <Sidebar />;
  }

  /**
   * Show the sidebar with tool outputs
   */
  public showWithToolOutputs(): void {
    this.show();
    this.refreshContent();
  }

  /**
   * Generate a hash for an array of objects to compare for changes
   * @param items Array of objects to hash
   * @returns A string hash representing the array contents
   */
  private generateHash(items: any[]): string {
    return JSON.stringify(
      items.map(item => {
        // Extract only the essential properties to avoid unnecessary re-renders
        const { domIndex, toolName, args, result } = item;
        return { domIndex, toolName, args, result };
      }),
    );
  }

  /**
   * Refresh the sidebar content
   */
  public refreshContent(): void {
    // Get the latest tool outputs and MCP tools
    const toolOutputs = this.toolOutputHandler.getProcessedToolOutputs();
    const mcpTools = this.toolOutputHandler.getMcpToolContents().filter(c => c.mcpToolContents);

    // Generate hashes to check for changes
    const toolOutputsHash = this.generateHash(toolOutputs);
    const mcpToolsHash = this.generateHash(mcpTools);

    // Only update if there are changes
    if (toolOutputsHash !== this.lastToolOutputsHash || mcpToolsHash !== this.lastMcpToolsHash) {
      this.lastToolOutputsHash = toolOutputsHash;
      this.lastMcpToolsHash = mcpToolsHash;

      // Re-render the sidebar with the latest content
      this.render();

      // Log the update
      logMessage(`Sidebar content refreshed with ${toolOutputs.length} tool outputs and ${mcpTools.length} MCP tools`);
    }
  }

  /**
   * Destroy the sidebar manager
   * Override the parent destroy method to also remove the window reference
   */
  public destroy(): void {
    // Remove the window reference
    if (window.activeSidebarManager === this) {
      window.activeSidebarManager = undefined;
    }

    // Call the parent destroy method
    super.destroy();
  }
}
