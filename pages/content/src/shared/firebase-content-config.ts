import { initializeApp } from 'firebase/app';
import { getRemoteConfig, fetchAndActivate, getValue, getAll } from 'firebase/remote-config';
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Environment-based configuration
const getFirebaseConfig = () => {
  //const isDevelopment = process.env.NODE_ENV === 'development';
const isDevelopment = false;
  
return {
    apiKey: isDevelopment ? process.env.FIREBASE_API_KEY_DEV : process.env.FIREBASE_API_KEY_PROD,
    authDomain: isDevelopment ? process.env.FIREBASE_AUTH_DOMAIN_DEV : process.env.FIREBASE_AUTH_DOMAIN_PROD,
    projectId: isDevelopment ? process.env.FIREBASE_PROJECT_ID_DEV : process.env.FIREBASE_PROJECT_ID_PROD,
    storageBucket: isDevelopment ? process.env.FIREBASE_STORAGE_BUCKET_DEV : process.env.FIREBASE_STORAGE_BUCKET_PROD,
    messagingSenderId: process.env.FIREBASE_SENDER_ID,
    appId: isDevelopment ? process.env.FIREBASE_APP_ID_DEV : process.env.FIREBASE_APP_ID_PROD,
    measurementId: isDevelopment ? process.env.FIREBASE_MEASUREMENT_ID_DEV : process.env.FIREBASE_MEASUREMENT_ID_PROD
};
};

// Initialize Firebase
const app = initializeApp(getFirebaseConfig());

// Initialize App Check for security (production only) - Safe in content script context
let appCheck: any = null;
if (process.env.NODE_ENV === 'production' && process.env.RECAPTCHA_SITE_KEY) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    console.debug('[Firebase] App Check initialized in content script');
  } catch (error) {
    console.warn('[Firebase] App Check initialization failed:', error);
  }
}

// Initialize Remote Config
export const remoteConfig = getRemoteConfig(app);

// Initialize Analytics in content script context
let analytics: any = null;
const initializeAnalytics = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(app);
      console.debug('[Firebase] Analytics initialized in content script');
    } else {
      console.debug('[Firebase] Analytics not supported in this environment');
    }
  } catch (error) {
    console.warn('[Firebase] Analytics initialization failed:', error);
  }
};

// Initialize analytics asynchronously
initializeAnalytics();

// Configure Remote Config with enhanced security
remoteConfig.settings = {
  minimumFetchIntervalMillis: process.env.NODE_ENV === 'development' ? 300000 : 3600000, // 5 min dev, 1 hour prod
  fetchTimeoutMillis: 60000, // 1 minute
};

// Content validation function
const sanitizeHtml = (content: string): string => {
  // Basic HTML sanitization - in production, use a proper library like DOMPurify
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

const validateConfigContent = (content: any): boolean => {
  try {
    // Implement strict validation
    if (typeof content !== 'object') return false;
    
    // Validate notification content
    if (content.notifications && Array.isArray(content.notifications)) {
      for (const notification of content.notifications) {
        if (!notification.id || !notification.title || !notification.message) return false;
        notification.message = sanitizeHtml(notification.message);
        notification.title = sanitizeHtml(notification.title);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[Firebase] Config validation failed:', error);
    return false;
  }
};

// Set defaults with validation
remoteConfig.defaultConfig = {
  // Notification defaults
  'notifications_enabled': true,
  'max_notifications_per_day': 3,
  'notification_cooldown_hours': 4,
  
  // Feature flag defaults
  'features': JSON.stringify({
    'sidebar_v2': { enabled: false, rollout: 0, schema_version: 1 },
    'ai_tools_enhanced': { enabled: true, rollout: 100, schema_version: 1 },
    'notification_system': { enabled: true, rollout: 100, schema_version: 1 }
  }),
  
  // Configuration metadata
  'config_version': '1.0.0',
  'schema_version': 1,
  'last_updated': new Date().toISOString(),
  
  // Privacy and compliance
  'privacy_policy_version': '1.0.0',
  'data_collection_consent_required': true,
  
  // Notification configurations
  'active_notifications': JSON.stringify([]),
  'update_notifications': JSON.stringify({
    enabled: true,
    min_version_gap: '0.1.0',
    channels: ['in-app', 'badge'],
    schema_version: 1
  })
};

// Export Firebase instances and utilities
export { 
  app as firebaseApp, 
  analytics,
  appCheck,
  fetchAndActivate,
  getValue,
  getAll,
  sanitizeHtml,
  validateConfigContent
};

// Helper functions for Remote Config
export const fetchRemoteConfig = async (force = false): Promise<boolean> => {
  try {
    const now = Date.now();
    const minInterval = remoteConfig.settings.minimumFetchIntervalMillis;
    
    // Check if we should fetch (respect minimum interval unless forced)
    const lastFetchResult = await chrome.storage.local.get(['remoteConfigLastFetch']);
    const lastFetchTime = lastFetchResult?.remoteConfigLastFetch || 0;
    
    if (!force && (now - lastFetchTime) < minInterval) {
      console.debug('[Firebase] Skipping fetch due to minimum interval');
      return false;
    }

    console.debug('[Firebase] Fetching remote config from content script...');
    await fetchAndActivate(remoteConfig);
    
    // Store last fetch time
    await chrome.storage.local.set({ remoteConfigLastFetch: now });
    
    console.debug('[Firebase] Remote config fetched and activated successfully');
    return true;
  } catch (error) {
    console.error('[Firebase] Failed to fetch remote config:', error);
    throw error;
  }
};

export const getRemoteConfigValue = (key: string): any => {
  try {
    const value = getValue(remoteConfig, key);
    return value.asString();
  } catch (error) {
    console.error('[Firebase] Failed to get remote config value:', error);
    return null;
  }
};

export const getAllRemoteConfigValues = (): Record<string, any> => {
  try {
    const values = getAll(remoteConfig);
    const result: Record<string, any> = {};
    
    for (const [key, configValue] of Object.entries(values)) {
      result[key] = configValue.asString();
    }
    
    return result;
  } catch (error) {
    console.error('[Firebase] Failed to get all remote config values:', error);
    return {};
  }
};

// Analytics helper functions (safe for content script)
export const logAnalyticsEvent = async (eventName: string, eventParams?: Record<string, any>) => {
  if (analytics) {
    try {
      await logEvent(analytics, eventName, eventParams);
      console.debug('[Firebase] Analytics event logged:', eventName, eventParams);
    } catch (error) {
      console.error('[Firebase] Failed to log analytics event:', error);
    }
  }
};
