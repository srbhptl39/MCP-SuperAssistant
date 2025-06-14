import type { DetectedTool, ToolExecution, ConnectionStatus, UserPreferences, Notification, GlobalSettings, Tool } from '../types/stores';
import type { AdapterConfig } from '../plugins/plugin-types'; // Added for plugin:config-updated

export interface EventMap {
  // App lifecycle events
  'app:initialized': { version: string; timestamp: number; initializationTime?: number };
  'app:initialization-failed': { error: Error; timestamp: number; initializationTime?: number };
  'app:shutdown': { reason: string; timestamp?: number };
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
  'plugin:activated': { pluginName: string; timestamp: number };
  'plugin:deactivated': { pluginName: string; timestamp: number };
  'plugin:activation-failed': { name: string; error: string | Error };
  'plugin:initialization-complete': { name: string };
  'plugin:activation-requested': { pluginName: string; timestamp: number };
  'plugin:deactivation-requested': { pluginName: string; timestamp: number };
  'plugin:config-updated': { name: string; config: AdapterConfig; timestamp: number };

  // Performance events
  'performance:measurement': { name: string; duration: number; timestamp: number; context?: Record<string, any> };
  'performance:memory-usage': { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  'performance:memory-leak-detected': { snapshots: any[]; trend: number[] };
  'performance:slow-operation': { name: string; duration: number; timestamp: number; context?: Record<string, any> };

  // Error events
  'error:unhandled': { error: Error; context?: string | Record<string, any> };
  'error:recovery-attempted': { error: string | Error; strategy: string };
  'error:circuit-breaker-opened': { operation: string; state: string; error: Error; failureCount: number; nextAttemptTime: number; stats: any };
  'error:circuit-breaker-closed': { operation: string; state: string; stats: any };
  'error:circuit-breaker-blocked': { operation: string; state: string; nextAttemptTime: number; error: Error };
  'error:circuit-breaker-half-open': { operation: string; state: string };
  'error:circuit-breaker-forced-open': { state: string; nextAttemptTime: number };
  'error:circuit-breaker-forced-closed': { state: string };

  // Context bridge events
  'context:message-received': { message: any; sender: any };
  'context:tab-updated': { tabId: number; url: string; changeInfo: any };
  'context:broadcast': { event: string; data: any; excludeOrigin?: string };

  // Additional error and recovery events
  'error:breadcrumb': { message: string; category: string; data?: Record<string, any>; timestamp: number };
  'error:pattern-detected': { pattern: string; count: number; error: Error; context: any };
  'component:reset': { component?: string };
  'app:fallback-mode': { reason: string };
  
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
