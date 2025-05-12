import React from 'react';
import ReactDOM from 'react-dom/client';
import { MCPPopover } from '../../components/mcpPopover/mcpPopover';

// --- Interfaces ---

export interface MCPToggleState {
  mcpEnabled: boolean;
  autoInsert: boolean;
  autoSubmit: boolean;
  autoExecute: boolean;
}

export interface SimpleSiteAdapter {
  name: string;
  insertTextIntoInput(text: string): void;
  triggerSubmission(): void;
  toggleSidebar?(): void; // Optional
  showSidebarWithToolOutputs?(): void; // Optional
  hideSidebar?(): void; // Optional
  sidebarManager?: { show(): void; hide(): void }; // Optional structure seen in some adapters
  supportsFileUpload?(): boolean; // Optional
  attachFile?(file: File): void; // Optional
}

export interface AdapterConfig {
  adapterName: string;
  storageKeyPrefix: string;
  findButtonInsertionPoint: () => { container: Element; insertAfter: Element | null } | Element | null;
  insertToggleButtons?: (config: AdapterConfig, stateManager: ToggleStateManager) => void; // Optional override
  getStorage: () => Storage | chrome.storage.LocalStorageArea; // Function to get the correct storage
  getCurrentURLKey?: () => string; // Optional override for URL key generation
  onMCPEnabled?: (adapter: SimpleSiteAdapter | null) => void; // Optional callback
  onMCPDisabled?: (adapter: SimpleSiteAdapter | null) => void; // Optional callback
  updateUI?: () => void; // Optional UI update callback
}

// --- Global State ---

export const defaultState: MCPToggleState = {
  mcpEnabled: false,
  autoInsert: false,
  autoSubmit: false,
  autoExecute: false,
};

export let toggleState: MCPToggleState = { ...defaultState };

// Expose toggle state globally (consider alternatives later if needed)
declare global {
  interface Window {
    mcpAdapter?: any;
    toggleState?: MCPToggleState;
    injectMCPButtons?: () => void; // Keep for manual debugging if used
  }
}
(window as any).toggleState = toggleState;

// --- Toggle State Manager ---

export class ToggleStateManager {
  private config: AdapterConfig;
  private loadedState: MCPToggleState | null = null;

  constructor(config: AdapterConfig) {
    this.config = config;
    // Ensure toggleState is initialized correctly
    if (!(window as any).toggleState) {
      (window as any).toggleState = { ...defaultState };
    }
    toggleState = (window as any).toggleState;
  }

  getState(): MCPToggleState {
    return { ...toggleState };
  }

  setMCPEnabled(enabled: boolean): void {
    console.log(`[${this.config.adapterName}] Setting MCP ${enabled ? 'enabled' : 'disabled'}`);
    toggleState.mcpEnabled = enabled;
    if (!enabled) {
      toggleState.autoInsert = false;
      toggleState.autoSubmit = false;
      toggleState.autoExecute = false;
    }

    const adapter = window.mcpAdapter;
    if (enabled) {
      if (this.config.onMCPEnabled) {
        this.config.onMCPEnabled(adapter || null);
      } else if (adapter?.showSidebarWithToolOutputs) {
        adapter.showSidebarWithToolOutputs();
      } else if (adapter?.toggleSidebar) {
        adapter.toggleSidebar(); // Fallback
      }
    } else {
      if (this.config.onMCPDisabled) {
        this.config.onMCPDisabled(adapter || null);
      } else if (adapter?.hideSidebar) {
        adapter.hideSidebar();
      } else if (adapter?.sidebarManager?.hide) {
        adapter.sidebarManager.hide();
      } else if (adapter?.toggleSidebar) {
        adapter.toggleSidebar(); // Fallback
      }
    }

    this.updateUI();
    this.saveState();
  }

  setAutoInsert(enabled: boolean): void {
    console.log(`[${this.config.adapterName}] Setting Auto Insert ${enabled ? 'enabled' : 'disabled'}`);
    if (enabled && !toggleState.mcpEnabled) {
      console.log(`[${this.config.adapterName}] Cannot enable Auto Insert when MCP is disabled`);
      return;
    }
    toggleState.autoInsert = enabled;
    if (!enabled) {
      if (toggleState.autoSubmit) {
        console.log(`[${this.config.adapterName}] Disabling Auto Submit due to Auto Insert off`);
      }
      toggleState.autoSubmit = false;
    }
    this.updateUI();
    this.saveState();
  }

  setAutoSubmit(enabled: boolean): void {
    console.log(`[${this.config.adapterName}] Setting Auto Submit ${enabled ? 'enabled' : 'disabled'}`);
    if (enabled) {
      if (!toggleState.mcpEnabled) {
        console.log(`[${this.config.adapterName}] Cannot enable Auto Submit when MCP is disabled`);
        this.updateUI(); // Reflect that state didn't change
        return;
      }
      if (!toggleState.autoInsert) {
        console.log(`[${this.config.adapterName}] Cannot enable Auto Submit when Auto Insert is disabled`);
        this.updateUI(); // Reflect that state didn't change
        return;
      }
    }

    if (toggleState.autoSubmit !== enabled) {
      toggleState.autoSubmit = enabled;
      this.updateUI();
      this.saveState();
    } else {
      console.log(`[${this.config.adapterName}] Auto Submit state already ${enabled}`);
      this.updateUI(); // Ensure UI is consistent even if state didn't change logically
    }
  }

  setAutoExecute(enabled: boolean): void {
    console.log(`[${this.config.adapterName}] Setting Auto Execute ${enabled ? 'enabled' : 'disabled'}`);
    if (enabled && !toggleState.mcpEnabled) {
      console.log(`[${this.config.adapterName}] Cannot enable Auto Execute when MCP is disabled`);
      return;
    }
    toggleState.autoExecute = enabled;
    this.updateUI();
    this.saveState();
  }

  validateState(): void {
    console.log(`[${this.config.adapterName}] Validating toggle state`);
    let changed = false;
    if (!toggleState.mcpEnabled) {
      if (toggleState.autoInsert) {
        toggleState.autoInsert = false;
        changed = true;
      }
      if (toggleState.autoSubmit) {
        toggleState.autoSubmit = false;
        changed = true;
      }
      if (toggleState.autoExecute) {
        toggleState.autoExecute = false;
        changed = true;
      }
    }
    if (!toggleState.autoInsert) {
      if (toggleState.autoSubmit) {
        toggleState.autoSubmit = false;
        changed = true;
      }
    }
    if (changed) {
      console.log(`[${this.config.adapterName}] State adjusted for consistency:`, toggleState);
      this.updateUI();
      this.saveState();
    }
  }

  stateLoaded(loaded: MCPToggleState | null): void {
    this.loadedState = loaded; // Store for applyLoadedState
    if (loaded) {
      console.log(`[${this.config.adapterName}] State loaded from storage:`, loaded);
      // Merge loaded state with defaults, prioritizing loaded values
      toggleState = { ...defaultState, ...loaded };
      (window as any).toggleState = toggleState; // Update global reference
    } else {
      console.log(`[${this.config.adapterName}] No saved state found, using defaults.`);
      toggleState = { ...defaultState }; // Reset to defaults if nothing loaded
      (window as any).toggleState = toggleState;
    }
    this.validateState(); // Validate after loading/resetting
    // Initial UI update and sidebar sync happens in applyLoadedState after button insertion
  }

  applyLoadedState(): void {
    console.log(`[${this.config.adapterName}] Applying loaded state to UI`);
    // Apply MCP state - show/hide sidebar
    const adapter = window.mcpAdapter;
    if (toggleState.mcpEnabled) {
      if (this.config.onMCPEnabled) {
        this.config.onMCPEnabled(adapter || null);
      } else if (adapter?.showSidebarWithToolOutputs) {
        adapter.showSidebarWithToolOutputs();
      }
    } else {
      if (this.config.onMCPDisabled) {
        this.config.onMCPDisabled(adapter || null);
      } else if (adapter?.hideSidebar) {
        adapter.hideSidebar();
      } else if (adapter?.sidebarManager?.hide) {
        adapter.sidebarManager.hide();
      }
    }
    this.updateUI(); // Update button states in the popover
    this.loadedState = null; // Clear loaded state after applying
  }

  updateUI(): void {
    console.log(`[${this.config.adapterName}] Updating button states`, toggleState);
    if (this.config.updateUI) {
      this.config.updateUI(); // Call adapter-specific UI update if provided
    }
    // Update the popover if it exists
    const popoverContainer = document.getElementById('mcp-popover-container');
    if (popoverContainer) {
      const event = new CustomEvent('mcp:update-toggle-state', {
        detail: { toggleState: { ...toggleState } }, // Pass a copy
      });
      popoverContainer.dispatchEvent(event);
      console.log(`[${this.config.adapterName}] Dispatched mcp:update-toggle-state event`);
    } else {
      console.log(`[${this.config.adapterName}] Popover container not found for UI update.`);
    }
  }

  // --- Storage ---
  private getCurrentURLKey(): string {
    if (this.config.getCurrentURLKey) {
      return this.config.getCurrentURLKey();
    }
    // Default implementation (used by Gemini, AI Studio, potentially others)
    return window.location.pathname || window.location.href; // Use pathname or full href as fallback
  }

  private getStorageKey(): string {
    const urlKey = this.getCurrentURLKey();
    return `${this.config.storageKeyPrefix}-${urlKey}`;
  }

  loadState(): void {
    const storage = this.config.getStorage();
    const storageKey = this.getStorageKey();
    console.log(`[${this.config.adapterName}] Loading state from storage key: ${storageKey}`);

    if (storage === localStorage || storage === sessionStorage) {
      // Handle Web Storage API (sync)
      try {
        const raw = storage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as MCPToggleState;
          this.stateLoaded(parsed);
        } else {
          this.stateLoaded(null);
        }
      } catch (e) {
        console.error(`[${this.config.adapterName}] Failed to parse saved state from Web Storage`, e);
        this.stateLoaded(null);
      }
    } else if (storage === chrome.storage.local || storage === chrome.storage.sync) {
      // Handle Chrome Storage API (async)
      storage.get(storageKey, (result: Record<string, MCPToggleState>) => {
        if (chrome.runtime.lastError) {
          console.error(
            `[${this.config.adapterName}] Error loading state from chrome.storage:`,
            chrome.runtime.lastError,
          );
          this.stateLoaded(null);
        } else if (result && result[storageKey]) {
          this.stateLoaded(result[storageKey]);
        } else {
          this.stateLoaded(null);
        }
      });
    } else {
      console.error(`[${this.config.adapterName}] Unsupported storage type provided.`);
      this.stateLoaded(null);
    }
  }

  saveState(): void {
    const storage = this.config.getStorage();
    const storageKey = this.getStorageKey();
    const stateToSave = { ...toggleState }; // Save a copy
    console.log(`[${this.config.adapterName}] Saving state to storage key: ${storageKey}`, stateToSave);

    if (storage === localStorage || storage === sessionStorage) {
      // Handle Web Storage API (sync)
      try {
        storage.setItem(storageKey, JSON.stringify(stateToSave));
      } catch (e) {
        console.error(`[${this.config.adapterName}] Failed to save state to Web Storage`, e);
      }
    } else if (storage === chrome.storage.local || storage === chrome.storage.sync) {
      // Handle Chrome Storage API (async)
      const dataToStore: Record<string, MCPToggleState> = {};
      dataToStore[storageKey] = stateToSave;
      storage.set(dataToStore, () => {
        if (chrome.runtime.lastError) {
          console.error(`[${this.config.adapterName}] Error saving state to chrome.storage:`, chrome.runtime.lastError);
        } else {
          console.log(`[${this.config.adapterName}] State saved successfully via chrome.storage.`);
        }
      });
    } else {
      console.error(`[${this.config.adapterName}] Unsupported storage type provided for saving.`);
    }
    // Also update the global window object immediately
    (window as any).toggleState = toggleState;
  }
}

// --- Auto Actions ---

export function handleAutoInsert(text: string, adapterName: string, skipAutoInsertCheck: boolean = false): void {
  if (!toggleState.autoInsert && !skipAutoInsertCheck) {
    console.log(`[${adapterName}] Auto Insert disabled, skipping text insert.`);
    return;
  }
  const adapter = window.mcpAdapter;
  if (adapter && adapter.name === adapterName && adapter.insertTextIntoInput) {
    console.log(`[${adapterName}] Auto Insert: Inserting text into input.`);
    adapter.insertTextIntoInput(text);
  } else {
    console.warn(`[${adapterName}] Adapter not found or doesn't match for handleAutoInsert.`);
  }
}

export function handleAutoInsertWithFile(
  file: File,
  confirmationText: string | null,
  adapterName: string,
  skipAutoInsertCheck: boolean = false,
): void {
  if (!toggleState.autoInsert && !skipAutoInsertCheck) {
    console.log(`[${adapterName}] Auto Insert disabled, skipping file attach.`);
    return;
  }
  const adapter = window.mcpAdapter;
  if (adapter && adapter.name === adapterName) {
    if (adapter.supportsFileUpload && adapter.supportsFileUpload() && adapter.attachFile) {
      console.log(`[${adapterName}] Auto Insert: Attaching file: ${file.name}`);
      adapter.attachFile(file);
      // Optionally insert confirmation text if provided
      if (confirmationText && adapter.insertTextIntoInput) {
        console.log(`[${adapterName}] Auto Insert: Inserting file confirmation text.`);
        // Use a slight delay if needed, though often not necessary after attachFile
        setTimeout(() => adapter.insertTextIntoInput!(confirmationText), 50);
      }
    } else {
      console.warn(`[${adapterName}] File upload not supported or attachFile method missing on this adapter.`);
      // Fallback: maybe insert text indicating the file couldn't be attached?
      if (adapter.insertTextIntoInput) {
        adapter.insertTextIntoInput(`[File Attachment Failed: ${file.name}]`);
      }
    }
  } else {
    console.warn(`[${adapterName}] Adapter not found or doesn't match for handleAutoInsertWithFile.`);
  }
}

export function handleAutoSubmit(adapterName: string): void {
  // Auto Submit depends on Auto Insert being enabled (validated by ToggleStateManager)
  // and also depends on the mcp:tool-execution-complete event logic checking toggleState.autoSubmit
  if (!toggleState.autoSubmit) {
    console.log(`[${adapterName}] Auto Submit disabled, skipping submission.`);
    return;
  }

  const adapter = window.mcpAdapter;
  if (adapter && adapter.name === adapterName && adapter.triggerSubmission) {
    console.log(`[${adapterName}] Auto Submit: Triggering submission.`);
    // Add a small delay to ensure any prior insertion/attachment has settled in the UI
    setTimeout(() => {
      adapter.triggerSubmission();
    }, 500); // 500ms delay, adjust if needed
  } else {
    console.warn(`[${adapterName}] Adapter not found or doesn't match for handleAutoSubmit.`);
  }
}

// --- Event Listener Setup ---

// Track which adapters have already registered a listener
const registeredToolExecutionListeners = new Set<string>();

export function setupToolExecutionListener(stateManager: ToggleStateManager, adapterName: string): void {
  // Guard against double subscription
  if (registeredToolExecutionListeners.has(adapterName)) {
    console.log(`[${adapterName}] Tool execution listener already registered, skipping.`);
    return;
  }

  // Register this adapter
  registeredToolExecutionListeners.add(adapterName);

  document.addEventListener('mcp:tool-execution-complete', (event: Event) => {
    const customEvent = event as CustomEvent;
    if (customEvent.detail) {
      console.log(`[${adapterName}] Event mcp:tool-execution-complete received`, customEvent.detail);

      // Ensure state is consistent before proceeding
      stateManager.validateState(); // Use the passed stateManager instance

      // Get current state *after* validation
      const currentState = stateManager.getState();

      // Auto Execute Log (independent action)
      if (currentState.autoExecute) {
        console.log(`[${adapterName}] Auto Execute: Tool execution finished.`);
        // Potentially trigger next steps if Auto Execute implies more than just logging
      }

      // Auto Insert / Auto Submit Logic
      const isFileAttachment = customEvent.detail.isFileAttachment === true;
      const skipAutoInsertCheck = customEvent.detail.skipAutoInsertCheck === true; // Allow forcing insert/attach

      if (currentState.autoInsert || skipAutoInsertCheck) {
        if (isFileAttachment) {
          const file = customEvent.detail.file as File;
          const confirmationText = customEvent.detail.confirmationText as string | null;
          if (file) {
            handleAutoInsertWithFile(file, confirmationText, adapterName, skipAutoInsertCheck);
          } else {
            console.error(`[${adapterName}] isFileAttachment is true but no file found in event detail.`);
          }
        } else {
          const resultText = customEvent.detail.result as string;
          if (resultText !== undefined && resultText !== null) {
            handleAutoInsert(resultText, adapterName, skipAutoInsertCheck);
          } else {
            console.warn(`[${adapterName}] No result text found in event detail for auto-insert.`);
          }
        }

        // Check Auto Submit *after* handling insert/attach
        // State manager ensures autoSubmit is false if autoInsert is false (unless skipAutoInsertCheck was true)
        // We re-check the state here in case skipAutoInsertCheck was true but autoSubmit should still be respected
        if (stateManager.getState().autoSubmit) {
          handleAutoSubmit(adapterName);
        } else {
          console.log(`[${adapterName}] Auto Submit is disabled, not triggering submission.`);
        }
      } else {
        console.log(`[${adapterName}] Auto Insert is disabled, skipping insert and submit actions.`);
      }
    } else {
      console.warn(`[${adapterName}] mcp:tool-execution-complete event received without detail.`);
    }
  });
  console.log(`[${adapterName}] mcp:tool-execution-complete event listener added.`);
}

// --- UI Insertion ---

// Default implementation - can be overridden by adapter config
export function insertToggleButtonsCommon(config: AdapterConfig, stateManager: ToggleStateManager): void {
  const adapterName = config.adapterName;
  console.log(`[${adapterName}] Inserting MCP popover button (common implementation)`);

  if (document.getElementById('mcp-popover-container')) {
    console.log(`[${adapterName}] MCP popover already exists, applying state.`);
    stateManager.applyLoadedState(); // Ensure state is applied if already exists
    return;
  }

  const insertionPointResult = config.findButtonInsertionPoint();
  if (!insertionPointResult) {
    console.log(`[${adapterName}] Could not find insertion point, retrying...`);
    setTimeout(() => insertToggleButtonsCommon(config, stateManager), 1000);
    return;
  }

  let container: Element;
  let insertAfter: Element | null = null;

  // Handle different return types from findButtonInsertionPoint
  if (insertionPointResult instanceof Element) {
    container = insertionPointResult; // Simple case: the container itself is returned
  } else if (insertionPointResult && typeof insertionPointResult === 'object' && 'container' in insertionPointResult) {
    container = insertionPointResult.container; // Structured case: { container, insertAfter }
    insertAfter = insertionPointResult.insertAfter;
  } else {
    console.error(`[${adapterName}] Invalid insertion point result:`, insertionPointResult);
    return; // Cannot proceed
  }

  try {
    const reactContainer = document.createElement('div');
    reactContainer.id = 'mcp-popover-container';
    reactContainer.style.display = 'inline-block'; // Basic styling
    reactContainer.style.margin = '0 4px'; // Add some spacing

    // Ensure container is still in the DOM
    if (!document.body.contains(container)) {
      console.log(`[${adapterName}] Insertion container is no longer in the DOM, retrying...`);
      setTimeout(() => insertToggleButtonsCommon(config, stateManager), 1000);
      return;
    }

    // Insert the container at the appropriate location
    if (insertAfter && insertAfter.parentNode === container) {
      container.insertBefore(reactContainer, insertAfter.nextSibling);
      console.log(`[${adapterName}] Inserted popover container after specified element.`);
    } else {
      // Append to the end if insertAfter is null, not found, or not a child
      container.appendChild(reactContainer);
      console.log(`[${adapterName}] Appended popover container to the end of the container element.`);
    }

    // Render the React MCPPopover
    ReactDOM.createRoot(reactContainer).render(
      React.createElement(MCPPopover, {
        toggleStateManager: {
          // Pass the methods from the stateManager instance
          getState: stateManager.getState.bind(stateManager),
          setMCPEnabled: stateManager.setMCPEnabled.bind(stateManager),
          setAutoInsert: stateManager.setAutoInsert.bind(stateManager),
          setAutoSubmit: stateManager.setAutoSubmit.bind(stateManager),
          setAutoExecute: stateManager.setAutoExecute.bind(stateManager),
          updateUI: stateManager.updateUI.bind(stateManager), // Pass the bound updateUI
        },
      }),
    );

    console.log(`[${adapterName}] MCP popover rendered successfully.`);
    stateManager.applyLoadedState(); // Apply loaded state now that the popover exists
  } catch (error) {
    console.error(`[${adapterName}] Error inserting MCP popover:`, error);
    // Optional: Retry on error
    // setTimeout(() => insertToggleButtonsCommon(config, stateManager), 2000);
  }
}

// --- Initialization ---

export function initializeAdapter(config: AdapterConfig): ToggleStateManager {
  console.log(`Initializing common components for: ${config.adapterName}`);

  // Ensure global mcpAdapter is set if possible (might be set later by specific adapter)
  if (!window.mcpAdapter && (window as any).getCurrentAdapter) {
    window.mcpAdapter = (window as any).getCurrentAdapter();
    console.log(`[${config.adapterName}] Set global mcpAdapter.`);
  }

  // Create the state manager instance
  const stateManager = new ToggleStateManager(config);

  // Load state from storage
  stateManager.loadState(); // This is async for chrome.storage

  // Determine the insertion function
  const insertFunction = config.insertToggleButtons || insertToggleButtonsCommon;

  // Wait for UI readiness and insert buttons
  const waitForUI = () => {
    // Use findButtonInsertionPoint to check readiness
    if (config.findButtonInsertionPoint()) {
      console.log(`[${config.adapterName}] UI ready, inserting MCP popover.`);
      insertFunction(config, stateManager);
    } else {
      console.log(`[${config.adapterName}] UI not ready, waiting...`);
      setTimeout(waitForUI, 1000); // Check again in 1 second
    }
  };
  // Initial wait might be needed depending on the site
  setTimeout(waitForUI, 500); // Start checking after 500ms

  // Setup MutationObserver to reinsert if necessary
  const observer = new MutationObserver(mutations => {
    // Basic check: if the popover is gone, try reinserting
    // More specific checks could be added based on mutation targets if needed
    if (!document.getElementById('mcp-popover-container')) {
      // Check if the original insertion container still exists before trying to reinsert
      const insertionPoint = config.findButtonInsertionPoint();
      if (insertionPoint) {
        console.log(`[${config.adapterName}] MCP popover missing, attempting reinsertion...`);
        insertFunction(config, stateManager);
      } else {
        console.log(`[${config.adapterName}] MCP popover missing, but insertion point also missing. Waiting...`);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // Consider adding attributes: true, attributeFilter: ['class', 'style'] if needed
  });
  console.log(`[${config.adapterName}] MutationObserver set up.`);

  // Setup the tool execution listener
  setupToolExecutionListener(stateManager, config.adapterName);

  // Optional: Add periodic check as a fallback
  setInterval(() => {
    if (!document.getElementById('mcp-popover-container')) {
      const insertionPoint = config.findButtonInsertionPoint();
      if (insertionPoint) {
        console.log(`[${config.adapterName}] Periodic check: MCP popover missing, reinserting...`);
        insertFunction(config, stateManager);
      }
    }
  }, 7500); // Check every 7.5 seconds

  // Optional: Expose manual injection for debugging
  (window as any)[`injectMCPButtons_${config.adapterName}`] = () => {
    console.log(`[${config.adapterName}] Manual injection triggered.`);
    insertFunction(config, stateManager);
  };

  return stateManager; // Return the manager instance
}
