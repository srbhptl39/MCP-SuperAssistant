/**
 * Perplexity Adapter
 *
 * This file implements the site adapter for perplexity.ai
 *
 * Available functionalities when accessed globally:
 *
 * 1. insertTextIntoInput(text: string): void
 *    - Inserts text into the Perplexity chat input field
 *
 * 2. triggerSubmission(): void
 *    - Submits the chat input form
 *
 * 3. supportsFileUpload(): boolean
 *    - Checks if file upload is supported in the current context
 *
 * 4. attachFile(file: File): Promise<boolean>
 *    - Attaches a file to the chat input
 *    - Returns a Promise resolving to true if successful
 *
 * 5. forceFullScan(): void
 *    - Forces a full document scan for tool commands
 *
 * 6. toggleSidebar(): void
 *    - Shows or hides the sidebar (inherited from BaseAdapter)
 *
 * 7. showSidebarWithToolOutputs(): void
 *    - Shows the sidebar with tool outputs (inherited from BaseAdapter)
 *
 * Example usage when accessing globally:
 * ```typescript
 * // Get the current adapter
 * const adapter = window.mcpAdapter;
 *
 * // Check if it's the Perplexity adapter
 * if (adapter && adapter.name === 'Perplexity') {
 *   // Insert text into the chat input
 *   adapter.insertTextIntoInput('Hello from MCP-SuperAssistant!');
 *
 *   // Submit the form
 *   adapter.triggerSubmission();
 *
 *   // Check if file upload is supported
 *   if (adapter.supportsFileUpload()) {
 *     // Create a file object (e.g., from a file input)
 *     const fileInput = document.getElementById('fileInput') as HTMLInputElement;
 *     const file = fileInput.files?.[0];
 *
 *     // Attach the file if available
 *     if (file) {
 *       adapter.attachFile(file)
 *         .then(success => console.debug(`File attachment ${success ? 'succeeded' : 'failed'}`));
 *     }
 *   }
 *
 *   // Toggle the sidebar
 *   adapter.toggleSidebar();
 * }
 * ```
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getPerplexityChatInputSelectors,
  getPerplexitySubmitButtonSelectors,
  getPerplexityFileInputSelectors,
  insertToolResultToChatInput, // Takes element, result
  submitChatInput, // Takes input and button elements, and simulateEnterFn
  attachFileToChatInput, // Takes elements, file
} from '../components/websites/perplexity/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initPerplexityComponents } from './adaptercomponents/perplexity';

export class PerplexityAdapter extends BaseAdapter {
  name = 'Perplexity';
  hostname = ['perplexity.ai'];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('perplexity');
    logMessage('Created Perplexity sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for Perplexity
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for Perplexity
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[PerplexityAdapter] URL changed to: ${newUrl}`);
    initPerplexityComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility based on new URL
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initPerplexityComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  cleanup(): void {
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the Perplexity input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getPerplexityChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      // Use the refactored chatInputHandler function
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`PerplexityAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('PerplexityAdapter: Fallback to BaseAdapter.insertText');
        // Fallback to BaseAdapter's insertText
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('PerplexityAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the Perplexity input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getPerplexityChatInputSelectors());
    }
    const submitButton = this.findElement(getPerplexitySubmitButtonSelectors());

    // Use the refactored submitChatInput from chatInputHandler
    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`PerplexityAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success) {
      logMessage('PerplexityAdapter: Submission via handler failed or reported false.');
      // If specific handler fails, and we have an input, try generic enter simulation
      if (this.currentChatInputElement) {
        logMessage('PerplexityAdapter: Attempting generic Enter key simulation as last resort.');
        this.simulateEnterKey(this.currentChatInputElement);
      }
    }
  }

  /**
   * Check if Perplexity supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    // Perplexity generally supports file uploads.
    // A more robust check could be finding the actual file input or attach button.
    const fileInputElement = this.findElement(getPerplexityFileInputSelectors());
    return !!fileInputElement;
  }

  /**
   * Attach a file to the Perplexity input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const fileInputElement = this.findElement(getPerplexityFileInputSelectors()) as HTMLInputElement | null;
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getPerplexityChatInputSelectors());
    }

    try {
      // Use the refactored chatInputHandler function
      return await attachFileToChatInput(fileInputElement, this.currentChatInputElement, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`PerplexityAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to Perplexity input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for Perplexity');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Perplexity URL: ${currentUrl}`);

    // Check if we should show or hide the sidebar based on URL
    const excludedUrls = ['https://www.perplexity.ai/', 'https://www.perplexity.ai/library'];

    const includedPatterns = [/^https:\/\/www\.perplexity\.ai\/search\/.*/];

    // Check if current URL is excluded
    const isExcluded = excludedUrls.some(url => currentUrl === url);

    // Check if current URL matches included patterns
    const isIncluded = includedPatterns.some(pattern => pattern.test(currentUrl));

    if (isExcluded && !isIncluded) {
      // Keep sidebar visible but clear detected tools for excluded URLs
      if (this.sidebarManager) {
        logMessage('On excluded Perplexity URL, keeping sidebar visible but clearing detected tools');
        // Make sure sidebar is visible
        if (!this.sidebarManager.getIsVisible()) {
          this.sidebarManager.show();
        }
        // Tools will be cleared automatically by mcptooldetect.ts
      }
    } else {
      // Show sidebar for included URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for included Perplexity URL');
        this.sidebarManager.showWithToolOutputs();
      }
    }
  }

  //   /**
  //    * Handle auto insert of a tool result into the input.
  //    * @param text Text to insert when auto insert is enabled.
  //    */
  //   public handleAutoInsert(text: string): void {
  //     handlePerplexityAutoInsert(text);
  //   }

  //   /**
  //    * Handle auto submit of the input after a tool execution.
  //    */
  //   public handleAutoSubmit(): void {
  //     handlePerplexityAutoSubmit();
  //   }
}
