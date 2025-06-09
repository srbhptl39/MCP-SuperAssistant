/**
 * AiStudio Adapter
 *
 * This file implements the site adapter for aistudio.google.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  getAiStudioChatInputSelectors,
  getAiStudioSubmitButtonSelectors,
  insertToolResultToChatInput, // takes element, result
  submitChatInput, // takes inputElement, buttonElement, simulateEnterFn
  attachFileToChatInput, // takes element, file
} from '../components/websites/aistudio/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { initAIStudioComponents } from './adaptercomponents/aistudio';

export class AiStudioAdapter extends BaseAdapter {
  name = 'AiStudio';
  hostname = ['aistudio.google.com'];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('aistudio');
    logMessage('Created AiStudio sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for AiStudio
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for AiStudio
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[AiStudioAdapter] URL changed to: ${newUrl}`);
    initAIStudioComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initAIStudioComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  cleanup(): void {
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the AiStudio input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getAiStudioChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`AiStudioAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('AiStudioAdapter: Fallback to BaseAdapter.insertText');
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('AiStudioAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the AiStudio input form
   */
  async triggerSubmission(): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getAiStudioChatInputSelectors());
    }
    const submitButton = this.findElement(getAiStudioSubmitButtonSelectors());

    const success = await submitChatInput(this.currentChatInputElement, submitButton, this.simulateEnterKey.bind(this));
    logMessage(`AiStudioAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      logMessage('AiStudioAdapter: Submission via handler failed and no button found, trying generic Enter.');
      this.simulateEnterKey(this.currentChatInputElement);
    } else if (!success) {
      logMessage('AiStudioAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if AiStudio supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    // AI Studio's file upload is typically done via a button that opens a file picker,
    // or by drag/drop. We'll assume true for now as it's a common feature.
    // A more specific check could be to find an "Upload" button or a drop zone.
    // For now, returning true as per the original adapter.
    return true;
  }

  /**
   * Attach a file to the AiStudio input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getAiStudioChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      try {
        return await attachFileToChatInput(this.currentChatInputElement, file);
      } catch (err) {
        // Changed error to err
        const errorMessage = err instanceof Error ? err.message : String(err);
        logMessage(`AiStudioAdapter: Error attaching file: ${errorMessage}`);
        console.error('Error in adapter when attaching file to AiStudio input:', err); // Changed error to err
        return false;
      }
    } else {
      logMessage('AiStudioAdapter: Chat input element not found for file attachment.');
      // console.error('Error in adapter when attaching file to AiStudio input:', error); // This line had 'error' which was not defined here.
      console.error('AiStudioAdapter: Chat input element not found, cannot attach file.');
      return false;
    }
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current AiStudio URL: ${currentUrl}`);

    // For AiStudio, we want to show the sidebar on all pages
    // You can customize this with specific URL patterns if needed
    if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
      logMessage('Showing sidebar for AiStudio URL');
      this.sidebarManager.showWithToolOutputs();
    }
  }
}
