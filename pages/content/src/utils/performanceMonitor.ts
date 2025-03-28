/**
 * Performance Monitor
 *
 * Utility for monitoring performance metrics of the extension
 */

import { logMessage } from './helpers';

// Store performance metrics
interface PerformanceMetrics {
  scanCount: number;
  totalScanTime: number;
  lastScanTime: number;
  averageScanTime: number;
  maxScanTime: number;
  scanStartTimes: Record<string, number>;
}

const metrics: PerformanceMetrics = {
  scanCount: 0,
  totalScanTime: 0,
  lastScanTime: 0,
  averageScanTime: 0,
  maxScanTime: 0,
  scanStartTimes: {},
};

/**
 * Records the start of a performance-sensitive operation
 * @param operationId Unique identifier for the operation
 */
export const startOperation = (operationId: string): void => {
  metrics.scanStartTimes[operationId] = performance.now();
};

/**
 * Records the end of a performance-sensitive operation
 * @param operationId Unique identifier for the operation
 * @param logPerformance Whether to log the performance metrics
 */
export const endOperation = (operationId: string, logPerformance: boolean = true): number => {
  const startTime = metrics.scanStartTimes[operationId];
  if (!startTime) {
    logMessage(`No start time recorded for operation: ${operationId}`);
    return 0;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Update metrics
  metrics.scanCount++;
  metrics.totalScanTime += duration;
  metrics.lastScanTime = duration;
  metrics.averageScanTime = metrics.totalScanTime / metrics.scanCount;
  metrics.maxScanTime = Math.max(metrics.maxScanTime, duration);

  // Clean up
  delete metrics.scanStartTimes[operationId];

  if (logPerformance) {
    logMessage(`Operation ${operationId} completed in ${duration.toFixed(2)}ms`);
  }

  return duration;
};

/**
 * Gets the current performance metrics
 * @returns Current performance metrics
 */
export const getPerformanceMetrics = (): PerformanceMetrics => {
  return { ...metrics };
};

/**
 * Resets all performance metrics
 */
export const resetPerformanceMetrics = (): void => {
  metrics.scanCount = 0;
  metrics.totalScanTime = 0;
  metrics.lastScanTime = 0;
  metrics.averageScanTime = 0;
  metrics.maxScanTime = 0;
  metrics.scanStartTimes = {};

  logMessage('Performance metrics reset');
};
