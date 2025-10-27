import type { AdapterConfig, AdapterOverrides } from './types';
import { GEMINI_DEFAULT_CONFIG } from './gemini.config';
import { CHATGPT_DEFAULT_CONFIG } from './chatgpt.config';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Configuration manager for adapters
 * Handles loading configurations from Firebase Remote Config with fallbacks to defaults
 */

const logger = createLogger('AdapterConfigManager');

export class AdapterConfigManager {
  private static instance: AdapterConfigManager;
  private configCache = new Map<string, AdapterConfig>();
  private context: any = null;

  private constructor() {}

  static getInstance(): AdapterConfigManager {
    if (!AdapterConfigManager.instance) {
      AdapterConfigManager.instance = new AdapterConfigManager();
    }
    return AdapterConfigManager.instance;
  }

  /**
   * Initialize with plugin context
   */
  initialize(context: any) {
    this.context = context;
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for remote config updates
   * Integrates with the existing event system instead of creating parallel logic
   */
  private setupEventListeners() {
    if (!this.context?.eventBus) return;

    // Listen for adapter config updates from the existing remote config system
    this.context.eventBus.on('remote-config:adapter-configs-updated', (data: any) => {
      logger.debug('[AdapterConfigManager] Received adapter config updates from existing system');
      logger.debug(data);
      this.handleAdapterConfigUpdate(data.adapterConfigs);
    });

    // Also listen for general remote config updates as fallback
    this.context.eventBus.on('remote-config:updated', (data: any) => {
      if (data.changes.some((change: string) => change.includes('adapter'))) {
        logger.debug('[AdapterConfigManager] Detected adapter-related config changes, clearing cache');
        this.clearCache();
      }
    });
  }

  /**
   * Handle adapter configuration updates from the existing remote config system
   */
  private handleAdapterConfigUpdate(adapterConfigs: Record<string, any>) {
    logger.debug('[AdapterConfigManager] Processing adapter config update:', adapterConfigs);
    
    // Clear relevant cache entries
    this.clearCache();
    
    // Update cache with new configurations
    Object.entries(adapterConfigs).forEach(([adapterName, config]) => {
      const cacheKey = `${adapterName}_adapter_config`;
      logger.debug(`Caching config for ${adapterName}:`, config);
      this.configCache.set(cacheKey, config as AdapterConfig);
    });

    logger.debug(`Updated cache for ${Object.keys(adapterConfigs).length} adapters`);
    logger.debug('[AdapterConfigManager] Current cache keys:', Array.from(this.configCache.keys()));
  }

  /**
   * Get configuration for a specific adapter
   * @param adapterName - Name of the adapter (e.g., 'gemini')
   * @param variant - Optional variant (e.g., 'experimental', 'testing')
   * @returns Promise<AdapterConfig>
   */
  async getAdapterConfig(adapterName: string, variant?: string): Promise<AdapterConfig> {
    const cacheKey = `${adapterName}_adapter_config${variant ? `_${variant}` : ''}`;
    
    logger.debug(`Getting adapter config for ${adapterName} (${variant || 'default'})`);
    logger.debug(`Cache key: ${cacheKey}`);
    logger.debug(`Current cache keys:`, Array.from(this.configCache.keys()));
    
    // Check cache first
    if (this.configCache.has(cacheKey)) {
      logger.debug(`Using cached config for ${adapterName} (${variant || 'default'})`);
      return this.configCache.get(cacheKey)!;
    }

    let config: AdapterConfig;

    try {
      // Try to get from remote config via Chrome runtime message
      // Request using the cache key which matches the Firebase parameter name
      const remoteConfig = await this.getRemoteConfig(cacheKey);
      
      if (!remoteConfig) {
        logger.debug(`No remote config found for ${adapterName}, using defaults`);
        // Fallback to default config
        config = this.getDefaultConfig(adapterName);
      } else {
        logger.debug(`Loaded remote config for ${adapterName} (${variant || 'default'}):`, remoteConfig);
        // Merge remote config with defaults to ensure all properties exist
        config = this.mergeWithDefaults(remoteConfig, adapterName);
      }
    } catch (error) {
      logger.warn(`Failed to load remote config for ${adapterName}:`, error);
      config = this.getDefaultConfig(adapterName);
    }

    // Cache the resolved config
    this.configCache.set(cacheKey, config);

    logger.debug(`Returning Final config for ${adapterName} (${variant || 'default'}): ${JSON.stringify(config)}`);
    
    return config;
  }

  /**
   * Get specific selector from adapter config
   */
  async getSelector(adapterName: string, selectorName: keyof AdapterConfig['selectors'], variant?: string): Promise<string> {
    const config = await this.getAdapterConfig(adapterName, variant);
    return config.selectors[selectorName] || '';
  }

  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(adapterName: string, featureName: keyof AdapterConfig['features'], variant?: string): Promise<boolean> {
    const config = await this.getAdapterConfig(adapterName, variant);
    return config.features[featureName] || false;
  }

  /**
   * Get UI configuration
   */
  async getUIConfig(adapterName: string, variant?: string): Promise<AdapterConfig['ui']> {
    const config = await this.getAdapterConfig(adapterName, variant);
    return config.ui;
  }

  /**
   * Clear cache for an adapter (useful when remote config updates)
   */
  clearCache(adapterName?: string) {
    if (adapterName) {
      // Clear specific adapter cache
      const keysToDelete = Array.from(this.configCache.keys()).filter(key => 
        key.startsWith(`${adapterName}_adapter_config`)
      );
      keysToDelete.forEach(key => this.configCache.delete(key));
    } else {
      // Clear all cache
      this.configCache.clear();
    }
  }

  /**
   * Get configuration from Firebase Remote Config via existing infrastructure
   * Now leverages the established remote config system instead of duplicating logic
   */
  private async getRemoteConfig(configKey: string): Promise<AdapterConfig | null> {
    try {
      logger.debug(`Requesting remote config for key: ${configKey}`);
      
      // Use the existing Chrome runtime message to background script
      // This leverages the established Firebase Remote Config infrastructure
      const response = await chrome.runtime.sendMessage({
        type: 'remote-config:get-config',
        payload: { key: configKey }
      });
      
      logger.debug(`Chrome runtime response for ${configKey}:`, response);
      
      if (response && response.success && response.data) {
        // The background script returns data in response.data in format { [key]: value }
        if (response.data[configKey]) {
          const configValue = response.data[configKey];
          logger.debug(`Found remote config for ${configKey}:`, configValue);
          
          // Validate that this looks like an adapter config
          if (configValue && typeof configValue === 'object' && 
              (configValue.selectors || configValue.ui || configValue.features)) {
            return configValue as AdapterConfig;
          } else if (configValue === null) {
            // Explicitly null config from Firebase - this is expected when no config exists
            logger.debug(`No remote config set for ${configKey}`);
            return null;
          } else {
            logger.warn(`Invalid adapter config structure for ${configKey}:`, configValue);
            return null;
          }
        }
        // Also check for unified format - if requesting gemini_adapter_config but got adapter_configs
        else if (configKey.includes('_adapter_config') && response.data.adapter_configs) {
          const adapterName = configKey.replace('_adapter_config', '');
          const unifiedConfigs = response.data.adapter_configs;
          if (unifiedConfigs[adapterName]) {
            logger.debug(`Found unified remote config for ${adapterName}:`, unifiedConfigs[adapterName]);
            return unifiedConfigs[adapterName] as AdapterConfig;
          }
        }
        // Handle case where response.data itself is the config object (unlikely but possible)
        else if (typeof response.data === 'object' && 
                 (response.data.selectors || response.data.ui || response.data.features)) {
          logger.debug(`Found direct remote config object for ${configKey}:`, response.data);
          return response.data as AdapterConfig;
        }
      }
      
      logger.debug(`No valid remote config found for ${configKey}`);
      return null;
    } catch (error) {
      logger.error(`Error fetching remote config for ${configKey}:`, error);
      return null;
    }
  }

  /**
   * Get default configuration for adapter
   */
  private getDefaultConfig(adapterName: string): AdapterConfig {
    switch (adapterName.toLowerCase()) {
      case 'gemini':
        return { ...GEMINI_DEFAULT_CONFIG };
      case 'chatgpt':
        return { ...CHATGPT_DEFAULT_CONFIG };
      default:
        logger.warn(`No default config found for ${adapterName}, using Gemini defaults`);
        return { ...GEMINI_DEFAULT_CONFIG };
    }
  }

  /**
   * Merge remote config with defaults to ensure all required properties exist
   * Supports override mechanism - when override flags are set, use only remote config values for those sections
   */
  private mergeWithDefaults(remoteConfig: Partial<AdapterConfig>, adapterName: string): AdapterConfig {
    const defaultConfig = this.getDefaultConfig(adapterName);
    const overrides = remoteConfig.overrides;
    
    // Determine if we should override specific sections
    const shouldOverrideSelectors = overrides?.selectors === true;
    const shouldOverrideFeatures = overrides?.features === true;
    const shouldOverrideUIAll = overrides?.ui?.all === true;
    
    // Build selectors section with override support
    const selectors = shouldOverrideSelectors && remoteConfig.selectors
      ? this.validateAndSanitizeSelectors(remoteConfig.selectors, defaultConfig.selectors)
      : {
          ...defaultConfig.selectors,
          ...remoteConfig.selectors
        };

    // Build UI section with granular override support
    const ui = shouldOverrideUIAll && remoteConfig.ui
      ? this.validateAndSanitizeUI(remoteConfig.ui, defaultConfig.ui)
      : {
          ...defaultConfig.ui,
          ...remoteConfig.ui,
          typing: this.mergeUISection(
            'typing',
            defaultConfig.ui.typing,
            remoteConfig.ui?.typing,
            overrides?.ui?.typing
          ),
          animations: this.mergeUISection(
            'animations',
            defaultConfig.ui.animations,
            remoteConfig.ui?.animations,
            overrides?.ui?.animations
          ),
          retry: this.mergeUISection(
            'retry',
            defaultConfig.ui.retry,
            remoteConfig.ui?.retry,
            overrides?.ui?.retry
          ),
          fileUpload: this.mergeUISection(
            'fileUpload',
            defaultConfig.ui.fileUpload,
            remoteConfig.ui?.fileUpload,
            overrides?.ui?.fileUpload
          ),
          polling: this.mergeUISection(
            'polling',
            defaultConfig.ui.polling,
            remoteConfig.ui?.polling,
            overrides?.ui?.polling
          )
        };

    // Build features section with override support
    const features = shouldOverrideFeatures && remoteConfig.features
      ? this.validateAndSanitizeFeatures(remoteConfig.features, defaultConfig.features)
      : {
          ...defaultConfig.features,
          ...remoteConfig.features
        };

    // Handle specific key overrides
    let result = {
      ...defaultConfig,
      ...remoteConfig,
      selectors,
      ui,
      features
    };

    // Apply specific key overrides if specified
    if (overrides?.keys && Array.isArray(overrides.keys)) {
      result = this.applyKeyOverrides(result, remoteConfig, overrides.keys);
    }

    return result;
  }

  /**
   * Merge a specific UI section with override support
   * Provides fail-safe behavior by validating remote config before applying overrides
   */
  private mergeUISection<T extends Record<string, any>>(
    sectionName: string,
    defaultSection: T,
    remoteSection: Partial<T> | undefined,
    shouldOverride?: boolean
  ): T {
    if (shouldOverride && remoteSection) {
      // Validate remote section has required properties before overriding
      const hasRequiredProperties = this.validateUISection(sectionName, remoteSection, defaultSection);
      if (hasRequiredProperties) {
        return { ...defaultSection, ...remoteSection } as T;
      } else {
        logger.warn(`Override failed for ${sectionName} - missing required properties, using merged config`);
        return { ...defaultSection, ...remoteSection } as T;
      }
    }
    
    // Default behavior: merge with defaults
    return { ...defaultSection, ...remoteSection } as T;
  }

  /**
   * Apply specific key overrides
   * Only overrides keys that exist in remote config to maintain fail-safe behavior
   */
  private applyKeyOverrides(
    result: AdapterConfig,
    remoteConfig: Partial<AdapterConfig>,
    overrideKeys: string[]
  ): AdapterConfig {
    const updatedResult = { ...result };
    
    for (const key of overrideKeys) {
      if (key in remoteConfig && remoteConfig[key as keyof AdapterConfig] !== undefined) {
        // Only override if remote config has a valid value for this key
        const remoteValue = remoteConfig[key as keyof AdapterConfig];
        if (remoteValue !== null && remoteValue !== undefined) {
          (updatedResult as any)[key] = remoteValue;
          logger.debug(`Applied key override for: ${key}`);
        } else {
          logger.warn(`Skipping key override for ${key} - remote value is null/undefined`);
        }
      } else {
        logger.warn(`Skipping key override for ${key} - not found in remote config`);
      }
    }
    
    return updatedResult;
  }

  /**
   * Validate that a UI section has required properties before allowing override
   */
  private validateUISection(sectionName: string, remoteSection: any, defaultSection: any): boolean {
    if (!remoteSection || typeof remoteSection !== 'object') {
      return false;
    }

    // Check if remote section has at least some of the required properties from default
    const defaultKeys = Object.keys(defaultSection);
    const remoteKeys = Object.keys(remoteSection);
    
    // Require at least 50% of default keys to be present for override
    const requiredKeyCount = Math.ceil(defaultKeys.length * 0.5);
    const presentKeyCount = defaultKeys.filter(key => remoteKeys.includes(key)).length;
    
    const isValid = presentKeyCount >= requiredKeyCount;
    
    if (!isValid) {
      logger.warn(`UI section ${sectionName} validation failed: ${presentKeyCount}/${defaultKeys.length} keys present (required: ${requiredKeyCount})`);
    }
    
    return isValid;
  }

  /**
   * Validate and sanitize selectors section for override
   */
  private validateAndSanitizeSelectors(remoteSelectors: any, defaultSelectors: any): any {
    if (!remoteSelectors || typeof remoteSelectors !== 'object') {
      logger.warn('[AdapterConfigManager] Invalid remote selectors for override, using defaults');
      return defaultSelectors;
    }

    // Ensure at least core selectors are present
    const coreSelectors = ['chatInput', 'submitButton'];
    const hasCore = coreSelectors.every(key => 
      key in remoteSelectors && 
      typeof remoteSelectors[key] === 'string' && 
      remoteSelectors[key].trim().length > 0
    );

    if (!hasCore) {
      logger.warn('[AdapterConfigManager] Remote selectors missing core selectors, merging with defaults');
      return { ...defaultSelectors, ...remoteSelectors };
    }

    return { ...defaultSelectors, ...remoteSelectors };
  }

  /**
   * Validate and sanitize features section for override
   */
  private validateAndSanitizeFeatures(remoteFeatures: any, defaultFeatures: any): any {
    if (!remoteFeatures || typeof remoteFeatures !== 'object') {
      logger.warn('[AdapterConfigManager] Invalid remote features for override, using defaults');
      return defaultFeatures;
    }

    // Ensure all feature values are boolean
    const sanitizedFeatures = { ...defaultFeatures };
    
    for (const [key, value] of Object.entries(remoteFeatures)) {
      if (typeof value === 'boolean') {
        sanitizedFeatures[key as keyof typeof defaultFeatures] = value;
      } else {
        logger.warn(`Invalid feature value for ${key}: ${value}, keeping default`);
      }
    }

    return sanitizedFeatures;
  }

  /**
   * Validate and sanitize UI section for override
   */
  private validateAndSanitizeUI(remoteUI: any, defaultUI: any): any {
    if (!remoteUI || typeof remoteUI !== 'object') {
      logger.warn('[AdapterConfigManager] Invalid remote UI config for override, using defaults');
      return defaultUI;
    }

    // For UI override, we still want to merge sub-sections to ensure completeness
    return {
      ...defaultUI,
      ...remoteUI,
      // Ensure critical sub-sections exist
      typing: remoteUI.typing || defaultUI.typing,
      animations: remoteUI.animations || defaultUI.animations,
      retry: remoteUI.retry || defaultUI.retry,
      fileUpload: remoteUI.fileUpload || defaultUI.fileUpload,
      polling: remoteUI.polling || defaultUI.polling
    };
  }
}

// Export singleton instance
export const adapterConfigManager = AdapterConfigManager.getInstance();
