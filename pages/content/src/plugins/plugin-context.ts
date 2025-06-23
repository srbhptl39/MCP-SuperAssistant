import type { PluginContext as PluginContextType, PluginEventBus, PluginUtils } from './plugin-types';
import { eventBus } from '../events';
import { useAppStore, useConnectionStore, useToolStore, useUIStore, useAdapterStore, useConfigStore } from '../stores';
import { getUniqueId, createElement, waitForElement, injectCSS, observeChanges, debounce, throttle } from '../utils/index'; // Explicitly point to index

// Basic logger implementation
const consoleLogger = {
  debug: (...args: any[]) => console.debug('[PluginContext]', ...args),
  info: (...args: any[]) => console.debug('[PluginContext]', ...args),
  warn: (...args: any[]) => console.warn('[PluginContext]', ...args),
  error: (...args: any[]) => console.error('[PluginContext]', ...args),
};

// Plugin Utilities Implementation
const pluginUtils: PluginUtils = {
  createElement,
  waitForElement,
  injectCSS,
  observeChanges,
  debounce,
  throttle,
  getUniqueId,
};

/**
 * Creates a plugin context for a specific plugin instance.
 * @param pluginName - The name of the plugin for which to create the context.
 * @returns A PluginContext object.
 */
export function createPluginContext(pluginName: string): PluginContextType {
  // The stores can be accessed via their hooks' getState() method if needed immediately,
  // or passed as reactive hooks if the plugin framework supports it.
  // For simplicity, passing direct state or getState functions.
  // A more robust solution might involve a dependency injection pattern or a shared context provider.
  const context: PluginContextType = {
    eventBus: eventBus as PluginEventBus, // Cast the global eventBus to the PluginEventBus interface
    stores: {
      // Providing getState for direct, non-reactive access.
      // For reactive updates, plugins would typically use hooks if they are React components,
      // or subscribe to store changes if they are not.
      app: useAppStore.getState, // Pass getState for on-demand access
      connection: useConnectionStore.getState,
      tool: useToolStore.getState,
      ui: useUIStore.getState,
      adapter: useAdapterStore.getState,
      config: useConfigStore.getState,
    },
    utils: pluginUtils,
    chrome: {
      runtime: chrome.runtime,
      storage: chrome.storage,
      tabs: chrome.tabs,
    },
    logger: {
      debug: (...args: any[]) => console.debug(`[${pluginName}]`, ...args),
      info: (...args: any[]) => console.info(`[${pluginName}]`, ...args),
      warn: (...args: any[]) => console.warn(`[${pluginName}]`, ...args),
      error: (...args: any[]) => console.error(`[${pluginName}]`, ...args),
    },
    getConfig: <T extends Record<string, any>>() => {
      const adapterStoreState = useAdapterStore.getState();
      return adapterStoreState.registeredPlugins[pluginName]?.config.settings as T | undefined;
    }
  };
  return context;
}

// Re-export the type for convenience if needed elsewhere
export type { PluginContextType as PluginContext };
