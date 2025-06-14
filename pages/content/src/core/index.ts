/**
 * Core Architecture Components
 * 
 * Exports all core architectural components for the MCP SuperAssistant.
 */

export { circuitBreaker, CircuitBreaker } from './circuit-breaker';
export type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from './circuit-breaker';

export { contextBridge, ContextBridge } from './context-bridge';
export type { ContextMessage, ContextBridgeConfig } from './context-bridge';

export { globalErrorHandler, GlobalErrorHandler } from './error-handler';
export type { ErrorContext, ErrorReport } from './error-handler';

export { performanceMonitor, PerformanceMonitor } from './performance';
export type { PerformanceMeasurement, MemoryUsage, PerformanceStats } from './performance';

// Main initialization system (Session 10)
export { 
  applicationInit, 
  applicationCleanup, 
  getInitializationStatus,
  forceReinitialization,
  initializationUtils
} from './main-initializer';

// UI initialization utilities
export {
  initializeUIApplication,
  initializePopupApp,
  initializeOptionsApp,
  setupUICleanup,
  setupPopupApp,
  setupOptionsApp
} from './ui-initializer';

// Import for default export
import { circuitBreaker } from './circuit-breaker';
import { contextBridge } from './context-bridge';
import { globalErrorHandler } from './error-handler';
import { performanceMonitor } from './performance';

// Re-export default instances for convenience
export default {
  circuitBreaker,
  contextBridge,
  globalErrorHandler,
  performanceMonitor,
};
