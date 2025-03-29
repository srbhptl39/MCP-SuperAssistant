import { logMessage } from './helpers';

// Types
export interface SidebarPreferences {
  isPushMode: boolean;
  sidebarWidth: number;
  isCollapsed: boolean;
  autoSubmit: boolean;
  theme: 'light' | 'dark' | 'system';
}

const STORAGE_KEY = 'mcp_sidebar_preferences';

// Default preferences
const DEFAULT_PREFERENCES: SidebarPreferences = {
  isPushMode: false,
  sidebarWidth: 320,
  isCollapsed: false,
  autoSubmit: false,
  theme: 'system',
};

/**
 * Get sidebar preferences from chrome.storage.local
 */
export const getSidebarPreferences = async (): Promise<SidebarPreferences> => {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      logMessage('[Storage] Chrome storage API not available');
      return DEFAULT_PREFERENCES;
    }

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const preferences = result && typeof result === 'object' ? (result[STORAGE_KEY] as SidebarPreferences) : undefined;

    if (!preferences) {
      logMessage('[Storage] No stored sidebar preferences found, using defaults');
      return DEFAULT_PREFERENCES;
    }

    logMessage('[Storage] Retrieved sidebar preferences from storage');
    return {
      ...DEFAULT_PREFERENCES,
      ...(preferences || {}),
    };
  } catch (error) {
    logMessage(
      `[Storage] Error retrieving sidebar preferences: ${error instanceof Error ? error.message : String(error)}`,
    );
    return DEFAULT_PREFERENCES;
  }
};

/**
 * Save sidebar preferences to chrome.storage.local
 */
export const saveSidebarPreferences = async (preferences: Partial<SidebarPreferences>): Promise<void> => {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      logMessage('[Storage] Chrome storage API not available');
      return;
    }

    // Get current preferences first to merge with new ones
    const currentPrefs = await getSidebarPreferences();
    const updatedPrefs = {
      ...currentPrefs,
      ...preferences,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: updatedPrefs });
    logMessage(`[Storage] Saved sidebar preferences: ${JSON.stringify(updatedPrefs)}`);
  } catch (error) {
    logMessage(`[Storage] Error saving sidebar preferences: ${error instanceof Error ? error.message : String(error)}`);
  }
};
