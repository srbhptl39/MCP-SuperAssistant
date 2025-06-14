/**
 * Migration Bridge Utility
 * 
 * This utility helps bridge the gap between the old adapter system and the new plugin architecture.
 * It provides compatibility functions and migration helpers.
 */

import type { AdapterPlugin, PluginContext } from '../plugins/plugin-types';
import type { SimpleSiteAdapter, MCPToggleState } from '../adapters/adaptercomponents/common';
import type { UserPreferences } from '../types/stores';
import { eventBus } from '../events';

/**
 * Legacy adapter compatibility wrapper
 * Wraps the new plugin system to work with legacy code
 */
export class LegacyAdapterBridge {
  private plugin: AdapterPlugin | null = null;

  constructor(plugin: AdapterPlugin, _context: PluginContext) {
    this.plugin = plugin;
    // Context not currently used but kept for future extensibility
  }

  /**
   * Convert new plugin to legacy SimpleSiteAdapter interface
   */
  toLegacyAdapter(): SimpleSiteAdapter {
    if (!this.plugin) {
      throw new Error('No plugin available for legacy conversion');
    }

    return {
      name: this.plugin.name,
      insertTextIntoInput: async (text: string) => {
        if (this.plugin?.insertText) {
          await this.plugin.insertText(text);
        }
      },
      triggerSubmission: async () => {
        if (this.plugin?.submitForm) {
          await this.plugin.submitForm();
        }
      },
      toggleSidebar: () => {
        // Toggle sidebar through direct plugin call to avoid circular events
        import('../plugins/plugin-registry').then(({ pluginRegistry }) => {
          const sidebarPlugin = pluginRegistry.getPluginByName('sidebar-plugin') as any;
          if (sidebarPlugin && sidebarPlugin.getStatus() === 'active') {
            sidebarPlugin.toggleSidebar();
          }
        }).catch(error => {
          console.warn('[MigrationBridge] Failed to import plugin registry:', error);
        });
      },
      showSidebarWithToolOutputs: () => {
        // Show sidebar through direct plugin call to avoid circular events
        import('../plugins/plugin-registry').then(({ pluginRegistry }) => {
          const sidebarPlugin = pluginRegistry.getPluginByName('sidebar-plugin') as any;
          if (sidebarPlugin) {
            if (sidebarPlugin.getStatus() === 'active') {
              // Plugin is active, show sidebar directly
              sidebarPlugin.showSidebar().catch((error: any) => {
                console.warn('[MigrationBridge] Failed to show sidebar:', error);
              });
            } else {
              // Plugin not active, activate it first
              pluginRegistry.activatePlugin('sidebar-plugin').catch((error: any) => {
                console.warn('[MigrationBridge] Failed to activate sidebar plugin:', error);
              });
            }
          } else {
            console.warn('[MigrationBridge] Sidebar plugin not found');
          }
        }).catch(error => {
          console.warn('[MigrationBridge] Failed to import plugin registry:', error);
        });
      },
      hideSidebar: () => {
        // Hide sidebar through direct plugin call to avoid circular events
        import('../plugins/plugin-registry').then(({ pluginRegistry }) => {
          const sidebarPlugin = pluginRegistry.getPluginByName('sidebar-plugin') as any;
          if (sidebarPlugin && sidebarPlugin.getStatus() === 'active') {
            sidebarPlugin.hideSidebar();
          }
        }).catch(error => {
          console.warn('[MigrationBridge] Failed to import plugin registry:', error);
        });
      },
      supportsFileUpload: () => {
        return this.plugin?.capabilities.includes('file-attachment') || false;
      },
      attachFile: async (file: File) => {
        if (this.plugin?.attachFile) {
          await this.plugin.attachFile(file);
        }
      }
    };
  }
}

/**
 * Migration helper for converting legacy toggle state to new architecture
 */
export class ToggleStateMigration {
  /**
   * Convert legacy MCPToggleState to new store actions
   */
  static migrateToggleState(legacyState: MCPToggleState): void {
    // Emit events to update new stores based on legacy state
    if (legacyState.mcpEnabled) {
      eventBus.emit('adapter:activated', {
        pluginName: 'legacy-adapter',
        timestamp: Date.now()
      });
    }

    // Update UI preferences through events with complete UserPreferences object
    const currentPreferences: UserPreferences = {
      autoSubmit: legacyState.autoSubmit,
      notifications: true, // Default value
      theme: 'system', // Default value
      language: navigator.language || 'en-US',
      isPushMode: false, // Default value
      sidebarWidth: 320, // Default value
      isMinimized: false, // Default value
      customInstructions: '', // Default value
      customInstructionsEnabled: false // Default value
    };

    eventBus.emit('ui:preferences-updated', {
      preferences: currentPreferences
    });
  }

  /**
   * Get default user preferences
   */
  private static getDefaultPreferences(): UserPreferences {
    return {
      autoSubmit: false,
      notifications: true,
      theme: 'system',
      language: navigator.language || 'en-US',
      isPushMode: false,
      sidebarWidth: 320,
      isMinimized: false,
      customInstructions: '',
      customInstructionsEnabled: false
    };
  }

  /**
   * Create a bridge for legacy toggle state manager
   */
  static createLegacyStateManager(context: PluginContext) {
    return {
      getState: () => {
        // Get state from new stores
        const uiState = context.stores.ui;
        const adapterState = context.stores.adapter;

        return {
          mcpEnabled: !!adapterState?.activeAdapterName,
          autoInsert: uiState?.preferences?.autoSubmit || false,
          autoSubmit: uiState?.preferences?.autoSubmit || false,
          autoExecute: false // Default for now
        };
      },
      setMCPEnabled: (enabled: boolean) => {
        if (enabled) {
          eventBus.emit('adapter:activated', {
            pluginName: 'legacy-bridge',
            timestamp: Date.now()
          });
        } else {
          eventBus.emit('adapter:deactivated', {
            pluginName: 'legacy-bridge',
            timestamp: Date.now()
          });
        }
      },
      setAutoInsert: (enabled: boolean) => {
        const preferences = { ...this.getDefaultPreferences(), autoSubmit: enabled };
        eventBus.emit('ui:preferences-updated', { preferences });
      },
      setAutoSubmit: (enabled: boolean) => {
        const preferences = { ...this.getDefaultPreferences(), autoSubmit: enabled };
        eventBus.emit('ui:preferences-updated', { preferences });
      },
      setAutoExecute: (enabled: boolean) => {
        // Handle auto execute preference
        context.logger.debug('Auto execute preference updated:', enabled);
      },
      updateUI: () => {
        // Trigger UI update through event system
        const preferences = this.getDefaultPreferences();
        eventBus.emit('ui:preferences-updated', { preferences });
      }
    };
  }
}

/**
 * Utility to check if new architecture is available
 */
export function isNewArchitectureAvailable(): boolean {
  try {
    // Check if new stores and event system are available
    return !!(eventBus && typeof eventBus.emit === 'function');
  } catch {
    return false;
  }
}

/**
 * Migration status tracker
 */
export class MigrationTracker {
  private static migrationStatus = new Map<string, boolean>();

  static markAdapterMigrated(adapterName: string): void {
    this.migrationStatus.set(adapterName, true);
    console.log(`[Migration] Adapter ${adapterName} marked as migrated`);
  }

  static isAdapterMigrated(adapterName: string): boolean {
    return this.migrationStatus.get(adapterName) || false;
  }

  static getMigrationStatus(): Record<string, boolean> {
    return Object.fromEntries(this.migrationStatus);
  }
}

/**
 * Helper to gradually migrate from old to new system
 */
export function createHybridAdapter(
  legacyAdapter: SimpleSiteAdapter,
  newPlugin?: AdapterPlugin,
  context?: PluginContext
): SimpleSiteAdapter {
  // If new plugin is available and context is provided, prefer new system
  if (newPlugin && context && isNewArchitectureAvailable()) {
    const bridge = new LegacyAdapterBridge(newPlugin, context);
    MigrationTracker.markAdapterMigrated(newPlugin.name);
    return bridge.toLegacyAdapter();
  }

  // Fall back to legacy adapter
  console.log('[Migration] Using legacy adapter implementation');
  return legacyAdapter;
}
