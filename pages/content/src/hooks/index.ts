// hooks/index.ts

// Store hooks
export {
  useStores,
  useAppInitialization,
  useGlobalSettings,
  useCurrentSite,
  useConnectionStatus,
  useServerConfig,
  useAvailableTools,
  useDetectedTools,
  useToolExecution,
  useToolActions,
  useSidebar,
  useSidebarState,
  useUserPreferences,
  useMCPState,
  useTheme,
  useNotifications,
  usePreferences,
  useModal,
  useActiveAdapter,
  useRegisteredAdapters,
  useAdapterStatus,
  useConnectionHealth,
  useAppError,
  useUILoading,
  useUIError,
  useAllStoreStates
} from './useStores';

// Event hooks
export {
  useEventListener,
  useEventEmitter,
  useEventOnce,
  useEventSync,
  useConditionalEventListener,
  useMultipleEventListeners
} from './useEventBus';

// Adapter hooks
export {
  useCurrentAdapter,
  useAdapterManagement,
  useAdapterCapabilities,
  useAdapterStatus as useAdapterStatusMonitoring,
  useAutoAdapterSwitching
} from './useAdapter';

// Adapter bridge hooks for compatibility
export {
  useSiteAdapterBridge,
  useCompatibleSiteAdapter
} from './useAdapterBridge';

// Utility hooks (re-export existing ones)
export { useShadowDomStyles } from './useShadowDomStyles';

// Sidebar plugin hooks
export {
  useSidebarPlugin,
  useSidebarPluginStatus,
  useSidebarPluginManagement
} from './useSidebarPlugin';

// TODO: Add these hooks when implemented
// export { usePerformanceMonitor } from './usePerformance';
// export { useErrorHandler } from './useErrorHandler';
