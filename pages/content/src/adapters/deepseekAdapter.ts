/**
 * DeepSeek Adapter
 *
 * This file implements the site adapter for deepseek.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getDeepSeekChatInputSelectors,
  getDeepSeekSubmitButtonSelectors,
  getDeepSeekFileInputSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputEl, buttonEl, simulateEnterFn
  attachFileToChatInput, // takes fileInputEl, file
} from '../components/websites/deepseek/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initDeepSeekComponents } from './adaptercomponents/deepseek';

export class DeepSeekAdapter extends BaseAdapter {
  name = 'DeepSeek';
  hostname = ['chat.deepseek.com'];
  urlPatterns = [/https?:\/\/(?:www\.)?(?:chat\.deepseek\.com)/];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('deepseek');
    logMessage('Created DeepSeek sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for Deepseek
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for Deepseek
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[DeepSeekAdapter] URL changed to: ${newUrl}`);
    initDeepSeekComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initDeepSeekComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  /**
   * Clean up resources when the adapter is no longer needed
   */
  cleanup(): void {
    logMessage('Cleaning up DeepSeek adapter');
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the DeepSeek input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getDeepSeekChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`DeepSeekAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('DeepSeekAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('DeepSeekAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the DeepSeek input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getDeepSeekChatInputSelectors());
    }
    const submitButton = this.findElement(getDeepSeekSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`DeepSeekAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('DeepSeekAdapter: Submission via handler failed, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('DeepSeekAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if DeepSeek supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    const fileInputElement = this.findElement(getDeepSeekFileInputSelectors());
    return !!fileInputElement;
  }

  /**
   * Attach a file to the DeepSeek input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const fileInputElement = this.findElement(getDeepSeekFileInputSelectors()) as HTMLInputElement | null;
    if (!fileInputElement) {
      logMessage('DeepSeekAdapter: File input element not found.');
      return false;
    }
    try {
      return attachFileToChatInput(fileInputElement, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`DeepSeekAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to DeepSeek input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for DeepSeek');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current DeepSeek URL: ${currentUrl}`);

    // For DeepSeek, we want to show the sidebar only on URLs that match our patterns
    const isValidUrl = this.urlPatterns.some(pattern => pattern.test(currentUrl));

    if (isValidUrl) {
      // Show sidebar for valid URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for DeepSeek URL');
        this.sidebarManager.showWithToolOutputs();
      }
    } else {
      // Hide sidebar for invalid URLs
      if (this.sidebarManager && this.sidebarManager.getIsVisible()) {
        logMessage('Hiding sidebar for non-DeepSeek URL');
        this.sidebarManager.hide();
      }
    }
  }
}
