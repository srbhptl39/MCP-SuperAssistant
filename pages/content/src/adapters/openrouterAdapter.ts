/**
 * ChatGPT Adapter
 *
 * This file implements the site adapter for openrouter.ai
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getOpenRouterChatInputSelectors,
  getOpenRouterSubmitButtonSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputEl, buttonEl, simulateEnterFn
  attachFileToChatInput, // takes element, file
} from '../components/websites/openrouter/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initOpenRouterComponents } from './adaptercomponents/openrouter';

/**
 * OpenRouter Adapter
 */
export class OpenRouterAdapter extends BaseAdapter {
  name = 'OpenRouter';
  hostname = ['openrouter.ai'];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('openrouter');
    logMessage('Created OpenRouter sidebar manager instance');
    // initOpenRouterComponents is called in initializeObserver now
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // Uses specific selectors from its own chatInputHandler
    return getOpenRouterChatInputSelectors();
  }

  protected getSubmitButtonSelectors(): string[] {
    // Uses specific selectors from its own chatInputHandler
    return getOpenRouterSubmitButtonSelectors();
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[OpenRouterAdapter] URL changed to: ${newUrl}`);
    initOpenRouterComponents(); // Re-initialize MCP Popover button
    // Add this.checkCurrentUrl() if OpenRouter needs specific sidebar logic per URL
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initOpenRouterComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    // Call checkCurrentUrl here if it's implemented and needed for initial load
  }

  cleanup(): void {
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the OpenRouter input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getOpenRouterChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`OpenRouterAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('OpenRouterAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('OpenRouterAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the OpenRouter input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getOpenRouterChatInputSelectors());
    }
    const submitButton = this.findElement(getOpenRouterSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`OpenRouterAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('OpenRouterAdapter: Submission via handler failed, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('OpenRouterAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if OpenRouter supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    // OpenRouter UI doesn't have a visible file upload button usually, relies on drag/drop
    // So, we'll assume true if an input area can be found for dropping.
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getOpenRouterChatInputSelectors());
    }
    return !!this.currentChatInputElement;
  }

  /**
   * Attach a file to the OpenRouter input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getOpenRouterChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      try {
        return await attachFileToChatInput(this.currentChatInputElement, file);
      } catch (err) {
        // Changed error to err
        const errorMessage = err instanceof Error ? err.message : String(err);
        logMessage(`OpenRouterAdapter: Error attaching file: ${errorMessage}`);
        console.error('Error in adapter when attaching file to OpenRouter input:', err); // Changed error to err
        return false;
      }
    } else {
      logMessage('OpenRouterAdapter: Chat input element not found for file attachment.');
      // console.error('Error in adapter when attaching file to OpenRouter input:', error); // 'error' not defined here
      console.error('OpenRouterAdapter: Chat input element not found, cannot attach file.');
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for OpenRouter');
  }
}
