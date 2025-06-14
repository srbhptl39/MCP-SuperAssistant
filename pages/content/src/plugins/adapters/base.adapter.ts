import type { 
  AdapterPlugin, 
  PluginContext, 
  AdapterCapability, 
  DetectedTool 
} from '../plugin-types';

/**
 * BaseAdapterPlugin provides a foundational class for all adapter plugins.
 * It includes common lifecycle methods and utility functions that can be overridden or extended by specific adapters.
 */
export abstract class BaseAdapterPlugin implements AdapterPlugin {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly hostnames: string[] | RegExp[];
  abstract readonly capabilities: AdapterCapability[];

  protected context!: PluginContext;
  protected currentStatus: 'pending' | 'initializing' | 'active' | 'inactive' | 'error' | 'disabled' = 'pending';

  constructor() {
    // Constructor can be used for initial setup common to all plugins derived from BaseAdapterPlugin
    // but before context is available.
  }

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.currentStatus = 'initializing';
    this.context.logger.info(`Initializing (Base)`);
    // Basic initialization logic common to all plugins
    // Specific plugins should override this and call super.initialize(context) if needed.
    this.currentStatus = 'inactive'; // Default to inactive after base initialization
  }

  async activate(): Promise<void> {
    this.context.logger.info(`Activating (Base)`);
    // Basic activation logic
    // Specific plugins should override this and call super.activate() if needed.
    this.currentStatus = 'active';
  }

  async deactivate(): Promise<void> {
    this.context.logger.info(`Deactivating (Base)`);
    // Basic deactivation logic
    // Specific plugins should override this and call super.deactivate() if needed.
    this.currentStatus = 'inactive';
  }

  async cleanup(): Promise<void> {
    this.context.logger.info(`Cleaning up (Base)`);
    // Basic cleanup logic
    // Specific plugins should override this and call super.cleanup() if needed.
    this.currentStatus = 'disabled'; // Or 'pending' if it can be reinitialized
  }

  // Core functionality - to be implemented by specific adapters if capability is supported
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.warn('insertText not implemented by this adapter.');
    return false;
  }

  async submitForm(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    this.context.logger.warn('submitForm not implemented by this adapter.');
    return false;
  }

  async attachFile(file: File, options?: { inputElement?: HTMLInputElement }): Promise<boolean> {
    this.context.logger.warn('attachFile not implemented by this adapter.');
    return false;
  }

  // Optional capabilities - to be implemented by specific adapters
  async captureScreenshot(): Promise<string> {
    this.context.logger.warn('captureScreenshot not implemented by this adapter.');
    throw new Error('Not implemented');
  }

  async selectElement(selector: string): Promise<HTMLElement | null> {
    this.context.logger.warn('selectElement not implemented by this adapter.');
    return null;
  }

  async navigateToUrl(url: string): Promise<boolean> {
    this.context.logger.warn('navigateToUrl not implemented by this adapter.');
    return false;
  }
  
  async executeScript<T>(script: string | (() => T)): Promise<T | null> {
    this.context.logger.warn('executeScript not implemented by this adapter.');
    return null;
  }

  // Utility methods
  isSupported(): boolean | Promise<boolean> {
    // By default, if an adapter is defined for a hostname, it's considered supported.
    // Specific adapters can override this for more complex checks (e.g., specific page elements exist).
    return true;
  }

  getStatus(): 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending' {
    return this.currentStatus;
  }

  protected setStatus(status: 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending', error?: string | Error): void {
    this.currentStatus = status;
    if (status === 'error' && error) {
        this.context.logger.error('Status set to error:', error);
        // Optionally emit an event or update store directly if context allows
    }
  }

  // Event handlers - can be overridden by specific adapters
  onToolDetected?(tools: DetectedTool[]): void {
    this.context.logger.info('onToolDetected (Base):', tools);
  }

  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.info(`onPageChanged (Base): from ${oldUrl || 'N/A'} to ${url}`);
  }
  
  onHostChanged?(newHost: string, oldHost?: string): void {
    this.context.logger.info(`onHostChanged (Base): from ${oldHost || 'N/A'} to ${newHost}`);
    // Base implementation could re-check isSupported or trigger adapter re-evaluation
    // For example, if an adapter is only for a specific path on a host.
  }
}
