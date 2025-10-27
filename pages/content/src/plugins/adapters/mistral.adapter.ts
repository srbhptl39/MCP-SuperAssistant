import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Mistral Adapter for Mistral AI Chat (chat.mistral.ai)
 *
 * This adapter provides specialized functionality for interacting with Mistral AI's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 *
 * Migrated from the legacy adapter system to the new plugin architecture.
 * Maintains compatibility with existing functionality while integrating with Zustand stores.
 */

const logger = createLogger('MistralAdapter');

export class MistralAdapter extends BaseAdapterPlugin {
  readonly name = 'MistralAdapter';
  readonly version = '2.0.1'; // Updated for improved selectors
  readonly hostnames = ['chat.mistral.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Mistral's UI elements
  // Updated selectors based on current Mistral interface (Dec 2024)
  private readonly selectors = {
    // Primary chat input selector - supports both textarea and ProseMirror variants
    CHAT_INPUT: 'textarea[name="message.text"], textarea[placeholder="Ask Le Chat anything"], div.ProseMirror[contenteditable="true"][data-placeholder="Ask Le Chat anything"], div.ProseMirror[contenteditable="true"]',
    // Submit button selectors (multiple fallbacks) - looking for dictation/mic button as send button
    SUBMIT_BUTTON: 'button[aria-label="Dictation"], .ms-auto .flex.gap-2 button[type="submit"], button.bg-state-primary',
    // File upload related selectors
    FILE_UPLOAD_BUTTON: 'button[data-testid="attach-file-button"], button[aria-label="Add files"]',
    FILE_INPUT: 'input[name="file-upload"], input[type="file"][multiple]',
    // Main panel and container selectors
    MAIN_PANEL: '.relative.flex.w-full.flex-col.px-4.pt-3.pb-4',
    // Drop zones for file attachment - targeting the scroll area, ProseMirror, and main container
    DROP_ZONE: 'div.ProseMirror[contenteditable="true"][data-placeholder="Ask Le Chat anything"], div.ProseMirror[contenteditable="true"], div[data-radix-scroll-area-viewport], .relative.flex.w-full.flex-col.px-4.pt-3.pb-4, textarea[name="message.text"]',
    // File preview elements - updated for Mistral's specific file attachment UI
    FILE_PREVIEW: 'div.relative.rounded-md.border.border-default.bg-muted, .file-preview, .attachment-preview, .uploaded-file',
    // Button insertion points (for MCP popover) - targeting the button container area
    BUTTON_INSERTION_CONTAINER: '.flex.w-full.max-w-full.items-center.justify-start.gap-3, .flex.gap-2.ms-auto',
    // Tools button selector
    TOOLS_BUTTON: 'button[data-testid="tools-selection-button"]',
    // Alternative insertion points
    FALLBACK_INSERTION: '.relative.flex.w-full.flex-col.px-4.pt-3.pb-4, .chat-input-container'
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
    MistralAdapter.instanceCount++;
    this.instanceId = MistralAdapter.instanceCount;
    logger.debug(`Instance #${this.instanceId} created. Total instances: ${MistralAdapter.instanceCount}`);
  }

  async initialize(context: PluginContext): Promise<void> {
    // Guard against multiple initialization
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      this.context?.logger.warn(`Mistral adapter instance #${this.instanceId} already initialized or active, skipping re-initialization`);
      return;
    }

    await super.initialize(context);
    this.context.logger.debug(`Initializing Mistral adapter instance #${this.instanceId}...`);

    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();

    // Set up event listeners for the new architecture
    this.setupStoreEventListeners();
  }

  async activate(): Promise<void> {
    // Guard against multiple activation
    if (this.currentStatus === 'active') {
      this.context?.logger.warn(`Mistral adapter instance #${this.instanceId} already active, skipping re-activation`);
      return;
    }

    await super.activate();
    this.context.logger.debug(`Activating Mistral adapter instance #${this.instanceId}...`);

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
      this.context?.logger.warn('Mistral adapter already inactive, skipping deactivation');
      return;
    }

    await super.deactivate();
    this.context.logger.debug('Deactivating Mistral adapter...');

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
    this.context.logger.debug('Cleaning up Mistral adapter...');

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
   * Insert text into the Mistral chat input field
   * Enhanced with better selector handling and supports both textarea and ProseMirror editors
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into Mistral chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

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
      this.context.logger.error('Could not find Mistral chat input element');
      this.emitExecutionFailed('insertText', 'Chat input element not found');
      return false;
    }

    try {
      // Store the original value - handle both textarea and ProseMirror
      const isTextarea = targetElement.tagName.toLowerCase() === 'textarea';
      const isProseMirror = targetElement.classList.contains('ProseMirror');
      
      let originalValue = '';
      if (isTextarea) {
        originalValue = (targetElement as HTMLTextAreaElement).value || '';
      } else if (isProseMirror) {
        originalValue = targetElement.textContent || '';
      }

      // Focus the input element
      targetElement.focus();

      if (isTextarea) {
        // Handle as textarea
        const newContent = originalValue ? originalValue + '\n' + text : text;
        (targetElement as HTMLTextAreaElement).value = newContent;

        // Dispatch events to simulate user typing for better compatibility
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      } else if (isProseMirror) {
        // Handle ProseMirror editor
        const existingParagraphs = targetElement.querySelectorAll('p');
        
        // Check if there's existing content (not just the empty trailing break)
        const hasExistingContent = existingParagraphs.length > 1 || 
          (existingParagraphs.length === 1 && 
           existingParagraphs[0].textContent && 
           existingParagraphs[0].textContent.trim() !== '');
        
        // Split text by newlines to create proper paragraph structure
        const textLines = text.split('\n');
        
        if (hasExistingContent) {
          // Find the last paragraph that has content
          let lastContentParagraph = null;
          for (let i = existingParagraphs.length - 1; i >= 0; i--) {
            const p = existingParagraphs[i];
            if (p.textContent && p.textContent.trim() !== '') {
              lastContentParagraph = p;
              break;
            }
          }
          
          if (lastContentParagraph) {
            // Remove the trailing break from the last content paragraph
            const trailingBreak = lastContentParagraph.querySelector('br.ProseMirror-trailingBreak');
            if (trailingBreak) {
              trailingBreak.remove();
            }
            
            // Add the first line to the existing paragraph
            if (textLines.length > 0) {
              lastContentParagraph.appendChild(document.createElement('br'));
              lastContentParagraph.appendChild(document.createTextNode(textLines[0]));
              
              // Add remaining lines as new paragraphs
              for (let i = 1; i < textLines.length; i++) {
                const newP = document.createElement('p');
                if (textLines[i].trim() === '') {
                  // For empty lines, add a break element to maintain the blank line
                  const br = document.createElement('br');
                  br.className = 'ProseMirror-trailingBreak';
                  newP.appendChild(br);
                } else {
                  newP.textContent = textLines[i];
                }
                targetElement.insertBefore(newP, targetElement.lastElementChild);
              }
            }
          }
        } else {
          // No existing content, replace the empty paragraph structure
          targetElement.innerHTML = '';
          
          // Create paragraphs for each line
          textLines.forEach((line) => {
            const p = document.createElement('p');
            if (line.trim() === '') {
              // For empty lines, add a break element to maintain the blank line
              const br = document.createElement('br');
              br.className = 'ProseMirror-trailingBreak';
              p.appendChild(br);
            } else {
              p.textContent = line;
            }
            targetElement.appendChild(p);
          });
          
          // Add the trailing break paragraph that ProseMirror expects
          const trailingP = document.createElement('p');
          const trailingBr = document.createElement('br');
          trailingBr.className = 'ProseMirror-trailingBreak';
          trailingP.appendChild(trailingBr);
          targetElement.appendChild(trailingP);
        }
        
        // Dispatch input events for ProseMirror
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Move cursor to end
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(targetElement);
          range.collapse(false);
          selection.addRange(range);
        }
      }

      // Emit success event to the new event system
      const finalContent = isTextarea ? 
        (targetElement as HTMLTextAreaElement).value || '' : 
        targetElement.textContent || '';
        
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length,
        totalLength: finalContent.length,
        editorType: isTextarea ? 'textarea' : isProseMirror ? 'ProseMirror' : 'unknown'
      });

      this.context.logger.debug(`Text inserted successfully into ${isTextarea ? 'textarea' : isProseMirror ? 'ProseMirror' : 'unknown'} editor`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error inserting text into Mistral chat input: ${errorMessage}`);
      this.emitExecutionFailed('insertText', errorMessage);
      return false;
    }
  }

  /**
   * Submit the current text in the Mistral chat input
   * Enhanced with multiple selector fallbacks and better error handling
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.debug('Attempting to submit Mistral chat input');

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
      this.context.logger.error('Could not find Mistral submit button');
      this.emitExecutionFailed('submitForm', 'Submit button not found');
      return false;
    }

    try {
      // Check if the button is disabled
      if (submitButton.disabled) {
        this.context.logger.warn('Mistral submit button is disabled');
        this.emitExecutionFailed('submitForm', 'Submit button is disabled');
        return false;
      }

      // Check if the button is visible and clickable
      const rect = submitButton.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.context.logger.warn('Mistral submit button is not visible');
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

      this.context.logger.debug('Mistral chat input submitted successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error submitting Mistral chat input: ${errorMessage}`);
      this.emitExecutionFailed('submitForm', errorMessage);
      return false;
    }
  }

  /**
   * Attach a file to the Mistral chat input
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

      // Method 1: Try direct file input manipulation
      let success = await this.attachFileDirectly(file);
      
      if (!success) {
        // Method 2: Fallback to drag-drop simulation
        success = await this.attachFileViaDragDrop(file);
      }

      if (success) {
        // Check for file preview to confirm success
        const previewFound = await this.checkFilePreview();
        
        this.emitExecutionCompleted('attachFile', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          inputElement: options?.inputElement?.tagName || 'unknown'
        }, {
          success: true,
          previewFound,
          method: 'direct-input'
        });
        this.context.logger.debug(`File attached successfully: ${file.name}`);
        return true;
      } else {
        this.emitExecutionFailed('attachFile', 'All attachment methods failed');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.logger.error(`Error attaching file to Mistral: ${errorMessage}`);
      this.emitExecutionFailed('attachFile', errorMessage);
      return false;
    }
  }

  private async attachFileDirectly(file: File): Promise<boolean> {
    try {
      logger.debug('[system] Attempting direct file attachment via drag simulation');
      
      // Find the drop zone - try ProseMirror first, then scroll area container
      let dropZone = document.querySelector('div.ProseMirror[contenteditable="true"]') as HTMLElement;
      if (!dropZone) {
        dropZone = document.querySelector('div[data-radix-scroll-area-viewport]') as HTMLElement;
      }
      
      if (!dropZone) {
        logger.warn('[system] Drop zone not found');
        return false;
      }

      // Create drag and drop events to simulate file drop on the drop zone
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create and dispatch dragenter event
      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      });
      dropZone.dispatchEvent(dragEnterEvent);

      // Create and dispatch dragover event
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      });
      dropZone.dispatchEvent(dragOverEvent);

      // Create and dispatch drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      });
      dropZone.dispatchEvent(dropEvent);

      logger.debug(`Direct drag simulation completed on ${dropZone.classList.contains('ProseMirror') ? 'ProseMirror' : 'scroll area'} drop zone`);
      return true;
    } catch (error) {
      logger.error('[system] Direct drag simulation failed:', error);
      return false;
    }
  }

  private async attachFileViaDragDrop(file: File): Promise<boolean> {
    try {
      logger.debug('[system] Attempting file attachment via drag-drop simulation');
      
      // Load drop listener script into page context
      const success = await this.injectFileDropListener();
      if (!success) {
        logger.warn('[system] Failed to inject file drop listener');
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

      logger.debug('[system] Drag-drop simulation message sent');
      return true;
    } catch (error) {
      logger.error('[system] Drag-drop simulation failed:', error);
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

    this.context.logger.debug(`Checking if Mistral adapter supports: ${currentUrl}`);

    // Check hostname first
    const isMistralHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isMistralHost) {
      this.context.logger.debug(`Host ${currentHost} not supported by Mistral adapter`);
      return false;
    }

    // Check if we're on a supported Mistral page (not just the homepage)
    const supportedPatterns = [
      /^https:\/\/chat\.mistral\.ai\/.*/,  // All chat.mistral.ai pages
      /^https:\/\/chat\.mistral\.ai\/chat\/.*/,  // Chat pages specifically
    ];

    const isSupported = supportedPatterns.some(pattern => pattern.test(currentUrl));

    if (isSupported) {
      this.context.logger.debug(`Mistral adapter supports current page: ${currentUrl}`);
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
    this.context.logger.debug('Checking file upload support for Mistral');

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

    this.context.logger.debug(`Setting up store event listeners for Mistral adapter instance #${this.instanceId}`);

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

    this.context.logger.debug(`Setting up DOM observers for Mistral adapter instance #${this.instanceId}`);

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
      this.context.logger.debug(`Setting up UI integration for Mistral adapter instance #${this.instanceId}`);
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
    this.context.logger.debug('Cleaning up DOM observers for Mistral adapter');

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private cleanupUIIntegration(): void {
    this.context.logger.debug('Cleaning up UI integration for Mistral adapter');

    // Remove MCP popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      popoverContainer.remove();
    }

    this.mcpPopoverContainer = null;
  }

  private handleToolExecutionCompleted(data: any): void {
    this.context.logger.debug('Handling tool execution completion in Mistral adapter:', data);

    // Use the base class method to check if we should handle events
    if (!this.shouldHandleEvents()) {
      this.context.logger.debug('Mistral adapter should not handle events, ignoring tool execution event');
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

    // First, try to find the "Tools" button specifically using the correct selector
    const toolsButton = document.querySelector(this.selectors.TOOLS_BUTTON);
    if (toolsButton && toolsButton.parentElement) {
      this.context.logger.debug('Found Tools button, placing MCP popover next to it');
      return { container: toolsButton.parentElement, insertAfter: toolsButton };
    }

    // Try alternative Tools button selectors
    const toolsButtonAlt = document.querySelector('button:has(p:contains("Tools")), button[aria-label*="Tools"], button[title*="Tools"]');
    if (toolsButtonAlt && toolsButtonAlt.parentElement) {
      this.context.logger.debug('Found Tools button (alternative selector), placing MCP popover next to it');
      return { container: toolsButtonAlt.parentElement, insertAfter: toolsButtonAlt };
    }

    // Try primary selector for general button containers
    const buttonContainer = document.querySelector('.flex.w-full.max-w-full.items-center.justify-start.gap-3');
    if (buttonContainer) {
      this.context.logger.debug('Found button container: .flex.w-full.max-w-full.items-center.justify-start.gap-3');
      const btns = buttonContainer.querySelectorAll('button');
      const after = btns.length > 1 ? btns[1] : btns.length > 0 ? btns[0] : null;
      return { container: buttonContainer, insertAfter: after };
    }

    // Try fallback selectors
    const fallbackSelectors = [
      '.input-actions',
      '.chat-actions', 
      '.message-actions',
      '.input-area .actions',
      '.chat-input-actions',
      '.conversation-input .actions',
      '.chat-input-container',
      '.input-area'
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
    this.context.logger.debug('Injecting MCP popover into Mistral interface');

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

  private async injectFileDropListener(): Promise<boolean> {
    try {
      // First validate that the drop zone exists
      const dropZoneValid = await this.validateDropZone();
      if (!dropZoneValid) {
        logger.warn('[system] Drop zone validation failed, skipping file drop listener injection');
        return false;
      }

      const listenerUrl = this.context.chrome.runtime.getURL('dragDropListener.js');
      const scriptEl = document.createElement('script');
      scriptEl.src = listenerUrl;
      
      await new Promise<void>((resolve, reject) => {
        scriptEl.onload = () => resolve();
        scriptEl.onerror = () => reject(new Error('Failed to load drop listener script'));
        (document.head || document.documentElement).appendChild(scriptEl);
      });
      
      scriptEl.remove();
      logger.debug('[system] File drop listener injected successfully for Mistral');
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
      // Check multiple times with increasing delays to catch the preview
      const checkAttempts = [500, 1000, 1500]; // milliseconds
      let attemptCount = 0;

      const attemptCheck = () => {
        const filePreview = document.querySelector(this.selectors.FILE_PREVIEW);
        if (filePreview) {
          // Additional verification - check if it contains file-like content
          const hasFileContent = filePreview.textContent?.includes('.md') || 
                                filePreview.textContent?.includes('.pdf') ||
                                filePreview.textContent?.includes('.txt') ||
                                filePreview.textContent?.includes('.doc') ||
                                filePreview.querySelector('.text-sm.leading-6.font-medium');
          
          if (hasFileContent) {
            logger.debug(`File preview found after ${checkAttempts[attemptCount]}ms:`, filePreview.textContent?.trim());
            this.context.logger.debug('File preview element found after attachment');
            resolve(true);
            return;
          }
        }

        attemptCount++;
        if (attemptCount < checkAttempts.length) {
          setTimeout(attemptCheck, checkAttempts[attemptCount]);
        } else {
          logger.warn('[system] File preview element not found after all attempts');
          this.context.logger.warn('File preview element not found after attachment');
          resolve(false);
        }
      };

      // Start the first check
      setTimeout(attemptCheck, checkAttempts[0]);
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
    return `mistral-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    this.context.logger.debug(`Mistral page changed: from ${oldUrl || 'N/A'} to ${url}`);

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
    this.context.logger.debug(`Mistral host changed: from ${oldHost || 'N/A'} to ${newHost}`);

    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Mistral adapter no longer supported on this host/page');
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
    this.context.logger.debug(`Tools detected in Mistral adapter:`, tools);

    // Forward to tool store
    tools.forEach(tool => {
      this.context.stores.tool?.addDetectedTool?.(tool);
    });
  }

  private async validateDropZone(): Promise<boolean> {
    try {
      logger.debug('[system] Validating drop zone availability before injection');
      
      // Split the DROP_ZONE selectors and try each one
      const dropSelectors = this.selectors.DROP_ZONE.split(', ').map(s => s.trim());
      
      for (const selector of dropSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          logger.debug(`Drop zone validated with selector: ${selector}`);
          
          // Store the working selector in window for dragDropListener.js to use
          (window as any).mistralDropZoneSelector = selector;
          return true;
        }
      }
      
      logger.warn('[system] No drop zone found during validation');
      return false;
    } catch (error) {
      logger.error('[system] Error validating drop zone:', error);
      return false;
    }
  }
}
