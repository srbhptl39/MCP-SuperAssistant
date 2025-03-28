# Sidebar Components

This directory contains the components for the MCP Control Center sidebar, which provides a user interface for interacting with MCP tools and managing instructions.

## Component Structure

```
sidebar/
├── Sidebar.tsx # Main container component
├── SidebarManager.tsx # Manages sidebar instantiation and communication
├── index.ts # Exports sidebar components and utilities
├── base/
│   └── BaseSidebarManager.tsx # Abstract class for sidebar management
├── hooks/
│   └── backgroundCommunication.ts # Custom hook for background script communication
├── styles/
│   └── sidebar.css # Core styles for the sidebar
├── ui/
│   ├── Typography.tsx # Text styling component
│   ├── Icon.tsx # Icon component
│   ├── Toggle.tsx # Toggle switch component
│   ├── ResizeHandle.tsx # Resize handle component
│   └── index.ts # Exports UI components
├── ServerStatus/
│   └── ServerStatus.tsx # Server status display
├── AvailableTools/
│   └── AvailableTools.tsx # List of available tools
├── DetectedTools/
│   └── DetectedTools.tsx # List of detected tool calls
├── InputArea/
│   └── InputArea.tsx # User input area
└── Instructions/
    ├── InstructionManager.tsx # Instruction management
    └── instructionGenerator.ts # Generates markdown instructions
```

## UI Styling

The sidebar uses a professional and modern UI design based on shadcn/ui components with a slate color palette. This ensures a consistent, accessible, and visually appealing interface.

### Color System

The sidebar implements a refined color system using the slate color scale:
- **Primary Text**: slate-900 (light mode), slate-50 (dark mode)
- **Secondary Text**: slate-700 (light mode), slate-300 (dark mode)
- **Muted Text**: slate-500 (light mode), slate-400 (dark mode)
- **Borders**: slate-200 (light mode), slate-800 (dark mode)
- **Background**: slate-50 (light mode), slate-900 (dark mode)
- **Hover States**: slate-100 (light mode), slate-800 (dark mode)

### Status Indicators

Semantic colors are used for status indicators:
- **Success/Connected**: emerald-500
- **Warning/Reconnecting**: amber-500
- **Error/Disconnected**: rose-500

### shadcn/ui Components

The sidebar uses the following shadcn/ui components:
- **Button**: For action buttons with multiple variants (default, outline)
- **Card**: For content containers with consistent styling
- **CardHeader**: For card headers with consistent padding and styling
- **CardContent**: For card content with consistent padding
- **Toggle**: For boolean settings based on the shadcn Switch component
- **Typography**: Custom component following shadcn typography styling

### Component-Specific Styling

#### InputArea
- Uses Card with CardHeader and CardContent for a structured layout
- Incorporates shadcn Button for form submission
- Features consistent form input styling with slate colors
- Implements proper focus states with slate accent colors

#### DetectedTools
- Implements a professional card-based layout for tool items
- Uses semantic emerald colors for tool indicators
- Features consistent button styling for actions (Execute, Insert, Attach)
- Maintains proper spacing and visual hierarchy

#### AvailableTools
- Uses enhanced search input with subtle slate styling
- Implements collapsible tool details with proper animations
- Features consistent tool item styling with slate backgrounds
- Incorporates proper loading states with subtle animations

### Dark Mode Support

The sidebar fully supports dark mode with carefully selected color variations that maintain proper contrast and readability. Dark mode colors are defined using Tailwind's dark: variant selectors.

## Components

### Sidebar.tsx

The main container component that orchestrates the layout and integrates all sub-components while managing global state and interactions.

**Props:** None

**State:**
- `isCollapsed`: Boolean to track sidebar collapse state.
- `detectedTools`: Array of detected MCP tools.
- `activeTab`: String to track the active tab ('tools' or 'instructions').
- `isRefreshing`: Boolean to track if the tools list is being refreshed.

**Key Features:**
- Initializes observer to detect MCP tools on the page using the site adapter.
- Manages collapse/expand functionality.
- Renders all sub-components based on the active tab.
- Handles refreshing of the available tools list.

### ServerStatus.tsx

Displays the current MCP server status and provides actions like reconnecting or viewing details.

**Props:**
- `status`: String representing the server connection status ('connected', 'disconnected', or 'error').

**Key Methods:**
- `handleReconnect`: Sends a reconnect message to the background script.
- `handleDetails`: Shows/hides server status details.

### AvailableTools.tsx

Displays a list of tools available on the MCP server with an option to execute each one.  Includes a search bar to filter tools.

**Props:**
- `tools`: Array of tool objects with `name`, `description`, and `schema` properties.
- `onExecute`: Callback function to execute a tool.
- `onRefresh`: Callback function to refresh the list of available tools.
- `isRefreshing`: Boolean indicating if the tools are currently being refreshed.

**State:**
- `expandedTool`: String | null - The name of the currently expanded tool (for displaying details).
- `searchTerm`: String - The current search term.

**Key Methods:**
- `toggleExpand`: Expands/collapses the details of a tool.

### DetectedTools.tsx

Lists MCP tools detected on the page, allowing users to execute them and insert their results.

**Props:**
- `tools`: Array of detected tool objects with `id`, `name`, and `args` properties.
- `onExecute`: Callback function to execute a tool.
- `onInsert`: Callback function to insert text into the input field.

**State:**
- `results`: Object mapping tool IDs to their execution results.
- `loading`: Object mapping tool IDs to loading state.
- `expandedTool`: String | null - The ID of the currently expanded tool.

**Key Methods:**
- `handleExecute`: Executes a tool and updates the `results` state.
- `toggleExpand`: Expands/collapses the details of a detected tool.

### InstructionManager.tsx

Manages the generation, editing, and injection of the dynamic instructions.md file.

**Props:**
- `adapter`: Site adapter object.
- `tools`: Array of available tools.

**State:**
- `instructions`: String containing the generated instructions.
- `isEditing`: Boolean to track editing mode.
- `isInjecting`: Boolean to track if instructions are being injected.

**Key Methods:**
- `handleInject`: Injects instructions into the website (either by attaching a file or inserting text).
- `handleSave`: Saves edited instructions.
- `handleCancel`: Cancels editing and resets instructions to the generated version.

### InputArea.tsx

Provides a text input area for user input with submission handling.

**Props:**
- `onSubmit`: Callback function to handle form submission.

**State:**
- `inputText`: String containing the current input text.
- `isSubmitting`: Boolean to track submission status.

**Key Methods:**
- `handleSubmit`: Handles form submission and resets input.

## Utility Files

### backgroundCommunication.ts

A React custom hook for communication with the background script using `mcpHandler`.

**Key Features:**
- Tracks server connection status (`serverStatus`).
- Fetches and stores available tools (`availableTools`).
- Provides functions for tool execution (`callTool`, `sendMessage`).
- Provides a function for refreshing the tools list (`refreshTools`).
- Handles error cases gracefully.
- Implements reconnection logic with exponential backoff.
- Provides a `forceReconnect` function to manually trigger reconnection.
- Monitors connection status and updates the UI accordingly.

### instructionGenerator.ts

Generates markdown instructions for using MCP tools.

**Key Features:**
- Creates formatted instructions based on available tools.
- Includes general usage information.
- Provides examples for each tool, including parameter details from the schema.
- Handles schema parsing errors gracefully.

## Usage Example

```tsx
import React from 'react';
import Sidebar from './components/sidebar/Sidebar';

const App: React.FC = () => {
  return (
    <div className="app">
      <Sidebar />
      {/* Other app content */}
    </div>
  );
};

export default App;
```

## Styling

All components use Tailwind CSS with a `tw-` prefix to prevent style conflicts with the host website. Class names follow this pattern:

```tsx
<div className="tw-sidebar">
  <div className="tw-header">
    {/* Component content */}
  </div>
</div>
```
The `sidebar.css` file contains core styles for the sidebar structure and animations.

## Integration with Site Adapters

The sidebar components integrate with site adapters through the `useSiteAdapter` hook, which provides site-specific functionality like:

- Initializing observers for tool detection (using `adapter.getToolDetector()`).
- Inserting text into input fields (`adapter.insertTextIntoInput`).
- Triggering form submission (`adapter.triggerSubmission()`).
- Attaching files (when supported) (`adapter.attachFile`).

This ensures the sidebar works consistently across different supported websites. The `SidebarManager` and `BaseSidebarManager` classes handle the instantiation and management of the sidebar for different sites.

## CRUD Methods

### Sidebar.tsx
-   **`updateDetectedTools`**: Updates the state with tools detected by the observer.
-   **`setIsCollapsed`**: Updates the collapse state of the sidebar.
-   **`setActiveTab`**: Updates the currently active tab.
-   **`setIsRefreshing`**: Updates the refreshing state for the tools list.

### SidebarManager.tsx
-   **`constructor`**: Initializes the sidebar, sets up communication, and injects the sidebar into the DOM.
-   **`registerListeners`**: Sets up event listeners for communication with the background script and the webpage.
-   **`injectSidebar`**: Creates and injects the sidebar elements into the page.
-   **`removeSidebar`**: Removes the sidebar elements from the page.
-   **`handleMessage`**: Processes messages received from the background script or webpage.
-   **`sendMessage`**: Sends messages to the background script.

### ServerStatus/ServerStatus.tsx
-   **`handleReconnect`**: Sends a reconnect request to the background script (Triggers an update in background).
-   **`handleDetails`**: Toggles the visibility of server status details (Updates local state).

### AvailableTools/AvailableTools.tsx
-   **`toggleExpand`**: Updates the `expandedTool` state to show/hide tool details.
-   **`setSearchTerm`**: Updates the search term in the state.
-   **`onExecute`** (prop): Callback to execute a tool, passed from parent (Triggers create/update in background).

### DetectedTools/DetectedTools.tsx
-   **`handleExecute`**: Executes a detected tool and updates the `results` state (Creates/Updates).
-   **`toggleExpand`**: Updates the `expandedTool` state to show/hide details of a detected tool.
-  **`onInsert`** (prop): Callback to insert text, passed from parent.

### InputArea/InputArea.tsx
-   **`handleSubmit`**: Handles form submission and resets input (Creates a new request).
-   **`setInputText`**: Updates the `inputText` state with the user's input.

### Instructions/InstructionManager.tsx
-   **`handleInject`**: Injects the generated instructions into the page (Creates/Updates content on the page).
-   **`handleSave`**: Saves the edited instructions (Updates the instructions).
-   **`handleCancel`**: Cancels editing and reverts to the generated instructions (Reads the generated instructions).
-   **`setInstructions`**: Updates the `instructions` state.
-   **`setIsEditing`**: Updates the `isEditing` state.
-   **`setIsInjecting`**: Updates the `isInjecting` state.

### hooks/backgroundCommunication.ts
-   **`callTool`**: Sends a tool execution request to the background script (Creates a new request).
-   **`sendMessage`**: Sends a message to the background script (Generic communication).
-   **`refreshTools`**: Requests a refresh of the available tools from the background script (Reads updated data).
- **`setServerStatus`**: Updates the server status.
- **`setAvailableTools`**: Updates the list of available tools.

### Instructions/instructionGenerator.ts
-   **`generateInstructions`**: Generates markdown instructions based on available tools (Reads tool data and creates instructions).

### base/BaseSidebarManager.tsx
-   **`abstract showSidebar`**: Abstract method to display the sidebar.
-   **`abstract hideSidebar`**: Abstract method to hide the sidebar.
-   **`abstract toggleSidebar`**: Abstract method to toggle the sidebar's visibility.
-   **`abstract handleMessage`**: Abstract method to handle incoming messages.
-   **`sendMessage`**: Sends a message to the background script or other parts of the extension.
-   **`setupMessageListener`**: Sets up a listener for messages from the background script.

## UI Components

The sidebar now includes a set of reusable UI components in the `ui/` directory:

### Typography

A component for consistent text styling across the sidebar.

**Props:**
- `variant`: The text style variant ('h1', 'h2', 'h3', 'h4', 'subtitle', 'body', 'small', 'caption')
- `className`: Optional additional CSS classes
- `children`: The text content

### Icon

A component for rendering consistent icons throughout the sidebar.

**Props:**
- `name`: The icon name to render
- `size`: Size of the icon ('sm', 'md', 'lg')
- `className`: Optional additional CSS classes

### Toggle

A toggle switch component for boolean settings.

**Props:**
- `label`: Text label for the toggle
- `checked`: Boolean state of the toggle
- `onChange`: Function called when the toggle state changes
- `className`: Optional additional CSS classes
- `size`: Size of the toggle ('sm', 'md')

### ResizeHandle

A draggable handle component for resizing the sidebar.

**Props:**
- `onResize`: Function called with the new width when resizing
- `minWidth`: Minimum allowed width
- `maxWidth`: Maximum allowed width
- `className`: Optional additional CSS classes
- `defaultWidth`: Initial width

## New Features

The sidebar now includes the following new features:

1. **Resizable Width**: Users can drag the left edge of the sidebar to resize it.

2. **Push Content Mode**: A toggle that allows the sidebar to either overlay the page content or push it to the side.

3. **Improved Typography**: Consistent text styling across all components.

4. **Consistent Icons**: A unified icon system for all icons in the sidebar.

5. **Enhanced Visual Design**: Improved shadows, borders, and hover effects for a more polished look.

6. **Better Dark Mode Support**: Improved contrast and readability in dark mode.
