// hooks/useStores.ts
import { useAppStore } from '../stores/app.store';
import { useConnectionStore } from '../stores/connection.store';
import { useToolStore } from '../stores/tool.store';
import type { AppState } from '../stores/app.store';
import { useUIStore } from '../stores/ui.store';
import { useAdapterStore } from '../stores/adapter.store';
import { useShallow } from 'zustand/shallow';

// Composed store hook for components that need multiple stores
export const useStores = () => {
  const app = useAppStore();
  const connection = useConnectionStore();
  const tools = useToolStore();
  const ui = useUIStore();
  const adapters = useAdapterStore();

  return {
    app,
    connection,
    tools,
    ui,
    adapters
  };
};

// Granular hooks for specific store slices with shallow comparison
// App Store hooks
export const useAppInitialization = () =>
  useAppStore(useShallow(
    (state: AppState) => ({
      isInitialized: state.isInitialized,
      initialize: state.initialize,
      initializationError: state.initializationError,
    })
  ));

export const useGlobalSettings = () =>
  useAppStore(useShallow(
    (state) => ({
      settings: state.globalSettings,
      updateSettings: state.updateSettings
    })
  ));

export const useCurrentSite = () =>
  useAppStore(useShallow(
    (state) => ({
      site: state.currentSite,
      host: state.currentHost,
      setSite: state.setCurrentSite
    })
  ));

export const useConnectionStatus = () =>
  useConnectionStore(useShallow(
    (state) => ({
      status: state.status,
      isConnected: state.status === 'connected',
      isConnecting: state.status === 'connecting',
      isReconnecting: state.isReconnecting,
      error: state.error,
      serverConfig: state.serverConfig,
      lastConnectedAt: state.lastConnectedAt,
      connectionAttempts: state.connectionAttempts,
      maxRetryAttempts: state.serverConfig.retryAttempts
    })
  ));

export const useServerConfig = () =>
  useConnectionStore(useShallow(
    (state) => ({
      config: state.serverConfig,
      setConfig: state.setServerConfig
    })
  ));

export const useAvailableTools = () =>
  useToolStore(useShallow(
    (state) => ({
      tools: state.availableTools,
      setAvailableTools: state.setAvailableTools
    })
  ));

export const useDetectedTools = () =>
  useToolStore(useShallow(
    (state) => ({
      tools: state.detectedTools,
      addTool: state.addDetectedTool,
      clearTools: state.clearDetectedTools
    })
  ));

export const useToolExecution = () =>
  useToolStore(useShallow(
    (state) => ({
      executions: state.toolExecutions,
      isExecuting: state.isExecuting,
      lastExecutionId: state.lastExecutionId,
      startExecution: state.startToolExecution,
      updateExecution: state.updateToolExecution,
      completeExecution: state.completeToolExecution,
      getExecution: state.getToolExecution
    })
  ));

// Additional Tool Store hooks
export const useToolActions = () =>
  useToolStore(useShallow(
    (state) => ({
      getExecution: state.getToolExecution
    })
  ));

// UI Store hooks
export const useSidebar = () =>
  useUIStore(useShallow(
    (state) => ({
      isVisible: state.sidebar.isVisible,
      width: state.sidebar.width,
      isMinimized: state.sidebar.isMinimized,
      position: state.sidebar.position,
      toggle: state.toggleSidebar,
      toggleMinimize: state.toggleMinimize,
      resize: state.resizeSidebar,
      setVisibility: state.setSidebarVisibility
    })
  ));

export const useTheme = () =>
  useUIStore(useShallow(
    (state) => ({
      theme: state.theme,
      setTheme: state.setTheme
    })
  ));

export const useNotifications = () =>
  useUIStore(useShallow(
    (state) => ({
      notifications: state.notifications,
      addNotification: state.addNotification,
      removeNotification: state.removeNotification,
      clearNotifications: state.clearNotifications
    })
  ));

export const usePreferences = () =>
  useUIStore(useShallow(
    (state) => ({
      preferences: state.preferences,
      updatePreferences: state.updatePreferences
    })
  ));

export const useUILoading = () =>
  useUIStore(useShallow(
    (state) => ({
      isLoading: state.isLoading,
      setLoading: state.setGlobalLoading
    })
  ));

export const useUIError = () =>
  useUIStore(useShallow(
    (state) => ({
      activeModal: state.activeModal,
      openModal: state.openModal,
      closeModal: state.closeModal
    })
  ));

// Additional UI Store hooks - using more descriptive names
export const useSidebarState = () =>
  useUIStore(useShallow(
    (state) => ({
      isVisible: state.sidebar.isVisible,
      isMinimized: state.sidebar.isMinimized,
      position: state.sidebar.position,
      width: state.sidebar.width,
      toggleSidebar: state.toggleSidebar,
      toggleMinimize: state.toggleMinimize,
      resizeSidebar: state.resizeSidebar,
      setSidebarVisibility: state.setSidebarVisibility
    })
  ));

export const useUserPreferences = () =>
  useUIStore(useShallow(
    (state) => ({
      preferences: state.preferences,
      updatePreferences: state.updatePreferences
    })
  ));

export const useModal = () =>
  useUIStore(useShallow(
    (state) => ({
      activeModal: state.activeModal,
      openModal: state.openModal,
      closeModal: state.closeModal
    })
  ));

// Adapter Store hooks
export const useAdapterStatus = () =>
  useAdapterStore(useShallow(
    (state) => ({
      activeAdapterName: state.activeAdapterName,
      currentCapabilities: state.currentCapabilities,
      lastError: state.lastAdapterError,
      getActiveAdapter: state.getActiveAdapter
    })
  ));

export const useActiveAdapter = () =>
  useAdapterStore(useShallow(
    (state) => {
      const activeAdapterRegistration = state.getActiveAdapter();
      return {
        activeAdapterName: state.activeAdapterName,
        activeAdapterRegistration,
        plugin: activeAdapterRegistration?.plugin,
        status: activeAdapterRegistration?.status,
        currentCapabilities: state.currentCapabilities,
        error: state.lastAdapterError
      };
    }
  ));

export const useRegisteredAdapters = () =>
  useAdapterStore(useShallow(
    (state) => ({
      registeredPlugins: state.registeredPlugins,
      adapters: Object.values(state.registeredPlugins).map(reg => ({
        name: reg.plugin.name,
        plugin: reg.plugin,
        config: reg.config,
        status: reg.status,
        error: reg.error,
        registeredAt: reg.registeredAt,
        lastUsedAt: reg.lastUsedAt
      })),
      registerPlugin: state.registerPlugin,
      unregisterPlugin: state.unregisterPlugin
    })
  ));

// Performance-optimized hooks for specific use cases
export const useConnectionHealth = () =>
  useConnectionStore(useShallow(
    (state) => ({
      lastConnectedAt: state.lastConnectedAt
    })
  ));

export const useAppError = () =>
  useAppStore(useShallow(
    (state) => ({
      error: state.initializationError,
      resetState: state.resetState
    })
  ));

// Combined hooks for common patterns
export const useAppStatus = () => {
  const { isInitialized, initializationError } = useAppInitialization();
  const { status: connectionStatus, isConnected } = useConnectionStatus();
  const { activeAdapterName, currentCapabilities } = useAdapterStatus();

  return {
    isAppInitialized: isInitialized,
    initializationError,
    connectionStatus,
    isConnected,
    activeAdapterName,
    currentCapabilities,
    isFullyReady: isInitialized && isConnected && !!activeAdapterName
  };
};

export const useToolManagement = () => {
  const { tools: availableTools } = useAvailableTools();
  const { tools: detectedTools, addTool, clearTools } = useDetectedTools();
  const { executions, startExecution } = useToolExecution();

  return {
    availableTools,
    detectedTools,
    executions,
    addTool,
    clearTools,
    startExecution,
    totalTools: availableTools.length + detectedTools.length
  };
};

export const useUIState = () => {
  const { isVisible: sidebarVisible, width: sidebarWidth } = useSidebar();
  const { theme } = useTheme();
  const { notifications } = useNotifications();
  const { isLoading } = useUILoading();
  const { activeModal } = useUIError();

  return {
    sidebarVisible,
    sidebarWidth,
    theme,
    notifications,
    isLoading,
    activeModal,
    hasNotifications: notifications.length > 0,
    hasActiveModal: !!activeModal
  };
};

// Utility hook for getting all store states (use sparingly)
export const useAllStoreStates = () => ({
  app: useAppStore.getState(),
  connection: useConnectionStore.getState(),
  tools: useToolStore.getState(),
  ui: useUIStore.getState(),
  adapters: useAdapterStore.getState()
});

// Legacy compatibility - these should be deprecated in favor of specific hooks
export const useAppState = () => useAppStore();
export const useConnectionState = () => useConnectionStore();
export const useToolState = () => useToolStore();
export const useUIStoreState = () => useUIStore();
export const useAdapterState = () => useAdapterStore();
