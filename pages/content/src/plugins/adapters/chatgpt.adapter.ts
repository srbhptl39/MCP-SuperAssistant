import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * ChatGPT Adapter for OpenAI ChatGPT (chatgpt.com)
 *
 * This adapter provides specialized functionality for interacting with ChatGPT's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */
export class ChatGPTAdapter extends BaseAdapterPlugin {
  readonly name = 'ChatGPTAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['chatgpt.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for ChatGPT's UI elements
  // Updated selectors based on current ChatGPT interface
  private readonly selectors = {
    // Primary chat input selector (ProseMirror contenteditable)
    CHAT_INPUT: '#prompt-textarea, .ProseMirror[contenteditable="true"], div[contenteditable="true"][data-id*="prompt"]',
    // Submit button selectors (multiple fallbacks)
    SUBMIT_BUTTON: 'button[data-testid="send-button"], button[aria-label*="Send"], button[data-testid="fruitjuice-send-button"], button:has(svg) + button:has(svg[viewBox="0 0 20 20"])',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: '#upload-file-btn, button[aria-label*="Add photos"], button[data-testid="composer-action-file-upload"] button',
    FILE_INPUT: 'input[type="file"][multiple]',
    // Main panel and container selectors
    MAIN_PANEL: 'main, .chat-container, [data-testid="conversation-turn-wrapper"]',
    // Drop zones for file attachment
    DROP_ZONE: '#prompt-textarea, .ProseMirror, [data-testid="composer-text-input"], .composer-parent',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, [data-testid="file-attachment"]',
    // Button insertion points (for MCP popover)
    BUTTON_INSERTION_CONTAINER: '[data-testid="composer-footer-actions"], .composer-footer-actions, .flex.items-center[data-testid*="composer"]',
    // Alternative insertion points
    FALLBACK_INSERTION: '.composer-parent, .relative.flex.w-full.items-end, [data-testid="composer-trailing-actions"]'
  };

  // URL patterns for navigation tracking
  private lastUrl: string = '';
  private urlCheckInterval: NodeJS.Timeout | null = null;

  // State management integration
  private mcpPopoverContainer: HTMLElement | null = null;
  private mcpPopoverRoot: any = null; // Store React root to prevent multiple roots
  private mutationObserver: MutationObserver | null = null;
  private popoverCheckInterval: NodeJS.Timeout | null = null;
  
  // Setup state tracking
  private storeEventListenersSetup: boolean = false;
  private domObserversSetup: boolean = false;
  private uiIntegrationSetup: boolean = false;
  
  // Instance tracking for debugging
  private static instanceCount = 0;
  private instanceId: number;
  
  // Styling state tracking
  private chatgptStylesInjected: boolean = false;

  constructor() {
    super();
    ChatGPTAdapter.instanceCount++;
    this.instanceId = ChatGPTAdapter.instanceCount;
    console.log(`[ChatGPTAdapter] Instance #${this.instanceId} created. Total instances: ${ChatGPTAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`ChatGPT adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.info(`Initializing ChatGPT adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`ChatGPT adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.info(`Activating ChatGPT adapter instance #${this.instanceId}...`);

    // Inject ChatGPT-specific button styles
    this.injectChatGPTButtonStyles();

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
      this.context?.logger.warn('ChatGPT adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.info('Deactivating ChatGPT adapter...');

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
    this.context.logger.info('Cleaning up ChatGPT adapter...');

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
    
    // Remove injected ChatGPT styles
    const styleElement = document.getElementById('mcp-chatgpt-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.chatgptStylesInjected = false;
    }
    
    // Reset all setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;
    this.chatgptStylesInjected = false;
  }

  /**
   * Insert text into the ChatGPT chat input field (ProseMirror editor)
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.info(`Attempting to insert text into ChatGPT chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find ChatGPT chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Store the original content
      const originalContent = targetElement.textContent || '';

      // Focus the input element
      targetElement.focus();

      // For ProseMirror editor, we need to handle the content differently
      // Remove placeholder if present
      const placeholder = targetElement.querySelector('[data-placeholder]');
      if (placeholder) {
        placeholder.remove();
      }

      // Create a new paragraph element with the text
      const newContent = originalContent ? originalContent + '\n' + text : text;
      
      // Clear existing content and insert new content
      targetElement.innerHTML = '';
      const paragraph = document.createElement('p');
      paragraph.textContent = newContent;
      targetElement.appendChild(paragraph);

      // Dispatch events to simulate user typing for better compatibility
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Emit success event to the new event system
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalContent.length,
        newLength: text.length,
        totalLength: newContent.length
      });

      this.context.logger.info(`Text inserted successfully. Original: ${originalContent.length}, Added: ${text.length}, Total: ${newContent.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into ChatGPT chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the ChatGPT chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.info('Attempting to submit ChatGPT chat input');

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
      this.context.logger.error('Could not find ChatGPT submit button');
      this.emitExecutionFailed('submitForm', 'Submit button not found');
      return false;
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('ChatGPT submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('ChatGPT submit button is not visible');
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

      this.context.logger.info('ChatGPT chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting ChatGPT chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the ChatGPT chat input
   * Enhanced with better error handling and integration with new architecture
   */
  async attachFile(file: File, options?: { inputElement?: HTMLInputElement }): Promise<boolean> {
    this.context.logger.info(`Attempting to attach file: ${file.name} (${file.size} bytes, ${file.type})`);

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
      let fileInput: HTMLInputElement | null = options?.inputElement || null;
      
      if (!fileInput) {
        fileInput = document.querySelector(this.selectors.FILE_INPUT) as HTMLInputElement;
      }

      if (fileInput) {
        // Use the direct file input approach
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Trigger change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Fallback to drag-drop simulation
        const success = await this.simulateFileDrop(file);
        if (!success) {
          this.emitExecutionFailed('attachFile', 'Failed to simulate file drop');
          return false;
        }
      }

      // Check for file preview to confirm success
      const previewFound = await this.checkFilePreview();

      if (previewFound) {
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          inputElement: options?.inputElement?.tagName || 'unknown'
        }, {
          success: true,
          previewFound: true,
          method: fileInput ? 'file-input' : 'drag-drop-simulation'
        });
        this.context.logger.info(`File attached successfully: ${file.name}`);
        return true;
      } else {
        // Still consider it successful even if preview not found (optimistic)
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        }, {
          success: true,
          previewFound: false,
          method: fileInput ? 'file-input' : 'drag-drop-simulation'
        });
        this.context.logger.info(`File attachment initiated (preview not confirmed): ${file.name}`);
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to ChatGPT: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
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

    this.context.logger.debug(`Checking if ChatGPT adapter supports: ${currentUrl}`);

    // Check hostname first
    const isChatGPTHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isChatGPTHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by ChatGPT adapter`);
      return false;
    }

    // Check if we're on a supported ChatGPT page
    const supportedPatterns = [
      /^https:\/\/chatgpt\.com\/$/,           // Main page
      /^https:\/\/chatgpt\.com\/c\/.*/,      // Specific conversations
      /^https:\/\/chatgpt\.com\/g\/.*/,      // Custom GPTs
      /^https:\/\/chatgpt\.com\/\?.*/        // Chat with query params
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.info(`ChatGPT adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for ChatGPT');

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

  /**
   * Get ChatGPT-specific button styles that match the composer button design
   * Based on ChatGPT's current design system with dark/light theme support
   */
  private getChatGPTButtonStyles(): string {
    return `
      /* ChatGPT MCP Button Styles - Matching composer-btn design */
      .mcp-chatgpt-button-base {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        box-sizing: border-box;
        min-width: 36px;
        height: 36px;
        padding: 8px;
        margin: 0 2px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #8e8ea0;
        font-family: "Söhne", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.15s ease;
        overflow: hidden;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        text-align: center;
        white-space: nowrap;
      }

      /* Hover state - matches ChatGPT's composer button hover */
      .mcp-chatgpt-button-base:hover {
        background-color: rgba(142, 142, 160, 0.1);
        color: #acacbe;
      }

      /* Active/pressed state */
      .mcp-chatgpt-button-base:active {
        background-color: rgba(142, 142, 160, 0.15);
        transform: scale(0.98);
      }

      /* Focus state for accessibility */
      .mcp-chatgpt-button-base:focus-visible {
        outline: 2px solid #1e90ff;
        outline-offset: 2px;
      }

      /* Active toggle state - matches ChatGPT's active button state */
      .mcp-chatgpt-button-base.mcp-button-active {
        background-color: rgba(30, 144, 255, 0.1);
        color: #1e90ff;
      }

      .mcp-chatgpt-button-base.mcp-button-active:hover {
        background-color: rgba(30, 144, 255, 0.15);
      }

      /* Button content container */
      .mcp-chatgpt-button-content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        position: relative;
        z-index: 1;
      }

      /* Text styling to match ChatGPT's typography */
      .mcp-chatgpt-button-text {
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        white-space: nowrap;
      }

      /* Icon styling matching ChatGPT's icon system */
      .mcp-chatgpt-button-base .mcp-button-icon {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        line-height: 1;
        flex-shrink: 0;
      }

      /* Dark mode support - ChatGPT's dark theme */
      @media (prefers-color-scheme: dark) {
        .mcp-chatgpt-button-base {
          color: #c5c5d2;
        }

        .mcp-chatgpt-button-base:hover {
          background-color: rgba(197, 197, 210, 0.1);
          color: #ececf1;
        }

        .mcp-chatgpt-button-base:active {
          background-color: rgba(197, 197, 210, 0.15);
        }

        .mcp-chatgpt-button-base.mcp-button-active {
          background-color: rgba(30, 144, 255, 0.15);
          color: #4da6ff;
        }

        .mcp-chatgpt-button-base.mcp-button-active:hover {
          background-color: rgba(30, 144, 255, 0.2);
        }
      }

      /* High contrast mode support */
      @media (prefers-contrast: high) {
        .mcp-chatgpt-button-base {
          border: 1px solid currentColor;
        }

        .mcp-chatgpt-button-base:focus-visible {
          outline-width: 3px;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .mcp-chatgpt-button-base {
          transition: none;
        }

        .mcp-chatgpt-button-base:active {
          transform: none;
        }
      }

      /* Integration with ChatGPT's composer layout */
      [data-testid="composer-footer-actions"] .mcp-chatgpt-button-base,
      .composer-footer-actions .mcp-chatgpt-button-base {
        margin: 0 4px;
      }

      /* Ensure proper stacking with ChatGPT's UI elements */
      .mcp-chatgpt-button-base {
        position: relative;
        z-index: 1;
      }

      /* Responsive design for mobile */
      @media (max-width: 768px) {
        .mcp-chatgpt-button-base {
          min-width: 32px;
          height: 32px;
          padding: 6px;
        }

        .mcp-chatgpt-button-base .mcp-button-icon {
          width: 18px;
          height: 18px;
          font-size: 18px;
        }

        .mcp-chatgpt-button-text {
          font-size: 13px;
        }
      }

      /* Tooltip styling for better UX */
      .mcp-chatgpt-button-base[title]:hover::after {
        content: attr(title);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
        margin-bottom: 4px;
      }

      /* Ensure button looks consistent with ChatGPT's composer */
      .relative.flex.w-full.items-end .mcp-chatgpt-button-base {
        align-self: flex-end;
        margin-bottom: 2px;
      }
    `;
  }

  /**
   * Inject ChatGPT-specific button styles into the page
   */
  private injectChatGPTButtonStyles(): void {
    if (this.chatgptStylesInjected) {
      this.context.logger.debug('ChatGPT button styles already injected, skipping');
      return;
    }

    try {
      const styleId = 'mcp-chatgpt-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) {
        existingStyles.remove();
      }

      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getChatGPTButtonStyles();
      document.head.appendChild(styleElement);

      this.chatgptStylesInjected = true;
      this.context.logger.info('ChatGPT button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject ChatGPT button styles:', error);
    }
  }

  private setupUrlTracking(): void {
    if (!this.urlCheckInterval) {
      this.urlCheckInterval = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== this.lastUrl) {
          this.context.logger.info(`URL changed from ${this.lastUrl} to ${currentUrl}`);

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

    this.context.logger.debug(`Setting up store event listeners for ChatGPT adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for ChatGPT adapter instance #${this.instanceId}`);

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
        this.context.logger.debug('MCP popover removed, attempting to re-inject');
        this.setupUIIntegration();
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
      this.context.logger.debug(`Setting up UI integration for ChatGPT adapter instance #${this.instanceId}`);
      this.uiIntegrationSetup = true;
    }

    // Wait for page to be ready, then inject MCP popover
    this.waitForPageReady().then(() => {
      this.injectMCPPopoverWithRetry();
    });

    // Set up periodic check to ensure popover stays injected
    this.setupPeriodicPopoverCheck();
  }

  private async waitForPageReady(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = () => {
        // Check if the page has the necessary elements
        const insertionPoint = this.findButtonInsertionPoint();
        if (insertionPoint) {
          this.context.logger.debug('Page ready for MCP popover injection');
          resolve();
        } else {
          // Retry after a short delay
          setTimeout(checkReady, 500);
        }
      };

      // Start checking immediately, but with a small initial delay
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
          this.context.logger.debug('MCP popover missing, attempting to re-inject');
          this.injectMCPPopoverWithRetry(3); // Fewer retries for periodic checks
        }
      }, 5000);
    }
  }

  private cleanupDOMObservers(): void {
    this.context.logger.debug('Cleaning up DOM observers for ChatGPT adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for ChatGPT adapter');

    try {
      // Clean up React root first
      if (this.mcpPopoverRoot) {
        try {
          this.mcpPopoverRoot.unmount();
          this.context.logger.debug('React root unmounted successfully');
        } catch (unmountError) {
          this.context.logger.warn('Error unmounting React root during cleanup:', unmountError);
        }
        this.mcpPopoverRoot = null;
      }

      // Remove MCP popover if it exists with proper error handling
      const popoverContainer = document.getElementById('mcp-popover-container');
      if (popoverContainer) {
        // Check if element is still connected to DOM before attempting removal
        if (popoverContainer.isConnected && popoverContainer.parentNode) {
          try {
            popoverContainer.parentNode.removeChild(popoverContainer);
            this.context.logger.debug('MCP popover container removed successfully');
          } catch (removeError) {
            this.context.logger.warn('Error removing popover container, trying alternative method:', removeError);
            // Alternative removal method
            try {
              popoverContainer.remove();
              this.context.logger.debug('MCP popover container removed using alternative method');
            } catch (altRemoveError) {
              this.context.logger.error('Failed to remove popover container with both methods:', altRemoveError);
            }
          }
        } else {
          this.context.logger.debug('MCP popover container already disconnected from DOM');
        }
      }
    } catch (error) {
      this.context.logger.error('Error during UI integration cleanup:', error);
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in ChatGPT adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('ChatGPT adapter should not handle events, ignoring tool execution event');
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

    // Try primary selector first - ChatGPT's composer footer actions
    const footerActions = document.querySelector('[data-testid="composer-footer-actions"]');
    if (footerActions) {
      this.context.logger.debug('Found insertion point: [data-testid="composer-footer-actions"]');
      const buttons = footerActions.querySelectorAll('button');
      const lastButton = buttons.length > 0 ? buttons[buttons.length - 1] : null;
      return { container: footerActions, insertAfter: lastButton };
    }

    // Try fallback selectors
    const fallbackSelectors = [
      '.composer-footer-actions',
      '.flex.items-center[data-testid*="composer"]',
      '.relative.flex.w-full.items-end',
      '[data-testid="composer-trailing-actions"]'
    ];

    for (const selector of fallbackSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        this.context.logger.debug(`Found fallback insertion point: ${selector}`);
        const buttons = container.querySelectorAll('button');
        const lastButton = buttons.length > 0 ? buttons[buttons.length - 1] : null;
        return { container, insertAfter: lastButton };
      }
    }

    this.context.logger.warn('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into ChatGPT interface');

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

      this.context.logger.info('MCP popover injected and rendered successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject MCP popover:', error);
    }
  }

  private renderMCPPopover(container: HTMLElement): void {
    this.context.logger.debug('Rendering MCP popover with new architecture integration');

    try {
      // Check if container is still valid before rendering
      if (!container || !container.isConnected) {
        this.context.logger.warn('Container is not connected to DOM, skipping render');
        return;
      }

      // Import React and ReactDOM dynamically to avoid bundling issues
      import('react').then(React => {
        import('react-dom/client').then(ReactDOM => {
          import('../../components/mcpPopover/mcpPopover').then(({ MCPPopover }) => {
            // Double-check container is still valid
            if (!container || !container.isConnected) {
              this.context.logger.warn('Container became invalid during async import, aborting render');
              return;
            }

            // Create toggle state manager that integrates with new stores
            const toggleStateManager = this.createToggleStateManager();

            // Create adapter button configuration for ChatGPT styling
            const adapterButtonConfig = {
              className: 'mcp-chatgpt-button-base',
              contentClassName: 'mcp-chatgpt-button-content',
              textClassName: 'mcp-chatgpt-button-text',
              activeClassName: 'mcp-button-active'
            };

            try {
              // Prevent multiple React roots on the same container
              if (this.mcpPopoverRoot) {
                this.context.logger.debug('Unmounting existing React root before creating new one');
                try {
                  this.mcpPopoverRoot.unmount();
                } catch (unmountError) {
                  this.context.logger.warn('Error unmounting existing React root:', unmountError);
                }
                this.mcpPopoverRoot = null;
              }

              // Create React root and render with error boundary
              this.mcpPopoverRoot = ReactDOM.createRoot(container);
              this.mcpPopoverRoot.render(
                React.createElement(MCPPopover, {
                  toggleStateManager: toggleStateManager,
                  adapterButtonConfig: adapterButtonConfig,
                  adapterName: this.name
                })
              );

              this.context.logger.info('MCP popover rendered successfully with new architecture');
            } catch (renderError) {
              this.context.logger.error('Error during React render:', renderError);
              // Clean up failed root
              if (this.mcpPopoverRoot) {
                try {
                  this.mcpPopoverRoot.unmount();
                } catch (cleanupError) {
                  this.context.logger.warn('Error cleaning up failed React root:', cleanupError);
                }
                this.mcpPopoverRoot = null;
              }
            }
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

          context.logger.info(`MCP toggle completed: MCP ${enabled ? 'enabled' : 'disabled'}, sidebar ${enabled ? 'shown' : 'hidden'}`);
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
    this.context.logger.info('Manual MCP popover injection requested');
    this.injectMCPPopoverWithRetry();
  }

  /**
   * Check if MCP popover is currently injected
   */
  public isMCPPopoverInjected(): boolean {
    return !!document.getElementById('mcp-popover-container');
  }

  private async simulateFileDrop(file: File): Promise<boolean> {
    try {
      // Find drop zone
      const dropZoneSelectors = this.selectors.DROP_ZONE.split(', ');
      let dropZone: Element | null = null;
      
      for (const selector of dropZoneSelectors) {
        dropZone = document.querySelector(selector.trim());
        if (dropZone) break;
      }

      if (!dropZone) {
        this.context.logger.error('No drop zone found for file simulation');
        return false;
      }

      // Create drag events
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Simulate drag events
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

      return true;
    } catch (error) {
      this.context.logger.error('Error simulating file drop:', error);
      return false;
    }
  }

  private async checkFilePreview(): Promise<boolean> {
    return new Promise(resolve => {
      setTimeout(() => {
        const filePreview = document.querySelector(this.selectors.FILE_PREVIEW);
        if (filePreview) {
          this.context.logger.info('File preview element found after attachment');
          resolve(true);
        } else {
          this.context.logger.warn('File preview element not found after attachment');
          resolve(false);
        }
      }, 500);
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
    return `chatgpt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if the sidebar is properly available after navigation
   */
  private checkAndRestoreSidebar(): void {
    this.context.logger.info('Checking sidebar state after page navigation');

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
    this.context.logger.info('Ensuring MCP popover connection after navigation');
    
    try {
      // Check if MCP popover is still injected
      if (!this.isMCPPopoverInjected()) {
        this.context.logger.info('MCP popover missing after navigation, re-injecting');
        this.injectMCPPopoverWithRetry(3);
      } else {
        this.context.logger.info('MCP popover is still present after navigation');
      }
    } catch (error) {
      this.context.logger.error('Error ensuring MCP popover connection:', error);
    }
  }

  // Event handlers - Enhanced for new architecture integration
  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.info(`ChatGPT page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject styles after page change
      this.injectChatGPTButtonStyles();
      
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
    this.context.logger.info(`ChatGPT host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('ChatGPT adapter no longer supported on this host/page');
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
    this.context.logger.info(`Tools detected in ChatGPT adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }
}
