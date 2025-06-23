// Firebase configuration for MCP SuperAssistant
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getRemoteConfig, 
  fetchAndActivate, 
  getValue, 
  getAll,
  type RemoteConfig 
} from 'firebase/remote-config';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Content validation and sanitization
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

// Simple HTML sanitizer for notification content
function sanitizeHtml(html: string): string {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Remove script tags and event handlers
  const scripts = tempDiv.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove event handler attributes
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove all on* attributes (onclick, onload, etc.)
    const attributes = Array.from(el.attributes);
    attributes.forEach(attr => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  return tempDiv.innerHTML;
}

// Environment-based configuration
const getFirebaseConfig = () => {
  //const isDevelopment = process.env.NODE_ENV === 'development';
const isDevelopment = false;
  
return {
    apiKey: isDevelopment ? process.env.FIREBASE_API_KEY_DEV : process.env.FIREBASE_API_KEY_PROD,
    authDomain: isDevelopment ? process.env.FIREBASE_AUTH_DOMAIN_DEV : process.env.FIREBASE_AUTH_DOMAIN_PROD,
    projectId: isDevelopment ? process.env.FIREBASE_PROJECT_ID_DEV : process.env.FIREBASE_PROJECT_ID_PROD,
    // Use consistent storage bucket for both environments  
    storageBucket: isDevelopment ? process.env.FIREBASE_STORAGE_BUCKET_DEV : process.env.FIREBASE_STORAGE_BUCKET_PROD,
    messagingSenderId: process.env.FIREBASE_SENDER_ID,
    appId: isDevelopment ? process.env.FIREBASE_APP_ID_DEV : process.env.FIREBASE_APP_ID_PROD,
    measurementId: isDevelopment ? process.env.FIREBASE_MEASUREMENT_ID_DEV : process.env.FIREBASE_MEASUREMENT_ID_PROD
};
};

// Initialize Firebase app
let app: FirebaseApp;
let remoteConfig: RemoteConfig;
let analytics: Analytics | null = null;

try {
  app = initializeApp(getFirebaseConfig());
  
  // Initialize App Check for security (production only)
  if (process.env.NODE_ENV === 'production' && process.env.RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  }
  
  // Initialize Remote Config
  remoteConfig = getRemoteConfig(app);
  
  // Configure Remote Config with enhanced security
  remoteConfig.settings = {
    minimumFetchIntervalMillis: process.env.NODE_ENV === 'development' ? 300000 : 3600000, // 5 min dev, 1 hour prod
    fetchTimeoutMillis: 60000, // 1 minute
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
  
  // Initialize Analytics if available
  if (typeof window !== 'undefined') {
    try {
      analytics = getAnalytics(app);
    } catch (error) {
      console.warn('[Firebase] Analytics initialization failed:', error);
    }
  }
  
} catch (error) {
  console.error('[Firebase] Failed to initialize Firebase:', error);
  throw error;
}

// Content validation functions
export const validateConfigContent = (content: any): ValidationResult => {
  const errors: string[] = [];
  let sanitizedData = { ...content };
  
  try {
    // Basic type validation
    if (!content || typeof content !== 'object') {
      errors.push('Content must be a valid object');
      return { isValid: false, errors };
    }
    
    // Validate notification content
    if (content.notifications && Array.isArray(content.notifications)) {
      sanitizedData.notifications = content.notifications.map((notification: any) => {
        if (!notification.id || !notification.title || !notification.message) {
          errors.push(`Invalid notification structure: missing id, title, or message`);
          return notification;
        }
        
        // Sanitize HTML content
        return {
          ...notification,
          title: typeof notification.title === 'string' ? sanitizeHtml(notification.title) : notification.title,
          message: typeof notification.message === 'string' ? sanitizeHtml(notification.message) : notification.message
        };
      });
    }
    
    // Validate feature flags
    if (content.features && typeof content.features === 'object') {
      const validatedFeatures: Record<string, any> = {};
      Object.entries(content.features).forEach(([key, feature]: [string, any]) => {
        if (feature && typeof feature === 'object') {
          validatedFeatures[key] = {
            enabled: Boolean(feature.enabled),
            rollout: Math.max(0, Math.min(100, Number(feature.rollout) || 0)),
            config: feature.config || {},
            schema_version: Number(feature.schema_version) || 1
          };
        }
      });
      sanitizedData.features = validatedFeatures;
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData
    };
    
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return { isValid: false, errors };
  }
};

// Export Firebase instances and utilities
export { 
  app as firebaseApp, 
  remoteConfig, 
  analytics,
  fetchAndActivate,
  getValue,
  getAll,
  sanitizeHtml
};

// Helper functions for Remote Config
export const fetchRemoteConfig = async (force = false): Promise<boolean> => {
  try {
    await fetchAndActivate(remoteConfig);
    
    // Debug log: Show all fetched configuration
    console.debug('[Firebase] Remote config fetched successfully. Current configuration:');
    const allConfig = getAll(remoteConfig);
    Object.entries(allConfig).forEach(([key, configValue]) => {
      const value = configValue.asString();
      const source = configValue.getSource();
      
      // Try to parse JSON values for better display
      let displayValue = value;
      try {
        const parsed = JSON.parse(value);
        displayValue = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep as string if not JSON
      }
      
      console.debug(`  ${key} (${source}):`, displayValue);
    });
    
    return true;
  } catch (error) {
    console.error('[Firebase] Failed to fetch remote config:', error);
    return false;
  }
};

export const getRemoteConfigValue = (key: string): any => {
  try {
    const value = getValue(remoteConfig, key);
    const stringValue = value.asString();
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(stringValue);
    } catch {
      return stringValue;
    }
  } catch (error) {
    console.error(`[Firebase] Failed to get remote config value for key: ${key}`, error);
    return null;
  }
};

export const getAllRemoteConfigValues = (): Record<string, any> => {
  try {
    const all = getAll(remoteConfig);
    const config: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(all)) {
      try {
        config[key] = JSON.parse(value.asString());
      } catch {
        config[key] = value.asString();
      }
    }
    
    return config;
  } catch (error) {
    console.error('[Firebase] Failed to get all remote config values:', error);
    return {};
  }
};
