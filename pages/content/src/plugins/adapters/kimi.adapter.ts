import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Kimi Adapter for Kimi Chat (kimi.com)
 *
 * This adapter provides specialized functionality for interacting with Kimi's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */

const logger = createLogger('KimiAdapter');

export class KimiAdapter extends BaseAdapterPlugin {
  readonly name = 'KimiAdapter';
  readonly version = '2.0.0'; // Incremented for new architecture
  readonly hostnames = ['kimi.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Kimi's UI elements
  // Updated selectors based on current Kimi interface
  private readonly selectors = {
    // Primary chat input selector - Kimi uses contenteditable div
    CHAT_INPUT: '.chat-input-editor[contenteditable="true"], div[contenteditable="true"][data-lexical-editor="true"], .chat-input-editor, .chat-input, textarea[placeholder*="Ask"]',
    // Submit button selectors (multiple fallbacks)
    SUBMIT_BUTTON: '.send-button, .send-icon, svg.send-icon, button[aria-label*="Send"], .send-button-container:not(.disabled) .send-button',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: '.attachment-button, .attachment-icon, input[type="file"], label.attachment-button',
    FILE_INPUT: 'input[type="file"]',
    // Main panel and container selectors
    MAIN_PANEL: '.chat-container, .main-content, .conversation-container, .chat-interface, .chat-editor',
    // Drop zones for file attachment
    DROP_ZONE: '.chat-editor, .chat-input-editor-container, .chat-input, .file-drop-area',
    // File preview elements
    FILE_PREVIEW: '.file-preview, .attachment-preview, .uploaded-file',
    // Button insertion points (for MCP popover) - Kimi specific
    BUTTON_INSERTION_CONTAINER: '.chat-editor-action .right-area, .right-area, .chat-editor-action, .actions-wrapper',
    // Alternative insertion points
    FALLBACK_INSERTION: '.chat-editor-action, .chat-input-editor-container, .left-area, .right-area'
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
    KimiAdapter.instanceCount++;
    this.instanceId = KimiAdapter.instanceCount;
    logger.debug(`Instance #${this.instanceId} created. Total instances: ${KimiAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`Kimi adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing Kimi adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Kimi adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating Kimi adapter instance #${this.instanceId}...`);

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
      this.context?.logger.warn('Kimi adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating Kimi adapter...');

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
    this.context.logger.debug('Cleaning up Kimi adapter...');

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
   * Insert text into the Kimi chat input field
   * Enhanced with better selector handling and event integration
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into Kimi chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find Kimi chat input element');
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
        // Handle contenteditable div - Kimi's Lexical editor requires special handling
        const currentText = targetElement.textContent || '';
        
        // Focus the element first
        targetElement.focus();
        
        let insertionSuccess = false;
        
        // Method 1: Try clipboard simulation first (often works best with Lexical)
        try {
          // Firefox has stricter clipboard security, check for proper permissions
          const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
          
          if (navigator.clipboard && window.ClipboardEvent) {
            // Check if we have clipboard permissions (Firefox requirement)
            let hasClipboardAccess = true;
            
            if (isFirefox) {
              try {
                // Test clipboard access in Firefox
                await navigator.clipboard.readText().catch(() => {
                  // If read fails, we might not have permission, but write might still work
                });
              } catch (e) {
                this.context.logger.warn('Firefox clipboard read test failed, trying write anyway:', e);
              }
            }

            if (hasClipboardAccess) {
              // Save current clipboard content (skip in Firefox if it fails)
              let originalClipboard = '';
              try {
                if (!isFirefox) {
                  originalClipboard = await navigator.clipboard.readText();
                }
              } catch (e) {
                this.context.logger.warn('Could not read clipboard, continuing without backup:', e);
              }

              // Set our text to clipboard
              await navigator.clipboard.writeText(text);

              // Create a more compatible paste event for Firefox
              const clipboardData = new DataTransfer();
              clipboardData.setData('text/plain', text);
              clipboardData.setData('text/html', text.replace(/\n/g, '<br>'));

              const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: clipboardData
              });

              // For Firefox, also try input event with data
              const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: text
              });

              // Trigger both events
              targetElement.dispatchEvent(pasteEvent);
              targetElement.dispatchEvent(inputEvent);

              // Additional Firefox-specific events
              if (isFirefox) {
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
              }

              // Restore original clipboard after a delay (skip for Firefox)
              if (!isFirefox && originalClipboard) {
                setTimeout(async () => {
                  try {
                    await navigator.clipboard.writeText(originalClipboard);
                  } catch (e) {
                    this.context.logger.warn('Could not restore clipboard:', e);
                  }
                }, 100);
              }

              insertionSuccess = true;
              this.context.logger.debug(`Text inserted using clipboard simulation method (${isFirefox ? 'Firefox' : 'Chrome'} mode)`);
            } else {
              throw new Error('Clipboard access denied');
            }
          } else {
            throw new Error('Clipboard API not available');
          }
        } catch (clipboardError) {
          this.context.logger.warn('Clipboard method failed, trying Firefox-specific method:', clipboardError);
          
          // Method 1.5: Firefox-specific clipboard workaround using hidden textarea
          const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
          if (isFirefox) {
            try {
              // Create a hidden textarea to simulate clipboard operation
              const hiddenTextarea = document.createElement('textarea');
              hiddenTextarea.value = text;
              hiddenTextarea.style.position = 'fixed';
              hiddenTextarea.style.left = '-9999px';
              hiddenTextarea.style.top = '-9999px';
              hiddenTextarea.style.opacity = '0';
              hiddenTextarea.style.pointerEvents = 'none';
              
              document.body.appendChild(hiddenTextarea);
              hiddenTextarea.select();
              hiddenTextarea.setSelectionRange(0, text.length);
              
              // Try to copy to clipboard using execCommand
              const copySuccess = document.execCommand('copy');
              
              if (copySuccess) {
                // Now try to paste into the target element
                targetElement.focus();
                const pasteSuccess = document.execCommand('paste');
                
                if (pasteSuccess) {
                  insertionSuccess = true;
                  this.context.logger.debug('Text inserted using Firefox hidden textarea method');
                } else {
                  // If paste fails, manually insert the text using the selection method
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  const range = document.createRange();
                  range.selectNodeContents(targetElement);
                  range.collapse(false);
                  selection?.addRange(range);
                  
                  // If there's existing content, add spacing
                  if (currentText && currentText.trim() !== '') {
                    document.execCommand('insertText', false, '\n\n');
                  }
                  document.execCommand('insertText', false, text);
                  
                  insertionSuccess = true;
                  this.context.logger.debug('Text inserted using Firefox execCommand fallback');
                }
              }
              
              // Clean up
              document.body.removeChild(hiddenTextarea);
              
              if (insertionSuccess) {
                // Firefox needs these additional events
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                targetElement.dispatchEvent(new InputEvent('input', { 
                  bubbles: true, 
                  inputType: 'insertFromPaste',
                  data: text 
                }));
              }
              
            } catch (firefoxError) {
              this.context.logger.warn('Firefox-specific method failed:', firefoxError);
            }
          }
          
          if (!insertionSuccess) {
          
          // Method 2: Try using Selection API with execCommand for better Lexical compatibility
          try {
            const selection = window.getSelection();
            
            // Clear selection and move to end
            selection?.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(targetElement);
            range.collapse(false);
            selection?.addRange(range);
            
            // If there's existing content, add spacing
            if (currentText && currentText.trim() !== '') {
              document.execCommand('insertText', false, '\n\n');
            }
            
            // Split text by lines and insert with proper line breaks
            const lines = text.split('\n');
            lines.forEach((line, index) => {
              if (index > 0) {
                // Insert line break for subsequent lines
                document.execCommand('insertLineBreak', false);
              }
              if (line.trim() !== '') {
                document.execCommand('insertText', false, line);
              }
            });
            
            insertionSuccess = true;
            this.context.logger.debug(`Text inserted using execCommand method with line breaks`);
          } catch (execError) {
            this.context.logger.warn('execCommand method failed, trying DOM manipulation:', execError);
            
            // Method 3: Fallback to DOM manipulation
            try {
              let newContent = '';
              if (currentText && currentText.trim() !== '') {
                newContent = currentText + '\n\n' + text;
              } else {
                newContent = text;
              }

              // Clear existing content
              targetElement.innerHTML = '';

              // Split text by newlines and create proper HTML structure
              const lines = newContent.split('\n');
              const fragment = document.createDocumentFragment();

              lines.forEach((line, index) => {
                if (index > 0) {
                  // Add line break for subsequent lines
                  fragment.appendChild(document.createElement('br'));
                }
                
                if (line.trim() !== '') {
                  // Create text node for non-empty lines
                  fragment.appendChild(document.createTextNode(line));
                } else if (index < lines.length - 1) {
                  // Add empty text node for empty lines to maintain structure
                  fragment.appendChild(document.createTextNode(''));
                }
              });

              // Insert the formatted content
              targetElement.appendChild(fragment);

              // Move cursor to the end
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(targetElement);
              range.collapse(false);
              selection?.removeAllRanges();
              selection?.addRange(range);
              
              insertionSuccess = true;
              this.context.logger.debug(`Text inserted using DOM manipulation fallback`);
            } catch (domError) {
              this.context.logger.error('DOM manipulation method also failed:', domError);
            }
          }
        }
        }

        if (insertionSuccess) {
          // Trigger input events for all methods
          targetElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
          targetElement.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Additional events that Lexical might be listening for
          targetElement.dispatchEvent(new Event('paste', { bubbles: true }));
          targetElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          targetElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

          this.context.logger.debug(`Text inserted into Kimi Lexical editor with preserved formatting`);
        } else {
          throw new Error('All insertion methods failed');
        }
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
      this.context.logger.error(`Error inserting text into Kimi chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the Kimi chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit Kimi chat input');

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
      this.context.logger.warn('Could not find Kimi submit button, trying Enter key press');
      return this.tryEnterKeySubmission();
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('Kimi submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('Kimi submit button is not visible');
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

      this.context.logger.debug('Kimi chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting Kimi chat input: ${errorMessage}`);
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

      this.context.logger.debug('Kimi chat input submitted using Enter key');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting Kimi chat input via Enter key: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the Kimi chat input
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
      this.context.logger.error(`Error attaching file to Kimi: ${errorMessage}`);
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

    this.context.logger.debug(`Checking if Kimi adapter supports: ${currentUrl}`);

    // Check hostname first
    const isKimiHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isKimiHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by Kimi adapter`);
      return false;
    }

    // Check if we're on a supported Kimi page
    const supportedPatterns = [
      /^https?:\/\/(?:www\.)?kimi\.com\/.*/,  // Main chat pages
      /^https?:\/\/(?:www\.)?kimi\.com$/      // Base chat page
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`Kimi adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for Kimi');

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

    this.context.logger.debug(`Setting up store event listeners for Kimi adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for Kimi adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for Kimi adapter instance #${this.instanceId}`);
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
    this.context.logger.debug('Cleaning up DOM observers for Kimi adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Kimi adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Kimi adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Kimi adapter should not handle events, ignoring tool execution event');
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

    // Try Kimi-specific button container first (.right-area)
    const buttonContainer = document.querySelector('.chat-editor-action .right-area');
    if (buttonContainer) {
      this.context.logger.debug('Found Kimi button container (.right-area)');
      
      // Look for attachment button specifically
      const attachmentButton = buttonContainer.querySelector('.attachment-button');
      if (attachmentButton) {
        this.context.logger.debug('Found attachment button, will insert after it');
        return { container: buttonContainer, insertAfter: attachmentButton };
      }

      // Look for prompt library button
      const promptLibraryButton = buttonContainer.querySelector('.prompt-library-button');
      if (promptLibraryButton) {
        this.context.logger.debug('Found prompt library button, will insert after it');
        return { container: buttonContainer, insertAfter: promptLibraryButton };
      }

      // If specific buttons not found, use last child
      const lastChild = buttonContainer.lastElementChild;
      if (lastChild) {
        this.context.logger.debug('Using last child element as insertion point');
        return { container: buttonContainer, insertAfter: lastChild };
      }
    }

    // Try fallback selectors for Kimi
    const fallbackSelectors = [
      '.chat-editor-action', // Main action container
      '.right-area', // Right area container
      '.chat-editor', // Chat editor container
      '.chat-input-editor-container', // Input container
      '.chat-input-actions',
      '.input-actions',
      '.actions-wrapper'
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
    this.context.logger.debug('Injecting MCP popover into Kimi interface');

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

            // Create React root and render
            const root = ReactDOM.createRoot(container);
            root.render(
              React.createElement(MCPPopover, {
                toggleStateManager: toggleStateManager
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
    return `kimi-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`Kimi page changed: from ${oldUrl || 'N/A'} to ${url}`);

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
    this.context.logger.debug(`Kimi host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Kimi adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in Kimi adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }
}
