/**
 * Centralized logging system for MCP SuperAssistant
 *
 * Features:
 * - Granular log level control (DEBUG, INFO, WARN, ERROR, NONE)
 * - Component-specific log levels
 * - Chrome Storage persistence across page reloads
 * - Auto-detection of production environment
 * - Runtime control via window API
 * - Zero overhead when disabled
 *
 * Usage:
 * ```typescript
 * import { createLogger } from '@/shared/logger';
 *
 * const logger = createLogger('MyComponent');
 * logger.debug('Debug message');
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error message');
 * ```
 *
 * Runtime control (via browser console):
 * ```javascript
 * window.setLogLevel('DEBUG')
 * window.getLogLevel()
 * window.setComponentLogLevel('PluginRegistry', 'DEBUG')
 * window.resetLogLevel()
 * ```
 */

export { Logger } from './Logger.js';
export { LoggerStorage } from './storage.js';
export { LogLevel } from './types.js';
export type { ILogger, ILoggerStorage, LoggerConfig, LogLevelString } from './types.js';

import { Logger } from './Logger.js';
import type { LoggerConfig } from './types.js';

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Create or get the global logger instance
 */
export function getGlobalLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger('', config);
  }
  return globalLogger;
}

/**
 * Create a namespaced logger instance
 *
 * @param namespace - Component or module name for log prefixing
 * @param config - Optional logger configuration
 * @returns Logger instance
 */
export function createLogger(namespace: string, config?: Partial<LoggerConfig>): Logger {
  // If no global logger exists, create one
  if (!globalLogger) {
    globalLogger = new Logger('', config);
  }

  // Create a child logger with the namespace
  return globalLogger.child(namespace);
}

/**
 * Initialize the global logger
 * Call this once during application initialization
 *
 * Log levels are automatically controlled by environment:
 * - Development (import.meta.env.DEV): DEBUG level (all logs enabled)
 * - Production (import.meta.env.PROD): ERROR level (only errors enabled)
 *
 * To change log level in code:
 * ```typescript
 * import { getGlobalLogger, LogLevel } from '@extension/shared/lib/logger';
 *
 * const logger = getGlobalLogger();
 * logger.setLevel(LogLevel.DEBUG); // Enable all logs
 * logger.setComponentLevel('ComponentName', LogLevel.WARN); // Component-specific
 * ```
 */
export function initializeLogger(config?: Partial<LoggerConfig>): Logger {
  const logger = getGlobalLogger(config);
  return logger;
}

/**
 * Default export for convenience
 */
export default {
  createLogger,
  getGlobalLogger,
  initializeLogger,
};
