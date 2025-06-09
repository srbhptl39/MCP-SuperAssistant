/**
 * Kagi Adapter
 *
 * This file implements the site adapter for kagi.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getKagiChatInputSelectors,
  getKagiSubmitButtonSelectors,
  getKagiFileInputSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputEl, buttonEl, simulateEnterFn
  attachFileToChatInput, // takes fileInputEl, file
} from '../components/websites/kagi/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initKagiComponents } from './adaptercomponents/kagi';

export class KagiAdapter extends BaseAdapter {
  name = 'Kagi';
  hostname = ['kagi.com'];
  urlPatterns = [
    /https?:\/\/(?:www\.)?kagi\.com\/assistant/, // Only activate on /assistant path
  ];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('kagi');
    logMessage('Created Kagi sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for Kagi
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for Kagi
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[KagiAdapter] URL changed to: ${newUrl}`);
    initKagiComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initKagiComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  /**
   * Clean up resources when the adapter is no longer needed
   */
  cleanup(): void {
    logMessage('Cleaning up Kagi adapter');
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the Kagi input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getKagiChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`KagiAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('KagiAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('KagiAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the Kagi input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getKagiChatInputSelectors());
    }
    const submitButton = this.findElement(getKagiSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`KagiAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('KagiAdapter: Submission via handler failed, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('KagiAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if Kagi supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    const fileInputElement = this.findElement(getKagiFileInputSelectors());
    return !!fileInputElement;
  }

  /**
   * Attach a file to the Kagi input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const fileInputElement = this.findElement(getKagiFileInputSelectors()) as HTMLInputElement | null;
    if (!fileInputElement) {
      logMessage('KagiAdapter: File input element not found.');
      return false;
    }
    try {
      return attachFileToChatInput(fileInputElement, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`KagiAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to Kagi input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for Kagi');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Kagi URL: ${currentUrl}`);

    // For Kagi, we want to show the sidebar only on URLs that match our patterns
    const isValidUrl = this.urlPatterns.some(pattern => pattern.test(currentUrl));

    if (isValidUrl) {
      // Show sidebar for valid URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for Kagi URL');
        this.sidebarManager.showWithToolOutputs();
      }
    } else {
      // Hide sidebar for invalid URLs
      if (this.sidebarManager && this.sidebarManager.getIsVisible()) {
        logMessage('Hiding sidebar for non-Kagi URL');
        this.sidebarManager.hide();
      }
    }
  }
}
