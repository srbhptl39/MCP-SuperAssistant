export * from './plugin-types';
export * from './plugin-registry';
export { BaseAdapterPlugin } from './adapters/base.adapter';
export { DefaultAdapter } from './adapters/default.adapter';
export { createPluginContext } from './plugin-context';

// Plugin initialization function
export async function initializePluginRegistry(): Promise<void> {
  try {
    const { pluginRegistry } = await import('./plugin-registry');
    const { createPluginContext } = await import('./plugin-context');
    
    const context = createPluginContext('system');
    await pluginRegistry.initialize(context);
    
    console.log('[Plugin System] Initialized successfully');
  } catch (error) {
    console.error('[Plugin System] Failed to initialize:', error);
    throw error;
  }
}

// Plugin cleanup function
export async function cleanupPluginSystem(): Promise<void> {
  try {
    const { pluginRegistry } = await import('./plugin-registry');
    await pluginRegistry.cleanup();
    console.log('[Plugin System] Cleaned up successfully');
  } catch (error) {
    console.error('[Plugin System] Failed to cleanup:', error);
  }
}

// Development utilities
if (process.env.NODE_ENV === 'development') {
  (window as any).__pluginSystem = {
    async getRegistry() {
      const { pluginRegistry } = await import('./plugin-registry');
      return pluginRegistry;
    },
    cleanup: cleanupPluginSystem,
    initialize: initializePluginRegistry
  };
}
