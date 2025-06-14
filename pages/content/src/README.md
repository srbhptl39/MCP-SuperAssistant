# Content Script Source (`src`)

This directory is the root for all source code of the MCP-SuperAssistant content script.

## Overview

The content script is responsible for interacting with web pages, managing UI elements injected into the page, and communicating with the background script or service worker.

Key subdirectories and their roles:

- **`events/`**: Contains the core event management system, including the typed event bus, event type definitions, and global event handlers.
- **`plugins/`**: Houses the plugin architecture, primarily focused on 'Adapters' that tailor assistant behavior to specific websites. Includes the plugin registry, base adapter class, and plugin type definitions.
    - **`plugins/adapters/`**: Contains concrete implementations of adapter plugins, like the `DefaultAdapter`.
- **`stores/`**: (Assumed) Manages application state using a state management library (e.g., Zustand, Redux). Includes individual stores for different parts of the application state (app, connection, UI, adapters, tools).
- **`types/`**: (Assumed) Contains shared TypeScript type definitions used across the content script, potentially including store types or common data structures.
- **`utils/`**: (Assumed) Provides utility functions for common tasks like DOM manipulation, logging, string operations, etc.
- **`ui/` or `components/`**: (Assumed) Would contain UI components injected into the web page if the assistant has a visible interface.

## Core Files

- **`initializer.ts`**: This crucial file orchestrates the startup sequence of the content script. The `initializeApp` function within it is responsible for:
    1.  Initializing application stores (if any).
    2.  Setting up the event system (`initializeEventSystem`).
    3.  Initializing the plugin registry (`initializePluginRegistry`), which includes registering adapters.
    4.  Emitting an `app:initialized` event upon successful startup.
    It also typically includes a `cleanupApp` function to gracefully shut down services in the reverse order of initialization.

- **`main.ts` or `content.ts`** (Entry Point - Assumed): This file would be the main entry point for the content script bundle. It's responsible for calling `initializeApp()` when the content script is loaded into a page.

## Development Workflow

1.  **Modularity**: Functionality is organized into modules (events, plugins, stores, utils).
2.  **Initialization**: The `initializer.ts` ensures that all necessary systems are up and running in the correct order.
3.  **Event-Driven**: Communication between modules often occurs via the `TypedEventBus` to maintain decoupling.
4.  **State Management**: Application state is managed centrally through stores.
5.  **Extensibility**: The plugin system (adapters) allows for easy extension of site-specific functionalities.

This structured approach aims to create a maintainable, scalable, and robust content script.
