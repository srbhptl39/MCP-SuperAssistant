import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * OpenRouter Adapter for OpenRouter (openrouter.ai)
 *
 * This adapter provides specialized functionality for interacting with OpenRouter's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Built with the new plugin architecture and integrates with Zustand stores.
 */
export class OpenRouterAdapter extends BaseAdapterPlugin {
  readonly name = 'OpenRouterAdapter';
  readonly version = '2.0.0';
  readonly hostnames = ['openrouter.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation',
  ];

  // CSS selectors for OpenRouter's UI elements
  private readonly selectors = {
    // Primary chat input selector - updated for new structure
    CHAT_INPUT:
      'textarea[placeholder="Start a new message..."], textarea[placeholder="Start a new message..."].w-full, div[contenteditable="true"]',
    // Submit button selectors - updated for new structure
    SUBMIT_BUTTON:
      'button[data-state="closed"] svg[stroke="currentColor"] path[d*="M4.5 10.5"], button[aria-label="Send message"], button[data-testid="send-button"], button[aria-label="Send prompt"]',
    // File upload related selectors - updated for new attachment button
    FILE_UPLOAD_BUTTON:
      'button svg[fill="currentColor"] path[fill-rule="evenodd"][d*="M18.97 3.659"], button[aria-label="Attach file"], button[aria-label*="attach"], input[type="file"]',
    FILE_INPUT: 'input[type="file"]',
    // Main panel and container selectors - updated for new structure
    MAIN_PANEL:
      '.rounded-xl.overflow-hidden.p-2.border.border-slate-4, .chat-container, .main-content, .conversation-container',
    // Drop zones for file attachment - updated for new structure
    DROP_ZONE: 'textarea[placeholder="Start a message..."], .rounded-lg.w-full, .chat-input-area, .input-container',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, .file-attachment',
    // Button insertion points (for MCP popover) - updated for new button container
    BUTTON_INSERTION_CONTAINER:
      '.relative.flex.w-full.min-w-0.items-center.gap-1, .flex.gap-1, .input-actions, .chat-input-actions',
    // Alternative insertion points
    FALLBACK_INSERTION: '.flex.gap-1, .input-area, .chat-input-container, .conversation-input',
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

  constructor() {
    super();
    OpenRouterAdapter.instanceCount++;
    this.instanceId = OpenRouterAdapter.instanceCount;
    console.debug(
      `[OpenRouterAdapter] Instance #${this.instanceId} created. Total instances: ${OpenRouterAdapter.instanceCount}`,
    );
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(
        `OpenRouter adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`,
      );
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing OpenRouter adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(
        `OpenRouter adapter instance #${this.instanceId} already active, skipping re-activation`,
      );
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating OpenRouter adapter instance #${this.instanceId}...`);

    // Set up DOM observers and UI integration
    this.setupDOMObservers();
    this.setupUIIntegration();

    // Emit activation event for store synchronization
    this.context.eventBus.emit('adapter:activated', {
      pluginName: this.name,
      timestamp: Date.now(),
    });
  }

  async deactivate(): Promise<void> {
    // Guard against double deactivation
    if (this.currentStatus === 'inactive' || this.currentStatus === 'disabled') {
      this.context?.logger.warn('OpenRouter adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating OpenRouter adapter...');

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
      timestamp: Date.now(),
    });
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    this.context.logger.debug('Cleaning up OpenRouter adapter...');

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

    // Final cleanup
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();

    // Reset all setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;
  }

  /**
   * Insert text into the OpenRouter chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(
      `Attempting to insert text into OpenRouter chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
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
      this.context.logger.error('Could not find OpenRouter chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Focus the input element
      targetElement.focus();

      // Handle different input types
      if (targetElement.tagName === 'TEXTAREA') {
        const textarea = targetElement as HTMLTextAreaElement;
        const currentText = textarea.value;
        const newContent = currentText ? `${currentText}\n\n${text}` : text;
        textarea.value = newContent;

        // Position cursor at the end
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

        // Trigger input event
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else if (targetElement.getAttribute('contenteditable') === 'true') {
        // For contenteditable elements
        const currentText = targetElement.textContent || '';
        const newContent = currentText ? `${currentText}\n\n${text}` : text;

        // Use execCommand for better compatibility with contenteditable
        if (currentText) {
          // Move cursor to end and insert newlines + text
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(targetElement);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);

          document.execCommand('insertText', false, `\n\n${text}`);
        } else {
          document.execCommand('insertText', false, text);
        }

        // Trigger input event
        targetElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        // Fallback for other element types
        const currentText = targetElement.textContent || '';
        const newContent = currentText ? `${currentText}\n\n${text}` : text;
        targetElement.textContent = newContent;

        // Trigger input event
        targetElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }

      // Additional events for better compatibility
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Emit success event
      this.emitExecutionCompleted(
        'insertText',
        { text },
        {
          success: true,
          textLength: text.length,
          elementType: targetElement.tagName,
        },
      );

      this.context.logger.debug(`Text inserted successfully into OpenRouter chat input`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into OpenRouter chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the OpenRouter chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit OpenRouter chat input');

    try {
      // First try to find submit button
      let submitButton: HTMLButtonElement | null = null;
      const selectors = this.selectors.SUBMIT_BUTTON.split(', ');

      for (const selector of selectors) {
        const element = document.querySelector(selector.trim());
        if (element) {
          // Handle SVG case where we need to find the parent button
          if (element.tagName === 'svg' || element.tagName === 'path') {
            submitButton = element.closest('button') as HTMLButtonElement;
          } else {
            submitButton = element as HTMLButtonElement;
          }

          if (submitButton) {
            this.context.logger.debug(`Found submit button using selector: ${selector.trim()}`);
            break;
          }
        }
      }

      // Additional check for the new send button structure
      if (!submitButton) {
        // Look for the send button by its specific characteristics
        const sendButtons = document.querySelectorAll('button');
        for (let i = 0; i < sendButtons.length; i++) {
          const button = sendButtons[i];
          const svg = button.querySelector('svg[stroke="currentColor"]');
          const path = svg?.querySelector('path[d*="M4.5 10.5"]');
          if (path && svg) {
            submitButton = button as HTMLButtonElement;
            this.context.logger.debug('Found submit button by SVG path structure');
            break;
          }
        }
      }

      if (submitButton) {
        // Check if button is enabled
        if (submitButton.disabled || submitButton.getAttribute('aria-disabled') === 'true') {
          this.context.logger.warn('OpenRouter submit button is disabled, trying alternative methods');
        } else {
          // Try clicking the button
          submitButton.click();

          this.emitExecutionCompleted(
            'submitForm',
            {
              formElement: options?.formElement?.tagName || 'unknown',
            },
            {
              success: true,
              method: 'submitButton.click',
            },
          );

          this.context.logger.debug('OpenRouter chat input submitted successfully via button click');
          return true;
        }
      }

      // Fallback: Try form submission
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT.split(', ')[0]) as HTMLElement;
      if (chatInput) {
        const form = chatInput.closest('form');
        if (form) {
          const submitEvent = new SubmitEvent('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);

          this.emitExecutionCompleted(
            'submitForm',
            {},
            {
              success: true,
              method: 'form.submit',
            },
          );

          this.context.logger.debug('OpenRouter chat input submitted successfully via form submission');
          return true;
        }
      }

      // Final fallback: Simulate Enter key press
      if (chatInput) {
        chatInput.focus();

        const keyEvents = [
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
          new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
          new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        ];

        keyEvents.forEach(event => chatInput.dispatchEvent(event));

        this.emitExecutionCompleted(
          'submitForm',
          {},
          {
            success: true,
            method: 'enter-key-simulation',
          },
        );

        this.context.logger.debug('OpenRouter chat input submitted successfully via Enter key simulation');
        return true;
      }

      this.emitExecutionFailed('submitForm', 'No submission method available');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting OpenRouter chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the OpenRouter chat input
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

      // Check if file upload is supported
      if (!this.supportsFileUpload()) {
        this.emitExecutionFailed('attachFile', 'File upload not supported on current page');
        return false;
      }

      // // Method 1: Try clicking the attachment button first
      // const attachmentButton = this.findAttachmentButton();
      // if (attachmentButton) {
      //   this.context.logger.debug('Found attachment button, attempting click method');

      //   // Click the attachment button to potentially open file dialog
      //   attachmentButton.click();

      //   // Wait a bit for any file input to appear
      //   await new Promise(resolve => setTimeout(resolve, 100));

      //   // Look for file input that might have been created
      //   const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      //   if (fileInput) {
      //     this.context.logger.debug('Found file input, setting files');

      //     // Create a new FileList with our file
      //     const dataTransfer = new DataTransfer();
      //     dataTransfer.items.add(file);
      //     fileInput.files = dataTransfer.files;

      //     // Trigger change event
      //     fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      //     // Check for success
      //     const previewFound = await this.checkFilePreview();
      //     if (previewFound) {
      //       this.emitExecutionCompleted('attachFile', {
      //         fileName: file.name,
      //         fileType: file.type,
      //         fileSize: file.size,
      //         method: 'file-input-click'
      //       }, {
      //         success: true,
      //         previewFound: true,
      //         method: 'file-input-click'
      //       });

      //       this.context.logger.debug(`File attached successfully via file input: ${file.name}`);
      //       return true;
      //     }
      //   }
      // }

      // Method 2: Try drag and drop on the main chat container
      // const dropTargets = [
      //   // Try the main chat container first
      //   document.querySelector('.rounded-xl.overflow-hidden.p-2.border.border-slate-4'),
      //   // Try the input area
      //   document.querySelector('.rounded-lg.w-full'),
      //   // Try the textarea itself
      //   document.querySelector(this.selectors.CHAT_INPUT.split(', ')[0]),
      //   // Try the scroll area
      //   document.querySelector('[data-radix-scroll-area-viewport]'),
      //   // Fallback to the flex container
      //   document.querySelector('.flex.gap-1')
      // ];

      // for (const dropTarget of dropTargets) {
      //   if (dropTarget) {
      //     this.context.logger.debug(`Attempting drag-drop on: ${dropTarget.className || dropTarget.tagName}`);

      //     const success = await this.tryDragDropAttachment(file, dropTarget as HTMLElement);
      //     if (success) {
      //       return true;
      //     }
      //   }
      // }

      // Method 3: Try creating a hidden file input and programmatically triggering it
      // const success = await this.tryHiddenFileInput(file);
      // if (success) {
      //   return true;
      // }

      this.emitExecutionFailed('attachFile', 'All attachment methods failed');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to OpenRouter: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
      return false;
    }
  }

  /**
   * Find the attachment button in the new OpenRouter interface
   */
  private findAttachmentButton(): HTMLButtonElement | null {
    // Look for the attachment button using the new structure
    const buttons = document.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const svg = button.querySelector('svg[fill="currentColor"]');
      const path = svg?.querySelector('path[fill-rule="evenodd"][d*="M18.97 3.659"]');
      if (path && svg) {
        this.context.logger.debug('Found attachment button by SVG path structure');
        return button as HTMLButtonElement;
      }
    }

    // Fallback selectors
    const fallbackSelectors = [
      'button[aria-label="Attach file"]',
      'button[aria-label*="attach"]',
      'input[type="file"]',
    ];

    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        if (element.tagName === 'INPUT') {
          // If it's an input, look for a related button
          const button = element.closest('button') || element.parentElement?.querySelector('button');
          if (button) {
            return button as HTMLButtonElement;
          }
        } else {
          return element as HTMLButtonElement;
        }
      }
    }

    this.context.logger.debug('No attachment button found');
    return null;
  }

  /**
   * Try drag and drop file attachment on a target element
   */
  private async tryDragDropAttachment(file: File, targetElement: HTMLElement): Promise<boolean> {
    try {
      this.context.logger.debug(
        `Attempting drag-drop attachment on: ${targetElement.tagName}.${targetElement.className}`,
      );

      // Create DataTransfer object and add file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create sequence of drag events
      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });

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

      // Add event listeners to prevent default behavior
      const preventDefault = (e: Event) => e.preventDefault();
      targetElement.addEventListener('dragenter', preventDefault, { once: true });
      targetElement.addEventListener('dragover', preventDefault, { once: true });

      // Dispatch events in sequence
      targetElement.dispatchEvent(dragEnterEvent);
      await new Promise(resolve => setTimeout(resolve, 50));

      targetElement.dispatchEvent(dragOverEvent);
      await new Promise(resolve => setTimeout(resolve, 50));

      targetElement.dispatchEvent(dropEvent);

      // Wait and check for file preview
      const previewFound = await this.checkFilePreview();

      if (previewFound) {
        this.emitExecutionCompleted(
          'attachFile',
          {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            targetElement: targetElement.tagName,
          },
          {
            success: true,
            previewFound: true,
            method: 'drag-drop-simulation',
          },
        );

        this.context.logger.debug(`File attached successfully via drag-drop: ${file.name}`);
        return true;
      }

      return false;
    } catch (error) {
      this.context.logger.error('Error in drag-drop attachment:', error);
      return false;
    }
  }

  /**
   * Try creating a hidden file input and programmatically triggering it
   */
  private async tryHiddenFileInput(file: File): Promise<boolean> {
    try {
      this.context.logger.debug('Attempting hidden file input method');

      // Create a hidden file input
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'file';
      hiddenInput.style.display = 'none';
      hiddenInput.accept = '*/*';

      // Add to DOM temporarily
      document.body.appendChild(hiddenInput);

      // Create FileList with our file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      hiddenInput.files = dataTransfer.files;

      // Try to trigger change event and look for any reaction
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));

      // Also try input event
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait a moment and check for file preview
      await new Promise(resolve => setTimeout(resolve, 500));
      const previewFound = await this.checkFilePreview();

      // Clean up
      document.body.removeChild(hiddenInput);

      if (previewFound) {
        this.emitExecutionCompleted(
          'attachFile',
          {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          },
          {
            success: true,
            previewFound: true,
            method: 'hidden-file-input',
          },
        );

        this.context.logger.debug(`File attached successfully via hidden input: ${file.name}`);
        return true;
      }

      return false;
    } catch (error) {
      this.context.logger.error('Error in hidden file input method:', error);
      return false;
    }
  }

  /**
   * Check if the current page/URL is supported by this adapter
   */
  isSupported(): boolean | Promise<boolean> {
    const currentHost = window.location.hostname;
    const currentUrl = window.location.href;

    this.context.logger.debug(`Checking if OpenRouter adapter supports: ${currentUrl}`);

    // // Check hostname
    // const isOpenRouterHost = this.hostnames.some(hostname => {
    //   if (typeof hostname === 'string') {
    //     return currentHost.includes(hostname);
    //   }
    //   return (hostname as RegExp).test(currentHost);
    // });

    // if (!isOpenRouterHost) {
    //   this.context.logger.debug(`Host ${currentHost} not supported by OpenRouter adapter`);
    //   return false;
    // }

    // Check for supported OpenRouter pages
    const supportedPatterns = [
      /^https:\/\/openrouter\.ai\/chat.*$/,
      // /^https:\/\/openrouter\.ai\/playground.*$/,
      // /^https:\/\/openrouter\.ai\/$/ // Homepage with chat interface
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`OpenRouter adapter supports current page: ${currentUrl}`);
    } else {
      this.context.logger.debug(`URL pattern not supported: ${currentUrl}`);
    }

    return isSupported;
  }

  /**
   * Check if file upload is supported on the current page
   */
  supportsFileUpload(): boolean {
    this.context.logger.debug('Checking file upload support for OpenRouter');

    // Check for the new attachment button structure
    const attachmentButton = this.findAttachmentButton();
    if (attachmentButton) {
      this.context.logger.debug('Found attachment button - file upload supported');
      return true;
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

    // Check for file upload buttons or inputs
    const uploadSelectors = [...this.selectors.FILE_UPLOAD_BUTTON.split(', '), this.selectors.FILE_INPUT];

    for (const selector of uploadSelectors) {
      const uploadElement = document.querySelector(selector.trim());
      if (uploadElement) {
        this.context.logger.debug(`Found upload element with selector: ${selector.trim()}`);
        return true;
      }
    }

    // Check if we're on a chat page (which should support file upload)
    const currentUrl = window.location.href;
    if (currentUrl.includes('/chat')) {
      this.context.logger.debug('On chat page - assuming file upload is supported');
      return true;
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
      }, 1000);
    }
  }

  private setupStoreEventListeners(): void {
    if (this.storeEventListenersSetup) {
      this.context.logger.warn(`Store event listeners already set up for instance #${this.instanceId}, skipping`);
      return;
    }

    this.context.logger.debug(`Setting up store event listeners for OpenRouter adapter instance #${this.instanceId}`);

    // Listen for tool execution events from the store
    this.context.eventBus.on('tool:execution-completed', data => {
      this.context.logger.debug('Tool execution completed:', data);
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

    this.context.logger.debug(`Setting up DOM observers for OpenRouter adapter instance #${this.instanceId}`);

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
        // Only attempt re-injection if we're on a chat page
        const currentUrl = window.location.href;
        if (currentUrl.includes('/chat')) {
          // Only attempt re-injection if we can find an insertion point
          const insertionPoint = this.findButtonInsertionPoint();
          if (insertionPoint) {
            this.context.logger.debug('MCP popover removed, attempting to re-inject');
            this.setupUIIntegration();
          }
        }
      }
    });

    // Start observing
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.domObserversSetup = true;
  }

  private setupUIIntegration(): void {
    if (this.uiIntegrationSetup) {
      this.context.logger.debug(
        `UI integration already set up for instance #${this.instanceId}, re-injecting for page changes`,
      );
    } else {
      this.context.logger.debug(`Setting up UI integration for OpenRouter adapter instance #${this.instanceId}`);
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

      // Only attempt re-injection if we're on a chat page
      const currentUrl = window.location.href;
      if (
        !currentUrl.includes('/chat') ||
        !this.isSupported()
      ) {
        this.context.logger.debug('Not on a supported chat page, skipping MCP popover injection');
        return;
      }

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
        this.context.logger.debug(`Insertion point not found, retrying in 1 second (attempt ${attempt}/${maxRetries})`);
        setTimeout(() => attemptInjection(attempt + 1), 1000);
      } else {
        this.context.logger.warn('Failed to inject MCP popover after maximum retries');
      }
    };

    attemptInjection(1);
  }

  private setupPeriodicPopoverCheck(): void {
    if (!this.popoverCheckInterval) {
      this.popoverCheckInterval = setInterval(() => {
        if (!document.getElementById('mcp-popover-container')) {
          // Only attempt re-injection if we can find an insertion point
          const insertionPoint = this.findButtonInsertionPoint();
          if (insertionPoint) {
            this.context.logger.debug('MCP popover missing, attempting to re-inject');
            this.injectMCPPopoverWithRetry(3);
          }
        }
      }, 5000);
    }
  }

  private cleanupDOMObservers(): void {
    this.context.logger.debug('Cleaning up DOM observers for OpenRouter adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for OpenRouter adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in OpenRouter adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('OpenRouter adapter should not handle events, ignoring tool execution event');
      return;
    }

    // Get current UI state from stores to determine auto-actions
    const uiState = this.context.stores.ui;
    if (uiState && data.execution) {
      this.context.logger.debug('Tool execution handled with new architecture integration');
    }
  }

  private findButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
    this.context.logger.debug('Finding button insertion point for MCP popover');

    // Try primary selector first - using the configured selectors
    const primarySelectors = this.selectors.BUTTON_INSERTION_CONTAINER.split(', ');

    for (const selector of primarySelectors) {
      const wrapper = document.querySelector(selector.trim());
      if (wrapper) {
        this.context.logger.debug(`Found insertion point: ${selector.trim()}`);
        // Look for Web Search button/div to insert after
        let webSearchContainer: Element | null = null;

        // Find the web search container by looking for the text content
        const flexElements = wrapper.querySelectorAll('div.inline-flex.items-center');
        for (let i = 0; i < flexElements.length; i++) {
          const element = flexElements[i];
          if (element.textContent?.includes('Web search')) {
            webSearchContainer = element;
            break;
          }
        }

        // Fallback: look for the web search icon
        if (!webSearchContainer) {
          webSearchContainer =
            wrapper
              .querySelector('div.inline-flex.items-center svg[stroke="currentColor"] path[d*="M12 21a9.004"]')
              ?.closest('div.inline-flex.items-center') || null;
        }

        return { container: wrapper, insertAfter: webSearchContainer };
      }
    }

    // Try fallback selectors from the configuration
    const fallbackSelectors = this.selectors.FALLBACK_INSERTION.split(', ');

    for (const selector of fallbackSelectors) {
      const container = document.querySelector(selector.trim());
      if (container) {
        this.context.logger.debug(`Found fallback insertion point: ${selector.trim()}`);
        return { container, insertAfter: null };
      }
    }

    this.context.logger.debug('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into OpenRouter interface');

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
      import('react')
        .then(React => {
          import('react-dom/client')
            .then(ReactDOM => {
              import('../../components/mcpPopover/mcpPopover')
                .then(({ MCPPopover }) => {
                  // Create toggle state manager that integrates with new stores
                  const toggleStateManager = this.createToggleStateManager();

                  // Create React root and render
                  const root = ReactDOM.createRoot(container);
                  root.render(
                    React.createElement(MCPPopover, {
                      toggleStateManager: toggleStateManager,
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

    const stateManager = {
      getState: () => {
        try {
          const uiState = context.stores.ui;
          const mcpEnabled = uiState?.mcpEnabled ?? false;
          const autoSubmitEnabled = uiState?.preferences?.autoSubmit ?? false;

          context.logger.debug(`Getting MCP toggle state: mcpEnabled=${mcpEnabled}, autoSubmit=${autoSubmitEnabled}`);

          return {
            mcpEnabled: mcpEnabled,
            autoInsert: autoSubmitEnabled,
            autoSubmit: autoSubmitEnabled,
            autoExecute: false,
          };
        } catch (error) {
          context.logger.error('Error getting toggle state:', error);
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
          // Primary method: Control MCP state through UI store
          if (context.stores.ui?.setMCPEnabled) {
            context.stores.ui.setMCPEnabled(enabled, 'mcp-popover-toggle');
            context.logger.debug(`MCP state set to: ${enabled} via UI store`);
          } else {
            context.logger.warn('UI store setMCPEnabled method not available');

            // Fallback: Control sidebar visibility directly
            if (context.stores.ui?.setSidebarVisibility) {
              context.stores.ui.setSidebarVisibility(enabled, 'mcp-popover-toggle-fallback');
              context.logger.debug(`Sidebar visibility set to: ${enabled} via UI store fallback`);
            }
          }

          // Secondary method: Control through global sidebar manager
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

        if (context.stores.ui?.updatePreferences) {
          context.stores.ui.updatePreferences({ autoSubmit: enabled });
        }

        stateManager.updateUI();
      },

      setAutoSubmit: (enabled: boolean) => {
        context.logger.debug(`Setting Auto Submit ${enabled ? 'enabled' : 'disabled'}`);

        if (context.stores.ui?.updatePreferences) {
          context.stores.ui.updatePreferences({ autoSubmit: enabled });
        }

        stateManager.updateUI();
      },

      setAutoExecute: (enabled: boolean) => {
        context.logger.debug(`Setting Auto Execute ${enabled ? 'enabled' : 'disabled'}`);
        stateManager.updateUI();
      },

      updateUI: () => {
        context.logger.debug('Updating MCP popover UI');

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

  private async checkFilePreview(): Promise<boolean> {
    return new Promise(resolve => {
      setTimeout(() => {
        // Check for common file preview indicators
        const previewSelectors = [
          this.selectors.FILE_PREVIEW,
          '.file-attachment',
          '.attachment-preview',
          '.file-upload-preview',
          '[data-testid*="file"]',
          '[data-testid*="attachment"]',
          '.uploaded-file',
          '.file-item',
          // Check for any elements that might indicate a file was added
          '[class*="file"]',
          '[class*="attachment"]',
          '[class*="upload"]',
        ];

        for (const selector of previewSelectors) {
          const elements = document.querySelectorAll(selector);
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i] as HTMLElement;
            // Check if element is visible and has content
            if (
              element &&
              element.offsetHeight > 0 &&
              element.offsetWidth > 0 &&
              (element.textContent?.trim() || element.querySelector('img, svg'))
            ) {
              this.context.logger.debug(`File preview found with selector: ${selector}`);
              resolve(true);
              return;
            }
          }
        }

        // Alternative check: look for changes in the DOM that might indicate file upload
        const chatContainer = document.querySelector('.rounded-xl.overflow-hidden.p-2.border.border-slate-4');
        if (chatContainer) {
          const images = chatContainer.querySelectorAll('img');
          const newFiles = chatContainer.querySelectorAll('[data-file], [data-attachment]');
          if (images.length > 0 || newFiles.length > 0) {
            this.context.logger.debug('File content detected in chat container');
            resolve(true);
            return;
          }
        }

        this.context.logger.debug('No file preview found');
        resolve(false);
      }, 1000); // Wait longer to allow for processing
    });
  }

  private emitExecutionCompleted(toolName: string, parameters: any, result: any): void {
    this.context.eventBus.emit('tool:execution-completed', {
      execution: {
        id: this.generateCallId(),
        toolName,
        parameters,
        result,
        timestamp: Date.now(),
        status: 'success',
      },
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
    return `openrouter-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Public method to manually inject MCP popover
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

  // Event handlers
  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.debug(`OpenRouter page changed: from ${oldUrl || 'N/A'} to ${url}`);

    this.lastUrl = url;

    const stillSupported = this.isSupported();
    if (stillSupported) {
      setTimeout(() => {
        this.setupUIIntegration();
      }, 1000);

      setTimeout(() => {
        this.checkAndRestoreSidebar();
      }, 1500);
    } else {
      this.context.logger.warn('Page no longer supported after navigation');
    }

    this.context.eventBus.emit('app:site-changed', {
      site: url,
      hostname: window.location.hostname,
    });
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context.logger.debug(`OpenRouter host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('OpenRouter adapter no longer supported on this host/page');
      this.context.eventBus.emit('adapter:deactivated', {
        pluginName: this.name,
        timestamp: Date.now(),
      });
    } else {
      this.setupUIIntegration();
    }
  }

  onToolDetected?(tools: any[]): void {
    this.context.logger.debug(`Tools detected in OpenRouter adapter:`, tools);

    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  private checkAndRestoreSidebar(): void {
    this.context.logger.debug('Checking sidebar state after page navigation');

    try {
      const activeSidebarManager = (window as any).activeSidebarManager;

      if (!activeSidebarManager) {
        this.context.logger.warn('No active sidebar manager found after navigation');
        return;
      }

      // this.ensureMCPPopoverConnection();
    } catch (error) {
      this.context.logger.error('Error checking sidebar state after navigation:', error);
    }
  }

  private ensureMCPPopoverConnection(): void {
    this.context.logger.debug('Ensuring MCP popover connection after navigation');

    try {
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
}
