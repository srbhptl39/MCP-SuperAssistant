/**
 * AgentHustle Adapter Components
 * 
 * This file contains the AgentHustle-specific adapter components and configuration.
 */

import { logMessage } from '../../utils/helpers';
import type { AdapterConfig } from './common';
import { initializeAdapter } from './common';

// --- DOM Element Finders ---

function findAgentHustleButtonInsertionPoint(): Element | null {
  // Find the chat input container to insert the MCP toggle button
  const chatInput = document.querySelector('input.flex-1.rounded-lg.border.border-border.bg-card');
  if (chatInput) {
    return chatInput.parentElement;
  }
  return null;
}

// --- Event Handlers ---

function onAgentHustleMCPEnabled(adapter: any): void {
  logMessage('MCP enabled for AgentHustle');
  if (adapter?.sidebarManager?.show) {
    adapter.sidebarManager.show();
  }
}

function onAgentHustleMCPDisabled(adapter: any): void {
  logMessage('MCP disabled for AgentHustle');
  if (adapter?.sidebarManager?.hide) {
    adapter.sidebarManager.hide();
  }
}

function getAgentHustleURLKey(): string {
  // Generate a unique key for the current URL state
  // This helps track state across different chat sessions
  return window.location.pathname;
}

// --- Adapter Configuration ---

const agentHustleAdapterConfig: AdapterConfig = {
  adapterName: 'AgentHustle',
  storageKeyPrefix: 'mcp-agenthustle-state',
  findButtonInsertionPoint: findAgentHustleButtonInsertionPoint,
  getStorage: () => localStorage,
  getCurrentURLKey: getAgentHustleURLKey,
  onMCPEnabled: onAgentHustleMCPEnabled,
  onMCPDisabled: onAgentHustleMCPDisabled
};

// --- Initialization ---

export function initAgentHustleComponents(): void {
  logMessage('Initializing AgentHustle MCP components');
  const stateManager = initializeAdapter(agentHustleAdapterConfig);

  // Expose manual injection for debugging
  (window as any).injectMCPButtons_AgentHustle = () => {
    logMessage('Manual injection for AgentHustle triggered');
    const insertFn = (window as any)[`injectMCPButtons_${agentHustleAdapterConfig.adapterName}`];
    if (insertFn) {
      insertFn();
    } else {
      logMessage('Manual injection function not found for AgentHustle');
    }
  };

  logMessage('AgentHustle MCP components initialization complete');
} 