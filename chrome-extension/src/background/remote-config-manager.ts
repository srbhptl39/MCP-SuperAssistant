import { firebaseRemoteConfigAPI, validateConfigContent } from './firebase-remote-config-api';

export class RemoteConfigManager {
  private isInitialized = false;
  private fetchInterval: NodeJS.Timeout | null = null;
  private lastFetchTime: number | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  async initialize(): Promise<void> {
    try {
      console.log('[RemoteConfigManager] Initializing Remote Config Manager...');
      
      // Initialize the Firebase Remote Config API
      await firebaseRemoteConfigAPI.initialize();
      
      // Initial fetch
      await this.fetchConfig(true);
      
      // Start periodic fetching
      this.startPeriodicFetch();
      
      this.isInitialized = true;
      console.log('[RemoteConfigManager] Remote Config Manager initialized successfully');
      
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to initialize:', error);
      throw error;
    }
  }

  async fetchConfig(force = false): Promise<void> {
    try {
      // Check if we should fetch (respect minimum interval unless forced)
      const now = Date.now();
      const minInterval = 3600000; // 1 hour - hardcoded since we can't access remoteConfig.settings
      
      if (!force && this.lastFetchTime && (now - this.lastFetchTime) < minInterval) {
        console.debug('[RemoteConfigManager] Skipping fetch due to minimum interval');
        return;
      }

      console.log('[RemoteConfigManager] Fetching remote config...');

      // Fetch and activate using our service worker compatible API
      await firebaseRemoteConfigAPI.fetchAndActivate(force);
      
      // Process the configuration
      await this.processConfiguration();
      
      // Update last fetch time
      this.lastFetchTime = now;
      await this.setLastFetchTime(now);
      
      // Reset retry count on success
      this.retryCount = 0;
      
      console.log('[RemoteConfigManager] Remote config fetched successfully');
      
    } catch (error) {
      this.retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[RemoteConfigManager] Failed to fetch config:', errorMessage);
      
      // Retry logic with exponential backoff
      if (this.retryCount <= this.maxRetries) {
        const retryDelay = Math.pow(2, this.retryCount) * 1000; // 2s, 4s, 8s
        setTimeout(() => this.fetchConfig(force), retryDelay);
      }
      
      throw error;
    }
  }

  async processConfiguration(): Promise<void> {
    try {
      const allConfigs = firebaseRemoteConfigAPI.getAll();
      
      // Process feature flags
      await this.processFeatureFlags(allConfigs);
      
      // Process notifications
      await this.processNotifications(allConfigs);
      
      // Process version configurations
      await this.processVersionConfigurations(allConfigs);
      
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to process configuration:', error);
      throw error;
    }
  }

  private async processFeatureFlags(allConfigs: Record<string, any>): Promise<void> {
    try {
      const featuresRaw = firebaseRemoteConfigAPI.getValue('features');
      const featuresString = featuresRaw.value;
      
      if (featuresString) {
        const features = JSON.parse(featuresString);
        
        // Validate features
        if (validateConfigContent({ features })) {
          // Broadcast to content scripts
          await this.broadcastFeatureFlags(features);
          console.log(`[RemoteConfigManager] Updated ${Object.keys(features).length} feature flags`);
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to process feature flags:', error);
    }
  }

  private async processNotifications(allConfigs: Record<string, any>): Promise<void> {
    try {
      const notificationsRaw = firebaseRemoteConfigAPI.getValue('active_notifications');
      const notificationsString = notificationsRaw.value;
      
      if (notificationsString) {
        const notifications = JSON.parse(notificationsString);
        
        // Validate notifications
        if (validateConfigContent({ notifications })) {
          // Broadcast to content scripts
          await this.broadcastNotifications(notifications);
          console.log(`[RemoteConfigManager] Processed ${notifications.length} notifications`);
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to process notifications:', error);
    }
  }

  private async processVersionConfigurations(allConfigs: Record<string, any>): Promise<void> {
    try {
      // Check for version-specific configurations
      const currentVersion = chrome.runtime.getManifest().version;
      const versionConfigKey = `version_config_${currentVersion.replace(/\./g, '_')}`;
      
      const versionConfigRaw = firebaseRemoteConfigAPI.getValue(versionConfigKey);
      const versionConfigString = versionConfigRaw.value;
      
      if (versionConfigString) {
        const versionConfig = JSON.parse(versionConfigString);
        
        if (validateConfigContent(versionConfig)) {
          // Broadcast version-specific config
          await this.broadcastVersionConfig(versionConfig);
          console.log('[RemoteConfigManager] Applied version-specific configuration');
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to process version configurations:', error);
    }
  }

  private async broadcastFeatureFlags(features: Record<string, any>): Promise<void> {
    try {
      // Get all active content script tabs
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'remote-config:feature-flags-updated',
              data: {
                flags: features,
                timestamp: Date.now()
              }
            });
          } catch (error) {
            // Tab may not have content script injected, ignore
            console.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to broadcast feature flags:', error);
    }
  }

  private async broadcastNotifications(notifications: any[]): Promise<void> {
    try {
      // Get all active content script tabs
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'remote-config:notifications-received',
              data: {
                notifications,
                timestamp: Date.now()
              }
            });
          } catch (error) {
            // Tab may not have content script injected, ignore
            console.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to broadcast notifications:', error);
    }
  }

  private async broadcastVersionConfig(versionConfig: any): Promise<void> {
    try {
      // Get all active content script tabs
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'remote-config:version-config-updated',
              data: {
                config: versionConfig,
                timestamp: Date.now()
              }
            });
          } catch (error) {
            // Tab may not have content script injected, ignore
            console.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to broadcast version config:', error);
    }
  }

  private startPeriodicFetch(): void {
    // Fetch every 4 hours
    this.fetchInterval = setInterval(() => {
      this.fetchConfig(false);
    }, 4 * 60 * 60 * 1000);
    
    console.debug('[RemoteConfigManager] Started periodic config fetching');
  }

  private stopPeriodicFetch(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
      console.debug('[RemoteConfigManager] Stopped periodic config fetching');
    }
  }

  private async setLastFetchTime(timestamp: number): Promise<void> {
    await chrome.storage.local.set({ remoteConfigLastFetch: timestamp });
  }

  private async getLastFetchTime(): Promise<number | null> {
    const result = await chrome.storage.local.get(['remoteConfigLastFetch']);
    return result?.remoteConfigLastFetch || null;
  }

  async getFeatureFlag(flagName: string): Promise<any> {
    try {
      const featuresRaw = firebaseRemoteConfigAPI.getValue('features');
      const featuresString = featuresRaw.value;
      
      if (featuresString) {
        const features = JSON.parse(featuresString);
        return features[flagName] || null;
      }
      
      return null;
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to get feature flag:', error);
      return null;
    }
  }

  async getAllConfig(): Promise<Record<string, any>> {
    try {
      return firebaseRemoteConfigAPI.getAll();
    } catch (error) {
      console.error('[RemoteConfigManager] Failed to get all config:', error);
      return {};
    }
  }

  async cleanup(): Promise<void> {
    this.stopPeriodicFetch();
    this.isInitialized = false;
    this.lastFetchTime = null;
    this.retryCount = 0;
    console.log('[RemoteConfigManager] Cleaned up');
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async getLastFetchTimePublic(): Promise<number | null> {
    return this.getLastFetchTime();
  }
}
