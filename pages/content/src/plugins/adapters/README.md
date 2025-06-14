# Adapters Module

This directory contains concrete implementations of Adapter Plugins for the MCP-SuperAssistant. Adapters are specialized plugins designed to tailor the assistant's behavior and capabilities to specific websites or types of websites.

## Overview

Each adapter extends the `BaseAdapterPlugin` (found in the parent `plugins` directory) and implements the `AdapterPlugin` interface. This ensures that all adapters adhere to a common contract for lifecycle management, capabilities, and interaction with the core system.

Key components:

- **`default.adapter.ts`**: Provides a `DefaultAdapter` implementation. This adapter serves as a fallback and is designed to match any hostname (`/.*/`). It demonstrates the basic structure of an adapter, including:
    - Defining `name`, `version`, `hostnames`, and `capabilities`.
    - Implementing lifecycle methods: `constructor`, `initialize`, `activate`, `deactivate`, and `cleanup`.
    - Providing a default configuration (`defaultAdapterConfig`).
    - Emitting adapter-specific lifecycle events (e.g., `adapter:activated`, `adapter:deactivated`).

## Purpose of Adapters

- **Site-Specific Logic**: Adapters can contain logic specific to the DOM structure, APIs, or user workflows of particular websites.
- **Capability Declaration**: They declare their capabilities (e.g., 'text-insertion', 'form-submission') so the system knows what actions they can perform.
- **Targeted Functionality**: By matching specific hostnames, adapters ensure that relevant functionality is available only when appropriate.

## Creating a New Adapter

1.  **Create a File**: Add a new `.ts` file in this directory (e.g., `my-website.adapter.ts`).
2.  **Extend Base Class**: Define a class that extends `BaseAdapterPlugin`.
    ```typescript
    import { BaseAdapterPlugin } from '../base.adapter';
    import type { AdapterConfig, PluginContext, AdapterCapability } from '../plugin-types';

    export class MyWebsiteAdapter extends BaseAdapterPlugin {
      public readonly name = 'MyWebsiteAdapter';
      public readonly version = '1.0.0';
      public readonly hostnames = ['my-website.com', 'www.my-website.com'];
      public readonly capabilities: AdapterCapability[] = ['text-insertion', 'form-submission'];
      
      protected config: AdapterConfig;

      constructor(context: PluginContext, config: AdapterConfig) {
        super(context);
        this.config = config;
        // Adapter-specific constructor logic
      }

      async initialize(context: PluginContext): Promise<void> { /* ... */ }
      async activate(): Promise<void> { /* ... */ }
      async deactivate(): Promise<void> { /* ... */ }
      async cleanup(): Promise<void> { /* ... */ }

      // Implement other methods as needed, e.g., insertText, submitForm
    }
    ```
3.  **Define Configuration**: Export a default `AdapterConfig` for the new adapter.
    ```typescript
    export const myWebsiteAdapterConfig: AdapterConfig = {
      id: 'my-website-adapter',
      name: 'My Website Adapter',
      description: 'Adapter for specific interactions on my-website.com.',
      version: '1.0.0',
      enabled: true,
      priority: 10, // Higher priority (lower number) than DefaultAdapter
      settings: { /* ... */ },
    };
    ```
4.  **Register the Adapter**: Update `plugin-registry.ts` or your plugin discovery mechanism to register this new adapter during application initialization.

By organizing adapters in this directory, the plugin system remains modular and easy to extend with new site-specific functionalities.
