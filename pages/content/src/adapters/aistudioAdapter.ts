/**
 * AiStudio Adapter
 *
 * This file implements the site adapter for aistudio.google.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import type { AiStudioPatternUnifiedObserver } from '../components/websites/aistudio';
import {
  clearProcessedToolOutputs,
  getProcessedToolOutputs,
  processToolOutputElement,
  getProcessedMarkdownContents,
  clearProcessedMarkdownContents,
  getMcpToolContents,
  createAiStudioPatternObserver,
  insertToolResultToChatInput,
} from '../components/websites/aistudio';
import type { ToolOutputHandler } from '../components/sidebar';
import { SidebarManager } from '../components/sidebar';
import { attachFileToChatInput, submitChatInput } from '../components/websites/aistudio/chatInputHandler';
import type { DetectedTool } from '../utils/toolDetector';

// Declare custom event types to fix type issues
declare global {
  interface WindowEventMap {
    mcpToolsUpdated: CustomEvent;
    mcpToolDetected: CustomEvent<{ tool: DetectedTool; domPosition?: number }>;
  }
}

export class AiStudioAdapter extends BaseAdapter {
  name = 'AiStudio';
  hostname = ['aistudio.google.com'];
  private patternObserver: AiStudioPatternUnifiedObserver | null = null;

  // Property to store the last URL
  private lastUrl: string = '';
  // Property to store the interval ID
  private urlCheckInterval: number | null = null;
  // Remove original history methods properties

  protected initializeSidebarManager(): void {
    // Create a tool output handler for AiStudio
    const aistudioToolOutputHandler: ToolOutputHandler = {
      getProcessedToolOutputs,
      getMcpToolContents,
      insertToolResultToChatInput,
    };

    this.sidebarManager = SidebarManager.getInstance('aistudio', aistudioToolOutputHandler);
    this.sidebarManager.initialize();
  }

  /**
   * Get elements that might contain tool commands in AiStudio
   * @param root The root element to search in (defaults to document.body)
   * @returns Array of elements that may contain tool commands
   */
  getToolCommandElements(root: Element = document.body): Element[] {
    const toolCommandElements: Element[] = [];

    // Find markdown content elements which may contain code blocks (tool commands)
    const markdownContainers = Array.from(root.querySelectorAll('div.chat-turn-container.model.render'));
    toolCommandElements.push(...markdownContainers);
    // Process each markdown container
    // for (const container of markdownContainers) {
    //   // Look for pre elements (code blocks) within each markdown content
    //   // const preElements = Array.from(container.querySelectorAll('pre'));
    //   // toolCommandElements.push(...preElements);

    //   // Also check for code elements that might contain tool commands //intentionally commented
    //   const codeElements = Array.from(container.querySelectorAll('code'));
    //   toolCommandElements.push(...codeElements);
    // }

    // Also check for any pre elements outside of markdown containers //intentionally commented
    // This helps catch cases where Perplexity changes its DOM structure
    // if (root === document.body) {
    //   const allPreElements = Array.from(root.querySelectorAll('pre'));
    //   for (const preElement of allPreElements) {
    //     // Only add if not already added (not a child of a markdown container)
    //     if (!toolCommandElements.includes(preElement)) {
    //       toolCommandElements.push(preElement);
    //     }
    //   }

    // // Look for response blocks that might contain tool commands //intentionally commented
    // const responseBlocks = Array.from(root.querySelectorAll('.response-block'));
    // for (const block of responseBlocks) {
    //   const blockPreElements = Array.from(block.querySelectorAll('pre'));
    //   for (const preElement of blockPreElements) {
    //     if (!toolCommandElements.includes(preElement)) {
    //       toolCommandElements.push(preElement);
    //     }
    //   }
    // }
    // }

    if (toolCommandElements.length > 0) {
      logMessage(`Found ${toolCommandElements.length} potential tool command elements in AiStudio`);
    }

    return toolCommandElements;
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Clean up existing observer if force reset is requested
    if (forceReset && this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
      logMessage('Forced reset of pattern-based observer for AiStudio');
    }

    // Create the pattern-based observer if it doesn't exist
    if (!this.patternObserver) {
      const aistudioToolOutputHandler: ToolOutputHandler = {
        getProcessedToolOutputs,
        getMcpToolContents,
        insertToolResultToChatInput,
      };

      this.patternObserver = createAiStudioPatternObserver(this, aistudioToolOutputHandler);
      logMessage('Created new pattern-based observer for AiStudio');
    }

    // Start observing with the pattern-based observer
    this.patternObserver.observeAllElements();
    logMessage('Pattern-based observer started for AiStudio');

    // Set up event listener for MCP tools detection
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.addEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));

    // Set up event listener for mcpToolDetected event
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    window.addEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));

    // Set up a periodic check for navigation events
    this.setupNavigationCheck();
  }

  /**
   * Set up a check for navigation events in AiStudio
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
        logMessage('Detected URL change in AiStudio, re-initializing observer');
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
      logMessage('Detected popstate navigation in AiStudio, re-initializing observer');
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

    // Update the tool detector
    this.toolDetector.updateTools(detectedTools);
    logMessage(`Updated tool detector with ${detectedTools.length} tools`);
  }

  /**
   * Handle mcpToolDetected event
   * This is triggered by the PatternUnifiedObserver when a tool is detected
   * @param event CustomEvent with tool details
   */
  private handleMcpToolDetected(event: CustomEvent<{ tool: DetectedTool; domPosition?: number }>): void {
    if (event.detail && event.detail.tool) {
      const tool = event.detail.tool;
      const domPosition = event.detail.domPosition || -1;

      // Add this tool to our detected tools
      const currentTools = this.toolDetector.getTools();

      // Create a composite signature that includes both content and position
      // for uniquely identifying tools across different DOM positions
      const newToolSignature = `${tool.name}::${JSON.stringify(tool.args)}`;
      const positionAwareSignature = `${newToolSignature}::${domPosition}`;

      // Check if we already have a tool with the same signature AND position
      const exists = currentTools.some((t: DetectedTool) => {
        // Check by ID first (faster)
        if (t.id === tool.id) return true;

        // If the tool has a domPosition property and it matches our current tool's position
        // then check the content signature as well
        const existingSignature = `${t.name}::${JSON.stringify(t.args)}`;

        // If domPosition is -1, fall back to content-only comparison (backward compatibility)
        // Otherwise, require both content and position to match for detecting duplicates
        if (domPosition === -1) {
          return existingSignature === newToolSignature;
        } else {
          const existingPosition = (t as any).domPosition || -1;
          return existingSignature === newToolSignature && existingPosition === domPosition;
        }
      });

      if (!exists) {
        // Create a new tool with the domPosition property
        const toolWithPosition = {
          ...tool,
          domPosition, // Add position information
        };

        // Add the new tool to the list
        const updatedTools = [...currentTools, toolWithPosition];
        this.toolDetector.updateTools(updatedTools);
        logMessage(
          `Added new detected tool: ${tool.name} with signature ${newToolSignature} at position ${domPosition}`,
        );
      } else {
        logMessage(
          `Skipped duplicate tool: ${tool.name} with signature ${newToolSignature} at position ${domPosition}`,
        );
      }
    }
  }

  protected clearProcessedData(): void {
    clearProcessedToolOutputs();
    clearProcessedMarkdownContents();
  }

  protected getProcessedToolOutputs(): any[] {
    return getProcessedToolOutputs();
  }

  protected getProcessedMarkdownContents(): any[] {
    return getProcessedMarkdownContents();
  }

  cleanup(): void {
    if (this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
    }

    // Remove event listeners
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    window.removeEventListener('popstate', this.handlePopState);

    // Clear the URL check interval
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Call the base implementation
    super.cleanup();
  }

  /**
   * Insert text into the AiStudio input field
   * @param text Text to insert
   */
  insertTextIntoInput(text: string): void {
    insertToolResultToChatInput(text);
    logMessage(`Inserted text into AiStudio input: ${text.substring(0, 20)}...`);
  }

  /**
   * Trigger submission of the AiStudio input form
   */
  triggerSubmission(): void {
    // Use the function to submit the form
    submitChatInput()
      .then((success: boolean) => {
        logMessage(`Triggered AiStudio form submission: ${success ? 'success' : 'failed'}`);
      })
      .catch((error: Error) => {
        logMessage(`Error triggering AiStudio form submission: ${error}`);
      });
  }

  /**
   * Check if AiStudio supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    return true;
  }

  /**
   * Attach a file to the AiStudio input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    try {
      const result = await attachFileToChatInput(file);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error in adapter when attaching file to AiStudio input: ${errorMessage}`);
      console.error('Error in adapter when attaching file to AiStudio input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    if (this.patternObserver) {
      logMessage('Forcing full document scan for AiStudio');
      this.patternObserver.scanAllElements();
    }
  }
}
