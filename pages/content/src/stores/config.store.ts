import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export interface FeatureFlag {
  enabled: boolean;
  rollout: number;
  config?: Record<string, any>;
  dependencies?: string[];
  targeting?: {
    versions?: string[];
    regions?: string[];
    userSegments?: string[];
  };
}

export interface UserProperties {
  extensionVersion: string;
  installDate: string;
  usageDays: number;
  featuresUsed: string[];
  userSegment: string;
  sessionCount: number;
  lastActiveDate: string;
  browserVersion: string;
  platform: string;
  language: string;
  timezone: string;
}

export interface NotificationConfig {
  enabled: boolean;
  maxPerDay: number;
  cooldownHours: number;
  respectDoNotDisturb: boolean;
  channels: string[];
}

export interface RemoteNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
  actions?: NotificationAction[];
  targeting?: NotificationTargeting;
  campaignId?: string;
  priority?: number;
  expiresAt?: string;
}

export interface NotificationAction {
  text: string;
  action: string;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationTargeting {
  versions?: string[];
  userSegments?: string[];
  featureFlags?: string[];
  regions?: string[];
  installDateRange?: {
    start?: string;
    end?: string;
  };
}

export interface ConfigState {
  // Feature flags
  featureFlags: Record<string, FeatureFlag>;
  
  // Remote config metadata
  lastFetchTime: number | null;
  lastUpdateTime: number | null;
  isLoading: boolean;
  error: string | null;
  
  // User targeting data
  userProperties: UserProperties;
  userSegment: string;
  
  // Notification state
  notificationConfig: NotificationConfig;
  shownNotifications: string[];
  notificationHistory: Array<{ id: string; shownAt: number; action?: string }>;
  
  // Actions
  updateFeatureFlags: (flags: Record<string, FeatureFlag>) => void;
  setUserProperties: (properties: Partial<UserProperties>) => void;
  setUserSegment: (segment: string) => void;
  updateNotificationConfig: (config: Partial<NotificationConfig>) => void;
  markNotificationShown: (notificationId: string) => void;
  addNotificationToHistory: (notificationId: string, action?: string) => void;
  isFeatureEnabled: (featureName: string) => boolean;
  getFeatureConfig: (featureName: string) => FeatureFlag | undefined;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateLastFetchTime: (timestamp: number) => void;
  canShowNotification: (notification: RemoteNotification) => boolean;
  resetState: () => void;
}

const initialUserProperties: UserProperties = {
  extensionVersion: chrome?.runtime?.getManifest?.()?.version || '0.0.0',
  installDate: new Date().toISOString(),
  usageDays: 0,
  featuresUsed: [],
  userSegment: 'new',
  sessionCount: 0,
  lastActiveDate: new Date().toISOString(),
  browserVersion: navigator.userAgent,
  platform: navigator.platform,
  language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

const initialNotificationConfig: NotificationConfig = {
  enabled: true,
  maxPerDay: 3,
  cooldownHours: 4,
  respectDoNotDisturb: true,
  channels: ['in-app']
};

const initialState = {
  featureFlags: {},
  lastFetchTime: null,
  lastUpdateTime: null,
  isLoading: false,
  error: null,
  userProperties: initialUserProperties,
  userSegment: 'new',
  notificationConfig: initialNotificationConfig,
  shownNotifications: [],
  notificationHistory: []
};

// Helper function to hash user properties for consistent targeting
function hashUserProperties(properties: UserProperties): number {
  const userString = JSON.stringify({
    version: properties.extensionVersion,
    install: properties.installDate.split('T')[0], // Just date part
    segment: properties.userSegment,
    platform: properties.platform,
    language: properties.language
  });
  
  let hash = 0;
  for (let i = 0; i < userString.length; i++) {
    const char = userString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export const useConfigStore = create<ConfigState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        updateFeatureFlags: (flags: Record<string, FeatureFlag>) => {
          set(state => ({
            featureFlags: { ...state.featureFlags, ...flags },
            lastUpdateTime: Date.now()
          }));
        },
        
        setUserProperties: (properties: Partial<UserProperties>) => {
          set(state => {
            const newProperties = { ...state.userProperties, ...properties };
            // Determine user segment based on properties
            let segment = 'new';
            if (newProperties.usageDays > 30) segment = 'power';
            else if (newProperties.usageDays > 7) segment = 'regular';
            else if (newProperties.sessionCount > 5) segment = 'engaged';
            
            return {
              userProperties: newProperties,
              userSegment: segment
            };
          });
        },
        
        setUserSegment: (segment: string) => {
          set({ userSegment: segment });
        },
        
        updateNotificationConfig: (config: Partial<NotificationConfig>) => {
          set(state => ({
            notificationConfig: { ...state.notificationConfig, ...config }
          }));
        },
        
        markNotificationShown: (notificationId: string) => {
          set(state => ({
            shownNotifications: [...state.shownNotifications, notificationId]
          }));
        },
        
        addNotificationToHistory: (notificationId: string, action?: string) => {
          set(state => ({
            notificationHistory: [
              ...state.notificationHistory,
              { id: notificationId, shownAt: Date.now(), action }
            ].slice(-100) // Keep only last 100 entries
          }));
        },
        
        isFeatureEnabled: (featureName: string): boolean => {
          const state = get();
          const feature = state.featureFlags[featureName];
          
          if (!feature) return false;
          if (!feature.enabled) return false;
          
          // Check rollout percentage
          if (feature.rollout < 100) {
            const userHash = hashUserProperties(state.userProperties);
            const rolloutThreshold = (feature.rollout / 100) * 100;
            if ((userHash % 100) >= rolloutThreshold) return false;
          }
          
          // Check targeting criteria
          if (feature.targeting) {
            const { userProperties, userSegment } = state;
            
            // Version targeting
            if (feature.targeting.versions && feature.targeting.versions.length > 0) {
              const currentVersion = userProperties.extensionVersion;
              const versionMatch = feature.targeting.versions.some(targetVersion => 
                currentVersion.startsWith(targetVersion)
              );
              if (!versionMatch) return false;
            }
            
            // User segment targeting
            if (feature.targeting.userSegments && feature.targeting.userSegments.length > 0) {
              if (!feature.targeting.userSegments.includes(userSegment)) return false;
            }
          }
          
          return true;
        },
        
        getFeatureConfig: (featureName: string): FeatureFlag | undefined => {
          return get().featureFlags[featureName];
        },
        
        setLoading: (loading: boolean) => {
          set({ isLoading: loading });
        },
        
        setError: (error: string | null) => {
          set({ error });
        },
        
        updateLastFetchTime: (timestamp: number) => {
          set({ lastFetchTime: timestamp });
        },
        
        canShowNotification: (notification: RemoteNotification): boolean => {
          const state = get();
          const { notificationConfig, shownNotifications, notificationHistory } = state;
          
          // Check if notifications are globally enabled
          if (!notificationConfig.enabled) return false;
          
          // Check if notification was already shown
          if (shownNotifications.includes(notification.id)) return false;
          
          // Check expiration
          if (notification.expiresAt && new Date(notification.expiresAt) < new Date()) {
            return false;
          }
          
          // Check daily limit
          const today = new Date().toDateString();
          const todayNotifications = notificationHistory.filter(n => 
            new Date(n.shownAt).toDateString() === today
          ).length;
          
          if (todayNotifications >= notificationConfig.maxPerDay) return false;
          
          // Check cooldown period
          const lastNotificationTime = Math.max(...notificationHistory.map(n => n.shownAt), 0);
          const cooldownMs = notificationConfig.cooldownHours * 60 * 60 * 1000;
          if (Date.now() - lastNotificationTime < cooldownMs) return false;
          
          // Check targeting
          if (notification.targeting) {
            const { userProperties, userSegment } = state;
            
            // Version targeting
            if (notification.targeting.versions && notification.targeting.versions.length > 0) {
              const versionMatch = notification.targeting.versions.some(targetVersion => 
                userProperties.extensionVersion.startsWith(targetVersion)
              );
              if (!versionMatch) return false;
            }
            
            // User segment targeting
            if (notification.targeting.userSegments && notification.targeting.userSegments.length > 0) {
              if (!notification.targeting.userSegments.includes(userSegment)) return false;
            }
            
            // Install date range targeting
            if (notification.targeting.installDateRange) {
              const installDate = new Date(userProperties.installDate);
              const { start, end } = notification.targeting.installDateRange;
              
              if (start && installDate < new Date(start)) return false;
              if (end && installDate > new Date(end)) return false;
            }
          }
          
          return true;
        },
        
        resetState: () => {
          set(initialState);
        }
      }),
      {
        name: 'config-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          featureFlags: state.featureFlags,
          userProperties: state.userProperties,
          userSegment: state.userSegment,
          notificationConfig: state.notificationConfig,
          shownNotifications: state.shownNotifications,
          notificationHistory: state.notificationHistory,
          lastFetchTime: state.lastFetchTime
        })
      }
    ),
    { name: 'ConfigStore' }
  )
);
