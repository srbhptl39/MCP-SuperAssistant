# Events Module

This directory contains the core event management system for the MCP-SuperAssistant content script.

## Overview

The event system facilitates communication between different parts of the application in a decoupled manner. It's built around a typed event bus, ensuring type safety for event names and their associated payloads.

Key components:

- **`event-bus.ts`**: Implements `TypedEventBus`, a custom event emitter supporting typed events, wildcard listeners, event history, and robust error handling. It's the central hub for all event emissions and subscriptions.
- **`event-types.ts`**: Defines the `EventMap` interface, which maps event names (keys) to their payload types. It also includes types for event callbacks (`TypedEventCallback`, `WildcardEventCallback`) and the `UnsubscribeFunction`.
- **`event-handlers.ts`**: Manages global event handlers that listen for specific application-wide events (e.g., unhandled errors, site changes). It provides `initializeGlobalEventHandlers` and `cleanupGlobalEventHandlers` for lifecycle management.
- **`event-system.ts`**: Orchestrates the overall event system setup and teardown. It initializes the `TypedEventBus` (if needed, though it's often a singleton instance) and the global event handlers via `initializeEventSystem` and `cleanupEventSystem`.

## Usage

### Emitting Events

To emit an event, import the `eventBus` instance and call its `emit` method:

```typescript
import { eventBus } from './event-bus';

eventBus.emit('app:initialized', { version: '1.0.0', timestamp: Date.now() });
```

### Subscribing to Events

To listen for an event, use the `on`, `once`, or `onWildcard` methods:

```typescript
import { eventBus } from './event-bus';

// Listen for a specific event
const unsubscribeAppInit = eventBus.on('app:initialized', (data) => {
  console.log('App initialized:', data.version, data.timestamp);
});

// Listen for an event only once
eventBus.once('app:shutdown', (data) => {
  console.log('App shutdown reason:', data.reason);
});

// Listen to all events (wildcard)
const unsubscribeAll = eventBus.onWildcard((payload) => {
  console.log(`Event [${payload.event}] fired with data:`, payload.data);
});

// Remember to unsubscribe when the listener is no longer needed
// unsubscribeAppInit();
// unsubscribeAll();
```

### System Initialization

The entire event system (bus + global handlers) is typically initialized at application startup by calling `initializeEventSystem()` from a higher-level initializer (like `src/initializer.ts`).

```typescript
import { initializeEventSystem } from './events/event-system';

async function startApp() {
  await initializeEventSystem();
  // ... other initializations
}
```

This modular approach ensures that event handling is centralized, type-safe, and manageable throughout the application lifecycle.
