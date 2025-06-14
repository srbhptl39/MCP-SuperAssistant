# Adapter Plugins

This directory contains concrete implementations of Adapter Plugins for the MCP-SuperAssistant. Adapters are specialized plugins designed to tailor the assistant's behavior and capabilities to specific websites or types of websites.

## Overview

Each adapter extends the `BaseAdapterPlugin` and implements the `AdapterPlugin` interface. This ensures that all adapters adhere to a common contract for lifecycle management, capabilities, and interaction with the core system.

## Current Adapters

### `default.adapter.ts` - DefaultAdapter ✅
**Status**: Fully implemented (Session 7)

A fallback adapter that works on any website. Features:
- **Hostnames**: `['*']` (matches all websites)
- **Capabilities**: `['text-insertion', 'form-submission']`
- **Text Insertion**: Supports input fields, textareas, and contenteditable elements
- **Form Submission**: Multiple fallback strategies for maximum compatibility
- **Event Emission**: Proper tool execution tracking
- **Error Handling**: Comprehensive error logging and recovery

**Core Methods**:
- `insertText(text: string)`: Inserts text into active or suitable elements
- `submitForm()`: Submits forms using various strategies
- Event emission for tool tracking and debugging

### `example-forum.adapter.ts` - ExampleForumAdapter ✅
**Status**: Fully implemented (Session 8)

A specialized adapter for forum.example.com demonstrating site-specific functionality. Features:
- **Hostnames**: `['forum.example.com', 'www.forum.example.com']`
- **Capabilities**: `['text-insertion', 'form-submission', 'url-navigation', 'dom-manipulation']`
- **Forum-Specific Features**: Thread navigation, reply posting, title extraction
- **Event Tracking**: Monitors thread clicks and form submissions
- **Smart Initialization**: Detects forum-specific page elements

**Core Methods**:
- `insertText(text: string)`: Enhanced text insertion with forum-specific logic
- `submitForm()`: Inherited from base with forum-specific event tracking
- `navigateToThread(threadId: string)`: Navigate to specific forum threads
- `postReply(threadId: string, content: string)`: Post replies to forum threads
- `extractThreadTitle()`: Extract thread titles from forum pages

### `base.adapter.ts` - BaseAdapterPlugin
**Status**: Base class providing common functionality

Provides the foundation for all adapters with:
- Lifecycle management (initialize, activate, deactivate, cleanup)
- Status tracking and error handling
- Plugin context integration
- Event handler interfaces
- Abstract methods for concrete implementation

## Architecture

```typescript
interface AdapterPlugin {
  readonly name: string;
  readonly version: string;
  readonly hostnames: string[] | RegExp[];
  readonly capabilities: AdapterCapability[];
  
  // Lifecycle methods
  initialize(context: PluginContext): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  cleanup(): Promise<void>;
  
  // Core functionality
  insertText(text: string): Promise<boolean>;
  submitForm(): Promise<boolean>;
  attachFile?(file: File): Promise<boolean>;
  
  // Status and utility
  isSupported(): boolean;
  getStatus(): AdapterStatus;
}
```

## Creating a New Adapter

### 1. Create the Adapter File

```typescript
// my-site.adapter.ts
import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability } from '../plugin-types';

export class MySiteAdapter extends BaseAdapterPlugin {
  readonly name = 'MySiteAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['my-site.com', 'www.my-site.com'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion', 
    'form-submission',
    'url-navigation'
  ];

  async insertText(text: string): Promise<boolean> {
    // Site-specific text insertion logic
    const textArea = document.querySelector('.my-site-textarea');
    if (textArea) {
      (textArea as HTMLTextAreaElement).value = text;
      return true;
    }
    return false;
  }

  async submitForm(): Promise<boolean> {
    // Site-specific form submission logic
    const submitBtn = document.querySelector('.my-site-submit');
    if (submitBtn) {
      (submitBtn as HTMLButtonElement).click();
      return true;
    }
    return false;
  }

  protected async initializePlugin(): Promise<void> {
    this.context.logger.info('Initializing MySiteAdapter...');
    // Site-specific initialization
  }

  protected async activatePlugin(): Promise<void> {
    this.context.logger.info('Activating MySiteAdapter...');
    // Add site-specific event listeners
  }

  protected async deactivatePlugin(): Promise<void> {
    this.context.logger.info('Deactivating MySiteAdapter...');
    // Remove site-specific event listeners
  }

  protected async cleanupPlugin(): Promise<void> {
    this.context.logger.info('Cleaning up MySiteAdapter...');
    // Final cleanup
  }
}
```

### 2. Register the Adapter

Add to `plugin-registry.ts`:

```typescript
import { MySiteAdapter } from './adapters/my-site.adapter';

private async registerBuiltInAdapters(): Promise<void> {
  // ... existing adapters
  await this.register(new MySiteAdapter(), {
    id: 'my-site-adapter',
    name: 'My Site Adapter',
    description: 'Specialized adapter for My Site',
    version: '1.0.0',
    enabled: true,
    priority: 10, // Higher priority than default
    settings: {}
  });
}
```

### 3. Export the Adapter

Add to `plugins/index.ts`:

```typescript
export { MySiteAdapter } from './adapters/my-site.adapter';
```

## Adapter Capabilities

Available capabilities:
- `text-insertion`: Can insert text into page elements
- `form-submission`: Can submit forms
- `file-attachment`: Can attach files to inputs
- `url-navigation`: Can navigate to different URLs
- `element-selection`: Can select specific DOM elements
- `screenshot-capture`: Can capture screenshots
- `dom-manipulation`: Can manipulate DOM elements

## Best Practices

### 1. **Specific Hostnames**
Use specific hostname patterns to avoid conflicts:
```typescript
readonly hostnames = ['example.com', 'www.example.com'];
```

### 2. **Defensive Programming**
Always check for element existence:
```typescript
const element = document.querySelector('.target');
if (!element) {
  this.context.logger.warn('Target element not found');
  return false;
}
```

### 3. **Event Emission**
Emit events for tracking:
```typescript
this.context.eventBus.emit('tool:execution-completed', {
  execution: {
    id: this.generateId(),
    toolName: 'insertText',
    parameters: { text },
    result: { success: true },
    timestamp: Date.now(),
    status: 'success'
  }
});
```

### 4. **Error Handling**
Use try-catch and proper logging:
```typescript
try {
  // Adapter logic
  return true;
} catch (error) {
  this.context.logger.error('Operation failed:', error);
  return false;
}
```

### 5. **Priority System**
- **Priority 1-10**: Critical, site-specific adapters
- **Priority 11-50**: General-purpose adapters
- **Priority 51-99**: Fallback adapters (like DefaultAdapter)

## Integration with React Hooks

Adapters work seamlessly with React hooks:

```typescript
import { useCurrentAdapter } from '../hooks';

function MyComponent() {
  const { insertText, submitForm, hasCapability } = useCurrentAdapter();
  
  const handleInsert = () => {
    insertText('Hello World!');
  };
  
  const handleSubmit = () => {
    if (hasCapability('form-submission')) {
      submitForm();
    }
  };
  
  return (
    <div>
      <button onClick={handleInsert}>Insert Text</button>
      <button onClick={handleSubmit}>Submit Form</button>
    </div>
  );
}
```

## Testing Adapters

### Manual Testing
1. Load the extension on the target website
2. Check console for adapter activation logs
3. Test text insertion and form submission
4. Verify event emission in dev tools

### Debugging
Use the global debug object:
```javascript
// In browser console
window.__pluginSystem.getRegistry().getDebugInfo();
window.__pluginSystem.getRegistry().getActivePlugin();
```

## Roadmap

### Completed Adapters ✅
- **DefaultAdapter**: Universal fallback adapter (Session 7)
- **ExampleForumAdapter**: Demonstration site-specific adapter (Session 8)

### Planned Adapters (Session 9+)
- **RedditAdapter**: For Reddit-like forum functionality
- **GitHubAdapter**: For GitHub issue/PR management
- **TwitterAdapter**: For social media interactions
- **BlogAdapter**: For blog comment/interaction systems

### Legacy System Integration
- **PerplexityAdapter**: Migrate from legacy system
- **GeminiAdapter**: Migrate from legacy system  
- **ChatGPTAdapter**: Migrate from legacy system
- **GrokAdapter**: Migrate from legacy system

### Future Enhancements
- Dynamic adapter loading
- User-defined adapters
- Adapter marketplace
- Performance monitoring
- A/B testing framework
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
