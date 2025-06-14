import type { DetectedTool, ToolExecution, ConnectionStatus, UserPreferences, Notification, GlobalSettings, Tool } from '../types/stores';
import type { AdapterConfig } from '../plugins/plugin-types'; // Added for plugin:config-updated

export interface EventMap {
  // App lifecycle events
  'app:initialized': { version: string; timestamp: number };
  'app:shutdown': { reason: string };
  'app:site-changed': { site: string; hostname: string };
  'app:settings-updated': { settings: Partial<GlobalSettings> };

  // Connection events
  'connection:status-changed': { status: ConnectionStatus; error?: string };
  'connection:attempt': { attempt: number; maxAttempts: number };
  'connection:heartbeat': { timestamp: number };
  'connection:error': { error: string; code?: string | number };

  // Tool events
  'tool:detected': { tools: DetectedTool[]; source: string };
  'tool:execution-started': { toolName: string; callId: string };
  'tool:execution-completed': { execution: ToolExecution };
  'tool:execution-failed': { toolName: string; error: string; callId: string };
  'tool:list-updated': { tools: Tool[] };

  // UI events
  'ui:sidebar-toggle': { visible: boolean; reason?: string };
  'ui:sidebar-resize': { width: number };
  'ui:theme-changed': { theme: GlobalSettings['theme'] };
  'ui:notification-added': { notification: Notification };
  'ui:notification-removed': { id: string };
  'ui:preferences-updated': { preferences: UserPreferences };

  // Adapter events
  'adapter:activated': { pluginName: string; timestamp: number };
  'adapter:deactivated': { pluginName: string; reason?: string; timestamp: number };
  'adapter:error': { name: string; error: string | Error };
  'adapter:capability-changed': { name: string; capabilities: string[] };

  // Plugin events
  'plugin:registry-initialized': { timestamp: number; registeredPlugins: number };
  'plugin:registered': { name: string; version: string };
  'plugin:unregistered': { name: string };
  'plugin:activation-failed': { name: string; error: string | Error };
  'plugin:initialization-complete': { name: string };
  'plugin:activation-requested': { pluginName: string; timestamp: number };
  'plugin:deactivation-requested': { pluginName: string; timestamp: number };
  'plugin:config-updated': { name: string; config: AdapterConfig; timestamp: number };

  // Performance events
  'performance:measurement': { name: string; duration: number; timestamp: number; context?: Record<string, any> };
  'performance:memory-usage': { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };

  // Error events
  'error:unhandled': { error: Error; context?: string | Record<string, any> };
  'error:recovery-attempted': { error: string | Error; strategy: string };
  'error:circuit-breaker-opened': { service: string; failureCount: number; duration?: number };
  'error:circuit-breaker-closed': { service: string };
  
  // Test event (example from migration guide)
  'test:event': Record<string, never> | object | undefined;
}

// Callback for specific, named events
export type TypedEventCallback<K extends keyof EventMap> = (data: EventMap[K]) => void | Promise<void>;

// Payload structure for wildcard listeners
export interface WildcardEvent<E extends keyof EventMap = keyof EventMap> {
  event: E;
  data: EventMap[E];
}

// Callback for wildcard listeners that receive the event name along with data
export type WildcardEventCallback = (payload: WildcardEvent) => void | Promise<void>;

// Generic event callback type - used by useEventBus
export type EventCallback<T> = (data: T) => void | Promise<void>;

export type UnsubscribeFunction = () => void;
