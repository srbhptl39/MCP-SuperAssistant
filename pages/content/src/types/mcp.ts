/**
 * MCP Types and Interfaces
 *
 * This file contains all types and interfaces related to the Model Context Protocol (MCP)
 * functionality in the extension.
 */

// Primitive types from MCP
export type PrimitiveType = 'resource' | 'tool' | 'prompt';

export type PrimitiveValue = {
  name: string;
  description?: string;
  uri?: string;
  inputSchema?: any;
  arguments?: any[];
};

export type Primitive = {
  type: PrimitiveType;
  value: PrimitiveValue;
};

// Tool representation for UI and communication
export interface Tool {
  name: string;
  description?: string;
  schema: string; // JSON string of the tool's input schema
}

// Callback types for MCP operations
export type ToolCallCallback = (result: any, error?: string) => void;
export type ConnectionStatusCallback = (isConnected: boolean) => void;

// Request tracking for tool calls
export interface ToolCallRequest {
  requestId: string;
  toolName: string;
  args: { [key: string]: unknown };
  callback: ToolCallCallback;
  timestamp: number;
}

// Props for the AvailableTools component
export interface AvailableToolsProps {
  tools: Tool[];
  onExecute: (tool: Tool) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

// Server configuration interface
export interface ServerConfig {
  uri: string;
  token?: string;
}

// Interface for the background communication hook
export interface BackgroundCommunication {
  serverStatus: 'connected' | 'disconnected' | 'error' | 'reconnecting';
  availableTools: Tool[];
  callTool: (toolName: string, args: { [key: string]: unknown }) => Promise<any>;
  getAvailableTools: () => Promise<Tool[]>;
  sendMessage: (tool: any) => Promise<string>;
  refreshTools: (forceRefresh?: boolean) => Promise<Tool[]>;
  forceReconnect: () => Promise<boolean>;
  isReconnecting: boolean;
  getServerConfig: () => Promise<ServerConfig>;
  updateServerConfig: (config: ServerConfig) => Promise<boolean>;
}
