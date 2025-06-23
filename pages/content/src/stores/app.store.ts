import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { eventBus, initializeEventBus } from '../events'; // Assuming initializeEventBus might be called here or in a main initializer
import type { GlobalSettings } from '../types/stores';
// Placeholder for initializePluginRegistry - will be properly imported when plugin system is built
const initializePluginRegistry = async () => console.debug('Plugin registry initialized (placeholder)');

export interface AppState {
  isInitialized: boolean;
  initializationError: string | null;
  currentSite: string;
  currentHost: string; // Added to distinguish full site from just hostname
  globalSettings: GlobalSettings;
  
  // Actions
  initialize: () => Promise<void>;
  setCurrentSite: (siteInfo: { site: string; host: string }) => void;
  updateSettings: (settings: Partial<GlobalSettings>) => void;
  resetState: () => void; // Renamed from 'reset' for clarity
}

const initialState = {
  isInitialized: false,
  initializationError: null,
  currentSite: window.location.href, // Capture full URL
  currentHost: window.location.hostname,
  globalSettings: {
    theme: 'system' as GlobalSettings['theme'],
    autoSubmit: false,
    debugMode: false,
    sidebarWidth: 320,
    isPushMode: false,
    language: navigator.language || 'en-US',
    notifications: true,
  },
};

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        initialize: async () => {
          if (get().isInitialized) {
            console.debug('[AppStore] Already initialized.');
            return;
          }
          
          console.debug('[AppStore] Initializing...');
          try {
            set({ initializationError: null });
            
            // Initialize critical systems in order
            // Event bus initialization might be called earlier in a global initializer.ts
            // await initializeEventBus(); // Ensure eventBus is ready
            await initializePluginRegistry(); // Placeholder for actual plugin system init
            
            set({ isInitialized: true, initializationError: null });
            console.debug('[AppStore] Initialization complete.');
            eventBus.emit('app:initialized', { version: '0.1.0', timestamp: Date.now() }); // Example version
            
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
            console.error('[AppStore] Initialization failed:', errorMessage, error);
            set({ isInitialized: false, initializationError: errorMessage });
            // Optionally, re-throw or handle critical failure
          }
        },
        
        setCurrentSite: (siteInfo: { site: string; host: string }) => {
          set({
            currentSite: siteInfo.site,
            currentHost: siteInfo.host,
          });
          console.debug(`[AppStore] Site changed to: ${siteInfo.site}`);
          eventBus.emit('app:site-changed', { site: siteInfo.site, hostname: siteInfo.host });
        },
        
        updateSettings: (settings: Partial<GlobalSettings>) => {
          set(state => ({
            globalSettings: { ...state.globalSettings, ...settings }
          }));
          console.debug('[AppStore] Settings updated:', settings);
          eventBus.emit('app:settings-updated', { settings });
        },
        
        resetState: () => {
          console.debug('[AppStore] Resetting state.');
          set(initialState); 
        },
      }),
      {
        name: 'mcp-super-assistant-app-store', // Unique name for localStorage
        storage: createJSONStorage(() => localStorage), // Specify localStorage
        partialize: (state) => ({
          // Only persist globalSettings and sidebarWidth from uiStore (example)
          globalSettings: state.globalSettings,
          // Potentially add other things to persist like currentSite if needed across sessions
        }),
      }
    ),
    { name: 'AppStore', store: 'app' } // For Redux DevTools extension
  )
);

// Initialize the store automatically on load or ensure it's called from a central initializer.
// For content scripts, direct initialization might be fine.
// useAppStore.getState().initialize(); // Consider if auto-init is desired or should be triggered by an initializer module.

// Listen to chrome.runtime.onMessage for site changes from background or popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NAVIGATION_COMPLETED' && message.url) {
      const newUrl = new URL(message.url);
      const currentHost = useAppStore.getState().currentHost;
      if (newUrl.hostname !== currentHost) {
        useAppStore.getState().setCurrentSite({ site: message.url, host: newUrl.hostname });
      }
    }
    // Keep the channel open for asynchronous sendResponse, if needed by other listeners.
    // For this specific case, it's not strictly necessary to return true unless other parts of the listener use sendResponse.
    return false; 
  });
}
