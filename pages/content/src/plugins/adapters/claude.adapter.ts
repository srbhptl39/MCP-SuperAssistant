import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext, ChipAnchors } from '../plugin-types';
import { inputChips } from '../../services/input-chips';

/**
 * Claude Adapter for Claude.ai (claude.ai)
 *
 * This adapter provides specialized functionality for interacting with Claude's
 * chat interface (a TipTap/ProseMirror contenteditable composer), including text
 * insertion, form submission, and MCP popover injection.
 *
 * Modeled on the Perplexity adapter — a rich contenteditable editor with a
 * paste-write-and-verify method, no explicit <form>, and an Enter-key submit fallback.
 */
export class ClaudeAdapter extends BaseAdapterPlugin {
  readonly name = 'ClaudeAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['claude.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'dom-manipulation',
  ];

  // CSS selectors for Claude's UI elements
  private readonly selectors = {
    // TipTap/ProseMirror composer — data-testid is the most stable anchor
    CHAT_INPUT: 'div[data-testid="chat-input"][contenteditable="true"], div.ProseMirror[contenteditable="true"][role="textbox"], div[aria-label="Write your prompt to Claude"]',
    // Single toggle button: "Send message" (has content) / "Use voice mode" (empty). No <form>.
    SUBMIT_BUTTON: 'button[aria-label="Send message"], fieldset button[type="submit"], button[aria-label="Send Message"]',
    // Not implemented for MVP but kept for insertion-point discovery
    FILE_UPLOAD_BUTTON: 'button[aria-label="Add files, connectors, and more"], input[data-testid="file-upload"]',
    FILE_INPUT: 'input[data-testid="file-upload"], input[type="file"]',
    MAIN_PANEL: 'main, .flex.flex-col',
    DROP_ZONE: 'div[data-testid="chat-input"], fieldset',
    FILE_PREVIEW: '.file-preview, [data-testid*="attachment"]',
    // MCP popover insertion: leading toolbar action group (holds the "Add files" button)
    BUTTON_INSERTION_CONTAINER: 'fieldset .relative.shrink-0.flex.items-center.gap-1, div.relative.flex.items-center.w-full.gap-2',
    FALLBACK_INSERTION: 'fieldset .relative.flex.items-center.w-full.gap-2, fieldset',
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
    ClaudeAdapter.instanceCount++;
    this.instanceId = ClaudeAdapter.instanceCount;
    console.debug(`[ClaudeAdapter] Instance #${this.instanceId} created. Total instances: ${ClaudeAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`Claude adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing Claude adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Claude adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating Claude adapter instance #${this.instanceId}...`);

    // Inject Claude-specific button styles
    this.injectClaudeButtonStyles();

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
      this.context?.logger.warn('Claude adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating Claude adapter...');

    // Clean up UI integration
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();
    inputChips.teardown();

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
    this.context.logger.debug('Cleaning up Claude adapter...');

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
    const styleElement = document.getElementById('mcp-claude-button-styles');
    if (styleElement) {
      styleElement.remove();
      this.adapterStylesInjected = false;
    }

    // Final cleanup
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();
    inputChips.teardown();

    // Reset all setup flags
    this.storeEventListenersSetup = false;
    this.domObserversSetup = false;
    this.uiIntegrationSetup = false;
  }

  /**
   * Insert text into the Claude chat input field.
   * Captures into a chip first (when the chip system is active), otherwise writes
   * into the TipTap composer via the verified paste method.
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement; source?: 'instructions' | 'tool-result' | 'capture' | 'tab-content' | 'unknown'; label?: string }): Promise<boolean> {
    if (inputChips.tryCapture(this, text, options)) {
      this.emitExecutionCompleted('insertText', { text }, { success: true, method: 'chip-capture' });
      return true;
    }

    this.context.logger.debug(`Attempting to insert text into Claude chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find Claude chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      return await this.insertTextViaTipTapPaste(targetElement, text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into Claude chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Insert text into Claude's TipTap (ProseMirror) contenteditable composer.
   *
   * A synthetic `paste` carrying text/plain is processed by ProseMirror's paste handler,
   * updates its state, and preserves newlines (multi-line becomes real <p> blocks). Plain
   * InputEvents do not reliably drive ProseMirror's internal state, so we use the paste path.
   *
   * We APPEND (cursor to end) rather than replace so an already-typed user query is kept intact:
   * [existing query] + blank line + [payload]. ProseMirror reconciles on the next tick, so we wait
   * and then confirm the content actually grew — returning false on a genuine no-op so the caller
   * (chip flush) restores the chips instead of silently dropping the payload.
   */
  private async insertTextViaTipTapPaste(element: HTMLElement, text: string): Promise<boolean> {
    try {
      const before = this.getElementContent(element);
      // claude.ai converts a long paste into a native "pasted content" attachment chip
      // (data-testid="file-thumbnail") instead of growing the editor text. Count those in the
      // composer so an attachment conversion isn't misread as a no-op. Scope to the fieldset —
      // sent messages in the transcript also render file-thumbnail.
      const attachmentScope = element.closest('fieldset') ?? document;
      const ATTACHMENT_SELECTOR = '[data-testid="file-thumbnail"]';
      const attachmentsBefore = attachmentScope.querySelectorAll(ATTACHMENT_SELECTOR).length;

      // Focus and collapse the caret to the end of any existing content.
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const toInsert = before ? '\n\n' + text : text;
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', toInsert);
      element.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      }));

      // ProseMirror applies the paste on the next tick — wait, then verify the write landed.
      await new Promise(resolve => setTimeout(resolve, 50));
      const after = this.getElementContent(element);
      const grewInline = after.length > before.length;
      const gainedAttachment = attachmentScope.querySelectorAll(ATTACHMENT_SELECTOR).length > attachmentsBefore;
      if (!grewInline && !gainedAttachment) {
        this.context.logger.error('Claude TipTap paste did not change composer content');
        this.emitExecutionFailed('insertText', 'Composer content unchanged after paste insertion');
        return false;
      }

      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: before.length,
        newLength: text.length,
        totalLength: after.length,
        method: 'tiptap-paste'
      });

      this.context.logger.debug(`Text inserted via TipTap paste. Before: ${before.length}, Added: ${text.length}, After: ${after.length}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`TipTap paste insertion failed: ${errorMessage}`);
      this.emitExecutionFailed('insertText', `TipTap paste insertion failed: ${errorMessage}`);
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

  getChipAnchors(): ChipAnchors | null {
    let input: HTMLElement | null = null;
    for (const sel of this.selectors.CHAT_INPUT.split(', ')) {
      input = document.querySelector(sel.trim()) as HTMLElement | null;
      if (input) break;
    }
    if (!input) return null;
    const container = (input.closest('div.\\!box-content')            // themed bg-bg-000 composer box (overflow visible)
      ?? input.closest('[class*="box-content"]')                       // attribute-substring fallback
      ?? input.closest('fieldset')                                     // fallback: full composer fieldset
      ?? input.parentElement?.parentElement
      ?? input.parentElement) as HTMLElement | null;
    if (!container) return null;
    return { input, container, submitButtonSelector: this.selectors.SUBMIT_BUTTON };
  }

  /**
   * Submit the current text in the Claude chat input.
   * Attempts a button click, falling back to Enter-key submission (the primary expected
   * success path given Claude's `enterkeyhint="enter"` composer).
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    await inputChips.flushBeforeSubmit(this);

    this.context.logger.debug('Attempting to submit Claude chat input');

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
          this.context.logger.warn('Claude submit button is disabled, waiting for it to be enabled');

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
          this.context.logger.warn('Claude submit button is not visible, falling back to Enter key');
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

        this.context.logger.debug('Claude chat input submitted successfully via button click');
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.logger.error(`Error clicking submit button: ${errorMessage}, falling back to Enter key`);
        return this.submitWithEnterKey();
      }
    } else {
      this.context.logger.warn('Could not find Claude submit button, falling back to Enter key');
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

      // Focus the input
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

      // Try form submission as additional fallback (harmless no-op if there is no form)
      const form = chatInput.closest('form') as HTMLFormElement;
      if (form) {
        this.context.logger.debug('Submitting form as additional fallback');
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      }

      this.emitExecutionCompleted('submitForm', {}, {
        success: true,
        method: 'enterKey+formSubmit'
      });

      this.context.logger.debug('Claude chat input submitted successfully via Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting with Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Check if the current page/URL is supported by this adapter
   */
  isSupported(): boolean | Promise<boolean> {
    const host = window.location.hostname;
    if (!host.includes('claude.ai')) {
      this.context.logger.debug(`Host ${host} not supported by Claude adapter`);
      return false;
    }
    const url = window.location.href;
    // Chat surfaces only — skip settings/recents landing where there is no composer
    const isSupported = /^https:\/\/claude\.ai\/(new|chat\/|project\/)/.test(url)
      || /^https:\/\/claude\.ai\/?$/.test(url);   // root sometimes renders the new-chat composer

    if (isSupported) {
      this.context.logger.debug(`Claude adapter supports current page: ${url}`);
    } else {
      this.context.logger.debug(`URL pattern not supported: ${url}`);
    }

    return isSupported;
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

    this.context.logger.debug(`Setting up store event listeners for Claude adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for Claude adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for Claude adapter instance #${this.instanceId}`);
      this.uiIntegrationSetup = true;
    }

    // Wait for page to be ready, then inject MCP popover
    this.waitForPageReady().then(() => {
      this.injectMCPPopoverWithRetry();
    }).catch((error) => {
      this.context.logger.warn('Failed to wait for page ready:', error);
      // Don't retry if we can't find insertion point
    });
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
    this.context.logger.debug('Cleaning up DOM observers for Claude adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Claude adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Claude adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Claude adapter should not handle events, ignoring tool execution event');
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

    // Primary: leading toolbar action group(s) that hold the "Add files" button
    const containerSelectors = this.selectors.BUTTON_INSERTION_CONTAINER.split(', ');
    for (const selector of containerSelectors) {
      const container = document.querySelector(selector.trim());
      if (container) {
        this.context.logger.debug(`Found insertion container: ${selector.trim()}`);
        const fileUploadButton = container.querySelector('button[aria-label="Add files, connectors, and more"]');
        return { container, insertAfter: fileUploadButton };
      }
    }

    // Fallback: full composer toolbar row / fieldset
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
    this.context.logger.debug('Injecting MCP popover into Claude interface');

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
              className: 'mcp-claude-button-base',
              contentClassName: 'mcp-claude-button-content',
              textClassName: 'mcp-claude-button-text',
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
    return `claude-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`Claude page changed: from ${oldUrl || 'N/A'} to ${url}`);

    // Update URL tracking
    this.lastUrl = url;

    // Re-check support and re-inject UI if needed
    const stillSupported = this.isSupported();
    if (stillSupported) {
      // Re-inject styles on page navigation
      this.adapterStylesInjected = false;
      this.injectClaudeButtonStyles();

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
    this.context.logger.debug(`Claude host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Claude adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in Claude adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  // Claude-specific button styling methods

  /**
   * Get Claude-specific button styles — a neutral toolbar-icon-button look matching
   * Claude's 32×32 rounded toolbar buttons on a dark composer surface.
   */
  private getClaudeButtonStyles(): string {
    return `
      .mcp-claude-button-base {
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
        min-width: 32px;
        padding: 0 6px;
        gap: 6px;
        font-size: 14px;
        font-weight: 500;
        border: none;
        background: transparent;
        color: var(--text-300, #8a8a86);
        transition: all 200ms ease-out;
      }

      .mcp-claude-button-base:hover {
        background: var(--bg-300, rgba(255, 255, 255, 0.06));
        color: var(--text-100, #e5e5e2);
      }

      .mcp-claude-button-base.mcp-button-active {
        color: var(--text-100, #e5e5e2);
        background: var(--bg-300, rgba(255, 255, 255, 0.08));
      }

      .mcp-claude-button-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
        font-weight: 500;
        position: relative;
        z-index: 10;
        height: 32px;
        padding: 4px 6px;
      }

      .mcp-claude-button-text {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.2;
        color: inherit;
      }

      .mcp-claude-button-base svg,
      .mcp-claude-button-base img {
        width: 16px;
        height: 16px;
        transition: all 200ms ease-out;
        flex-shrink: 0;
      }

      .mcp-claude-button-base img {
        border-radius: 50%;
        margin-right: 1px;
      }

      .mcp-claude-button-base:focus-visible {
        outline: 2px solid var(--text-100, #e5e5e2);
        outline-offset: 2px;
      }

      @media (max-width: 640px) {
        .mcp-claude-button-base {
          height: 28px;
          min-width: 28px;
          padding: 0 4px;
          font-size: 13px;
        }

        .mcp-claude-button-content {
          height: 28px;
          padding: 2px 4px;
        }

        .mcp-claude-button-base svg,
        .mcp-claude-button-base img {
          width: 14px;
          height: 14px;
        }
      }
    `;
  }

  /**
   * Inject Claude-specific button styles into the page
   */
  private injectClaudeButtonStyles(): void {
    if (this.adapterStylesInjected) return;

    try {
      const styleId = 'mcp-claude-button-styles';
      const existingStyles = document.getElementById(styleId);
      if (existingStyles) existingStyles.remove();

      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = this.getClaudeButtonStyles();
      document.head.appendChild(styleElement);

      this.adapterStylesInjected = true;
      this.context.logger.debug('Claude button styles injected successfully');
    } catch (error) {
      this.context.logger.error('Failed to inject Claude button styles:', error);
    }
  }
}
