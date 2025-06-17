import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export type TransportType = 'sse' | 'websocket';

export interface PluginConfig {
  [key: string]: any;
}

export interface PluginMetadata {
  readonly name: string;
  readonly version: string;
  readonly transportType: TransportType;
  readonly description?: string;
  readonly author?: string;
}

export interface ITransportPlugin {
  readonly metadata: PluginMetadata;
  
  initialize(config: PluginConfig): Promise<void>;
  connect(uri: string): Promise<Transport>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  isSupported(uri: string): boolean;
  getDefaultConfig(): PluginConfig;
  
  // Health monitoring
  isHealthy(): Promise<boolean>;
  
  // Tool operations
  callTool(client: Client, toolName: string, args: any): Promise<any>;
  getPrimitives(client: Client): Promise<any[]>;
}

export interface PluginEvents {
  'plugin:initialized': { plugin: ITransportPlugin };
  'plugin:connected': { plugin: ITransportPlugin; uri: string };
  'plugin:disconnected': { plugin: ITransportPlugin };
  'plugin:error': { plugin: ITransportPlugin; error: Error };
  'plugin:health-check': { plugin: ITransportPlugin; healthy: boolean };
}