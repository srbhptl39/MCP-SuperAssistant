/**
 * Global Error Handler
 * 
 * Centralized error handling and reporting system that integrates with
 * the event bus and circuit breaker pattern.
 */

import { eventBus } from '../events/event-bus';
import type { CircuitBreaker } from './circuit-breaker';

export interface ErrorContext {
  component?: string;
  operation?: string;
  user?: string;
  source?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  fromEventBus?: boolean; // Flag to prevent recursive error handling
}

export interface ErrorReport {
  error: Error;
  context: ErrorContext;
  timestamp: number;
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  handled: boolean;
}

class GlobalErrorHandler {
  private initialized = false;
  private errorReports: ErrorReport[] = [];
  private maxReports = 100;
  private circuitBreaker?: CircuitBreaker;
  private errorCounts = new Map<string, { count: number; lastSeen: number }>();

  /**
   * Initialize the global error handler
   */
  initialize(eventBusInstance: typeof eventBus, circuitBreakerInstance?: CircuitBreaker): void {
    if (this.initialized) {
      console.warn('[GlobalErrorHandler] Already initialized');
      return;
    }

    this.circuitBreaker = circuitBreakerInstance;

    // Set up global error handlers
    this.setupGlobalHandlers();

    // Set up event bus integration
    this.setupEventBusIntegration();

    this.initialized = true;
    console.log('[GlobalErrorHandler] Initialized successfully');
  }

  /**
   * Set up global JavaScript error handlers
   */
  private setupGlobalHandlers(): void {
    // Handle uncaught exceptions
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        component: 'window',
        operation: 'global-error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.handleError(error, {
        component: 'window',
        operation: 'unhandled-promise-rejection',
      });
    });

    // Handle Chrome extension context invalidation
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Monitor for runtime errors without overriding the API
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // This is just for monitoring, we don't interfere with the message flow
        return false;
      });
    }
  }

  /**
   * Set up event bus integration
   */
  private setupEventBusIntegration(): void {
    // Listen for error events from other parts of the application
    eventBus.on('error:unhandled', ({ error, context }) => {
      try {
        // Add a marker to prevent recursive handling
        const contextWithMarker = typeof context === 'string'
          ? { operation: context, fromEventBus: true }
          : { ...context, fromEventBus: true };
        this.handleError(error, contextWithMarker);
      } catch (handlerError) {
        // Prevent recursive error handling by just logging to console
        console.error('[GlobalErrorHandler] Error in error:unhandled handler:', handlerError);
      }
    });

    eventBus.on('plugin:activation-failed', ({ name, error }) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, {
        component: 'plugin-system',
        operation: 'plugin-activation',
        metadata: { pluginName: name },
      });
    });

    eventBus.on('connection:error', ({ error }) => {
      this.handleError(new Error(error), {
        component: 'connection',
        operation: 'mcp-connection',
      });
    });
  }

  /**
   * Handle an error with context
   */
  handleError(error: Error, context: ErrorContext = {}, severity: ErrorReport['severity'] = 'medium'): void {
    const errorId = this.generateErrorId();
    const report: ErrorReport = {
      error,
      context,
      timestamp: Date.now(),
      id: errorId,
      severity,
      handled: true,
    };

    // Add to error reports
    this.addErrorReport(report);

    // Update error counts for pattern detection
    this.updateErrorCounts(error, context);

    // Log the error
    this.logError(report);

    // Don't emit error:unhandled event if we're already handling an error from the event bus
    // This prevents recursive loops
    if (!context.fromEventBus &&
        context.operation !== 'event-listener-error:unhandled' &&
        context.operation !== 'once-event-listener-error:unhandled' &&
        context.operation !== 'wildcard-event-listener') {
      // Emit error event
      eventBus.emit('error:unhandled', { error, context });
    }

    // Attempt recovery if circuit breaker is available
    if (this.circuitBreaker && severity === 'critical') {
      this.attemptRecovery(error, context);
    }

    // Check for error patterns
    this.checkErrorPatterns(error, context);
  }

  /**
   * Capture an exception (similar to Sentry)
   */
  captureException(error: Error, context: ErrorContext = {}, severity: ErrorReport['severity'] = 'low'): void {
    this.handleError(error, context, severity);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(message: string, category: string = 'default', data?: Record<string, any>): void {
    eventBus.emit('error:breadcrumb', {
      message,
      category,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByComponent: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    recentErrors: ErrorReport[];
  } {
    const errorsByComponent: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};

    this.errorReports.forEach(report => {
      const component = report.context.component || 'unknown';
      errorsByComponent[component] = (errorsByComponent[component] || 0) + 1;
      errorsBySeverity[report.severity] = (errorsBySeverity[report.severity] || 0) + 1;
    });

    return {
      totalErrors: this.errorReports.length,
      errorsByComponent,
      errorsBySeverity,
      recentErrors: this.errorReports.slice(-10),
    };
  }

  /**
   * Clear error reports
   */
  clearErrorReports(): void {
    this.errorReports = [];
    this.errorCounts.clear();
    console.log('[GlobalErrorHandler] Error reports cleared');
  }

  /**
   * Private helper methods
   */
  private addErrorReport(report: ErrorReport): void {
    this.errorReports.push(report);
    if (this.errorReports.length > this.maxReports) {
      this.errorReports.shift();
    }
  }

  private updateErrorCounts(error: Error, context: ErrorContext): void {
    const key = `${error.name}:${context.component || 'unknown'}:${context.operation || 'unknown'}`;
    const existing = this.errorCounts.get(key) || { count: 0, lastSeen: 0 };
    this.errorCounts.set(key, {
      count: existing.count + 1,
      lastSeen: Date.now(),
    });
  }

  private logError(report: ErrorReport): void {
    const logMethod = report.severity === 'critical' ? console.error : 
                     report.severity === 'high' ? console.error :
                     report.severity === 'medium' ? console.warn : console.log;

    logMethod(
      `[GlobalErrorHandler] ${report.severity.toUpperCase()} Error [${report.id}]:`,
      report.error.message,
      '\nContext:', report.context,
      '\nStack:', report.error.stack
    );
  }

  private attemptRecovery(error: Error, context: ErrorContext): void {
    const strategy = this.determineRecoveryStrategy(error, context);
    
    eventBus.emit('error:recovery-attempted', { error, strategy });
    
    switch (strategy) {
      case 'reload-page':
        console.warn('[GlobalErrorHandler] Attempting page reload recovery');
        setTimeout(() => window.location.reload(), 1000);
        break;
      case 'reset-component':
        console.warn('[GlobalErrorHandler] Attempting component reset recovery');
        eventBus.emit('component:reset', { component: context.component });
        break;
      case 'fallback-mode':
        console.warn('[GlobalErrorHandler] Switching to fallback mode');
        eventBus.emit('app:fallback-mode', { reason: error.message });
        break;
      default:
        console.warn('[GlobalErrorHandler] No recovery strategy available');
    }
  }

  private determineRecoveryStrategy(error: Error, context: ErrorContext): string {
    if (error.message.includes('Extension context invalidated')) {
      return 'reload-page';
    }
    if (context.component === 'sidebar' || context.component === 'ui') {
      return 'reset-component';
    }
    if (context.component === 'plugin-system') {
      return 'fallback-mode';
    }
    return 'none';
  }

  private checkErrorPatterns(error: Error, context: ErrorContext): void {
    const key = `${error.name}:${context.component || 'unknown'}:${context.operation || 'unknown'}`;
    const errorData = this.errorCounts.get(key);
    
    if (errorData && errorData.count >= 5) {
      console.warn(`[GlobalErrorHandler] Error pattern detected: ${key} occurred ${errorData.count} times`);
      eventBus.emit('error:pattern-detected', {
        pattern: key,
        count: errorData.count,
        error,
        context,
      });
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup error handler
   */
  cleanup(): void {
    this.errorReports = [];
    this.errorCounts.clear();
    this.initialized = false;
    console.log('[GlobalErrorHandler] Cleaned up');
  }
}

// Create and export singleton instance
export const globalErrorHandler = new GlobalErrorHandler();

// Export class for custom instances
export { GlobalErrorHandler };

// Export as default for backward compatibility
export default globalErrorHandler;
