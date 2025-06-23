import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * GitHub Copilot Adapter for GitHub Copilot (github.com/copilot)
 *
 * This adapter provides specialized functionality for interacting with GitHub Copilot's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */
export class GitHubCopilotAdapter extends BaseAdapterPlugin {
  readonly name = 'GitHubCopilotAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['github.com/copilot'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    // 'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for GitHub Copilot's UI elements
  // Updated selectors based on current GitHub Copilot interface
  private readonly selectors = {
    // Primary chat input selector
    CHAT_INPUT: '#copilot-chat-textarea, .ChatInput-module__input--iApWs, textarea[placeholder*="How can I help"]',
    // Submit button selectors (multiple fallbacks)
    SUBMIT_BUTTON: 'button[aria-labelledby*="Send"], button:has(.octicon-paper-airplane), .ChatInput-module__toolbarRight--PiQJn button[type="button"]:last-child',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: 'button[data-testid="attachment-menu-button"], button[aria-label*="Attach"], button:has(.octicon-paperclip)',
    FILE_INPUT: '#image-uploader, input[type="file"][accept*="image"], input[type="file"][hidden]',
    // Main panel and container selectors
    MAIN_PANEL: '.Layout-module__chatInputContainer--DXrKy, .ChatInput-module__container--NFzCy, main',
    // Drop zones for file attachment
    DROP_ZONE: '.ChatInput-module__inputContainer--BcExV, .Layout-module__chatInputContainer--DXrKy, #copilot-chat-textarea',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, .ChatInput-module__attachment',
    // Button insertion points (for MCP popover)
    BUTTON_INSERTION_CONTAINER: '.ChatInput-module__toolbarLeft--cjV2H, .ChatInput-module__toolbar--ZtCiG',
    // Alternative insertion points
    FALLBACK_INSERTION: '.ChatInput-module__container--NFzCy, .Layout-module__chatInputContainer--DXrKy'
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

  // Adapter-specific button styling
  private adapterStylesInjected: boolean = false;

  constructor() {
    super();
    GitHubCopilotAdapter.instanceCount++;
    this.instanceId = GitHubCopilotAdapter.instanceCount;
    console.debug(`[GitHubCopilotAdapter] Instance #${this.instanceId} created. Total instances: ${GitHubCopilotAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`GitHub Copilot adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing GitHub Copilot adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();

    // Inject GitHub-specific button styles
    this.injectGitHubButtonStyles();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`GitHub Copilot adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating GitHub Copilot adapter instance #${this.instanceId}...`);

    // Inject GitHub-specific button styles
    this.injectGitHubButtonStyles();

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
      this.context?.logger.warn('GitHub Copilot adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating GitHub Copilot adapter...');

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
    this.context.logger.debug('Cleaning up GitHub Copilot adapter...');

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
    const styleElement = document.getElementById('mcp-github-copilot-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.adapterStylesInjected = false;
      this.context.logger.debug('GitHub Copilot button styles removed');
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
   * Insert text into the GitHub Copilot chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into GitHub Copilot chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find GitHub Copilot chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Store the original value
      const originalValue = (targetElement as HTMLTextAreaElement).value || '';

      // Focus the input element
      targetElement.focus();

      // Insert the text by updating the value property (textarea element)
      // Append the text to the original value on a new line if there's existing content
      const newContent = originalValue ? originalValue + '\n' + text : text;
      (targetElement as HTMLTextAreaElement).value = newContent;

      // Dispatch events to simulate user typing for better compatibility
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Trigger React's change detection if needed
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(targetElement, newContent);
        const event = new Event('input', { bubbles: true });
        targetElement.dispatchEvent(event);
      }

      // Emit success event to the new event system
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length,
        totalLength: newContent.length
      });

      this.context.logger.debug(`Text inserted successfully. Original: ${originalValue.length}, Added: ${text.length}, Total: ${newContent.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into GitHub Copilot chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the GitHub Copilot chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit GitHub Copilot chat input');

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
      this.context.logger.error('Could not find GitHub Copilot submit button');
      this.emitExecutionFailed('submitForm', 'Submit button not found');
      return false;
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('GitHub Copilot submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('GitHub Copilot submit button is not visible');
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

      this.context.logger.debug('GitHub Copilot chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting GitHub Copilot chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the GitHub Copilot chat input
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

      // Check if file type is supported (GitHub Copilot supports images)
      const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
      if (!supportedTypes.some(type => file.type.includes(type.split('/')[1]))) {
        this.emitExecutionFailed('attachFile', `Unsupported file type: ${file.type}. GitHub Copilot supports: ${supportedTypes.join(', ')}`);
        return false;
      }

      // Check if file upload is supported on current page
      if (!this.supportsFileUpload()) {
        this.emitExecutionFailed('attachFile', 'File upload not supported on current page');
        return false;
      }

      // Try to use the file input element directly
      let fileInput = options?.inputElement;
      if (!fileInput) {
        const selectors = this.selectors.FILE_INPUT.split(', ');
        for (const selector of selectors) {
          fileInput = document.querySelector(selector.trim()) as HTMLInputElement;
          if (fileInput) {
            this.context.logger.debug(`Found file input using selector: ${selector.trim()}`);
            break;
          }
        }
      }

      if (fileInput) {
        // Create a DataTransfer object to set files
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          inputElement: fileInput.tagName
        }, {
          success: true,
          method: 'direct-file-input'
        });

        this.context.logger.debug(`File attached successfully via input element: ${file.name}`);
        return true;
      }

      // Fallback: Try to trigger file upload button and simulate file selection
      const uploadButton = document.querySelector(this.selectors.FILE_UPLOAD_BUTTON) as HTMLButtonElement;
      if (uploadButton) {
        // Click the upload button to open file dialog
        uploadButton.click();

        // Wait a bit and try to find the file input that appears
        setTimeout(() => {
          const newFileInput = document.querySelector(this.selectors.FILE_INPUT) as HTMLInputElement;
          if (newFileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            newFileInput.files = dataTransfer.files;
            newFileInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 100);

        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        }, {
          success: true,
          method: 'upload-button-trigger'
        });

        this.context.logger.debug(`File attachment initiated via upload button: ${file.name}`);
        return true;
      }

      this.emitExecutionFailed('attachFile', 'Could not find file input or upload button');
      return false;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to GitHub Copilot: ${errorMessage}`);
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

    this.context.logger.debug(`Checking if GitHub Copilot adapter supports: ${currentUrl}`);

    // Check hostname first
    const isGitHubHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isGitHubHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by GitHub Copilot adapter`);
      return false;
    }

    // Check if we're on a supported GitHub Copilot page
    const supportedPatterns = [
      /^https:\/\/github\.com\/copilot$/,                    // Main copilot page
      /^https:\/\/github\.com\/copilot\/.*$/,                // Copilot sub-pages
      /^https:\/\/github\.com\/features\/copilot.*$/,        // Features pages
      /^https:\/\/copilot\.github\.com\/.*$/                 // Copilot subdomain if exists
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`GitHub Copilot adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for GitHub Copilot');

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

    this.context.logger.debug(`Setting up store event listeners for GitHub Copilot adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for GitHub Copilot adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for GitHub Copilot adapter instance #${this.instanceId}`);
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
    this.context.logger.debug('Cleaning up DOM observers for GitHub Copilot adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for GitHub Copilot adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in GitHub Copilot adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('GitHub Copilot adapter should not handle events, ignoring tool execution event');
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

    // Try primary selector first - GitHub Copilot's toolbar left section
    const toolbar = document.querySelector('.ChatInput-module__toolbarLeft--cjV2H');
    if (toolbar) {
      this.context.logger.debug('Found insertion point: .ChatInput-module__toolbarLeft--cjV2H');
      const attachButton = toolbar.querySelector('button[data-testid="attachment-menu-button"]');
      return { container: toolbar, insertAfter: attachButton };
    }

    // Try fallback selector - general toolbar
    const generalToolbar = document.querySelector('.ChatInput-module__toolbar--ZtCiG');
    if (generalToolbar) {
      this.context.logger.debug('Found fallback insertion point: .ChatInput-module__toolbar--ZtCiG');
      return { container: generalToolbar, insertAfter: null };
    }

    // Try other fallback selectors
    const fallbackSelectors = [
      '.ChatInput-module__container--NFzCy',
      '.Layout-module__chatInputContainer--DXrKy'
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
    this.context.logger.debug('Injecting MCP popover into GitHub Copilot interface');

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

            // GitHub-specific button styling configuration
            const adapterButtonConfig = {
              className: 'mcp-gh-button-base',
              contentClassName: 'mcp-gh-button-content',
              textClassName: 'mcp-gh-button-text',
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

            this.context.logger.debug('MCP popover rendered successfully with GitHub styling');
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

  private async checkFilePreview(): Promise<boolean> {
    return new Promise(resolve => {
      setTimeout(() => {
        const filePreview = document.querySelector(this.selectors.FILE_PREVIEW);
        if (filePreview) {
          this.context.logger.debug('File preview element found after attachment');
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
    return `github-copilot-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`GitHub Copilot page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject GitHub button styles after page change
      setTimeout(() => {
        this.injectGitHubButtonStyles();
      }, 500); // Inject styles early

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
    this.context.logger.debug(`GitHub Copilot host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('GitHub Copilot adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in GitHub Copilot adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  /**
   * Get GitHub Copilot specific button styles that match the native UI
   * Mimics the styling of GitHub's Primer React Components
   * 
   * @returns CSS string with GitHub-specific button styles
   * 
   * @example
   * // For other adapters, implement a similar method:
   * // private getAdapterButtonStyles(): string {
   * //   return `
   * //     .mcp-adapter-button-base {
   * //       // Your adapter-specific styling here
   * //       // Match your host site's button design
   * //     }
   * //   `;
   * // }
   */
  private getGitHubCopilotButtonStyles(): string {
    return `
/* GitHub Copilot MCP Button Styles - Matches Primer React Components */
.mcp-gh-button-base {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  appearance: none;
  text-decoration: none;
  text-align: center;
  border: 0;
  transition: 80ms cubic-bezier(0.65, 0, 0.35, 1);
  transition-property: color, fill, background-color, border-color;
  
  /* Medium size styling */
  height: 32px;
  padding: 0 12px;
  gap: 8px;
  min-width: max-content;
  
  /* Invisible variant - matches GitHub's invisible button style */
  color: var(--fgColor-muted, #656d76);
  background-color: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

.mcp-gh-button-base:hover:not(:disabled) {
  background-color: var(--control-transparent-bgColor-hover, rgba(175, 184, 193, 0.2));
  color: var(--fgColor-default, #1f2328);
  text-decoration: none;
  transition-duration: 80ms;
}

.mcp-gh-button-base:active:not(:disabled) {
  background-color: var(--control-transparent-bgColor-active, rgba(175, 184, 193, 0.3));
  transition: none;
}

.mcp-gh-button-base:focus:not(:disabled) {
  outline: 2px solid var(--focus-outlineColor, #0969da);
  outline-offset: -2px;
  box-shadow: none;
}

.mcp-gh-button-base:disabled {
  color: var(--control-fgColor-disabled, #8c959f);
  cursor: not-allowed;
}

.mcp-gh-button-base.mcp-button-active {
  background-color: var(--control-transparent-bgColor-selected, rgba(175, 184, 193, 0.15));
  color: var(--fgColor-accent, #0969da);
}

.mcp-gh-button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1 1 auto;
}

.mcp-gh-button-text {
  flex: 1 1 auto;
  font-weight: 500;
  font-size: 14px;
  line-height: 20px;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .mcp-gh-button-base {
    color: var(--fgColor-muted, #8b949e);
  }
  
  .mcp-gh-button-base:hover:not(:disabled) {
    background-color: var(--control-transparent-bgColor-hover, rgba(177, 186, 196, 0.12));
    color: var(--fgColor-default, #e6edf3);
  }
  
  .mcp-gh-button-base:active:not(:disabled) {
    background-color: var(--control-transparent-bgColor-active, rgba(177, 186, 196, 0.2));
  }
  
  .mcp-gh-button-base:focus:not(:disabled) {
    outline-color: var(--focus-outlineColor, #2f81f7);
  }
  
  .mcp-gh-button-base:disabled {
    color: var(--control-fgColor-disabled, #484f58);
  }
  
  .mcp-gh-button-base.mcp-button-active {
    background-color: var(--control-transparent-bgColor-selected, rgba(177, 186, 196, 0.08));
    color: var(--fgColor-accent, #2f81f7);
  }
}

/* Ensure button looks consistent with GitHub's toolbar */
.ChatInput-module__toolbarLeft--cjV2H .mcp-gh-button-base,
.ChatInput-module__toolbar--ZtCiG .mcp-gh-button-base {
  margin: 0 2px;
}

/* Additional refinements for better integration */
.mcp-gh-button-base svg {
  flex-shrink: 0;
  vertical-align: text-bottom;
}

.mcp-gh-button-base:focus-visible {
  outline: 2px solid var(--focus-outlineColor, #0969da);
  outline-offset: -2px;
}

.mcp-gh-button-base:not(:focus-visible) {
  outline: none;
}
`;
  }

  /**
   * Inject GitHub-specific button styles into the page
   * 
   * @example
   * // Template for other adapters:
   * // 
   * // private injectAdapterButtonStyles(): void {
   * //   if (this.adapterStylesInjected) return;
   * //   
   * //   try {
   * //     const styleId = 'mcp-[adapter-name]-button-styles';
   * //     const existingStyles = document.getElementById(styleId);
   * //     if (existingStyles) existingStyles.remove();
   * //     
   * //     const styleElement = document.createElement('style');
   * //     styleElement.id = styleId;
   * //     styleElement.textContent = this.getAdapterButtonStyles();
   * //     document.head.appendChild(styleElement);
   * //     
   * //     this.adapterStylesInjected = true;
   * //     this.context.logger.debug('[Adapter] button styles injected successfully');
   * //   } catch (error) {
   * //     this.context.logger.error('Failed to inject [adapter] button styles:', error);
   * //   }
   * // }
   * //
   * // Then in renderMCPPopover method:
   * // const adapterButtonConfig = {
   * //   className: 'mcp-[adapter]-button-base',
   * //   contentClassName: 'mcp-[adapter]-button-content', 
   * //   textClassName: 'mcp-[adapter]-button-text',
   * //   activeClassName: 'mcp-button-active'
   * // };
   */
  private injectGitHubButtonStyles(): void {
    if (this.adapterStylesInjected) {
      this.context.logger.debug('GitHub button styles already injected, skipping');
      return;
    }

    try {
      const styleId = 'mcp-github-copilot-button-styles';
      
      // Remove existing styles if any
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) {
        existingStyles.remove();
      }

      // Inject new styles
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getGitHubCopilotButtonStyles();
      document.head.appendChild(styleElement);

      this.adapterStylesInjected = true;
      this.context.logger.debug('GitHub Copilot button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject GitHub button styles:', error);
    }
  }
}
