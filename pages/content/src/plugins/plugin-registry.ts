// plugins/plugin-registry.ts
import { eventBus } from '../events/event-bus';
import type { EventMap } from '../events'; 
import performanceMonitor from '../core/performance';
import globalErrorHandler from '../core/error-handler';
import { useAdapterStore } from '../stores/adapter.store';
import type { AdapterPlugin, PluginRegistration, PluginContext, AdapterConfig, AdapterCapability } from './plugin-types';
import { DefaultAdapter } from './adapters/default.adapter';
// import { ExampleForumAdapter } from './adapters/example-forum.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GrokAdapter } from './adapters/grok.adapter';
import { PerplexityAdapter } from './adapters/perplexity.adapter';
import { AIStudioAdapter } from './adapters/aistudio.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { SidebarPlugin } from './sidebar.plugin';

class PluginRegistry {
  private plugins = new Map<string, PluginRegistration>();
  private activePlugin: AdapterPlugin | null = null;
  private context: PluginContext | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private isPerformingInitialActivation = false;

  async initialize(context: PluginContext): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization(context);
    return this.initializationPromise;
  }

  private async performInitialization(context: PluginContext): Promise<void> {
    try {
      this.context = context;
      this.setupEventListeners();

      // Set initialized flag before registering built-in adapters
      // This allows the register() method to work during initialization
      this.isInitialized = true;

      // Register built-in adapters
      await this.registerBuiltInAdapters();

      eventBus.emit('plugin:registry-initialized', { registeredPlugins: this.plugins.size, timestamp: Date.now() });

      console.log('[PluginRegistry] Initialized with', this.plugins.size, 'plugins');

    } catch (error) {
      // Reset initialization flag on error
      this.isInitialized = false;
      this.context = null;

      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      globalErrorHandler.handleError(
        error as Error,
        {
          component: 'plugin-registry',
          operation: 'initialization',
          source: '[PluginRegistry]',
          details: { pluginCount: this.plugins.size, errorMessage }
        }
      );
      throw new Error(`Plugin registry initialization failed: ${errorMessage}`);
    }
  }

  private setupEventListeners(): void {
    if (!this.context) return;

    // Listen for site changes to auto-activate plugins
    const unsubscribeSiteChange = eventBus.on('app:site-changed', async ({ hostname }: EventMap['app:site-changed']) => {
      console.log(`[PluginRegistry] Site change event received for ${hostname}, initial activation flag: ${this.isPerformingInitialActivation}`);
      
      // Skip if we're in the middle of initial activation to prevent race conditions
      if (this.isPerformingInitialActivation) {
        console.log(`[PluginRegistry] Skipping site-change activation for ${hostname} (initial activation in progress)`);
        return;
      }
      
      console.log(`[PluginRegistry] Site changed to ${hostname}, attempting plugin activation`);
      await this.activatePluginForHostname(hostname);
    });

    // Listen for manual plugin activation requests
    const unsubscribeActivation = eventBus.on('plugin:activation-requested', async ({ pluginName }: EventMap['plugin:activation-requested']) => {
      await this.activatePlugin(pluginName);
    });

    // Listen for plugin deactivation requests
    const unsubscribeDeactivation = eventBus.on('plugin:deactivation-requested', async ({ pluginName }: EventMap['plugin:deactivation-requested']) => {
      if (this.activePlugin?.name === pluginName) {
        await this.deactivateCurrentPlugin();
      }
    });

    // Store cleanup functions
    this.context.cleanupFunctions = this.context.cleanupFunctions || [];
    this.context.cleanupFunctions.push(unsubscribeSiteChange, unsubscribeActivation, unsubscribeDeactivation);
  }

  async register(plugin: AdapterPlugin, config?: Partial<AdapterConfig>): Promise<void> {
    if (!this.isInitialized || !this.context) {
      throw new Error('Plugin registry not initialized');
    }

    const pluginName = plugin.name;
    
    if (this.plugins.has(pluginName)) {
      console.warn(`[PluginRegistry] Plugin ${pluginName} is already registered`);
      return;
    }

    try {
      // Validate plugin
      this.validatePlugin(plugin);

      // Create plugin registration
      const registration: PluginRegistration = {
        plugin,
        config: this.createPluginConfig(plugin, config),
        registeredAt: Date.now(),
        lastUsedAt: undefined, // Initialize lastUsedAt
        status: 'registered',
      };

      // Initialize plugin
      await plugin.initialize(this.context);

      // Register plugin
      this.plugins.set(pluginName, registration);

      // Also register in the AdapterStore for React component integration
      try {
        const adapterStore = useAdapterStore.getState();
        await adapterStore.registerPlugin(plugin, {
          id: registration.config.id,
          name: registration.config.name,
          description: registration.config.description,
          version: registration.config.version,
          enabled: registration.config.enabled,
          priority: registration.config.priority || 0,
          settings: registration.config.settings || {}
        });
        console.log(`[PluginRegistry] Also registered ${pluginName} in AdapterStore for React integration`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to register ${pluginName} in AdapterStore:`, adapterStoreError);
        // Don't fail the entire registration if AdapterStore registration fails
      }

      eventBus.emit('plugin:registered', { name: pluginName, version: plugin.version });

      console.log(`[PluginRegistry] Registered plugin: ${pluginName} v${plugin.version}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
      globalErrorHandler.handleError(
        error as Error,
        { 
          component: 'plugin-registry',
          operation: 'registration', 
          source: '[PluginRegistry]',
          details: { pluginName, error: errorMessage } 
        }
      );
      eventBus.emit('adapter:error', { name: pluginName, error: errorMessage });

      throw new Error(`Failed to register plugin ${pluginName}: ${errorMessage}`);
    }
  }

  async unregister(pluginName: string): Promise<void> {
    const registration = this.plugins.get(pluginName);
    if (!registration) {
      console.warn(`[PluginRegistry] Plugin ${pluginName} is not registered`);
      return;
    }

    try {
      // Deactivate if currently active
      if (this.activePlugin?.name === pluginName) {
        await this.deactivateCurrentPlugin();
      }

      // Cleanup plugin
      await registration.plugin.cleanup();

      // Remove from registry
      this.plugins.delete(pluginName);

      eventBus.emit('plugin:unregistered', { name: pluginName });

      console.log(`[PluginRegistry] Unregistered plugin: ${pluginName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown unregistration error';
      globalErrorHandler.handleError(
        error as Error,
        { 
          component: 'plugin-registry',
          operation: 'unregistration', 
          source: '[PluginRegistry]',
          details: { pluginName, error: errorMessage } 
        }
      );
      throw error;
    }
  }

  async activatePluginForHostname(hostname: string, isInitialActivation = false): Promise<void> {
    if (isInitialActivation) {
      this.isPerformingInitialActivation = true;
    }
    
    try {
      console.log(`[PluginRegistry] activatePluginForHostname called for: ${hostname}${isInitialActivation ? ' (initial)' : ''}`);
      
      const plugin = this.findPluginForHostname(hostname);
      
      if (!plugin) {
        console.log(`[PluginRegistry] No plugin found for hostname: ${hostname}`);
        if (this.activePlugin) {
          await this.deactivateCurrentPlugin();
        }
        return;
      }

      // Don't reactivate if already active
      if (this.activePlugin?.name === plugin.name) {
        console.log(`[PluginRegistry] Plugin ${plugin.name} already active for ${hostname}, skipping activation`);
        return;
      }

      console.log(`[PluginRegistry] Activating plugin ${plugin.name} for hostname: ${hostname}`);
      await this.activatePlugin(plugin.name);
    } finally {
      if (isInitialActivation) {
        this.isPerformingInitialActivation = false;
      }
    }
  }

  async activatePlugin(pluginName: string): Promise<void> {
    const registration = this.plugins.get(pluginName);
    if (!registration) {
      throw new Error(`Plugin ${pluginName} is not registered`);
    }

    // Guard against activating an already active plugin
    if (this.activePlugin && this.activePlugin.name === pluginName && registration.status === 'active') {
      console.log(`[PluginRegistry] Plugin ${pluginName} is already active, skipping activation`);
      return;
    }

    try {
      // Deactivate current plugin first
      if (this.activePlugin && this.activePlugin.name !== pluginName) {
        await this.deactivateCurrentPlugin();
      }

      // Activate new plugin
      const pluginInstance = registration.plugin;
      
      await performanceMonitor.time(`plugin-activation-${pluginName}`, async () => {
        await pluginInstance.activate();
      });

      this.activePlugin = pluginInstance;
      registration.instance = pluginInstance;
      registration.status = 'active';
      registration.lastUsedAt = Date.now(); // Update last used timestamp

      // Also activate in the AdapterStore for React component integration
      try {
        const adapterStore = useAdapterStore.getState();
        await adapterStore.activateAdapter(pluginName);
        console.log(`[PluginRegistry] Also activated ${pluginName} in AdapterStore for React integration`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to activate ${pluginName} in AdapterStore:`, adapterStoreError);
        // Don't fail the entire activation if AdapterStore activation fails
      }

      eventBus.emit('adapter:activated', {
        pluginName: pluginName,
        timestamp: Date.now(),
      });

      console.log(`[PluginRegistry] Activated plugin: ${pluginName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown activation error';
      
      globalErrorHandler.handleError(
        error as Error,
        { 
          component: 'plugin-registry',
          operation: 'activation', 
          source: '[PluginRegistry]',
          details: { pluginName, error: errorMessage } 
        }
      );

      eventBus.emit('plugin:activation-failed', { name: pluginName, error: errorMessage });

      throw new Error(`Failed to activate plugin ${pluginName}: ${errorMessage}`);
    }
  }

  async deactivateCurrentPlugin(): Promise<void> {
    if (!this.activePlugin) return;

    const pluginName = this.activePlugin.name;

    try {
      await performanceMonitor.time(`plugin-deactivation-${pluginName}`, async () => {
        await this.activePlugin!.deactivate();
      });

      // Also deactivate in the AdapterStore for React component integration
      try {
        const adapterStore = useAdapterStore.getState();
        await adapterStore.deactivateAdapter(pluginName, 'manual-deactivation');
        console.log(`[PluginRegistry] Also deactivated ${pluginName} in AdapterStore`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to deactivate ${pluginName} in AdapterStore:`, adapterStoreError);
      }

      eventBus.emit('adapter:deactivated', {
        pluginName: pluginName,
        reason: 'manual-deactivation',
        timestamp: Date.now()
      });

      this.activePlugin = null;
      console.log(`[PluginRegistry] Deactivated plugin: ${pluginName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deactivation error';
      
      globalErrorHandler.handleError(error as Error, { 
        component: 'plugin-registry',
        operation: 'deactivation', 
        source: '[PluginRegistry]',
        details: { pluginName, error: errorMessage } 
      });
      // Force deactivation even on error
      this.activePlugin = null;
      
      eventBus.emit('adapter:error', { name: pluginName, error: errorMessage });
    }
  }

  private findPluginForHostname(hostname: string): AdapterPlugin | null {
    let bestMatch: AdapterPlugin | null = null;
    let bestMatchScore = 0;

    for (const [, registration] of this.plugins) {
      const { plugin, config } = registration;
      
      if (!config.enabled) continue;

      for (const ph of plugin.hostnames) {
        let match = false;
        let matchLength = 0;
        if (typeof ph === 'string') {
          if (hostname.includes(ph)) {
            match = true;
            matchLength = ph.length;
          }
        } else { // ph is RegExp
          if (ph.test(hostname)) {
            match = true;
            matchLength = ph.source.length; // Use source.length for RegExp scoring
          }
        }
        if (match) {
          const score = matchLength + (config.priority || 0); // Ensure priority is a number
          if (score > bestMatchScore) {
            bestMatch = plugin;
            bestMatchScore = score;
          }
        }
      }
    }

    return bestMatch;
  }

  private validatePlugin(plugin: AdapterPlugin): void {
    const required = ['name', 'version', 'hostnames', 'capabilities', 'initialize', 'activate', 'deactivate', 'cleanup'];
    
    for (const prop of required) {
      if (!(prop in plugin)) {
        throw new Error(`Plugin missing required property: ${prop}`);
      }
    }

    if (!Array.isArray(plugin.hostnames) || plugin.hostnames.length === 0) {
      throw new Error('Plugin must specify at least one hostname');
    }

    if (!Array.isArray(plugin.capabilities) || plugin.capabilities.length === 0) {
      throw new Error('Plugin must specify at least one capability');
    }

    // Optional core methods like insertText and submitForm are checked by their usage 
    // or specific capability declarations rather than a blanket requirement here,
    // as they are optional in the AdapterPlugin interface.
  }

  private createPluginConfig(plugin: AdapterPlugin, overrides?: Partial<AdapterConfig>): AdapterConfig {
    const features: Partial<Record<AdapterCapability, boolean>> = {};
    if (plugin.capabilities) {
      plugin.capabilities.forEach((cap: AdapterCapability) => {
        features[cap] = true;
      });
    }

    const pluginConfig: AdapterConfig = {
      id: overrides?.id || plugin.name, // Use plugin name as ID if not overridden
      name: overrides?.name || plugin.name,
      description: overrides?.description || `Configuration for ${plugin.name}`,
      version: overrides?.version || plugin.version,
      enabled: overrides?.enabled !== undefined ? overrides.enabled : true, // Default to enabled
      priority: overrides?.priority || 0, // Default priority
      settings: overrides?.settings || {},
      customSelectors: overrides?.customSelectors || {},
      features: { ...features, ...(overrides?.features || {}) },
    };

    return pluginConfig;
  }

  private async registerBuiltInAdapters(): Promise<void> {
    try {
      // Register SidebarPlugin first (highest priority core functionality)
      const sidebarPlugin = new SidebarPlugin();
      await this.register(sidebarPlugin, {
        id: 'sidebar-plugin',
        name: 'Sidebar Plugin',
        description: 'Universal sidebar management plugin that auto-shows on page load',
        version: '1.0.0',
        enabled: true,
        priority: 1, // Highest priority for core UI functionality
        settings: {
          logLevel: 'info',
          autoShow: true,
          showDelay: 1000,
        },
      });

      // Register DefaultAdapter as fallback
      // const defaultAdapter = new DefaultAdapter();
      // await this.register(defaultAdapter, {
      //   id: 'default-adapter',
      //   name: 'Default Adapter',
      //   description: 'A fallback adapter that works on any website',
      //   version: '1.0.0',
      //   enabled: true,
      //   priority: 99, // Low priority, acts as fallback
      //   settings: {
      //     logLevel: 'info',
      //   },
      // });
      
      // Register ExampleForumAdapter for forum.example.com
      // const exampleForumAdapter = new ExampleForumAdapter();
      // await this.register(exampleForumAdapter, {
      //   id: 'example-forum-adapter',
      //   name: 'Example Forum Adapter',
      //   description: 'Specialized adapter for forum.example.com with forum-specific functionality',
      //   version: '1.0.0',
      //   enabled: true,
      //   priority: 10, // Higher priority than default
      //   settings: {
      //     logLevel: 'info',
      //   },
      // });

      // Register GeminiAdapter for Google Gemini
      const geminiAdapter = new GeminiAdapter();
      await this.register(geminiAdapter, {
        id: 'gemini-adapter',
        name: 'Gemini Adapter',
        description: 'Specialized adapter for Google Gemini with chat input, form submission, and file attachment support',
        version: '1.0.0',
        enabled: true,
        priority: 5, // High priority for Gemini
        settings: {
          logLevel: 'info',
          urlCheckInterval: 1000,
        },
      });

      // Register GrokAdapter for Grok (X.com/Grok.com)
      const grokAdapter = new GrokAdapter();
      await this.register(grokAdapter, {
        id: 'grok-adapter',
        name: 'Grok Adapter',
        description: 'Specialized adapter for Grok (X.com/Grok.com) with chat input, form submission, and file attachment support',
        version: '2.0.0',
        enabled: true,
        priority: 5, // High priority for Grok
        settings: {
          logLevel: 'info',
          urlCheckInterval: 1000,
        },
      });

      // Register PerplexityAdapter for Perplexity AI
      const perplexityAdapter = new PerplexityAdapter();
      await this.register(perplexityAdapter, {
        id: 'perplexity-adapter',
        name: 'Perplexity Adapter',
        description: 'Specialized adapter for Perplexity AI with chat input, form submission, and file attachment support',
        version: '2.0.0',
        enabled: true,
        priority: 5, // High priority for Perplexity
        settings: {
          logLevel: 'info',
          urlCheckInterval: 1000,
        },
      });

      // Register AIStudioAdapter for Google AI Studio
      const aiStudioAdapter = new AIStudioAdapter();
      await this.register(aiStudioAdapter, {
        id: 'aistudio-adapter',
        name: 'AI Studio Adapter',
        description: 'Specialized adapter for Google AI Studio with chat input, form submission, and file attachment support',
        version: '2.0.0',
        enabled: true,
        priority: 5, // High priority for AI Studio
        settings: {
          logLevel: 'info',
          urlCheckInterval: 1000,
        },
      });

      // Register OpenRouterAdapter for OpenRouter
      const openRouterAdapter = new OpenRouterAdapter();
      await this.register(openRouterAdapter, {
        id: 'openrouter-adapter',
        name: 'OpenRouter Adapter',
        description: 'Specialized adapter for OpenRouter with chat input, form submission, and file attachment support',
        version: '2.0.0',
        enabled: true,
        priority: 5, // High priority for OpenRouter
        settings: {
          logLevel: 'info',
          urlCheckInterval: 1000,
        },
      });
      
      console.log('[PluginRegistry] Successfully registered SidebarPlugin, DefaultAdapter, ExampleForumAdapter, GeminiAdapter, GrokAdapter, PerplexityAdapter, AIStudioAdapter, and OpenRouterAdapter');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
      console.error('[PluginRegistry] Failed to register built-in adapters:', errorMessage);
      throw new Error(`Built-in adapter registration failed: ${errorMessage}`);
    }
  }

  // Public getters
  getActivePlugin(): AdapterPlugin | null {
    return this.activePlugin;
  }

  getRegisteredPlugins(): Array<{ name: string; plugin: AdapterPlugin; config: AdapterConfig }> {
    return Array.from(this.plugins.entries()).map(([name, registration]) => ({
      name,
      plugin: registration.plugin,
      config: registration.config
    }));
  }

  getPluginByName(name: string): AdapterPlugin | null {
    const registration = this.plugins.get(name);
    return registration ? registration.plugin : null;
  }

  isPluginRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  updatePluginConfig(pluginName: string, config: Partial<AdapterConfig>): void {
    const registration = this.plugins.get(pluginName);
    if (!registration) {
      throw new Error(`Plugin ${pluginName} is not registered`);
    }

    const updatedConfig = { ...registration.config, ...config };
    registration.config = updatedConfig;
    
    eventBus.emit('plugin:config-updated', { name: pluginName, config: updatedConfig, timestamp: Date.now() });
  }

  setInitialActivationFlag(flag: boolean): void {
    console.log(`[PluginRegistry] setInitialActivationFlag called with: ${flag}, current flag: ${this.isPerformingInitialActivation}`);
    this.isPerformingInitialActivation = flag;
    console.log(`[PluginRegistry] Initial activation flag set to: ${flag}`);
  }

  // Debug information
  getDebugInfo(): object {
    return {
      isInitialized: this.isInitialized,
      activePlugin: this.activePlugin?.name || null,
      registeredPluginsCount: this.plugins.size,
      plugins: Array.from(this.plugins.keys()),
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    try {
      // Deactivate current plugin
      await this.deactivateCurrentPlugin();
      
      // Cleanup all registered plugins
      for (const [name, registration] of this.plugins.entries()) {
        try {
          await registration.plugin.cleanup();
          console.log(`[PluginRegistry] Cleaned up plugin: ${name}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown cleanup error';
          console.error(`[PluginRegistry] Failed to cleanup plugin ${name}:`, errorMessage);
        }
      }
      
      // Clear plugins map
      this.plugins.clear();
      
      // Run context cleanup functions
      if (this.context?.cleanupFunctions) {
        for (const cleanup of this.context.cleanupFunctions) {
          try {
            cleanup();
          } catch (error) {
            console.error('[PluginRegistry] Error during context cleanup:', error);
          }
        }
        this.context.cleanupFunctions = [];
      }
      
      this.isInitialized = false;
      this.activePlugin = null;
      this.context = null;
      this.initializationPromise = null;
      
      console.log('[PluginRegistry] Cleanup completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown cleanup error';
      console.error('[PluginRegistry] Cleanup failed:', errorMessage);
      throw error;
    }
  }
}

export const pluginRegistry = new PluginRegistry();

// Initialization function for the application initializer
export async function initializePluginRegistry(): Promise<void> {
  const context: PluginContext = {
    eventBus,
    stores: {
      // Placeholder store instances - these would be actual store instances in a full implementation
      app: {},
      connection: {},
      tool: {},
      ui: {},
      adapter: {},
    },
    utils: {
      createElement: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, any>, children?: (Node | string)[]) => {
        const element = document.createElement(tag);
        if (attrs) {
          Object.entries(attrs).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
          });
        }
        if (children) {
          children.forEach(child => {
            element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
          });
        }
        return element;
      },
      waitForElement: async (selector: string, timeout: number = 5000, root: Document | Element = document) => {
        return new Promise<HTMLElement | null>((resolve) => {
          const element = root.querySelector(selector) as HTMLElement;
          if (element) {
            resolve(element);
            return;
          }
          
          const observer = new MutationObserver(() => {
            const element = root.querySelector(selector) as HTMLElement;
            if (element) {
              observer.disconnect();
              resolve(element);
            }
          });
          
          observer.observe(root, { childList: true, subtree: true });
          
          setTimeout(() => {
            observer.disconnect();
            resolve(null);
          }, timeout);
        });
      },
      injectCSS: (css: string, id?: string) => {
        const style = document.createElement('style');
        style.textContent = css;
        if (id) style.id = id;
        document.head.appendChild(style);
        return style;
      },
      observeChanges: (targetNode: Node, callback: MutationCallback, options: MutationObserverInit) => {
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, options);
        return observer;
      },
      debounce: <T extends (...args: any[]) => any>(func: T, delay: number) => {
        let timeoutId: NodeJS.Timeout;
        return ((...args: any[]) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func(...args), delay);
        }) as T;
      },
      throttle: <T extends (...args: any[]) => any>(func: T, delay: number) => {
        let lastCall = 0;
        return ((...args: any[]) => {
          const now = Date.now();
          if (now - lastCall >= delay) {
            lastCall = now;
            return func(...args);
          }
        }) as T;
      },
      getUniqueId: (prefix: string = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    },
    chrome: typeof chrome !== 'undefined' ? {
      runtime: chrome.runtime,
      storage: chrome.storage,
      tabs: chrome.tabs,
    } : {
      runtime: {} as typeof chrome.runtime,
      storage: {} as typeof chrome.storage,
    },
    logger: {
      debug: (...args: any[]) => console.debug('[Plugin]', ...args),
      info: (...args: any[]) => console.info('[Plugin]', ...args),
      warn: (...args: any[]) => console.warn('[Plugin]', ...args),
      error: (...args: any[]) => console.error('[Plugin]', ...args),
    },
    cleanupFunctions: [],
  };
  
  await pluginRegistry.initialize(context);
}

// Cleanup function for the application cleanup
export async function cleanupPluginRegistry(): Promise<void> {
  await pluginRegistry.cleanup();
}
