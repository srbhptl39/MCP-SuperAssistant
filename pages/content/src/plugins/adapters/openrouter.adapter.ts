import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * OpenRouter Adapter for OpenRouter (openrouter.ai)
 *
 * This adapter provides specialized functionality for interacting with OpenRouter's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Built with the new plugin architecture and integrates with Zustand stores.
 */

const logger = createLogger('OpenRouterAdapter');

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
    // Primary chat input selector - updated for new structure (Jan 2026)
    CHAT_INPUT:
      'textarea[data-testid="composer-input"], textarea[placeholder="Start a new message..."], div[contenteditable="true"]',
    // Submit button selectors - updated for new structure
    SUBMIT_BUTTON:
      'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"]',
    // File upload related selectors - updated for new attachment button
    FILE_UPLOAD_BUTTON:
      'button[aria-label="Add attachment"], button[aria-label="Attach file"], button[aria-label*="attach"], input[type="file"]',
    FILE_INPUT: 'input[type="file"]',
    // Main panel and container selectors - updated for new structure
    MAIN_PANEL:
      '.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl, .rounded-xl.overflow-hidden.p-2.border.border-slate-4, .chat-container, .main-content',
    // Drop zones for file attachment - updated for new structure
    DROP_ZONE:
      '.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl, .rounded-lg.w-full.focus-within\\:bg-accent, textarea[data-testid="composer-input"], textarea[placeholder="Start a new message..."]',
    // File preview elements - updated for OpenRouter structure
    FILE_PREVIEW:
      '.duration-200.bg-accent\\/80.flex.w-full.shadow-inner.p-2, .bg-background.relative.h-32.w-48, .group.relative.flex.shrink-0, .file-preview, .attachment-preview, .file-attachment',
    // Button insertion points (for MCP popover) - updated for new button container (Jan 2026)
    BUTTON_INSERTION_CONTAINER:
      '.flex.items-center.gap-1.pl-2, .flex.gap-1.mt-2.items-center.justify-between, .relative.flex.min-w-0.items-center',
    // Alternative insertion points
    FALLBACK_INSERTION:
      '.flex.gap-1.mt-2.items-center.justify-between, .flex.items-center.gap-1, .input-area, .chat-input-container',
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
    logger.debug(`Instance #${this.instanceId} created. Total instances: ${OpenRouterAdapter.instanceCount}`,
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

      // Additional check for the new send button structure (Jan 2026)
      if (!submitButton) {
        // Look for the send button by its specific characteristics - arrow up icon
        const sendButtons = document.querySelectorAll('button');
        for (let i = 0; i < sendButtons.length; i++) {
          const button = sendButtons[i];
          const svg = button.querySelector('svg[stroke="currentColor"]');
          // Check for the arrow-up path: "M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"
          const path = svg?.querySelector('path[d*="M4.5 10.5"]');
          if (path && svg) {
            submitButton = button as HTMLButtonElement;
            this.context.logger.debug('Found submit button by SVG arrow-up path structure');
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

      // Method 1: Try copy-paste simulation (the approach that works)
      const copyPasteSuccess = await this.tryCopyPasteAttachment(file);
      if (copyPasteSuccess) {
        return true;
      }

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
   * Find the attachment button in the new OpenRouter interface (Jan 2026)
   */
  private findAttachmentButton(): HTMLButtonElement | null {
    // Primary selector: button with aria-label="Add attachment"
    const primaryButton = document.querySelector('button[aria-label="Add attachment"]') as HTMLButtonElement;
    if (primaryButton) {
      this.context.logger.debug('Found attachment button by aria-label="Add attachment"');
      return primaryButton;
    }

    // Look for the attachment button using SVG path structure (paperclip icon)
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
   * Try copy-paste file attachment simulation (the method that actually works)
   */
  private async tryCopyPasteAttachment(file: File): Promise<boolean> {
    try {
      this.context.logger.debug(`Attempting copy-paste attachment for file: ${file.name}`);

      // Find the chat input textarea using new selectors (Jan 2026)
      const chatInput = (document.querySelector('textarea[data-testid="composer-input"]') ||
        document.querySelector('textarea[placeholder="Start a new message..."]')) as HTMLTextAreaElement;
      if (!chatInput) {
        this.context.logger.debug('Chat input textarea not found');
        return false;
      }

      // Focus the chat input first
      chatInput.focus();
      chatInput.click();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Method 1: Direct paste event with file in clipboard data
      this.context.logger.debug('Method 1: Direct paste event simulation');
      const success1 = await this.tryDirectPasteEvent(file, chatInput);
      if (success1) return true;

      // Method 2: Keyboard shortcut simulation
      this.context.logger.debug('Method 2: Keyboard shortcut simulation');
      const success2 = await this.tryKeyboardPasteSimulation(file, chatInput);
      if (success2) return true;

      // Method 3: Clipboard API approach
      this.context.logger.debug('Method 3: Clipboard API approach');
      const success3 = await this.tryClipboardAPIApproach(file, chatInput);
      if (success3) return true;

      // Method 4: Firefox-specific input event simulation
      this.context.logger.debug('Method 4: Firefox-specific input event simulation');
      const success4 = await this.tryFirefoxInputSimulation(file, chatInput);
      if (success4) return true;

      this.context.logger.debug('All copy-paste methods failed');
      return false;

    } catch (error) {
      this.context.logger.error('Error in copy-paste attachment:', error);
      return false;
    }
  }

  /**
   * Try direct paste event with file data (enhanced for Firefox compatibility)
   */
  private async tryDirectPasteEvent(file: File, chatInput: HTMLTextAreaElement): Promise<boolean> {
    try {
      // Create clipboard data with the file
      const clipboardData = new DataTransfer();
      clipboardData.items.add(file);

      // Create paste event with enhanced properties for Firefox
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData,
        composed: true,
      });

      // Firefox-specific: Add additional properties to the event
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: clipboardData,
        writable: false,
        configurable: true,
      });

      // Dispatch paste event on multiple targets for better compatibility (Jan 2026)
      const targets = [
        chatInput,
        chatInput.parentElement,
        chatInput.closest('.rounded-lg.w-full.focus-within\\:bg-accent'),
        chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl'),
        chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4'),
        document.activeElement,
      ].filter(Boolean);

      for (const target of targets) {
        if (target) {
          this.context.logger.debug(`Dispatching paste event on: ${target.tagName}.${target.className || 'no-class'}`);
          target.dispatchEvent(pasteEvent);
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Check immediately after each dispatch
          const previewFound = await this.checkFilePreview();
          if (previewFound) {
            this.context.logger.debug('Direct paste event succeeded');
            this.emitExecutionCompleted('attachFile', {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }, {
              success: true,
              previewFound: true,
              method: 'direct-paste-event',
            });
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.context.logger.error('Error in direct paste event:', error);
      return false;
    }
  }

  /**
   * Try keyboard paste simulation (Ctrl+V) - Enhanced for Firefox
   */
  private async tryKeyboardPasteSimulation(file: File, chatInput: HTMLTextAreaElement): Promise<boolean> {
    try {
      // Create clipboard data with the file
      const clipboardData = new DataTransfer();
      clipboardData.items.add(file);

      // Firefox-specific: Set up a global clipboard state
      (window as any).__mcpClipboardData = clipboardData;

      // Create enhanced keyboard events for Firefox compatibility
      const createKeyEvent = (type: string) => {
        const event = new KeyboardEvent(type, {
          key: 'v',
          code: 'KeyV',
          keyCode: 86,
          which: 86,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
        });
        
        // Firefox-specific properties
        Object.defineProperty(event, 'ctrlKey', { value: true, writable: false });
        Object.defineProperty(event, 'metaKey', { value: false, writable: false });
        
        return event;
      };

      // Simulate the keyboard sequence more realistically
      const keydownEvent = createKeyEvent('keydown');
      const keypressEvent = createKeyEvent('keypress');
      const keyupEvent = createKeyEvent('keyup');

      // Try on multiple targets with keyboard events followed by paste events
      const targets = [
        chatInput,
        chatInput.parentElement,
        document.activeElement,
        document,
        window,
      ].filter(Boolean);

      for (const target of targets) {
        if (target) {
          this.context.logger.debug(`Trying keyboard simulation on: ${target.constructor.name}`);
          
          // Dispatch keyboard sequence
          target.dispatchEvent(keydownEvent);
          await new Promise(resolve => setTimeout(resolve, 50));
          
          target.dispatchEvent(keypressEvent);
          await new Promise(resolve => setTimeout(resolve, 50));
          
          target.dispatchEvent(keyupEvent);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Follow up with a paste event that might be triggered by the keyboard event
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboardData,
            composed: true,
          });

          // Firefox-specific: Ensure clipboardData is properly attached
          Object.defineProperty(pasteEvent, 'clipboardData', {
            value: clipboardData,
            writable: false,
            configurable: true,
          });

          target.dispatchEvent(pasteEvent);
          await new Promise(resolve => setTimeout(resolve, 300));

          // Check for file preview after each attempt
          const previewFound = await this.checkFilePreview();
          if (previewFound) {
            this.context.logger.debug('Keyboard paste simulation succeeded');
            
            // Clean up global state
            delete (window as any).__mcpClipboardData;
            
            this.emitExecutionCompleted('attachFile', {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }, {
              success: true,
              previewFound: true,
              method: 'keyboard-paste-simulation',
            });
            return true;
          }
        }
      }

      // Clean up global state
      delete (window as any).__mcpClipboardData;
      
      return false;
    } catch (error) {
      this.context.logger.error('Error in keyboard paste simulation:', error);
      // Clean up global state on error
      delete (window as any).__mcpClipboardData;
      return false;
    }
  }

  /**
   * Try Clipboard API approach - Enhanced for Firefox compatibility
   */
  private async tryClipboardAPIApproach(file: File, chatInput: HTMLTextAreaElement): Promise<boolean> {
    try {
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.write) {
        this.context.logger.debug('Clipboard API not available, skipping');
        return false;
      }

      this.context.logger.debug('Using Clipboard API to write file');

      // Try different MIME type approaches for better Firefox compatibility
      const mimeTypeAttempts = [
        file.type, // Original MIME type
        'application/octet-stream', // Generic binary
        'text/plain', // Fallback for text files
      ];

      for (const mimeType of mimeTypeAttempts) {
        try {
          this.context.logger.debug(`Attempting Clipboard API with MIME type: ${mimeType}`);
          
          // Create a new File object with the fallback MIME type if needed
          const fileForClipboard = mimeType === file.type 
            ? file 
            : new File([file], file.name, { type: mimeType });

          const clipboardItem = new ClipboardItem({
            [mimeType]: fileForClipboard,
          });

          await navigator.clipboard.write([clipboardItem]);
          this.context.logger.debug(`Successfully wrote to clipboard with MIME type: ${mimeType}`);
          
          await new Promise(resolve => setTimeout(resolve, 300));

          // Create paste event with clipboard data
          const clipboardData = new DataTransfer();
          clipboardData.items.add(fileForClipboard);

          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboardData,
            composed: true,
          });

          // Firefox-specific: Ensure clipboardData is properly attached
          Object.defineProperty(pasteEvent, 'clipboardData', {
            value: clipboardData,
            writable: false,
            configurable: true,
          });

          // Try dispatching on multiple targets (Jan 2026)
          const targets = [
            chatInput,
            chatInput.parentElement,
            chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl'),
            chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4'),
            document.activeElement,
          ].filter(Boolean);

          for (const target of targets) {
            if (target) {
              target.dispatchEvent(pasteEvent);
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Check for file preview
              const previewFound = await this.checkFilePreview();
              if (previewFound) {
                this.context.logger.debug(`Clipboard API approach succeeded with MIME type: ${mimeType}`);
                this.emitExecutionCompleted('attachFile', {
                  fileName: file.name,
                  fileType: file.type,
                  fileSize: file.size,
                }, {
                  success: true,
                  previewFound: true,
                  method: 'clipboard-api',
                });
                return true;
              }
            }
          }

        } catch (mimeError) {
          const errorMessage = mimeError instanceof Error ? mimeError.message : String(mimeError);
          this.context.logger.debug(`MIME type ${mimeType} failed:`, errorMessage);
          // Continue to next MIME type
        }
      }

      return false;
    } catch (error) {
      this.context.logger.error('Error in Clipboard API approach:', error);
      return false;
    }
  }

  /**
   * Try Firefox-specific input event simulation
   */
  private async tryFirefoxInputSimulation(file: File, chatInput: HTMLTextAreaElement): Promise<boolean> {
    try {
      this.context.logger.debug('Attempting Firefox-specific input simulation');

      // Create a DataTransfer with the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create an input event with file data
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: null,
        inputType: 'insertFromPaste',
      });

      // Firefox-specific: Add dataTransfer to the input event
      Object.defineProperty(inputEvent, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
        configurable: true,
      });

      // Also create a beforeinput event (Firefox sometimes needs this)
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: null,
        inputType: 'insertFromPaste',
      });

      Object.defineProperty(beforeInputEvent, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
        configurable: true,
      });

      // Try the sequence on multiple targets (Jan 2026)
      const targets = [
        chatInput,
        chatInput.parentElement,
        chatInput.closest('.rounded-lg.w-full.focus-within\\:bg-accent'),
        chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl'),
        chatInput.closest('.rounded-xl.overflow-hidden.p-2.border.border-slate-4'),
      ].filter(Boolean);

      for (const target of targets) {
        if (target) {
          this.context.logger.debug(`Trying Firefox input simulation on: ${target.tagName}.${target.className || 'no-class'}`);
          
          // Dispatch beforeinput first
          target.dispatchEvent(beforeInputEvent);
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Then input event
          target.dispatchEvent(inputEvent);
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Follow up with a paste event
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
            composed: true,
          });

          Object.defineProperty(pasteEvent, 'clipboardData', {
            value: dataTransfer,
            writable: false,
            configurable: true,
          });

          target.dispatchEvent(pasteEvent);
          await new Promise(resolve => setTimeout(resolve, 300));

          // Check for file preview
          const previewFound = await this.checkFilePreview();
          if (previewFound) {
            this.context.logger.debug('Firefox input simulation succeeded');
            this.emitExecutionCompleted('attachFile', {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }, {
              success: true,
              previewFound: true,
              method: 'firefox-input-simulation',
            });
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.context.logger.error('Error in Firefox input simulation:', error);
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

    // Jan 2026: Look for the container with send button (div.flex.items-center.gap-1.pl-2)
    const sendButtonContainer = document.querySelector('.flex.items-center.gap-1.pl-2');
    if (sendButtonContainer) {
      this.context.logger.debug('Found send button container for insertion');
      // Insert after the send button
      const sendButton = sendButtonContainer.querySelector('button[data-testid="send-button"]');
      return { container: sendButtonContainer, insertAfter: sendButton };
    }

    // Try primary selector first - using the configured selectors
    const primarySelectors = this.selectors.BUTTON_INSERTION_CONTAINER.split(', ');

    for (const selector of primarySelectors) {
      const wrapper = document.querySelector(selector.trim());
      if (wrapper) {
        this.context.logger.debug(`Found insertion point: ${selector.trim()}`);
        // Look for Web Search button to insert after (Jan 2026 structure)
        let webSearchButton: Element | null = null;

        // Find the web search button by aria-label
        webSearchButton = wrapper.querySelector('button[aria-label="Enable Web Search"]');

        // Fallback: look for the web search icon by SVG path
        if (!webSearchButton) {
          const globePath = wrapper.querySelector('svg path[d*="M12 21a9.004"]');
          webSearchButton = globePath?.closest('button') || null;
        }

        // Second fallback: Find by text content
        if (!webSearchButton) {
          const flexElements = wrapper.querySelectorAll('div.inline-flex.items-center');
          for (let i = 0; i < flexElements.length; i++) {
            const element = flexElements[i];
            if (element.textContent?.includes('Web search')) {
              webSearchButton = element;
              break;
            }
          }
        }

        return { container: wrapper, insertAfter: webSearchButton };
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
        // Check for the specific OpenRouter file preview structure (Jan 2026)
        const chatContainer =
          document.querySelector('.rounded-xl.overflow-hidden.p-2.border.border-slate-4.w-full.max-w-4xl') ||
          document.querySelector('.rounded-xl.overflow-hidden.p-2.border.border-slate-4');
        if (chatContainer) {
          // Look for the file preview area that appears after file drop
          const filePreviewArea = chatContainer.querySelector('.duration-200.bg-accent\\/80.flex.w-full.shadow-inner.p-2');
          if (filePreviewArea) {
            this.context.logger.debug('Found OpenRouter file preview area');
            resolve(true);
            return;
          }

          // Look for file attachment containers
          const fileAttachments = chatContainer.querySelectorAll('.bg-background.relative.h-32.w-48');
          if (fileAttachments.length > 0) {
            this.context.logger.debug(`Found ${fileAttachments.length} file attachment(s)`);
            resolve(true);
            return;
          }

          // Look for file preview with filename
          const fileNameElements = chatContainer.querySelectorAll('.w-40.truncate.pl-2');
          for (let i = 0; i < fileNameElements.length; i++) {
            const element = fileNameElements[i] as HTMLElement;
            if (element.textContent && element.textContent.trim().length > 0) {
              this.context.logger.debug(`Found file with name: ${element.textContent.trim()}`);
              resolve(true);
              return;
            }
          }

          // Look for the scroll area that contains file previews
          const scrollArea = chatContainer.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollArea && scrollArea.children.length > 0) {
            this.context.logger.debug('Found content in scroll area - likely file preview');
            resolve(true);
            return;
          }
        }

        // Fallback: Check for common file preview indicators
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
          // OpenRouter specific selectors
          '.group.relative.flex.shrink-0',
          '.bg-background.relative.h-32',
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
              (element.textContent?.trim() || element.querySelector('img, svg, pre'))
            ) {
              this.context.logger.debug(`File preview found with selector: ${selector}`);
              resolve(true);
              return;
            }
          }
        }

        this.context.logger.debug('No file preview found');
        resolve(false);
      }, 1500); // Wait longer to allow for processing
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
