/**
 * Message type definitions for MCP communication
 * 
 * These types ensure consistency between the context bridge, MCP client, and background script
 */

import type { ServerConfig, ConnectionStatus, Tool } from './stores';

// Base message structure for all communication
export interface BaseMessage {
  type: string;
  payload?: any;
  origin: 'content' | 'background' | 'popup' | 'options';
  timestamp: number;
  id?: string;
}

// Request message structure
export interface RequestMessage<T = any> extends BaseMessage {
  payload: T;
  expectResponse?: boolean;
}

// Response message structure
export interface ResponseMessage<T = any> extends BaseMessage {
  payload?: T;
  error?: string;
  success?: boolean;
  processingTime?: number;
}

// MCP-specific message types and payloads

// Tool execution
export interface CallToolRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface CallToolResponse {
  result: any;
}

// Connection status
export interface GetConnectionStatusRequest {}

export interface GetConnectionStatusResponse {
  status: ConnectionStatus;
  isConnected: boolean;
  timestamp: number;
}

// Tools listing
export interface GetToolsRequest {
  forceRefresh?: boolean;
}

export interface GetToolsResponse {
  tools: Tool[];
}

// Force reconnect
export interface ForceReconnectRequest {}

export interface ForceReconnectResponse {
  isConnected: boolean;
  message?: string;
  error?: string;
}

// Server configuration
export interface GetServerConfigRequest {}

export interface GetServerConfigResponse {
  config: ServerConfig;
}

export interface UpdateServerConfigRequest {
  config: Partial<ServerConfig>;
}

export interface UpdateServerConfigResponse {
  success: boolean;
}

// Heartbeat
export interface HeartbeatRequest {
  timestamp: number;
}

export interface HeartbeatResponse {
  timestamp: number;
  isConnected: boolean;
  receivedTimestamp: number;
}

// Broadcast message types (one-way messages from background to content)

export interface ConnectionStatusChangedBroadcast {
  status: ConnectionStatus;
  error?: string;
  isConnected: boolean;
  timestamp: number;
}

export interface ToolUpdateBroadcast {
  tools: Tool[];
}

export interface ServerConfigUpdatedBroadcast {
  config: ServerConfig;
}

export interface HeartbeatResponseBroadcast {
  timestamp: number;
  isConnected: boolean;
}

// Message type union for better type safety
export type McpMessageType = 
  | 'mcp:call-tool'
  | 'mcp:get-connection-status'
  | 'mcp:get-tools'
  | 'mcp:force-reconnect'
  | 'mcp:get-server-config'
  | 'mcp:update-server-config'
  | 'mcp:heartbeat'
  | 'connection:status-changed'
  | 'mcp:tool-update'
  | 'mcp:server-config-updated'
  | 'mcp:heartbeat-response';

// Utility type for request/response mapping
export interface McpMessageMap {
  'mcp:call-tool': {
    request: CallToolRequest;
    response: CallToolResponse;
  };
  'mcp:get-connection-status': {
    request: GetConnectionStatusRequest;
    response: GetConnectionStatusResponse;
  };
  'mcp:get-tools': {
    request: GetToolsRequest;
    response: GetToolsResponse;
  };
  'mcp:force-reconnect': {
    request: ForceReconnectRequest;
    response: ForceReconnectResponse;
  };
  'mcp:get-server-config': {
    request: GetServerConfigRequest;
    response: GetServerConfigResponse;
  };
  'mcp:update-server-config': {
    request: UpdateServerConfigRequest;
    response: UpdateServerConfigResponse;
  };
  'mcp:heartbeat': {
    request: HeartbeatRequest;
    response: HeartbeatResponse;
  };
}

// Error categories for better error handling
export enum ErrorCategory {
  CONNECTION_ERROR = 'connection_error',
  TOOL_ERROR = 'tool_error',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

// Enhanced error structure
export interface McpError {
  category: ErrorCategory;
  message: string;
  code?: string | number;
  context?: Record<string, any>;
  timestamp: number;
}

// Message validation helpers
export function isValidMessageType(type: string): type is McpMessageType {
  const validTypes: McpMessageType[] = [
    'mcp:call-tool',
    'mcp:get-connection-status',
    'mcp:get-tools',
    'mcp:force-reconnect',
    'mcp:get-server-config',
    'mcp:update-server-config',
    'mcp:heartbeat',
    'connection:status-changed',
    'mcp:tool-update',
    'mcp:server-config-updated',
    'mcp:heartbeat-response'
  ];
  
  return validTypes.includes(type as McpMessageType);
}

export function createRequestMessage<T extends keyof McpMessageMap>(
  type: T,
  payload: McpMessageMap[T]['request'],
  id?: string
): RequestMessage<McpMessageMap[T]['request']> {
  return {
    type,
    payload,
    origin: 'content',
    timestamp: Date.now(),
    id: id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    expectResponse: true
  };
}

export function createResponseMessage<T extends keyof McpMessageMap>(
  type: T,
  payload: McpMessageMap[T]['response'],
  originalMessage: RequestMessage,
  success: boolean = true,
  processingTime?: number
): ResponseMessage<McpMessageMap[T]['response']> {
  return {
    type,
    payload,
    origin: 'background',
    timestamp: Date.now(),
    id: originalMessage.id,
    success,
    processingTime
  };
}

export function createErrorResponse(
  originalMessage: RequestMessage,
  error: string | McpError,
  processingTime?: number
): ResponseMessage {
  return {
    type: originalMessage.type,
    origin: 'background',
    timestamp: Date.now(),
    id: originalMessage.id,
    error: typeof error === 'string' ? error : error.message,
    success: false,
    processingTime
  };
}

export function createBroadcastMessage<T>(
  type: McpMessageType,
  payload: T
): BaseMessage {
  return {
    type,
    payload,
    origin: 'background',
    timestamp: Date.now()
  };
}
