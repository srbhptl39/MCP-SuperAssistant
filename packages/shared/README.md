# Shared Package (`@extension/shared`)

This package contains shared TypeScript types, utilities, and constants used across the MCP SuperAssistant extension, particularly between the content script and background script components.

## Contents

### Types
- **`toolCall.ts`**: TypeScript definitions for MCP tool calls, execution results, and related data structures

## Usage

To use the shared code in other packages, add the following to your `package.json`:

```json
{
  "dependencies": {
    "@extension/shared": "workspace:*"
  }
}
```

Then import the shared types and utilities:

```typescript
// Import shared types
import type { ToolCall, ToolResult } from '@extension/shared';

// Use in your code
const toolCall: ToolCall = {
  // ... tool call data
};
```

## Purpose

This package ensures type consistency and code reuse across:
- Content script components
- Background script/service worker
- Popup and options pages
- Development utilities

Centralizing shared code here prevents duplication and ensures type safety across the entire extension.
