/**
 * Base Site Adapter
 *
 * This file implements a base adapter class with common functionality
 * that can be extended by site-specific adapters.
 */

import type { SiteAdapter } from '../../utils/siteAdapter';
import { logMessage } from '../../utils/helpers';

export abstract class BaseAdapter implements SiteAdapter {
  abstract name: string;
  abstract hostname: string | string[];
  urlPatterns?: RegExp[];
  protected sidebarManager: any = null;
  private urlCheckIntervalId: number | null = null;
  private lastCheckedUrl: string = typeof window !== 'undefined' ? window.location.href : '';

  // Abstract methods that must be implemented by site-specific adapters
  protected abstract initializeObserver(forceReset?: boolean): void;
  /** Called by BaseAdapter when a URL change is detected. */
  protected abstract onUrlChanged(newUrl: string): void;
  /** Should return an array of CSS selectors for the main chat input element. */
  protected abstract getChatInputSelectors(): string[];
  /** Should return an array of CSS selectors for the submit button. */
  protected abstract getSubmitButtonSelectors(): string[];
  /** Optional: selectors for a file upload drop zone or clickable area. */
  protected getFileUploadDropZoneSelectors?(): string[];
  /** Optional: selectors for a file upload button. */
  protected getFileUploadButtonSelectors?(): string[];

  protected initializeSidebarManager(): void {
    if (this.sidebarManager) {
      this.sidebarManager.initialize();
    }
  }

  // Default implementations for text insertion and form submission
  // Adapters can override these if site-specific logic is more complex.
  public async insertTextIntoInput(text: string): Promise<void> {
    const selectors = this.getChatInputSelectors();
    const inputElement = this.findElement(selectors);
    if (inputElement) {
      let textToInsert = text;
      if (typeof text !== 'string') {
        // Stringify non-string results, similar to original chatInputHandler
        textToInsert = JSON.stringify(text, null, 2);
        logMessage(`[${this.name}] Converted input to string for insertion.`);
      }
      const success = this.insertText(inputElement, textToInsert);
      logMessage(`[${this.name}] BaseAdapter.insertTextIntoInput success: ${success}`);
      if (!success) {
        logMessage(`[${this.name}] BaseAdapter.insertTextIntoInput failed for element. Tag: ${inputElement?.tagName}`);
      }
    } else {
      logMessage(`[${this.name}] BaseAdapter.insertTextIntoInput: Could not find chat input element.`);
      // Consider throwing an error or returning a status
    }
  }

  public async triggerSubmission(): Promise<void> {
    const inputSelectors = this.getChatInputSelectors();
    const inputElement = this.findElement(inputSelectors); // May be needed for fallback

    const buttonSelectors = this.getSubmitButtonSelectors();
    const submitButton = this.findElement(buttonSelectors);

    if (
      submitButton &&
      !(submitButton as HTMLButtonElement).disabled &&
      submitButton.getAttribute('aria-disabled') !== 'true'
    ) {
      logMessage(`[${this.name}] BaseAdapter: Clicking submit button.`);
      this.clickElement(submitButton);
    } else if (inputElement) {
      logMessage(`[${this.name}] BaseAdapter: Submit button not clickable or not found, simulating Enter on input.`);
      this.simulateEnterKey(inputElement);
    } else {
      logMessage(`[${this.name}] BaseAdapter: Could not find input or submit button to trigger submission.`);
      // Consider throwing an error or returning a status
    }
  }

  initialize(): void {
    logMessage(`Initializing ${this.name} adapter`);
    this.lastCheckedUrl = window.location.href; // Initialize with current URL

    // Initialize the sidebar manager if it exists
    if (this.sidebarManager) {
      logMessage(`Initializing sidebar manager for ${this.name}`);
      this.initializeSidebarManager();
    } else {
      logMessage(`No sidebar manager found for ${this.name}`);
    }

    // Initialize the unified observer
    logMessage(`Initializing unified observer for ${this.name} elements`);
    this.initializeObserver(true);
  }

  cleanup(): void {
    logMessage(`Cleaning up ${this.name} adapter`);

    if (this.sidebarManager) {
      this.sidebarManager.destroy();
      this.sidebarManager = null;
    }
    this.stopUrlMonitoring(); // Stop URL monitoring on cleanup
  }

  /**
   * Show the sidebar with tool outputs
   */
  showSidebarWithToolOutputs(): void {
    if (this.sidebarManager) {
      this.sidebarManager.showWithToolOutputs();
      logMessage('Showing sidebar with tool outputs');
    }
  }

  toggleSidebar(): void {
    if (this.sidebarManager) {
      if (this.sidebarManager.getIsVisible()) {
        this.sidebarManager.hide();
      } else {
        this.sidebarManager.showWithToolOutputs();
        logMessage('Showing sidebar with tool outputs');
      }
    }
  }

  updateConnectionStatus(isConnected: boolean): void {
    logMessage(`Updating ${this.name} connection status: ${isConnected}`);
    // Implement connection status update if needed
    // if (this.overlayManager) {
    //   this.overlayManager.updateConnectionStatus(isConnected);
    // }
  }

  /**
   * Force refresh the sidebar content
   * This can be called to manually refresh the sidebar when needed
   */
  refreshSidebarContent(): void {
    logMessage(`Forcing sidebar content refresh for ${this.name}`);
    if (this.sidebarManager) {
      this.sidebarManager.refreshContent();
      logMessage('Sidebar content refreshed');
    }
  }

  /**
   * Check if the site supports file upload
   * Default implementation returns false, override in site-specific adapters if supported
   */
  supportsFileUpload(): boolean {
    return false;
  }

  /**
   * Attach a file to the chat input
   * Default implementation returns a rejected promise, override in site-specific adapters if supported
   * @param file The file to attach
   */
  async attachFile(file: File): Promise<boolean> {
    logMessage(`File attachment not supported for ${this.name}`);
    return Promise.resolve(false);
  }

  // New Utility Methods

  /**
   * Finds the first HTMLElement that matches any of the provided selectors.
   * @param selectors An array of CSS selectors.
   * @param root The root element to search within (defaults to document).
   * @returns The first matching HTMLElement or null if not found.
   */
  protected findElement(selectors: string[], root: Document | HTMLElement = document): HTMLElement | null {
    for (const selector of selectors) {
      const element = root.querySelector(selector) as HTMLElement | null;
      if (element) {
        return element;
      }
    }
    return null;
  }

  /**
   * Inserts text into a given HTMLElement, attempting to handle various input types.
   * Dispatches an 'input' event after setting the value.
   * @param element The HTMLElement (e.g., TEXTAREA, contenteditable DIV).
   * @param text The text to insert.
   * @param asHtml If true and element is contenteditable, inserts text as HTML.
   * @returns True if text insertion was attempted, false otherwise.
   */
  protected insertText(element: HTMLElement, text: string, asHtml: boolean = false): boolean {
    if (!element) return false;

    element.focus();

    if (
      element.tagName === 'TEXTAREA' ||
      (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'text')
    ) {
      (element as HTMLTextAreaElement | HTMLInputElement).value = text;
    } else if (element.isContentEditable) {
      // For contenteditable, ensure selection is collapsed to the end or use insertHTML/insertText
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false); // false to collapse to end
      selection?.removeAllRanges();
      selection?.addRange(range);

      if (asHtml) {
        document.execCommand('insertHTML', false, text);
      } else {
        document.execCommand('insertText', false, text);
      }
    } else {
      logMessage(`insertText: Element is not a textarea, input, or contenteditable. Tag: ${element.tagName}`);
      return false; // Or attempt .textContent / .innerText if appropriate for other types
    }

    // Dispatch an input event to simulate user typing and trigger any listeners
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);
    return true;
  }

  /**
   * Clicks an HTMLElement.
   * @param element The HTMLElement to click.
   * @returns True if click was attempted, false if element is null.
   */
  protected clickElement(element: HTMLElement | null): boolean {
    if (element) {
      element.click();
      return true;
    }
    return false;
  }

  /**
   * Simulates pressing the Enter key on an element.
   * @param element The HTMLElement to dispatch key events on.
   */
  protected simulateEnterKey(element: HTMLElement): void {
    if (!element) return;

    const commonProps = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true, // Important for events to cross shadow DOM boundaries if necessary
    };

    element.dispatchEvent(new KeyboardEvent('keydown', commonProps));
    // Some sites might react to keypress, others to keyup for submission
    element.dispatchEvent(new KeyboardEvent('keypress', commonProps));
    element.dispatchEvent(new KeyboardEvent('keyup', commonProps));
  }

  /**
   * Waits for an element to appear in the DOM.
   * @param selector The CSS selector for the element.
   * @param timeout Maximum time to wait in milliseconds.
   * @param root The root element to search within (defaults to document).
   * @returns A Promise that resolves to the HTMLElement or null if timed out.
   */
  protected async waitForElement(
    selector: string,
    timeout: number = 3000,
    root: Document | HTMLElement = document,
  ): Promise<HTMLElement | null> {
    return new Promise(resolve => {
      const element = root.querySelector(selector) as HTMLElement | null;
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const targetElement = root.querySelector(selector) as HTMLElement | null;
        if (targetElement) {
          obs.disconnect();
          resolve(targetElement);
        }
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);

      observer.observe(root === document ? document.documentElement : root, {
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * Starts monitoring URL changes at a specified interval.
   * Calls the abstract `onUrlChanged` method when a change is detected.
   * @param interval Time in milliseconds to check for URL changes.
   */
  protected startUrlMonitoring(interval: number = 1000): void {
    if (this.urlCheckIntervalId !== null) {
      this.stopUrlMonitoring(); // Stop any existing monitoring
    }
    this.lastCheckedUrl = window.location.href;
    this.urlCheckIntervalId = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastCheckedUrl) {
        logMessage(`[${this.name}] URL changed from ${this.lastCheckedUrl} to ${currentUrl}`);
        this.lastCheckedUrl = currentUrl;
        this.onUrlChanged(currentUrl);
      }
    }, interval);
    logMessage(`[${this.name}] Started URL monitoring.`);
  }

  /**
   * Stops monitoring URL changes.
   */
  protected stopUrlMonitoring(): void {
    if (this.urlCheckIntervalId !== null) {
      window.clearInterval(this.urlCheckIntervalId);
      this.urlCheckIntervalId = null;
      logMessage(`[${this.name}] Stopped URL monitoring.`);
    }
  }
}
