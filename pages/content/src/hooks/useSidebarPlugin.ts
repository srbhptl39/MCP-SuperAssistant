import { useEffect, useState, useCallback } from 'react';
import { useEventListener } from './useEventBus';
import { useSidebarState } from './useStores';
import { pluginRegistry } from '../plugins/plugin-registry';
import type { SidebarPlugin } from '../plugins/sidebar.plugin';
import type { EventMap } from '../events/event-types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Hook for interacting with the sidebar plugin
 */

const logger = createLogger('useSidebarPlugin');

export const useSidebarPlugin = () => {
  const [sidebarPlugin, setSidebarPlugin] = useState<SidebarPlugin | null>(null);
  const [isPluginActive, setIsPluginActive] = useState(false);
  const [pluginStatus, setPluginStatus] = useState<'pending' | 'active' | 'inactive' | 'error' | 'initializing' | 'disabled'>('pending');

  const { isVisible, toggleSidebar: toggleSidebarStore } = useSidebarState();

  // Get sidebar plugin instance
  useEffect(() => {
    const plugin = pluginRegistry.getPluginByName('sidebar-plugin') as SidebarPlugin | null;
    setSidebarPlugin(plugin);
    
    if (plugin) {
      setPluginStatus(plugin.getStatus());
      setIsPluginActive(plugin.getStatus() === 'active');
    }
  }, []);

  // Listen for plugin activation/deactivation events
  useEventListener('plugin:activated', (data: EventMap['plugin:activated']) => {
    if (data.pluginName === 'sidebar-plugin') {
      setIsPluginActive(true);
      setPluginStatus('active');
    }
  });

  useEventListener('plugin:deactivated', (data: EventMap['plugin:deactivated']) => {
    if (data.pluginName === 'sidebar-plugin') {
      setIsPluginActive(false);
      setPluginStatus('inactive');
    }
  });

  // Show sidebar through plugin
  const showSidebar = useCallback(async () => {
    if (sidebarPlugin && isPluginActive) {
      await sidebarPlugin.showSidebar();
    } else {
      // Fallback to store method
      toggleSidebarStore();
    }
  }, [sidebarPlugin, isPluginActive, toggleSidebarStore]);

  // Hide sidebar through plugin
  const hideSidebar = useCallback(() => {
    if (sidebarPlugin && isPluginActive) {
      sidebarPlugin.hideSidebar();
    } else {
      // Fallback to store method
      if (isVisible) {
        toggleSidebarStore();
      }
    }
  }, [sidebarPlugin, isPluginActive, isVisible, toggleSidebarStore]);

  // Toggle sidebar through plugin
  const toggleSidebar = useCallback(() => {
    if (sidebarPlugin && isPluginActive) {
      sidebarPlugin.toggleSidebar();
    } else {
      // Fallback to store method
      toggleSidebarStore();
    }
  }, [sidebarPlugin, isPluginActive, toggleSidebarStore]);

  // Get sidebar manager instance
  const getSidebarManager = useCallback(() => {
    return sidebarPlugin?.getSidebarManager() || null;
  }, [sidebarPlugin]);

  // Activate sidebar plugin
  const activatePlugin = useCallback(async () => {
    if (sidebarPlugin && !isPluginActive) {
      try {
        await pluginRegistry.activatePlugin('sidebar-plugin');
      } catch (error) {
        logger.error('[useSidebarPlugin] Failed to activate sidebar plugin:', error);
      }
    }
  }, [sidebarPlugin, isPluginActive]);

  // Deactivate sidebar plugin
  const deactivatePlugin = useCallback(async () => {
    if (sidebarPlugin && isPluginActive) {
      try {
        await pluginRegistry.deactivateCurrentPlugin();
      } catch (error) {
        logger.error('[useSidebarPlugin] Failed to deactivate sidebar plugin:', error);
      }
    }
  }, [sidebarPlugin, isPluginActive]);

  return {
    // Plugin state
    sidebarPlugin,
    isPluginActive,
    pluginStatus,
    
    // Sidebar state from store
    isVisible,
    
    // Actions
    showSidebar,
    hideSidebar,
    toggleSidebar,
    getSidebarManager,
    
    // Plugin management
    activatePlugin,
    deactivatePlugin,
    
    // Utilities
    isPluginAvailable: !!sidebarPlugin,
    isReady: isPluginActive && !!sidebarPlugin
  };
};

/**
 * Hook for sidebar plugin status monitoring
 */
export const useSidebarPluginStatus = () => {
  const [status, setStatus] = useState<{
    isRegistered: boolean;
    isActive: boolean;
    pluginStatus: string;
    error: string | null;
  }>({
    isRegistered: false,
    isActive: false,
    pluginStatus: 'pending',
    error: null
  });

  // Check initial status function
  const updateStatus = useCallback(() => {
    const plugin = pluginRegistry.getPluginByName('sidebar-plugin') as SidebarPlugin | null;
    const isRegistered = pluginRegistry.isPluginRegistered('sidebar-plugin');

    setStatus({
      isRegistered,
      isActive: plugin?.getStatus() === 'active',
      pluginStatus: plugin?.getStatus() || 'not-found',
      error: null
    });
  }, []);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  // Listen for plugin events
  useEventListener('plugin:registered', (data: EventMap['plugin:registered']) => {
    if (data.name === 'sidebar-plugin') {
      updateStatus();
    }
  });

  useEventListener('plugin:activated', (data: EventMap['plugin:activated']) => {
    if (data.pluginName === 'sidebar-plugin') {
      updateStatus();
    }
  });

  useEventListener('plugin:deactivated', (data: EventMap['plugin:deactivated']) => {
    if (data.pluginName === 'sidebar-plugin') {
      updateStatus();
    }
  });

  useEventListener('plugin:activation-failed', (data: EventMap['plugin:activation-failed']) => {
    if (data.name === 'sidebar-plugin') {
      setStatus(prev => ({
        ...prev,
        error: typeof data.error === 'string' ? data.error : data.error.message
      }));
    }
  });

  return status;
};

/**
 * Hook for sidebar plugin management (admin/debug purposes)
 */
export const useSidebarPluginManagement = () => {
  const { sidebarPlugin, isPluginActive } = useSidebarPlugin();

  const registerPlugin = useCallback(async () => {
    try {
      const { SidebarPlugin } = await import('../plugins/sidebar.plugin');
      const plugin = new SidebarPlugin();
      await pluginRegistry.register(plugin, {
        id: 'sidebar-plugin',
        name: 'Sidebar Plugin',
        description: 'Universal sidebar management plugin',
        version: '1.0.0',
        enabled: true,
        priority: 1, // High priority for core functionality
      });
    } catch (error) {
      logger.error('[useSidebarPluginManagement] Failed to register sidebar plugin:', error);
      throw error;
    }
  }, []);

  const unregisterPlugin = useCallback(async () => {
    try {
      await pluginRegistry.unregister('sidebar-plugin');
    } catch (error) {
      logger.error('[useSidebarPluginManagement] Failed to unregister sidebar plugin:', error);
      throw error;
    }
  }, []);

  const getPluginInfo = useCallback(() => {
    if (!sidebarPlugin) return null;

    return {
      name: sidebarPlugin.name,
      version: sidebarPlugin.version,
      status: sidebarPlugin.getStatus(),
      isSupported: sidebarPlugin.isSupported(),
      sidebarManager: sidebarPlugin.getSidebarManager(),
      isActive: isPluginActive
    };
  }, [sidebarPlugin, isPluginActive]);

  return {
    registerPlugin,
    unregisterPlugin,
    getPluginInfo,
    isRegistered: pluginRegistry.isPluginRegistered('sidebar-plugin')
  };
};
