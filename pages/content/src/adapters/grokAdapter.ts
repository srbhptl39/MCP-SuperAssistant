/**
 * Grok Adapter
 *
 * This file implements the site adapter for grok.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import type { GrokPatternUnifiedObserver } from '../components/websites/grok';
import {
  clearProcessedToolOutputs,
  getProcessedToolOutputs,
  getProcessedMarkdownContents,
  getMcpToolContents,
  insertToolResultToChatInput,
  attachFileToChatInput,
  submitChatInput,
  createGrokPatternObserver,
} from '../components/websites/grok';
import { clearProcessedMarkdownContents } from '../components/common/markdownHandler';
import type { ToolOutputHandler } from '../components/sidebar';
import { SidebarManager } from '../components/sidebar';
import type { DetectedTool } from '../utils/toolDetector';

// Declare custom event types to fix type issues
declare global {
  interface WindowEventMap {
    mcpToolsUpdated: CustomEvent;
    mcpToolDetected: CustomEvent<{ tool: DetectedTool; domPosition?: number }>;
  }
}

export class GrokAdapter extends BaseAdapter {
  name = 'Grok';
  hostname = ['x.com', 'grok.com']; // Support both x.com and grok.com
  // URL patterns to only activate on specific paths
  urlPatterns = [
    /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/i\/grok/, // x.com/i/grok path
    /https?:\/\/(?:www\.)?grok\.com/, // Any grok.com URL
  ];

  private patternObserver: GrokPatternUnifiedObserver | null = null;
  // Properties to track navigation
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;

  protected initializeSidebarManager(): void {
    // Create a tool output handler for Grok
    const grokToolOutputHandler: ToolOutputHandler = {
      getProcessedToolOutputs,
      getMcpToolContents,
      insertToolResultToChatInput,
    };

    this.sidebarManager = SidebarManager.getInstance('grok', grokToolOutputHandler);
    this.sidebarManager.initialize();
  }

  /**
   * Get elements that might contain tool commands in Grok
   * @param root The root element to search in (defaults to document.body)
   * @returns Array of elements that may contain tool commands
   */
  getToolCommandElements(root: Element = document.body): Element[] {
    // logMessage(`getToolCommandElements: Getting tool command elements for Grok ${root}`);
    const toolCommandElements: Element[] = [];

    // Find assistant message containers - try multiple selectors to be robust to DOM changes
    const messageContainers = Array.from(
      root.querySelectorAll('div.message, div.assistant-message, div.ai-message, div[dir="auto"].message-bubble'),
    );
    // const preContainers = Array.from(root.querySelectorAll('pre'));
    // logMessage(`getToolCommandElements: Found ${preContainers.length} pre containers`);
    // logMessage(`getToolCommandElements: Found ${messageContainers.length} message containers`);

    toolCommandElements.push(...messageContainers);

    // Combine containers from both selectors
    const allContainers = [...new Set([...messageContainers])];
    // const allContainers = [...new Set([...messageContainers, ...preContainers])];

    // Process each container
    for (const container of allContainers) {
      // Look for pre elements (code blocks) within each message
      const preElements = Array.from(container.querySelectorAll('pre'));
      toolCommandElements.push(...preElements);
    }

    // Also check for any pre elements in the document that might contain tool commands
    // This helps catch cases where Grok changes its DOM structure
    if (root === document.body) {
      const allPreElements = Array.from(root.querySelectorAll('pre'));
      for (const preElement of allPreElements) {
        // Only add if not already added
        if (!toolCommandElements.includes(preElement)) {
          toolCommandElements.push(preElement);
        }
      }

      // Look for markdown or response blocks that might contain tool commands
      const markdownBlocks = Array.from(root.querySelectorAll('.markdown, .prose, .response-content'));
      for (const block of markdownBlocks) {
        const blockPreElements = Array.from(block.querySelectorAll('pre'));
        for (const preElement of blockPreElements) {
          if (!toolCommandElements.includes(preElement)) {
            toolCommandElements.push(preElement);
          }
        }
      }
    }

    if (toolCommandElements.length > 0) {
      logMessage(`Found ${toolCommandElements.length} potential tool command elements in Grok`);
    }

    return toolCommandElements;
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Initialize the pattern-based observer

    // Clean up existing observer if force reset is requested
    if (forceReset && this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
      logMessage('Forced reset of pattern-based observer for Grok');
    }

    // Create the pattern-based observer if it doesn't exist
    if (!this.patternObserver) {
      const grokToolOutputHandler: ToolOutputHandler = {
        getProcessedToolOutputs,
        getMcpToolContents,
        insertToolResultToChatInput,
      };

      this.patternObserver = createGrokPatternObserver(this, grokToolOutputHandler);
      logMessage('Created new pattern-based observer for Grok');
    }

    // Start observing with the pattern-based observer
    this.patternObserver.observeAllElements();
    logMessage('Pattern-based observer started for Grok');

    // Set up event listener for MCP tools detection
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.addEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));

    // Set up event listener for mcpToolDetected event
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    window.addEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));

    // Set up navigation detection
    this.setupNavigationCheck();
  }

  /**
   * Set up a check for navigation events in Grok
   * This helps detect when the user navigates to a new chat or conversation
   */
  private setupNavigationCheck(): void {
    // Store current URL
    this.lastUrl = window.location.href;

    // Listen for popstate which happens on back/forward navigation
    window.addEventListener('popstate', this.handlePopState);

    // Set up a periodic URL check to detect SPA navigation
    this.urlCheckInterval = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (this.lastUrl !== currentUrl) {
        this.lastUrl = currentUrl;
        logMessage('Detected URL change in Grok, re-initializing observer');
        this.initializeObserver(true);

        // After a short delay, run a full scan to catch any elements
        // that might have been added during the page transition
        setTimeout(() => {
          this.forceFullScan();
        }, 1500);
      }
    }, 1000); // Check every second
  }

  // Handler for popstate events
  private handlePopState = (): void => {
    const currentUrl = window.location.href;
    if (this.lastUrl !== currentUrl) {
      this.lastUrl = currentUrl;
      logMessage('Detected popstate navigation in Grok, re-initializing observer');
      this.initializeObserver(true);
    }
  };

  /**
   * Handle MCP tools updated event
   * This updates the tool detector with the latest detected tools
   */
  private handleMcpToolsUpdated(): void {
    const mcpTools = getMcpToolContents();

    // Convert MCP tools to DetectedTool format
    const detectedTools: DetectedTool[] = mcpTools.map((tool, index) => ({
      id: `mcp-tool-${index}`,
      name: tool.toolName || 'Unknown Tool',
      args: tool.arguments || {},
    }));

    // Update the tool detector with the detected tools
    this.toolDetector.updateTools(detectedTools);

    // Update the sidebar with the latest tool outputs
    if (this.sidebarManager) {
      this.sidebarManager.refreshContent();
    }
  }

  /**
   * Handle MCP tool detected event
   * This is triggered when a tool is detected by the pattern observer
   * @param event The custom event containing the detected tool
   */
  private handleMcpToolDetected = (event: CustomEvent<{ tool: DetectedTool; domPosition?: number }>): void => {
    const { tool, domPosition } = event.detail;

    logMessage(`Handling MCP tool detected event for tool: ${tool.name}`);

    // Update the tool detector with the detected tool
    this.toolDetector.updateTools([tool]);

    // Update the sidebar with the latest tool outputs
    if (this.sidebarManager) {
      this.sidebarManager.refreshContent();
    }
  };

  /**
   * Force a full scan of the page
   * This is useful when the page content changes significantly
   */
  private forceFullScan(): void {
    logMessage('Forcing full scan of Grok page');

    if (this.patternObserver) {
      this.patternObserver.observeAllElements();
    }

    // Update the sidebar with the latest tool outputs
    if (this.sidebarManager) {
      this.sidebarManager.refreshContent();
    }
  }

  /**
   * Clean up resources when the adapter is no longer needed
   */
  cleanup(): void {
    logMessage('Cleaning up Grok adapter');

    // Clear interval for URL checking
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Remove event listeners
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected);

    // Clean up the pattern observer
    if (this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
    }

    // Call the parent cleanup method
    super.cleanup();
  }

  /**
   * Insert text into the Grok chat input
   * @param text The text to insert
   */
  insertTextIntoInput(text: string): void {
    logMessage(`Inserting text into Grok input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    insertToolResultToChatInput(text);
  }

  /**
   * Trigger submission of the Grok chat input
   */
  triggerSubmission(): void {
    logMessage('Triggering submission of Grok chat input');
    submitChatInput();
  }

  /**
   * Clear all processed data
   */
  protected clearProcessedData(): void {
    logMessage('Clearing processed data for Grok');
    clearProcessedToolOutputs();
    clearProcessedMarkdownContents();
  }

  /**
   * Get processed tool outputs
   * @returns Array of processed tool outputs
   */
  protected getProcessedToolOutputs(): any[] {
    return getProcessedToolOutputs();
  }

  /**
   * Get processed markdown contents
   * @returns Array of processed markdown contents
   */
  protected getProcessedMarkdownContents(): any[] {
    return getProcessedMarkdownContents();
  }

  /**
   * Check if the site supports file upload
   * @returns True if file upload is supported
   */
  supportsFileUpload(): boolean {
    // Check if there's a file input element on the page
    const fileInputs = document.querySelectorAll('input[type="file"]');
    return fileInputs.length > 0;
  }

  /**
   * Attach a file to the chat input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    logMessage(`Attaching file to Grok chat input: ${file.name}`);
    return attachFileToChatInput(file);
  }
}
