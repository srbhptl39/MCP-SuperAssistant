import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

/**
 * Gemini Adapter for Google Gemini (gemini.google.com)
 * 
 * This adapter provides specialized functionality for interacting with Google Gemini's
 * chat interface, including text insertion, form submission, and file attachment capabilities.
 */
export class GeminiAdapter extends BaseAdapterPlugin {
  readonly name = 'GeminiAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['gemini.google.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'file-attachment',
    'dom-manipulation'
  ];

  // CSS selectors for Gemini's UI elements
  private readonly selectors = {
    CHAT_INPUT: 'div.ql-editor.textarea.new-input-ui p',
    SUBMIT_BUTTON: 'button.mat-mdc-icon-button.send-button',
    FILE_UPLOAD_BUTTON: 'button[aria-label="Add files"]',
    FILE_INPUT: 'input[type="file"]',
    MAIN_PANEL: '.chat-web',
    DROP_ZONE: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor',
    FILE_PREVIEW: '.file-preview, .xap-filed-upload-preview'
  };

  // URL patterns for navigation tracking
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;

  constructor() {
    super();
  }

  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.context.logger.info('Initializing Gemini adapter...');
    
    // Initialize URL tracking
    this.lastUrl = window.location.href;
    this.setupUrlTracking();
  }

  async activate(): Promise<void> {
    await super.activate();
    this.context.logger.info('Activating Gemini adapter...');
    
    // Set up event listeners and observers
    this.setupEventListeners();
  }

  async deactivate(): Promise<void> {
    await super.deactivate();
    this.context.logger.info('Deactivating Gemini adapter...');
    
    // Clean up event listeners
    this.cleanupEventListeners();
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    this.context.logger.info('Cleaning up Gemini adapter...');
    
    // Clear URL tracking interval
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }
  }

  /**
   * Insert text into the Gemini chat input field
   */
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.info(`Attempting to insert text into Gemini chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

    let targetElement: HTMLElement | null = null;

    if (options?.targetElement) {
      targetElement = options.targetElement;
    } else {
      targetElement = document.querySelector(this.selectors.CHAT_INPUT) as HTMLElement;
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
      // Append the text to the original value on a new line
      targetElement.textContent = originalValue ? originalValue + '\n' + text : text;

      // Dispatch events to simulate user typing
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));

      // Emit success event
      this.emitExecutionCompleted('insertText', { text }, {
        success: true,
        originalLength: originalValue.length,
        newLength: text.length
      });

      this.context.logger.info(`Text inserted successfully. Original length: ${originalValue.length}, New length: ${text.length}`);
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
   */
  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.info('Attempting to submit Gemini chat input');

    const submitButton = document.querySelector(this.selectors.SUBMIT_BUTTON) as HTMLButtonElement;

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

      // Click the submit button to send the message
      submitButton.click();

      // Emit success event
      this.emitExecutionCompleted('submitForm', {}, {
        success: true,
        method: 'submitButton.click'
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
   */
  async attachFile(file: File, options?: { inputElement?: HTMLInputElement }): Promise<boolean> {
    this.context.logger.info(`Attempting to attach file: ${file.name}`);

    try {
      // Load drop listener script into page context
      const success = await this.injectFileDropListener();
      if (!success) {
        this.emitExecutionFailed('attachFile', 'Failed to inject file drop listener');
        return false;
      }

      // Read file as DataURL and post primitives to page context
      const dataUrl = await this.readFileAsDataURL(file);
      
      window.postMessage(
        {
          type: 'MCP_DROP_FILE',
          fileName: file.name,
          fileType: file.type,
          lastModified: file.lastModified,
          fileData: dataUrl,
        },
        '*'
      );

      // Check for file preview to confirm success
      const previewFound = await this.checkFilePreview();
      
      if (previewFound) {
        this.emitExecutionCompleted('attachFile', { fileName: file.name, fileType: file.type }, {
          success: true,
          previewFound: true
        });
        this.context.logger.info(`File attached successfully: ${file.name}`);
        return true;
      } else {
        // Still consider it successful even if preview not found (optimistic)
        this.emitExecutionCompleted('attachFile', { fileName: file.name, fileType: file.type }, {
          success: true,
          previewFound: false
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
   */
  isSupported(): boolean | Promise<boolean> {
    const currentHost = window.location.hostname;
    const isGeminiHost = this.hostnames.some(hostname => {
      if (typeof hostname === 'string') {
        return currentHost.includes(hostname);
      }
      // hostname is RegExp if it's not a string
      return (hostname as RegExp).test(currentHost);
    });

    if (!isGeminiHost) {
      return false;
    }

    // Check if we're on a chat page (not just the homepage)
    const currentUrl = window.location.href;
    const supportedPatterns = [
      /^https:\/\/gemini\.google\.com\/u\/\d+\/app\/.*/,
      /^https:\/\/gemini\.google\.com\/app\/.*/
    ];

    return supportedPatterns.some(pattern => pattern.test(currentUrl));
  }

  /**
   * Check if file upload is supported
   */
  supportsFileUpload(): boolean {
    const dropZone = document.querySelector(this.selectors.DROP_ZONE);
    return !!dropZone;
  }

  // Private helper methods

  private setupUrlTracking(): void {
    if (!this.urlCheckInterval) {
      this.urlCheckInterval = window.setInterval(() => {
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

  private setupEventListeners(): void {
    // Set up any event listeners specific to Gemini
    this.context.logger.debug('Setting up Gemini-specific event listeners');
  }

  private cleanupEventListeners(): void {
    // Clean up event listeners
    this.context.logger.debug('Cleaning up Gemini-specific event listeners');
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
    return `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Event handlers
  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.info(`Gemini page changed: from ${oldUrl || 'N/A'} to ${url}`);
    
    // Log the page change for debugging
    this.context.logger.debug('Page navigation detected in Gemini adapter');
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context.logger.info(`Gemini host changed: from ${oldHost || 'N/A'} to ${newHost}`);
    
    // Re-check if the adapter is still supported
    const stillSupported = this.isSupported();
    if (!stillSupported) {
      this.context.logger.warn('Gemini adapter no longer supported on this host/page');
      this.deactivate();
    }
  }
}
