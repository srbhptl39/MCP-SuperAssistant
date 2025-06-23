import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * Perplexity Adapter for Perplexity AI (perplexity.ai)
 *
 * This adapter provides specialized functionality for interacting with Perplexity AI's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */
export class PerplexityAdapter extends BaseAdapterPlugin {
  readonly name = 'PerplexityAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['perplexity.ai', 'www.perplexity.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Perplexity's UI elements
  // Updated selectors based on current Perplexity interface
  private readonly selectors = {
    // Primary chat input selectors
    CHAT_INPUT: '#ask-input[contenteditable="true"], #ask-input[role="textbox"], div[role="textbox"][contenteditable="true"], textarea[placeholder="Ask anything..."], textarea[placeholder="Ask follow-up"], textarea[placeholder*="Ask"], div[contenteditable="true"][data-lexical-editor="true"]',
    // Submit button selectors (multiple fallbacks)
    SUBMIT_BUTTON: 'button[aria-label="Submit"], button[aria-label="Send"], button[type="submit"]',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: 'button[aria-label*="Attach"], button[aria-label*="attach"]',
    FILE_INPUT: 'input[type="file"][multiple][accept*=".pdf"], input[type="file"][multiple]',
    // Main panel and container selectors
    MAIN_PANEL: '.main-content, .chat-container, .conversation-container',
    // Drop zones for file attachment
    DROP_ZONE: 'textarea[placeholder*="Ask"], .input-area, .chat-input-container',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, .file-upload-preview',
    // Button insertion points (for MCP popover) - looking for search/research toggle area
    BUTTON_INSERTION_CONTAINER: 'div[role="radiogroup"].group.relative.isolate.flex, .flex.items-center, div.flex.items-end.gap-sm',
    // Alternative insertion points
    FALLBACK_INSERTION: '.input-area, .chat-input-container, .conversation-input'
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
    PerplexityAdapter.instanceCount++;
    this.instanceId = PerplexityAdapter.instanceCount;
    console.debug(`[PerplexityAdapter] Instance #${this.instanceId} created. Total instances: ${PerplexityAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`Perplexity adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing Perplexity adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Perplexity adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating Perplexity adapter instance #${this.instanceId}...`);

    // Inject Perplexity-specific button styles
    this.injectPerplexityButtonStyles();

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
      this.context?.logger.warn('Perplexity adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating Perplexity adapter...');

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
    this.context.logger.debug('Cleaning up Perplexity adapter...');

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
    const styleElement = document.getElementById('mcp-perplexity-button-styles');
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
   * Insert text into the Perplexity chat input field
   * Enhanced with better selector handling, event integration, and URL-specific methods
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into Perplexity chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find Perplexity chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Check if we're on the homepage and use the special method
      const currentUrl = window.location.href;
      if (currentUrl === 'https://www.perplexity.ai/' || currentUrl === 'https://perplexity.ai/') {
        this.context.logger.debug('Homepage detected, using InputEvent method for text insertion');
        return await this.insertTextViaInputEvent(targetElement, text);
      }

      // For other pages, use the existing method
      const isContentEditable = this.isContentEditableElement(targetElement);
      const originalValue = this.getElementContent(targetElement);

      // Focus the input element
      targetElement.focus();

      // Insert the text by updating the value and dispatching appropriate events
      // Append the text to the original value on a new line if there's existing content
      const newContent = originalValue ? originalValue + '\n\n' + text : text;
      
      if (isContentEditable) {
        (targetElement as HTMLElement).textContent = newContent;
      } else {
        (targetElement as HTMLInputElement | HTMLTextAreaElement).value = newContent;
      }

      // Dispatch events to simulate user typing for better compatibility
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));

      // Emit success event to the new event system
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length,
        totalLength: newContent.length,
        method: 'standard'
      });

      this.context.logger.debug(`Text inserted successfully. Original: ${originalValue.length}, Added: ${text.length}, Total: ${newContent.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into Perplexity chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Special method for inserting text on the homepage using InputEvent
   */
  private async insertTextViaInputEvent(element: HTMLElement, text: string): Promise<boolean> {
    try {
      const originalValue = this.getElementContent(element);
      
      // Focus the element
      element.focus();

      // Select all existing content
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Prepare text to enter with proper line breaks
      const textToEnter = originalValue ? originalValue + '\n\n' + text : text;

      // Use InputEvent instead of execCommand
      element.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: textToEnter,
        bubbles: true,
        cancelable: true
      }));

      // Also dispatch change event for compatibility
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Emit success event
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length,
        totalLength: textToEnter.length,
        method: 'InputEvent-homepage'
      });

      this.context.logger.debug(`Text inserted successfully via InputEvent on homepage. Original: ${originalValue.length}, Added: ${text.length}, Total: ${textToEnter.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`InputEvent method failed: ${errorMessage}`);
      this.emitExecutionFailed('insertText', `InputEvent method failed: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Check if an element is contenteditable
   */
  private isContentEditableElement(element: HTMLElement): boolean {
    return element.isContentEditable || 
           element.getAttribute('contenteditable') === 'true' ||
           element.hasAttribute('contenteditable');
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
   * Submit the current text in the Perplexity chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit Perplexity chat input');

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
        submitButton = chatInput.parentElement?.querySelector('button') as HTMLButtonElement;
        if (submitButton) {
          this.context.logger.debug('Found submit button near chat input');
        }
      }
    }

    if (submitButton) {
      try {
        // Check if the button is disabled
        const isDisabled = submitButton.disabled || 
                          submitButton.getAttribute('disabled') !== null ||
                          submitButton.getAttribute('aria-disabled') === 'true' ||
                          submitButton.classList.contains('disabled');

        if (isDisabled) {
          this.context.logger.warn('Perplexity submit button is disabled, waiting for it to be enabled');
          
          // Wait for button to be enabled (with timeout)
          const maxWaitTime = 5000; // 5 seconds
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Re-check if button is now enabled
            const stillDisabled = submitButton!.disabled || 
                                 submitButton!.getAttribute('disabled') !== null ||
                                 submitButton!.getAttribute('aria-disabled') === 'true' ||
                                 submitButton!.classList.contains('disabled');
            
            if (!stillDisabled) {
              break;
            }
          }
          
          // Final check
          const finallyDisabled = submitButton.disabled || 
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
          this.context.logger.warn('Perplexity submit button is not visible, falling back to Enter key');
          return this.submitWithEnterKey();
        }

        // Click the submit button to send the message
        submitButton.click();

        // Emit success event to the new event system
        this.emitExecutionCompleted('submitForm', {
          formElement: options?.formElement?.tagName || 'unknown'
        }, {
          success: true,
          method: 'submitButton.click',
          buttonSelector: selectors.find(s => document.querySelector(s.trim()) === submitButton)
        });

        this.context.logger.debug('Perplexity chat input submitted successfully via button click');
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.logger.error(`Error clicking submit button: ${errorMessage}, falling back to Enter key`);
        return this.submitWithEnterKey();
      }
    } else {
      this.context.logger.warn('Could not find Perplexity submit button, falling back to Enter key');
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
        chatInput.dispatchEvent(new KeyboardEvent(eventType, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }

      // Try form submission as additional fallback
      const form = chatInput.closest('form') as HTMLFormElement;
      if (form) {
        this.context.logger.debug('Submitting form as additional fallback');
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      }

      this.emitExecutionCompleted('submitForm', {}, {
        success: true,
        method: 'enterKey+formSubmit'
      });

      this.context.logger.debug('Perplexity chat input submitted successfully via Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting with Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the Perplexity chat input
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
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        }, {
          success: true,
          method: 'file-input'
        });
        this.context.logger.debug(`File attached successfully via input: ${file.name}`);
        return true;
      }

      // Method 2: Fallback to drag and drop simulation
      const success2 = await this.attachFileViaDragDrop(file);
      if (success2) {
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        }, {
          success: true,
          method: 'drag-drop'
        });
        this.context.logger.debug(`File attached successfully via drag-drop: ${file.name}`);
        return true;
      }

      // Method 3: Try clipboard as final fallback
      const success3 = await this.attachFileViaClipboard(file);
      this.emitExecutionCompleted('attachFile', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      }, {
        success: success3,
        method: 'clipboard'
      });

      if (success3) {
        this.context.logger.debug(`File copied to clipboard for manual paste: ${file.name}`);
      } else {
        this.context.logger.warn(`All file attachment methods failed for: ${file.name}`);
      }

      return success3;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to Perplexity: ${errorMessage}`);
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

    this.context.logger.debug(`Checking if Perplexity adapter supports: ${currentUrl}`);

    // Check hostname first
    const isPerplexityHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isPerplexityHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by Perplexity adapter`);
      return false;
    }

    // Check if we're on a supported Perplexity page
    const supportedPatterns = [
      /^https:\/\/(?:www\.)?perplexity\.ai\/search\/.*/,  // Search pages
      /^https:\/\/(?:www\.)?perplexity\.ai\/$/,           // Home page
      /^https:\/\/(?:www\.)?perplexity\.ai\/library\/.*/  // Library pages
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`Perplexity adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for Perplexity');

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

    this.context.logger.debug(`Setting up store event listeners for Perplexity adapter instance #${this.instanceId}`);

    // Listen for tool execution events from the store
    this.context.eventBus.on('tool:execution-completed', (data) => {
      this.context.logger.debug('Tool execution completed:', data);
      // Handle auto-actions based on store state
      this.handleToolExecutionCompleted(data);
    });

    // Listen for UI state changes
    this.context.eventBus.on('ui:sidebar-toggle', (data) => {
      this.context.logger.debug('Sidebar toggled:', data);
    });

    this.storeEventListenersSetup = true;
  }

  private setupDOMObservers(): void {
    if (this.domObserversSetup) {
      this.context.logger.warn(`DOM observers already set up for instance #${this.instanceId}, skipping`);
      return;
    }

    this.context.logger.debug(`Setting up DOM observers for Perplexity adapter instance #${this.instanceId}`);

    // Set up mutation observer to detect page changes and re-inject UI if needed
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldReinject = false;

      mutations.forEach((mutation) => {
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
      this.context.logger.debug(`Setting up UI integration for Perplexity adapter instance #${this.instanceId}`);
      this.uiIntegrationSetup = true;
    }

    // Wait for page to be ready, then inject MCP popover
    this.waitForPageReady().then(() => {
      this.injectMCPPopoverWithRetry();
    }).catch((error) => {
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
    this.context.logger.debug('Cleaning up DOM observers for Perplexity adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Perplexity adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Perplexity adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Perplexity adapter should not handle events, ignoring tool execution event');
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

  private findButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
    this.context.logger.debug('Finding button insertion point for MCP popover');

    // Try to find the search/research toggle area first (primary insertion point)
    const radioGroup = document.querySelector('div[role="radiogroup"].group.relative.isolate.flex');
    if (radioGroup) {
      const container = radioGroup.closest('.flex.items-center');
      if (container) {
        this.context.logger.debug('Found search/research toggle container, placing MCP button next to it');
        const wrapperDiv = radioGroup.parentElement;
        return { container, insertAfter: wrapperDiv };
      }
    }

    // Fallback: Look for the main input area's action buttons container
    const actionsContainer = document.querySelector('div.flex.items-end.gap-sm');
    if (actionsContainer) {
      this.context.logger.debug('Found actions container (fallback)');
      const fileUploadButton = actionsContainer.querySelector('button[aria-label*="Attach"]');
      return { container: actionsContainer, insertAfter: fileUploadButton };
    }

    // Try fallback selectors
    const fallbackSelectors = [
      '.input-area .actions',
      '.chat-input-actions',
      '.conversation-input .actions'
    ];

    for (const selector of fallbackSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        this.context.logger.debug(`Found fallback insertion point: ${selector}`);
        return { container, insertAfter: null };
      }
    }

    this.context.logger.debug('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into Perplexity interface');

    try {
      // Check if popover already exists
      if (document.getElementById('mcp-popover-container')) {
        this.context.logger.debug('MCP popover already exists, skipping injection');
        return;
      }

      // Create container for the popover
      const reactContainer = document.createElement('div');
      reactContainer.id = 'mcp-popover-container';
      reactContainer.style.display = 'inline-block';
      reactContainer.style.margin = '0 4px';

      // Insert at appropriate location
      const { container, insertAfter } = insertionPoint;
      if (insertAfter && insertAfter.parentNode === container) {
        container.insertBefore(reactContainer, insertAfter.nextSibling);
        this.context.logger.debug('Inserted popover container after specified element');
      } else {
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
      import('react').then(React => {
        import('react-dom/client').then(ReactDOM => {
          import('../../components/mcpPopover/mcpPopover').then(({ MCPPopover }) => {
            // Create toggle state manager that integrates with new stores
            const toggleStateManager = this.createToggleStateManager();

            // Create adapter button configuration
            const adapterButtonConfig = {
              className: 'mcp-perplexity-button-base',
              contentClassName: 'mcp-perplexity-button-content',
              textClassName: 'mcp-perplexity-button-text',
              activeClassName: 'mcp-button-active'
            };

            // Create React root and render
            const root = ReactDOM.createRoot(container);
            root.render(
              React.createElement(MCPPopover, {
                toggleStateManager: toggleStateManager,
                adapterButtonConfig: adapterButtonConfig,
                adapterName: this.name
              })
            );

            this.context.logger.debug('MCP popover rendered successfully with new architecture');
          }).catch(error => {
            this.context.logger.error('Failed to import MCPPopover component:', error);
          });
        }).catch(error => {
          this.context.logger.error('Failed to import ReactDOM:', error);
        });
      }).catch(error => {
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
            autoExecute: false // Default for now, can be extended
          };
        } catch (error) {
          context.logger.error('Error getting toggle state:', error);
          // Return safe defaults in case of error
          return {
            mcpEnabled: false,
            autoInsert: false,
            autoSubmit: false,
            autoExecute: false
          };
        }
      },

      setMCPEnabled: (enabled: boolean) => {
        context.logger.debug(`Setting MCP ${enabled ? 'enabled' : 'disabled'} - controlling sidebar visibility via MCP state`);

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

          context.logger.debug(`MCP toggle completed: MCP ${enabled ? 'enabled' : 'disabled'}, sidebar ${enabled ? 'shown' : 'hidden'}`);
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
            detail: { toggleState: currentState }
          });
          popoverContainer.dispatchEvent(event);
        }
      }
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
      callId: this.generateCallId()
    });
  }

  private generateCallId(): string {
    return `perplexity-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`Perplexity page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject styles on page navigation
      this.adapterStylesInjected = false;
      this.injectPerplexityButtonStyles();

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
      hostname: window.location.hostname
    });
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context.logger.debug(`Perplexity host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Perplexity adapter no longer supported on this host/page');
      // Emit deactivation event using available event type
      this.context.eventBus.emit('adapter:deactivated', {
        pluginName: this.name,
        timestamp: Date.now()
      });
    } else {
      // Re-setup for new host
      this.setupUIIntegration();
    }
  }

  onToolDetected?(tools: any[]): void {
    this.context.logger.debug(`Tools detected in Perplexity adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  // Perplexity-specific button styling methods

  /**
   * Get Perplexity-specific button styles that match the platform's segmented control design system
   */
  private getPerplexityButtonStyles(): string {
    return `
      .mcp-perplexity-button-base {
        /* Base button styling matching Perplexity's segmented-control design */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        outline: none;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        border-radius: 8px;
        height: 32px;
        min-width: 36px;
        padding: 0 0px;
        gap: 6px;
        font-size: 14px;
        font-weight: 500;
        border: none;
        background: transparent;
        transition: all 300ms ease-out;
        
        /* Default colors - using Perplexity's actual theme colors */
        color: oklch(var(--text-color-200, 50.2% 0.008 106.677)); /* Inactive text */
        
        /* Focus states */
        &:focus {
          outline: none;
        }
        
        /* Hover states */
        &:hover {
          color: oklch(var(--text-color-100, 30.4% 0.04 213.681)); /* Active text on hover */
        }
        
        /* Active/selected state - matches the checked segmented control */
        &.mcp-button-active {
          color: oklch(var(--text-super-color-100, 55.3% 0.086 208.538)); /* Super color for active state */
        }
        
        /* Active button overlay styling (matches data-state="checked" div) */
        &.mcp-button-active::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: 8px;
          border: 1px solid oklch(var(--text-super-color-100, 55.3% 0.086 208.538));
          background-color: oklch(0.963 0.007 106.523); /* Light background */
          box-shadow: 0 1px 3px 0 oklch(var(--text-super-color-100, 55.3% 0.086 208.538) / 0.3);
          transition: all 300ms ease-out;
          opacity: 1;
        }
      }
      
      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        .mcp-perplexity-button-base {
          color: oklch(var(--dark-text-color-200, 65.3% 0.005 197.042)); /* Dark mode inactive text */
          
          &:hover {
            color: oklch(var(--dark-text-color-100, 93% 0.003 106.451)); /* Dark mode hover text */
          }
          
          &.mcp-button-active {
            color: oklch(var(--text-super-color-100, 55.3% 0.086 208.538)); /* Keep super color in dark mode */
          }
          
          &.mcp-button-active::before {
            background-color: oklch(var(--lt-color-text-dark, 0.113 0.005 247.858)); /* Dark background equivalent */
            border-color: oklch(var(--text-super-color-100, 55.3% 0.086 208.538));
            box-shadow: 0 1px 3px 0 oklch(var(--text-super-color-100, 55.3% 0.086 208.538) / 0.2);
          }
        }
      }
      
      .mcp-perplexity-button-content {
        /* Content container styling - matches the inner div structure */
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
        font-weight: 500;
        position: relative;
        z-index: 10; /* matches relative z-10 */
        height: 32px;
        min-width: 36px;
        padding: 4px 10px; /* matches py-xs px-2.5 equivalent */
      }
      
      .mcp-perplexity-button-text {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
        color: inherit; /* Inherit color from parent */
      }
      
      /* Icon styling within button */
      .mcp-perplexity-button-base svg,
      .mcp-perplexity-button-base img {
        width: 16px;
        height: 16px;
        transition: all 300ms ease-out;
        flex-shrink: 0;
      }
      
      .mcp-perplexity-button-base img {
        border-radius: 50%;
        margin-right: 1px;
      }
      
      /* Integration with Perplexity's button group layout */
      .gap-xs .mcp-perplexity-button-base,
      .gap-sm .mcp-perplexity-button-base,
      .flex.items-center .mcp-perplexity-button-base {
        margin: 0 2px;
      }
      
      /* Special styling for group context (matches p-two flex items-center structure) */
      .p-two .mcp-perplexity-button-base,
      [class*="p-"] .mcp-perplexity-button-base {
        margin: 0 1px;
      }
      
      /* Focus-visible styling for accessibility */
      .mcp-perplexity-button-base:focus-visible {
        outline: 2px solid oklch(var(--text-super-color-100, 55.3% 0.086 208.538));
        outline-offset: 2px;
        outline-style: dashed;
      }
      
      .mcp-perplexity-button-base:focus-visible::before {
        border-style: dashed !important;
      }
      
      /* Responsive adjustments */
      @media (max-width: 640px) {
        .mcp-perplexity-button-base {
          height: 28px;
          min-width: 32px;
          padding: 0 8px;
          font-size: 13px;
        }
        
        .mcp-perplexity-button-content {
          height: 28px;
          min-width: 32px;
          padding: 2px 8px;
        }
        
        .mcp-perplexity-button-base svg,
        .mcp-perplexity-button-base img {
          width: 14px;
          height: 14px;
        }
        
        /* Adjust ring size for mobile */
        .mcp-perplexity-button-base.mcp-button-active::before {
          border-width: 1px; /* Keep consistent border width on mobile */
        }
      }
      
      /* CSS custom properties for Perplexity theming */
      :root {
        --text-color-100: 30.4% 0.04 213.681;
        --text-color-200: 50.2% 0.008 106.677;
        --text-super-color-100: 55.3% 0.086 208.538;
        --text-max-color-100: 0.77 0.1629 60.28;
        --dark-text-color-100: 93% 0.003 106.451;
        --dark-text-color-200: 65.3% 0.005 197.042;
        --light-text-color-100: 30.4% 0.04 213.681;
        --lt-color-text-dark: 0.113 0.005 247.858;
        --lt-color-text-default: 0.196 0.007 247.858;
        --lt-color-text-light: 0.373 0.008 247.858;
        --lt-color-text-very-light: 0.559 0.005 247.858;
      }
    `;
  }

  /**
   * Inject Perplexity-specific button styles into the page
   */
  private injectPerplexityButtonStyles(): void {
    if (this.adapterStylesInjected) return;
    
    try {
      const styleId = 'mcp-perplexity-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) existingStyles.remove();
      
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getPerplexityButtonStyles();
      document.head.appendChild(styleElement);
      
      this.adapterStylesInjected = true;
      this.context.logger.debug('Perplexity button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject Perplexity button styles:', error);
    }
  }
}