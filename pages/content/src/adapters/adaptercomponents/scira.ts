/**
 * Scira website components for MCP-SuperAssistant
 *
 * This file implements the MCP popover button for Scira website with toggle functionality:
 * 1. MCP ON/OFF toggle
 * 2. Auto Insert toggle
 * 3. Auto Submit toggle
 * 4. Auto Execute toggle
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MCPPopover } from '../../components/mcpPopover/mcpPopover';
import type { AdapterConfig, ToggleStateManager, SimpleSiteAdapter } from './common';
import {
  initializeAdapter,
  MCPToggleState,
  insertToggleButtonsCommon, // Import common inserter if needed
} from './common';

// Keep Scira-specific functions or overrides

// Find where to insert the MCP popover in Scira UI
// TODO: Verify selector for Scira UI
function findSciraButtonInsertionPoint(): Element | null {
  // Placeholder: Look for a general actions container or near the text area
  const actionsContainer = document.querySelector('.scira-actions-container'); // TODO: Verify selector
  if (actionsContainer) {
    console.debug('[Scira Adapter] Found Scira actions container');
    return actionsContainer;
  }

  const textareaParent = document.querySelector('.scira-textarea-wrapper'); // TODO: Verify selector
  if (textareaParent) {
    console.debug('[Scira Adapter] Found Scira textarea wrapper as fallback');
    return textareaParent;
  }

  // Fallback to a known button if specific container not found
  const sendButton = document.querySelector('.scira-send-button'); // TODO: Verify selector
  if (sendButton && sendButton.parentElement) {
    console.debug('[Scira Adapter] Found parent of send button as fallback for MCP button');
    return sendButton.parentElement;
  }

  console.warn('[Scira Adapter] Could not find any suitable container for MCP button');
  return null;
}

// Custom insertion logic for Scira to place the button correctly
// TODO: Verify insertion logic for Scira UI
function insertSciraButtons(config: AdapterConfig, stateManager: ToggleStateManager): void {
  console.debug(`[${config.adapterName}] Inserting MCP popover button (Scira specific)`);

  if (document.getElementById('mcp-popover-container')) {
    console.debug(`[${config.adapterName}] MCP popover already exists, applying state.`);
    stateManager.applyLoadedState();
    return;
  }

  // Use the specific finder function - note it returns Element | null, not the object structure
  const container = config.findButtonInsertionPoint() as Element | null;
  if (!container) {
    console.debug(`[${config.adapterName}] Could not find insertion point, retrying...`);
    setTimeout(() => insertSciraButtons(config, stateManager), 1000); // Retry with Scira function
    return;
  }

  try {
    // Scira Specific: Create a wrapper div, adjust styling as needed for Scira
    // TODO: Verify styling for Scira UI
    const buttonWrapper = document.createElement('div');
    // buttonWrapper.style.viewTransitionName = 'var(--vt-composer-mcp-action)'; // May not apply to Scira

    // Create the React container
    const reactContainer = document.createElement('div');
    reactContainer.id = 'mcp-popover-container';
    reactContainer.style.display = 'inline-block';
    reactContainer.className = 'mcp-popover-wrapper';
    reactContainer.style.margin = '0 4px'; // Consistent spacing

    // Add the React container inside the wrapper
    buttonWrapper.appendChild(reactContainer);

    // Ensure container is still in the DOM
    if (!document.body.contains(container)) {
      console.debug(`[${config.adapterName}] Insertion container is no longer in the DOM, retrying...`);
      setTimeout(() => insertSciraButtons(config, stateManager), 1000); // Retry with Scira function
      return;
    }

    // Insert the wrapper as a direct child of the composer footer actions container
    // This places it at the same level as other action buttons
    container.appendChild(buttonWrapper);
    console.debug(`[${config.adapterName}] Inserted MCP button wrapper as direct child of actions container.`);

    // Render the React MCPPopover using the common method's approach
    ReactDOM.createRoot(reactContainer).render(
      React.createElement(MCPPopover, {
        toggleStateManager: {
          getState: stateManager.getState.bind(stateManager),
          setMCPEnabled: stateManager.setMCPEnabled.bind(stateManager),
          setAutoInsert: stateManager.setAutoInsert.bind(stateManager),
          setAutoSubmit: stateManager.setAutoSubmit.bind(stateManager),
          setAutoExecute: stateManager.setAutoExecute.bind(stateManager),
          updateUI: stateManager.updateUI.bind(stateManager),
        },
      }),
    );

    console.debug(`[${config.adapterName}] MCP popover rendered successfully.`);
    stateManager.applyLoadedState();
  } catch (error) {
    console.error(`[${config.adapterName}] Error inserting MCP popover:`, error);
    // Fallback to common inserter? Or just retry specific one?
    // setTimeout(() => insertSciraButtons(config, stateManager), 2000); // Retry with Scira function
  }
}

// Scira-specific sidebar handling
// TODO: Verify Scira sidebar interaction logic
function showSciraSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[Scira Adapter] MCP Enabled - Showing sidebar');
  if (adapter?.showSidebarWithToolOutputs) {
    adapter.showSidebarWithToolOutputs();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback
  } else {
    console.warn('[Scira Adapter] No method found to show sidebar.');
  }
}

function hideSciraSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[Scira Adapter] MCP Disabled - Hiding sidebar');
  if (adapter?.hideSidebar) {
    adapter.hideSidebar();
  } else if (adapter?.sidebarManager?.hide) {
    adapter.sidebarManager.hide();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback
  } else {
    console.warn('[Scira Adapter] No method found to hide sidebar.');
  }
}

// Scira-specific URL key generation
// TODO: Verify Scira URL structure for state management
function getSciraURLKey(): string {
  const url = window.location.href;
  // Example: Use 'scira_chat' for main chat, maybe different for settings etc.
  if (url.includes('/chat/')) { // Assuming Scira uses /chat/ for specific chats
    return 'scira_chat_specific';
  }
  if (url.includes('scira.ai/chat')) { // Main chat page
    return 'scira_chat_main';
  }
  // Fallback generic key
  return 'scira_default';
}

// Scira Adapter Configuration
const sciraAdapterConfig: AdapterConfig = {
  adapterName: 'Scira',
  storageKeyPrefix: 'mcp-scira-state', // Uses localStorage
  findButtonInsertionPoint: findSciraButtonInsertionPoint, // Use the specific finder
  insertToggleButtons: insertSciraButtons, // Use the specific inserter
  getStorage: () => localStorage, // Assuming Scira uses localStorage, adjust if not
  getCurrentURLKey: getSciraURLKey, // Use specific URL key logic
  onMCPEnabled: showSciraSidebar,
  onMCPDisabled: hideSciraSidebar,
};

// Initialize Scira components using the common initializer
export function initSciraComponents(): void {
  console.debug('Initializing Scira components using common framework');
  const stateManager = initializeAdapter(sciraAdapterConfig);

  // Expose manual injection for debugging (optional)
  (window as any).injectMCPButtonsScira = () => { // Renamed for clarity
    console.debug('Manual injection for Scira triggered');
    const insertFn = (window as any)[`injectMCPButtons_${sciraAdapterConfig.adapterName}`];
    if (insertFn) {
      insertFn();
    } else {
      console.warn('Manual injection function not found for Scira. Re-initialization might be needed.');
      // insertSciraButtons(sciraAdapterConfig, stateManager); // stateManager not available here
    }
  };

  console.debug('Scira components initialization complete.');
}

// --- Common Code (Potentially removable if fully generic in common.ts) ---
// - SimpleSiteAdapter interface (assumed moved to common)
// - Global window interface extension (assumed handled in common)
// - MCPToggleState interface (assumed moved to common)
// - defaultState constant (assumed moved to common)
// - toggleState variable (assumed managed within common)
// - toggleStateManager object (assumed replaced by ToggleStateManager class in common)
// - loadState/saveState functions (assumed handled by ToggleStateManager)
// - updateButtonStates (assumed handled by ToggleStateManager.updateUI)
// - showSidebar/hideSidebar/showSidebarWithToolOutputs (assumed integrated via config callbacks)
// - handleAutoInsert/handleAutoInsertWithFile/handleAutoSubmit (assumed moved to common)
// - Event listener setup (assumed handled by setupToolExecutionListener in common)
// - applyLoadedState (assumed handled by ToggleStateManager)
// - Initialization logic structure (assumed replaced by initializeAdapter)
// - MutationObserver and interval checks (assumed handled within initializeAdapter)
