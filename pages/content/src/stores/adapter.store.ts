import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { eventBus } from '../events';
import type { AdapterPlugin, PluginRegistration, AdapterCapability } from '../types/plugins';

export interface AdapterState {
  registeredPlugins: Record<string, PluginRegistration>; // Store by plugin name
  activeAdapterName: string | null;
  currentCapabilities: AdapterCapability[];
  lastAdapterError: { name: string; error: string | Error } | null;

  // Actions
  registerPlugin: (plugin: AdapterPlugin, config: PluginRegistration['config']) => Promise<boolean>;
  unregisterPlugin: (name: string) => Promise<void>;
  activateAdapter: (name: string) => Promise<boolean>;
  deactivateAdapter: (name: string, reason?: string) => Promise<void>;
  getPlugin: (name: string) => PluginRegistration | undefined;
  getActiveAdapter: () => PluginRegistration | undefined;
  updatePluginConfig: (name: string, config: Partial<PluginRegistration['config']>) => void;
  setPluginError: (name: string, error: string | Error) => void;
}

const initialState: Omit<AdapterState, 'registerPlugin' | 'unregisterPlugin' | 'activateAdapter' | 'deactivateAdapter' | 'getPlugin' | 'getActiveAdapter' | 'updatePluginConfig' | 'setPluginError'> = {
  registeredPlugins: {},
  activeAdapterName: null,
  currentCapabilities: [],
  lastAdapterError: null,
};

export const useAdapterStore = create<AdapterState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      registerPlugin: async (plugin: AdapterPlugin, config: PluginRegistration['config']): Promise<boolean> => {
        if (get().registeredPlugins[plugin.name]) {
          console.warn(`[AdapterStore] Plugin "${plugin.name}" already registered.`);
          return false;
        }
        const registration: PluginRegistration = {
          plugin,
          config,
          registeredAt: Date.now(),
          status: 'registered',
        };
        set(state => ({
          registeredPlugins: { ...state.registeredPlugins, [plugin.name]: registration },
        }));
        console.log(`[AdapterStore] Plugin "${plugin.name}" registered.`);
        eventBus.emit('plugin:registered', { name: plugin.name, version: plugin.version });
        return true;
      },

      unregisterPlugin: async (name: string): Promise<void> => {
        const pluginReg = get().registeredPlugins[name];
        if (!pluginReg) {
          console.warn(`[AdapterStore] Plugin "${name}" not found for unregistration.`);
          return;
        }
        if (get().activeAdapterName === name && pluginReg.instance) {
          try {
            await pluginReg.instance.deactivate();
            await pluginReg.instance.cleanup();
          } catch (e) {
            console.error(`[AdapterStore] Error deactivating/cleaning up plugin "${name}" during unregistration:`, e);
          }
        }
        const { [name]: _, ...remainingPlugins } = get().registeredPlugins;
        set({ 
          registeredPlugins: remainingPlugins,
          activeAdapterName: get().activeAdapterName === name ? null : get().activeAdapterName,
          currentCapabilities: get().activeAdapterName === name ? [] : get().currentCapabilities,
        });
        console.log(`[AdapterStore] Plugin "${name}" unregistered.`);
        eventBus.emit('plugin:unregistered', { name });
      },

      activateAdapter: async (name: string): Promise<boolean> => {
        const pluginReg = get().registeredPlugins[name];
        if (!pluginReg) {
          console.error(`[AdapterStore] Cannot activate: Plugin "${name}" not registered.`);
          get().setPluginError(name, `Plugin "${name}" not registered.`);
          return false;
        }
        if (!pluginReg.config.enabled) {
          console.warn(`[AdapterStore] Cannot activate: Plugin "${name}" is disabled by config.`);
          get().setPluginError(name, `Plugin "${name}" is disabled.`);
          return false;
        }

        const currentActiveAdapter = get().getActiveAdapter();
        if (currentActiveAdapter && currentActiveAdapter.plugin.name !== name) {
          try {
            console.log(`[AdapterStore] Deactivating current adapter "${currentActiveAdapter.plugin.name}".`);
            await currentActiveAdapter.instance?.deactivate();
            eventBus.emit('adapter:deactivated', { name: currentActiveAdapter.plugin.name, reason: 'switching adapter' });
          } catch (e) {
            console.error(`[AdapterStore] Error deactivating previous adapter "${currentActiveAdapter.plugin.name}":`, e);
            // Continue activation of new adapter despite error in deactivating old one
          }
        }
        
        try {
          // Initialize plugin instance if not already done (lazy initialization)
          if (!pluginReg.instance) {
            // This context would ideally come from a PluginContext provider or be constructed here
            const pluginContext = { /* ... construct or get PluginContext ... */ eventBus, stores: { /* ... references to other stores ... */ }, utils: { /* ... */ }, chrome, logger: console };
            await pluginReg.plugin.initialize(pluginContext as any); // Cast as any for now
            pluginReg.instance = pluginReg.plugin;
            pluginReg.status = 'initialized';
            eventBus.emit('plugin:initialization-complete', { name });
          }

          console.log(`[AdapterStore] Activating adapter "${name}".`);
          await pluginReg.instance!.activate(); // Non-null assertion: instance is set above
          pluginReg.status = 'active';
          pluginReg.lastUsedAt = Date.now();

          set({
            activeAdapterName: name,
            currentCapabilities: pluginReg.plugin.capabilities,
            lastAdapterError: null, // Clear previous errors on successful activation
            registeredPlugins: { ...get().registeredPlugins, [name]: pluginReg } // Update registration with instance and status
          });
          console.log(`[AdapterStore] Adapter "${name}" activated with capabilities:`, pluginReg.plugin.capabilities);
          eventBus.emit('adapter:activated', { name, hostname: window.location.hostname }); // Hostname might need to be more specific
          eventBus.emit('adapter:capability-changed', { name, capabilities: pluginReg.plugin.capabilities });
          return true;
        } catch (error: any) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[AdapterStore] Error activating adapter "${name}":`, error);
          pluginReg.status = 'error';
          pluginReg.error = error;
          set({
            lastAdapterError: { name, error },
            registeredPlugins: { ...get().registeredPlugins, [name]: pluginReg }
          });
          eventBus.emit('plugin:activation-failed', { name, error });
          eventBus.emit('adapter:error', { name, error });
          return false;
        }
      },

      deactivateAdapter: async (name: string, reason?: string): Promise<void> => {
        const pluginReg = get().registeredPlugins[name];
        if (!pluginReg || get().activeAdapterName !== name) {
          console.warn(`[AdapterStore] Adapter "${name}" is not active or not registered.`);
          return;
        }
        try {
          await pluginReg.instance?.deactivate();
          pluginReg.status = 'inactive'; // Or 'initialized' if deactivate means revert to initialized but not active
          set({
            activeAdapterName: null,
            currentCapabilities: [],
            registeredPlugins: { ...get().registeredPlugins, [name]: pluginReg }
          });
          console.log(`[AdapterStore] Adapter "${name}" deactivated. Reason: ${reason || 'user action'}`);
          eventBus.emit('adapter:deactivated', { name, reason: reason || 'user action' });
        } catch (error: any) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[AdapterStore] Error deactivating adapter "${name}":`, error);
          pluginReg.status = 'error';
          pluginReg.error = error;
          set({
            lastAdapterError: { name, error },
            registeredPlugins: { ...get().registeredPlugins, [name]: pluginReg }
          });
          eventBus.emit('adapter:error', { name, error });
        }
      },
      
      getPlugin: (name: string): PluginRegistration | undefined => {
        return get().registeredPlugins[name];
      },

      getActiveAdapter: (): PluginRegistration | undefined => {
        const activeName = get().activeAdapterName;
        return activeName ? get().registeredPlugins[activeName] : undefined;
      },

      updatePluginConfig: (name: string, configUpdate: Partial<PluginRegistration['config']>) => {
        const pluginReg = get().registeredPlugins[name];
        if (pluginReg) {
          pluginReg.config = { ...pluginReg.config, ...configUpdate };
          set(state => ({ 
            registeredPlugins: { ...state.registeredPlugins, [name]: pluginReg }
          }));
          console.log(`[AdapterStore] Config updated for plugin "${name}":`, pluginReg.config);
          // Potentially re-evaluate active adapter if config change affects it (e.g., enabled status)
          if (name === get().activeAdapterName && pluginReg.config.enabled === false) {
            get().deactivateAdapter(name, 'disabled by config update');
          }
        } else {
          console.warn(`[AdapterStore] Cannot update config: Plugin "${name}" not found.`);
        }
      },
      
      setPluginError: (name: string, error: string | Error) => {
        const pluginReg = get().registeredPlugins[name];
        if (pluginReg) {
          pluginReg.status = 'error';
          pluginReg.error = error;
          set(state => ({ 
            registeredPlugins: { ...state.registeredPlugins, [name]: pluginReg },
            lastAdapterError: { name, error },
          }));
        } else { // Error for a plugin not yet in the store (e.g. registration failure before adding to store)
           set({ lastAdapterError: { name, error } });
        }
        console.error(`[AdapterStore] Error set for plugin/adapter "${name}":`, error);
        eventBus.emit('adapter:error', { name, error });
      },
    }),
    { name: 'AdapterStore', store: 'adapter' }
  )
);
