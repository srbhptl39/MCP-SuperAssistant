/**
 * Firebase Remote Config REST API Client for Service Workers
 * 
 * This implementation uses the Firebase Remote Config REST API directly
 * since the Firebase Web SDK doesn't work in service workers.
 */

interface RemoteConfigValue {
  value: string;
  source: 'remote' | 'default' | 'static';
}

interface RemoteConfigResponse {
  entries: Record<string, RemoteConfigValue>;
  state: string;
}

interface FirebaseProject {
  projectId: string;
  apiKey: string;
  appId: string;
}

export class FirebaseRemoteConfigAPI {
  private projectConfig: FirebaseProject;
  private cachedConfig: Record<string, RemoteConfigValue> = {};
  private lastFetchTime: number = 0;
  private minimumFetchInterval: number = 3600000; // 1 hour in production
  private fetchTimeout: number = 60000; // 60 seconds
  
  // Default configuration values
  private defaultConfig: Record<string, string> = {
    'notifications_enabled': 'true',
    'max_notifications_per_day': '3',
    'notification_cooldown_hours': '4',
    'features': JSON.stringify({
      'sidebar_v2': { enabled: false, rollout: 0, schema_version: 1 },
      'ai_tools_enhanced': { enabled: true, rollout: 100, schema_version: 1 },
      'notification_system': { enabled: true, rollout: 100, schema_version: 1 }
    }),
    'config_version': '1.0.0',
    'schema_version': '1',
    'last_updated': new Date().toISOString(),
    'privacy_policy_version': '1.0.0',
    'data_collection_consent_required': 'true',
    'active_notifications': JSON.stringify([]),
    'update_notifications': JSON.stringify({
      enabled: true,
      min_version_gap: '0.1.0',
      channels: ['in-app', 'badge'],
      schema_version: 1
    })
  };

constructor() {
    // Get configuration from environment/build time
    const isDevelopment = !chrome.runtime.getManifest().update_url;
    
    this.projectConfig = {
        projectId: isDevelopment 
            ? (process.env.FIREBASE_PROJECT_ID_DEV || '')
            : (process.env.FIREBASE_PROJECT_ID_PROD || ''),
        apiKey: isDevelopment 
            ? (process.env.FIREBASE_API_KEY_DEV || '')
            : (process.env.FIREBASE_API_KEY_PROD || ''),
        appId: isDevelopment 
            ? (process.env.FIREBASE_APP_ID_DEV || '')
            : (process.env.FIREBASE_APP_ID_PROD || '')
    };

    // Set fetch interval based on environment
    this.minimumFetchInterval = isDevelopment ? 300000 : 3600000; // 5 min dev, 1 hour prod
}

  async initialize(): Promise<void> {
    console.log('[FirebaseRemoteConfigAPI] Initializing Remote Config API...');
    
    // Load cached config and default values
    await this.loadCachedConfig();
    this.initializeWithDefaults();
    
    console.log('[FirebaseRemoteConfigAPI] Remote Config API initialized');
  }

  async fetchAndActivate(force = false): Promise<boolean> {
    try {
      const now = Date.now();
      
      // Check minimum fetch interval unless forced
      if (!force && (now - this.lastFetchTime) < this.minimumFetchInterval) {
        console.debug('[FirebaseRemoteConfigAPI] Skipping fetch due to minimum interval');
        return false;
      }

      if (!this.projectConfig.apiKey || !this.projectConfig.projectId) {
        console.warn('[FirebaseRemoteConfigAPI] Firebase configuration missing, using defaults only');
        return false;
      }

      const success = await this.fetchRemoteConfig();
      if (success) {
        this.lastFetchTime = now;
        await this.saveCachedConfig();
      }
      
      return success;
    } catch (error) {
      console.error('[FirebaseRemoteConfigAPI] Failed to fetch and activate:', error);
      return false;
    }
  }

  private async fetchRemoteConfig(): Promise<boolean> {
    try {
      const installationId = await this.getInstallationId();
      const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${this.projectConfig.projectId}/namespaces/firebase:fetch`;
      
      const requestBody = {
        appId: this.projectConfig.appId,
        appInstanceId: installationId,
        appInstanceIdToken: '', // Would need Firebase Installations API for this
        languageCode: 'en-US',
        platformVersion: chrome.runtime.getManifest().version,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.projectConfig.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RemoteConfigResponse = await response.json();
      
      // Update cached config with remote values
      if (data.entries) {
        this.cachedConfig = { ...this.cachedConfig, ...data.entries };
        console.log(`[FirebaseRemoteConfigAPI] Fetched ${Object.keys(data.entries).length} remote config values`);
      }

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[FirebaseRemoteConfigAPI] Fetch timeout');
      } else {
        console.error('[FirebaseRemoteConfigAPI] Fetch failed:', error);
      }
      return false;
    }
  }

  getValue(key: string): RemoteConfigValue {
    // Check cached remote config first
    if (this.cachedConfig[key]) {
      return this.cachedConfig[key];
    }

    // Fall back to default config
    if (this.defaultConfig[key]) {
      return {
        value: this.defaultConfig[key],
        source: 'default'
      };
    }

    // Return empty string as final fallback
    return {
      value: '',
      source: 'static'
    };
  }

  getAll(): Record<string, RemoteConfigValue> {
    // Combine defaults with cached remote values
    const combined: Record<string, RemoteConfigValue> = {};
    
    // Add defaults first
    for (const [key, value] of Object.entries(this.defaultConfig)) {
      combined[key] = {
        value,
        source: 'default'
      };
    }
    
    // Override with cached remote values
    for (const [key, remoteValue] of Object.entries(this.cachedConfig)) {
      combined[key] = remoteValue;
    }
    
    return combined;
  }

  private initializeWithDefaults(): void {
    // Initialize cached config with defaults if empty
    for (const [key, value] of Object.entries(this.defaultConfig)) {
      if (!this.cachedConfig[key]) {
        this.cachedConfig[key] = {
          value,
          source: 'default'
        };
      }
    }
  }

  private async loadCachedConfig(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['firebaseRemoteConfig', 'firebaseRemoteConfigLastFetch']);
      
      if (result.firebaseRemoteConfig) {
        this.cachedConfig = result.firebaseRemoteConfig;
      }
      
      if (result.firebaseRemoteConfigLastFetch) {
        this.lastFetchTime = result.firebaseRemoteConfigLastFetch;
      }
    } catch (error) {
      console.error('[FirebaseRemoteConfigAPI] Failed to load cached config:', error);
    }
  }

  private async saveCachedConfig(): Promise<void> {
    try {
      await chrome.storage.local.set({
        firebaseRemoteConfig: this.cachedConfig,
        firebaseRemoteConfigLastFetch: this.lastFetchTime
      });
    } catch (error) {
      console.error('[FirebaseRemoteConfigAPI] Failed to save cached config:', error);
    }
  }

  private async getInstallationId(): Promise<string> {
    try {
      const result = await chrome.storage.local.get(['firebaseInstallationId']);
      
      if (result.firebaseInstallationId) {
        return result.firebaseInstallationId;
      }

      // Generate a new installation ID
      const installationId = this.generateInstallationId();
      await chrome.storage.local.set({ firebaseInstallationId: installationId });
      
      return installationId;
    } catch (error) {
      console.error('[FirebaseRemoteConfigAPI] Failed to get installation ID:', error);
      return this.generateInstallationId();
    }
  }

  private generateInstallationId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 22; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// Validation functions
export const validateConfigContent = (content: any): boolean => {
  if (!content || typeof content !== 'object') {
    return false;
  }

  // Add your validation logic here
  try {
    if (content.features && typeof content.features !== 'object') {
      return false;
    }
    
    if (content.notifications && !Array.isArray(content.notifications)) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[FirebaseRemoteConfigAPI] Validation error:', error);
    return false;
  }
};

// Create singleton instance
export const firebaseRemoteConfigAPI = new FirebaseRemoteConfigAPI();
