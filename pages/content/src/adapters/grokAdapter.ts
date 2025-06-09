/**
 * Grok Adapter
 *
 * This file implements the site adapter for grok.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getGrokChatInputSelectors,
  getGrokSubmitButtonSelectors,
  getGrokFileInputSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputEl, buttonEl, simulateEnterFn
  attachFileToChatInput, // takes fileInputEl, file
} from '../components/websites/grok/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initGrokComponents } from './adaptercomponents/grok';

export class GrokAdapter extends BaseAdapter {
  name = 'Grok';
  hostname = ['x.com', 'grok.com']; // Support both x.com and grok.com
  urlPatterns = [
    /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/i\/grok/, // x.com/i/grok path
    /https?:\/\/(?:www\.)?grok\.com/, // Any grok.com URL
  ];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('grok');
    logMessage('Created Grok sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for Grok
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for Grok
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[GrokAdapter] URL changed to: ${newUrl}`);
    initGrokComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initGrokComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  /**
   * Clean up resources when the adapter is no longer needed
   */
  cleanup(): void {
    logMessage('Cleaning up Grok adapter');
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the Grok input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getGrokChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`GrokAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('GrokAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('GrokAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the Grok input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getGrokChatInputSelectors());
    }
    const submitButton = this.findElement(getGrokSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`GrokAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('GrokAdapter: Submission via handler failed, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('GrokAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if Grok supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    // Check for the presence of a file input element
    const fileInputElement = this.findElement(getGrokFileInputSelectors());
    return !!fileInputElement;
  }

  /**
   * Attach a file to the Grok input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const fileInputElement = this.findElement(getGrokFileInputSelectors()) as HTMLInputElement | null;
    if (!fileInputElement) {
      logMessage('GrokAdapter: File input element not found.');
      return false;
    }
    try {
      return attachFileToChatInput(fileInputElement, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`GrokAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to Grok input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for Grok');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Grok URL: ${currentUrl}`);

    // For Grok, we want to show the sidebar only on URLs that match our patterns
    const isValidUrl = this.urlPatterns.some(pattern => pattern.test(currentUrl));

    if (isValidUrl) {
      // Show sidebar for valid URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for Grok URL');
        this.sidebarManager.showWithToolOutputs();
      }
    } else {
      // Hide sidebar for invalid URLs
      if (this.sidebarManager && this.sidebarManager.getIsVisible()) {
        logMessage('Hiding sidebar for non-Grok URL');
        this.sidebarManager.hide();
      }
    }
  }
}
