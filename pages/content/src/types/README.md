# Types Directory

This directory contains TypeScript type definitions and interfaces used throughout the extension.

## Files

### mcp.ts

Contains all types and interfaces related to the Model Context Protocol (MCP) functionality:

- **Primitive Types**: `PrimitiveType`, `PrimitiveValue`, and `Primitive` define the structure of primitives returned by the MCP server.
- **Tool Interface**: Defines the structure of tools for UI display and communication.
- **Callback Types**: `ToolCallCallback` and `ConnectionStatusCallback` for handling MCP operations.
- **Request Tracking**: `ToolCallRequest` for tracking tool call requests.
- **Component Props**: `AvailableToolsProps` for the AvailableTools component.
- **Communication Interface**: `BackgroundCommunication` for the background communication hook.
- Includes `isReconnecting` property to track reconnection status.

These centralized type definitions ensure consistency across the codebase and make it easier to maintain and update the type system as the extension evolves. 