/**
 * T3 Chat Adapter
 *
 * This file implements the site adapter for t3.chat
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getT3ChatInputSelectors,
  getT3ChatSubmitButtonSelectors,
  getT3ChatFileInputSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputEl, buttonEl, simulateEnterFn
  attachFileToChatInput, // takes fileInputEl, file
} from '../components/websites/t3chat/chatInputHandler'; // Assuming chatInputHandler is the correct file name
import { SidebarManager } from '../components/sidebar';
import { initT3ChatComponents } from './adaptercomponents/t3chat'; // Corrected path

export class T3ChatAdapter extends BaseAdapter {
  name = 'T3ChatAdapter'; // Keep original name if it's used as an ID
  hostname = ['t3.chat'];
  urlPatterns = [/https?:\/\/(?:www\.)?t3\.chat/];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('t3chat');
    logMessage('Created T3 Chat sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for T3Chat
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for T3Chat
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[T3ChatAdapter] URL changed to: ${newUrl}`);
    initT3ChatComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initT3ChatComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  /**
   * Clean up resources when the adapter is no longer needed
   */
  cleanup(): void {
    logMessage('Cleaning up T3 Chat adapter');
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the T3 Chat input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getT3ChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`T3ChatAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('T3ChatAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('T3ChatAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the T3 Chat input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getT3ChatInputSelectors());
    }
    const submitButton = this.findElement(getT3ChatSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`T3ChatAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('T3ChatAdapter: Submission via handler failed, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('T3ChatAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if T3 Chat supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    const fileInputElement = this.findElement(getT3ChatFileInputSelectors());
    return !!fileInputElement;
  }

  /**
   * Attach a file to the T3 Chat input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const fileInputElement = this.findElement(getT3ChatFileInputSelectors()) as HTMLInputElement | null;
    if (!fileInputElement) {
      logMessage('T3ChatAdapter: File input element not found.');
      return false;
    }
    try {
      return attachFileToChatInput(fileInputElement, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`T3ChatAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to T3 Chat input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for T3 Chat');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current T3 Chat URL: ${currentUrl}`);

    // For T3 Chat, we want to show the sidebar only on URLs that match our patterns
    const isValidUrl = this.urlPatterns.some(pattern => pattern.test(currentUrl));

    if (isValidUrl) {
      // Show sidebar for valid URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for T3 Chat URL');
        this.sidebarManager.showWithToolOutputs();
      }
    } else {
      // Hide sidebar for invalid URLs
      if (this.sidebarManager && this.sidebarManager.getIsVisible()) {
        logMessage('Hiding sidebar for non-T3 Chat URL');
        this.sidebarManager.hide();
      }
    }
  }
}
