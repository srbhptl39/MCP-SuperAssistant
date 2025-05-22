/**
 * DeepSeek website components for MCP-SuperAssistant
 * 
 * This file implements the toggle buttons for MCP functionality on the DeepSeek website:
 * 1. MCP ON/OFF toggle
 * 2. Auto Insert toggle
 * 3. Auto Submit toggle
 * 4. Auto Execute toggle
 */

import {
  initializeAdapter,
  AdapterConfig,
  SimpleSiteAdapter
} from './common'; // Import from the common file

// Keep DeepSeek-specific functions or overrides
function findDeepSeekButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
  // Look for the buttons container in the DeepSeek chat interface
  const buttonContainer = document.querySelector('.ec4f5d61');
  if (buttonContainer) {
    console.debug('[DeepSeek Adapter] Looking for search button in container');
    // Find the search button specifically - it has text content "Search"
    const buttons = buttonContainer.querySelectorAll('.ds-button');
    // Convert NodeListOf to Array to ensure iterator compatibility
    for (const button of Array.from(buttons)) {
      const buttonText = button.textContent?.trim();
      if (buttonText === 'Search') {
        console.debug('[DeepSeek Adapter] Found search button, will insert after it');
        return { container: buttonContainer, insertAfter: button };
      }
    }
    
    // If search button not found specifically, fall back to last button
    const lastButton = buttonContainer.querySelector('.ds-button:last-child');
    console.debug('[DeepSeek Adapter] Search button not found, using last button as insertion point');
    return { container: buttonContainer, insertAfter: lastButton };
  }

  // Fallback: Look for the parent of the textarea input
  const textareaParent = document.querySelector('div._24fad49');
  if (textareaParent && textareaParent.parentElement) {
    console.debug('[DeepSeek Adapter] Found insertion point relative to textarea (fallback)');
    return { container: textareaParent.parentElement, insertAfter: textareaParent };
  }

  // Second fallback: Try to find the file upload button container
  const fileUploadContainer = document.querySelector('.bf38813a');
  if (fileUploadContainer && fileUploadContainer.parentElement) {
    console.debug('[DeepSeek Adapter] Found insertion point near file upload button (fallback 2)');
    return { container: fileUploadContainer.parentElement, insertAfter: fileUploadContainer };
  }

  // Third fallback: Look for the main chat input area
  const chatInputArea = document.querySelector('.aaff8b8f');
  if (chatInputArea) {
    console.debug('[DeepSeek Adapter] Found insertion point in chat input area (fallback 3)');
    return { container: chatInputArea, insertAfter: null }; // Append to end
  }

  console.warn('[DeepSeek Adapter] Could not find a suitable insertion point.');
  return null;
}

// DeepSeek-specific sidebar handling (if different from common)
function showDeepSeekSidebar(adapter: SimpleSiteAdapter | null): void {
    console.debug('[DeepSeek Adapter] MCP Enabled - Showing sidebar');
    if (adapter?.showSidebarWithToolOutputs) {
        adapter.showSidebarWithToolOutputs();
    } else if (adapter?.toggleSidebar) {
        adapter.toggleSidebar(); // Fallback
    } else {
        console.warn('[DeepSeek Adapter] No method found to show sidebar.');
    }
}

function hideDeepSeekSidebar(adapter: SimpleSiteAdapter | null): void {
    console.debug('[DeepSeek Adapter] MCP Disabled - Hiding sidebar');
     if (adapter?.hideSidebar) {
        adapter.hideSidebar();
     } else if (adapter?.sidebarManager?.hide) {
         adapter.sidebarManager.hide();
     } else if (adapter?.toggleSidebar) {
        adapter.toggleSidebar(); // Fallback (might show if already hidden)
    } else {
        console.warn('[DeepSeek Adapter] No method found to hide sidebar.');
    }
}

// DeepSeek-specific URL key generation (if different from default)
function getDeepSeekURLKey(): string {
    // DeepSeek might not need complex keys, maybe just a constant
    return 'deepseek_chat'; // Or derive from URL if needed
}

// DeepSeek Adapter Configuration
const deepseekAdapterConfig: AdapterConfig = {
  adapterName: 'DeepSeek',
  storageKeyPrefix: 'mcp-deepseek-state', // Use chrome.storage, so prefix is enough
  findButtonInsertionPoint: findDeepSeekButtonInsertionPoint,
  getStorage: () => chrome.storage.local, // DeepSeek uses chrome.storage.local
  getCurrentURLKey: getDeepSeekURLKey, // Use DeepSeek-specific key generation
  onMCPEnabled: showDeepSeekSidebar,
  onMCPDisabled: hideDeepSeekSidebar,
  // insertToggleButtons: customInsertFunction, // Optional: If common insertion doesn't work
  // updateUI: customUpdateUI, // Optional: If specific UI updates needed beyond popover
};


// Initialize DeepSeek components using the common initializer
export function initDeepSeekComponents(): void {
  console.debug('Initializing DeepSeek MCP components using common framework');
  // The initializeAdapter function handles state loading, button insertion, listeners etc.
  const stateManager = initializeAdapter(deepseekAdapterConfig);

  // Expose manual injection for debugging (optional, uses adapter name)
   window.injectMCPButtons = () => {
       console.debug('Manual injection for DeepSeek triggered');
       // Use the specific function exposed by initializeAdapter if needed, or re-call init
       const insertFn = (window as any)[`injectMCPButtons_${deepseekAdapterConfig.adapterName}`];
       if (insertFn) {
           insertFn();
       } else {
           console.warn('Manual injection function not found.');
       }
   };

  console.debug('DeepSeek MCP components initialization complete.');
}

// --- Removed Code ---
// - MCPToggleState interface (moved to common)
// - defaultState constant (moved to common)
// - toggleState variable (managed within common, exposed globally)
// - toggleStateManager object (replaced by ToggleStateManager class in common)
// - loadState/saveState functions (handled by ToggleStateManager)
// - updateButtonStates (handled by ToggleStateManager.updateUI)
// - showSidebar/hideSidebar/showSidebarWithToolOutputs (integrated via config callbacks)
// - handleAutoInsert/handleAutoInsertWithFile/handleAutoSubmit (moved to common)
// - Event listener setup (handled by setupToolExecutionListener in common)
// - insertToggleButtons (handled by common or specific config override)
// - applyLoadedState (handled by ToggleStateManager)
// - Initialization logic structure (replaced by initializeAdapter)
