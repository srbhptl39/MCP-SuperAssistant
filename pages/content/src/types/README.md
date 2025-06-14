# Types Directory

This directory contains comprehensive TypeScript type definitions and interfaces used throughout the MCP SuperAssistant extension, organized by functional domain to ensure type safety and consistency.

## Architecture Integration

The types system is integrated with the modern plugin architecture, providing type safety for:
- **Plugin System**: Adapter interfaces, plugin registrations, and capability definitions
- **State Management**: Zustand store types and state interfaces
- **Event System**: Typed event definitions and payload structures
- **React Hooks**: Hook return types and parameter interfaces

## Files

### mcp.ts

Contains all types and interfaces related to the Model Context Protocol (MCP) functionality:

- **Primitive Types**: `PrimitiveType`, `PrimitiveValue`, and `Primitive` define the structure of primitives returned by the MCP server.
- **Tool Interface**: Defines the structure of tools for UI display and communication.
- **Callback Types**: `ToolCallCallback` and `ConnectionStatusCallback` for handling MCP operations.
- **Request Tracking**: `ToolCallRequest` for tracking tool call requests.
- **Component Props**: `AvailableToolsProps` for the AvailableTools component.
- **Communication Interface**: `BackgroundCommunication` for the background communication hook.
- **Connection Status**: Includes `isReconnecting` property to track reconnection status.

### Plugin Types (if present)

Types related to the plugin system:
- **Adapter Interfaces**: Base adapter capabilities and implementation requirements
- **Plugin Registry**: Plugin registration and management types
- **Site Detection**: URL pattern matching and site identification types

### Store Types (if present)

Types for Zustand state management:
- **Store Interfaces**: Individual store state and action types
- **State Selectors**: Type-safe state selection patterns
- **Store Integration**: Cross-store communication types

### Event Types (if present)

Types for the event system:
- **Event Map**: Mapping of event names to payload types
- **Event Handlers**: Callback function signatures
- **Event Lifecycle**: Subscription and unsubscription types

## Usage Examples

### Plugin System Types
```typescript
import type { BaseAdapter, AdapterCapabilities } from '../types/plugins';

class CustomAdapter extends BaseAdapter {
  readonly capabilities: AdapterCapabilities = ['insertText', 'submitForm'];
  
  async insertText(text: string): Promise<void> {
    // Implementation
  }
}
```

### State Management Types
```typescript
import type { AppStore, ConnectionStore } from '../types/stores';

const useAppStore = create<AppStore>((set, get) => ({
  isInitialized: false,
  setInitialized: (status: boolean) => set({ isInitialized: status })
}));
```

### Event System Types
```typescript
import type { EventMap } from '../types/events';

// Type-safe event emission
eventBus.emit('adapter:switched', { 
  fromAdapter: 'default', 
  toAdapter: 'gemini' 
} satisfies EventMap['adapter:switched']);
```

## Type Safety Benefits

These centralized type definitions provide:
- **Compile-time Error Detection**: Catch type mismatches before runtime
- **IDE Support**: Enhanced autocomplete and refactoring capabilities  
- **Documentation**: Types serve as living documentation for interfaces
- **Consistency**: Ensure consistent data structures across components
- **Evolution**: Easy to update and maintain as the extension grows

The type system is designed to evolve with the extension, providing a robust foundation for both current functionality and future enhancements. 