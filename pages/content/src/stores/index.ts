import { useAppStore } from './app.store';
import { useConnectionStore } from './connection.store';
import { useToolStore } from './tool.store';
import { useUIStore } from './ui.store';
import { useAdapterStore } from './adapter.store';
import { useConfigStore } from './config.store';

// Export all stores
export { useAppStore } from './app.store';
export type { AppState } from './app.store';

export { useConnectionStore } from './connection.store';
export type { ConnectionState } from './connection.store';

export { useToolStore } from './tool.store';
export type { ToolState } from './tool.store';

export { useUIStore } from './ui.store';
export type { UIState } from './ui.store';

export { useAdapterStore } from './adapter.store';
export type { AdapterState } from './adapter.store';

export { useConfigStore } from './config.store';
export type { ConfigState, FeatureFlag, UserProperties, NotificationConfig, RemoteNotification } from './config.store';

// Potentially a root store or combined state if needed, though Zustand encourages individual store usage.
// For now, individual exports are fine.

// Example of a combined state selector hook (if needed for components that use multiple stores)
/*
import { shallow } from 'zustand/shallow';

export const useRootStoreState = () => {
  const appState = useAppStore(state => ({ ...state }), shallow);
  const uiState = useUIStore(state => ({ ...state }), shallow);
  // ... other stores

  return {
    app: appState,
    ui: uiState,
    // ... other store states
  };
};
*/

// Function to initialize all stores or trigger their internal initializers if needed.
// This could be part of a larger application initialization sequence.
export async function initializeAllStores(): Promise<void> {
  console.info('[Stores] Initializing all stores...');
  // Some stores might have internal async initialize methods or rely on being called.
  // Example: useAppStore.getState().initialize(); // If app.store has an initialize action
  
  // For stores that don't have an explicit initialize action but might need to be 'activated'
  // simply accessing them might be enough if their creation side effects are sufficient.
  useConnectionStore.getState(); 
  useToolStore.getState();
  useUIStore.getState();
  useAdapterStore.getState();
  
  // Initialize config store with current user properties
  const configStore = useConfigStore.getState();
  configStore.setUserProperties({
    extensionVersion: chrome?.runtime?.getManifest?.()?.version || '0.0.0',
    lastActiveDate: new Date().toISOString(),
    browserVersion: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  
  // AppStore's initialize is more involved, handle it carefully
  // It might depend on other systems like eventBus or pluginRegistry being ready.
  // Consider if it should be called here or by a more central `initializer.ts` module.
  if (!useAppStore.getState().isInitialized) {
    await useAppStore.getState().initialize();
  }
  
  console.info('[Stores] All stores accessed/initialized.');
}
