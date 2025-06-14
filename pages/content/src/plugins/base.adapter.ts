import type { AdapterPlugin, PluginContext, AdapterCapability, DetectedTool } from './plugin-types';

export abstract class BaseAdapterPlugin implements AdapterPlugin {
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly hostnames: (string | RegExp)[];
  public abstract readonly capabilities: AdapterCapability[];

  protected context: PluginContext;
  public isActive: boolean = false;

  // Optional properties from AdapterPlugin that might not be used by all adapters
  public targetElement?: HTMLElement;
  public formElement?: HTMLFormElement;

  constructor(context: PluginContext) {
    this.context = context;
  }

  // Lifecycle methods - to be implemented by concrete adapters
  abstract initialize(context: PluginContext): Promise<void>;
  abstract activate(): Promise<void>;
  abstract deactivate(): Promise<void>;
  abstract cleanup(): Promise<void>;

  // Utility methods - concrete adapters can override
  isSupported(): boolean | Promise<boolean> {
    // Basic check, can be overridden for more complex logic
    return true;
  }

  getStatus(): 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending' {
    if (this.isActive) return 'active';
    // Add more sophisticated status logic if needed, e.g., based on config or errors
    return 'inactive'; 
  }

  // Core functionality - to be implemented by concrete adapters if capability is supported
  insertText?(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    console.warn(`[${this.name}] insertText not implemented.`);
    return Promise.resolve(false);
  }

  submitForm?(options?: { formElement?: HTMLFormElement }): Promise<boolean> {
    console.warn(`[${this.name}] submitForm not implemented.`);
    return Promise.resolve(false);
  }

  // Event handlers - optional, to be implemented by concrete adapters
  onToolDetected?(tools: DetectedTool[]): void {
    // Default empty implementation
  }

  onPageChanged?(url: string, oldUrl?: string): void {
    // Default empty implementation
  }

  onHostChanged?(newHost: string, oldHost?: string): void {
    // Default empty implementation
  }
  
  // Other optional capabilities - default to not implemented
  attachFile?(file: File, options?: { inputElement?: HTMLInputElement }): Promise<boolean> {
    console.warn(`[${this.name}] attachFile not implemented.`);
    return Promise.resolve(false);
  }

  captureScreenshot?(): Promise<string> {
    console.warn(`[${this.name}] captureScreenshot not implemented.`);
    return Promise.reject(new Error('Not implemented'));
  }

  selectElement?(selector: string): Promise<HTMLElement | null> {
    console.warn(`[${this.name}] selectElement not implemented.`);
    return Promise.resolve(null);
  }

  navigateToUrl?(url: string): Promise<boolean> {
    console.warn(`[${this.name}] navigateToUrl not implemented.`);
    return Promise.resolve(false);
  }

  executeScript?<T>(script: string | (() => T)): Promise<T | null> {
    console.warn(`[${this.name}] executeScript not implemented.`);
    return Promise.resolve(null);
  }
}
