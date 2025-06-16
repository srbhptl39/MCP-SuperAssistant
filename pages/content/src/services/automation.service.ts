/**
 * Automation Service for MCP SuperAssistant
 * 
 * This service handles the automation features (auto insert, auto submit, auto execute)
 * that were previously part of the legacy adapter system. It integrates with the new
 * Zustand architecture and plugin-based adapter system.
 * 
 * Features:
 * - Auto Insert: Automatically insert function execution results into the current page
 * - Auto Submit: Automatically submit forms after auto-insertion
 * - Auto Execute: Log when tool execution is completed (extensible for future features)
 * 
 * The service listens for 'mcp:tool-execution-complete' events and performs actions
 * based on the current automation state from the user preferences store.
 */

import { useUserPreferences } from '../hooks/useStores';
import { useCurrentAdapter } from '../hooks/useAdapter';
import { eventBus } from '../events/event-bus';

// Store references for accessing state outside React components
let storeRefs: {
  getUserPreferences: (() => Promise<any>) | null;
  getCurrentAdapterState: (() => Promise<any>) | null;
} = {
  getUserPreferences: null,
  getCurrentAdapterState: null,
};

// Initialize store access functions
async function initializeStoreAccess() {
  try {
    // Store the store access functions for later use
    storeRefs.getUserPreferences = async () => {
      // Import dynamically to avoid circular dependencies
      const { useUIStore } = await import('../stores/ui.store');
      return useUIStore.getState().preferences;
    };

    storeRefs.getCurrentAdapterState = async () => {
      // Import dynamically to avoid circular dependencies
      const { useAdapterStore } = await import('../stores/adapter.store');
      const adapterState = useAdapterStore.getState();
      const activeAdapterRegistration = adapterState.getActiveAdapter();
      
      const plugin = activeAdapterRegistration?.plugin;
      
      return {
        plugin,
        // Bind methods to maintain proper 'this' context
        insertText: plugin?.insertText ? plugin.insertText.bind(plugin) : null,
        attachFile: plugin?.attachFile ? plugin.attachFile.bind(plugin) : null,
        submitForm: plugin?.submitForm ? plugin.submitForm.bind(plugin) : null,
        isReady: !!plugin && 
                activeAdapterRegistration.status === 'active' && 
                !adapterState.lastAdapterError
      };
    };

    console.debug('[AutomationService] Store access functions initialized');
  } catch (error) {
    console.error('[AutomationService] Error initializing store access:', error);
  }
}

// Type definitions for automation events
export interface ToolExecutionCompleteDetail {
  result?: string;
  isFileAttachment?: boolean;
  file?: File;
  fileName?: string;
  confirmationText?: string;
  skipAutoInsertCheck?: boolean;
  callId?: string;
  functionName?: string;
}

export interface AutomationState {
  autoInsert: boolean;
  autoSubmit: boolean;
  autoExecute: boolean;
}

/**
 * Automation Service Class
 * Handles all automation logic for MCP tool execution results
 */
export class AutomationService {
  private static instance: AutomationService | null = null;
  private isInitialized = false;
  private eventListener: ((event: Event) => void) | null = null;

  // Private constructor for singleton pattern
  private constructor() {}

  /**
   * Get the singleton instance of AutomationService
   */
  public static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }

  /**
   * Initialize the automation service
   * Sets up event listeners and integrates with the store system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.debug('[AutomationService] Already initialized, skipping');
      return;
    }

    console.log('[AutomationService] Initializing automation service');

    // Initialize store access functions
    await initializeStoreAccess();

    // Set up event listener for tool execution completion
    this.setupToolExecutionListener();

    // Listen for MCP state changes to update automation availability
    this.setupMCPStateListener();

    // Expose initial automation state to window for render_prescript access
    await this.exposeAutomationStateToWindow();

    this.isInitialized = true;
    console.log('[AutomationService] Automation service initialized successfully');
  }

  /**
   * Clean up the automation service
   * Removes event listeners and cleans up resources
   */
  public cleanup(): void {
    if (!this.isInitialized) {
      return;
    }

    console.log('[AutomationService] Cleaning up automation service');

    // Remove DOM event listener
    if (this.eventListener) {
      document.removeEventListener('mcp:tool-execution-complete', this.eventListener);
      this.eventListener = null;
    }

    this.isInitialized = false;
    console.log('[AutomationService] Automation service cleaned up');
  }

  /**
   * Set up the main event listener for tool execution completion
   */
  private setupToolExecutionListener(): void {
    // Remove existing listener if any
    if (this.eventListener) {
      document.removeEventListener('mcp:tool-execution-complete', this.eventListener);
    }

    // Create new event listener
    this.eventListener = (event: Event) => {
      this.handleToolExecutionComplete(event as CustomEvent<ToolExecutionCompleteDetail>);
    };

    // Add event listener to document
    document.addEventListener('mcp:tool-execution-complete', this.eventListener);
    console.debug('[AutomationService] Tool execution event listener registered');
  }

  /**
   * Set up listener for MCP state changes
   */
  private setupMCPStateListener(): void {
    // Listen for MCP connection state changes via the event bus
    eventBus.on('connection:status-changed', ({ status }) => {
      console.debug('[AutomationService] MCP connection status changed:', status);
      // Could add logic here to disable automation when MCP is disconnected
    });
  }

  /**
   * Main handler for tool execution completion events
   */
  private async handleToolExecutionComplete(event: CustomEvent<ToolExecutionCompleteDetail>): Promise<void> {
    if (!event.detail) {
      console.warn('[AutomationService] Tool execution complete event received without detail');
      return;
    }

    const detail = event.detail;
    console.debug('[AutomationService] Tool execution complete event received:', detail);

    try {
      // Get current automation state from user preferences
      const automationState = await this.getAutomationState();
      
      if (!automationState) {
        console.debug('[AutomationService] Could not get automation state, skipping automation');
        return;
      }

      // Update automation state on window for render_prescript access
      await this.exposeAutomationStateToWindow();

      console.debug('[AutomationService] Current automation state:', automationState);

      // Handle Auto Execute (always run if enabled, independent of other actions)
      if (automationState.autoExecute) {
        this.handleAutoExecute(detail);
      }

      // Handle Auto Insert and Auto Submit logic
      const shouldAutoInsert = automationState.autoInsert || detail.skipAutoInsertCheck;
      
      if (shouldAutoInsert) {
        const insertSuccess = await this.handleAutoInsert(detail);
        
        // Only proceed with auto submit if auto insert was successful
        // and auto submit is enabled
        if (insertSuccess && automationState.autoSubmit) {
          await this.handleAutoSubmit(detail);
        }
      } else {
        console.debug('[AutomationService] Auto Insert disabled, skipping insert and submit actions');
      }

    } catch (error) {
      console.error('[AutomationService] Error handling tool execution complete:', error);
    }
  }

  /**
   * Get current automation state from user preferences store
   */
  private async getAutomationState(): Promise<AutomationState | null> {
    try {
      // Access the user preferences using the store reference
      if (!storeRefs.getUserPreferences) {
        console.error('[AutomationService] Store access not initialized');
        return null;
      }

      const preferences = await storeRefs.getUserPreferences();
      
      // Extract automation settings from preferences
      return {
        autoInsert: preferences.autoInsert || false,
        autoSubmit: preferences.autoSubmit || false,
        autoExecute: preferences.autoExecute || false,
      };
    } catch (error) {
      console.error('[AutomationService] Error getting automation state:', error);
      return null;
    }
  }

  /**
   * Handle Auto Execute functionality
   * Currently just logs the execution, but extensible for future features
   */
  private handleAutoExecute(detail: ToolExecutionCompleteDetail): void {
    console.log('[AutomationService] Auto Execute: Tool execution completed', {
      functionName: detail.functionName,
      callId: detail.callId,
      hasResult: !!detail.result,
      isFileAttachment: detail.isFileAttachment,
      fileName: detail.fileName
    });

    // Emit event for potential future integrations
    // eventBus.emit('automation:execute-completed', {
    //   detail,
    //   timestamp: Date.now()
    // });
  }

  /**
   * Handle Auto Insert functionality
   * Inserts text or attaches files based on the execution result
   */
  private async handleAutoInsert(detail: ToolExecutionCompleteDetail): Promise<boolean> {
    console.debug('[AutomationService] Handling auto insert');

    try {
      // Get current adapter from the adapter hook
      if (!storeRefs.getCurrentAdapterState) {
        console.error('[AutomationService] Adapter store access not initialized');
        return false;
      }

      const { plugin: activePlugin, insertText, attachFile, isReady } = await storeRefs.getCurrentAdapterState();

      if (!isReady || !activePlugin) {
        console.warn('[AutomationService] No active adapter available for auto insert');
        return false;
      }

      console.debug('[AutomationService] Using adapter for auto insert:', activePlugin.name);

      // Handle file attachment
      if (detail.isFileAttachment && detail.file && attachFile) {
        console.debug('[AutomationService] Auto inserting file:', detail.file.name);
        
        try {
          const success = await attachFile(detail.file);
          
          if (success) {
            console.log('[AutomationService] File attached successfully via auto insert');
            
            // Optionally insert confirmation text if provided
            if (detail.confirmationText && insertText) {
              console.debug('[AutomationService] Inserting file confirmation text');
              // Small delay to ensure file attachment is processed
              setTimeout(async () => {
                try {
                  await insertText(detail.confirmationText!);
                } catch (error) {
                  console.error('[AutomationService] Error inserting confirmation text:', error);
                }
              }, 100);
            }
            
            return true;
          } else {
            console.warn('[AutomationService] File attachment failed');
            return false;
          }
        } catch (attachError) {
          console.error('[AutomationService] Error calling attachFile method:', attachError);
          console.error('[AutomationService] attachFile context info:', {
            hasAttachFile: !!attachFile,
            attachFileType: typeof attachFile,
            activePluginName: activePlugin?.name,
            fileName: detail.file?.name
          });
          return false;
        }
      }
      
      // Handle text insertion
      else if (detail.result && insertText) {
        console.debug('[AutomationService] Auto inserting text result');
        
        try {
          const success = await insertText(detail.result);
          
          if (success) {
            console.log('[AutomationService] Text inserted successfully via auto insert');
            return true;
          } else {
            console.warn('[AutomationService] Text insertion failed');
            return false;
          }
        } catch (insertError) {
          console.error('[AutomationService] Error calling insertText method:', insertError);
          console.error('[AutomationService] insertText context info:', {
            hasInsertText: !!insertText,
            insertTextType: typeof insertText,
            activePluginName: activePlugin?.name
          });
          return false;
        }
      }
      
      // No valid insertion method found
      else {
        console.warn('[AutomationService] No valid insertion method found for auto insert', {
          hasResult: !!detail.result,
          isFileAttachment: detail.isFileAttachment,
          hasFile: !!detail.file,
          hasInsertText: !!insertText,
          hasAttachFile: !!attachFile
        });
        return false;
      }

    } catch (error) {
      console.error('[AutomationService] Error during auto insert:', error);
      return false;
    }
  }

  /**
   * Handle Auto Submit functionality
   * Submits the current form after auto insertion
   */
  private async handleAutoSubmit(detail: ToolExecutionCompleteDetail): Promise<boolean> {
    console.debug('[AutomationService] Handling auto submit');

    try {
      // Get current adapter from the adapter hook
      if (!storeRefs.getCurrentAdapterState) {
        console.error('[AutomationService] Adapter store access not initialized');
        return false;
      }

      const { plugin: activePlugin, submitForm, isReady } = await storeRefs.getCurrentAdapterState();

      if (!isReady || !activePlugin || !submitForm) {
        console.warn('[AutomationService] No active adapter or submit capability available for auto submit');
        return false;
      }

      console.debug('[AutomationService] Using adapter for auto submit:', activePlugin.name);

      // Add a small delay to ensure any prior insertion/attachment has settled in the UI
      await new Promise(resolve => setTimeout(resolve, 800));

      try {
        const success = await submitForm();
        
        if (success) {
          console.log('[AutomationService] Form submitted successfully via auto submit');
          return true;
        } else {
          console.warn('[AutomationService] Form submission failed');
          return false;
        }
      } catch (submitError) {
        console.error('[AutomationService] Error calling submitForm method:', submitError);
        console.error('[AutomationService] submitForm context info:', {
          hasSubmitForm: !!submitForm,
          submitFormType: typeof submitForm,
          activePluginName: activePlugin?.name
        });
        return false;
      }

    } catch (error) {
      console.error('[AutomationService] Error during auto submit:', error);
      return false;
    }
  }

  /**
   * Check if automation service is initialized
   */
  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current automation state (public method for external access)
   */
  public async getCurrentAutomationState(): Promise<AutomationState | null> {
    return await this.getAutomationState();
  }

  /**
   * Force trigger automation for testing/debugging purposes
   */
  public async triggerTestAutomation(detail: ToolExecutionCompleteDetail): Promise<void> {
    console.log('[AutomationService] Triggering test automation');
    await this.handleToolExecutionComplete(new CustomEvent('mcp:tool-execution-complete', { detail }));
  }

  /**
   * Expose current automation state to window object for access by render_prescript
   */
  private async exposeAutomationStateToWindow(): Promise<void> {
    try {
      const automationState = await this.getAutomationState();
      if (automationState) {
        (window as any).__mcpAutomationState = automationState;
        console.debug('[AutomationService] Exposed automation state to window:', automationState);
      }
    } catch (error) {
      console.error('[AutomationService] Error exposing automation state to window:', error);
    }
  }

  /**
   * Update automation state on window object when preferences change
   */
  public async updateAutomationStateOnWindow(): Promise<void> {
    await this.exposeAutomationStateToWindow();
  }
}

// Export singleton instance
export const automationService = AutomationService.getInstance();

// Export initialization function for easy setup
export async function initializeAutomationService(): Promise<void> {
  await automationService.initialize();
}

// Export cleanup function
export function cleanupAutomationService(): void {
  automationService.cleanup();
}

// Default export for convenience
export default automationService;

// Development utilities
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Expose automation service for debugging
  (window as any).__automationService = {
    service: automationService,
    getState: async () => await automationService.getCurrentAutomationState(),
    testAutoInsert: async (text: string) => {
      return automationService.triggerTestAutomation({
        result: text,
        isFileAttachment: false,
        skipAutoInsertCheck: false
      });
    },
    testAutoSubmit: async () => {
      return automationService.triggerTestAutomation({
        result: 'Test result for auto submit',
        isFileAttachment: false,
        skipAutoInsertCheck: true // Force insert so submit can run
      });
    },
    testFileAttachment: async (fileName: string = 'test.txt', content: string = 'Test file content') => {
      const file = new File([content], fileName, { type: 'text/plain' });
      return automationService.triggerTestAutomation({
        isFileAttachment: true,
        file,
        fileName,
        confirmationText: `File ${fileName} attached successfully`,
        skipAutoInsertCheck: false
      });
    }
  };
  
  console.debug('[AutomationService] Debug utilities exposed on window.__automationService');
}
