# Content Script Source (`src`)

This directory is the root for all source code of the MCP-SuperAssistant content script, built on a modern plugin architecture with Zustand state management and React hooks integration.

## Overview

The content script is a modular, event-driven system responsible for:
- Interacting with AI platform web pages
- Managing injected UI components 
- Executing MCP tools via site-specific adapters
- Maintaining application state across different contexts
- Communicating with the background script

## Architecture Components

### Core Directories

#### **`plugins/`** - Plugin Architecture System
Houses the complete plugin ecosystem including:
- **Plugin Registry**: Centralized management and registration of all plugins
- **Base Adapter**: Abstract base class defining the adapter interface
- **Site-Specific Adapters**: Tailored implementations for each AI platform
- **Default Adapter**: Universal fallback implementation
- **Plugin Types**: TypeScript definitions for the plugin system

#### **`hooks/`** - React Hooks Integration
Modern React patterns for component integration:
- **`useAdapter`**: Hooks for adapter operations and management
- **`useStores`**: Zustand store integration hooks
- **`useEventBus`**: Event system integration hooks
- Consolidated exports for easy importing

#### **`stores/`** - State Management
Zustand-based state management with domain-specific stores:
- **App Store**: Global application state
- **Connection Store**: MCP server connection management  
- **UI Store**: Interface state and preferences
- **Adapter Store**: Plugin and adapter state
- **Tools Store**: MCP tool execution state

#### **`events/`** - Event System
Typed event bus for decoupled communication:
- **Event Bus**: Core event management system
- **Event Types**: TypeScript definitions for all events
- **Global Handlers**: System-wide event listeners

#### **`types/`** - Type Definitions
Comprehensive TypeScript type system:
- Store interfaces and types
- Plugin and adapter definitions
- Event system types
- Shared data structures

#### **`utils/`** - Utility Functions
Helper functions for common operations:
- DOM manipulation and element selection
- Logging and debugging utilities
- String and data processing functions
- Platform-specific helpers

#### **`components/`** - UI Components
React components for the injected interface:
- Sidebar UI components
- Website-specific component overrides
- Shared UI utilities and hooks

## Core Files

### **`index.ts`** - Main Entry Point
The primary entry point that orchestrates system initialization:
- Initializes all core systems (stores, events, plugins)
- Sets up the plugin registry with registered adapters
- Handles graceful cleanup and error recovery
- Emits system-ready events

### **`initializer.ts`** - System Initialization
Manages the startup sequence:
1. Initialize Zustand stores
2. Set up the typed event system
3. Initialize and populate the plugin registry
4. Register default and site-specific adapters
5. Emit `app:initialized` event
6. Set up cleanup handlers for graceful shutdown

## Development Patterns

### Plugin Development
```typescript
// Extending the system with new adapters
export class CustomSiteAdapter extends BaseAdapter {
  canHandle(url: string): boolean {
    return url.includes('customsite.com');
  }
  
  async insertText(text: string): Promise<void> {
    // Site-specific implementation
  }
}
```

### Hook Usage
```typescript
// Using adapter hooks in components
const { currentAdapter, switchAdapter, executeAction } = useAdapter();
const { isConnected, tools } = useStores();
```

### Event Communication
```typescript
// Type-safe event emission and handling
eventBus.emit('adapter:switched', { adapterId: 'custom-adapter' });
eventBus.on('tool:executed', (data) => { /* handle */ });
```

## Integration Points

1. **Plugin Registration**: All adapters are registered in the plugin registry during initialization
2. **State Synchronization**: Zustand stores maintain consistent state across components
3. **Event Communication**: Typed events enable loose coupling between modules
4. **Hook Integration**: React hooks provide clean component integration patterns
5. **Error Handling**: Centralized error management with graceful fallbacks

## Development Workflow

1. **Modular Development**: Each directory handles a specific concern
2. **Type Safety**: Comprehensive TypeScript coverage for all interfaces
3. **Event-Driven**: Loose coupling via the typed event bus
4. **Plugin Extensibility**: Easy addition of new site-specific adapters
5. **React Integration**: Modern hooks patterns for component development
6. **State Management**: Predictable state updates via Zustand stores

This architecture ensures maintainability, scalability, and extensibility while providing a robust foundation for the MCP SuperAssistant functionality.
