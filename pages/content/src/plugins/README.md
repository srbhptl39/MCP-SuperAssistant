# Plugin System Core

This directory contains the core components for the MCP-SuperAssistant's plugin architecture. Plugins, in this context, are primarily 'Adapters' designed to interact with specific web pages or types of web pages.

## Overview

The plugin system allows for modular and extensible functionality, enabling the assistant to adapt its behavior and capabilities based on the website it's currently active on.

Key components:

- **`plugin-registry.ts`**: Manages the lifecycle of all adapter plugins. It handles registration, unregistration, activation, and deactivation of plugins. It also includes logic to determine the most suitable adapter for the current hostname and emits events related to plugin status changes.
- **`plugin-types.ts`**: Defines essential TypeScript interfaces and types for the plugin system. This includes `AdapterPlugin` (the contract for all adapters), `AdapterConfig` (configuration for adapters), `PluginContext` (context object passed to plugins), `AdapterCapability`, and `PluginRegistration`.
- **`base.adapter.ts`**: Provides an abstract `BaseAdapterPlugin` class that concrete adapters should extend. It implements common functionalities and defines abstract methods that specific adapters must implement, ensuring a consistent structure and reducing boilerplate.
- **`plugin-context.ts`**: Contains the `createPluginContext` factory function. This function assembles and returns the `PluginContext` object, which provides plugins with access to shared resources like the event bus, stores, utility functions, and logger.

## Architecture

1.  **Adapters**: Concrete adapter plugins (located in the `adapters/` subdirectory) extend `BaseAdapterPlugin` and implement the `AdapterPlugin` interface.
2.  **Configuration**: Each adapter has an associated `AdapterConfig` that defines its properties, such as ID, name, enabled status, priority, and target hostnames.
3.  **Context**: When an adapter is initialized or activated, it receives a `PluginContext` object, giving it access to necessary application services.
4.  **Registry**: The `PluginRegistry` maintains a list of registered plugins. It uses hostname matching (and potentially priority) to decide which adapter to activate for a given web page.
5.  **Lifecycle**: Plugins go through a lifecycle: registered -> initialized -> activated <-> deactivated -> cleaned up.

## Usage

### Defining a New Adapter

1.  Create a new class in the `adapters/` directory that extends `BaseAdapterPlugin`.
2.  Implement the required abstract methods (e.g., `name`, `version`, `hostnames`, `capabilities`, `initialize`, `activate`, `deactivate`, `cleanup`).
3.  Define a default `AdapterConfig` for your new adapter.

### Registering Adapters

Adapters are typically registered with the `PluginRegistry` during application startup. The `initializePluginRegistry` function handles the registration of default adapters and can be extended to discover and register others.

```typescript
// Example from initializePluginRegistry in plugin-registry.ts
import { DefaultAdapter, defaultAdapterConfig } from './adapters/default.adapter';
import { createPluginContext } from './plugin-context';

// ...
const pluginInstance = new DefaultAdapter(createPluginContext(defaultAdapterConfig.name), defaultAdapterConfig);
await registerPlugin(pluginInstance, defaultAdapterConfig);
// ...
```

### Interaction

- The `hostnameChangedHandler` in `plugin-registry.ts` automatically evaluates and activates the appropriate adapter when the user navigates to a new site.
- Other parts of the application can interact with the active adapter through methods exposed by the `PluginRegistry` (e.g., `getActiveAdapter`) or by listening to adapter-specific events on the `eventBus`.

This system provides a flexible way to extend the assistant's functionality for different websites.
