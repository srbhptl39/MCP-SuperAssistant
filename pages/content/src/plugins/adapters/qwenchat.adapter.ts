import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Qwen Adapter for Qwen Chat (chat.qwen.ai)
 *
 * This adapter provides specialized functionality for interacting with Qwen's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */

const logger = createLogger('QwenAdapter');

export class QwenAdapter extends BaseAdapterPlugin {
  readonly name = 'QwenAdapter';
  readonly version = '1.0.0'; // Incremented for new architecture
  readonly hostnames = ['qwen.ai', 'chat.qwen.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Qwen's UI elements
  // Updated selectors based on current Qwen interface (December 2024)
  private readonly selectors = {
    // Primary chat input selectors
    CHAT_INPUT: '#chat-input, textarea.chat-input',
    // Submit button selectors (multiple fallbacks) - updated for new UI
    SUBMIT_BUTTON: 'button.send-button, div.chat-prompt-send-button button, #send-message-button',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: 'button.chat-prompt-upload-group-btn, div.upload-group button, input[type="file"]',
    FILE_INPUT: 'input#filesUpload, input[type="file"][multiple]',
    // Main panel and container selectors
    MAIN_PANEL: 'div.prompt-input-container',
    // Drop zones for file attachment
    DROP_ZONE: 'textarea#chat-input, textarea.chat-input',
    // File preview elements
    FILE_PREVIEW: 'div.prompt-input-file-list',
    // Button insertion points (for MCP popover) - action bar left buttons area
    BUTTON_INSERTION_CONTAINER: 'div.action-bar-left-btns, div.action-bar-left',
    // Action bar container
    ACTION_BAR: 'div.prompt-input-action-bar',
    // Alternative insertion points
    FALLBACK_INSERTION: 'div.prompt-input-action-bar, #chat-input',
  };

  // URL patterns for navigation tracking
  private lastUrl: string = '';
  private urlCheckInterval: NodeJS.Timeout | null = null;

  // State management integration
  private mcpPopoverContainer: HTMLElement | null = null;
  private mutationObserver: MutationObserver | null = null;
  private popoverCheckInterval: NodeJS.Timeout | null = null;

  // Setup state tracking
  private storeEventListenersSetup: boolean = false;
  private domObserversSetup: boolean = false;
  private uiIntegrationSetup: boolean = false;

  // Instance tracking for debugging
  private static instanceCount = 0;
  private instanceId: number;

  // Style injection tracking
  private adapterStylesInjected: boolean = false;

  constructor() {
    super();
    QwenAdapter.instanceCount++;
    this.instanceId = QwenAdapter.instanceCount;
    logger.debug(`Instance #${this.instanceId} created. Total instances: ${QwenAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(
        `Qwen adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`,
      );
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing Qwen adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Qwen adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating Qwen adapter instance #${this.instanceId}...`);

    // Inject Qwen-specific button styles
    this.injectQwenButtonStyles();

    // Set up DOM observers and UI integration
    this.setupDOMObservers();
    this.setupUIIntegration();

    // Emit activation event for store synchronization
    this.context.eventBus.emit('adapter:activated', {
      pluginName: this.name,
      timestamp: Date.now()
    });
  }

  async deactivate(): Promise<void> {
    // Guard against double deactivation
    if (this.currentStatus === 'inactive' || this.currentStatus === 'disabled') {
      this.context?.logger.warn('Qwen adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating Qwen adapter...');

    // Clean up UI integration
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();

    // Reset setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;

    // Emit deactivation event
    this.context.eventBus.emit('adapter:deactivated', {
      pluginName: this.name,
      timestamp: Date.now()
    });
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    this.context.logger.debug('Cleaning up Qwen adapter...');

    // Clear URL tracking interval
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Clear popover check interval
    if (this.popoverCheckInterval) {
      clearInterval(this.popoverCheckInterval);
      this.popoverCheckInterval = null;
    }

    // Remove injected adapter styles
    const styleElement = document.getElementById('mcp-qwen-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.adapterStylesInjected = false;
    }

    // Final cleanup
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();

    // Reset all setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;
  }

  /**
   * Insert text into the Qwen chat input field
   * Enhanced with better selector handling, event integration, and URL-specific methods
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(
      `Attempting to insert text into Qwen chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
    );

    let targetElement: HTMLElement | null = null;

    if (options?.targetElement) {
      targetElement = options.targetElement;
    } else {
      // Try multiple selectors for better compatibility
      const selectors = this.selectors.CHAT_INPUT.split(', ');
      for (const selector of selectors) {
        targetElement = document.querySelector(selector.trim()) as HTMLElement;
        if (targetElement) {
          this.context.logger.debug(`Found chat input using selector: ${selector.trim()}`);
          break;
        }
      }
    }

    if (!targetElement) {
      this.context.logger.error('Could not find Qwen chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Use textarea value method for Qwen
      this.context.logger.debug('Using textarea value method for text insertion');
      return await this.insertTextViaTextareaValue(targetElement, text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into Qwen chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Method for inserting text into Qwen's textarea
   */
  private async insertTextViaTextareaValue(element: HTMLElement, text: string): Promise<boolean> {
    try {
      const originalValue = this.getElementContent(element);

      // Focus the element
      element.focus();

      // Prepare text to enter with proper line breaks
      const textToEnter = originalValue ? originalValue + '\n\n' + text : text;

      // Set the value directly for textarea
      if (element instanceof HTMLTextAreaElement) {
        element.value = textToEnter;
      } else {
        (element as any).value = textToEnter;
      }

      // Dispatch input event
      element.dispatchEvent(new Event('input', { bubbles: true }));
      // Also dispatch change event for compatibility
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Emit success event
      this.emitExecutionCompleted(
        'insertText',
        { text },
        {
          success: true,
          originalLength: originalValue.length,
          newLength: text.length,
          totalLength: textToEnter.length,
        },
      );

      this.context.logger.debug(
        `Text inserted successfully. Original: ${originalValue.length}, Added: ${text.length}, Total: ${textToEnter.length}`,
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Textarea value method failed: ${errorMessage}`);
      this.emitExecutionFailed('insertText', `Textarea value method failed: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Check if an element is contenteditable
   */
  private isContentEditableElement(element: HTMLElement): boolean {
    return (
      element.isContentEditable ||
      element.getAttribute('contenteditable') === 'true' ||
      element.hasAttribute('contenteditable')
    );
  }

  /**
   * Get content from element (handles both contenteditable and input/textarea)
   */
  private getElementContent(element: HTMLElement): string {
    if (this.isContentEditableElement(element)) {
      return element.textContent || element.innerText || '';
    } else {
      return (element as HTMLInputElement | HTMLTextAreaElement).value || '';
    }
  }

  /**
   * Submit the current text in the Qwen chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit Qwen chat input');

    // First try to find submit button
    let submitButton: HTMLButtonElement | null = null;
    const selectors = this.selectors.SUBMIT_BUTTON.split(', ');

    for (const selector of selectors) {
      submitButton = document.querySelector(selector.trim()) as HTMLButtonElement;
      if (submitButton) {
        this.context.logger.debug(`Found submit button using selector: ${selector.trim()}`);
        break;
      }
    }

    // Also check for generic button near chat input
    if (!submitButton) {
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT) as HTMLTextAreaElement;
      if (chatInput) {
        submitButton = chatInput.closest('form')?.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (submitButton) {
          this.context.logger.debug('Found submit button near chat input');
        }
      }
    }

    if (submitButton) {
      try {
        // Check if the button is disabled
        const isDisabled =
          submitButton.disabled ||
          submitButton.getAttribute('disabled') !== null ||
          submitButton.getAttribute('aria-disabled') === 'true' ||
          submitButton.classList.contains('disabled');

        if (isDisabled) {
          this.context.logger.warn('Qwen submit button is disabled, waiting for it to be enabled');

          // Wait for button to be enabled (with timeout)
          const maxWaitTime = 5000; // 5 seconds
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 300));

            // Re-check if button is now enabled
            const stillDisabled =
              submitButton!.disabled ||
              submitButton!.getAttribute('disabled') !== null ||
              submitButton!.getAttribute('aria-disabled') === 'true' ||
              submitButton!.classList.contains('disabled');

            if (!stillDisabled) {
              break;
            }
          }

          // Final check
          const finallyDisabled =
            submitButton.disabled ||
            submitButton.getAttribute('disabled') !== null ||
            submitButton.getAttribute('aria-disabled') === 'true' ||
            submitButton.classList.contains('disabled');

          if (finallyDisabled) {
            this.context.logger.warn('Submit button remained disabled, falling back to Enter key');
            return this.submitWithEnterKey();
          }
        }

        // Check if the button is visible and clickable
        const rect = submitButton.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          this.context.logger.warn('Qwen submit button is not visible, falling back to Enter key');
          return this.submitWithEnterKey();
        }

        // Click the submit button to send the message
        submitButton.click();

        // Emit success event to the new event system
        this.emitExecutionCompleted(
          'submitForm',
          {
            formElement: options?.formElement?.tagName || 'unknown',
          },
          {
            success: true,
            method: 'submitButton.click',
            buttonSelector: selectors.find(s => document.querySelector(s.trim()) === submitButton),
          },
        );

        this.context.logger.debug('Qwen chat input submitted successfully via button click');
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.logger.error(`Error clicking submit button: ${errorMessage}, falling back to Enter key`);
        return this.submitWithEnterKey();
      }
    } else {
      this.context.logger.warn('Could not find Qwen submit button, falling back to Enter key');
      return this.submitWithEnterKey();
    }
  }

  /**
   * Fallback method to submit using Enter key
   */
  private async submitWithEnterKey(): Promise<boolean> {
    try {
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT) as HTMLTextAreaElement;
      if (!chatInput) {
        this.emitExecutionFailed('submitForm', 'Chat input element not found for Enter key fallback');
        return false;
      }

      // Focus the textarea
      chatInput.focus();

      // Simulate Enter key press
      const enterEvents = ['keydown', 'keypress', 'keyup'];
      for (const eventType of enterEvents) {
        chatInput.dispatchEvent(
          new KeyboardEvent(eventType, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          }),
        );
      }

      // Try form submission as additional fallback
      const form = chatInput.closest('form') as HTMLFormElement;
      if (form) {
        this.context.logger.debug('Submitting form as additional fallback');
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      }

      this.emitExecutionCompleted(
        'submitForm',
        {},
        {
          success: true,
          method: 'enterKey+formSubmit',
        },
      );

      this.context.logger.debug('Z chat input submitted successfully via Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting with Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the Z chat input
   * Enhanced with better error handling and integration with new architecture
   */
  async attachFile(file: File, options?: { inputElement?: HTMLInputElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to attach file: ${file.name} (${file.size} bytes, ${file.type})`);

    try {
      // Validate file before attempting attachment
      if (!file || file.size === 0) {
        this.emitExecutionFailed('attachFile', 'Invalid file: file is empty or null');
        return false;
      }

      // Check if file upload is supported on current page
      if (!this.supportsFileUpload()) {
        this.emitExecutionFailed('attachFile', 'File upload not supported on current page');
        return false;
      }

      // Method 1: Try using hidden file input element
      const success1 = await this.attachFileViaInput(file);
      if (success1) {
        this.emitExecutionCompleted(
          'attachFile',
          {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          },
          {
            success: true,
            method: 'file-input',
          },
        );
        this.context.logger.debug(`File attached successfully via input: ${file.name}`);
        return true;
      }

      // Method 2: Fallback to drag and drop simulation
      const success2 = await this.attachFileViaDragDrop(file);
      if (success2) {
        this.emitExecutionCompleted(
          'attachFile',
          {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          },
          {
            success: true,
            method: 'drag-drop',
          },
        );
        this.context.logger.debug(`File attached successfully via drag-drop: ${file.name}`);
        return true;
      }

      // Method 3: Try clipboard as final fallback
      const success3 = await this.attachFileViaClipboard(file);
      this.emitExecutionCompleted(
        'attachFile',
        {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
        {
          success: success3,
          method: 'clipboard',
        },
      );

      if (success3) {
        this.context.logger.debug(`File copied to clipboard for manual paste: ${file.name}`);
      } else {
        this.context.logger.warn(`All file attachment methods failed for: ${file.name}`);
      }

      return success3;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to Qwen: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
      return false;
    }
  }

  /**
   * Method 1: Attach file via hidden file input
   */
  private async attachFileViaInput(file: File): Promise<boolean> {
    try {
      const selectors = this.selectors.FILE_INPUT.split(', ');
      let fileInput: HTMLInputElement | null = null;

      for (const selector of selectors) {
        fileInput = document.querySelector(selector.trim()) as HTMLInputElement;
        if (fileInput) {
          this.context.logger.debug(`Found file input using selector: ${selector.trim()}`);
          break;
        }
      }

      if (!fileInput) {
        this.context.logger.debug('No file input element found');
        return false;
      }

      // Create a DataTransfer object and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set the files property on the input element
      fileInput.files = dataTransfer.files;

      // Trigger the change event to notify the application
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      return true;
    } catch (error) {
      this.context.logger.debug(`File input method failed: ${error}`);
      return false;
    }
  }

  /**
   * Method 2: Attach file via drag and drop simulation
   */
  private async attachFileViaDragDrop(file: File): Promise<boolean> {
    try {
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT) as HTMLTextAreaElement;
      if (!chatInput) {
        this.context.logger.debug('No chat input found for drag-drop');
        return false;
      }

      // Create a DataTransfer object
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create custom events
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });

      // Prevent default on dragover to enable drop
      chatInput.addEventListener('dragover', e => e.preventDefault(), { once: true });
      chatInput.dispatchEvent(dragOverEvent);

      // Simulate the drop event
      chatInput.dispatchEvent(dropEvent);

      return true;
    } catch (error) {
      this.context.logger.debug(`Drag-drop method failed: ${error}`);
      return false;
    }
  }

  /**
   * Method 3: Copy file to clipboard as fallback
   */
  private async attachFileViaClipboard(file: File): Promise<boolean> {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [file.type]: file,
        }),
      ]);

      // Focus the textarea to make it easier to paste
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT) as HTMLTextAreaElement;
      if (chatInput) {
        chatInput.focus();
      }

      return true;
    } catch (error) {
      this.context.logger.debug(`Clipboard method failed: ${error}`);
      return false;
    }
  }

  /**
   * Check if the current page/URL is supported by this adapter
   * Enhanced with better pattern matching and logging
   */
  isSupported(): boolean | Promise<boolean> {
    const currentHost = window.location.hostname;
    const currentUrl = window.location.href;

    this.context.logger.debug(`Checking if Qwen adapter supports: ${currentUrl}`);

    // Check hostname first
    const isQwenHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isQwenHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by Qwen adapter`);
      return false;
    }

    // Check if we're on a supported Qwen page
    const supportedPatterns = [
      /^https:\/\/(?:chat\.)?qwen\.ai\/.*/, // chat page and other Qwen pages
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`Qwen adapter supports current page: ${currentUrl}`);
    } else {
      this.context.logger.debug(`URL pattern not supported: ${currentUrl}`);
    }

    return isSupported;
  }

  /**
   * Check if file upload is supported on the current page
   * Enhanced with multiple selector checking and better detection
   */
  supportsFileUpload(): boolean {
    this.context.logger.debug('Checking file upload support for Qwen');

    // Check for file input elements
    const fileInputSelectors = this.selectors.FILE_INPUT.split(', ');
    for (const selector of fileInputSelectors) {
      const fileInput = document.querySelector(selector.trim());
      if (fileInput) {
        this.context.logger.debug(`Found file input with selector: ${selector.trim()}`);
        return true;
      }
    }

    // Check for file upload buttons
    const uploadButtonSelectors = this.selectors.FILE_UPLOAD_BUTTON.split(', ');
    for (const selector of uploadButtonSelectors) {
      const uploadButton = document.querySelector(selector.trim());
      if (uploadButton) {
        this.context.logger.debug(`Found upload button with selector: ${selector.trim()}`);
        return true;
      }
    }

    // Check for drop zones
    const dropZoneSelectors = this.selectors.DROP_ZONE.split(', ');
    for (const selector of dropZoneSelectors) {
      const dropZone = document.querySelector(selector.trim());
      if (dropZone) {
        this.context.logger.debug(`Found drop zone with selector: ${selector.trim()}`);
        return true;
      }
    }

    this.context.logger.debug('No file upload support detected');
    return false;
  }

  // Private helper methods

  private setupUrlTracking(): void {
    if (!this.urlCheckInterval) {
      this.urlCheckInterval = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== this.lastUrl) {
          this.context.logger.debug(`URL changed from ${this.lastUrl} to ${currentUrl}`);

          // Emit page changed event
          if (this.onPageChanged) {
            this.onPageChanged(currentUrl, this.lastUrl);
          }

          this.lastUrl = currentUrl;
        }
      }, 1000); // Check every second
    }
  }

  // New architecture integration methods

  private setupStoreEventListeners(): void {
    if (this.storeEventListenersSetup) {
      this.context.logger.warn(`Store event listeners already set up for instance #${this.instanceId}, skipping`);
      return;
    }

    this.context.logger.debug(`Setting up store event listeners for Qwen adapter instance #${this.instanceId}`);

    // Listen for tool execution events from the store
    this.context.eventBus.on('tool:execution-completed', data => {
      this.context.logger.debug('Tool execution completed:', data);
      // Handle auto-actions based on store state
      this.handleToolExecutionCompleted(data);
    });

    // Listen for UI state changes
    this.context.eventBus.on('ui:sidebar-toggle', data => {
      this.context.logger.debug('Sidebar toggled:', data);
    });

    this.storeEventListenersSetup = true;
  }

  private setupDOMObservers(): void {
    if (this.domObserversSetup) {
      this.context.logger.warn(`DOM observers already set up for instance #${this.instanceId}, skipping`);
      return;
    }

    this.context.logger.debug(`Setting up DOM observers for Qwen adapter instance #${this.instanceId}`);

    // Set up mutation observer to detect page changes and re-inject UI if needed
    this.mutationObserver = new MutationObserver(mutations => {
      let shouldReinject = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check if our MCP popover was removed
          if (!document.getElementById('mcp-popover-container')) {
            shouldReinject = true;
          }
        }
      });

      if (shouldReinject) {
        // Only attempt re-injection if we can find an insertion point
        const insertionPoint = this.findButtonInsertionPoint();
        if (insertionPoint) {
          this.context.logger.debug('MCP popover removed, attempting to re-inject');
          this.setupUIIntegration();
        }
      }
    });

    // Start observing
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.domObserversSetup = true;
  }

  private setupUIIntegration(): void {
    // Allow multiple calls for UI integration (for re-injection after page changes)
    // but log it for debugging
    if (this.uiIntegrationSetup) {
      this.context.logger.debug(`UI integration already set up for instance #${this.instanceId}, re-injecting for page changes`);
    } else {
      this.context.logger.debug(`Setting up UI integration for Qwen adapter instance #${this.instanceId}`);
      this.uiIntegrationSetup = true;
    }

    // Wait for page to be ready, then inject MCP popover
    this.waitForPageReady()
      .then(() => {
        this.injectMCPPopoverWithRetry();
      })
      .catch(error => {
        this.context.logger.warn('Failed to wait for page ready:', error);
        // Don't retry if we can't find insertion point
      });

    // Set up periodic check to ensure popover stays injected
    // this.setupPeriodicPopoverCheck();
  }

  private async waitForPageReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 5; // Maximum 10 seconds (20 * 500ms)

      const checkReady = () => {
        attempts++;
        const insertionPoint = this.findButtonInsertionPoint();
        if (insertionPoint) {
          this.context.logger.debug('Page ready for MCP popover injection');
          resolve();
        } else if (attempts >= maxAttempts) {
          this.context.logger.warn('Page ready check timed out - no insertion point found');
          reject(new Error('No insertion point found after maximum attempts'));
        } else {
          setTimeout(checkReady, 500);
        }
      };
      setTimeout(checkReady, 100);
    });
  }

  private injectMCPPopoverWithRetry(maxRetries: number = 5): void {
    const attemptInjection = (attempt: number) => {
      this.context.logger.debug(`Attempting MCP popover injection (attempt ${attempt}/${maxRetries})`);

      // Check if popover already exists
      if (document.getElementById('mcp-popover-container')) {
        this.context.logger.debug('MCP popover already exists');
        return;
      }

      // Find insertion point
      const insertionPoint = this.findButtonInsertionPoint();
      if (insertionPoint) {
        this.injectMCPPopover(insertionPoint);
      } else if (attempt < maxRetries) {
        // Retry after delay
        this.context.logger.debug(`Insertion point not found, retrying in 1 second (attempt ${attempt}/${maxRetries})`);
        setTimeout(() => attemptInjection(attempt + 1), 1000);
      } else {
        this.context.logger.warn('Failed to inject MCP popover after maximum retries');
      }
    };

    attemptInjection(1);
  }

  private setupPeriodicPopoverCheck(): void {
    // Check every 5 seconds if the popover is still there
    if (!this.popoverCheckInterval) {
      this.popoverCheckInterval = setInterval(() => {
        if (!document.getElementById('mcp-popover-container')) {
          // Only attempt re-injection if we can find an insertion point
          const insertionPoint = this.findButtonInsertionPoint();
          if (insertionPoint) {
            this.context.logger.debug('MCP popover missing, attempting to re-inject');
            this.injectMCPPopoverWithRetry(3); // Fewer retries for periodic checks
          }
        }
      }, 5000);
    }
  }

  private cleanupDOMObservers(): void {
    this.context.logger.debug('Cleaning up DOM observers for Qwen adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Qwen adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Qwen adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Qwen adapter should not handle events, ignoring tool execution event');
      return;
    }

    // Get current UI state from stores to determine auto-actions
    const uiState = this.context.stores.ui;
    if (uiState && data.execution) {
      // Handle auto-insert, auto-submit based on store state
      // This integrates with the new architecture's state management
      this.context.logger.debug('Tool execution handled with new architecture integration');
    }
  }

  private findButtonInsertionPoint(): { container: Element; insertAfter: Element | null; insertBefore?: Element | null } | null {
    this.context.logger.debug('Finding button insertion point for MCP popover');

    // Primary strategy: Find the action-bar-left-btns container and insert MCP button alongside Thinking/Search buttons
    const actionBarLeftBtns = document.querySelector('div.action-bar-left-btns');
    if (actionBarLeftBtns) {
      this.context.logger.debug('Found action-bar-left-btns container, placing MCP button inside');
      // Get the last child to insert after it
      const lastChild = actionBarLeftBtns.lastElementChild;
      return { container: actionBarLeftBtns, insertAfter: lastChild };
    }

    // Fallback 1: Find the action-bar-left container
    const actionBarLeft = document.querySelector('div.action-bar-left');
    if (actionBarLeft) {
      this.context.logger.debug('Found action-bar-left container');
      const btnsContainer = actionBarLeft.querySelector('div.action-bar-left-btns');
      if (btnsContainer) {
        const lastChild = btnsContainer.lastElementChild;
        return { container: btnsContainer, insertAfter: lastChild };
      }
      // Insert at the end of action-bar-left if no btns container
      return { container: actionBarLeft, insertAfter: actionBarLeft.lastElementChild };
    }

    // Fallback 2: Find the prompt-input-action-bar and insert before send button
    const actionBar = document.querySelector('div.prompt-input-action-bar');
    if (actionBar) {
      this.context.logger.debug('Found prompt-input-action-bar container');
      const sendButtonContainer = actionBar.querySelector('div.chat-prompt-send-button');
      if (sendButtonContainer) {
        return { container: actionBar, insertAfter: null, insertBefore: sendButtonContainer };
      }
      return { container: actionBar, insertAfter: actionBar.lastElementChild };
    }

    // Fallback 3: Find submit button and insert before it
    const submitButton = document.querySelector(this.selectors.SUBMIT_BUTTON);
    if (submitButton) {
      const container = submitButton.parentElement;
      if (container) {
        this.context.logger.debug('Found submit button container, placing MCP button to its left');
        return { container, insertAfter: null, insertBefore: submitButton };
      }
    }

    // Fallback 4: Look for the chat input container
    const promptInputContainer = document.querySelector('div.prompt-input-container');
    if (promptInputContainer) {
      const actionBarEl = promptInputContainer.querySelector('div.prompt-input-action-bar');
      if (actionBarEl) {
        this.context.logger.debug('Found action bar in prompt input container');
        return { container: actionBarEl, insertAfter: null };
      }
    }

    this.context.logger.debug('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null; insertBefore?: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into Qwen interface');

    try {
      // Check if popover already exists
      if (document.getElementById('mcp-popover-container')) {
        this.context.logger.debug('MCP popover already exists, skipping injection');
        return;
      }

      // Create container for the popover
      const reactContainer = document.createElement('div');
      reactContainer.id = 'mcp-popover-container';
      reactContainer.style.display = 'inline-flex';
      reactContainer.style.margin = '0 8px 0 0'; // Right margin to create space before submit button

      // Insert at appropriate location
      const { container, insertAfter, insertBefore } = insertionPoint;

      if (insertBefore && insertBefore.parentNode === container) {
        // Insert before the specified element (e.g., submit button)
        container.insertBefore(reactContainer, insertBefore);
        this.context.logger.debug('Inserted popover container before specified element (submit button)');
      } else if (insertAfter && insertAfter.parentNode === container) {
        // Insert after the specified element
        container.insertBefore(reactContainer, insertAfter.nextSibling);
        this.context.logger.debug('Inserted popover container after specified element');
      } else {
        // Append to container as fallback
        container.appendChild(reactContainer);
        this.context.logger.debug('Appended popover container to container element');
      }

      // Store reference
      this.mcpPopoverContainer = reactContainer;

      // Render the React MCP Popover using the new architecture
      this.renderMCPPopover(reactContainer);

      this.context.logger.debug('MCP popover injected and rendered successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject MCP popover:', error);
    }
  }

  private renderMCPPopover(container: HTMLElement): void {
    this.context.logger.debug('Rendering MCP popover with new architecture integration');

    try {
      // Import React and ReactDOM dynamically to avoid bundling issues
      import('react')
        .then(React => {
          import('react-dom/client')
            .then(ReactDOM => {
              import('../../components/mcpPopover/mcpPopover')
                .then(({ MCPPopover }) => {
                  // Create toggle state manager that integrates with new stores
                  const toggleStateManager = this.createToggleStateManager();

                  // Create adapter button configuration
                  const adapterButtonConfig = {
                    className: 'mcp-qwen-button-base',
                    contentClassName: 'mcp-qwen-button-content',
                    textClassName: 'mcp-qwen-button-text',
                    activeClassName: 'mcp-button-active',
                  };

                  // Create React root and render
                  const root = ReactDOM.createRoot(container);
                  root.render(
                    React.createElement(MCPPopover, {
                      toggleStateManager: toggleStateManager,
                      adapterButtonConfig: adapterButtonConfig,
                      adapterName: this.name,
                    }),
                  );

                  this.context.logger.debug('MCP popover rendered successfully with new architecture');
                })
                .catch(error => {
                  this.context.logger.error('Failed to import MCPPopover component:', error);
                });
            })
            .catch(error => {
              this.context.logger.error('Failed to import ReactDOM:', error);
            });
        })
        .catch(error => {
          this.context.logger.error('Failed to import React:', error);
        });
    } catch (error) {
      this.context.logger.error('Failed to render MCP popover:', error);
    }
  }

  private createToggleStateManager() {
    const context = this.context;
    const adapterName = this.name;

    // Create the state manager object
    const stateManager = {
      getState: () => {
        try {
          // Get state from UI store - MCP enabled state should be the persistent MCP toggle state
          const uiState = context.stores.ui;

          // Get the persistent MCP enabled state and other preferences
          const mcpEnabled = uiState?.mcpEnabled ?? false;
          const autoSubmitEnabled = uiState?.preferences?.autoSubmit ?? false;

          context.logger.debug(`Getting MCP toggle state: mcpEnabled=${mcpEnabled}, autoSubmit=${autoSubmitEnabled}`);

          return {
            mcpEnabled: mcpEnabled, // Use the persistent MCP state
            autoInsert: autoSubmitEnabled,
            autoSubmit: autoSubmitEnabled,
            autoExecute: false, // Default for now, can be extended
          };
        } catch (error) {
          context.logger.error('Error getting toggle state:', error);
          // Return safe defaults in case of error
          return {
            mcpEnabled: false,
            autoInsert: false,
            autoSubmit: false,
            autoExecute: false,
          };
        }
      },

      setMCPEnabled: (enabled: boolean) => {
        context.logger.debug(
          `Setting MCP ${enabled ? 'enabled' : 'disabled'} - controlling sidebar visibility via MCP state`,
        );

        try {
          // Primary method: Control MCP state through UI store (which will automatically control sidebar)
          if (context.stores.ui?.setMCPEnabled) {
            context.stores.ui.setMCPEnabled(enabled, 'mcp-popover-toggle');
            context.logger.debug(`MCP state set to: ${enabled} via UI store`);
          } else {
            context.logger.warn('UI store setMCPEnabled method not available');

            // Fallback: Control sidebar visibility directly if MCP state setter not available
            if (context.stores.ui?.setSidebarVisibility) {
              context.stores.ui.setSidebarVisibility(enabled, 'mcp-popover-toggle-fallback');
              context.logger.debug(`Sidebar visibility set to: ${enabled} via UI store fallback`);
            }
          }

          // Secondary method: Control through global sidebar manager as additional safeguard
          const sidebarManager = (window as any).activeSidebarManager;
          if (sidebarManager) {
            if (enabled) {
              context.logger.debug('Showing sidebar via activeSidebarManager');
              sidebarManager.show().catch((error: any) => {
                context.logger.error('Error showing sidebar:', error);
              });
            } else {
              context.logger.debug('Hiding sidebar via activeSidebarManager');
              sidebarManager.hide().catch((error: any) => {
                context.logger.error('Error hiding sidebar:', error);
              });
            }
          } else {
            context.logger.warn('activeSidebarManager not available on window - will rely on UI store only');
          }

          context.logger.debug(
            `MCP toggle completed: MCP ${enabled ? 'enabled' : 'disabled'}, sidebar ${enabled ? 'shown' : 'hidden'}`,
          );
        } catch (error) {
          context.logger.error('Error in setMCPEnabled:', error);
        }

        stateManager.updateUI();
      },

      setAutoInsert: (enabled: boolean) => {
        context.logger.debug(`Setting Auto Insert ${enabled ? 'enabled' : 'disabled'}`);

        // Update preferences through store
        if (context.stores.ui?.updatePreferences) {
          context.stores.ui.updatePreferences({ autoSubmit: enabled });
        }

        stateManager.updateUI();
      },

      setAutoSubmit: (enabled: boolean) => {
        context.logger.debug(`Setting Auto Submit ${enabled ? 'enabled' : 'disabled'}`);

        // Update preferences through store
        if (context.stores.ui?.updatePreferences) {
          context.stores.ui.updatePreferences({ autoSubmit: enabled });
        }

        stateManager.updateUI();
      },

      setAutoExecute: (enabled: boolean) => {
        context.logger.debug(`Setting Auto Execute ${enabled ? 'enabled' : 'disabled'}`);
        // Can be extended to handle auto execute functionality
        stateManager.updateUI();
      },

      updateUI: () => {
        context.logger.debug('Updating MCP popover UI');

        // Dispatch custom event to update the popover
        const popoverContainer = document.getElementById('mcp-popover-container');
        if (popoverContainer) {
          const currentState = stateManager.getState();
          const event = new CustomEvent('mcp:update-toggle-state', {
            detail: { toggleState: currentState },
          });
          popoverContainer.dispatchEvent(event);
        }
      },
    };

    return stateManager;
  }

  /**
   * Public method to manually inject MCP popover (for debugging or external calls)
   */
  public injectMCPPopoverManually(): void {
    this.context.logger.debug('Manual MCP popover injection requested');
    this.injectMCPPopoverWithRetry();
  }

  /**
   * Check if MCP popover is currently injected
   */
  public isMCPPopoverInjected(): boolean {
    return !!document.getElementById('mcp-popover-container');
  }

  private emitExecutionCompleted(toolName: string, parameters: any, result: any): void {
    this.context.eventBus.emit('tool:execution-completed', {
      execution: {
        id: this.generateCallId(),
        toolName,
        parameters,
        result,
        timestamp: Date.now(),
        status: 'success'
      }
    });
  }

  private emitExecutionFailed(toolName: string, error: string): void {
    this.context.eventBus.emit('tool:execution-failed', {
      toolName,
      error,
      callId: this.generateCallId(),
    });
  }

  private generateCallId(): string {
    return `qwen-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if the sidebar is properly available after navigation
   */
  private checkAndRestoreSidebar(): void {
    this.context.logger.debug('Checking sidebar state after page navigation');

    try {
      // Check if there's an active sidebar manager
      const activeSidebarManager = (window as any).activeSidebarManager;

      if (!activeSidebarManager) {
        this.context.logger.warn('No active sidebar manager found after navigation');
        return;
      }

      // Sidebar manager exists, just ensure MCP popover connection is working
      this.ensureMCPPopoverConnection();
    } catch (error) {
      this.context.logger.error('Error checking sidebar state after navigation:', error);
    }
  }

  /**
   * Ensure MCP popover is properly connected to the sidebar after navigation
   */
  private ensureMCPPopoverConnection(): void {
    this.context.logger.debug('Ensuring MCP popover connection after navigation');

    try {
      // Check if MCP popover is still injected
      if (!this.isMCPPopoverInjected()) {
        this.context.logger.debug('MCP popover missing after navigation, re-injecting');
        this.injectMCPPopoverWithRetry(3);
      } else {
        this.context.logger.debug('MCP popover is still present after navigation');
      }
    } catch (error) {
      this.context.logger.error('Error ensuring MCP popover connection:', error);
    }
  }

  // Event handlers - Enhanced for new architecture integration
  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.debug(`Qwen page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject styles on page navigation
      this.adapterStylesInjected = false;
      this.injectQwenButtonStyles();

      // Re-setup UI integration after page change
      setTimeout(() => {
        this.setupUIIntegration();
      }, 1000); // Give page time to load

      // Check if sidebar exists and restore it if needed
      setTimeout(() => {
        this.checkAndRestoreSidebar();
      }, 1500); // Additional delay to ensure page is fully loaded
    } else {
      this.context.logger.warn('Page no longer supported after navigation');
    }

    // Emit page change event to stores
    this.context.eventBus.emit('app:site-changed', {
      site: url,
      hostname: window.location.hostname,
    });
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context.logger.debug(`Qwen host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Qwen adapter no longer supported on this host/page');
      // Emit deactivation event using available event type
      this.context.eventBus.emit('adapter:deactivated', {
        pluginName: this.name,
        timestamp: Date.now(),
      });
    } else {
      // Re-setup for new host
      this.setupUIIntegration();
    }
  }

  onToolDetected?(tools: any[]): void {
    this.context.logger.debug(`Tools detected in Qwen adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  // Qwen-specific button styling methods

  /**
   * Get Qwen-specific button styles that match the platform's design system
   */
  private getQwenButtonStyles(): string {
    return `
      /* MCP button styling to match Qwen's chat-input-feature-btn styling */
      #mcp-popover-container {
        display: inline-flex;
        align-items: center;
      }
      
      .mcp-qwen-button-base,
      #mcp-popover-container .chat-input-feature-btn {
        /* Match Qwen's chat-input-feature-btn styling */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        outline: none;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        border-radius: 8px;
        height: auto;
        padding: 4px 8px;
        gap: 4px;
        font-size: 14px;
        font-weight: 400;
        border: none;
        background: transparent;
        transition: all 0.2s ease;
        color: inherit;
      }
      
      .mcp-qwen-button-base:hover,
      #mcp-popover-container .chat-input-feature-btn:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
      
      .mcp-qwen-button-base.mcp-button-active,
      #mcp-popover-container .chat-input-feature-btn.mcp-button-active {
        color: #1890ff;
        background-color: rgba(24, 144, 255, 0.08);
      }
      
      .mcp-qwen-button-base .anticon,
      .mcp-qwen-button-base svg,
      #mcp-popover-container .chat-input-feature-btn-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      
      .mcp-qwen-button-base img {
        width: 16px;
        height: 16px;
        border-radius: 4px;
      }
      
      .mcp-qwen-button-text,
      #mcp-popover-container .chat-input-feature-btn-text {
        font-size: 14px;
        font-weight: 400;
        line-height: 1.4;
      }
      
      /* Dark mode support - Qwen uses dark theme by default */
      .mcp-qwen-button-base:hover {
        background-color: rgba(255, 255, 255, 0.08);
      }
      
      .mcp-qwen-button-base.mcp-button-active {
        color: #40a9ff;
        background-color: rgba(64, 169, 255, 0.12);
      }
      
      /* Integration with action-bar-left-btns layout */
      .action-bar-left-btns #mcp-popover-container,
      .action-bar-left #mcp-popover-container {
        margin-left: 0;
      }
      
      /* Focus states for accessibility */
      .mcp-qwen-button-base:focus-visible {
        outline: 2px solid #1890ff;
        outline-offset: 2px;
      }
      
      /* Responsive adjustments */
      @media (max-width: 640px) {
        .mcp-qwen-button-base,
        #mcp-popover-container .chat-input-feature-btn {
          padding: 2px 6px;
          font-size: 13px;
        }
        
        .mcp-qwen-button-base svg,
        .mcp-qwen-button-base .anticon,
        .mcp-qwen-button-base img {
          width: 14px;
          height: 14px;
          font-size: 14px;
        }
      }
    `;
  }

  /**
   * Inject Qwen-specific button styles into the page
   */
  private injectQwenButtonStyles(): void {
    if (this.adapterStylesInjected) return;

    try {
      const styleId = 'mcp-qwen-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) existingStyles.remove();

      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getQwenButtonStyles();
      document.head.appendChild(styleElement);

      this.adapterStylesInjected = true;
      this.context.logger.debug('Qwen button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject Qwen button styles:', error);
    }
  }
}
