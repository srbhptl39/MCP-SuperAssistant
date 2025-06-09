// OpenRouter website components for MCP-SuperAssistant
// Provides toggle buttons (MCP, Auto Insert, Auto Submit, Auto Execute) and state management

import type {
  AdapterConfig,
  SimpleSiteAdapter, // Assuming SimpleSiteAdapter might be needed for callbacks
} from './common';
import {
  initializeAdapter, // Assuming SimpleSiteAdapter might be needed for callbacks
} from './common';

// --- OpenRouter Specific Functions ---

// Placeholder: Find where to insert the MCP button in the OpenRouter UI
function findOpenRouterButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
  // Selector for the container div holding the buttons
  const containerSelector = '.relative.flex.w-full.min-w-0.px-1.py-1';
  const container = document.querySelector(containerSelector);

  if (container) {
    // Selector for the 'Web Search' button
    const webSearchButtonSelector = 'button[title="Enable Web Search"]';
    const webSearchButton = container.querySelector(webSearchButtonSelector);

    if (webSearchButton) {
      console.log('[OpenRouter Adapter] Found insertion point after Web Search button.');
      return { container: container, insertAfter: webSearchButton };
    } else {
      console.warn(
        '[OpenRouter Adapter] Found container, but could not find Web Search button. Appending to container.',
      );
      // Fallback: Append to the container if the specific button isn't found
      return { container: container, insertAfter: null };
    }
  }

  console.warn(`[OpenRouter Adapter] Could not find insertion container: ${containerSelector}`);
  return null;
}

// Placeholder: Define actions when MCP is enabled (if any specific UI changes are needed)
function onOpenRouterMCPEnabled(adapter: SimpleSiteAdapter | null): void {
  console.log('[OpenRouter Adapter] MCP Enabled - Showing sidebar.');
  // Use the adapter's showSidebarWithToolOutputs method
  if (adapter?.showSidebarWithToolOutputs) {
    adapter.showSidebarWithToolOutputs();
  } else {
    console.warn('[OpenRouter Adapter] Could not find showSidebarWithToolOutputs() method on adapter.');
    // Optional Fallback: Try a generic toggle if specific method isn't available
    adapter?.toggleSidebar?.();
  }
}

// Placeholder: Define actions when MCP is disabled
function onOpenRouterMCPDisabled(adapter: SimpleSiteAdapter | null): void {
  console.log('[OpenRouter Adapter] MCP Disabled - Hiding sidebar.');
  // Use the adapter's sidebarManager to hide the sidebar, or a generic hide method
  if (adapter?.sidebarManager?.hide) {
    // Prefer direct hide if available on sidebarManager
    adapter.sidebarManager.hide();
  } else if (adapter?.hideSidebar) {
    // Fallback to a generic hideSidebar method on the adapter itself
    adapter.hideSidebar();
  } else {
    console.warn('[OpenRouter Adapter] Could not find a method to hide sidebar on adapter.');
    // Optional Fallback: Try a generic toggle if hide isn't available
    // adapter?.toggleSidebar?.(); // This might show it if it was already hidden
  }
}

// --- OpenRouter Adapter Configuration ---

const openRouterAdapterConfig: AdapterConfig = {
  adapterName: 'OpenRouter',
  storageKeyPrefix: 'mcp-openrouter-state', // Unique prefix for OpenRouter state
  findButtonInsertionPoint: findOpenRouterButtonInsertionPoint,
  getStorage: () => localStorage, // Assuming OpenRouter uses localStorage, adjust if not
  // getCurrentURLKey: Use default (pathname) unless OpenRouter needs specific URL handling
  onMCPEnabled: onOpenRouterMCPEnabled, // Optional: Add if specific actions needed
  onMCPDisabled: onOpenRouterMCPDisabled, // Optional: Add if specific actions needed
};

// --- Initialization ---

export function initOpenRouterComponents(): void {
  console.log('Initializing OpenRouter MCP components using common framework');
  const stateManager = initializeAdapter(openRouterAdapterConfig);

  // Optional: Expose manual injection for debugging
  (window as any).injectMCPButtons_OpenRouter = () => {
    console.log('Manual injection for OpenRouter triggered');
    const insertFn = (window as any)[`injectMCPButtons_${openRouterAdapterConfig.adapterName}`];
    if (insertFn) {
      insertFn();
    } else {
      console.warn('Manual injection function not found for OpenRouter.');
    }
  };

  console.log('OpenRouter MCP components initialization complete.');
}
