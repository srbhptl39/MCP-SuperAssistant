// plugins/plugin-registry.ts
import { eventBus } from '../events/event-bus';
import type { EventMap } from '../events'; 
import performanceMonitor from '../core/performance';
import globalErrorHandler from '../core/error-handler';
import type { AdapterPlugin, PluginRegistration, PluginContext, AdapterConfig, AdapterCapability } from './plugin-types';

class PluginRegistry {
  private plugins = new Map<string, PluginRegistration>();
  private activePlugin: AdapterPlugin | null = null;
  private context: PluginContext | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

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
      
      // Register built-in adapters
      await this.registerBuiltInAdapters();
      
      this.isInitialized = true;
      
      eventBus.emit('plugin:registry-initialized', { registeredPlugins: this.plugins.size, timestamp: Date.now() });
      
      console.log('[PluginRegistry] Initialized with', this.plugins.size, 'plugins');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      globalErrorHandler.handleError(
        error as Error,
        { source: '[PluginRegistry]', operation: 'initialization', details: { pluginCount: this.plugins.size, errorMessage } }
      );
      throw new Error(`Plugin registry initialization failed: ${errorMessage}`);
    }
  }

  private setupEventListeners(): void {
    if (!this.context) return;

    // Listen for site changes to auto-activate plugins
    const unsubscribeSiteChange = eventBus.on('app:site-changed', async ({ site, hostname }: EventMap['app:site-changed']) => {
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

      eventBus.emit('plugin:registered', { name: pluginName, version: plugin.version });

      console.log(`[PluginRegistry] Registered plugin: ${pluginName} v${plugin.version}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
      globalErrorHandler.handleError(
        error as Error,
        { source: '[PluginRegistry]', operation: 'registration', details: { pluginName, error: errorMessage } }
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
        { source: '[PluginRegistry]', operation: 'unregistration', details: { pluginName, error: errorMessage } }
      );
      throw error;
    }
  }

  async activatePluginForHostname(hostname: string): Promise<void> {
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
      console.log(`[PluginRegistry] Plugin ${plugin.name} already active for ${hostname}`);
      return;
    }

    await this.activatePlugin(plugin.name);
  }

  async activatePlugin(pluginName: string): Promise<void> {
    const registration = this.plugins.get(pluginName);
    if (!registration) {
      throw new Error(`Plugin ${pluginName} is not registered`);
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

      eventBus.emit('adapter:activated', {
        pluginName: pluginName,
        timestamp: Date.now(),
      });

      console.log(`[PluginRegistry] Activated plugin: ${pluginName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown activation error';
      
      globalErrorHandler.handleError(
        error as Error,
        { source: '[PluginRegistry]', operation: 'activation', details: { pluginName, error: errorMessage } }
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

      eventBus.emit('adapter:deactivated', {
        pluginName: pluginName,
        reason: 'manual-deactivation',
        timestamp: Date.now()
      });

      this.activePlugin = null;
      console.log(`[PluginRegistry] Deactivated plugin: ${pluginName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deactivation error';
      
      globalErrorHandler.handleError(error as Error, { source: '[PluginRegistry]', operation: 'deactivation', details: { pluginName, error: errorMessage } });
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
    // TODO: Implement registration of built-in adapters as per session 5.
    // For now, this is a placeholder.
    console.log('[PluginRegistry] Built-in adapters will be registered here');
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

  // Debug information
  getDebugInfo(): object {
    return {
      isInitialized: this.isInitialized,
      activePlugin: this.activePlugin?.name || null,
      registeredPluginsCount: this.plugins.size,
      plugins: Array.from(this.plugins.keys()),
    };
  }
}

export const pluginRegistry = new PluginRegistry();
