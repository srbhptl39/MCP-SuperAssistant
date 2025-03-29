/**
 * ChatGPT Adapter
 *
 * This file implements the site adapter for chatgpt.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import type { ChatGptPatternUnifiedObserver } from '../components/websites/chatgpt';
import {
  clearProcessedToolOutputs,
  // observeAllElements,
  getProcessedToolOutputs,
  getProcessedMarkdownContents,
  getMcpToolContents,
  insertToolResultToChatInput,
  // ChatGptUnifiedObserver,
  attachFileToChatInput,
  submitChatInput,
  createChatGptPatternObserver,
} from '../components/websites/chatgpt';
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

export class ChatGptAdapter extends BaseAdapter {
  name = 'ChatGPT';
  hostname = ['chat.openai.com', 'chatgpt.com'];
  private patternObserver: ChatGptPatternUnifiedObserver | null = null;
  // private unifiedObserver: ChatGptPatternUnifiedObserver | null = null;
  // Properties to track navigation
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;

  protected initializeSidebarManager(): void {
    // Create a tool output handler for ChatGPT
    const chatGptToolOutputHandler: ToolOutputHandler = {
      getProcessedToolOutputs,
      getMcpToolContents,
      insertToolResultToChatInput,
    };

    this.sidebarManager = SidebarManager.getInstance('chatgpt', chatGptToolOutputHandler);
    this.sidebarManager.initialize();
  }

  /**
   * Get elements that might contain tool commands in ChatGPT
   * @param root The root element to search in (defaults to document.body)
   * @returns Array of elements that may contain tool commands
   */
  getToolCommandElements(root: Element = document.body): Element[] {
    // logMessage(`getToolCommandElements: Getting tool command elements for ChatGPT ${root}`);
    const toolCommandElements: Element[] = [];

    // Find assistant message containers - try multiple selectors to be robust to DOM changes
    const messageContainers = Array.from(root.querySelectorAll('div.group\\/conversation-turn'));
    const preContainers = Array.from(root.querySelectorAll('pre'));
    // logMessage(`getToolCommandElements: Found ${preContainers.length} pre containers`);
    // logMessage(`getToolCommandElements: Found ${messageContainers.length} message containers`);
    // const altMessageContainers = Array.from(root.querySelectorAll('div[data-message-author-role="assistant"]'));

    // Combine containers from both selectors
    // const allContainers = [...new Set([...messageContainers, ...altMessageContainers])];
    const allContainers = [...new Set([...messageContainers, ...preContainers])];

    // Process each container
    for (const container of allContainers) {
      // Look for pre elements (code blocks) within each message
      const preElements = Array.from(container.querySelectorAll('pre'));
      toolCommandElements.push(...preElements);

      // Look for specific code elements that might contain tool commands //intentionally commented
      // const codeElements = Array.from(container.querySelectorAll('code'));
      // toolCommandElements.push(...codeElements);
    }

    // Also check for any pre elements in the document that might contain tool commands
    // This helps catch cases where ChatGPT changes its DOM structure
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
      logMessage(`Found ${toolCommandElements.length} potential tool command elements in ChatGPT`);
    }

    return toolCommandElements;
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Initialize both observers - the pattern-based one is preferred

    // Clean up existing observer if force reset is requested
    if (forceReset && this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
      logMessage('Forced reset of pattern-based observer for ChatGPT');
    }

    // Create the pattern-based observer if it doesn't exist
    if (!this.patternObserver) {
      const chatGptToolOutputHandler: ToolOutputHandler = {
        getProcessedToolOutputs,
        getMcpToolContents,
        insertToolResultToChatInput,
      };

      this.patternObserver = createChatGptPatternObserver(this, chatGptToolOutputHandler);
      logMessage('Created new pattern-based observer for ChatGPT');
    }

    // Start observing with the pattern-based observer
    this.patternObserver.observeAllElements();
    logMessage('Pattern-based observer started for ChatGPT');

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
   * Set up a check for navigation events in ChatGPT
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
        logMessage('Detected URL change in ChatGPT, re-initializing observer');
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
      logMessage('Detected popstate navigation in ChatGPT, re-initializing observer');
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
   * Insert text into the ChatGPT input field
   * @param text Text to insert
   */
  insertTextIntoInput(text: string): void {
    insertToolResultToChatInput(text);
    logMessage(`Inserted text into ChatGPT input: ${text.substring(0, 20)}...`);
  }

  /**
   * Trigger submission of the ChatGPT input form
   */
  triggerSubmission(): void {
    // Use the submitChatInput function to submit the form
    submitChatInput()
      .then(success => {
        logMessage(`Triggered ChatGPT form submission: ${success ? 'success' : 'failed'}`);
      })
      .catch(error => {
        logMessage(`Error triggering ChatGPT form submission: ${error}`);
      });
  }

  /**
   * Check if ChatGPT supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    return true;
  }

  /**
   * Attach a file to the ChatGPT input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    try {
      const result = await attachFileToChatInput(file);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error in adapter when attaching file to ChatGPT input: ${errorMessage}`);
      console.error('Error in adapter when attaching file to ChatGPT input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    if (this.patternObserver) {
      logMessage('Forcing full document scan for ChatGPT');
      this.patternObserver.scanAllElements();
    }
  }
}
