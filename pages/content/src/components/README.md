# Components Directory

This directory contains React components that make up the user interface of the MCP SuperAssistant content script, integrated with the modern plugin architecture and state management system.

## Overview

The components are organized by functionality and integration scope, providing:
- Injected UI elements that appear on AI platform pages
- Site-specific component adaptations and overrides
- Shared UI components and utilities
- Integration with Zustand stores and React hooks

## Directory Structure

### **`sidebar/`** - Main Sidebar Interface
Contains components for the primary sidebar interface:
- Main sidebar container and layout
- Tool execution panels and controls
- Connection status indicators
- Settings and preferences UI
- Integration with `useStores` and `useAdapter` hooks

### **`mcpPopover/`** - MCP Tool Popover
Components for the tool execution popover:
- Tool call detection and display
- Execution progress indicators
- Result formatting and display
- Auto-execution controls

### **`ui/`** - Shared UI Components
Reusable UI components used across the extension:
- Common buttons, inputs, and form elements
- Layout helpers and containers
- Theming and styling utilities
- Integration with `@extension/ui` package

### **`websites/`** - Site-Specific Components
Site-specific component overrides and adaptations:
- **`gemini/`**: Components tailored for Google Gemini interface
- Additional site-specific directories as needed
- Custom styling and behavior for each platform

## Integration with Architecture

### State Management Integration
Components use React hooks to integrate with Zustand stores:

```typescript
import { useStores } from '../../hooks/useStores';
import { useAdapter } from '../../hooks/useAdapter';

export function ToolExecutionPanel() {
  const { tools, isConnected, connectionStatus } = useStores();
  const { currentAdapter, executeAction } = useAdapter();
  
  return (
    <div className="tool-panel">
      <ConnectionStatus status={connectionStatus} />
      <ToolList tools={tools} onExecute={executeAction} />
    </div>
  );
}
```

### Plugin System Integration
Components can adapt based on the current site adapter:

```typescript
import { useAdapter } from '../../hooks/useAdapter';

export function AdaptiveSidebar() {
  const { currentAdapter } = useAdapter();
  
  // Get site-specific styling or behavior
  const sidebarConfig = currentAdapter?.getUIConfig?.() || defaultConfig;
  
  return (
    <aside 
      className={`sidebar ${sidebarConfig.theme}`}
      style={{ position: sidebarConfig.position }}
    >
      {/* Sidebar content */}
    </aside>
  );
}
```

### Event System Integration
Components can emit and listen to events via hooks:

```typescript
import { useEventBus } from '../../hooks/useEventBus';

export function ToolButton({ toolId }: { toolId: string }) {
  const { emit } = useEventBus();
  
  const handleClick = () => {
    emit('tool:requested', { toolId, source: 'button' });
  };
  
  return <button onClick={handleClick}>Execute Tool</button>;
}
```

## Development Patterns

### Component Structure
```typescript
// Component with full architecture integration
import { useStores } from '../../hooks/useStores';
import { useAdapter } from '../../hooks/useAdapter';
import { useEventBus } from '../../hooks/useEventBus';

interface MyComponentProps {
  // Props interface
}

export function MyComponent({ ...props }: MyComponentProps) {
  // Hook usage
  const stores = useStores();
  const adapter = useAdapter();
  const events = useEventBus();
  
  // Component logic
  
  return (
    // JSX with proper styling and event handling
  );
}
```

### Styling Integration
Components use Tailwind CSS classes and integrate with the UI package:

```typescript
import { cn } from '@extension/ui/lib/utils';
import { Button, Card } from '@extension/ui';

export function StyledComponent() {
  return (
    <Card className={cn('p-4', 'shadow-lg', 'transition-all')}>
      <Button variant="outline" size="sm">
        Action
      </Button>
    </Card>
  );
}
```

## Site-Specific Adaptations

Components in the `websites/` directory provide customizations for specific AI platforms:

### Google Gemini Adaptations
- Custom styling to match Gemini's design language
- Specific DOM integration points
- Platform-specific behavior overrides

### Adding New Site Adaptations
1. Create a new directory under `websites/`
2. Implement site-specific component overrides
3. Register components with the corresponding adapter
4. Test integration with the target platform

## Best Practices

1. **Hook Integration**: Always use the provided hooks for state and plugin management
2. **Type Safety**: Use TypeScript interfaces for all component props
3. **Responsive Design**: Ensure components work across different screen sizes
4. **Error Boundaries**: Implement error handling for robust UI behavior
5. **Performance**: Use React.memo and useMemo for expensive operations
6. **Accessibility**: Include ARIA labels and keyboard navigation support

This component architecture ensures maintainable, scalable, and platform-adaptive user interfaces while providing seamless integration with the extension's core functionality.
