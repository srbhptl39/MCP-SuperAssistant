import { EventEmitter } from './EventEmitter.js';
import type { ITransportPlugin, TransportType, PluginConfig } from '../types/plugin.js';
import type { RegistryEvents } from '../types/events.js';
import { SSEPlugin } from '../plugins/sse/SSEPlugin.js';
import { WebSocketPlugin } from '../plugins/websocket/WebSocketPlugin.js';
import { StreamableHttpPlugin } from '../plugins/streamable-http/StreamableHttpPlugin.js';

export class PluginRegistry extends EventEmitter<RegistryEvents> {
  private plugins = new Map<TransportType, ITransportPlugin>();
  private initialized = new Set<TransportType>();

  constructor() {
    super();
    console.log('[PluginRegistry] Initialized');
  }

  async register(plugin: ITransportPlugin): Promise<void> {
    const { transportType } = plugin.metadata;

    if (this.plugins.has(transportType)) {
      console.warn(`[PluginRegistry] Plugin for transport '${transportType}' already registered, replacing`);
    }

    this.plugins.set(transportType, plugin);
    console.log(
      `[PluginRegistry] Registered plugin: ${plugin.metadata.name} v${plugin.metadata.version} (${transportType})`,
    );

    this.emit('registry:plugin-registered', { plugin });
  }

  unregister(type: TransportType): boolean {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      return false;
    }

    this.plugins.delete(type);
    this.initialized.delete(type);
    console.log(`[PluginRegistry] Unregistered plugin for transport: ${type}`);

    this.emit('registry:plugin-unregistered', { type });
    return true;
  }

  getPlugin(type: TransportType): ITransportPlugin | undefined {
    return this.plugins.get(type);
  }

  async getInitializedPlugin(type: TransportType, config?: PluginConfig): Promise<ITransportPlugin> {
    const plugin = this.getPlugin(type);
    if (!plugin) {
      throw new Error(`Plugin for transport '${type}' not found`);
    }

    // Initialize plugin if not already initialized
    if (!this.initialized.has(type)) {
      const pluginConfig = config || plugin.getDefaultConfig();
      await plugin.initialize(pluginConfig);
      this.initialized.add(type);
      console.log(`[PluginRegistry] Initialized plugin: ${type}`);
    }

    return plugin;
  }

  isPluginAvailable(type: TransportType): boolean {
    return this.plugins.has(type);
  }

  isPluginInitialized(type: TransportType): boolean {
    return this.initialized.has(type);
  }

  listAvailable(): TransportType[] {
    return Array.from(this.plugins.keys());
  }

  listInitialized(): TransportType[] {
    return Array.from(this.initialized);
  }

  getPluginInfo(type: TransportType): {
    available: boolean;
    initialized: boolean;
    metadata?: any;
  } {
    const plugin = this.plugins.get(type);
    return {
      available: !!plugin,
      initialized: this.initialized.has(type),
      metadata: plugin?.metadata,
    };
  }

  async loadDefaultPlugins(): Promise<void> {
    console.log('[PluginRegistry] Loading default plugins...');

    try {
      // Use static imports - plugins are imported at the top of the file
      await this.register(new SSEPlugin());
      await this.register(new WebSocketPlugin());
      await this.register(new StreamableHttpPlugin());

      const loadedCount = this.plugins.size;
      console.log(`[PluginRegistry] Loaded ${loadedCount} default plugins`);

      this.emit('registry:plugins-loaded', { count: loadedCount });
    } catch (error) {
      console.error('[PluginRegistry] Failed to load default plugins:', error);
      throw new Error(`Failed to load default plugins: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clear(): void {
    this.plugins.clear();
    this.initialized.clear();
    console.log('[PluginRegistry] Cleared all plugins');
  }

  getStats(): {
    totalPlugins: number;
    initializedPlugins: number;
    availableTypes: TransportType[];
    initializedTypes: TransportType[];
  } {
    return {
      totalPlugins: this.plugins.size,
      initializedPlugins: this.initialized.size,
      availableTypes: this.listAvailable(),
      initializedTypes: this.listInitialized(),
    };
  }
}
