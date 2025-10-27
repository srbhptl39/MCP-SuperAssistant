/**
 * Performance Monitor
 * 
 * Monitors application performance, tracks metrics, and provides
 * insights for optimization and debugging.
 */

import { eventBus } from '../events/event-bus';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('PerformanceMonitor');

export interface PerformanceMeasurement {
  name: string;
  duration: number;
  timestamp: number;
  context?: Record<string, any>;
  type: 'sync' | 'async';
}

export interface MemoryUsage {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

export interface PerformanceStats {
  measurements: PerformanceMeasurement[];
  memorySnapshots: MemoryUsage[];
  slowOperations: PerformanceMeasurement[];
  averageDurations: Record<string, number>;
}

class PerformanceMonitor {
  private initialized = false;
  private measurements: PerformanceMeasurement[] = [];
  private memorySnapshots: MemoryUsage[] = [];
  private maxMeasurements = 1000;
  private slowThreshold = 1000; // 1 second
  private memoryCheckInterval?: NodeJS.Timeout;
  private performanceObserver?: PerformanceObserver;

  /**
   * Initialize the performance monitor
   */
  initialize(eventBusInstance: typeof eventBus): void {
    if (this.initialized) {
      logger.warn('[PerformanceMonitor] Already initialized');
      return;
    }

    // Set up Performance Observer if available
    this.setupPerformanceObserver();

    // Set up memory monitoring
    this.setupMemoryMonitoring();

    // Set up event bus integration
    this.setupEventBusIntegration();

    this.initialized = true;
    logger.debug('[PerformanceMonitor] Initialized successfully');
  }

  /**
   * Set up Performance Observer for browser performance metrics
   */
  private setupPerformanceObserver(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.duration > 0) {
              this.recordMeasurement({
                name: entry.name || 'browser-performance',
                duration: entry.duration,
                timestamp: entry.startTime + performance.timeOrigin,
                type: 'async',
                context: {
                  entryType: entry.entryType,
                  startTime: entry.startTime,
                },
              });
            }
          });
        });

        // Observe different types of performance entries
        this.performanceObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch (error) {
        logger.warn('[PerformanceMonitor] Failed to set up PerformanceObserver:', error);
      }
    }
  }

  /**
   * Set up memory monitoring
   */
  private setupMemoryMonitoring(): void {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      this.memoryCheckInterval = setInterval(() => {
        this.captureMemorySnapshot();
      }, 30000); // Every 30 seconds
    }
  }

  /**
   * Set up event bus integration
   */
  private setupEventBusIntegration(): void {
    // Listen for events that might indicate performance issues
    eventBus.on('error:unhandled', ({ error, context }) => {
      this.mark('error-occurred', { error: error.message, context });
    });

    eventBus.on('plugin:activation-failed', ({ name, error }) => {
      this.mark('plugin-activation-failed', { plugin: name, error: String(error) });
    });
  }

  /**
   * Time a function execution
   */
  time<T>(name: string, fn: () => T | Promise<T>, context?: Record<string, any>): T | Promise<T> {
    const start = performance.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          this.recordMeasurement({
            name,
            duration,
            timestamp: Date.now(),
            type: 'async',
            context,
          });
        }) as T;
      } else {
        const duration = performance.now() - start;
        this.recordMeasurement({
          name,
          duration,
          timestamp: Date.now(),
          type: 'sync',
          context,
        });
        return result;
      }
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMeasurement({
        name: `${name}_error`,
        duration,
        timestamp: Date.now(),
        type: 'sync',
        context: { ...context, error: String(error) },
      });
      throw error;
    }
  }

  /**
   * Mark a performance point
   */
  mark(name: string, context?: Record<string, any>): void {
    this.recordMeasurement({
      name,
      duration: 0,
      timestamp: Date.now(),
      type: 'sync',
      context,
    });
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark?: string): PerformanceMeasurement | null {
    const measurements = this.measurements;
    const startEntry = measurements.find(m => m.name === startMark);
    
    if (!startEntry) {
      logger.warn(`Start mark '${startMark}' not found`);
      return null;
    }

    const endEntry = endMark ? 
      measurements.find(m => m.name === endMark) : 
      { timestamp: Date.now() };

    if (!endEntry) {
      logger.warn(`End mark '${endMark}' not found`);
      return null;
    }

    const measurement: PerformanceMeasurement = {
      name,
      duration: endEntry.timestamp - startEntry.timestamp,
      timestamp: startEntry.timestamp,
      type: 'sync',
      context: {
        startMark,
        endMark,
      },
    };

    this.recordMeasurement(measurement);
    return measurement;
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): MemoryUsage | null {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  /**
   * Capture memory snapshot
   */
  captureMemorySnapshot(): void {
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage) {
      this.memorySnapshots.push(memoryUsage);
      if (this.memorySnapshots.length > 100) {
        this.memorySnapshots.shift();
      }

      // Emit memory usage event
      eventBus.emit('performance:memory-usage', memoryUsage);

      // Check for memory leaks
      this.checkMemoryLeaks();
    }
  }

  /**
   * Check for potential memory leaks
   */
  private checkMemoryLeaks(): void {
    if (this.memorySnapshots.length < 5) return;

    const recent = this.memorySnapshots.slice(-5);
    const trend = recent.map(snapshot => snapshot.usedJSHeapSize);
    
    // Simple trend analysis - if memory keeps growing
    let increasing = 0;
    for (let i = 1; i < trend.length; i++) {
      if (trend[i] > trend[i - 1]) increasing++;
    }

    if (increasing >= 4) {
      logger.warn('[PerformanceMonitor] Potential memory leak detected');
      eventBus.emit('performance:memory-leak-detected', {
        snapshots: recent,
        trend,
      });
    }
  }

  /**
   * Record a performance measurement
   */
  private recordMeasurement(measurement: PerformanceMeasurement): void {
    this.measurements.push(measurement);
    
    // Keep only the most recent measurements
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements.shift();
    }

    // Emit performance event
    eventBus.emit('performance:measurement', measurement);

    // Check if this is a slow operation
    if (measurement.duration > this.slowThreshold) {
      // logger.warn(`Slow operation detected: ${measurement.name} took ${measurement.duration}ms`);
      eventBus.emit('performance:slow-operation', measurement);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    const slowOperations = this.measurements.filter(m => m.duration > this.slowThreshold);
    
    // Calculate average durations by operation name
    const averageDurations: Record<string, number> = {};
    const operationGroups = this.measurements.reduce((groups, measurement) => {
      if (!groups[measurement.name]) groups[measurement.name] = [];
      groups[measurement.name].push(measurement.duration);
      return groups;
    }, {} as Record<string, number[]>);

    Object.entries(operationGroups).forEach(([name, durations]) => {
      if (durations.length > 0) {
        averageDurations[name] = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      }
    });

    return {
      measurements: [...this.measurements],
      memorySnapshots: [...this.memorySnapshots],
      slowOperations,
      averageDurations,
    };
  }

  /**
   * Clear all performance data
   */
  clear(): void {
    this.measurements = [];
    this.memorySnapshots = [];
    logger.debug('[PerformanceMonitor] Performance data cleared');
  }

  /**
   * Get performance report
   */
  getReport(): string {
    const stats = this.getStats();
    const totalMeasurements = stats.measurements.length;
    const slowOperationsCount = stats.slowOperations.length;
    const slowPercentage = totalMeasurements > 0 ? (slowOperationsCount / totalMeasurements * 100).toFixed(2) : '0';

    let report = `Performance Report:\n`;
    report += `Total measurements: ${totalMeasurements}\n`;
    report += `Slow operations: ${slowOperationsCount} (${slowPercentage}%)\n`;
    report += `Memory snapshots: ${stats.memorySnapshots.length}\n\n`;

    if (Object.keys(stats.averageDurations).length > 0) {
      report += `Average durations:\n`;
      Object.entries(stats.averageDurations)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([name, duration]) => {
          report += `  ${name}: ${duration.toFixed(2)}ms\n`;
        });
    }

    return report;
  }

  /**
   * Cleanup performance monitor
   */
  cleanup(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    this.measurements = [];
    this.memorySnapshots = [];
    this.initialized = false;
    logger.debug('[PerformanceMonitor] Cleaned up');
  }
}

// Create and export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export class for custom instances
export { PerformanceMonitor };

// Export as default for backward compatibility
export default performanceMonitor;
