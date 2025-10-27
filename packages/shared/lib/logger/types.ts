/**
 * Log levels in ascending order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * String representations of log levels
 */
export type LogLevelString = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Global log level */
  level: LogLevel;
  /** Component-specific log levels */
  componentLevels?: Record<string, LogLevel>;
  /** Whether to persist settings to Chrome Storage */
  persist?: boolean;
  /** Chrome Storage key for persistence */
  storageKey?: string;
}

/**
 * Logger interface
 */
export interface ILogger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  setLevel(level: LogLevel | LogLevelString): void;
  getLevel(): LogLevel;
  setComponentLevel(component: string, level: LogLevel | LogLevelString): void;
  getComponentLevel(component: string): LogLevel | undefined;
  resetToDefaults(): void;
}

/**
 * Storage interface for log level persistence
 */
export interface ILoggerStorage {
  getLevel(): Promise<LogLevel | null>;
  setLevel(level: LogLevel): Promise<void>;
  getComponentLevels(): Promise<Record<string, LogLevel>>;
  setComponentLevel(component: string, level: LogLevel): Promise<void>;
  clear(): Promise<void>;
}
