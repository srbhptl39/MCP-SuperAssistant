// hooks/useAdapterBridge.ts
import { useCurrentAdapter } from './useAdapter';
import type { SiteAdapter } from '../utils/siteAdapter';
import { logMessage } from '@src/utils/helpers';

/**
 * Bridge hook that provides the old SiteAdapter interface using the new plugin system
 * This allows gradual migration of components from the old adapter system to the new plugin system
 */
export function useSiteAdapterBridge(): SiteAdapter {
  const { 
    activeAdapterName, 
    capabilities, 
    insertText, 
    submitForm, 
    attachFile,
    isReady 
  } = useCurrentAdapter();

  // Create a bridge object that implements the old SiteAdapter interface
  const bridgeAdapter: SiteAdapter = {
    name: activeAdapterName || 'Unknown Adapter',
    hostname: 'plugin-bridge', // This is a bridge, so no specific hostname
    
    // Lifecycle functions
    initialize: () => {
      logMessage(`[AdapterBridge] Initialize called (no-op - handled by plugin system)`);
    },
    
    cleanup: () => {
      logMessage(`[AdapterBridge] Cleanup called (no-op - handled by plugin system)`);
    },
    
    // UI functions - map to empty implementations since plugin system handles differently
    toggleSidebar: () => {
      logMessage(`[AdapterBridge] toggleSidebar called (handled elsewhere)`);
    },
    
    showSidebarWithToolOutputs: () => {
      logMessage(`[AdapterBridge] showSidebarWithToolOutputs called (handled elsewhere)`);
    },
    
    refreshSidebarContent: () => {
      logMessage(`[AdapterBridge] refreshSidebarContent called (handled elsewhere)`);
    },
    
    updateConnectionStatus: (isConnected: boolean) => {
      logMessage(`[AdapterBridge] updateConnectionStatus called: ${isConnected} (handled by plugin system)`);
    },
    
    // Tool functions that map to the new plugin system
    insertTextIntoInput: async (text: string) => {
      logMessage(`[AdapterBridge] Inserting text via plugin system: ${activeAdapterName}`);
      await insertText(text);
    },
    
    triggerSubmission: async () => {
      logMessage(`[AdapterBridge] Submitting form via plugin system: ${activeAdapterName}`);
      await submitForm();
    },
    
    supportsFileUpload: () => {
      return capabilities.includes('file-attachment');
    },
    
    attachFile: async (file: File) => {
      logMessage(`[AdapterBridge] Attaching file via plugin system: ${activeAdapterName}`);
      return await attachFile(file);
    },
  };

  return bridgeAdapter;
}

/**
 * Enhanced bridge hook that provides better compatibility
 * This version tries to maintain more of the original interface
 */
export function useCompatibleSiteAdapter(): SiteAdapter {
  try {
    return useSiteAdapterBridge();
  } catch (error) {
    // Fallback to old adapter system if new system fails
    logMessage(`[AdapterBridge] Falling back to old adapter system due to error: ${error}`);
    
    // Import the old useSiteAdapter only when needed
    const { useSiteAdapter } = require('../adapters/adapterRegistry');
    return useSiteAdapter();
  }
}
