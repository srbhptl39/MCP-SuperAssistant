import type { AdapterPlugin, PluginContext, AdapterCapability } from './plugin-types';
import { remoteConfig, fetchAndActivate, getValue, getAll, validateConfigContent } from '../shared/firebase-content-config';
import type { RemoteNotification, FeatureFlag } from '../stores/config.store';

export class RemoteConfigPlugin implements AdapterPlugin {
  readonly name = 'remote-config-plugin';
  readonly version = '1.0.0';
  readonly type = 'extension' as const;
  readonly hostnames = [/.*/]; // Universal plugin
  readonly capabilities: AdapterCapability[] = ['dom-manipulation']; // Extension capability for config management

  private context: PluginContext | null = null;
  private isActive = false;
  private fetchInterval: NodeJS.Timeout | null = null;
  private userProperties: Record<string, any> = {};
  private retryCount = 0;
  private maxRetries = 3;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    
    // Initialize user properties
    await this.initializeUserProperties();
    
    // Set up event listeners
    this.setupEventListeners();
    
    context.logger.debug('[RemoteConfigPlugin] Remote Config plugin initialized successfully');
  }

  async activate(): Promise<void> {
    if (this.isActive) return;
    
    this.context?.logger.debug('[RemoteConfigPlugin] Activating Remote Config plugin');
    
    try {
      // Initial fetch
      await this.fetchConfig(true);
      
      // Start periodic fetching
      this.startPeriodicFetch();
      
      this.isActive = true;
      
      // Emit activation event
      this.context?.eventBus.emit('remote-config:initialized', {
        timestamp: Date.now(),
        version: this.version
      });
      
      this.context?.logger.debug('[RemoteConfigPlugin] Remote Config plugin activated successfully');
    } catch (error) {
      this.context?.logger.error('[RemoteConfigPlugin] Failed to activate:', error);
      throw error;
    }
  }

  async deactivate(): Promise<void> {
    if (!this.isActive) return;
    
    this.context?.logger.debug('[RemoteConfigPlugin] Deactivating Remote Config plugin');
    
    this.stopPeriodicFetch();
    this.isActive = false;
    
    this.context?.logger.debug('[RemoteConfigPlugin] Remote Config plugin deactivated');
  }

  async cleanup(): Promise<void> {
    await this.deactivate();
    this.context = null;
    this.userProperties = {};
    this.retryCount = 0;
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!remoteConfig;
  }

  getStatus(): 'active' | 'inactive' | 'error' | 'initializing' | 'disabled' | 'pending' {
    return this.isActive ? 'active' : 'inactive';
  }

  // Core Remote Config methods
  async fetchConfig(force = false): Promise<void> {
    if (!this.context) return;
    
    try {
      // Check if we should fetch (respect minimum interval unless forced)
      const lastFetchTime = await this.getLastFetchTime();
      const now = Date.now();
      const minInterval = remoteConfig.settings.minimumFetchIntervalMillis;
      
      if (!force && lastFetchTime && (now - lastFetchTime) < minInterval) {
        this.context.logger.debug('[RemoteConfigPlugin] Skipping fetch due to minimum interval');
        return;
      }

      this.context.logger.debug('[RemoteConfigPlugin] Fetching remote config...');
      
      // Set loading state
      const configStore = this.context.stores.config?.();
      configStore?.setLoading(true);
      configStore?.setError(null);

      // Fetch and activate
      await fetchAndActivate(remoteConfig);
      
      // Process the configuration
      await this.processConfiguration();
      
      // Update last fetch time
      await this.setLastFetchTime(now);
      configStore?.updateLastFetchTime(now);
      
      // Reset retry count on success
      this.retryCount = 0;
      
      // Emit success event
      this.context.eventBus.emit('remote-config:fetched', {
        timestamp: now,
        success: true,
        configCount: Object.keys(getAll(remoteConfig)).length
      });
      
      this.context.logger.debug('[RemoteConfigPlugin] Remote config fetched successfully');
      
    } catch (error) {
      this.retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.context.logger.error('[RemoteConfigPlugin] Failed to fetch config:', errorMessage);
      
      // Set error state
      const configStore = this.context.stores.config?.();
      configStore?.setError(errorMessage);
      
      // Emit error event
      this.context.eventBus.emit('remote-config:fetch-failed', {
        error: errorMessage,
        timestamp: Date.now(),
        retryCount: this.retryCount
      });
      
      // Retry logic with exponential backoff
      if (this.retryCount <= this.maxRetries) {
        const retryDelay = Math.pow(2, this.retryCount) * 1000; // 2s, 4s, 8s
        setTimeout(() => this.fetchConfig(force), retryDelay);
      }
      
      throw error;
    } finally {
      const configStore = this.context.stores.config?.();
      configStore?.setLoading(false);
    }
  }

  private async processConfiguration(): Promise<void> {
    if (!this.context) return;
    
    try {
      const allConfigs = getAll(remoteConfig);
      const changes: string[] = [];
      
      // Process feature flags
      await this.processFeatureFlags(allConfigs, changes);
      
      // Process notifications
      await this.processNotifications(allConfigs, changes);
      
      // Process user configuration updates
      await this.processUserConfiguration(allConfigs, changes);
      
      // Emit update event if there were changes
      if (changes.length > 0) {
        this.context.eventBus.emit('remote-config:updated', {
          changes,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      this.context.logger.error('[RemoteConfigPlugin] Failed to process configuration:', error);
      throw error;
    }
  }

  private async processFeatureFlags(allConfigs: Record<string, any>, changes: string[]): Promise<void> {
    try {
      const featuresRaw = getValue(remoteConfig, 'features');
      const featuresString = featuresRaw.asString();
      
      if (featuresString) {
        const features = JSON.parse(featuresString) as Record<string, FeatureFlag>;
        
        // Validate features
        if (validateConfigContent({ features })) {
          const configStore = this.context?.stores.config?.();
          configStore?.updateFeatureFlags(features);
          
          changes.push('feature_flags');
          
          // Emit feature flags updated event
          this.context?.eventBus.emit('feature-flags:updated', {
            flags: features,
            timestamp: Date.now()
          });
          
          this.context?.logger.debug(`[RemoteConfigPlugin] Updated ${Object.keys(features).length} feature flags`);
        }
      }
    } catch (error) {
      this.context?.logger.error('[RemoteConfigPlugin] Failed to process feature flags:', error);
    }
  }

  private async processNotifications(allConfigs: Record<string, any>, changes: string[]): Promise<void> {
    try {
      const notificationsRaw = getValue(remoteConfig, 'active_notifications');
      const notificationsString = notificationsRaw.asString();
      
      if (notificationsString) {
        const notifications = JSON.parse(notificationsString) as RemoteNotification[];
        
        // Validate notifications
        if (validateConfigContent({ notifications })) {
          const configStore = this.context?.stores.config?.();
          
          for (const notification of notifications) {
            // Check if notification should be shown
            if (configStore?.canShowNotification(notification)) {
              // Emit notification received event
              this.context?.eventBus.emit('notification:remote-received', {
                notification,
                timestamp: Date.now()
              });
              
              // Add to UI store if available
              const uiStore = this.context?.stores.ui?.();
              if (uiStore?.addRemoteNotification) {
                uiStore.addRemoteNotification(notification);
              }
              
              // Mark as shown
              configStore?.markNotificationShown(notification.id);
              configStore?.addNotificationToHistory(notification.id);
            } else {
              // Emit frequency limited event
              this.context?.eventBus.emit('notification:frequency-limited', {
                notificationId: notification.id,
                reason: 'Frequency limits or targeting criteria not met'
              });
            }
          }
          
          changes.push('notifications');
          this.context?.logger.debug(`[RemoteConfigPlugin] Processed ${notifications.length} notifications`);
        }
      }
    } catch (error) {
      this.context?.logger.error('[RemoteConfigPlugin] Failed to process notifications:', error);
    }
  }

  private async processUserConfiguration(allConfigs: Record<string, any>, changes: string[]): Promise<void> {
    try {
      // Update notification configuration
      const notificationConfigRaw = getValue(remoteConfig, 'notifications_config');
      const notificationConfigString = notificationConfigRaw.asString();
      
      if (notificationConfigString) {
        const notificationConfig = JSON.parse(notificationConfigString);
        
        if (validateConfigContent({ notificationConfig })) {
          const configStore = this.context?.stores.config?.();
          configStore?.updateNotificationConfig(notificationConfig);
          changes.push('notification_config');
        }
      }
      
      // Process other user-specific configurations as needed
      
    } catch (error) {
      this.context?.logger.error('[RemoteConfigPlugin] Failed to process user configuration:', error);
    }
  }

  // Feature flag evaluation
  isFeatureEnabled(featureName: string): boolean {
    const configStore = this.context?.stores.config?.();
    return configStore?.isFeatureEnabled(featureName) || false;
  }

  getFeatureConfig(featureName: string): FeatureFlag | undefined {
    const configStore = this.context?.stores.config?.();
    return configStore?.getFeatureConfig(featureName);
  }

  // Utility methods
  private async initializeUserProperties(): Promise<void> {
    try {
      const appStore = this.context?.stores.app?.();
      const configStore = this.context?.stores.config?.();
      
      const userProperties = {
        extensionVersion: chrome.runtime.getManifest().version,
        platform: navigator.platform,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        installDate: await this.getInstallDate(),
        userSegment: await this.getUserSegment()
      };
      
      this.userProperties = userProperties;
      configStore?.setUserProperties(userProperties);
      
      this.context?.logger.debug('[RemoteConfigPlugin] User properties initialized:', userProperties);
    } catch (error) {
      this.context?.logger.error('[RemoteConfigPlugin] Failed to initialize user properties:', error);
    }
  }

  private setupEventListeners(): void {
    if (!this.context) return;
    
    // Listen for extension updates
    this.context.eventBus.on('app:version-updated', async (data) => {
      this.context?.logger.debug('[RemoteConfigPlugin] Extension version updated, fetching config');
      await this.handleVersionUpdate(data);
    });
    
    // Listen for user segment changes
    this.context.eventBus.on('user:segment-changed', (data) => {
      this.context?.logger.debug('[RemoteConfigPlugin] User segment changed:', data);
      // Re-evaluate feature flags and notifications
      this.fetchConfig(true);
    });
  }

  private startPeriodicFetch(): void {
    // Fetch every 12 hours
    this.fetchInterval = setInterval(() => {
      this.fetchConfig(false);
    }, 12 * 60 * 60 * 1000);
    
    this.context?.logger.debug('[RemoteConfigPlugin] Started periodic config fetching');
  }

  private stopPeriodicFetch(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
      this.context?.logger.debug('[RemoteConfigPlugin] Stopped periodic config fetching');
    }
  }

  private async getLastFetchTime(): Promise<number | null> {
    const result = await this.context?.chrome.storage.local.get(['remoteConfigLastFetch']);
    return result?.remoteConfigLastFetch || null;
  }

  private async setLastFetchTime(timestamp: number): Promise<void> {
    await this.context?.chrome.storage.local.set({ remoteConfigLastFetch: timestamp });
  }

  private async getInstallDate(): Promise<string> {
    const result = await this.context?.chrome.storage.local.get(['installDate']);
    if (result?.installDate) {
      return result.installDate;
    } else {
      const now = new Date().toISOString();
      await this.context?.chrome.storage.local.set({ installDate: now });
      return now;
    }
  }

  private async getUserSegment(): Promise<string> {
    const configStore = this.context?.stores.config?.();
    return configStore?.userSegment || 'new';
  }

  private async handleVersionUpdate(data: { oldVersion: string; newVersion: string }): Promise<void> {
    // Check for update notifications
    const updateNotificationsRaw = getValue(remoteConfig, 'update_notifications');
    const updateNotificationsString = updateNotificationsRaw.asString();
    
    if (updateNotificationsString) {
      try {
        const updateConfig = JSON.parse(updateNotificationsString);
        
        if (updateConfig.enabled) {
          // Create version update notification
          const notification: RemoteNotification = {
            id: `version-update-${data.newVersion}`,
            type: 'info',
            title: `Updated to v${data.newVersion}`,
            message: `MCP SuperAssistant has been updated. Check out what's new!`,
            actions: [
              { text: 'View Changelog', action: 'view-changelog', style: 'primary' },
              { text: 'Dismiss', action: 'dismiss', style: 'secondary' }
            ],
            campaignId: 'version-update',
            priority: 1
          };
          
          // Emit notification
          this.context?.eventBus.emit('notification:remote-received', {
            notification,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        this.context?.logger.error('[RemoteConfigPlugin] Failed to process update notification:', error);
      }
    }
  }
}
