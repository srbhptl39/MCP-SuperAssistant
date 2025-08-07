// plugins/plugin-registry.ts
import { eventBus } from '../events/event-bus';
import type { EventMap } from '../events'; 
import performanceMonitor from '../core/performance';
import globalErrorHandler from '../core/error-handler';
import { useAdapterStore } from '../stores/adapter.store';
import { useAppStore } from '../stores/app.store';
import { useConnectionStore } from '../stores/connection.store';
import { useToolStore } from '../stores/tool.store';
import { useUIStore } from '../stores/ui.store';
import { useConfigStore } from '../stores/config.store';
import type { AdapterPlugin, PluginRegistration, PluginContext, AdapterConfig, AdapterCapability, PluginType } from './plugin-types';
import { DefaultAdapter } from './adapters/default.adapter';
// import { ExampleForumAdapter } from './adapters/example-forum.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GitHubCopilotAdapter } from './adapters/ghcopilot.adapter';
import { DeepSeekAdapter } from './adapters/deepseek.adapter';
import { GrokAdapter } from './adapters/grok.adapter';
import { PerplexityAdapter } from './adapters/perplexity.adapter';
import { AIStudioAdapter } from './adapters/aistudio.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { T3ChatAdapter } from './adapters/t3chat.adapter';
import { MistralAdapter } from './adapters/mistral.adapter';
import { SidebarPlugin } from './sidebar.plugin';
import { ChatGPTAdapter } from './adapters/chatgpt.adapter';
import { KimiAdapter } from './adapters/kimi.adapter';
import { ChatZAdapter } from './adapters/chatzai.adapter';
import { RemoteConfigPlugin } from './remote-config.plugin';

// Types for lazy initialization
interface AdapterFactory {
  name: string;
  version: string;
  type: PluginType;
  hostnames: (string | RegExp)[];
  capabilities: AdapterCapability[];
  create: () => AdapterPlugin;
  config: Partial<AdapterConfig>;
}

interface AdapterFactoryRegistration {
  factory: AdapterFactory;
  registeredAt: number;
}

class PluginRegistry {
  private plugins = new Map<string, PluginRegistration>();
  private adapterFactories = new Map<string, AdapterFactoryRegistration>();
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

      console.debug('[PluginRegistry] Initialized with', this.plugins.size, 'plugins');

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
      console.debug(`[PluginRegistry] Site change event received for ${hostname}, initial activation flag: ${this.isPerformingInitialActivation}`);
      
      // Skip if we're in the middle of initial activation to prevent race conditions
      if (this.isPerformingInitialActivation) {
        console.debug(`[PluginRegistry] Skipping site-change activation for ${hostname} (initial activation in progress)`);
        return;
      }
      
      console.debug(`[PluginRegistry] Site changed to ${hostname}, attempting plugin activation`);
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
        console.debug(`[PluginRegistry] Also registered ${pluginName} in AdapterStore for React integration`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to register ${pluginName} in AdapterStore:`, adapterStoreError);
        // Don't fail the entire registration if AdapterStore registration fails
      }

      eventBus.emit('plugin:registered', { name: pluginName, version: plugin.version });

      console.debug(`[PluginRegistry] Registered plugin: ${pluginName} v${plugin.version}`);

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

  /**
   * Register an adapter factory for lazy initialization
   */
  registerAdapterFactory(factory: AdapterFactory): void {
    if (!this.isInitialized) {
      throw new Error('Plugin registry not initialized');
    }

    const factoryName = factory.name;
    
    if (this.adapterFactories.has(factoryName)) {
      console.warn(`[PluginRegistry] Adapter factory ${factoryName} is already registered`);
      return;
    }

    if (this.plugins.has(factoryName)) {
      console.warn(`[PluginRegistry] Plugin ${factoryName} is already registered as instance`);
      return;
    }

    try {
      // Validate factory
      this.validateAdapterFactory(factory);

      const registration: AdapterFactoryRegistration = {
        factory,
        registeredAt: Date.now(),
      };

      this.adapterFactories.set(factoryName, registration);
      console.debug(`[PluginRegistry] Registered adapter factory: ${factoryName} v${factory.version}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown factory registration error';
      console.error(`[PluginRegistry] Failed to register adapter factory ${factoryName}:`, errorMessage);
      throw new Error(`Failed to register adapter factory ${factoryName}: ${errorMessage}`);
    }
  }

  /**
   * Lazily initialize an adapter from its factory
   */
  private async initializeAdapterFromFactory(factoryName: string): Promise<AdapterPlugin | null> {
    const factoryRegistration = this.adapterFactories.get(factoryName);
    if (!factoryRegistration || !this.context) {
      return null;
    }

    try {
      console.debug(`[PluginRegistry] Lazily initializing adapter: ${factoryName}`);
      
      const adapter = factoryRegistration.factory.create();
      
      // Register the initialized adapter
      await this.register(adapter, factoryRegistration.factory.config);
      
      // Remove from factory registry since it's now initialized
      this.adapterFactories.delete(factoryName);
      
      console.debug(`[PluginRegistry] Successfully initialized adapter: ${factoryName}`);
      return adapter;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      console.error(`[PluginRegistry] Failed to initialize adapter ${factoryName}:`, errorMessage);
      globalErrorHandler.handleError(
        error as Error,
        {
          component: 'plugin-registry',
          operation: 'lazy-initialization',
          source: '[PluginRegistry]',
          details: { factoryName, error: errorMessage }
        }
      );
      return null;
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

      console.debug(`[PluginRegistry] Unregistered plugin: ${pluginName}`);

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
      console.debug(`[PluginRegistry] activatePluginForHostname called for: ${hostname}${isInitialActivation ? ' (initial)' : ''}`);
      
      const plugin = await this.findOrInitializePluginForHostname(hostname);
      
      if (!plugin) {
        console.debug(`[PluginRegistry] No plugin found for hostname: ${hostname}`);
        if (this.activePlugin) {
          await this.deactivateCurrentPlugin();
        }
        return;
      }

      // Don't reactivate if already active
      if (this.activePlugin?.name === plugin.name) {
        console.debug(`[PluginRegistry] Plugin ${plugin.name} already active for ${hostname}, skipping activation`);
        return;
      }

      console.debug(`[PluginRegistry] Activating plugin ${plugin.name} for hostname: ${hostname}`);
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
      console.debug(`[PluginRegistry] Plugin ${pluginName} is already active, skipping activation`);
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
        console.debug(`[PluginRegistry] Also activated ${pluginName} in AdapterStore for React integration`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to activate ${pluginName} in AdapterStore:`, adapterStoreError);
        // Don't fail the entire activation if AdapterStore activation fails
      }

      eventBus.emit('adapter:activated', {
        pluginName: pluginName,
        timestamp: Date.now(),
      });

      console.debug(`[PluginRegistry] Activated plugin: ${pluginName}`);

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
        console.debug(`[PluginRegistry] Also deactivated ${pluginName} in AdapterStore`);
      } catch (adapterStoreError) {
        console.warn(`[PluginRegistry] Failed to deactivate ${pluginName} in AdapterStore:`, adapterStoreError);
      }

      eventBus.emit('adapter:deactivated', {
        pluginName: pluginName,
        reason: 'manual-deactivation',
        timestamp: Date.now()
      });

      this.activePlugin = null;
      console.debug(`[PluginRegistry] Deactivated plugin: ${pluginName}`);

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
    console.debug(`[PluginRegistry] findPluginForHostname called with hostname: ${hostname}`);
    let bestMatch: AdapterPlugin | null = null;
    let bestMatchScore = 0;

    // Only look for website-adapter type plugins, not sidebar or core-ui plugins
    for (const [, registration] of this.plugins) {
      const { plugin, config } = registration;
      
      if (!config.enabled) {
        console.debug(`[PluginRegistry] Skipping disabled plugin: ${plugin.name}`);
        continue;
      }
      
      // Special handling for SidebarPlugin - exclude it from hostname matching
      if (plugin.name === 'sidebar-plugin') {
        console.debug(`[PluginRegistry] Skipping sidebar plugin: ${plugin.name}`);
        continue;
      }
      
      // Default to 'website-adapter' if type is not specified, filter out 'sidebar' and 'core-ui'
      const pluginType = plugin.type || 'website-adapter';
      console.debug(`[PluginRegistry] Checking plugin: ${plugin.name} (type: ${pluginType})`);
      if (pluginType !== 'website-adapter') {
        console.debug(`[PluginRegistry] Skipping non-website-adapter plugin: ${plugin.name} (type: ${pluginType})`);
        continue; // Filter by plugin type
      }

      for (const ph of plugin.hostnames) {
        let match = false;
        let matchLength = 0;
        if (typeof ph === 'string') {
          console.debug(`[PluginRegistry] Checking string hostname: ${ph} against ${hostname}`);
          if (hostname.includes(ph)) {
            match = true;
            matchLength = ph.length;
            console.debug(`[PluginRegistry] String match found: ${ph} matches ${hostname}`);
          }
        } else { // ph is RegExp
          console.debug(`[PluginRegistry] Checking RegExp hostname: ${ph.source} against ${hostname}`);
          if (ph.test(hostname)) {
            match = true;
            matchLength = ph.source.length; // Use source.length for RegExp scoring
            console.debug(`[PluginRegistry] RegExp match found: ${ph.source} matches ${hostname}`);
          }
        }
        if (match) {
          const score = matchLength + (config.priority || 0); // Ensure priority is a number
          console.debug(`[PluginRegistry] Match found for ${plugin.name}: score ${score} (length: ${matchLength}, priority: ${config.priority || 0})`);
          if (score > bestMatchScore) {
            bestMatch = plugin;
            bestMatchScore = score;
            console.debug(`[PluginRegistry] New best match: ${plugin.name} with score ${score}`);
          }
        }
      }
    }

    console.debug(`[PluginRegistry] Best plugin match for ${hostname}:`, bestMatch?.name || 'none');
    return bestMatch;
  }

  private findFactoryForHostname(hostname: string): AdapterFactory | null {
    console.debug(`[PluginRegistry] findFactoryForHostname called with hostname: ${hostname}`);
    let bestMatchFactory: AdapterFactory | null = null;
    let bestMatchScore = 0;

    // Only look for website-adapter type factories
    for (const [, factoryRegistration] of this.adapterFactories) {
      const { factory } = factoryRegistration;
      console.debug(`[PluginRegistry] Checking factory: ${factory.name} (type: ${factory.type}) with hostnames:`, factory.hostnames);
      
      if (factory.type !== 'website-adapter') {
        console.debug(`[PluginRegistry] Skipping factory ${factory.name} - not a website-adapter (type: ${factory.type})`);
        continue; // Filter by plugin type
      }

      for (const ph of factory.hostnames) {
        let match = false;
        let matchLength = 0;
        if (typeof ph === 'string') {
          console.debug(`[PluginRegistry] Checking string hostname: ${ph} against ${hostname}`);
          if (hostname.includes(ph)) {
            match = true;
            matchLength = ph.length;
            console.debug(`[PluginRegistry] String match found: ${ph} matches ${hostname}`);
          }
        } else { // ph is RegExp
          console.debug(`[PluginRegistry] Checking RegExp hostname: ${ph.source} against ${hostname}`);
          if (ph.test(hostname)) {
            match = true;
            matchLength = ph.source.length;
            console.debug(`[PluginRegistry] RegExp match found: ${ph.source} matches ${hostname}`);
          }
        }
        if (match) {
          const priority = factory.config.priority || 0;
          const score = matchLength + priority;
          console.debug(`[PluginRegistry] Match found for ${factory.name}: score ${score} (length: ${matchLength}, priority: ${priority})`);
          if (score > bestMatchScore) {
            bestMatchFactory = factory;
            bestMatchScore = score;
            console.debug(`[PluginRegistry] New best match: ${factory.name} with score ${score}`);
          }
        }
      }
    }

    console.debug(`[PluginRegistry] Best factory match for ${hostname}:`, bestMatchFactory?.name || 'none');
    return bestMatchFactory;
  }

  private async findOrInitializePluginForHostname(hostname: string): Promise<AdapterPlugin | null> {
    console.debug(`[PluginRegistry] findOrInitializePluginForHostname called with: ${hostname}`);
    
    // First check for already initialized plugins
    let plugin = this.findPluginForHostname(hostname);
    if (plugin) {
      console.debug(`[PluginRegistry] Found initialized plugin for ${hostname}: ${plugin.name}`);
      return plugin;
    }

    // Then check for factories that can be lazily initialized
    const factory = this.findFactoryForHostname(hostname);
    if (factory) {
      console.debug(`[PluginRegistry] Found factory for ${hostname}: ${factory.name}, initializing lazily`);
      plugin = await this.initializeAdapterFromFactory(factory.name);
      if (plugin) {
        console.debug(`[PluginRegistry] Successfully initialized ${plugin.name} for ${hostname}`);
        return plugin;
      }
    }

    console.debug(`[PluginRegistry] No plugin or factory found for hostname: ${hostname}`);
    return null;
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

    // Type is optional, but if provided, it should be valid
    if (plugin.type && !['sidebar', 'website-adapter', 'core-ui', 'extension'].includes(plugin.type)) {
      throw new Error(`Plugin has invalid type: ${plugin.type}`);
    }

    // Optional core methods like insertText and submitForm are checked by their usage 
    // or specific capability declarations rather than a blanket requirement here,
    // as they are optional in the AdapterPlugin interface.
  }

  private validateAdapterFactory(factory: AdapterFactory): void {
    const required = ['name', 'version', 'type', 'hostnames', 'capabilities', 'create'];
    
    for (const prop of required) {
      if (!(prop in factory)) {
        throw new Error(`Adapter factory missing required property: ${prop}`);
      }
    }

    if (!Array.isArray(factory.hostnames) || factory.hostnames.length === 0) {
      throw new Error('Adapter factory must specify at least one hostname');
    }

    if (!Array.isArray(factory.capabilities) || factory.capabilities.length === 0) {
      throw new Error('Adapter factory must specify at least one capability');
    }

    if (typeof factory.create !== 'function') {
      throw new Error('Adapter factory must have a create function');
    }
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

            // Register Remote Config Plugin (core extension functionality) - EAGERLY INITIALIZED
      const remoteConfigPlugin = new RemoteConfigPlugin();
      await this.register(remoteConfigPlugin, {
        id: 'remote-config-plugin',
        name: 'Remote Config Plugin',
        description: 'Firebase Remote Config integration for feature flags and notifications',
        version: '1.0.0',
        enabled: true,
        priority: 2, // High priority for core functionality
        settings: {
          logLevel: 'info',
          autoActivate: true,
        },
      });

      // Register SidebarPlugin first (highest priority core functionality) - EAGERLY INITIALIZED
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

      // Register adapter factories for LAZY INITIALIZATION
      // Only initialize these adapters when their hostname is visited

      // Register GeminiAdapter factory for Google Gemini
      this.registerAdapterFactory({
        name: 'gemini-adapter',
        version: '1.0.0',
        type: 'website-adapter',
        hostnames: ['gemini.google.com'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new GeminiAdapter(),
        config: {
          id: 'gemini-adapter',
          name: 'Gemini Adapter',
          description: 'Specialized adapter for Google Gemini with chat input, form submission, and file attachment support',
          version: '1.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register GitHubCopilotAdapter factory for GitHub Copilot
      this.registerAdapterFactory({
        name: 'github-copilot-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['github.com'],
        // capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        capabilities: ['text-insertion', 'form-submission'],
        create: () => new GitHubCopilotAdapter(),
        config: {
          id: 'github-copilot-adapter',
          name: 'GitHub Copilot Adapter',
          description: 'Specialized adapter for GitHub Copilot with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register ChatGPTAdapter factory for OpenAI ChatGPT
      this.registerAdapterFactory({
        name: 'chatgpt-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['chatgpt.com'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new ChatGPTAdapter(),
        config: {
          id: 'chatgpt-adapter',
          name: 'ChatGPT Adapter',
          description: 'Specialized adapter for OpenAI ChatGPT with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register DeepSeekAdapter factory for DeepSeek Chat
      this.registerAdapterFactory({
        name: 'deepseek-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['chat.deepseek.com'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new DeepSeekAdapter(),
        config: {
          id: 'deepseek-adapter',
          name: 'DeepSeek Adapter',
          description: 'Specialized adapter for DeepSeek Chat with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register GrokAdapter factory for Grok (X.com/Grok.com)
      this.registerAdapterFactory({
        name: 'grok-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['grok.com', /x\.com.*grok/, /twitter\.com.*grok/],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new GrokAdapter(),
        config: {
          id: 'grok-adapter',
          name: 'Grok Adapter',
          description: 'Specialized adapter for Grok (X.com/Grok.com) with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register PerplexityAdapter factory for Perplexity AI
      this.registerAdapterFactory({
        name: 'perplexity-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['perplexity.ai'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new PerplexityAdapter(),
        config: {
          id: 'perplexity-adapter',
          name: 'Perplexity Adapter',
          description: 'Specialized adapter for Perplexity AI with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register AIStudioAdapter factory for Google AI Studio
      this.registerAdapterFactory({
        name: 'aistudio-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['aistudio.google.com'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new AIStudioAdapter(),
        config: {
          id: 'aistudio-adapter',
          name: 'AI Studio Adapter',
          description: 'Specialized adapter for Google AI Studio with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register OpenRouterAdapter factory for OpenRouter
      this.registerAdapterFactory({
        name: 'openrouter-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['openrouter.ai'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new OpenRouterAdapter(),
        config: {
          id: 'openrouter-adapter',
          name: 'OpenRouter Adapter',
          description: 'Specialized adapter for OpenRouter with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register T3ChatAdapter factory for T3 Chat
      this.registerAdapterFactory({
        name: 't3chat-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['t3.chat'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new T3ChatAdapter(),
        config: {
          id: 't3chat-adapter',
          name: 'T3Chat Adapter',
          description: 'Specialized adapter for T3 Chat with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register MistralAdapter factory for Mistral Chat
      this.registerAdapterFactory({
        name: 'mistralchat-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['chat.mistral.ai'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new MistralAdapter(),
        config: {
          id: 'mistralchat-adapter',
          name: 'Mistral Adapter',
          description: 'Specialized adapter for Mistral chat with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });


      // Register KimiAdapter factory for Kimi AI
      this.registerAdapterFactory({
        name: 'kimi-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['kimi.com'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new KimiAdapter(),
        config: {
          id: 'kimi-adapter',
          name: 'Kimi Adapter',
          description: 'Specialized adapter for Kimi AI with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      // Register ChatZAIAdapter factory for ChatZ.AI
      this.registerAdapterFactory({
        name: 'chatzai-adapter',
        version: '2.0.0',
        type: 'website-adapter',
        hostnames: ['chat.z.ai'],
        capabilities: ['text-insertion', 'form-submission', 'file-attachment'],
        create: () => new ChatZAdapter(),
        config: {
          id: 'chatzai-adapter',
          name: 'ChatZAI Adapter',
          description: 'Specialized adapter for ChatZ.AI with chat input, form submission, and file attachment support',
          version: '2.0.0',
          enabled: true,
          priority: 5,
          settings: {
            logLevel: 'info',
            urlCheckInterval: 1000,
          },
        },
      });

      
      
      console.debug(`[PluginRegistry] Successfully registered SidebarPlugin (initialized) and ${this.adapterFactories.size} adapter factories (lazy)`);
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

  getRegisteredFactories(): Array<{ name: string; factory: AdapterFactory }> {
    return Array.from(this.adapterFactories.entries()).map(([name, registration]) => ({
      name,
      factory: registration.factory
    }));
  }

  getPluginByName(name: string): AdapterPlugin | null {
    const registration = this.plugins.get(name);
    return registration ? registration.plugin : null;
  }

  isPluginRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  isFactoryRegistered(name: string): boolean {
    return this.adapterFactories.has(name);
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
    console.debug(`[PluginRegistry] setInitialActivationFlag called with: ${flag}, current flag: ${this.isPerformingInitialActivation}`);
    this.isPerformingInitialActivation = flag;
    console.debug(`[PluginRegistry] Initial activation flag set to: ${flag}`);
  }

  // Debug information
  getDebugInfo(): object {
    return {
      isInitialized: this.isInitialized,
      activePlugin: this.activePlugin?.name || null,
      registeredPluginsCount: this.plugins.size,
      registeredFactoriesCount: this.adapterFactories.size,
      plugins: Array.from(this.plugins.keys()),
      factories: Array.from(this.adapterFactories.keys()),
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
          console.debug(`[PluginRegistry] Cleaned up plugin: ${name}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown cleanup error';
          console.error(`[PluginRegistry] Failed to cleanup plugin ${name}:`, errorMessage);
        }
      }
      
      // Clear plugins map and factories map
      this.plugins.clear();
      this.adapterFactories.clear();
      
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
      
      console.debug('[PluginRegistry] Cleanup completed');
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
      // Use actual store instances for plugin access
      app: useAppStore,
      connection: useConnectionStore,
      tool: useToolStore,
      ui: useUIStore,
      adapter: useAdapterStore,
      config: useConfigStore,
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
      info: (...args: any[]) => console.debug('[Plugin]', ...args),
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
