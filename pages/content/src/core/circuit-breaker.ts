/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by monitoring failures and temporarily disabling
 * failing operations when failure rate exceeds thresholds.
 */

import { eventBus } from '../events/event-bus';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  eventBus?: typeof eventBus;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  private eventBus?: typeof eventBus;

  constructor(
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringWindow: 300000, // 5 minutes
    }
  ) {}

  initialize(config?: { eventBus?: typeof eventBus }): void {
    if (config?.eventBus) {
      this.eventBus = config.eventBus;
    } else {
      this.eventBus = eventBus;
    }
    console.log('[CircuitBreaker] Initialized with config:', this.config);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName = 'unknown'): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker is OPEN for operation: ${operationName}`);
        this.eventBus?.emit('error:circuit-breaker-blocked', {
          operation: operationName,
          state: this.state,
          nextAttemptTime: this.nextAttemptTime,
          error,
        });
        throw error;
      } else {
        // Time to try half-open
        this.state = 'half-open';
        this.eventBus?.emit('error:circuit-breaker-half-open', {
          operation: operationName,
          state: this.state,
        });
      }
    }

    try {
      const result = await operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(error as Error, operationName);
      throw error;
    }
  }

  /**
   * Execute a synchronous function with circuit breaker protection
   */
  executeSync<T>(operation: () => T, operationName = 'unknown'): T {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker is OPEN for operation: ${operationName}`);
        this.eventBus?.emit('error:circuit-breaker-blocked', {
          operation: operationName,
          state: this.state,
          nextAttemptTime: this.nextAttemptTime,
          error,
        });
        throw error;
      } else {
        // Time to try half-open
        this.state = 'half-open';
        this.eventBus?.emit('error:circuit-breaker-half-open', {
          operation: operationName,
          state: this.state,
        });
      }
    }

    try {
      const result = operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(error as Error, operationName);
      throw error;
    }
  }

  private onSuccess(operationName: string): void {
    this.successCount++;
    
    if (this.state === 'half-open') {
      // Successful operation in half-open state - close the circuit
      this.state = 'closed';
      this.failureCount = 0;
      this.eventBus?.emit('error:circuit-breaker-closed', {
        operation: operationName,
        state: this.state,
        stats: this.getStats(),
      });
    }
  }

  private onFailure(error: Error, operationName: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Clean up old failures outside the monitoring window
    const cutoffTime = Date.now() - this.config.monitoringWindow;
    if (this.lastFailureTime < cutoffTime) {
      this.failureCount = 1; // Reset count but keep this failure
    }

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      
      this.eventBus?.emit('error:circuit-breaker-opened', {
        operation: operationName,
        state: this.state,
        error,
        failureCount: this.failureCount,
        nextAttemptTime: this.nextAttemptTime,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Force the circuit breaker to open (for testing or emergency situations)
   */
  forceOpen(resetTimeout?: number): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + (resetTimeout || this.config.resetTimeout);
    this.eventBus?.emit('error:circuit-breaker-forced-open', {
      state: this.state,
      nextAttemptTime: this.nextAttemptTime,
    });
  }

  /**
   * Force the circuit breaker to close (reset)
   */
  forceClose(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttemptTime = 0;
    this.eventBus?.emit('error:circuit-breaker-forced-closed', {
      state: this.state,
    });
  }

  /**
   * Check if the circuit breaker allows operations
   */
  isOperational(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;
    if (this.state === 'open' && Date.now() >= this.nextAttemptTime) return true;
    return false;
  }

  cleanup(): void {
    // Reset state
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    console.log('[CircuitBreaker] Cleaned up');
  }
}

// Create and export singleton instance
export const circuitBreaker = new CircuitBreaker();

// Export class for custom instances
export { CircuitBreaker };
