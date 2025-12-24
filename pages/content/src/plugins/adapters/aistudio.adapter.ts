import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
// import { 
//   findChatInputElement, 
//   insertTextToChatInput, 
//   attachFileToChatInput, 
//   submitChatInput 
// } from '../../components/websites/aistudio/chatInputHandler';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * AI Studio Adapter for Google AI Studio (aistudio.google.com)
 *
 * This adapter provides specialized functionality for interacting with Google AI Studio's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */

const logger = createLogger('AIStudioAdapter');

export class AIStudioAdapter extends BaseAdapterPlugin {
  readonly name = 'AIStudioAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['aistudio.google.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for AI Studio's UI elements
  // Simplified since we're using chatInputHandler for most operations
  private readonly selectors = {
    // Button insertion points (for MCP popover) - looking for prompt input wrapper
    BUTTON_INSERTION_CONTAINER: '.prompt-input-wrapper, .actions-container, footer .actions-container',
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

  // Adapter styling integration
  private adapterStylesInjected: boolean = false;

  constructor() {
    super();
    AIStudioAdapter.instanceCount++;
    this.instanceId = AIStudioAdapter.instanceCount;
    logger.debug(`Instance #${this.instanceId} created. Total instances: ${AIStudioAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`AI Studio adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing AI Studio adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`AI Studio adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating AI Studio adapter instance #${this.instanceId}...`);

    // Inject adapter-specific button styles
    this.injectAIStudioButtonStyles();

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
      this.context?.logger.warn('AI Studio adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating AI Studio adapter...');

    // Clean up UI integration
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();

    // Remove injected adapter styles
    const styleElement = document.getElementById('mcp-aistudio-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.adapterStylesInjected = false;
    }

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
    this.context.logger.debug('Cleaning up AI Studio adapter...');

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
    const styleElement = document.getElementById('mcp-aistudio-button-styles');
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
   * Get AI Studio-specific button styles that match Material Design Components
   */
  private getAIStudioButtonStyles(): string {
    return `
      .mcp-aistudio-button-base {
        /* Base Material Design button styling */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: none;
        outline: none;
        line-height: inherit;
        user-select: none;
        appearance: none;
        overflow: visible;
        vertical-align: middle;
        background: transparent;
        
        /* AI Studio Color System */
        color: var(--color-on-surface);
        background-color: transparent;
        
        /* Typography */
        font-family: 'Google Sans', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.0892857143em;
        text-decoration: none;
        text-transform: none;
        
        /* Spacing and sizing */
        padding: 8px 16px;
        min-width: 64px;
        height: 36px;
        border-radius: 18px;
        
        /* Transitions */
        transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                    box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                    border-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                    color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
        
        /* Focus and active states */
        position: relative;
        cursor: pointer;
        margin: 0 4px;
      }
      
      .mcp-aistudio-button-base:hover {
        background-color: var(--color-surface-container);
        color: var(--color-primary);
      }
      
      .mcp-aistudio-button-base:focus {
        outline: none;
        box-shadow: 0 0 0 2px var(--color-primary-container);
      }
      
      .mcp-aistudio-button-base:active {
        background-color: var(--color-surface-container-high);
        transform: translateY(1px);
      }
      
      .mcp-aistudio-button-base.inactive {
        color: var(--color-on-surface-variant);
        background-color: var(--color-run-button-disabled-background-transparent, rgba(226, 226, 229, 0.9));
        border: 1px solid var(--color-outline-variant);
      }
      
      .mcp-aistudio-button-base.inactive:hover {
        background-color: var(--color-surface-container);
        color: var(--color-on-surface);
      }
      
      .mcp-aistudio-button-base.active {
        background-color: var(--color-primary);
        color: var(--color-on-primary);
      }
      
      .mcp-aistudio-button-base.active:hover {
        background-color: var(--color-primary-container);
        color: var(--color-on-primary-container);
      }
      
      /* Content styling */
      .mcp-aistudio-button-content {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .mcp-aistudio-button-text {
        font-weight: 500;
        font-size: 14px;
      }
      
      /* Dark mode support - now handled by CSS variables */
      :root .dark-theme .mcp-aistudio-button-base,
      @media (prefers-color-scheme: dark) {
        .mcp-aistudio-button-base {
          /* Colors automatically handled by CSS variables */
        }
      }
      
      /* Integration with AI Studio's button wrapper */
      .button-wrapper .mcp-aistudio-button-base {
        margin: 0;
        height: 40px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      /* Ensure the MCP button wrapper behaves like other button wrappers */
      #mcp-button-wrapper {
        display: flex;
        align-items: center;
      }
      
      /* Ripple effect (simplified) - using AI Studio colors */
      .mcp-aistudio-button-base::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background-color: var(--color-primary);
        opacity: 0;
        transform: translate(-50%, -50%);
        transition: width 0.6s, height 0.6s, opacity 0.6s;
        pointer-events: none;
      }
      
      .mcp-aistudio-button-base:active::after {
        width: 100px;
        height: 100px;
        opacity: 0.1;
        transition: 0s;
      }
    `;
  }

  /**
   * Inject AI Studio-specific button styles
   */
  private injectAIStudioButtonStyles(): void {
    if (this.adapterStylesInjected) return;

    try {
      const styleId = 'mcp-aistudio-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) existingStyles.remove();

      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getAIStudioButtonStyles();
      document.head.appendChild(styleElement);

      this.adapterStylesInjected = true;
      this.context.logger.debug('AI Studio button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject AI Studio button styles:', error);
    }
  }

  /**
   * Insert text into the AI Studio chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into AI Studio chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

    try {
      // Use the proven chatInputHandler method
      const success = insertTextToChatInput(text);

      if (success) {
        // Emit success event to the new event system
        this.emitExecutionCompleted('insertText', { text }, {
          success: true,
          method: 'chatInputHandler',
          textLength: text.length
        });

        this.context.logger.debug(`Text inserted successfully using chatInputHandler. Length: ${text.length}`);
        return true;
      } else {
        this.context.logger.error('Failed to insert text using chatInputHandler');
        this.emitExecutionFailed('insertText', 'chatInputHandler failed to insert text');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into AI Studio chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the AI Studio chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit AI Studio chat input');

    try {
      // Use the proven chatInputHandler method
      const success = await submitChatInput();

      if (success) {
        // Emit success event to the new event system
        this.emitExecutionCompleted('submitForm', {
          formElement: options?.formElement?.tagName || 'unknown'
        }, {
          success: true,
          method: 'chatInputHandler'
        });

        this.context.logger.debug('AI Studio chat input submitted successfully via chatInputHandler');
        return true;
      } else {
        this.context.logger.error('Failed to submit using chatInputHandler');
        this.emitExecutionFailed('submitForm', 'chatInputHandler failed to submit');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting AI Studio chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Fallback method to submit using Enter key
   */
  private async submitWithEnterKey(): Promise<boolean> {
    try {
      const chatInput = findChatInputElement();
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

      this.context.logger.debug('AI Studio chat input submitted successfully via Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting with Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the AI Studio chat input
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

      // Use the proven chatInputHandler method
      const success = await attachFileToChatInput(file);

      if (success) {
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        }, {
          success: true,
          method: 'chatInputHandler'
        });
        this.context.logger.debug(`File attached successfully via chatInputHandler: ${file.name}`);
        return true;
      } else {
        this.context.logger.warn(`File attachment failed via chatInputHandler for: ${file.name}`);
        this.emitExecutionFailed('attachFile', 'chatInputHandler failed to attach file');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to AI Studio: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
      return false;
    }
  }

  /**
   * Method 1: Attach file via drag and drop simulation
   */
  private async attachFileViaDragDrop(file: File): Promise<boolean> {
    try {
      const chatInput = findChatInputElement();
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
   * Method 1: Attach file via hidden file input (Firefox-compatible)
   */
  private async attachFileViaInput(file: File): Promise<boolean> {
    try {
      // Find file input element (AI Studio should have one for manual uploads)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!fileInput) {
        logger.debug('No file input element found');
        return false;
      }

      // Create DataTransfer object and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set the files property on the input element
      fileInput.files = dataTransfer.files;

      // Trigger the change event to notify the application
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      logger.debug(`File attached via input element: ${file.name}`);
      return true;
    } catch (error) {
      logger.debug(`File input method failed: ${error}`);
      return false;
    }
  }

  /**
   * Method 2: Copy file to clipboard as fallback
   */
  private async attachFileViaClipboard(file: File): Promise<boolean> {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [file.type]: file,
        }),
      ]);

      // Focus the textarea to make it easier to paste
      const chatInput = findChatInputElement();
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

    this.context.logger.debug(`Checking if AI Studio adapter supports: ${currentUrl}`);

    // Check hostname first
    const isAIStudioHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isAIStudioHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by AI Studio adapter`);
      return false;
    }

    // Check if we're on a supported AI Studio page
    const supportedPatterns = [
      /^https:\/\/aistudio\.google\.com\/app\/.*/,  // App pages
      /^https:\/\/aistudio\.google\.com\/$/,        // Home page
      /^https:\/\/aistudio\.google\.com\/prompts\/.*/  // Prompts pages
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`AI Studio adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for AI Studio');

    // Check if we can find the chat input element using the chatInputHandler
    const chatInput = findChatInputElement();
    if (chatInput) {
      this.context.logger.debug('Found chat input element, file upload should be supported');
      return true; // AI Studio generally supports file upload via drag and drop
    }

    this.context.logger.debug('Could not find chat input element');
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

    this.context.logger.debug(`Setting up store event listeners for AI Studio adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for AI Studio adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for AI Studio adapter instance #${this.instanceId}`);
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
      if (document.getElementById('mcp-button-wrapper') || document.getElementById('mcp-popover-container')) {
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
    this.context.logger.debug('Cleaning up DOM observers for AI Studio adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for AI Studio adapter');

    // Remove MCP button wrapper and popover if they exist
    const buttonWrapper = document.getElementById('mcp-button-wrapper');
    if (buttonWrapper) {
      buttonWrapper.remove();
    }

    // Also remove the popover container directly if it somehow exists standalone
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in AI Studio adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('AI Studio adapter should not handle events, ignoring tool execution event');
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

  /**
   * Find the Run button using multiple strategies for resilience against UI changes.
   * Returns the Run button element if found, null otherwise.
   */
  private findRunButton(): Element | null {
    // Strategy 1: Find by custom element tag name (most reliable for Angular components)
    const msRunButton = document.querySelector('ms-run-button');
    if (msRunButton) {
      this.context.logger.debug('Found Run button via ms-run-button element');
      return msRunButton;
    }

    // Strategy 2: Find by aria-label attribute (accessibility-based, very stable)
    const ariaLabelButton = document.querySelector('button[aria-label="Run"]');
    if (ariaLabelButton) {
      this.context.logger.debug('Found Run button via aria-label');
      return ariaLabelButton;
    }

    // Strategy 3: Find by type="submit" (Run buttons are typically submit buttons)
    const submitButton = document.querySelector('button[type="submit"]');
    if (submitButton) {
      const text = submitButton.textContent?.trim().toLowerCase();
      if (text?.includes('run')) {
        this.context.logger.debug('Found Run button via type="submit" with Run text');
        return submitButton;
      }
    }

    // Strategy 4: Find by jslog attribute pattern (Google's internal logging)
    const jslogButton = document.querySelector('button[jslog*="225921"]');
    if (jslogButton) {
      this.context.logger.debug('Found Run button via jslog attribute');
      return jslogButton;
    }

    // Strategy 5: Find by text content - look for buttons containing "Run"
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const button of allButtons) {
      const text = button.textContent?.trim();
      // Match buttons that have "Run" as primary text (not just containing it)
      if (text && /^Run\b/i.test(text)) {
        this.context.logger.debug('Found Run button via text content match');
        return button;
      }
    }

    this.context.logger.debug('Could not find Run button with any strategy');
    return null;
  }

  /**
   * Find the Add Media button using multiple strategies.
   * Returns the Add Media button element if found, null otherwise.
   */
  private findAddMediaButton(): Element | null {
    // Strategy 1: Find by custom element tag name
    const msAddMediaButton = document.querySelector('ms-add-media-button');
    if (msAddMediaButton) {
      this.context.logger.debug('Found Add Media button via ms-add-media-button element');
      return msAddMediaButton;
    }

    // Strategy 2: Find by data-test-id attribute
    const dataTestButton = document.querySelector('[data-test-id="add-media-button"]');
    if (dataTestButton) {
      this.context.logger.debug('Found Add Media button via data-test-id');
      return dataTestButton;
    }

    // Strategy 3: Find by aria-label
    const ariaLabelButton = document.querySelector('button[aria-label*="Insert images"], button[aria-label*="add media"]');
    if (ariaLabelButton) {
      this.context.logger.debug('Found Add Media button via aria-label');
      return ariaLabelButton;
    }

    // Strategy 4: Find by icon name (note_add icon)
    const noteAddIcon = document.querySelector('[iconname="note_add"], .material-symbols-outlined');
    if (noteAddIcon) {
      const iconText = noteAddIcon.textContent?.trim();
      if (iconText === 'note_add') {
        // Get the parent button
        const button = noteAddIcon.closest('button');
        if (button) {
          this.context.logger.debug('Found Add Media button via note_add icon');
          return button.closest('ms-add-media-button') || button;
        }
      }
    }

    this.context.logger.debug('Could not find Add Media button with any strategy');
    return null;
  }

  /**
   * Find a suitable container for the MCP button near the input area.
   * Uses the Run button's location as an anchor point.
   */
  private findButtonContainer(runButton: Element): Element | null {
    // Try to find container by walking up from Run button
    // Look for common container patterns

    // Pattern 1: Direct parent with class containing "button" or "wrapper"
    let parent = runButton.parentElement;
    while (parent && parent !== document.body) {
      const className = parent.className.toLowerCase();
      if (className.includes('button-wrapper') ||
        className.includes('buttons-row') ||
        className.includes('button-row') ||
        className.includes('actions')) {
        this.context.logger.debug(`Found container via parent traversal: ${parent.className}`);
        return parent;
      }
      parent = parent.parentElement;
    }

    // Pattern 2: Sibling of Run button's parent that contains buttons
    const runButtonParent = runButton.parentElement;
    if (runButtonParent) {
      this.context.logger.debug(`Using Run button's parent as container: ${runButtonParent.className}`);
      return runButtonParent;
    }

    return null;
  }

  private findButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
    this.context.logger.debug('Finding button insertion point for MCP popover');

    // PRIMARY STRATEGY: Locate the Run button first, then find appropriate container
    const runButton = this.findRunButton();
    if (runButton) {
      this.context.logger.debug('Using Run button as anchor for insertion point');

      // Find the container that holds the Run button
      const container = this.findButtonContainer(runButton);
      if (container) {
        // Try to find Add Media button to insert after it
        const addMediaButton = this.findAddMediaButton();
        if (addMediaButton && container.contains(addMediaButton)) {
          this.context.logger.debug('Inserting MCP button after Add Media button');
          return { container, insertAfter: addMediaButton };
        }

        // If Run button is a custom element (ms-run-button), insert before it within same container
        if (runButton.tagName.toLowerCase() === 'ms-run-button') {
          // Find the previous sibling to insert after
          const prevSibling = runButton.previousElementSibling;
          if (prevSibling) {
            this.context.logger.debug('Inserting MCP button before Run button (after previous sibling)');
            return { container, insertAfter: prevSibling };
          }
        }

        // Default: Insert at beginning of container (before Run button)
        this.context.logger.debug('Inserting MCP button at beginning of container');
        return { container, insertAfter: null };
      }
    }

    // FALLBACK 1: Look for .buttons-row container directly
    const buttonsRow = document.querySelector('.buttons-row');
    if (buttonsRow) {
      this.context.logger.debug('Found buttons-row container (fallback 1)');
      const buttonWrapper = buttonsRow.querySelector('.button-wrapper');
      if (buttonWrapper) {
        return { container: buttonWrapper, insertAfter: null };
      }
      return { container: buttonsRow, insertAfter: null };
    }

    // FALLBACK 2: Legacy prompt-input-wrapper-container
    const promptInputWrapperContainer = document.querySelector('.prompt-input-wrapper-container');
    if (promptInputWrapperContainer) {
      this.context.logger.debug('Found prompt input wrapper container (fallback 2 - legacy UI)');
      const buttonWrappers = promptInputWrapperContainer.querySelectorAll('.button-wrapper');
      if (buttonWrappers.length > 0) {
        const buttonContainer = buttonWrappers[0].parentElement;
        if (buttonContainer) {
          const lastButtonWrapper = buttonWrappers[buttonWrappers.length - 1];
          return { container: buttonContainer, insertAfter: lastButtonWrapper };
        }
      }
    }

    // FALLBACK 3: prompt-input-wrapper
    const promptInputWrapper = document.querySelector('.prompt-input-wrapper');
    if (promptInputWrapper) {
      this.context.logger.debug('Found prompt input wrapper (fallback 3)');
      const buttonWrappers = promptInputWrapper.querySelectorAll('.button-wrapper');
      if (buttonWrappers.length > 0) {
        const lastButtonWrapper = buttonWrappers[buttonWrappers.length - 1];
        return { container: promptInputWrapper, insertAfter: lastButtonWrapper };
      }
      return { container: promptInputWrapper, insertAfter: null };
    }

    // FALLBACK 4: actions-container
    const actionsContainer = document.querySelector('footer .actions-container, .actions-container');
    if (actionsContainer) {
      this.context.logger.debug('Found actions container (fallback 4)');
      return { container: actionsContainer, insertAfter: null };
    }

    // FALLBACK 5: Near any textarea (chat input)
    const chatTextarea = document.querySelector('textarea[aria-label], textarea.chat-input, textarea');
    if (chatTextarea) {
      const inputContainer = chatTextarea.closest('form') || chatTextarea.closest('div[class*="input"]');
      if (inputContainer) {
        this.context.logger.debug('Found container near textarea (fallback 5)');
        return { container: inputContainer, insertAfter: null };
      }
    }

    this.context.logger.debug('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into AI Studio interface');

    try {
      // Check if popover already exists
      if (document.getElementById('mcp-button-wrapper') || document.getElementById('mcp-popover-container')) {
        this.context.logger.debug('MCP popover already exists, skipping injection');
        return;
      }

      // Create a button wrapper div to match AI Studio's structure
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'button-wrapper';
      buttonWrapper.id = 'mcp-button-wrapper';

      // Create container for the React component inside the button wrapper
      const reactContainer = document.createElement('div');
      reactContainer.id = 'mcp-popover-container';
      reactContainer.style.display = 'contents'; // Use contents to not interfere with layout

      // Add the React container to the button wrapper
      buttonWrapper.appendChild(reactContainer);

      // Insert at appropriate location
      const { container, insertAfter } = insertionPoint;
      if (insertAfter && insertAfter.parentNode === container) {
        container.insertBefore(buttonWrapper, insertAfter.nextSibling);
        this.context.logger.debug('Inserted MCP button wrapper after specified element');
      } else {
        container.appendChild(buttonWrapper);
        this.context.logger.debug('Appended MCP button wrapper to container element');
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
          // Import MCPPopover component
          import('../../components/mcpPopover/mcpPopover').then(({ MCPPopover }) => {
            // Create state manager with new architecture integration
            const stateManager = this.createToggleStateManager();

            // Create adapter button configuration for AI Studio styling
            const adapterButtonConfig = {
              className: 'mcp-aistudio-button-base',
              contentClassName: 'mcp-aistudio-button-content',
              textClassName: 'mcp-aistudio-button-text',
              activeClassName: 'active'
            };

            // Create root and render
            const root = ReactDOM.createRoot(container);
            root.render(
              React.createElement(MCPPopover, {
                toggleStateManager: stateManager,
                adapterButtonConfig: adapterButtonConfig,
                adapterName: this.name
              })
            );

            this.context.logger.debug('MCP popover rendered successfully with AI Studio styling');
          }).catch(error => {
            this.context.logger.error('Failed to load MCPPopover component:', error);
          });
        }).catch(error => {
          this.context.logger.error('Failed to load ReactDOM:', error);
        });
      }).catch(error => {
        this.context.logger.error('Failed to load React:', error);
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
    return !!document.getElementById('mcp-button-wrapper') || !!document.getElementById('mcp-popover-container');
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
    return `aistudio-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`AI Studio page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-inject adapter styles after page navigation
    this.injectAIStudioButtonStyles();

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
    this.context.logger.debug(`AI Studio host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('AI Studio adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in AI Studio adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }
}



export const findChatInputElement = (): HTMLTextAreaElement | null => {
  // Try to find the main "Ask anything..." input first
  let chatInput = document.querySelector('textarea.textarea[placeholder="Type something"]');

  if (chatInput) {
    logger.debug('Found AiStudio main input with "Type something" placeholder');
    return chatInput as HTMLTextAreaElement;
  }
  // Try to find the main "Ask anything..." input first
  chatInput = document.querySelector('textarea.textarea[aria-label="Type something or pick one from prompt gallery"]');

  if (chatInput) {
    logger.debug('Found AiStudio main input with "Type something or pick one from prompt gallery" placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // Fall back to the follow-up input if main input not found
  chatInput = document.querySelector('textarea[placeholder="Ask follow-up"]');

  if (chatInput) {
    logger.debug('Found AiStudio follow-up input with "Ask follow-up" placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // Try to find the input with "Type something or tab to choose an example prompt" aria-label
  chatInput = document.querySelector(
    "textarea.textarea[aria-label='Type something or tab to choose an example prompt']",
  );

  if (chatInput) {
    logger.debug('Found AiStudio input with "Type something or tab to choose an example prompt" aria-label');
    return chatInput as HTMLTextAreaElement;
  }

  // Try to find the input with "Start typing a prompt" aria-label
  chatInput = document.querySelector("textarea.textarea[aria-label='Start typing a prompt']");

  if (chatInput) {
    logger.debug('Found AiStudio input with "Start typing a prompt" aria-label');
    return chatInput as HTMLTextAreaElement;
  }

  // If neither specific placeholder is found, try a more general approach
  chatInput = document.querySelector('textarea[placeholder*="Ask"]');

  if (chatInput) {
    logger.debug(
      `Found AiStudio input with generic "Ask" in placeholder: ${(chatInput as HTMLTextAreaElement).placeholder}`,
    );
    return chatInput as HTMLTextAreaElement;
  }

  logger.debug('Could not find any AiStudio chat input textarea');
  return null;
};

/**
 * Wrap content in tool_output tags
 * @param content The content to wrap
 * @returns The wrapped content
 */
export const wrapInToolOutput = (content: string): string => {
  return `<tool_output>\n${content}\n</tool_output>`;
};

/**
 * Format an object as a JSON string
 * @param data The data to format
 * @returns Formatted JSON string
 */
export const formatAsJson = (data: any): string => {
  return JSON.stringify(data, null, 2);
};

/**
 * Insert text into the AiStudio chat input
 * @param text The text to insert
 * @returns True if successful, false otherwise
 */
export const insertTextToChatInput = (text: string): boolean => {
  try {
    const chatInput = findChatInputElement();

    if (chatInput) {
      // Append the text to the existing text in the textarea
      const currentText = chatInput.value;
      // Add new line before and after the current text if there's existing content
      const formattedText = currentText ? `${currentText}\n\n${text}` : text;
      chatInput.value = formattedText;

      // Trigger input event to make AiStudio recognize the change
      const inputEvent = new Event('input', { bubbles: true });
      chatInput.dispatchEvent(inputEvent);

      // Focus the textarea
      chatInput.focus();

      logger.debug('Appended text to AiStudio chat input');
      return true;
    } else {
      logger.debug('Could not find AiStudio chat input');
      logger.error('Could not find AiStudio chat input textarea');
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Error inserting text into chat input: ${errorMessage}`);
    logger.error('Error inserting text into chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the AiStudio chat input
 * @param result The tool result to insert
 * @returns True if successful, false otherwise
 */
export const insertToolResultToChatInput = (result: any): boolean => {
  try {
    // Format the tool result as JSON string
    // const formattedResult = formatAsJson(result);
    // const wrappedResult = wrapInToolOutput(formattedResult);
    if (typeof result !== 'string') {
      result = JSON.stringify(result, null, 2);
      logger.debug('Converted tool result to string format');
    }

    return insertTextToChatInput(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Error formatting tool result: ${errorMessage}`);
    logger.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the AiStudio input
 * @param file The file to attach
 * @returns Promise that resolves to true if successful
 */
export const attachFileToChatInput = async (file: File): Promise<boolean> => {
  try {
    // Detect browser
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

    if (isFirefox) {
      // Firefox: Use file input method (drag-drop simulation doesn't work)
      logger.debug('Firefox detected: Using file input method');

      let fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      // If no file input exists, try to trigger it by clicking the "Add" button
      if (!fileInput) {
        logger.debug('No file input found, attempting to click Add button to create it');
        const addButton = document.querySelector('button[aria-label*="Insert assets"], button[iconname="add_circle"]') as HTMLButtonElement;
        if (addButton) {
          addButton.click();
          logger.debug('Clicked Add button, waiting for file input to appear');

          // Wait for file input to appear (with timeout)
          await new Promise(resolve => setTimeout(resolve, 300));
          fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        }
      }

      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        logger.debug(`File attached via input element (Firefox): ${file.name}`);
        return true;
      }

      logger.debug('Firefox file input method failed: No file input element found');
      return false;
    } else {
      // Chrome/Other browsers: Use drag-and-drop method (works well)
      logger.debug('Chrome/Other browser detected: Using drag-and-drop method');

      const chatInput = findChatInputElement();

      if (!chatInput) {
        logger.debug('Could not find AiStudio input element for file attachment');
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

      // Try clipboard as additional fallback
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [file.type]: file,
          }),
        ]);

        // Focus the textarea to make it easier to paste
        chatInput.focus();
        logger.debug('File copied to clipboard, user can now paste manually if needed');
      } catch (clipboardError) {
        logger.debug(`Could not copy to clipboard: ${clipboardError}`);
      }

      logger.debug(`Attached file ${file.name} to AiStudio input (Chrome)`);
      return true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Error attaching file to AiStudio input: ${errorMessage}`);
    logger.error('Error attaching file to AiStudio input:', error);
    return false;
  }
};

/**
 * Submit the current chat input (equivalent to pressing Enter)
 * @returns True if submission was successful, false otherwise
 */
export const submitChatInput = (maxWaitTime = 5000): Promise<boolean> => {
  return new Promise(resolve => {
    try {
      const chatInput = findChatInputElement();

      if (!chatInput) {
        logger.debug('Could not find chat input to submit');
        resolve(false);
        return;
      }

      // Define a function to find the submit button
      const findSubmitButton = (): HTMLButtonElement | null => {
        const submitButton =
          document.querySelector('button[aria-label="Submit"]') ||
          document.querySelector('button[aria-label="Send"]') ||
          document.querySelector('button[type="submit"]') ||
          // Look for a button next to the textarea
          chatInput.parentElement?.querySelector('button') ||
          // Common pattern: button with paper plane icon
          document.querySelector('button svg[stroke="currentColor"]')?.closest('button');

        return submitButton as HTMLButtonElement | null;
      };

      // Try to find and check the submit button
      const submitButton = findSubmitButton();

      if (submitButton) {
        logger.debug(`Found submit button (${submitButton.getAttribute('aria-label') || 'unknown'})`);

        // Function to check if button is enabled and click it
        const tryClickingButton = () => {
          const button = findSubmitButton();
          if (!button) {
            logger.debug('Submit button no longer found');
            resolve(false);
            return;
          }

          // Check if the button is disabled
          const isDisabled =
            button.disabled ||
            button.getAttribute('disabled') !== null ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.classList.contains('disabled');

          if (!isDisabled) {
            logger.debug('Submit button is enabled, clicking it');
            button.click();
            resolve(true);
          } else {
            logger.debug('Submit button is disabled, waiting...');
          }
        };

        // Set up a timer to periodically check if the button becomes enabled
        let elapsedTime = 0;
        const checkInterval = 200; // Check every 200ms

        const intervalId = setInterval(() => {
          elapsedTime += checkInterval;

          tryClickingButton();

          // If we've waited too long, try alternative methods
          if (elapsedTime >= maxWaitTime) {
            clearInterval(intervalId);
            logger.debug(`Button remained disabled for ${maxWaitTime}ms, trying alternative methods`);

            // Method 2: Simulate Enter key press
            logger.debug('Simulating Enter key press as fallback');

            // Focus the textarea first
            chatInput.focus();

            // Create and dispatch keydown event (Enter key)
            const keydownEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Create and dispatch keypress event
            const keypressEvent = new KeyboardEvent('keypress', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Create and dispatch keyup event
            const keyupEvent = new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Dispatch all events in sequence
            chatInput.dispatchEvent(keydownEvent);
            chatInput.dispatchEvent(keypressEvent);
            chatInput.dispatchEvent(keyupEvent);

            // Try to find and submit a form as a last resort
            const form = chatInput.closest('form');
            if (form) {
              logger.debug('Found form element, submitting it');
              form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
            }

            logger.debug('Attempted all fallback methods to submit chat input');
            resolve(true);
          }
        }, checkInterval);

        // Initial check - maybe it's already enabled
        tryClickingButton();

        // If the button is already enabled and clicked, clear the interval
        if (submitButton && !submitButton.disabled) {
          clearInterval(intervalId);
        }
      } else {
        // If no button found, proceed with alternative methods immediately
        logger.debug('No submit button found, trying alternative methods');

        // Method 2: Simulate Enter key press
        logger.debug('Simulating Enter key press as fallback');

        // Focus the textarea first
        chatInput.focus();

        // Create and dispatch keydown event (Enter key)
        const keydownEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Create and dispatch keypress event
        const keypressEvent = new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Create and dispatch keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Dispatch all events in sequence
        chatInput.dispatchEvent(keydownEvent);
        chatInput.dispatchEvent(keypressEvent);
        chatInput.dispatchEvent(keyupEvent);

        // Try to find and submit a form as a last resort
        const form = chatInput.closest('form');
        if (form) {
          logger.debug('Found form element, submitting it');
          form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        }

        logger.debug('Attempted all methods to submit chat input');
        resolve(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`Error submitting chat input: ${errorMessage}`);
      logger.error('Error submitting chat input:', error);
      resolve(false);
    }
  });
};
