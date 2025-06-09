/**
 * Gemini Adapter
 *
 * This file implements the site adapter for gemini.google.com
 * and provides functionality to register the adapter
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import {
  insertToolResultToChatInput,
  getGeminiChatInputSelectors,
  getGeminiSubmitButtonSelectors,
  getGeminiFileUploadButtonSelectors,
  getGeminiDropZoneSelectors,
  // insertToolResultToChatInput, // Removed duplicate, it's already imported above
  submitChatInput, // Takes buttonElement
  supportsFileUpload as geminiSupportsFileUploadInternal, // Renamed to avoid clash
  attachFileToChatInput as geminiAttachFileToChatInput, // Takes element, file
} from '../components/websites/gemini/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
import { registerSiteAdapter } from '../utils/siteAdapter';
import { adapterRegistry } from './adapterRegistry';
import { initGeminiComponents } from './adaptercomponents/gemini';

export class GeminiAdapter extends BaseAdapter {
  name = 'Gemini';
  hostname = ['gemini.google.com'];
  private currentChatInputElement: HTMLElement | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('gemini');
    logMessage('Created Gemini sidebar manager instance');
  }

  // Implement abstract methods from BaseAdapter
  protected getChatInputSelectors(): string[] {
    // TODO: Implement actual selectors for Gemini
    return [];
  }

  protected getSubmitButtonSelectors(): string[] {
    // TODO: Implement actual selectors for Gemini
    return [];
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  /** Implements abstract method from BaseAdapter */
  protected onUrlChanged(newUrl: string): void {
    logMessage(`[GeminiAdapter] URL changed to: ${newUrl}`);
    initGeminiComponents(); // Re-initialize MCP Popover button
    this.checkCurrentUrl(); // Update sidebar visibility
    this.currentChatInputElement = null; // Reset cached input element
  }

  protected initializeObserver(forceReset: boolean = false): void {
    initGeminiComponents(); // For MCP Popover
    this.startUrlMonitoring(); // Start BaseAdapter's URL monitoring
    this.checkCurrentUrl(); // Initial check for sidebar
  }

  cleanup(): void {
    super.cleanup(); // This will call stopUrlMonitoring()
    this.currentChatInputElement = null;
  }

  /**
   * Insert text into the Gemini input field
   * @param text Text to insert
   */
  async insertTextIntoInput(text: string): Promise<void> {
    if (!this.currentChatInputElement) {
      this.currentChatInputElement = this.findElement(getGeminiChatInputSelectors());
    }

    if (this.currentChatInputElement) {
      // Use the refactored chatInputHandler function
      const success = insertToolResultToChatInput(this.currentChatInputElement, text);
      logMessage(`GeminiAdapter: Inserted text via chatInputHandler: ${success}`);
      if (!success) {
        logMessage('GeminiAdapter: Fallback to BaseAdapter.insertText');
        // Fallback to BaseAdapter's insertText if chatInputHandler's version fails or is not suitable
        super.insertText(this.currentChatInputElement, text);
      }
    } else {
      logMessage('GeminiAdapter: Could not find chat input element to insert text.');
    }
  }

  /**
   * Trigger submission of the Gemini input form
   */
  async triggerSubmission(): Promise<void> {
    const submitButton = this.findElement(getGeminiSubmitButtonSelectors());
    const success = submitChatInput(submitButton); // submitChatInput from handler now takes the element
    logMessage(`GeminiAdapter: Triggered submission via chatInputHandler: ${success}`);

    if (!success && this.currentChatInputElement) {
      // Fallback: if button click failed or button not found, try simulating enter on the input
      logMessage('GeminiAdapter: Submit button click failed or button not found, trying simulateEnterKey.');
      if (!this.currentChatInputElement) {
        // Ensure it's found if not already
        this.currentChatInputElement = this.findElement(getGeminiChatInputSelectors());
      }
      if (this.currentChatInputElement) {
        this.simulateEnterKey(this.currentChatInputElement);
      } else {
        logMessage('GeminiAdapter: Cannot simulate Enter, input element not found.');
      }
    } else if (!success) {
      logMessage('GeminiAdapter: Submission failed and no input element to fall back to for Enter key simulation.');
    }
  }

  /**
   * Check if Gemini supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    // Use findElement with selectors from chatInputHandler
    const uploadButton = this.findElement(getGeminiFileUploadButtonSelectors());
    const dropZone = this.findElement(getGeminiDropZoneSelectors());
    // geminiSupportsFileUploadInternal might be a more complex check,
    // but for now, element presence is a good indicator.
    return !!(uploadButton || dropZone) || geminiSupportsFileUploadInternal();
  }

  /**
   * Attach a file to the Gemini input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    const dropZone = this.findElement(getGeminiDropZoneSelectors());
    if (!dropZone) {
      logMessage('GeminiAdapter: Drop zone not found for file attachment.');
      return false;
    }
    try {
      // Use the refactored chatInputHandler function
      return await geminiAttachFileToChatInput(dropZone, file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`GeminiAdapter: Error attaching file: ${errorMessage}`);
      console.error('Error in adapter when attaching file to Gemini input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for Gemini');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Gemini URL: ${currentUrl}`);

    // Check if we should show or hide the sidebar based on URL
    const excludedUrls = ['https://gemini.google.com/u/6/app'];

    const includedPatterns = [/^https:\/\/gemini\.google\.com\/u\/6\/app\/.*/];

    // Check if current URL is excluded
    const isExcluded = excludedUrls.some(url => currentUrl === url);

    // Check if current URL matches included patterns
    const isIncluded = includedPatterns.some(pattern => pattern.test(currentUrl));

    if (isExcluded && !isIncluded) {
      // Keep sidebar visible but clear detected tools for excluded URLs
      if (this.sidebarManager) {
        logMessage('On excluded Gemini URL, keeping sidebar visible but clearing detected tools');
        // Make sure sidebar is visible
        if (!this.sidebarManager.getIsVisible()) {
          this.sidebarManager.show();
        }
        // Tools will be cleared automatically by mcptooldetect.ts
      }
    } else {
      // Show sidebar for included URLs
      if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
        logMessage('Showing sidebar for included Gemini URL');
        this.sidebarManager.showWithToolOutputs();
      }
    }
  }
}

/**
 * Create and register the Gemini adapter
 * @returns The registered Gemini adapter instance or null if registration fails
 */
export function registerGeminiAdapter() {
  try {
    logMessage('Attempting to register Gemini adapter...');
    const geminiAdapter = new GeminiAdapter();

    // Log detailed information
    logMessage(`Creating Gemini adapter with name: ${geminiAdapter.name}`);
    logMessage(`Gemini adapter hostname: ${JSON.stringify(geminiAdapter.hostname)}`);

    // Register with both systems
    registerSiteAdapter(geminiAdapter);
    adapterRegistry.registerAdapter(geminiAdapter);

    logMessage('Gemini adapter registered successfully!');
    return geminiAdapter;
  } catch (error) {
    logMessage(`ERROR registering Gemini adapter: ${error}`);
    console.error('Error registering Gemini adapter:', error);
    return null;
  }
}
