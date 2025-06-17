import type { ITransportPlugin, TransportType } from './plugin.js';

export interface ClientEvents {
  'client:initialized': { config: any };
  'client:connecting': { uri: string; type: TransportType };
  'client:connected': { uri: string; type: TransportType };
  'client:disconnecting': { type: TransportType };
  'client:disconnected': { type: TransportType };
  'client:error': { error: Error; context?: string };
  'client:plugin-switched': { from: TransportType | null; to: TransportType };
}

export interface RegistryEvents {
  'registry:plugin-registered': { plugin: ITransportPlugin };
  'registry:plugin-unregistered': { type: TransportType };
  'registry:plugins-loaded': { count: number };
}

export interface ConnectionEvents {
  'connection:status-changed': { 
    isConnected: boolean; 
    type: TransportType | null;
    error?: string;
  };
  'connection:health-check': { 
    healthy: boolean; 
    type: TransportType;
    timestamp: number;
  };
  'connection:reconnecting': { 
    attempt: number; 
    maxAttempts: number; 
    type: TransportType;
  };
}

export interface ToolEvents {
  'tool:call-started': { toolName: string; args: any };
  'tool:call-completed': { toolName: string; result: any; duration: number };
  'tool:call-failed': { toolName: string; error: Error; duration: number };
  'tools:list-updated': { tools: any[]; type: TransportType };
}

export type AllEvents = ClientEvents & RegistryEvents & ConnectionEvents & ToolEvents;