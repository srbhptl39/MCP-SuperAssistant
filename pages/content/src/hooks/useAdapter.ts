// hooks/useAdapter.ts
import { useCallback, useEffect, useState } from 'react';
import { useActiveAdapter, useRegisteredAdapters } from './useStores';
import { useEventListener, useEventEmitter } from './useEventBus';
import type { AdapterPlugin, AdapterCapability } from '../plugins/plugin-types';
import { createLogger } from '@extension/shared/lib/logger';

// Hook for current adapter operations

const logger = createLogger('UseAdapter');

export function useCurrentAdapter() {
  const { activeAdapterName, plugin, status, currentCapabilities, error } = useActiveAdapter();
  const emit = useEventEmitter();

  const insertText = useCallback(async (text: string): Promise<boolean> => {
    if (!plugin || !plugin.insertText) {
      logger.warn('[useCurrentAdapter] No active plugin for insertText');
      return false;
    }

    try {
      emit('tool:execution-started', { toolName: 'insertText', callId: `adapter-${Date.now()}` });
      const result = await plugin.insertText(text);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emit('tool:execution-failed', { toolName: 'insertText', error: errorMessage, callId: `adapter-${Date.now()}` });
      return false;
    }
  }, [plugin, emit]);

  const submitForm = useCallback(async (): Promise<boolean> => {
    if (!plugin || !plugin.submitForm) {
      logger.warn('[useCurrentAdapter] No active plugin for submitForm');
      return false;
    }

    try {
      emit('tool:execution-started', { toolName: 'submitForm', callId: `adapter-${Date.now()}` });
      const result = await plugin.submitForm();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emit('tool:execution-failed', { toolName: 'submitForm', error: errorMessage, callId: `adapter-${Date.now()}` });
      return false;
    }
  }, [plugin, emit]);

  const attachFile = useCallback(async (file: File): Promise<boolean> => {
    if (!plugin) {
      logger.warn('[useCurrentAdapter] No active plugin for attachFile');
      return false;
    }

    if (!plugin.capabilities.includes('file-attachment')) {
      logger.warn('[useCurrentAdapter] Active plugin does not support file attachment');
      return false;
    }

    try {
      emit('tool:execution-started', { toolName: 'attachFile', callId: `adapter-${Date.now()}` });
      const result = await plugin.attachFile!(file);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emit('tool:execution-failed', { toolName: 'attachFile', error: errorMessage, callId: `adapter-${Date.now()}` });
      return false;
    }
  }, [plugin, emit]);

  const hasCapability = useCallback((capability: AdapterCapability): boolean => {
    return currentCapabilities.includes(capability);
  }, [currentCapabilities]);

  return {
    activeAdapterName,
    plugin,
    status,
    error,
    capabilities: currentCapabilities,
    insertText,
    submitForm,
    attachFile,
    hasCapability,
    isReady: !!plugin && status === 'active' && !error
  };
}

// Hook for adapter management
export function useAdapterManagement() {
  const { adapters, registerPlugin, unregisterPlugin } = useRegisteredAdapters();
  const emit = useEventEmitter();

  const activateAdapter = useCallback(async (adapterName: string): Promise<boolean> => {
    try {
      emit('plugin:activation-requested', { pluginName: adapterName, timestamp: Date.now() });
      // The plugin registry will handle the actual activation
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[useAdapterManagement] Failed to activate adapter:', errorMessage);
      return false;
    }
  }, [emit]);

  const deactivateCurrentAdapter = useCallback(async (): Promise<boolean> => {
    try {
      // Get current active adapter name first
      const { activeAdapterName } = useActiveAdapter();
      if (activeAdapterName) {
        emit('plugin:deactivation-requested', { pluginName: activeAdapterName, timestamp: Date.now() });
        return true;
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[useAdapterManagement] Failed to deactivate adapter:', errorMessage);
      return false;
    }
  }, [emit]);

  const getAdapterForHostname = useCallback((hostname: string): AdapterPlugin | null => {
    return adapters.find(adapter => {
      if (Array.isArray(adapter.plugin.hostnames)) {
        return adapter.plugin.hostnames.some(pattern => {
          if (typeof pattern === 'string') {
            return pattern === '*' || hostname.includes(pattern);
          } else if (pattern instanceof RegExp) {
            return pattern.test(hostname);
          }
          return false;
        });
      }
      return false;
    })?.plugin || null;
  }, [adapters]);

  return {
    adapters,
    registerPlugin,
    unregisterPlugin,
    activateAdapter,
    deactivateCurrentAdapter,
    getAdapterForHostname
  };
}

// Hook for adapter capabilities
export function useAdapterCapabilities() {
  const { plugin } = useCurrentAdapter();
  const [availableCapabilities, setAvailableCapabilities] = useState<AdapterCapability[]>([]);

  useEffect(() => {
    if (plugin) {
      setAvailableCapabilities(plugin.capabilities);
    } else {
      setAvailableCapabilities([]);
    }
  }, [plugin]);

  const supportsTextInsertion = availableCapabilities.includes('text-insertion');
  const supportsFormSubmission = availableCapabilities.includes('form-submission');
  const supportsFileUpload = availableCapabilities.includes('file-attachment');
  const supportsUrlNavigation = availableCapabilities.includes('url-navigation');
  const supportsElementSelection = availableCapabilities.includes('element-selection');
  const supportsScreenshotCapture = availableCapabilities.includes('screenshot-capture');
  const supportsDomManipulation = availableCapabilities.includes('dom-manipulation');

  return {
    availableCapabilities,
    supportsTextInsertion,
    supportsFormSubmission,
    supportsFileUpload,
    supportsUrlNavigation,
    supportsElementSelection,
    supportsScreenshotCapture,
    supportsDomManipulation,
    hasAnyCapability: availableCapabilities.length > 0
  };
}

// Hook for adapter status monitoring
export function useAdapterStatus() {
  const [adapterEvents, setAdapterEvents] = useState<Array<{
    type: string;
    adapterName?: string;
    timestamp: number;
    data?: any;
  }>>([]);

  useEventListener('adapter:activated', (data) => {
    setAdapterEvents(prev => [...prev, {
      type: 'activated',
      adapterName: data.pluginName,
      timestamp: data.timestamp,
      data
    }]);
  });

  useEventListener('adapter:deactivated', (data) => {
    setAdapterEvents(prev => [...prev, {
      type: 'deactivated',
      adapterName: data.pluginName,
      timestamp: data.timestamp,
      data
    }]);
  });

  useEventListener('adapter:error', (data) => {
    setAdapterEvents(prev => [...prev, {
      type: 'error',
      adapterName: data.name,
      timestamp: Date.now(),
      data
    }]);
  });

  const clearEvents = useCallback(() => {
    setAdapterEvents([]);
  }, []);

  const getEventsForAdapter = useCallback((adapterName: string) => {
    return adapterEvents.filter(event => event.adapterName === adapterName);
  }, [adapterEvents]);

  return {
    adapterEvents,
    eventCount: adapterEvents.length,
    clearEvents,
    getEventsForAdapter
  };
}

// Hook for automatic adapter switching
export function useAutoAdapterSwitching(enabled = true) {
  const { getAdapterForHostname, activateAdapter } = useAdapterManagement();
  const { activeAdapterName } = useCurrentAdapter();

  useEventListener('app:site-changed', async ({ hostname }) => {
    if (!enabled) return;

    const suitableAdapter = getAdapterForHostname(hostname);
    if (suitableAdapter && suitableAdapter.name !== activeAdapterName) {
      logger.debug(`Switching to ${suitableAdapter.name} for ${hostname}`);
      await activateAdapter(suitableAdapter.name);
    }
  });

  return {
    enabled,
    activeAdapterName
  };
}
