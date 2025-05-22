/**
 * Kagi website components for MCP-SuperAssistant
 *
 * This file implements the toggle buttons for MCP functionality on the Kagi website:
 * 1. MCP ON/OFF toggle
 * 2. Auto Insert toggle
 * 3. Auto Submit toggle
 * 4. Auto Execute toggle
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MCPPopover } from '../../components/mcpPopover/mcpPopover';

import type {
  AdapterConfig, // Import if needed for type hints, but instance is created by initializeAdapter
  SimpleSiteAdapter,
} from './common';
import {
  initializeAdapter,
  // ToggleStateManager,
  // MCPToggleState, // Import if needed
} from './common'; // Import from the common file

// Keep Kagi-specific functions or overrides
function findKagiButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
  // First try: Look for the buttons container in the form
  const buttonsContainer = document.querySelector('#form .buttons');
  if (buttonsContainer) {
    console.debug('[Kagi Adapter] Found insertion point in form buttons container');
    // Find the submit button to insert after
    const submitButton = buttonsContainer.querySelector('#submit');
    return { container: buttonsContainer, insertAfter: submitButton || null };
  }

  // Second try: Look for the mobile buttons container
  const mobileButtons = document.querySelector('.mobile-buttons');
  if (mobileButtons) {
    console.debug('[Kagi Adapter] Found insertion point in mobile buttons container');
    // Insert after the dictation button if it exists
    const dictationButton = mobileButtons.querySelector('.dictation-button');
    return { container: mobileButtons, insertAfter: dictationButton || null };
  }

  // Third try: Look for the prompt box itself
  const promptBox = document.querySelector('#prompt-box');
  if (promptBox) {
    console.debug('[Kagi Adapter] Found insertion point in prompt-box (fallback)');
    // Try to find the form element inside prompt-box
    const form = promptBox.querySelector('#form');
    return { container: form || promptBox, insertAfter: null }; // Append to end of form or prompt-box
  }

  console.warn('[Kagi Adapter] Could not find a suitable insertion point.');
  return null;
}

// Kagi-specific sidebar handling (if different from common)
function showKagiSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[Kagi Adapter] MCP Enabled - Showing sidebar');
  if (adapter?.showSidebarWithToolOutputs) {
    adapter.showSidebarWithToolOutputs();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback
  } else {
    console.warn('[Kagi Adapter] No method found to show sidebar.');
  }
}

function hideKagiSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[Kagi Adapter] MCP Disabled - Hiding sidebar');
  if (adapter?.hideSidebar) {
    adapter.hideSidebar();
  } else if (adapter?.sidebarManager?.hide) {
    adapter.sidebarManager.hide();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback (might show if already hidden)
  } else {
    console.warn('[Kagi Adapter] No method found to hide sidebar.');
  }
}

// Kagi-specific URL key generation (if different from default)
function getKagiURLKey(): string {
  // Kagi might not need complex keys, maybe just a constant
  return 'kagi_chat'; // Or derive from URL if needed
}

// Kagi Adapter Configuration
const kagiAdapterConfig: AdapterConfig = {
  adapterName: 'Kagi',
  storageKeyPrefix: 'mcp-kagi-state', // Use chrome.storage, so prefix is enough
  findButtonInsertionPoint: findKagiButtonInsertionPoint,
  getStorage: () => chrome.storage.local, // Kagi uses chrome.storage.local
  getCurrentURLKey: getKagiURLKey, // Use Kagi-specific key generation
  onMCPEnabled: showKagiSidebar,
  onMCPDisabled: hideKagiSidebar,
  // insertToggleButtons: customInsertFunction, // Optional: If common insertion doesn't work
  // updateUI: customUpdateUI, // Optional: If specific UI updates needed beyond popover
};

// Initialize Kagi components using the common initializer
export function initKagiComponents(): void {
  console.debug('Initializing Kagi MCP components using common framework');
  // The initializeAdapter function handles state loading, button insertion, listeners etc.
  const stateManager = initializeAdapter(kagiAdapterConfig);

  // Expose manual injection for debugging (optional, uses adapter name)
  window.injectMCPButtons = () => {
    console.debug('Manual injection for Kagi triggered');
    // Use the specific function exposed by initializeAdapter if needed, or re-call init
    const insertFn = (window as any)[`injectMCPButtons_${kagiAdapterConfig.adapterName}`];
    if (insertFn) {
      insertFn();
    } else {
      console.warn('Manual injection function not found.');
    }
  };

  console.debug('Kagi MCP components initialization complete.');
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
