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
  submitChatInput,
  supportsFileUpload as geminiSupportsFileUpload,
  attachFileToChatInput as geminiAttachFileToChatInput,
} from '../components/websites/gemini/chatInputHandler';
import { SidebarManager } from '../components/sidebar';
// import { registerSiteAdapter } from '../utils/siteAdapter';
import { adapterRegistry } from './adapterRegistry';
import { initGeminiComponents } from './adaptercomponents/gemini';

export class GeminiAdapter extends BaseAdapter {
  name = 'Gemini';
  hostname = ['gemini.google.com'];

  // Properties to track navigation
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;

  constructor() {
    super();
    // Create the sidebar manager instance
    this.sidebarManager = SidebarManager.getInstance('gemini');
    logMessage('Created Gemini sidebar manager instance');
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Check the current URL immediately
    // this.checkCurrentUrl();

    // Initialize Gemini components
    initGeminiComponents();

    // Start URL checking to handle navigation within Gemini
    if (!this.urlCheckInterval) {
      this.lastUrl = window.location.href;
      this.urlCheckInterval = window.setInterval(() => {
        const currentUrl = window.location.href;

        if (currentUrl !== this.lastUrl) {
          logMessage(`URL changed from ${this.lastUrl} to ${currentUrl}`);
          this.lastUrl = currentUrl;

          initGeminiComponents();

          // Check if we should show or hide the sidebar based on URL
          this.checkCurrentUrl();
        }
      }, 1000); // Check every second
    }
  }

  cleanup(): void {
    // Clear interval for URL checking
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Call the parent cleanup method
    super.cleanup();
  }

  /**
   * Insert text into the Gemini input field
   * @param text Text to insert
   */
  insertTextIntoInput(text: string): void {
    insertToolResultToChatInput(text);
    logMessage(`Inserted text into Gemini input: ${text.substring(0, 20)}...`);
  }

  /**
   * Trigger submission of the Gemini input form
   */
  triggerSubmission(): void {
    submitChatInput();
    logMessage('Triggered Gemini form submission');
  }

  /**
   * Check if Gemini supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    return geminiSupportsFileUpload();
  }

  /**
   * Attach a file to the Gemini input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    try {
      const result = await geminiAttachFileToChatInput(file);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error in adapter when attaching file to Gemini input: ${errorMessage}`);
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
    // registerSiteAdapter(geminiAdapter);
    adapterRegistry.registerAdapter(geminiAdapter);

    logMessage('Gemini adapter registered successfully!');
    return geminiAdapter;
  } catch (error) {
    logMessage(`ERROR registering Gemini adapter: ${error}`);
    console.error('Error registering Gemini adapter:', error);
    return null;
  }
}
