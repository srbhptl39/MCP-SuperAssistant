# State Management Stores (`stores`)

This directory contains all state management stores for the MCP-SuperAssistant content script. It utilizes a state management library (likely Zustand, given the `use...Store` naming convention) to provide a centralized, reactive, and predictable way to manage application state.

## Overview

Each file typically defines a separate "slice" of the application's state, focusing on a specific domain or feature. This modular approach helps in organizing state logic and makes it easier to manage and test.

Key components:

- **`index.ts`**: Serves as the main entry point for the stores module. It imports and re-exports all individual store hooks and their associated TypeScript types. This allows other parts of the application to import stores and types from a single, consistent location.

- **Individual Store Files (e.g., `app.store.ts`, `adapter.store.ts`)**: Each `*.store.ts` file defines:
    - The **state** structure for that particular domain.
    - **Actions** or **reducers** that can modify that state.
    - **Selectors** (often implicitly via the store hook) to access specific pieces of state.

## Available Stores

Based on the `index.ts` and common application needs, the following stores are likely present:

- **`app.store.ts` (`useAppStore`)**: Manages global application-level state, such as initialization status, current version, overall application mode, or global settings.
- **`adapter.store.ts` (`useAdapterStore`)**: Manages state related to the plugin adapter system. This includes the list of registered adapters, the currently active adapter, their configurations, and lifecycle states.
- **`ui.store.ts` (`useUIStore`)**: Handles state related to the user interface, such as visibility of UI elements, user preferences for the UI, themes, or interaction states.
- **`connection.store.ts` (`useConnectionStore`)**: Manages the state of connections to backend services or the browser extension's background script, including connection status, pending requests, or error states.
- **`tool.store.ts` (`useToolStore`)**: Manages state related to available tools or functionalities within the assistant, such as tool activation status, configurations, or recent usage.

## Usage

To use a store within a component or service:

1.  **Import the store hook** from the central `index.ts`:
    ```typescript
    import { useAppStore, useAdapterStore } from './stores'; // Or from '../stores' depending on location
    ```

2.  **Access state and actions** using the hook:

    ```typescript
    // Example of accessing state
    const appVersion = useAppStore((state) => state.version);
    const activeAdapter = useAdapterStore((state) => state.activeAdapterName);

    // Example of accessing actions (methods defined in the store)
    const { initializeApp, setAppMode } = useAppStore.getState(); // For Zustand, actions are part of the state
    const { registerPlugin, activateAdapter } = useAdapterStore.getState();

    // Calling an action
    setAppMode('focused');
    activateAdapter('DefaultAdapter');
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
