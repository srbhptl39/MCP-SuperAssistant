import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { adapterConfigManager, type AdapterConfig } from './defaultConfigs';

/**
 * Gemini Adapter for Google Gemini (gemini.google.com)
 *
 * This adapter provides specialized functionality for interacting with Google Gemini's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */
export class GeminiAdapter extends BaseAdapterPlugin {
  readonly name = 'GeminiAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['gemini.google.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Gemini's UI elements - loaded from configuration
  private config: AdapterConfig | null = null;

  // Legacy selectors as fallbacks (will be removed once config system is stable)
  private readonly fallbackSelectors = {
    CHAT_INPUT: 'div.ql-editor.textarea.new-input-ui p, .ql-editor p, div[contenteditable="true"]',
    SUBMIT_BUTTON: 'button.mat-mdc-icon-button.send-button, button[aria-label*="Send"], button[data-testid="send-button"]',
    FILE_UPLOAD_BUTTON: 'button[aria-label="Add files"], button[aria-label*="attach"]',
    FILE_INPUT: 'input[type="file"]',
    MAIN_PANEL: '.chat-web, .main-content, .conversation-container',
    DROP_ZONE: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor, .chat-input-container',
    FILE_PREVIEW: '.file-preview, .xap-filed-upload-preview, .attachment-preview',
    BUTTON_INSERTION_CONTAINER: '.leading-actions-wrapper, .input-area .actions, .chat-input-actions',
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
  
  // Styling state tracking
  private geminiStylesInjected: boolean = false;

  constructor() {
    super();
    GeminiAdapter.instanceCount++;
    this.instanceId = GeminiAdapter.instanceCount;
    console.log(`[GeminiAdapter] Instance #${this.instanceId} created. Total instances: ${GeminiAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`Gemini adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.info(`Initializing Gemini adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();

    // Initialize configuration
    await this.initializeConfig();

    // Listen for remote config updates
    this.setupConfigUpdateListener();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Gemini adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.info(`Activating Gemini adapter instance #${this.instanceId}...`);

    // Inject Gemini-specific button styles
    this.injectGeminiButtonStyles();

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
      this.context?.logger.warn('Gemini adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.info('Deactivating Gemini adapter...');

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
    this.context.logger.info('Cleaning up Gemini adapter...');

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
    
    // Remove injected Gemini styles
    const styleElement = document.getElementById('mcp-gemini-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.geminiStylesInjected = false;
    }
    
    // Reset all setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;
    this.geminiStylesInjected = false;
  }

  /**
   * Insert text into the Gemini chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.info(`Attempting to insert text into Gemini chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

    let targetElement: HTMLElement | null = null;

    if (options?.targetElement) {
      targetElement = options.targetElement;
    } else {
      // Try multiple selectors for better compatibility
      const selectors = this.getSelector('chatInput').split(', ');
      for (const selector of selectors) {
        targetElement = document.querySelector(selector.trim()) as HTMLElement;
        if (targetElement) {
          this.context.logger.debug(`Found chat input using selector: ${selector.trim()}`);
          break;
        }
      }
    }

    if (!targetElement) {
      this.context.logger.error('Could not find Gemini chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Store the original value
      const originalValue = targetElement.textContent || '';

      // Focus the input element
      targetElement.focus();

      // Insert the text by updating the content and dispatching appropriate events
      // Append the text to the original value on a new line if there's existing content
      const newContent = originalValue ? originalValue + '\n' + text : text;
      targetElement.textContent = newContent;

      // Dispatch events to simulate user typing for better compatibility
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Emit success event to the new event system
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length,
        totalLength: newContent.length
      });

      this.context.logger.info(`Text inserted successfully. Original: ${originalValue.length}, Added: ${text.length}, Total: ${newContent.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into Gemini chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the Gemini chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.info('Attempting to submit Gemini chat input');

    let submitButton: HTMLButtonElement | null = null;

    // Try multiple selectors for better compatibility
    const selectors = this.getSelector('submitButton').split(', ');
    for (const selector of selectors) {
      submitButton = document.querySelector(selector.trim()) as HTMLButtonElement;
      if (submitButton) {
        this.context.logger.debug(`Found submit button using selector: ${selector.trim()}`);
        break;
      }
    }

    if (!submitButton) {
      this.context.logger.error('Could not find Gemini submit button');
      this.emitExecutionFailed('submitForm', 'Submit button not found');
      return false;
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('Gemini submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('Gemini submit button is not visible');
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

      this.context.logger.info('Gemini chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting Gemini chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the Gemini chat input
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

      // Load drop listener script into page context
      const success = await this.injectFileDropListener();
      if (!success) {
        this.emitExecutionFailed('attachFile', 'Failed to inject file drop listener');
        return false;
      }

      // Read file as DataURL and post primitives to page context
      const dataUrl = await this.readFileAsDataURL(file);

      // Post message to page context for file drop simulation
      window.postMessage(
        {
          type: 'MCP_DROP_FILE',
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          lastModified: file.lastModified,
          fileData: dataUrl,
        },
        '*'
      );

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
          method: 'drag-drop-simulation'
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
          method: 'drag-drop-simulation'
        });
        this.context.logger.info(`File attachment initiated (preview not confirmed): ${file.name}`);
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to Gemini: ${errorMessage}`);
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

    this.context.logger.debug(`Checking if Gemini adapter supports: ${currentUrl}`);

    // Check hostname first
    const isGeminiHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isGeminiHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by Gemini adapter`);
      return false;
    }

    // Check if we're on a supported Gemini page (not just the homepage)
    const supportedPatterns = [
      /^https:\/\/gemini\.google\.com\/u\/\d+\/app\/.*/,  // User-specific app pages
      /^https:\/\/gemini\.google\.com\/.*/,          // General app pages
      /^https:\/\/gemini\.google\.com\/chat\/.*/,         // Chat pages
      /^https:\/\/gemini\.google\.com\/u\/\d+\/chat\/.*/  // User-specific chat pages
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.info(`Gemini adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for Gemini');

    // Check for drop zones
    const dropZoneSelectors = this.getSelector('dropZone').split(', ');
    for (const selector of dropZoneSelectors) {
      const dropZone = document.querySelector(selector.trim());
      if (dropZone) {
        this.context.logger.debug(`Found drop zone with selector: ${selector.trim()}`);
        return true;
      }
    }

    // Check for file upload buttons
    const uploadButtonSelectors = this.getSelector('fileUploadButton').split(', ');
    for (const selector of uploadButtonSelectors) {
      const uploadButton = document.querySelector(selector.trim());
      if (uploadButton) {
        this.context.logger.debug(`Found upload button with selector: ${selector.trim()}`);
        return true;
      }
    }

    // Check for file input elements
    const fileInput = document.querySelector(this.getSelector('fileInput'));
    if (fileInput) {
      this.context.logger.debug('Found file input element');
      return true;
    }

    this.context.logger.debug('No file upload support detected');
    return false;
  }

  // Private helper methods

  /**
   * Get Gemini-specific button styles that match the toolbox drawer items
   * Based on the Material Design Components used in Gemini's interface
   */
  private getGeminiButtonStyles(): string {
    return `
      /* Gemini MCP Button Styles - Matching toolbox-drawer-item style */
      .mcp-gemini-button-base {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        box-sizing: border-box;
        min-width: 40px;
        height: 40px;
        padding: 8px 12px;
        margin: 0 2px;
        border: none;
        border-radius: 20px;
        background: transparent;
        color: #3c4043;
        font-family: 'Google Sans', Roboto, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.2, 0.0, 0.2, 1);
        overflow: hidden;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        /* Match toolbox drawer item appearance */
        letter-spacing: 0.0178571429em;
      }

      /* Hover state - matches Material Design ripple */
      .mcp-gemini-button-base:hover {
        background-color: rgba(60, 64, 67, 0.04);
      }

      /* Active/pressed state */
      .mcp-gemini-button-base:active {
        background-color: rgba(60, 64, 67, 0.08);
        transform: scale(0.98);
      }

      /* Focus state for accessibility */
      .mcp-gemini-button-base:focus-visible {
        outline: 2px solid #1a73e8;
        outline-offset: 2px;
      }

      /* Active toggle state - matches Gemini's toolbox drawer pressed state */
      .mcp-gemini-button-base.mcp-button-active {
        background-color: rgba(138, 180, 248, 0.2);
        color: #1557c0;
      }

      .mcp-gemini-button-base.mcp-button-active:hover {
        background-color: rgba(138, 180, 248, 0.24);
      }

      /* Button content container */
      .mcp-gemini-button-content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        position: relative;
        z-index: 1;
      }

      /* Text styling to match GDS label */
      .mcp-gemini-button-text {
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        letter-spacing: 0.0178571429em;
        white-space: nowrap;
      }

      /* Material ripple effect overlay */
      .mcp-gemini-button-base::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: currentColor;
        opacity: 0;
        border-radius: inherit;
        transition: opacity 0.15s cubic-bezier(0.2, 0.0, 0.2, 1);
        pointer-events: none;
      }

      .mcp-gemini-button-base:hover::before {
        opacity: 0.04;
      }

      .mcp-gemini-button-base:active::before {
        opacity: 0.08;
      }

      /* Icon styling matching Google Material Symbols */
      .mcp-gemini-button-base .mcp-button-icon {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        line-height: 1;
        font-family: 'Material Symbols Outlined', 'Google Material Icons';
      }

      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        .mcp-gemini-button-base {
          color: #e8eaed;
        }

        .mcp-gemini-button-base:hover {
          background-color: rgba(232, 234, 237, 0.04);
        }

        .mcp-gemini-button-base:active {
          background-color: rgba(232, 234, 237, 0.08);
        }

        .mcp-gemini-button-base.mcp-button-active {
          background-color: rgba(138, 180, 248, 0.12);
          color: #8ab4f8;
        }

        .mcp-gemini-button-base.mcp-button-active:hover {
          background-color: rgba(138, 180, 248, 0.16);
        }
      }

      /* High contrast mode support */
      @media (prefers-contrast: high) {
        .mcp-gemini-button-base {
          border: 1px solid currentColor;
        }

        .mcp-gemini-button-base:focus-visible {
          outline-width: 3px;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .mcp-gemini-button-base {
          transition: none;
        }

        .mcp-gemini-button-base:active {
          transform: none;
        }

        .mcp-gemini-button-base::before {
          transition: none;
        }
      }

      /* Integration with Gemini's toolbox drawer layout */
      .leading-actions-wrapper .mcp-gemini-button-base,
      .input-area .mcp-gemini-button-base,
      .chat-input-actions .mcp-gemini-button-base {
        margin: 0 2px;
      }

      /* Ensure proper stacking with Gemini's UI elements */
      .mcp-gemini-button-base {
        position: relative;
        z-index: 1;
      }

      /* Match the exact styling of toolbox drawer items when in sidebar */
      .toolbox-drawer-item-button .mcp-gemini-button-base,
      .mcp-gemini-button-base.toolbox-style {
        width: 100%;
        height: 48px;
        padding: 12px 16px;
        margin: 0;
        border-radius: 0;
        justify-content: flex-start;
        gap: 12px;
        font-size: 14px;
        line-height: 20px;
      }

      .toolbox-drawer-item-button .mcp-gemini-button-base .mcp-button-icon,
      .mcp-gemini-button-base.toolbox-style .mcp-button-icon {
        width: 24px;
        height: 24px;
        font-size: 24px;
        margin-right: 12px;
      }

      .toolbox-drawer-item-button .mcp-gemini-button-base .mcp-gemini-button-text,
      .mcp-gemini-button-base.toolbox-style .mcp-gemini-button-text {
        text-align: left;
        flex: 1;
      }
    `;
  }

  /**
   * Inject Gemini-specific button styles into the page
   */
  private injectGeminiButtonStyles(): void {
    if (this.geminiStylesInjected) {
      this.context.logger.debug('Gemini button styles already injected, skipping');
      return;
    }

    try {
      const styleId = 'mcp-gemini-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) {
        existingStyles.remove();
      }

      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getGeminiButtonStyles();
      document.head.appendChild(styleElement);

      this.geminiStylesInjected = true;
      this.context.logger.info('Gemini button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject Gemini button styles:', error);
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

    this.context.logger.debug(`Setting up store event listeners for Gemini adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for Gemini adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for Gemini adapter instance #${this.instanceId}`);
      this.uiIntegrationSetup = true;
    }

    // Wait for page to be ready, then inject MCP popover
    this.waitForPageReady().then(() => {
      this.injectMCPPopoverWithRetry();
    }).catch((error) => {
      this.context.logger.error('Failed to wait for page ready for MCP popover injection:', error);
      // Don't set up periodic check if we can't find insertion point
      return;
    });

    // Set up periodic check to ensure popover stays injected
    // this.setupPeriodicPopoverCheck();
  }

  private async waitForPageReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 15;
      
      const checkReady = () => {
        attempts++;
        
        // Check if the page has the necessary elements
        const insertionPoint = this.findButtonInsertionPoint();
        if (insertionPoint) {
          this.context.logger.debug(`Page ready for MCP popover injection (attempt ${attempts}/${maxAttempts})`);
          resolve();
        } else if (attempts >= maxAttempts) {
          this.context.logger.warn(`Failed to find button insertion point after ${maxAttempts} attempts, giving up`);
          reject(new Error(`Could not find insertion point after ${maxAttempts} attempts`));
        } else {
          // Retry after a short delay
          this.context.logger.debug(`Button insertion point not found, retrying... (attempt ${attempts}/${maxAttempts})`);
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
    this.context.logger.debug('Cleaning up DOM observers for Gemini adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Gemini adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Gemini adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Gemini adapter should not handle events, ignoring tool execution event');
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

    // Try primary selector first using getSelector method
    const buttonInsertionSelector = this.getSelector('buttonInsertionContainer');
    const selectors = buttonInsertionSelector.split(', ');
    
    for (const selector of selectors) {
      const wrapper = document.querySelector(selector.trim());
      if (wrapper) {
        this.context.logger.debug(`Found insertion point: ${selector.trim()}`);
        const btns = wrapper.querySelectorAll('button');
        const after = btns.length > 1 ? btns[1] : btns.length > 0 ? btns[0] : null;
        return { container: wrapper, insertAfter: after };
      }
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

    this.context.logger.warn('Could not find suitable insertion point for MCP popover');
    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    this.context.logger.debug('Injecting MCP popover into Gemini interface');

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
      // Import React and ReactDOM dynamically to avoid bundling issues
      import('react').then(React => {
        import('react-dom/client').then(ReactDOM => {
          import('../../components/mcpPopover/mcpPopover').then(({ MCPPopover }) => {
            // Create toggle state manager that integrates with new stores
            const toggleStateManager = this.createToggleStateManager();

            // Create adapter button configuration for Gemini styling
            const adapterButtonConfig = {
              className: 'mcp-gemini-button-base',
              contentClassName: 'mcp-gemini-button-content',
              textClassName: 'mcp-gemini-button-text',
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

            this.context.logger.info('MCP popover rendered successfully with new architecture');
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

  /**
   * Get selector from configuration with fallback
   */
  private getSelector(selectorName: keyof AdapterConfig['selectors']): string {
    if (this.config?.selectors[selectorName]) {
      return this.config.selectors[selectorName];
    }
    
    // Fallback to legacy selectors
    const fallbackMap: Record<keyof AdapterConfig['selectors'], string> = {
      chatInput: this.fallbackSelectors.CHAT_INPUT,
      submitButton: this.fallbackSelectors.SUBMIT_BUTTON,
      fileUploadButton: this.fallbackSelectors.FILE_UPLOAD_BUTTON,
      fileInput: this.fallbackSelectors.FILE_INPUT,
      mainPanel: this.fallbackSelectors.MAIN_PANEL,
      dropZone: this.fallbackSelectors.DROP_ZONE,
      filePreview: this.fallbackSelectors.FILE_PREVIEW,
      buttonInsertionContainer: this.fallbackSelectors.BUTTON_INSERTION_CONTAINER,
      fallbackInsertion: this.fallbackSelectors.FALLBACK_INSERTION,
      // Optional selectors - return empty string if not in fallback
      newChatButton: '',
      conversationHistory: '',
      conversationItem: '',
      messageContainer: '',
      userMessage: '',
      aiMessage: '',
      loadingIndicator: '',
      typingIndicator: '',
      toolbar: '',
      toolbarActions: '',
      settingsButton: '',
      optionsMenu: '',
      voiceInputButton: '',
      modelSelector: '',
      responseActions: '',
      copyButton: '',
      regenerateButton: '',
      shareButton: '',
      errorMessage: '',
      retryButton: ''
    };
    
    return fallbackMap[selectorName] || '';
  }

  /**
   * Initialize configuration from remote config or defaults
   */
  private async initializeConfig(): Promise<void> {
    try {
      // Initialize the config manager with context
      adapterConfigManager.initialize(this.context);
      
      // Load configuration
      this.config = await adapterConfigManager.getAdapterConfig('gemini');
      this.context?.logger.info('[GeminiAdapter] Configuration loaded successfully');
    } catch (error) {
      this.context?.logger.warn('[GeminiAdapter] Failed to load configuration, using defaults:', error);
      this.config = null; // Will use fallback selectors
    }
  }

  /**
   * Listen for remote config updates
   */
  private setupConfigUpdateListener(): void {
    // Listen for remote config updates
    this.context?.eventBus.on('remote-config:updated', (data) => {
      if (data.changes.includes('gemini_adapter_config')) {
        this.context?.logger.info('[GeminiAdapter] Remote config updated, refreshing configuration');
        this.refreshConfig();
      }
    });
  }

  /**
   * Refresh configuration from remote config
   */
  private async refreshConfig(): Promise<void> {
    try {
      // Clear cache for this adapter
      adapterConfigManager.clearCache('gemini');
      
      // Reload configuration
      this.config = await adapterConfigManager.getAdapterConfig('gemini');
      this.context?.logger.info('[GeminiAdapter] Configuration refreshed successfully');
    } catch (error) {
      this.context?.logger.warn('[GeminiAdapter] Failed to refresh configuration:', error);
    }
  }

  private async injectFileDropListener(): Promise<boolean> {
    try {
      const listenerUrl = this.context.chrome.runtime.getURL('dragDropListener.js');
      const scriptEl = document.createElement('script');
      scriptEl.src = listenerUrl;
      
      await new Promise<void>((resolve, reject) => {
        scriptEl.onload = () => resolve();
        scriptEl.onerror = () => reject(new Error('Failed to load drop listener script'));
        (document.head || document.documentElement).appendChild(scriptEl);
      });
      
      scriptEl.remove();
      return true;
    } catch (error) {
      this.context.logger.error('Failed to inject file drop listener:', error);
      return false;
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private async checkFilePreview(): Promise<boolean> {
    return new Promise(resolve => {
      setTimeout(() => {
        const filePreview = document.querySelector(this.getSelector('filePreview'));
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
    return `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.info(`Gemini page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject styles after page change
      this.injectGeminiButtonStyles();
      
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
    this.context.logger.info(`Gemini host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Gemini adapter no longer supported on this host/page');
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
    this.context.logger.info(`Tools detected in Gemini adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }
}
