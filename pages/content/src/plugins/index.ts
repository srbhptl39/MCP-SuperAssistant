export * from './plugin-types';
export { pluginRegistry, initializePluginRegistry, cleanupPluginRegistry } from './plugin-registry';
export { BaseAdapterPlugin } from './adapters/base.adapter';
export { DefaultAdapter } from './adapters/default.adapter';
export { ExampleForumAdapter } from './adapters/example-forum.adapter';
export { GeminiAdapter } from './adapters/gemini.adapter';
export { PerplexityAdapter } from './adapters/perplexity.adapter';
export { AIStudioAdapter } from './adapters/aistudio.adapter';
export { SidebarPlugin } from './sidebar.plugin';
export { createPluginContext } from './plugin-context';

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
    async initialize() {
      const { initializePluginRegistry } = await import('./plugin-registry');
      return initializePluginRegistry();
    }
  };
}
