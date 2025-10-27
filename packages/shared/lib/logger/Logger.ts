import type { ILogger, ILoggerStorage, LoggerConfig, LogLevelString } from './types.js';
import { LogLevel } from './types.js';
import { LoggerStorage } from './storage.js';

/**
 * Converts string log level to enum
 */
function parseLogLevel(level: LogLevel | LogLevelString): LogLevel {
  if (typeof level === 'number') {
    return level;
  }
  return LogLevel[level as keyof typeof LogLevel];
}

/**
 * Centralized logger with granular level control and persistence
 */
export class Logger implements ILogger {
  private level: LogLevel;
  private componentLevels: Map<string, LogLevel>;
  private namespace: string;
  private storage: ILoggerStorage | null;
  private defaultLevel: LogLevel;
  private isInitialized: boolean = false;

  constructor(namespace: string = '', config?: Partial<LoggerConfig>) {
    this.namespace = namespace;
    this.componentLevels = new Map();

    // Determine default level based on environment
    // In production, default to ERROR; in development, default to DEBUG
    const isProduction = this.isProductionEnvironment();
    this.defaultLevel = isProduction ? LogLevel.ERROR : LogLevel.DEBUG;

    // Initialize with default or provided level
    this.level = config?.level ?? this.defaultLevel;
    // this.level = LogLevel.DEBUG;

    // Set up component levels if provided
    if (config?.componentLevels) {
      Object.entries(config.componentLevels).forEach(([component, level]) => {
        this.componentLevels.set(component, level);
      });
    }

    // Set up storage if persistence is enabled
    this.storage = config?.persist !== false ? new LoggerStorage(config?.storageKey) : null;

    // Initialize from storage asynchronously
    if (this.storage) {
      this.initializeFromStorage();
    }
  }

  /**
   * Detect if running in production environment
   */
  private isProductionEnvironment(): boolean {
    // Check Vite environment variable (injected at build time)
    try {
      // @ts-ignore - import.meta.env is injected by Vite at build time
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        return import.meta.env.PROD === true;
      }
    } catch (e) {
      // import.meta not available, continue to fallback
    }

    // Check for common production indicators
    // In browser extensions, we can check the extension URL pattern
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const url = chrome.runtime.getURL('');
        // Production builds typically don't have 'dev' in the URL
        // This is a heuristic, adjust based on your build process
        return !url.includes('dev');
      } catch (e) {
        // If we can't determine, default to production for safety
      }
    }

    // Default to production for safety (logs disabled by default)
    return true;
  }

  /**
   * Initialize logger settings from Chrome Storage
   */
  private async initializeFromStorage(): Promise<void> {
    if (!this.storage) return;

    try {
      // Load global level
      const storedLevel = await this.storage.getLevel();
      if (storedLevel !== null) {
        this.level = storedLevel;
      }

      // Load component levels
      const componentLevels = await this.storage.getComponentLevels();
      Object.entries(componentLevels).forEach(([component, level]) => {
        this.componentLevels.set(component, level);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('[Logger] Failed to initialize from storage:', error);
    }
  }

  /**
   * Get the effective log level for this logger instance
   */
  private getEffectiveLevel(): LogLevel {
    // Check if there's a component-specific level
    if (this.namespace && this.componentLevels.has(this.namespace)) {
      return this.componentLevels.get(this.namespace)!;
    }

    // Return global level
    return this.level;
  }

  /**
   * Check if a message should be logged based on current level
   */
  private shouldLog(messageLevel: LogLevel): boolean {
    return messageLevel >= this.getEffectiveLevel();
  }

  /**
   * Format the log message with namespace prefix
   */
  private formatMessage(...args: any[]): any[] {
    if (this.namespace) {
      return [`[${this.namespace}]`, ...args];
    }
    return args;
  }

  /**
   * Log a debug message
   */
  debug(...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(...this.formatMessage(...args));
    }
  }

  /**
   * Log an info message
   */
  info(...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(...this.formatMessage(...args));
    }
  }

  /**
   * Log a warning message
   */
  warn(...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(...this.formatMessage(...args));
    }
  }

  /**
   * Log an error message
   */
  error(...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(...this.formatMessage(...args));
    }
  }

  /**
   * Set the global log level
   */
  setLevel(level: LogLevel | LogLevelString): void {
    this.level = parseLogLevel(level);

    // Persist to storage if enabled
    if (this.storage) {
      this.storage.setLevel(this.level).catch(error => {
        console.error('[Logger] Failed to persist level:', error);
      });
    }
  }

  /**
   * Get the current global log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set a component-specific log level
   */
  setComponentLevel(component: string, level: LogLevel | LogLevelString): void {
    const parsedLevel = parseLogLevel(level);
    this.componentLevels.set(component, parsedLevel);

    // Persist to storage if enabled
    if (this.storage) {
      this.storage.setComponentLevel(component, parsedLevel).catch(error => {
        console.error('[Logger] Failed to persist component level:', error);
      });
    }
  }

  /**
   * Get a component-specific log level
   */
  getComponentLevel(component: string): LogLevel | undefined {
    return this.componentLevels.get(component);
  }

  /**
   * Reset all log levels to environment defaults
   */
  resetToDefaults(): void {
    this.level = this.defaultLevel;
    this.componentLevels.clear();

    // Clear storage if enabled
    if (this.storage) {
      this.storage.clear().catch(error => {
        console.error('[Logger] Failed to clear storage:', error);
      });
    }
  }

  /**
   * Create a child logger with a specific namespace
   */
  child(namespace: string): Logger {
    const childLogger = new Logger(namespace, {
      level: this.level,
      componentLevels: Object.fromEntries(this.componentLevels),
      persist: false, // Child loggers don't persist independently
    });
    return childLogger;
  }

  /**
   * Wait for storage initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    if (!this.storage) return;

    // Wait for initialization with timeout
    const timeout = 2000; // 2 seconds
    const startTime = Date.now();

    while (!this.isInitialized && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
