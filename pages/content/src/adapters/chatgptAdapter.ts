/**
 * ChatGPT Adapter
 *
 * This file implements the site adapter for chatgpt.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getChatInputSelectors,
  getSubmitButtonSelectors,
  // insertToolResultToChatInput, // Removed: Functionality in BaseAdapter
  attachFileToChatInput, // Stays as it's specific
  // submitChatInput, // Removed: Functionality in BaseAdapter
  // setLastFoundInputElement, // Removed: Adapter manages its own element finding
  // getLastFoundInputElement // Removed
} from '../components/websites/chatgpt/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initChatGPTComponents } from './adaptercomponents/chatgpt'; // Corrected import path

export class ChatGptAdapter extends BaseAdapter {
  name = 'ChatGPT';
  hostname = ['chat.openai.com', 'chatgpt.com'];
  // private currentChatInputElement: HTMLElement | null = null; // Removed: Base methods will find element on demand.

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('chatgpt');
    logMessage('Created ChatGPT sidebar manager instance');
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[ChatGptAdapter] URL changed to: ${newUrl}`);
    // Re-initialize components that might depend on URL or page structure
    initChatGPTComponents(); // This handles MCP popover button
    this.checkCurrentUrl(); // This handles sidebar visibility
    // this.currentChatInputElement = null; // Reset cached input element on URL change - Removed
    // setLastFoundInputElement(null); // chatInputHandler's cache, clear if still used by it - setLastFoundInputElement removed
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    return getChatInputSelectors(); // From chatInputHandler
  }

  protected getSubmitButtonSelectors(): string[] {
    return getSubmitButtonSelectors(); // From chatInputHandler
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initChatGPTComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  cleanup(): void {
    super.cleanup(); // This will call stopUrlMonitoring()
    // this.currentChatInputElement = null; // Removed
    // setLastFoundInputElement(null); // chatInputHandler's cache, clear if still used by it - setLastFoundInputElement removed
  }

  // insertTextIntoInput and triggerSubmission are now inherited from BaseAdapter.

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
    // Use this.findElement provided by BaseAdapter, with selectors from this adapter
    const inputElement = this.findElement(this.getChatInputSelectors());
    // Consider also finding a specific drop zone if getFileUploadDropZoneSelectors is implemented

    if (inputElement) {
      try {
        // Pass the found input element to attachFileToChatInput
        // This function (attachFileToChatInput) remains in chatInputHandler for now as it's specific.
        return await attachFileToChatInput(inputElement, file);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage(`Error in adapter when attaching file to ChatGPT input: ${errorMessage}`);
        console.error('Error in adapter when attaching file to ChatGPT input:', error);
        return false;
      }
    } else {
      logMessage('ChatGptAdapter: Could not find chat input element for file attachment.');
      return false;
    }
  }
  // Note: getFileUploadButtonSelectors and getFileUploadDropZoneSelectors are available
  // from BaseAdapter if a more specific drop zone or button is needed for file uploads.

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for ChatGPT');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Chatgpt URL: ${currentUrl}`);

    // For AiStudio, we want to show the sidebar on all pages
    // You can customize this with specific URL patterns if needed
    if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
      logMessage('Showing sidebar for Chatgpt URL');
      this.sidebarManager.showWithToolOutputs();
    }
  }
}
