import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { devtools } from 'zustand/middleware'; // persist is now imported with createJSONStorage
import { eventBus } from '../events';
import type { UserPreferences, SidebarState, Notification, GlobalSettings } from '../types/stores';
import { useAppStore, type AppState } from './app.store'; // Assuming AppState includes theme

export interface UIState {
  sidebar: SidebarState;
  preferences: UserPreferences;
  notifications: Notification[];
  activeModal: string | null; // e.g., 'settingsModal', 'confirmActionModal'
  isLoading: boolean; // Global UI loading state
  theme: GlobalSettings['theme']; // Centralized theme management
  mcpEnabled: boolean; // Separate MCP toggle state that persists across page refreshes

  // Actions
  toggleSidebar: (reason?: string) => void;
  toggleMinimize: (reason?: string) => void;
  resizeSidebar: (width: number) => void;
  setSidebarVisibility: (visible: boolean, reason?: string) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string; // Returns notification ID
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  openModal: (modalName: string) => void;
  closeModal: () => void;
  setGlobalLoading: (loading: boolean) => void;
  setTheme: (theme: GlobalSettings['theme']) => void;
  setMCPEnabled: (enabled: boolean, reason?: string) => void; // Action to control MCP state
}

const initialSidebarState: SidebarState = {
  isVisible: false,
  isMinimized: false,
  position: 'left',
  width: 320, // Default width from app.store, could be synced or independent
};

const initialUserPreferences: UserPreferences = {
  autoSubmit: false,
  autoInsert: false,   // New automation field
  autoExecute: false,  // New automation field
  notifications: true,
  theme: 'system', // Default theme
  language: navigator.language || 'en-US',
  isPushMode: false,
  sidebarWidth: 320,
  isMinimized: false,
  customInstructions: '',
  customInstructionsEnabled: false,
};

const initialState: Omit<UIState, 'toggleSidebar' | 'toggleMinimize' | 'resizeSidebar' | 'setSidebarVisibility' | 'updatePreferences' | 'addNotification' | 'removeNotification' | 'clearNotifications' | 'openModal' | 'closeModal' | 'setGlobalLoading' | 'setTheme' | 'setMCPEnabled'> = {
  sidebar: initialSidebarState,
  preferences: initialUserPreferences,
  notifications: [],
  activeModal: null,
  isLoading: false,
  theme: initialUserPreferences.theme,
  mcpEnabled: false, // Default to disabled - user must explicitly enable MCP
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        toggleSidebar: (reason?: string) => {
          const newVisibility = !get().sidebar.isVisible;
          set(state => ({ sidebar: { ...state.sidebar, isVisible: newVisibility } }));
          console.log(`[UIStore] Sidebar toggled to ${newVisibility ? 'visible' : 'hidden'}. Reason: ${reason || 'user action'}`);
          eventBus.emit('ui:sidebar-toggle', { visible: newVisibility, reason: reason || 'user action' });
        },

        toggleMinimize: (reason?: string) => {
          const newMinimized = !get().sidebar.isMinimized;
          set(state => ({ 
            sidebar: { ...state.sidebar, isMinimized: newMinimized },
            preferences: { ...state.preferences, isMinimized: newMinimized }
          }));
          console.log(`[UIStore] Sidebar ${newMinimized ? 'minimized' : 'expanded'}. Reason: ${reason || 'user action'}`);
          eventBus.emit('ui:sidebar-minimize', { minimized: newMinimized, reason: reason || 'user action' });
        },

        resizeSidebar: (width: number) => {
          set(state => ({ sidebar: { ...state.sidebar, width } }));
          console.log(`[UIStore] Sidebar resized to: ${width}px`);
          eventBus.emit('ui:sidebar-resize', { width });
        },

        setSidebarVisibility: (visible: boolean, reason?: string) => {
          set(state => ({ sidebar: { ...state.sidebar, isVisible: visible } }));
          console.log(`[UIStore] Sidebar visibility set to ${visible}. Reason: ${reason || 'programmatic'}`);
          eventBus.emit('ui:sidebar-toggle', { visible, reason: reason || 'programmatic' });
        },

        updatePreferences: (prefs: Partial<UserPreferences>) => {
          const oldPrefs = get().preferences;
          const newPrefs = { ...oldPrefs, ...prefs };
          set({ preferences: newPrefs });
          console.log('[UIStore] Preferences updated:', newPrefs);
          eventBus.emit('ui:preferences-updated', { preferences: newPrefs });
          // If theme is part of preferences and changes, also update the global theme
          if (prefs.theme && prefs.theme !== oldPrefs.theme) {
            get().setTheme(prefs.theme);
          }
        },

        addNotification: (notificationData: Omit<Notification, 'id' | 'timestamp'>): string => {
          const newNotification: Notification = {
            ...notificationData,
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now(),
          };
          set(state => ({ notifications: [...state.notifications, newNotification] }));
          console.log('[UIStore] Notification added:', newNotification);
          eventBus.emit('ui:notification-added', { notification: newNotification });
          return newNotification.id;
        },

        removeNotification: (id: string) => {
          set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
          console.log(`[UIStore] Notification removed: ${id}`);
          eventBus.emit('ui:notification-removed', { id });
        },

        clearNotifications: () => {
          get().notifications.forEach(n => eventBus.emit('ui:notification-removed', { id: n.id }));
          set({ notifications: [] });
          console.log('[UIStore] All notifications cleared.');
        },

        openModal: (modalName: string) => {
          set({ activeModal: modalName });
          console.log(`[UIStore] Modal opened: ${modalName}`);
        },

        closeModal: () => {
          console.log(`[UIStore] Modal closed: ${get().activeModal}`);
          set({ activeModal: null });
        },

        setGlobalLoading: (loading: boolean) => {
          set({ isLoading: loading });
          console.log(`[UIStore] Global loading state: ${loading}`);
        },

        setTheme: (theme: GlobalSettings['theme']) => {
          set({ theme });
          console.log(`[UIStore] Theme changed to: ${theme}`);
          eventBus.emit('ui:theme-changed', { theme });
          // Also update preferences if they should be kept in sync
          if (get().preferences.theme !== theme) {
             set(state => ({ preferences: { ...state.preferences, theme }}));
             eventBus.emit('ui:preferences-updated', { preferences: get().preferences });
          }
        },

        setMCPEnabled: (enabled: boolean, reason?: string) => {
          const previousState = get().mcpEnabled;
          set({ mcpEnabled: enabled });
          
          console.log(`[UIStore] MCP toggle set to ${enabled}. Reason: ${reason || 'user action'}`);
          
          // When MCP is enabled, show sidebar; when disabled, hide sidebar
          if (enabled !== previousState) {
            get().setSidebarVisibility(enabled, reason || 'mcp-toggle');
          }
          
          // Emit event for components that need to react to MCP state changes
          eventBus.emit('ui:mcp-toggle', { enabled, reason: reason || 'user action', previousState });
        },
      }),
      {
        name: 'mcp-super-assistant-ui-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // Persist sidebar state and user preferences
          sidebar: { 
            width: state.sidebar.width, 
            position: state.sidebar.position,
            isVisible: state.sidebar.isVisible,
            isMinimized: state.sidebar.isMinimized
          },
          preferences: state.preferences,
          theme: state.theme, // Persist theme
          mcpEnabled: state.mcpEnabled, // Persist MCP toggle state across page refreshes
        }),
      }
    ),
    { name: 'UIStore', store: 'ui' }
  )
);

// Sync theme from app.store's globalSettings if it changes there
// This creates a two-way sync if app.store also updates its globalSettings.theme from ui.store.preferences.theme
// Ensure this logic is robust or handled by a single source of truth for theme.
useAppStore.subscribe(
  (state: AppState, prevState: AppState) => {
    const newTheme = state.globalSettings.theme;
    const oldTheme = prevState.globalSettings.theme;
    if (newTheme && newTheme !== oldTheme) {
      // Check against current UIStore theme to prevent loops and unnecessary updates
      if (newTheme !== useUIStore.getState().theme) { 
        console.log('[UIStore] Theme changed in AppStore, syncing to UIStore:', newTheme);
        useUIStore.getState().setTheme(newTheme); // Use the existing setTheme action
        // The setTheme action itself emits 'ui:theme-changed', so no need to emit here again.
      }
    }
    if (state.globalSettings.sidebarWidth !== prevState.globalSettings.sidebarWidth) {
      if (useUIStore.getState().sidebar.width !== state.globalSettings.sidebarWidth) {
        console.log('[UIStore] Syncing sidebar width from AppStore globalSettings:', state.globalSettings.sidebarWidth);
        useUIStore.getState().resizeSidebar(state.globalSettings.sidebarWidth);
      }
    }
  }
);

// Consider calling unSubAppStore on cleanup if the content script can be unloaded/reloaded.
