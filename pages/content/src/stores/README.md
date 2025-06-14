# Zustand State Management Stores

This directory contains all Zustand state management stores for the MCP-SuperAssistant content script. The stores provide centralized, reactive, and type-safe state management with optimal performance characteristics.

## Overview

Each store manages a specific domain of application state using Zustand's lightweight and flexible architecture. The stores integrate seamlessly with the plugin system and event bus for comprehensive state management. **Session 5-7 Implementation Complete ✅**

## Store Architecture

### Core Principles
- **Single Source of Truth**: Each domain has one authoritative store
- **Immutable Updates**: State changes through pure functions
- **Type Safety**: Full TypeScript integration with strict typing
- **Performance**: Minimal re-renders through selective subscriptions
- **Event Integration**: Automatic synchronization with event bus
- **Persistence**: Configurable state persistence across sessions

### Store Structure
```typescript
interface StoreType {
  // State properties
  data: DataType;
  status: StatusType;
  error: ErrorType | null;
  
  // Action methods
  initialize: () => Promise<void>;
  update: (data: Partial<DataType>) => void;
  reset: () => void;
  
  // Computed properties
  get isReady(): boolean;
}
```

## Available Stores

### `app.store.ts` - Application Store ✅
**Purpose**: Global application-level state and lifecycle management

**State**:
- `isInitialized`: Application initialization status
- `version`: Current application version
- `currentSite`: Current website/hostname
- `currentHost`: Current host domain
- `globalSettings`: Global user preferences
- `initializationError`: Initialization error state

**Actions**:
- `initialize()`: Initialize application
- `setCurrentSite(site, host)`: Update current site
- `updateSettings(settings)`: Update global settings
- `resetState()`: Reset to initial state

**Integration**: Syncs with `app:*` events

### `adapter.store.ts` - Adapter Store ✅
**Purpose**: Plugin adapter system state and management

**State**:
- `registeredPlugins`: Map of all registered adapter plugins
- `activeAdapterName`: Currently active adapter name
- `currentCapabilities`: Available capabilities from active adapter
- `lastAdapterError`: Most recent adapter error

**Actions**:
- `registerPlugin(plugin, config)`: Register new adapter
- `unregisterPlugin(name)`: Remove adapter
- `setActiveAdapter(name)`: Set active adapter
- `updateCapabilities(capabilities)`: Update current capabilities
- `setAdapterError(error)`: Set error state

**Integration**: Syncs with `adapter:*` and `plugin:*` events

### `connection.store.ts` - Connection Store ✅
**Purpose**: MCP server connection state and health monitoring

**State**:
- `status`: Connection status (connected/disconnected/connecting/error)
- `serverUrl`: Current server URL
- `lastConnectedAt`: Last successful connection timestamp
- `connectionAttempts`: Failed connection attempt count
- `error`: Connection error information
- `isReconnecting`: Reconnection attempt status

**Actions**:
- `connect(url)`: Establish connection
- `disconnect()`: Close connection
- `setStatus(status)`: Update connection status
- `setError(error)`: Set connection error
- `incrementAttempts()`: Track connection attempts
- `forceReconnect()`: Force reconnection

**Integration**: Syncs with `connection:*` events

### `tool.store.ts` - Tool Store ✅
**Purpose**: MCP tool management and execution tracking

**State**:
- `availableTools`: List of available MCP tools
- `detectedTools`: Tools detected on current page
- `executionHistory`: History of tool executions
- `executingTools`: Currently executing tools
- `isRefreshing`: Tool list refresh status

**Actions**:
- `setAvailableTools(tools)`: Update available tools
- `addDetectedTool(tool)`: Add detected tool
- `startExecution(execution)`: Start tool execution
- `completeExecution(execution)`: Complete tool execution
- `failExecution(execution, error)`: Mark execution as failed
- `refreshTools()`: Refresh tool list

**Integration**: Syncs with `tool:*` events

### `ui.store.ts` - UI Store ✅
**Purpose**: User interface state and interaction management

**State**:
- `sidebar`: Sidebar visibility and configuration
- `theme`: Current theme settings
- `notifications`: Active notifications
- `modals`: Modal dialog state
- `preferences`: UI preferences
- `isLoading`: Loading states for various operations

**Actions**:
- `toggleSidebar()`: Toggle sidebar visibility
- `setSidebarWidth(width)`: Set sidebar width
- `setTheme(theme)`: Update theme
- `addNotification(notification)`: Add notification
- `removeNotification(id)`: Remove notification
- `updatePreferences(prefs)`: Update UI preferences

**Integration**: Syncs with `ui:*` events

## Store Composition (`index.ts`) ✅

The index file provides centralized access to all stores:

```typescript
// Individual store exports
export { useAppStore } from './app.store';
export { useConnectionStore } from './connection.store';
export { useToolStore } from './tool.store';
export { useUIStore } from './ui.store';
export { useAdapterStore } from './adapter.store';

// Type exports
export type * from './types';

// Composed store access
export const useAllStores = () => ({
  app: useAppStore(),
  connection: useConnectionStore(),
  tools: useToolStore(),
  ui: useUIStore(),
  adapters: useAdapterStore()
});
```

## Usage Patterns

### Basic State Access

```typescript
import { useAppStore } from '@src/stores';

function MyComponent() {
  // Subscribe to specific state slice
  const isInitialized = useAppStore(state => state.isInitialized);
  const globalSettings = useAppStore(state => state.globalSettings);
  
  return <div>App Status: {isInitialized ? 'Ready' : 'Loading'}</div>;
}
```

### Action Execution

```typescript
import { useAdapterStore } from '@src/stores';

function AdapterControl() {
  const setActiveAdapter = useAdapterStore(state => state.setActiveAdapter);
  const activeAdapterName = useAdapterStore(state => state.activeAdapterName);
  
  const handleSwitch = async () => {
    await setActiveAdapter('DefaultAdapter');
  };
  
  return (
    <button onClick={handleSwitch}>
      Switch to Default (Current: {activeAdapterName})
    </button>
  );
}
```

### Optimized Subscriptions

```typescript
import { useShallow } from 'zustand/shallow';
import { useUIStore } from '@src/stores';

function SidebarControls() {
  // Only re-renders when sidebar state changes
  const { isVisible, width, toggleSidebar, setSidebarWidth } = useUIStore(
    useShallow(state => ({
      isVisible: state.sidebar.isVisible,
      width: state.sidebar.width,
      toggleSidebar: state.toggleSidebar,
      setSidebarWidth: state.setSidebarWidth
    }))
  );
  
  return (
    <div>
      <button onClick={toggleSidebar}>
        {isVisible ? 'Hide' : 'Show'} Sidebar
      </button>
      <input 
        type="range" 
        value={width} 
        onChange={(e) => setSidebarWidth(Number(e.target.value))}
      />
    </div>
  );
}
```

### Cross-Store Operations

```typescript
import { useAppStore, useAdapterStore } from '@src/stores';

function StatusDisplay() {
  const appInitialized = useAppStore(state => state.isInitialized);
  const adapterReady = useAdapterStore(state => !!state.activeAdapterName);
  
  const isReady = appInitialized && adapterReady;
  
  return (
    <div className={isReady ? 'ready' : 'not-ready'}>
      Status: {isReady ? 'Ready' : 'Initializing...'}
    </div>
  );
}
```

## Event Integration

### Automatic Synchronization

Stores automatically sync with the event bus:

```typescript
// In adapter.store.ts
eventBus.on('adapter:activated', ({ pluginName }) => {
  set(state => ({
    ...state,
    activeAdapterName: pluginName,
    lastAdapterError: null
  }));
});

eventBus.on('adapter:error', ({ name, error }) => {
  set(state => ({
    ...state,
    lastAdapterError: { name, error, timestamp: Date.now() }
  }));
});
```

### Manual Event Emission

```typescript
// Actions can emit events
const setActiveAdapter = async (name: string) => {
  try {
    // Update state
    set(state => ({ ...state, activeAdapterName: name }));
    
    // Emit event
    eventBus.emit('adapter:activated', { 
      pluginName: name, 
      timestamp: Date.now() 
    });
  } catch (error) {
    eventBus.emit('adapter:error', { name, error });
  }
};
```

## Performance Optimization

### Selective Subscriptions

```typescript
// Good - only subscribes to specific state
const isVisible = useUIStore(state => state.sidebar.isVisible);

// Less optimal - subscribes to entire store
const store = useUIStore();
const isVisible = store.sidebar.isVisible;
```

### Shallow Comparison

```typescript
// Use shallow comparison for object subscriptions
const sidebarState = useUIStore(
  useShallow(state => state.sidebar)
);
```

### Computed Properties

```typescript
// Use computed properties for derived state
const isReady = useAppStore(state => 
  state.isInitialized && !state.initializationError
);
```

## Persistence

### Configurable Persistence

```typescript
// Stores can be configured with persistence
export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Store implementation
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          globalSettings: state.globalSettings
        })
      }
    )
  )
);
```

### Storage Options

- **localStorage**: For user preferences
- **sessionStorage**: For temporary state
- **chrome.storage**: For extension-specific data

## Development Tools

### Zustand DevTools

```typescript
export const useAppStore = create<AppState>()(
  devtools(
    // Store implementation
    { name: 'AppStore' }
  )
);
```

### Debug Utilities

```typescript
// Access store state in console
window.__stores = {
  app: useAppStore.getState(),
  adapter: useAdapterStore.getState(),
  // ... other stores
};
```

## Testing

### Store Testing

```typescript
import { useAppStore } from '@src/stores';

describe('AppStore', () => {
  beforeEach(() => {
    useAppStore.getState().resetState();
  });
  
  test('initializes correctly', async () => {
    const { initialize } = useAppStore.getState();
    await initialize();
    
    expect(useAppStore.getState().isInitialized).toBe(true);
  });
});
```

### Mock Stores

```typescript
// Create mock store for testing
const mockAppStore = create(() => ({
  isInitialized: true,
  version: '1.0.0',
  initialize: jest.fn()
}));
```

## Best Practices

### 1. **State Structure**
Keep state normalized and flat when possible:

```typescript
// Good
interface ToolState {
  tools: Record<string, Tool>;
  activeToolId: string | null;
}

// Less optimal
interface ToolState {
  activeTool: Tool | null;
  otherTools: Tool[];
}
```

### 2. **Action Design**
Make actions focused and predictable:

```typescript
// Good - single responsibility
const setActiveAdapter = (name: string) => { /* ... */ };
const clearAdapterError = () => { /* ... */ };

// Less optimal - multiple responsibilities
const updateAdapter = (name?: string, clearError?: boolean) => { /* ... */ };
```

### 3. **Error Handling**
Always handle errors in actions:

```typescript
const connectToServer = async (url: string) => {
  try {
    set(state => ({ ...state, status: 'connecting' }));
    await actualConnect(url);
    set(state => ({ ...state, status: 'connected', error: null }));
  } catch (error) {
    set(state => ({ 
      ...state, 
      status: 'error', 
      error: error.message 
    }));
  }
};
```

### 4. **Type Safety**
Use strict TypeScript types:

```typescript
interface AppState {
  readonly isInitialized: boolean;
  readonly version: string;
  readonly currentSite: string | null;
  
  initialize(): Promise<void>;
  setCurrentSite(site: string): void;
}
```

## Directory Structure

```
stores/
├── README.md                    # This file
├── index.ts                     # Store exports and composition
├── app.store.ts                 # Application state
├── adapter.store.ts             # Plugin adapter state
├── connection.store.ts          # MCP connection state
├── tool.store.ts                # Tool management state
└── ui.store.ts                  # UI state management
```

The Zustand store system provides a robust foundation for state management with excellent performance characteristics, type safety, and seamless integration with the plugin architecture.
    ```

    If using React components, you'd typically call the hook directly in your component:
    ```typescript
    function MyComponent() {
      const appVersion = useAppStore((state) => state.version);
      const setAppMode = useAppStore((state) => state.setAppMode);

      return (
        <div>
          <p>Version: {appVersion}</p>
          <button onClick={() => setAppMode('idle')}>Set Idle Mode</button>
        </div>
      );
    }
    ```

## Best Practices

- **Keep stores focused**: Each store should manage a distinct domain of state.
- **Immutability**: When updating state, ensure to do so immutably (the state library usually handles this).
- **Selectors**: Use selectors to derive specific pieces of state. This helps in optimizing re-renders if used in UI components.
- **Actions for mutations**: All state changes should be performed through actions defined in the store to maintain predictability.

This centralized state management approach is crucial for building a robust and maintainable application, especially as complexity grows.
