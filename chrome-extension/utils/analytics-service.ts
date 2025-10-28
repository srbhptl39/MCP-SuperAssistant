import { sendAnalyticsEvent, collectDemographicData } from './analytics.js';
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('AnalyticsService');

/**
 * Centralized Analytics Service
 *
 * Manages user properties, session state, and enhanced event tracking
 * for better insights while maintaining privacy.
 */
export class AnalyticsService {
  private static instance: AnalyticsService | null = null;

  // Session state
  private sessionStartTime: number = Date.now();
  private sessionToolExecutions: number = 0;
  private sessionUniqueTools: Set<string> = new Set();
  private sessionAdapters: Set<string> = new Set();
  private sessionConnections: number = 0;
  private sessionErrors: number = 0;
  private lastUserAction: string = 'none';

  // User properties cache
  private userProperties: Record<string, any> = {};
  private demographicData: Record<string, any> = {};

  // Connection state
  private currentConnectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error' = 'disconnected';
  private connectionStartTime: number | null = null;
  private currentTransportType: string | null = null;
  private toolsAvailableCount: number = 0;

  // Active adapter
  private activeAdapter: string | null = null;

  // Debouncing for connection events
  private lastConnectionTrackTime: number = 0;
  private readonly CONNECTION_TRACK_DEBOUNCE = 2000; // 2 seconds

  private constructor() {
    this.initialize();
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Initialize analytics service with user properties
   */
  private async initialize(): Promise<void> {
    try {
      // Load user properties from storage
      const stored = await chrome.storage.local.get([
        'installDate',
        'version',
        'userProperties',
        'ga4UserPropertiesSet'
      ]);

      // Collect demographic data
      this.demographicData = collectDemographicData();

      // Build user properties
      this.userProperties = {
        extension_version: chrome.runtime.getManifest().version,
        install_date: stored.installDate || new Date().toISOString(),
        ...this.demographicData,
        ...(stored.userProperties || {})
      };

      logger.debug('[AnalyticsService] Initialized with user properties:', this.userProperties);

      // Set GA4 user properties on first launch
      if (!stored.ga4UserPropertiesSet) {
        await this.setGA4UserProperties();
        await chrome.storage.local.set({ ga4UserPropertiesSet: true });
      }
    } catch (error) {
      logger.error('[AnalyticsService] Initialization failed:', error);
    }
  }

  /**
   * Set GA4 user properties (called once on first launch)
   * These are static demographics that don't change and will be available in all GA4 reports
   */
  private async setGA4UserProperties(): Promise<void> {
    try {
      const userProperties = {
        extension_version: { value: this.userProperties.extension_version },
        install_date: { value: this.userProperties.install_date },
        browser: { value: this.demographicData.browser },
        browser_version: { value: this.demographicData.browser_version },
        operating_system: { value: this.demographicData.operating_system },
        os_version: { value: this.demographicData.os_version },
        device_type: { value: this.demographicData.device_type },
        language: { value: this.demographicData.language },
        region: { value: this.demographicData.region },
        screen_resolution: { value: this.demographicData.screen_resolution },
        pixel_ratio: { value: this.demographicData.pixel_ratio },
        timezone: { value: this.demographicData.timezone },
        timezone_offset: { value: this.demographicData.timezone_offset },
      };

      // Send a special event to set user properties in GA4
      await sendAnalyticsEvent('user_properties_initialized', {}, userProperties);

      logger.debug('[AnalyticsService] GA4 user properties set successfully');
    } catch (error) {
      logger.error('[AnalyticsService] Failed to set GA4 user properties:', error);
    }
  }

  /**
   * Get common event parameters that should be included in all events
   * Note: Static demographics (browser, OS, etc.) are set as GA4 user properties
   * and don't need to be included in every event.
   */
  private getCommonParameters(): Record<string, any> {
    return {
      // Dynamic/session-specific fields only
      extension_version: this.userProperties.extension_version, // Can change on update
      session_duration_ms: Date.now() - this.sessionStartTime,  // Increases over time
      user_segment: this.getUserSegment(),                       // Changes with usage
      days_since_install: this.getDaysSinceInstall(),           // Increases daily
    };
  }

  /**
   * Track tool execution with enhanced context
   */
  public async trackToolExecution(params: {
    tool_name: string;
    execution_status: 'success' | 'error';
    execution_duration_ms: number;
    transport_type: string;
    error_type?: string;
    adapter_name?: string; // NEW: Adapter name from content script
  }): Promise<void> {
    const isFirstExecution = this.sessionToolExecutions === 0;

    this.sessionToolExecutions++;
    this.sessionUniqueTools.add(params.tool_name);

    // Use passed adapter name if available, otherwise fall back to stored activeAdapter
    const adapterName = params.adapter_name || this.activeAdapter || 'none';

    await sendAnalyticsEvent('mcp_tool_executed', {
      ...params,
      ...this.getCommonParameters(),
      connection_status: this.currentConnectionStatus,
      active_adapter: adapterName, // Use adapter name from content script
      tools_available_count: this.toolsAvailableCount,
      session_tool_count: this.sessionToolExecutions,
      is_first_tool_execution: isFirstExecution,
      unique_tools_used: this.sessionUniqueTools.size,
    });

    if (params.execution_status === 'error') {
      this.sessionErrors++;
    }
  }

  /**
   * Track connection status changes
   */
  public async trackConnectionChange(params: {
    connection_status: 'connected' | 'disconnected' | 'error';
    transport_type: string;
    reconnection_attempt?: number;
    tools_discovered?: number;
    error_type?: string;
  }): Promise<void> {
    const now = Date.now();

    // Debounce: Don't track if we just tracked a connection event
    // Exception: Track if tools are being discovered for the first time
    const isFirstToolDiscovery = params.tools_discovered && params.tools_discovered > 0 && this.toolsAvailableCount === 0;

    if (!isFirstToolDiscovery && (now - this.lastConnectionTrackTime < this.CONNECTION_TRACK_DEBOUNCE)) {
      logger.debug('[AnalyticsService] Connection event debounced (too soon after last event)');

      // Still update internal state even if we don't track
      this.currentConnectionStatus = params.connection_status;
      this.currentTransportType = params.transport_type;
      if (params.tools_discovered) {
        this.toolsAvailableCount = params.tools_discovered;
      }
      return;
    }

    this.lastConnectionTrackTime = now;

    const previousStatus = this.currentConnectionStatus;
    const connectionDuration = this.connectionStartTime
      ? Date.now() - this.connectionStartTime
      : 0;

    this.currentConnectionStatus = params.connection_status;
    this.currentTransportType = params.transport_type;

    if (params.connection_status === 'connected') {
      this.connectionStartTime = Date.now();
      this.sessionConnections++;
      this.toolsAvailableCount = params.tools_discovered || 0;
    } else if (params.connection_status === 'disconnected') {
      this.connectionStartTime = null;
      this.toolsAvailableCount = 0;
    }

    await sendAnalyticsEvent('mcp_connection_changed', {
      ...params,
      ...this.getCommonParameters(),
      previous_status: previousStatus,
      connection_duration_ms: connectionDuration,
      session_connections_count: this.sessionConnections,
      active_adapter: this.activeAdapter || 'none',
    });

    if (params.connection_status === 'error') {
      this.sessionErrors++;
    }
  }

  /**
   * Track adapter activation
   */
  public async trackAdapterActivation(params: {
    adapter_name: string;
    hostname: string;
    mcp_enabled: boolean;
    tools_available: number;
  }): Promise<void> {
    const previousAdapter = this.activeAdapter;
    this.activeAdapter = params.adapter_name;
    this.sessionAdapters.add(params.adapter_name);
    this.toolsAvailableCount = params.tools_available;

    await sendAnalyticsEvent('adapter_activated', {
      ...params,
      ...this.getCommonParameters(),
      previous_adapter: previousAdapter || 'none',
      session_adapter_switches: this.sessionAdapters.size,
      connection_status: this.currentConnectionStatus,
    });
  }

  /**
   * Track feature usage
   */
  public async trackFeatureUsage(params: {
    feature_name: string;
    interaction_type: 'click' | 'keyboard' | 'auto';
    feature_state?: Record<string, any>;
  }): Promise<void> {
    this.lastUserAction = params.feature_name;

    await sendAnalyticsEvent('feature_used', {
      ...params,
      ...this.getCommonParameters(),
      active_adapter: this.activeAdapter || 'none',
      connection_status: this.currentConnectionStatus,
      tools_available: this.toolsAvailableCount,
    });
  }

  /**
   * Track enhanced error with context
   */
  public async trackError(params: {
    error_message: string;
    error_category: 'connection' | 'tool_execution' | 'adapter' | 'ui' | 'unknown';
    error_stack?: string;
    recovery_attempted?: boolean;
  }): Promise<void> {
    this.sessionErrors++;

    await sendAnalyticsEvent('extension_error', {
      ...params,
      ...this.getCommonParameters(),
      error_stack: params.error_stack?.substring(0, 500), // Limit stack trace
      user_action_before_error: this.lastUserAction,
      tools_available_when_error: this.toolsAvailableCount,
      connection_status: this.currentConnectionStatus,
      active_adapter: this.activeAdapter || 'none',
      session_errors_count: this.sessionErrors,
    });
  }

  /**
   * Track session summary (call on extension unload or periodically)
   */
  public async trackSessionSummary(): Promise<void> {
    const sessionDuration = Date.now() - this.sessionStartTime;

    await sendAnalyticsEvent('session_summary', {
      ...this.getCommonParameters(),
      session_duration_ms: sessionDuration,
      tools_executed_count: this.sessionToolExecutions,
      unique_tools_used: this.sessionUniqueTools.size,
      unique_adapters_used: this.sessionAdapters.size,
      adapters_activated: Array.from(this.sessionAdapters),
      connections_made: this.sessionConnections,
      errors_encountered: this.sessionErrors,
      final_connection_status: this.currentConnectionStatus,
    });
  }

  /**
   * Update user properties (call on extension install/update)
   */
  public async updateUserProperties(properties: Record<string, any>): Promise<void> {
    this.userProperties = {
      ...this.userProperties,
      ...properties,
    };

    await chrome.storage.local.set({ userProperties: this.userProperties });
    logger.debug('[AnalyticsService] User properties updated:', this.userProperties);
  }

  /**
   * Reset session state (call on new session start)
   */
  public resetSession(): void {
    this.sessionStartTime = Date.now();
    this.sessionToolExecutions = 0;
    this.sessionUniqueTools.clear();
    this.sessionAdapters.clear();
    this.sessionConnections = 0;
    this.sessionErrors = 0;
    this.lastUserAction = 'none';

    logger.debug('[AnalyticsService] Session reset');
  }

  /**
   * Get days since installation
   */
  private getDaysSinceInstall(): number {
    const installDate = this.userProperties.install_date;
    if (!installDate) return 0;

    const installTime = new Date(installDate).getTime();
    const now = Date.now();
    const daysSince = Math.floor((now - installTime) / (1000 * 60 * 60 * 24));

    return daysSince;
  }

  /**
   * Determine user segment based on usage patterns
   */
  private getUserSegment(): string {
    const daysSinceInstall = this.getDaysSinceInstall();
    const totalToolExecutions = this.sessionToolExecutions;

    // New users (first week)
    if (daysSinceInstall < 7) {
      return 'new_user';
    }

    // Recent users (1-4 weeks)
    if (daysSinceInstall < 30) {
      if (totalToolExecutions > 20) return 'engaged_new_user';
      return 'recent_user';
    }

    // Established users (30+ days)
    if (totalToolExecutions > 100) return 'power_user';
    if (totalToolExecutions > 30) return 'active_user';
    if (totalToolExecutions > 5) return 'regular_user';

    return 'casual_user';
  }

  /**
   * Get current session state (for debugging)
   */
  public getSessionState(): Record<string, any> {
    return {
      sessionDuration: Date.now() - this.sessionStartTime,
      toolExecutions: this.sessionToolExecutions,
      uniqueTools: this.sessionUniqueTools.size,
      adapters: Array.from(this.sessionAdapters),
      connections: this.sessionConnections,
      errors: this.sessionErrors,
      connectionStatus: this.currentConnectionStatus,
      activeAdapter: this.activeAdapter,
      toolsAvailable: this.toolsAvailableCount,
      userSegment: this.getUserSegment(),
      daysSinceInstall: this.getDaysSinceInstall(),
    };
  }
}

// Export singleton instance
export const analyticsService = AnalyticsService.getInstance();
