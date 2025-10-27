import { firebaseRemoteConfigAPI, validateConfigContent } from './firebase-remote-config-api';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('RemoteConfigManager');

export class RemoteConfigManager {
  private isInitialized = false;
  private fetchInterval: NodeJS.Timeout | null = null;
  private lastFetchTime: number | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  async initialize(): Promise<void> {
    try {
      logger.debug('[RemoteConfigManager] Initializing Remote Config Manager...');
      
      // Initialize the Firebase Remote Config API
      await firebaseRemoteConfigAPI.initialize();
      
      // Initial fetch
      await this.fetchConfig(true);
      
      // Start periodic fetching
      this.startPeriodicFetch();
      
      this.isInitialized = true;
      logger.debug('[RemoteConfigManager] Remote Config Manager initialized successfully');
      
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to initialize:', error);
      throw error;
    }
  }

  async fetchConfig(force = false): Promise<void> {
    try {
      // Check if we should fetch (respect minimum interval unless forced)
      const now = Date.now();
      const minInterval = 3600000; // 1 hour - hardcoded since we can't access remoteConfig.settings
      
      if (!force && this.lastFetchTime && (now - this.lastFetchTime) < minInterval) {
        logger.debug('[RemoteConfigManager] Skipping fetch due to minimum interval');
        return;
      }

      logger.debug('[RemoteConfigManager] Fetching remote config...');

      // Fetch and activate using our service worker compatible API
      await firebaseRemoteConfigAPI.fetchAndActivate(force);
      
      // Process the configuration
      await this.processConfiguration();
      
      // Update last fetch time
      this.lastFetchTime = now;
      await this.setLastFetchTime(now);
      
      // Reset retry count on success
      this.retryCount = 0;
      
      logger.debug('[RemoteConfigManager] Remote config fetched successfully');
      
      // Debug log: Show summary of what was fetched
      const allConfigs = firebaseRemoteConfigAPI.getAll();
      const remoteConfigCount = Object.values(allConfigs).filter(config => config.source === 'remote').length;
      const defaultConfigCount = Object.values(allConfigs).filter(config => config.source === 'default').length;
      
      logger.debug(`Config summary: ${remoteConfigCount} remote values, ${defaultConfigCount} default values`);
      
    } catch (error) {
      this.retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('[RemoteConfigManager] Failed to fetch config:', errorMessage);
      
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
      
      // Debug log: Show all available configuration
      logger.debug('[RemoteConfigManager] Processing configuration. Available configs:');
      Object.entries(allConfigs).forEach(([key, configValue]) => {
        const value = configValue.value;
        const source = configValue.source;
        
        // Try to parse JSON values for better display
        let displayValue = value;
        try {
          const parsed = JSON.parse(value);
          displayValue = JSON.stringify(parsed, null, 2);
        } catch {
          // Keep as string if not JSON
        }
        
        logger.debug(`  ${key} (${source}):`, displayValue);
      });
      
      // Process feature flags
      await this.processFeatureFlags(allConfigs);
      
      // Process notifications
      await this.processNotifications(allConfigs);
      
      // Process adapter configurations
      await this.processAdapterConfigurations(allConfigs);
      
      // Process version configurations
      await this.processVersionConfigurations(allConfigs);
      
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to process configuration:', error);
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
          logger.debug(`Updated ${Object.keys(features).length} feature flags`);
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to process feature flags:', error);
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
          logger.debug(`Processed ${notifications.length} notifications`);
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to process notifications:', error);
    }
  }

  private async processAdapterConfigurations(allConfigs: Record<string, any>): Promise<void> {
    try {
      let adapterConfigs: Record<string, any> = {};
      let foundConfigs = false;

      // First, try to get unified adapter_configs parameter
      const adapterConfigsRaw = firebaseRemoteConfigAPI.getValue('adapter_configs');
      const adapterConfigsString = adapterConfigsRaw.value;
      
      if (adapterConfigsString) {
        try {
          const unifiedConfigs = JSON.parse(adapterConfigsString);
          adapterConfigs = { ...unifiedConfigs };
          foundConfigs = true;
          logger.debug(`Found unified adapter_configs with ${Object.keys(unifiedConfigs).length} adapters`);
        } catch (error) {
          logger.warn('[RemoteConfigManager] Failed to parse unified adapter_configs:', error);
        }
      }

      // Also check for individual adapter config parameters
      const individualConfigKeys = Object.keys(allConfigs).filter(key => key.endsWith('_adapter_config'));
      
      if (individualConfigKeys.length > 0) {
        logger.debug(`Found ${individualConfigKeys.length} individual adapter config parameters:`, individualConfigKeys);
        
        for (const configKey of individualConfigKeys) {
          try {
            const configValue = firebaseRemoteConfigAPI.getValue(configKey);
            if (configValue.value) {
              const config = JSON.parse(configValue.value);
              const adapterName = configKey.replace('_adapter_config', '');
              adapterConfigs[adapterName] = config;
              foundConfigs = true;
              logger.debug(`Loaded individual config for adapter: ${adapterName}`);
            }
          } catch (error) {
            logger.warn(`Failed to parse ${configKey}:`, error);
          }
        }
      }

      // If we found any adapter configurations, validate and broadcast them
      if (foundConfigs && Object.keys(adapterConfigs).length > 0) {
        if (this.validateAdapterConfigs(adapterConfigs)) {
          await this.broadcastAdapterConfigs(adapterConfigs);
          logger.debug(`Processed and broadcasted ${Object.keys(adapterConfigs).length} adapter configurations`);
        } else {
          logger.warn('[RemoteConfigManager] Adapter configs validation failed');
        }
      } else {
        logger.debug('[RemoteConfigManager] No adapter configurations found');
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to process adapter configurations:', error);
    }
  }

  private validateAdapterConfigs(configs: any): boolean {
    if (!configs || typeof configs !== 'object') {
      logger.warn('[RemoteConfigManager] Invalid adapter configs structure');
      return false;
    }

    // Validate each adapter config has required structure
    for (const [adapterName, config] of Object.entries(configs)) {
      if (!config || typeof config !== 'object') {
        logger.warn(`Invalid config for adapter: ${adapterName}`);
        continue;
      }

      const adapterConfig = config as any;
      if (!adapterConfig.selectors || !adapterConfig.ui) {
        logger.warn(`Missing required fields for adapter: ${adapterName}`);
        continue;
      }
    }

    return true;
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
          logger.debug('[RemoteConfigManager] Applied version-specific configuration');
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to process version configurations:', error);
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
            logger.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to broadcast feature flags:', error);
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
            logger.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to broadcast notifications:', error);
    }
  }

  private async broadcastAdapterConfigs(adapterConfigs: Record<string, any>): Promise<void> {
    try {
      // Get all tabs that could have content scripts (not just active ones)
      const tabs = await chrome.tabs.query({});
      let broadcastCount = 0;
      
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'remote-config:adapter-configs-updated',
              data: {
                adapterConfigs,
                timestamp: Date.now()
              }
            });
            broadcastCount++;
          } catch (error) {
            // Tab may not have content script injected, ignore
            logger.debug(`Could not send adapter config message to tab ${tab.id}:`, error instanceof Error ? error.message : String(error));
          }
        }
      }
      
      logger.debug(`Broadcasted adapter configs to ${broadcastCount} tabs`);
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to broadcast adapter configurations:', error);
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
            logger.debug('[RemoteConfigManager] Could not send message to tab:', tab.id);
          }
        }
      }
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to broadcast version config:', error);
    }
  }


  //development
//   private startPeriodicFetch(): void {
//     // Fetch every 5 sec
//     this.fetchInterval = setInterval(() => {
//       this.fetchConfig(true);
//     }, 5000);
    
//     logger.debug('[RemoteConfigManager] Started periodic config fetching');
//   }
  private startPeriodicFetch(): void {
    // Fetch every 12 hours
    this.fetchInterval = setInterval(() => {
      this.fetchConfig(false);
    }, 12 * 60 * 60 * 1000);
    
    logger.debug('[RemoteConfigManager] Started periodic config fetching');
  }

  private stopPeriodicFetch(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
      logger.debug('[RemoteConfigManager] Stopped periodic config fetching');
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
      logger.error('[RemoteConfigManager] Failed to get feature flag:', error);
      return null;
    }
  }

  async getAllConfig(): Promise<Record<string, any>> {
    try {
      return firebaseRemoteConfigAPI.getAll();
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to get all config:', error);
      return {};
    }
  }

  async getSpecificConfig(key: string): Promise<any> {
    try {
      const allConfig = firebaseRemoteConfigAPI.getAll();
      
      // Handle adapter configs specially
      if (key.includes('adapter_config')) {
        const adapterConfigsRaw = firebaseRemoteConfigAPI.getValue('adapter_configs');
        const adapterConfigsString = adapterConfigsRaw.value;
        
        if (adapterConfigsString) {
          const adapterConfigs = JSON.parse(adapterConfigsString);
          
          // Extract specific adapter config
          if (key.endsWith('_adapter_config')) {
            const adapterName = key.replace('_adapter_config', '');
            return { [key]: adapterConfigs[adapterName] || null };
          }
        }
        
        // Fallback to legacy individual adapter config parameters
        const configValue = firebaseRemoteConfigAPI.getValue(key);
        if (configValue.value) {
          try {
            return { [key]: JSON.parse(configValue.value) };
          } catch {
            return { [key]: configValue.value };
          }
        }
        
        return { [key]: null };
      }
      
      // Handle regular config keys
      if (allConfig[key]) {
        const configValue = allConfig[key];
        try {
          return { [key]: JSON.parse(configValue.value) };
        } catch {
          return { [key]: configValue.value };
        }
      }
      
      return { [key]: null };
    } catch (error) {
      logger.error(`Failed to get specific config for key ${key}:`, error);
      return { [key]: null };
    }
  }

  async cleanup(): Promise<void> {
    this.stopPeriodicFetch();
    this.isInitialized = false;
    this.lastFetchTime = null;
    this.retryCount = 0;
    logger.debug('[RemoteConfigManager] Cleaned up');
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async getLastFetchTimePublic(): Promise<number | null> {
    return this.getLastFetchTime();
  }

  /**
   * Clear cache and force refresh - useful for handling deleted Firebase keys
   */
  async clearCacheAndRefresh(): Promise<boolean> {
    try {
      logger.debug('[RemoteConfigManager] Clearing cache and forcing refresh...');
      
      // Clear the Firebase API cache and force refetch
      const success = await firebaseRemoteConfigAPI.clearCacheAndRefetch();
      
      if (success) {
        // Process the fresh configuration
        await this.processConfiguration();
        logger.debug('[RemoteConfigManager] Cache cleared and config refreshed successfully');
      }
      
      return success;
    } catch (error) {
      logger.error('[RemoteConfigManager] Failed to clear cache and refresh:', error);
      return false;
    }
  }
}
