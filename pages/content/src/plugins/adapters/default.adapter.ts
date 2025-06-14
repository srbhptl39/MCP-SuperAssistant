import { BaseAdapterPlugin } from '../base.adapter';
import type { AdapterConfig, PluginContext } from '../plugin-types';
import { eventBus } from '../../events';

import type { AdapterCapability } from '../plugin-types';

export class DefaultAdapter extends BaseAdapterPlugin {
  public readonly name = 'DefaultAdapter';
  public readonly version = '1.0.0';
  public readonly hostnames: (string | RegExp)[] = [/.*/]; // Matches all hostnames
  public readonly capabilities: AdapterCapability[] = ['text-insertion']; // Example capability

  protected config: AdapterConfig;

  constructor(context: PluginContext, config: AdapterConfig) {
    super(context);
    this.config = config;
    console.log(`[${this.name}] Constructor called. Config:`, config);
  }

  async initialize(context: PluginContext): Promise<void> {
    console.log(`[${this.name}] Initializing with context...`);
    // this.context = context; // BaseAdapterPlugin constructor handles setting this.context.
    // The context parameter here is the same instance.
    // Additional initialization specific to DefaultAdapter can go here, using either `this.context` or the `context` param.
  }

  async activate(): Promise<void> {
    console.log(`[${this.name}] Activating...`);
    // Perform any setup specific to this adapter
    // e.g., injecting UI elements, setting up listeners for page-specific events
    this.isActive = true;
    eventBus.emit('adapter:activated', { pluginName: this.name, timestamp: Date.now() });
    console.log(`[${this.name}] Activated successfully.`);
  }

  async deactivate(reason?: string): Promise<void> {
    console.log(`[${this.name}] Deactivating... Reason: ${reason || 'N/A'}`);
    // Perform any cleanup specific to this adapter
    this.isActive = false;
    eventBus.emit('adapter:deactivated', { pluginName: this.name, reason, timestamp: Date.now() });
    console.log(`[${this.name}] Deactivated successfully.`);
  }

  // Example: Implement a method from BaseAdapterPlugin or a new method
  async getPageMetadata(): Promise<Record<string, any>> {
    console.log(`[${this.name}] getPageMetadata called.`);
    return {
      title: document.title,
      url: window.location.href,
      adapterName: this.name,
    };
  }

  // You can override other methods from BaseAdapterPlugin if needed
  // e.g., onMessage, detectTools, etc.

  async cleanup(): Promise<void> {
    console.log(`[${this.name}] Cleaning up...`);
    // Perform any cleanup actions specific to this adapter
  }

  // Explicitly implement methods from AdapterPlugin if BaseAdapterPlugin's aren't automatically picked up
  public isSupported(): boolean | Promise<boolean> {
    return super.isSupported();
  }

  public getStatus(): 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending' {
    return super.getStatus();
  }
}

// Configuration for the DefaultAdapter
export const defaultAdapterConfig: AdapterConfig = {
  id: 'default-adapter',
  name: 'Default Adapter',
  description: 'A fallback adapter that matches any page.',
  version: '1.0.0',
  enabled: true, // Enable by default
  priority: 99, // Low priority, acts as a fallback
  settings: {
    // Add any specific settings for this adapter
    logLevel: 'info',
  },
};
