export interface PerformanceMetric {
  name: string; // e.g., 'tti', 'fcp', 'function_execution_time'
  value: number; // Duration in milliseconds or other relevant metric value
  unit?: 'ms' | 'bytes' | 'count'; // Unit of the metric value
  timestamp: number; // Unix timestamp (ms) when the metric was recorded
  startTime?: number; // Optional: Start time for duration metrics
  memory?: { // Detailed memory information from performance.memory API
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
  context?: Record<string, string | number | boolean>; // Additional structured context
  type?: 'measure' | 'navigation' | 'resource' | 'custom'; // Type of performance metric
  tags?: string[]; // Tags for filtering/categorization
}

export interface CircuitBreakerState {
  id: string; // Unique identifier for the circuit breaker (e.g., service name or API endpoint)
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailureTime?: number; // Timestamp of the last recorded failure
  nextAttemptTime?: number; // Timestamp for when the next attempt is allowed if open or half-open
  consecutiveFailures: number; // Current count of consecutive failures
  totalFailures: number; // Lifetime total failures
  totalSuccesses: number; // Lifetime total successes
  // Configuration settings for this breaker instance
  config: {
    failureThreshold: number; // Number of failures to open the circuit
    successThreshold: number; // Number of successes in half-open to close the circuit
    openStateTimeoutMs: number; // Duration to stay in open state before moving to half-open
    halfOpenStateTimeoutMs?: number; // Optional: Max duration for an attempt in half-open state
    resetIntervalMs?: number; // Interval after which failure/success counts are reset if in closed state
  };
}

export interface ErrorContext {
  component?: string; // Name of the component/module where the error occurred
  action?: string; // Action being performed when the error occurred
  timestamp: number; // Unix timestamp (ms)
  userId?: string;
  sessionId?: string;
  url?: string; // URL at the time of error
  userAgent?: string;
  error: {
    name: string; // Error.name
    message: string; // Error.message
    stack?: string; // Error.stack
    code?: string | number; // Custom error code or HTTP status
    isRecoverable?: boolean; // Hint if the error might be recoverable
  };
  tags?: Record<string, string | boolean | number>; // Additional key-value tags for context
  metadata?: Record<string, any>; // Any other relevant metadata
}

export interface HealthCheckResult {
  service: string; // Name of the service being checked
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheckTime: number; // Unix timestamp (ms) of the check
  responseTimeMs?: number; // Response time in milliseconds, if applicable
  errorRate?: number; // Error rate as a percentage (0-100), if applicable
  details?: Record<string, any>; // Service-specific health details (e.g., queue length, db connections)
  message?: string; // Optional human-readable message about the status
}

export interface InitializationPhase {
  name: string; // Name of the initialization step/module
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'deferred';
  startTime?: number; // Unix timestamp (ms)
  endTime?: number; // Unix timestamp (ms)
  durationMs?: number; // Calculated duration
  error?: ErrorContext['error']; // Structured error information
  dependencies?: string[]; // Names of other phases this one depends on
  isCritical?: boolean; // If true, failure of this phase might halt app initialization
  retriesAttempted?: number;
  progress?: number; // Optional progress (0-100) for long-running phases
}

// Generic base for store states, can be extended by specific stores
export interface BaseStoreState {
  isInitialized: boolean;
  isLoading: boolean;
  error?: ErrorContext['error'] | null;
  lastUpdated: number; // Timestamp of the last state change
  version?: string; // Version of the store's data structure or schema
}

export interface ContextBridgeMessage<P = any, R = any> { // Generic for payload (P) and response (R)
  messageId: string; // Unique ID for this message, for tracking and replies
  type: string; // Defines the action or event type
  payload?: P;
  timestamp: number; // Unix timestamp (ms)
  source: 'content-script' | 'background' | 'popup' | 'options' | 'dev-tools' | string; // Originator
  destination?: 'content-script' | 'background' | 'popup' | 'options' | 'dev-tools' | string; // Intended recipient
  contextId?: string; // ID for a specific operation or conversation
  requiresAck?: boolean; // If true, sender expects an acknowledgement message
  isAck?: boolean; // If true, this message is an acknowledgement to a previous message
  ackMessageId?: string; // messageId of the message being acknowledged
  error?: ErrorContext['error']; // If the message represents an error or failed response
  response?: R; // For messages that are direct responses to a request
}

export interface MigrationBridgeConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  fallbackToOldArchitecture: boolean; // If new system fails, attempt to use old one
  trackUsageStats: boolean; // Collect anonymous usage data for migrated features
  featureFlags?: Record<string, boolean>; // Granular control over specific migrated features or components
  apiEndpoints?: { // Configuration for any new API endpoints used by the new architecture
    [serviceName: string]: string;
  };
  performanceMonitoring?: {
    enabled: boolean;
    samplingRate?: number; // 0.0 to 1.0
  };
}
