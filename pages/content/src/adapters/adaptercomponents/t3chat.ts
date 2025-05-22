/**
 * T3 Chat website components for MCP-SuperAssistant
 *
 * This file implements the toggle buttons for MCP functionality on the T3 Chat website:
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

// Keep T3 Chat-specific functions or overrides
function findT3ChatButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
  // Based on the provided HTML, we're looking for the button container in the message actions div
  const buttonsContainer = document.querySelector('div[aria-label="Message actions"]');
  if (buttonsContainer) {
    console.debug('[T3 Chat Adapter] Found insertion point in message actions container');
    // Find the submit button to insert after
    const submitButton = buttonsContainer.querySelector('button[type="submit"]');
    return { container: buttonsContainer, insertAfter: submitButton || null };
  }

  // Fallback: Look for the div with flex row-reverse and justify-between
  const flexContainer = document.querySelector('div.-mb-px.mt-2.flex.w-full.flex-row-reverse.justify-between');
  if (flexContainer) {
    console.debug('[T3 Chat Adapter] Found insertion point in flex container');
    // Try to find the first div inside it
    const firstDiv = flexContainer.querySelector('div');
    return { container: flexContainer, insertAfter: firstDiv || null };
  }

  // Another fallback: Look for any container near the textarea
  const chatInput = document.querySelector('#chat-input');
  if (chatInput) {
    console.debug('[T3 Chat Adapter] Found insertion point near chat input (fallback)');
    // Try to find a parent container
    const parentContainer = chatInput.closest('div');
    return { container: parentContainer || document.body, insertAfter: null };
  }

  console.warn('[T3 Chat Adapter] Could not find a suitable insertion point.');
  return null;
}

// T3 Chat-specific sidebar handling (if different from common)
function showT3ChatSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[T3 Chat Adapter] MCP Enabled - Showing sidebar');
  if (adapter?.showSidebarWithToolOutputs) {
    adapter.showSidebarWithToolOutputs();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback
  } else {
    console.warn('[T3 Chat Adapter] No method found to show sidebar.');
  }
}

function hideT3ChatSidebar(adapter: SimpleSiteAdapter | null): void {
  console.debug('[T3 Chat Adapter] MCP Disabled - Hiding sidebar');
  if (adapter?.hideSidebar) {
    adapter.hideSidebar();
  } else if (adapter?.sidebarManager?.hide) {
    adapter.sidebarManager.hide();
  } else if (adapter?.toggleSidebar) {
    adapter.toggleSidebar(); // Fallback (might show if already hidden)
  } else {
    console.warn('[T3 Chat Adapter] No method found to hide sidebar.');
  }
}

// T3 Chat-specific URL key generation (if different from default)
function getT3ChatURLKey(): string {
  // T3 Chat might not need complex keys, maybe just a constant
  return 't3_chat'; // Or derive from URL if needed
}

// T3 Chat Adapter Configuration
const t3chatAdapterConfig: AdapterConfig = {
  adapterName: 'T3ChatAdapter',
  storageKeyPrefix: 'mcp-t3chat-state', // Use chrome.storage, so prefix is enough
  findButtonInsertionPoint: findT3ChatButtonInsertionPoint,
  getStorage: () => chrome.storage.local, // T3 Chat uses chrome.storage.local
  getCurrentURLKey: getT3ChatURLKey, // Use T3 Chat-specific key generation
  onMCPEnabled: showT3ChatSidebar,
  onMCPDisabled: hideT3ChatSidebar,
  // insertToggleButtons: customInsertFunction, // Optional: If common insertion doesn't work
  // updateUI: customUpdateUI, // Optional: If specific UI updates needed beyond popover
};

// Initialize T3 Chat components using the common initializer
export function initT3ChatComponents(): void {
  console.debug('Initializing T3 Chat MCP components using common framework');
  // The initializeAdapter function handles state loading, button insertion, listeners etc.
  const stateManager = initializeAdapter(t3chatAdapterConfig);

  // Expose manual injection for debugging (optional, uses adapter name)
  window.injectMCPButtons = () => {
    console.debug('Manual injection for T3 Chat triggered');
    // Use the specific function exposed by initializeAdapter if needed, or re-call init
    const insertFn = (window as any)[`injectMCPButtons_${t3chatAdapterConfig.adapterName}`];
    if (insertFn) {
      insertFn();
    } else {
      console.warn('Manual injection function not found.');
    }
  };

  console.debug('T3 Chat MCP components initialization complete.');
}
