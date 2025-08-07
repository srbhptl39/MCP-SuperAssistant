import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * ChatZ Adapter for Chat.Z.AI (chat.z.ai)
 *
 * This adapter provides specialized functionality for interacting with Chat.Z.AI's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */
export class ChatZAdapter extends BaseAdapterPlugin {
  readonly name = 'ChatZAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['chat.z.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Chat.Z.AI's UI elements
  // Updated selectors based on current Chat.Z.AI interface
  private readonly selectors = {
    // Primary chat input selector - Chat.Z.AI uses textarea with specific attributes
    CHAT_INPUT: 'textarea#chat-input, textarea[placeholder*="Send a Message"], textarea[data-lt-tmp-id], textarea[spellcheck="false"][data-gramm="false"]',
    // Submit button selectors (multiple fallbacks)
    SUBMIT_BUTTON: 'button#send-message-button, button.sendMessageButton, button[type="submit"]',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: 'button[aria-label*="Upload Files"], button[aria-label*="More"], input[type="file"][accept*=".pdf"]',
    FILE_INPUT: 'input[type="file"][multiple][accept*=".pdf,.docx,.doc"]',
    // Main panel and container selectors
    MAIN_PANEL: '.flex.gap-1\.5.w-full, form.flex.gap-1\.5.w-full',
    // Drop zones for file attachment
    DROP_ZONE: '.flex-1.flex.flex-col.relative.w-full, .overflow-hidden.relative.px-2\.5',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, .uploaded-file',
    // Button insertion points (for MCP popover) - Chat.Z.AI specific
    BUTTON_INSERTION_CONTAINER: '.flex.gap-[8px].items-center.overflow-x-auto.scrollbar-none.flex-1, .self-end.flex.items-center.flex-1',
    // Alternative insertion points
    FALLBACK_INSERTION: '.flex.justify-between.items-center.mx-3\\.5.mt-1\\.5.mb-3\\.5, .flex.items-center, .self-end.flex.items-center.flex-1'
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
    ChatZAdapter.instanceCount++;
    this.instanceId = ChatZAdapter.instanceCount;
    console.debug(`[ChatZAdapter] Instance #${this.instanceId} created. Total instances: ${ChatZAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`ChatZ adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing ChatZ adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`ChatZ adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating ChatZ adapter instance #${this.instanceId}...`);

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
      this.context?.logger.warn('ChatZ adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating ChatZ adapter...');

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
    this.context.logger.debug('Cleaning up ChatZ adapter...');

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
   * Insert text into the ChatZ chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into ChatZ chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find ChatZ chat input element');
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
        
        // Append the text to the original value on a new line if there's existing content
        const newContent = currentText ? currentText + '\n\n' + text : text;
        textarea.value = newContent;

        // Position cursor at the end
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

        // Trigger input event
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        this.context.logger.debug(`Text inserted into textarea successfully. Original: ${currentText.length}, Added: ${text.length}, Total: ${newContent.length}`);
      } else if (targetElement.getAttribute('contenteditable') === 'true') {
        // Handle contenteditable div
        const currentText = targetElement.textContent || '';
        
        // Move cursor to the end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(targetElement);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Insert text with proper formatting
        if (currentText && currentText.trim() !== '') {
          document.execCommand('insertText', false, '\n\n');
        }
        document.execCommand('insertText', false, text);

        // Trigger input event for contenteditable
        targetElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));

        this.context.logger.debug(`Text inserted into contenteditable successfully`);
      } else {
        // Fallback for other element types
        const originalValue = (targetElement as any).value || targetElement.textContent || '';
        const newContent = originalValue ? originalValue + '\n\n' + text : text;
        
        if ('value' in targetElement) {
          (targetElement as any).value = newContent;
        } else {
          targetElement.textContent = newContent;
        }

        // Dispatch events
        targetElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));

        this.context.logger.debug(`Text inserted using fallback method`);
      }

      // Emit success event to the new event system
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        targetElementType: targetElement.tagName,
        insertedLength: text.length
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into ChatZ chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the ChatZ chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit ChatZ chat input');

    let submitButton: HTMLButtonElement | null = null;

    // Try multiple selectors for better compatibility
    const selectors = this.selectors.SUBMIT_BUTTON.split(', ');
    for (const selector of selectors) {
      submitButton = document.querySelector(selector.trim()) as HTMLButtonElement;
      if (submitButton) {
        this.context.logger.debug(`Found submit button using selector: ${selector.trim()}`);
        break;
      }
    }

    if (!submitButton) {
      this.context.logger.warn('Could not find ChatZ submit button, trying Enter key press');
      return this.tryEnterKeySubmission();
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('ChatZ submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('ChatZ submit button is not visible');
        this.emitExecutionFailed('submitForm', 'Submit button is not visible');
        return false;
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

      this.context.logger.debug('ChatZ chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting ChatZ chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Try to submit using Enter key press as fallback
   */
  private async tryEnterKeySubmission(): Promise<boolean> {
    try {
      // Find the chat input element
      const chatInput = document.querySelector(this.selectors.CHAT_INPUT.split(', ')[0].trim()) as HTMLElement;
      
      if (!chatInput) {
        this.context.logger.error('Cannot find chat input for Enter key submission');
        this.emitExecutionFailed('submitForm', 'Chat input not found for Enter key submission');
        return false;
      }

      // Create and dispatch Enter key event
      const enterKeyEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });

      chatInput.focus();
      chatInput.dispatchEvent(enterKeyEvent);

      // Emit success event
      this.emitExecutionCompleted('submitForm', {}, {
        success: true,
        method: 'enterKey',
        fallback: true
      });

      this.context.logger.debug('ChatZ chat input submitted using Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting ChatZ chat input via Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the ChatZ chat input
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

      // Try to find file input element
      let fileInput: HTMLInputElement | null = null;
      
      if (options?.inputElement) {
        fileInput = options.inputElement;
      } else {
        fileInput = document.querySelector(this.selectors.FILE_INPUT) as HTMLInputElement;
      }

      if (fileInput) {
        // Direct file input method
        const success = await this.attachFileToInput(file, fileInput);
        if (success) {
          this.emitExecutionCompleted('attachFile', {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            method: 'fileInput'
          }, {
            success: true,
            attachmentMethod: 'direct-input'
          });
          return true;
        }
      }

      // Try drag and drop simulation as fallback
      const dropSuccess = await this.simulateFileDrop(file);
      if (dropSuccess) {
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          method: 'dragDrop'
        }, {
          success: true,
          attachmentMethod: 'drag-drop-simulation'
        });
        return true;
      }

      this.emitExecutionFailed('attachFile', 'All file attachment methods failed');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to ChatZ: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
      return false;
    }
  }

  /**
   * Attach file directly to file input element
   */
  private async attachFileToInput(file: File, fileInput: HTMLInputElement): Promise<boolean> {
    try {
      // Create DataTransfer object to simulate file selection
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Trigger change event
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      this.context.logger.debug(`File attached directly to input: ${file.name}`);
      return true;
    } catch (error) {
      this.context.logger.error('Error attaching file to input:', error);
      return false;
    }
  }

  /**
   * Simulate file drop for file attachment
   */
  private async simulateFileDrop(file: File): Promise<boolean> {
    try {
      // Find drop zone
      const dropZones = this.selectors.DROP_ZONE.split(', ');
      let dropZone: Element | null = null;

      for (const selector of dropZones) {
        dropZone = document.querySelector(selector.trim());
        if (dropZone) break;
      }

      if (!dropZone) {
        this.context.logger.warn('No drop zone found for file drop simulation');
        return false;
      }

      // Create drag and drop events
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer: dataTransfer
      });

      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        dataTransfer: dataTransfer
      });

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        dataTransfer: dataTransfer
      });

      // Dispatch events
      dropZone.dispatchEvent(dragEnterEvent);
      dropZone.dispatchEvent(dragOverEvent);
      dropZone.dispatchEvent(dropEvent);

      this.context.logger.debug(`File drop simulated for: ${file.name}`);
      return true;
    } catch (error) {
      this.context.logger.error('Error simulating file drop:', error);
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

    this.context.logger.debug(`Checking if ChatZ adapter supports: ${currentUrl}`);

    // Check hostname first
    const isChatZHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isChatZHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by ChatZ adapter`);
      return false;
    }

    // Check if we're on a supported Chat.Z.AI page
    const supportedPatterns = [
      /^https?:\/\/(?:www\.)?chat\.z\.ai\/.*/,  // Chat pages
      /^https?:\/\/(?:www\.)?chat\.z\.ai$/       // Base chat page
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`ChatZ adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for ChatZ');

    // Check for drop zones
    const dropZoneSelectors = this.selectors.DROP_ZONE.split(', ');
    for (const selector of dropZoneSelectors) {
      const dropZone = document.querySelector(selector.trim());
      if (dropZone) {
        this.context.logger.debug(`Found drop zone with selector: ${selector.trim()}`);
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

    // Check for file input elements
    const fileInput = document.querySelector(this.selectors.FILE_INPUT);
    if (fileInput) {
      this.context.logger.debug('Found file input element');
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
      }, 1000); // Check every second
    }
  }

  // New architecture integration methods

  private setupStoreEventListeners(): void {
    if (this.storeEventListenersSetup) {
      this.context.logger.warn(`Store event listeners already set up for instance #${this.instanceId}, skipping`);
      return;
    }

    this.context.logger.debug(`Setting up store event listeners for ChatZ adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for ChatZ adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for ChatZ adapter instance #${this.instanceId}`);
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
    this.context.logger.debug('Cleaning up DOM observers for ChatZ adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for ChatZ adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in ChatZ adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('ChatZ adapter should not handle events, ignoring tool execution event');
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

    // Add comprehensive logging to debug selector issues
    this.context.logger.debug('Available elements on page:');
    const allElements = document.querySelectorAll('.flex');
    this.context.logger.debug(`Found ${allElements.length} elements with .flex class`);

    // Try Chat.Z.AI-specific button container first - the tools/buttons area
    // Use CSS.escape for problematic selectors or try without escaping
    let buttonContainer;
    
    // Try multiple variations of the gap selector
    const gapSelectors = [
      '.flex.gap-\\[8px\\].items-center.overflow-x-auto.scrollbar-none.flex-1',
      '.flex.gap-\\[8px\\].items-center.overflow-x-auto',
      '.flex.gap-\\[8px\\].items-center',
      '[class*="gap-"][class*="items-center"]',
      '.flex[class*="gap-8px"]'
    ];

    for (const selector of gapSelectors) {
      try {
        buttonContainer = document.querySelector(selector);
        if (buttonContainer) {
          this.context.logger.debug(`Found button container with selector: ${selector}`);
          break;
        }
      } catch (error) {
        this.context.logger.debug(`Selector failed: ${selector}, error: ${error}`);
      }
    }

    if (buttonContainer) {
      this.context.logger.debug('Found Chat.Z.AI button container');
      
      // Look for Tools button specifically
      const buttons = buttonContainer.querySelectorAll('button');
      this.context.logger.debug(`Found ${buttons.length} buttons in container`);
      
      for (const button of Array.from(buttons)) {
        const buttonText = button.textContent?.trim();
        const spanText = button.querySelector('span')?.textContent?.trim();
        this.context.logger.debug(`Button text: "${buttonText}", span text: "${spanText}"`);
        
        if (buttonText === 'Tools' || spanText === 'Tools') {
          this.context.logger.debug('Found Tools button, will insert after it');
          return { container: buttonContainer, insertAfter: button };
        }
      }

      // If Tools button not found, use last button
      const lastButton = buttonContainer.querySelector('button:last-child');
      if (lastButton) {
        this.context.logger.debug('Using last button as insertion point');
        return { container: buttonContainer, insertAfter: lastButton };
      }
    }

    // Try the main controls container with different approaches
    const mainContainerSelectors = [
      '.flex.justify-between.items-center.mx-3\\.5',
      '.flex.justify-between.items-center[class*="mx-3"]',
      '[class*="justify-between"][class*="items-center"]'
    ];

    for (const selector of mainContainerSelectors) {
      try {
        buttonContainer = document.querySelector(selector);
        if (buttonContainer) {
          this.context.logger.debug(`Found main container with selector: ${selector}`);
          // Insert at the end of the left side controls
          const leftControls = buttonContainer.querySelector('.self-end.flex.items-center.flex-1');
          if (leftControls) {
            this.context.logger.debug('Found left controls, will append MCP button there');
            return { container: leftControls, insertAfter: null }; // Append to end
          }
        }
      } catch (error) {
        this.context.logger.debug(`Main container selector failed: ${selector}, error: ${error}`);
      }
    }

    // Last resort - find any button container
    const anyButtonContainer = document.querySelector('button')?.parentElement;
    if (anyButtonContainer) {
      this.context.logger.debug('Using fallback button container (parent of first button)');
      return { container: anyButtonContainer, insertAfter: anyButtonContainer.querySelector('button:last-child') };
    }

    // Try fallback selectors for Chat.Z.AI
    const fallbackSelectors = [
      '.flex.justify-between.items-center.mx-3\\.5.mt-1\\.5.mb-3\\.5', // Main controls container
      '.self-end.flex.items-center.flex-1', // Left side controls
      '.flex.self-end.space-x-1.shrink-0', // Right side controls
      '.flex.items-center', // Generic controls container
      '.chat-input-actions',
      '.input-actions'
    ];

    for (const selector of fallbackSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        this.context.logger.debug(`Found fallback insertion point: ${selector}`);
        // For these fallback containers, try to find a suitable insertion point
        if (container.parentElement) {
          return { container: container.parentElement, insertAfter: container };
        } else {
          return { container, insertAfter: null };
        }
      }
    }

    this.context.logger.debug('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into ChatZ interface');

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

            // Chat.Z.AI specific button styling configuration
            const adapterButtonConfig = {
              className: 'chatz-mcp-button',
              contentClassName: 'chatz-mcp-content',
              textClassName: 'chatz-mcp-text',
              iconClassName: 'chatz-mcp-icon',
              activeClassName: 'chatz-mcp-active',
              // customIcon: this.createMCPIcon()
            };

            // Create React root and render with Chat.Z.AI styling
            const root = ReactDOM.createRoot(container);
            root.render(
              React.createElement(MCPPopover, {
                toggleStateManager: toggleStateManager,
                adapterButtonConfig: adapterButtonConfig,
                adapterName: 'Chat.Z.AI'
              })
            );

            // Inject Chat.Z.AI specific styles
            this.injectChatZAIStyles();

            this.context.logger.debug('MCP popover rendered successfully with Chat.Z.AI theme');
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

  /**
   * Create MCP icon SVG that matches Chat.Z.AI's style
   */
  private createMCPIcon(): string {
    return `
      <svg class="chatz-mcp-icon" stroke-width="1.5" width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.8">
          <!-- MCP Network/Connection Icon -->
          <circle cx="4" cy="4.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <circle cx="12" cy="4.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <circle cx="8" cy="12.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <line x1="5.5" y1="5.5" x2="6.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="10.5" y1="5.5" x2="9.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="6" y1="4.5" x2="10" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </svg>
    `;
  }

  /**
   * Inject Chat.Z.AI specific styles for MCP button
   */
  private injectChatZAIStyles(): void {
    const styleId = 'chatz-mcp-styles';
    if (document.getElementById(styleId)) {
      return; // Styles already injected
    }

    const styles = `
      /* Chat.Z.AI MCP Button Styles - Exactly matching Auto Think button */
      .chatz-mcp-button {
        /* Matching: flex gap-1.5 items-center px-2.5 py-1.5 text-sm rounded-lg border */
        display: flex;
        gap: 6px; /* gap-1.5 = 6px */
        align-items: center;
        padding: 6px 10px; /* px-2.5 py-1.5 = horizontal 10px, vertical 6px */
        font-size: 14px; /* text-sm */
        border-radius: 8px; /* rounded-lg */
        border: 1px solid;
        
        /* Default state styles */
        border-color: rgb(0 0 0 / 0.1); /* border-black/10 */
        background: transparent; /* bg-transparent */
        transition: all 0.2s ease; /* transition-all */
        cursor: pointer;
        color: inherit;
        font-weight: normal;
        white-space: nowrap;
        box-sizing: border-box;
      }

      /* Disabled state: disabled:cursor-not-allowed disabled:text-gray-500 */
      .chatz-mcp-button:disabled {
        cursor: not-allowed;
        color: rgb(107 114 128); /* text-gray-500 */
      }

      /* Hover state when inactive: data-[autoThink=false]:hover:bg-black/5 */
      .chatz-mcp-button:hover:not([data-mcp="true"]) {
        background: rgb(0 0 0 / 0.05); /* bg-black/5 */
      }

      /* Active state: data-[autoThink=true]:bg-[#DAEEFF] data-[autoThink=true]:border-[#0068E00A] */
      .chatz-mcp-button[data-mcp="true"] {
        background: #DAEEFF; /* bg-[#DAEEFF] */
        border-color: #0068E00A; /* border-[#0068E00A] */
      }

      /* Dark mode base: dark:border-white/10 dark:text-white/80 */
      @media (prefers-color-scheme: dark) {
        .chatz-mcp-button {
          border-color: rgb(255 255 255 / 0.1); /* dark:border-white/10 */
          color: rgb(255 255 255 / 0.8); /* dark:text-white/80 */
        }

        /* Dark hover when inactive: data-[autoThink=false]:dark:hover:bg-white/5 */
        .chatz-mcp-button:hover:not([data-mcp="true"]) {
          background: rgb(255 255 255 / 0.05); /* dark:hover:bg-white/5 */
        }

        /* Dark active state: data-[autoThink=true]:dark:bg-white/10 data-[autoThink=true]:dark:border-white/10 data-[autoThink=true]:dark:text-white */
        .chatz-mcp-button[data-mcp="true"] {
          background: rgb(255 255 255 / 0.1); /* dark:bg-white/10 */
          border-color: rgb(255 255 255 / 0.1); /* dark:border-white/10 */
          color: rgb(255 255 255); /* dark:text-white */
        }

        .chatz-mcp-button:disabled {
          color: rgb(107 114 128); /* Keep same disabled color in dark */
        }
      }

      /* Icon sizing to match Auto Think's size-4 (16px) */
      .chatz-mcp-icon {
        width: 16px; /* size-4 */
        height: 16px; /* size-4 */
        flex-shrink: 0;
      }

      /* Text styling inherits from button */
      .chatz-mcp-text {
        font-size: inherit;
        font-weight: inherit;
        line-height: inherit;
      }

      /* Container styling */
      .chatz-mcp-content {
        display: flex;
        gap: 6px; /* gap-1.5 */
        align-items: center;
      }

      /* Integration with Chat.Z.AI button container */
      #mcp-popover-container {
        display: inline-flex;
        align-items: center;
        margin: 0;
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    this.context.logger.debug('Chat.Z.AI MCP styles injected');
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
   * Debug method to log current page structure for troubleshooting
   */
  public debugPageStructure(): void {
    this.context.logger.debug('=== Chat.Z.AI Page Structure Debug ===');
    
    // Log all form elements
    const forms = document.querySelectorAll('form');
    this.context.logger.debug(`Found ${forms.length} form elements`);
    forms.forEach((form, index) => {
      this.context.logger.debug(`Form ${index}: classes = "${form.className}"`);
    });
    
    // Log all button containers
    const flexElements = document.querySelectorAll('.flex');
    this.context.logger.debug(`Found ${flexElements.length} flex elements`);
    flexElements.forEach((el, index) => {
      if (el.querySelectorAll('button').length > 0) {
        this.context.logger.debug(`Flex ${index} with buttons: classes = "${el.className}", buttons = ${el.querySelectorAll('button').length}`);
      }
    });
    
    // Log all buttons with their text
    const buttons = document.querySelectorAll('button');
    this.context.logger.debug(`Found ${buttons.length} button elements`);
    buttons.forEach((btn, index) => {
      const text = btn.textContent?.trim();
      const span = btn.querySelector('span')?.textContent?.trim();
      this.context.logger.debug(`Button ${index}: text="${text}", span="${span}", classes="${btn.className}"`);
    });
    
    // Try current insertion logic
    const insertionPoint = this.findButtonInsertionPoint();
    if (insertionPoint) {
      this.context.logger.debug('✅ Found insertion point:', insertionPoint);
    } else {
      this.context.logger.debug('❌ No insertion point found');
    }
    
    this.context.logger.debug('=== End Debug ===');
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
    return `chatz-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`ChatZ page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
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
    this.context.logger.debug(`ChatZ host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('ChatZ adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in ChatZ adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }
}
