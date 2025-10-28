/**
 * Analytics Event Listener
 *
 * Listens to application events and tracks them via analytics service
 */
import { eventBus } from './events';
import { analyticsService } from '../../../chrome-extension/utils/analytics-service';
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('AnalyticsListener');

/**
 * Initialize analytics listeners for content script events
 */
export function initializeAnalyticsListeners(): void {
  logger.debug('[AnalyticsListener] Initializing event listeners...');

  // Track adapter activation
  eventBus.on('adapter:activated', async (data) => {
    try {
      // Get additional context from stores if available
      const hostname = window.location.hostname;
      const mcpEnabled = true; // Assume MCP is enabled if adapter is activated

      await analyticsService.trackAdapterActivation({
        adapter_name: data.pluginName,
        hostname,
        mcp_enabled: mcpEnabled,
        tools_available: 0, // Will be updated when tools are loaded
      });

      logger.debug('[AnalyticsListener] Tracked adapter activation:', data.pluginName);
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track adapter activation:', error);
    }
  });

  // Track feature usage from UI events
  eventBus.on('ui:sidebar-toggle', async (data) => {
    try {
      await analyticsService.trackFeatureUsage({
        feature_name: 'sidebar_toggle',
        interaction_type: 'click',
        feature_state: { visible: data.visible },
      });
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track feature usage:', error);
    }
  });

  eventBus.on('ui:sidebar-minimize', async (data) => {
    try {
      await analyticsService.trackFeatureUsage({
        feature_name: 'sidebar_minimize',
        interaction_type: 'click',
        feature_state: { minimized: data.minimized },
      });
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track feature usage:', error);
    }
  });

  // Track errors with enhanced context
  eventBus.on('error:unhandled', async (data) => {
    try {
      const errorCategory = determineErrorCategory(data.context);

      await analyticsService.trackError({
        error_message: data.error.message,
        error_category: errorCategory,
        error_stack: data.error.stack,
        recovery_attempted: false,
      });
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track error:', error);
    }
  });

  // Track session summary on app shutdown
  eventBus.on('app:shutdown', async () => {
    try {
      await analyticsService.trackSessionSummary();
      logger.debug('[AnalyticsListener] Tracked session summary on shutdown');
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track session summary:', error);
    }
  });

  logger.debug('[AnalyticsListener] Event listeners initialized');
}

/**
 * Determine error category from context
 */
function determineErrorCategory(
  context?: string | Record<string, any>
): 'connection' | 'tool_execution' | 'adapter' | 'ui' | 'unknown' {
  if (!context) return 'unknown';

  const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
  const lowerContext = contextStr.toLowerCase();

  if (lowerContext.includes('connection') || lowerContext.includes('connect')) {
    return 'connection';
  }
  if (lowerContext.includes('tool') || lowerContext.includes('execute')) {
    return 'tool_execution';
  }
  if (lowerContext.includes('adapter') || lowerContext.includes('plugin')) {
    return 'adapter';
  }
  if (lowerContext.includes('ui') || lowerContext.includes('sidebar') || lowerContext.includes('button')) {
    return 'ui';
  }

  return 'unknown';
}

/**
 * Track session summary periodically (every 5 minutes)
 */
let sessionSummaryInterval: number | null = null;

export function startPeriodicSessionTracking(): void {
  // Clear existing interval if any
  if (sessionSummaryInterval) {
    clearInterval(sessionSummaryInterval);
  }

  // Track session summary every 5 minutes
  sessionSummaryInterval = window.setInterval(async () => {
    try {
      await analyticsService.trackSessionSummary();
      logger.debug('[AnalyticsListener] Tracked periodic session summary');
    } catch (error) {
      logger.warn('[AnalyticsListener] Failed to track periodic session summary:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  logger.debug('[AnalyticsListener] Started periodic session tracking');
}

export function stopPeriodicSessionTracking(): void {
  if (sessionSummaryInterval) {
    clearInterval(sessionSummaryInterval);
    sessionSummaryInterval = null;
    logger.debug('[AnalyticsListener] Stopped periodic session tracking');
  }
}
