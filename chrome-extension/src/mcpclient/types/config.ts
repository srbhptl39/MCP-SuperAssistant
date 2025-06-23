import type { TransportType, PluginConfig } from './plugin.js';

export interface GlobalConfig {
  timeout: number;
  maxRetries: number;
  healthCheckInterval: number;
  reconnectDelay: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface SSEPluginConfig extends PluginConfig {
  keepAlive?: boolean;
  connectionTimeout?: number;
  readTimeout?: number;
  headers?: Record<string, string>;
}

export interface WebSocketPluginConfig extends PluginConfig {
  protocols?: string[];
  pingInterval?: number;
  pongTimeout?: number;
  maxReconnectAttempts?: number;
  binaryType?: 'blob' | 'arraybuffer';
}

export interface StreamableHttpPluginConfig extends PluginConfig {
  keepAlive?: boolean;
  connectionTimeout?: number;
  readTimeout?: number;
  headers?: Record<string, string>;
  fallbackToSSE?: boolean;
  maxRetries?: number;
}

export interface ClientConfig {
  defaultTransport: TransportType;
  defaultUri: string;
  plugins: {
    sse?: SSEPluginConfig;
    websocket?: WebSocketPluginConfig;
    'streamable-http'?: StreamableHttpPluginConfig;
  };
  global: GlobalConfig;
}

export interface ConnectionRequest {
  uri: string;
  type: TransportType;
  config?: PluginConfig;
}

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  defaultTransport: 'sse',
  defaultUri: 'http://localhost:3006/sse',
  plugins: {
    sse: {
      keepAlive: true,
      connectionTimeout: 5000,
      readTimeout: 30000,
    },
    websocket: {
      protocols: ['mcp-v1'],
      pingInterval: 30000,
      pongTimeout: 5000,
      maxReconnectAttempts: 3,
      binaryType: 'arraybuffer',
    },
    'streamable-http': {
      keepAlive: true,
      connectionTimeout: 5000,
      readTimeout: 30000,
      fallbackToSSE: false,
      maxRetries: 2,
    },
  },
  global: {
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
    reconnectDelay: 2000,
    logLevel: 'info',
  },
};