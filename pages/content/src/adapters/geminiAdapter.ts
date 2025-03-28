/**
 * Gemini Adapter
 *
 * This file implements the site adapter for gemini.google.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  clearGeminiProcessedToolOutputs as clearProcessedToolOutputs,
  getGeminiProcessedToolOutputs as getProcessedToolOutputs,
  getProcessedMarkdownContents,
  getMcpToolContents,
  type GeminiPatternUnifiedObserver,
  createGeminiPatternObserver,
} from '../components/websites/gemini';
import { 
  insertToolResultToChatInput, 
  submitChatInput, 
  supportsFileUpload as geminiSupportsFileUpload,
  attachFileToChatInput as geminiAttachFileToChatInput
} from '../components/websites/gemini/chatInputHandler';
import { clearProcessedMarkdownContents } from '../components/common/markdownHandler';
import { SidebarManager } from '../components/sidebar';
import { DetectedTool } from '../utils/toolDetector';

// Create a custom tool output handler for Gemini that matches the expected interface
interface GeminiToolOutputHandler {
  getProcessedToolOutputs: () => any[];
  getMcpToolContents: () => any[];
  insertToolResultToChatInput: (result: string) => boolean;
}

// Declare custom event types to fix type issues
declare global {
  interface WindowEventMap {
    'mcpToolsUpdated': CustomEvent;
    'mcpToolDetected': CustomEvent<{tool: DetectedTool; domPosition?: number}>;
  }
}

export class GeminiAdapter extends BaseAdapter {
  name = 'Gemini';
  hostname = ['gemini.google.com'];
  private patternObserver: GeminiPatternUnifiedObserver | null = null;
  // Properties to track navigation
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;

  protected initializeSidebarManager(): void {
    // Create a tool output handler for Gemini
    const geminiToolOutputHandler: GeminiToolOutputHandler = {
      getProcessedToolOutputs,
      getMcpToolContents,
      insertToolResultToChatInput,
    };

    // Use 'gemini' as the site type
    this.sidebarManager = SidebarManager.getInstance('gemini' as any, geminiToolOutputHandler);
    this.sidebarManager.initialize();
  }

  /**
   * Get elements that might contain tool commands in Gemini
   * @param root The root element to search in (defaults to document.body)
   * @returns Array of elements that may contain tool commands
   */
  getToolCommandElements(root: Element = document.body): Element[] {
    const toolCommandElements: Element[] = [];
    
    // Find assistant message containers
    const messageContainers = Array.from(root.querySelectorAll('.model-response-text'));
    // const preContainers = Array.from(root.querySelectorAll('pre'));
    
    // Combine containers from both selectors
    const allContainers = [...new Set([...messageContainers])];
    // const allContainers = [...new Set([...messageContainers, ...preContainers])];

    // Process each container
    for (const container of allContainers) {
      // Look for pre elements (code blocks) within each message
      const preElements = Array.from(container.querySelectorAll('pre'));
      toolCommandElements.push(...preElements);
      
      // Look for code elements that might contain tool commands
      const codeElements = Array.from(container.querySelectorAll('code'));
      toolCommandElements.push(...codeElements);
    }
    
    // Also check for any pre elements in the document that might contain tool commands
    // if (root === document.body) {
    //   const allPreElements = Array.from(root.querySelectorAll('pre'));
    //   for (const preElement of allPreElements) {
    //     // Only add if not already added
    //     if (!toolCommandElements.includes(preElement)) {
    //       toolCommandElements.push(preElement);
    //     }
    //   }
      
    //   // Look for response blocks that might contain tool commands
    //   const responseBlocks = Array.from(root.querySelectorAll('.model-response-text, .response-content'));
    //   for (const block of responseBlocks) {
    //     const blockPreElements = Array.from(block.querySelectorAll('pre'));
    //     for (const preElement of blockPreElements) {
    //       if (!toolCommandElements.includes(preElement)) {
    //         toolCommandElements.push(preElement);
    //       }
    //     }
    //   }
    // }

    if (toolCommandElements.length > 0) {
      logMessage(`Found ${toolCommandElements.length} potential tool command elements in Gemini`);
    }

    return toolCommandElements;
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Clean up existing observer if force reset is requested
    if (forceReset && this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
      logMessage('Forced reset of pattern-based observer for Gemini');
    }
    
    // Create the pattern-based observer if it doesn't exist
    if (!this.patternObserver) {
      const geminiToolOutputHandler: GeminiToolOutputHandler = {
        getProcessedToolOutputs,
        getMcpToolContents,
        insertToolResultToChatInput,
      };
      
      this.patternObserver = createGeminiPatternObserver(this, geminiToolOutputHandler);
      logMessage('Created new pattern-based observer for Gemini');
    }
    
    // Start observing with the pattern-based observer
    this.patternObserver.observeAllElements();
    logMessage('Pattern-based observer started for Gemini');
 
    // Set up event listener for MCP tools detection
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.addEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    
    // Set up event listener for mcpToolDetected event
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    window.addEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    
    // Set up navigation detection
    this.setupNavigationCheck();
  }

  private setupNavigationCheck(): void {
    // Clear existing interval if it exists
    if (this.urlCheckInterval !== null) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }
    
    // Store the initial URL
    this.lastUrl = window.location.href;
    
    // Set up an interval to check if the URL has changed
    this.urlCheckInterval = window.setInterval(() => {
      const currentUrl = window.location.href;
      
      // If the URL has changed, reinitialize the observer
      if (currentUrl !== this.lastUrl) {
        logMessage(`URL changed from ${this.lastUrl} to ${currentUrl}, reinitializing observer`);
        this.lastUrl = currentUrl;
        
        // Wait a moment for the DOM to stabilize after navigation
        setTimeout(() => {
          this.initializeObserver(true);
        }, 1000);
      }
    }, 1000);
    
    // Also listen for popstate events (back/forward navigation)
    window.removeEventListener('popstate', this.handlePopState);
    window.addEventListener('popstate', this.handlePopState);
  }

  private handlePopState = (): void => {
    logMessage('Popstate event detected, reinitializing observer');
    
    // Wait a moment for the DOM to stabilize after navigation
    setTimeout(() => {
      this.initializeObserver(true);
    }, 1000);
  }

  private handleMcpToolsUpdated(): void {
    logMessage('MCP tools updated event received in Gemini adapter');
    
    // Get the MCP tool contents from processed markdown
    const processedMarkdown = getProcessedMarkdownContents();
    const mcpTools = processedMarkdown.filter(c => c.mcpToolContents);
    
    if (mcpTools.length > 0) {
      logMessage(`Found ${mcpTools.length} MCP tools in processed markdown`);
      
      // Dispatch event to show the sidebar with tool outputs
      setTimeout(() => {
        this.showSidebarWithToolOutputs();
      }, 500);
    } else {
      logMessage('No MCP tools found in processed markdown');
    }
  }

  private handleMcpToolDetected(event: CustomEvent<{tool: DetectedTool; domPosition?: number}>): void {
    const { tool, domPosition } = event.detail;
    logMessage(`MCP tool detected event received in Gemini adapter: ${tool.name}`);
    
    if (!tool) {
      logMessage('Error: Tool details missing in MCP tool detected event');
      return;
    }
    
    // Log tool details
    logMessage(`Detected MCP tool: ${tool.name} at position ${domPosition || 'unknown'}`);
    
    // Update the tool detector with the detected tool
    const currentTools = this.toolDetector.getTools();
    const updatedTools = [...currentTools];
    
    // Check if this tool is already in the list
    const existingToolIndex = updatedTools.findIndex(t => t.id === tool.id);
    if (existingToolIndex >= 0) {
      // Update the existing tool
      updatedTools[existingToolIndex] = tool;
    } else {
      // Add the new tool
      updatedTools.push(tool);
    }
    
    // Update the tool detector with the updated tools list
    this.toolDetector.updateTools(updatedTools);
    
    // Create a custom event to update the detection overlay
    const mcpToolEvent = new CustomEvent('mcpToolsUpdated', {
      bubbles: true,
      detail: { tools: [tool] }
    });
    
    window.dispatchEvent(mcpToolEvent);
    
    // Dispatch event to show the sidebar with tool outputs
    setTimeout(() => {
      this.showSidebarWithToolOutputs();
    }, 500);
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
    logMessage('Cleaning up Gemini adapter');
    
    // Clear the navigation check interval
    if (this.urlCheckInterval !== null) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }
    
    // Remove event listeners
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('mcpToolsUpdated', this.handleMcpToolsUpdated.bind(this));
    window.removeEventListener('mcpToolDetected', this.handleMcpToolDetected.bind(this));
    
    // Clean up the pattern-based observer
    if (this.patternObserver) {
      this.patternObserver.cleanup();
      this.patternObserver = null;
    }
    
    // Call the base cleanup method
    super.cleanup();
  }

  insertTextIntoInput(text: string): void {
    logMessage(`Inserting text into Gemini input: ${text.substring(0, 30)}...`);
    insertToolResultToChatInput(text);
  }

  triggerSubmission(): void {
    logMessage('Triggering submission in Gemini');
    submitChatInput();
  }

  /**
   * Check if file upload is supported in Gemini
   */
  supportsFileUpload(): boolean {
    return geminiSupportsFileUpload();
  }

  /**
   * Attach a file to the Gemini chat input
   * @param file The file to attach
   */
  async attachFile(file: File): Promise<boolean> {
    logMessage(`Attaching file to Gemini chat input: ${file.name}`);
    return geminiAttachFileToChatInput(file);
  }

  /**
   * Force a full scan of all elements
   */
  public forceFullScan(): void {
    logMessage('Forcing full scan of Gemini elements');
    this.initializeObserver(true);
  }
} 