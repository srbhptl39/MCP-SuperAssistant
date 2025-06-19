import { logMessage } from './helpers';

// Types
export interface SidebarPreferences {
  isPushMode: boolean;
  sidebarWidth: number;
  isMinimized: boolean;
  autoSubmit: boolean;
  theme: 'light' | 'dark' | 'system';
  customInstructions: string;
  customInstructionsEnabled: boolean;
}

// Tool Permissions
export interface ToolPermission {
  serverName: string;
  toolName: string;
  permission: 'always' | 'once' | 'never';
  url: string;
  timestamp: number;
}

const STORAGE_KEY = 'mcp_sidebar_preferences';
const TOOL_PERMISSIONS_KEY = 'mcp_tool_permissions';
const TOOL_ENABLEMENT_KEY = 'mcp_tool_enablement';

// Default preferences
const DEFAULT_PREFERENCES: SidebarPreferences = {
  isPushMode: false,
  sidebarWidth: 320,
  isMinimized: false,
  autoSubmit: false,
  theme: 'system',
  customInstructions: '',
  customInstructionsEnabled: false,
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

/**
 * Get tool permissions from localStorage
 */
export const getToolPermissions = (): ToolPermission[] => {
  try {
    const storedData = localStorage.getItem(TOOL_PERMISSIONS_KEY);
    if (!storedData) {
      return [];
    }
    return JSON.parse(storedData) as ToolPermission[];
  } catch (error) {
    logMessage(
      `[Storage] Error retrieving tool permissions: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Save a tool permission to localStorage
 * Only 'always' permissions are stored, 'once' and 'never' are not stored
 */
export const saveToolPermission = (permission: ToolPermission): void => {
  // Skip saving if permission is 'once' or 'never'
  if (permission.permission === 'once' || permission.permission === 'never') {
    logMessage(
      `[Storage] Skipping save for ${permission.permission} permission for ${permission.serverName}.${permission.toolName} on ${permission.url}`,
    );
    return;
  }

  try {
    const currentPermissions = getToolPermissions();

    // Remove any existing permission for this tool and URL
    const filteredPermissions = currentPermissions.filter(
      p => !(p.serverName === permission.serverName && p.toolName === permission.toolName && p.url === permission.url),
    );

    // Only add the new permission if it's 'always'
    if (permission.permission === 'always') {
      filteredPermissions.push(permission);
      logMessage(
        `[Storage] Saved 'always' permission for ${permission.serverName}.${permission.toolName} on URL: ${permission.url}`,
      );
    }

    localStorage.setItem(TOOL_PERMISSIONS_KEY, JSON.stringify(filteredPermissions));
  } catch (error) {
    logMessage(`[Storage] Error saving tool permission: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Check if a tool has permission to be auto-executed
 * @returns 'always' or null if no permission found
 * Note: 'once' and 'never' permissions are not stored
 */
export const checkToolPermission = (serverName: string, toolName: string): 'always' | null => {
  try {
    const permissions = getToolPermissions();
    const currentUrl = window.location.href;

    // Find permission for this tool and exact URL
    const permission = permissions.find(
      p => p.serverName === serverName && p.toolName === toolName && p.url === currentUrl,
    );

    if (!permission) {
      return null;
    }

    // Only 'always' permissions are stored, so we only return 'always'
    return permission.permission === 'always' ? 'always' : null;
  } catch (error) {
    logMessage(`[Storage] Error checking tool permission: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

/**
 * Clear a specific tool permission
 */
export const clearToolPermission = (serverName: string, toolName: string, url: string): void => {
  try {
    const permissions = getToolPermissions();
    const updatedPermissions = permissions.filter(
      p => !(p.serverName === serverName && p.toolName === toolName && p.url === url),
    );
    localStorage.setItem(TOOL_PERMISSIONS_KEY, JSON.stringify(updatedPermissions));
    logMessage(`[Storage] Cleared permission for ${serverName}.${toolName} on URL: ${url}`);
  } catch (error) {
    logMessage(`[Storage] Error clearing tool permission: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Get tool enablement state from chrome.storage.local
 * Returns a Set of enabled tool names
 */
export const getToolEnablementState = async (): Promise<Set<string>> => {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      logMessage('[Storage] Chrome storage API not available');
      return new Set();
    }

    const result = await chrome.storage.local.get(TOOL_ENABLEMENT_KEY);
    const enabledToolsArray = result && typeof result === 'object' ? (result[TOOL_ENABLEMENT_KEY] as string[]) : undefined;

    if (!enabledToolsArray || !Array.isArray(enabledToolsArray)) {
      logMessage('[Storage] No stored tool enablement state found, returning empty set');
      return new Set();
    }

    logMessage(`[Storage] Retrieved tool enablement state: ${enabledToolsArray.length} enabled tools`);
    return new Set(enabledToolsArray);
  } catch (error) {
    logMessage(
      `[Storage] Error retrieving tool enablement state: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Set();
  }
};

/**
 * Save tool enablement state to chrome.storage.local
 * Takes a Set of enabled tool names and persists it
 */
export const saveToolEnablementState = async (enabledTools: Set<string>): Promise<void> => {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      logMessage('[Storage] Chrome storage API not available');
      return;
    }

    const enabledToolsArray = Array.from(enabledTools);
    await chrome.storage.local.set({ [TOOL_ENABLEMENT_KEY]: enabledToolsArray });
    logMessage(`[Storage] Saved tool enablement state: ${enabledToolsArray.length} enabled tools`);
  } catch (error) {
    logMessage(`[Storage] Error saving tool enablement state: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Clear all tool enablement state from storage
 */
export const clearToolEnablementState = async (): Promise<void> => {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      logMessage('[Storage] Chrome storage API not available');
      return;
    }

    await chrome.storage.local.remove(TOOL_ENABLEMENT_KEY);
    logMessage('[Storage] Cleared tool enablement state from storage');
  } catch (error) {
    logMessage(`[Storage] Error clearing tool enablement state: ${error instanceof Error ? error.message : String(error)}`);
  }
};
