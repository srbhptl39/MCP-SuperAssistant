# React Hooks

This directory contains React hooks that provide integration between the Zustand store system and React components. These hooks enable clean, performant, and type-safe access to the plugin system and application state.

## Overview

The hooks system bridges the gap between the Zustand-based architecture and React components, providing optimized subscriptions and convenient APIs for common operations. **Session 6 & 7 Implementation Complete ✅**

## Hook Categories

### Store Hooks (`useStores.ts`) ✅

Store hooks provide optimized access to Zustand stores with automatic re-rendering when relevant state changes.

#### App Store Hooks
- `useAppInitialization()`: App initialization state and methods
- `useGlobalSettings()`: Global settings management
- `useCurrentSite()`: Current site and hostname tracking

#### Connection Store Hooks
- `useConnectionStatus()`: MCP connection status and health
- `useServerConfig()`: Server configuration management
- `useConnectionHealth()`: Connection health metrics

#### Tool Store Hooks
- `useAvailableTools()`: Available MCP tools
- `useDetectedTools()`: Tools detected on current page
- `useToolExecution()`: Tool execution tracking
- `useToolActions()`: Tool execution methods

#### UI Store Hooks
- `useSidebar()`: Sidebar state and controls
- `useSidebarState()`: Detailed sidebar state
- `useTheme()`: Theme management
- `useNotifications()`: Notification system
- `useModal()`: Modal dialog management
- `useUserPreferences()`: User preference management

#### Adapter Store Hooks
- `useActiveAdapter()`: Currently active adapter information
- `useRegisteredAdapters()`: All registered adapters
- `useAdapterStatus()`: Adapter status monitoring

### Event Hooks (`useEventBus.ts`) ✅

Event hooks provide type-safe integration with the event bus system.

#### Core Event Hooks
- `useEventListener<K>()`: Listen to specific events with automatic cleanup
- `useEventEmitter()`: Emit events with type safety
- `useEventOnce<K>()`: One-time event listening
- `useEventSync<T, K>()`: Sync state with events
- `useConditionalEventListener<K>()`: Conditional event listening
- `useMultipleEventListeners()`: Multiple event subscriptions

#### Usage Examples

```typescript
// Listen to adapter activation events
useEventListener('adapter:activated', (data) => {
  console.log('Adapter activated:', data.pluginName);
});

// Emit tool execution events
const emit = useEventEmitter();
emit('tool:execution-started', { toolName: 'insertText', callId: 'abc123' });

// One-time initialization listener
useEventOnce('app:initialized', (data) => {
  console.log('App initialized at:', data.timestamp);
});
```

### Adapter Hooks (`useAdapter.ts`) ✅

Adapter hooks provide high-level APIs for working with the plugin system.

#### Core Adapter Hooks

##### `useCurrentAdapter()`
Provides access to the currently active adapter and its methods:

```typescript
const {
  activeAdapterName,    // Name of active adapter
  plugin,              // Adapter plugin instance
  status,              // Current status
  error,               // Any error state
  capabilities,        // Available capabilities
  insertText,          // Text insertion method
  submitForm,          // Form submission method
  attachFile,          // File attachment method
  hasCapability,       // Capability checker
  isReady             // Ready state
} = useCurrentAdapter();
```

##### `useAdapterManagement()`
Provides adapter lifecycle management:

```typescript
const {
  adapters,                    // All registered adapters
  registerPlugin,              // Register new adapter
  unregisterPlugin,            // Unregister adapter
  activateAdapter,             // Activate specific adapter
  deactivateCurrentAdapter,    // Deactivate current adapter
  getAdapterForHostname       // Find adapter for hostname
} = useAdapterManagement();
```

##### `useAdapterCapabilities()`
Provides capability checking utilities:

```typescript
const {
  availableCapabilities,       // Array of capabilities
  supportsTextInsertion,       // Boolean checks
  supportsFormSubmission,
  supportsFileUpload,
  supportsUrlNavigation,
  supportsElementSelection,
  supportsScreenshotCapture,
  supportsDomManipulation,
  hasAnyCapability
} = useAdapterCapabilities();
```

##### `useAdapterStatus()`
Provides adapter event monitoring:

```typescript
const {
  adapterEvents,         // Event history
  eventCount,           // Total events
  clearEvents,          // Clear event history
  getEventsForAdapter   // Filter events by adapter
} = useAdapterStatus();
```

##### `useAutoAdapterSwitching()`
Provides automatic adapter switching based on site changes:

```typescript
const {
  enabled,              // Whether auto-switching is enabled
  activeAdapterName     // Currently active adapter
} = useAutoAdapterSwitching(true);
```

### Utility Hooks

#### `useShadowDomStyles.ts` ✅
Provides shadow DOM styling utilities for isolated component rendering.

## Hook Index (`index.ts`) ✅

The index file provides a centralized export point for all hooks:

```typescript
// Store hooks
export {
  useStores,
  useAppInitialization,
  useGlobalSettings,
  // ... all store hooks
} from './useStores';

// Event hooks
export {
  useEventListener,
  useEventEmitter,
  // ... all event hooks
} from './useEventBus';

// Adapter hooks
export {
  useCurrentAdapter,
  useAdapterManagement,
  // ... all adapter hooks
} from './useAdapter';
```

## Usage Patterns

### Basic Component Integration

```typescript
import { useCurrentAdapter, useEventListener } from '@src/hooks';

function ToolButtons() {
  const { insertText, submitForm, isReady } = useCurrentAdapter();
  
  // Listen for tool completion
  useEventListener('tool:execution-completed', (data) => {
    console.log('Tool completed:', data.execution.toolName);
  });
  
  const handleInsert = async () => {
    if (isReady) {
      await insertText('Hello World!');
    }
  };
  
  return (
    <div>
      <button onClick={handleInsert} disabled={!isReady}>
        Insert Text
      </button>
      <button onClick={submitForm} disabled={!isReady}>
        Submit Form
      </button>
    </div>
  );
}
```

### Advanced Adapter Management

```typescript
import { useAdapterManagement, useAdapterCapabilities } from '@src/hooks';

function AdapterControls() {
  const { adapters, activateAdapter } = useAdapterManagement();
  const { availableCapabilities } = useAdapterCapabilities();
  
  return (
    <div>
      <h3>Available Adapters</h3>
      {adapters.map(adapter => (
        <div key={adapter.name}>
          <button onClick={() => activateAdapter(adapter.name)}>
            Activate {adapter.name}
          </button>
          <span>Capabilities: {adapter.plugin.capabilities.join(', ')}</span>
        </div>
      ))}
      
      <h3>Current Capabilities</h3>
      <ul>
        {availableCapabilities.map(cap => (
          <li key={cap}>{cap}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Event-Driven Components

```typescript
import { useEventListener, useEventEmitter } from '@src/hooks';

function EventMonitor() {
  const [events, setEvents] = useState([]);
  const emit = useEventEmitter();
  
  // Monitor all tool executions
  useEventListener('tool:execution-started', (data) => {
    setEvents(prev => [...prev, { type: 'started', ...data }]);
  });
  
  useEventListener('tool:execution-completed', (data) => {
    setEvents(prev => [...prev, { type: 'completed', ...data }]);
  });
  
  const triggerTest = () => {
    emit('tool:execution-started', {
      toolName: 'test',
      callId: Date.now().toString()
    });
  };
  
  return (
    <div>
      <button onClick={triggerTest}>Trigger Test Event</button>
      <ul>
        {events.map((event, index) => (
          <li key={index}>{event.type}: {event.toolName}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Performance Optimization

### Shallow Comparison

All store hooks use `useShallow` for performance optimization:

```typescript
export const useGlobalSettings = () =>
  useAppStore(useShallow(
    (state) => ({
      settings: state.globalSettings,
      updateSettings: state.updateSettings
    })
  ));
```

### Selective Subscriptions

Components only re-render when specific state slices change:

```typescript
// Only re-renders when sidebar visibility changes
const { isVisible } = useSidebarState();

// Only re-renders when connection status changes
const { status } = useConnectionStatus();
```

### Event Cleanup

Event hooks automatically clean up subscriptions:

```typescript
useEventListener('some:event', callback); // Automatically cleaned up on unmount
```

## Testing

### Hook Testing

```typescript
import { renderHook } from '@testing-library/react';
import { useCurrentAdapter } from '@src/hooks';

test('useCurrentAdapter returns correct data', () => {
  const { result } = renderHook(() => useCurrentAdapter());
  
  expect(result.current.isReady).toBeDefined();
  expect(typeof result.current.insertText).toBe('function');
});
```

### Mock Integration

```typescript
// Mock adapter for testing
const mockAdapter = {
  name: 'TestAdapter',
  insertText: jest.fn().mockResolvedValue(true),
  submitForm: jest.fn().mockResolvedValue(true)
};
```

## Best Practices

### 1. **Use Specific Hooks**
Prefer specific hooks over general ones for better performance:

```typescript
// Good
const { isVisible } = useSidebarState();

// Less optimal
const { ui } = useStores();
const isVisible = ui.sidebar.isVisible;
```

### 2. **Handle Loading States**
Always check for ready states:

```typescript
const { isReady, insertText } = useCurrentAdapter();

if (!isReady) {
  return <Loading />;
}
```

### 3. **Event Cleanup**
Event hooks handle cleanup automatically, but be mindful of dependencies:

```typescript
useEventListener('event', callback, [dependency1, dependency2]);
```

### 4. **Type Safety**
Use TypeScript for full type safety:

```typescript
useEventListener('tool:execution-completed', (data) => {
  // data is fully typed
  console.log(data.execution.toolName);
});
```

## Future Enhancements

### Planned Features
- **Performance hooks**: `usePerformanceMonitor`
- **Error handling hooks**: `useErrorHandler`
- **Cache hooks**: `useCachedData`
- **Animation hooks**: `useTransition`

### Development Tools
- Hook debugging utilities
- Performance profiling
- State visualization
- Event flow monitoring

The hooks system provides a powerful and flexible foundation for building reactive UI components that integrate seamlessly with the plugin architecture.
