export interface GlobalSettings {
  theme: 'light' | 'dark' | 'system';
  autoSubmit: boolean;
  debugMode: boolean;
  sidebarWidth: number;
  isPushMode: boolean;
  language: string;
  notifications: boolean;
}

export interface ServerConfig {
  uri: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'reconnecting';

export interface Tool {
  name: string;
  description: string;
  // Legacy field used in some UI components
  schema?: any;
  // Newer field preferred going forward
  input_schema: any; // Keeping 'any' as per original spec, can be refined later
}

export interface DetectedTool {
  name: string;
  parameters: Record<string, any>;
  source: string;
  confidence: number;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  result: any; // Keeping 'any' as per original spec for broad compatibility
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export interface SidebarState {
  isVisible: boolean;
  isMinimized: boolean;
  position: 'left' | 'right';
  width: number;
}

export interface UserPreferences {
  autoSubmit: boolean;
  notifications: boolean;
  theme: 'light' | 'dark' | 'system';
  language: string;
  isPushMode: boolean;
  sidebarWidth: number;
  isMinimized: boolean;
  customInstructions: string;
  customInstructionsEnabled: boolean;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  duration?: number; // Optional duration in milliseconds
}
