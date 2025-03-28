# UI Components

This directory contains reusable UI components for the MCP Control Center sidebar. These components provide a consistent look and feel across the sidebar interface.

## Components

### Typography

A component for consistent text styling across the sidebar.

**Props:**
- `variant`: The text style variant ('h1', 'h2', 'h3', 'h4', 'subtitle', 'body', 'small', 'caption')
- `className`: Optional additional CSS classes
- `children`: The text content

**Example:**
```tsx
<Typography variant="h3" className="tw-text-blue-500">
  Available Tools
</Typography>

<Typography variant="body">
  This is regular body text.
</Typography>

<Typography variant="caption" className="tw-mt-2">
  Last updated: 2 minutes ago
</Typography>
```

### Icon

A component for rendering consistent icons throughout the sidebar.

**Props:**
- `name`: The icon name to render
- `size`: Size of the icon ('sm', 'md', 'lg')
- `className`: Optional additional CSS classes

**Available Icons:**
- `settings`: Settings gear icon
- `info`: Information icon
- `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up`: Directional chevrons
- `refresh`: Refresh/reload icon
- `search`: Search magnifying glass
- `check`: Checkmark
- `x`: X/close icon
- `play`: Play button
- `tools`: Tools icon
- `server`: Server icon
- `lightning`: Lightning bolt
- `menu`: Hamburger menu

**Example:**
```tsx
<Icon name="settings" size="md" className="tw-text-blue-500" />
<Icon name="refresh" className="tw-animate-spin" />
<Icon name="chevron-right" size="sm" />
```

### Toggle

A toggle switch component for boolean settings.

**Props:**
- `label`: Text label for the toggle
- `checked`: Boolean state of the toggle
- `onChange`: Function called when the toggle state changes
- `className`: Optional additional CSS classes
- `size`: Size of the toggle ('sm', 'md')

**Example:**
```tsx
const [enabled, setEnabled] = useState(false);

<Toggle 
  label="Push Content Mode" 
  checked={enabled} 
  onChange={setEnabled}
  size="sm"
/>
```

### ResizeHandle

A draggable handle component for resizing elements.

**Props:**
- `onResize`: Function called with the new width when resizing
- `minWidth`: Minimum allowed width
- `maxWidth`: Maximum allowed width
- `className`: Optional additional CSS classes
- `defaultWidth`: Initial width

**Example:**
```tsx
const [width, setWidth] = useState(320);

<div style={{ width: `${width}px` }}>
  <ResizeHandle
    onResize={setWidth}
    minWidth={280}
    maxWidth={500}
    defaultWidth={width}
  />
  Content here
</div>
```

## Usage Guidelines

1. **Consistent Styling**: Always use these components instead of directly using HTML elements to ensure consistent styling.

2. **Dark Mode Support**: All components support dark mode out of the box. No additional configuration is needed.

3. **Responsive Design**: Components are designed to work well at different screen sizes.

4. **Accessibility**: Components include appropriate ARIA attributes and keyboard navigation support.

5. **Tailwind Integration**: Use the `cn()` utility function from `@src/lib/utils` to combine Tailwind classes with component classes.

## Example: Combining Components

```tsx
import { Typography, Icon, Toggle } from '../ui';
import { cn } from '@src/lib/utils';

const MyComponent = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  
  return (
    <div className="tw-p-4 tw-bg-white tw-rounded-lg tw-shadow-sm tw-border tw-border-gray-200 dark:tw-bg-gray-800 dark:tw-border-gray-700">
      <div className="tw-flex tw-items-center tw-justify-between tw-mb-4">
        <Typography variant="h3" className="tw-flex tw-items-center">
          <Icon name="settings" className="tw-mr-2 tw-text-blue-500" />
          Settings
        </Typography>
        
        <button
          className={cn(
            'tw-p-2 tw-rounded tw-transition-colors',
            'tw-bg-blue-100 hover:tw-bg-blue-200 dark:tw-bg-blue-900/30 dark:hover:tw-bg-blue-800/40'
          )}
        >
          <Icon name="refresh" size="sm" className="tw-text-blue-600" />
        </button>
      </div>
      
      <div className="tw-mt-4">
        <Toggle
          label="Enable Feature"
          checked={isEnabled}
          onChange={setIsEnabled}
        />
      </div>
    </div>
  );
};
``` 