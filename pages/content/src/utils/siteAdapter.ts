/**
 * Site Adapter
 *
 * This file defines a common interface for site-specific adapters
 * to make the extension more extensible for supporting multiple websites.
 */

import { logMessage } from './helpers';

// Interface for site-specific adapters
// Interface for the tool detector observer
export interface ToolDetector {
  onDetect(callback: (tools: any[]) => void): void;
  disconnect(): void;
  getTools(): any[];
  updateTools(tools: any[]): void;
}

export interface SiteAdapter {
  name: string;
  // Support either a single hostname or an array of hostnames
  hostname: string | string[];
  // Optional URL patterns for specific path matching
  urlPatterns?: RegExp[];
  initialize(): void;
  cleanup(): void;
  forceRescan(): void;
  toggleSidebar(): void;
  showSidebarWithToolOutputs(): void;
  refreshSidebarContent(): void;
  updateConnectionStatus(isConnected: boolean): void;
  // Method to get a tool detector observer
  getToolDetector(): ToolDetector;
  // Method to insert text into the input field
  insertTextIntoInput(text: string): void;
  // Method to trigger form submission
  triggerSubmission(): void;
  // Method to check if file upload is supported
  supportsFileUpload(): boolean;
  // Method to attach a file to the chat input
  attachFile(file: File): Promise<boolean>;
  // Method to get elements that may contain tool commands
  getToolCommandElements(root?: Element): Element[];
}

// Registry of all site adapters
const siteAdapters: SiteAdapter[] = [];

/**
 * Register a site adapter
 */
export function registerSiteAdapter(adapter: SiteAdapter): void {
  siteAdapters.push(adapter);
  logMessage(`Registered site adapter for ${adapter.name}`);
}

/**
 * Get the appropriate site adapter for the current hostname and URL
 */
export function getSiteAdapter(): SiteAdapter | null {
  const currentHostname = window.location.hostname;
  const currentUrl = window.location.href;
  logMessage(`Looking for adapter for hostname: ${currentHostname} and URL: ${currentUrl}`);

  // Log all registered adapters for debugging
  const adapterHostnames = siteAdapters.map(adapter => 
    Array.isArray(adapter.hostname) ? adapter.hostname.join(', ') : adapter.hostname
  ).join('; ');
  logMessage(`Current registered adapters: ${adapterHostnames}`);

  for (const adapter of siteAdapters) {
    // Check for URL pattern match first
    if (adapter.urlPatterns && adapter.urlPatterns.length > 0) {
      const matchesUrlPattern = adapter.urlPatterns.some(pattern => pattern.test(currentUrl));
      if (!matchesUrlPattern) {
        continue; // Skip this adapter if URL pattern doesn't match
      }
      logMessage(`URL pattern match for ${adapter.name}`);
    }

    // Check hostname match
    let hostnameMatch = false;
    const hostnames = Array.isArray(adapter.hostname) ? adapter.hostname : [adapter.hostname];
    
    for (const hostname of hostnames) {
      const adapterHostnameNoWww = hostname.replace(/^www\./, '');
      const currentHostnameNoWww = currentHostname.replace(/^www\./, '');

      if (
        currentHostname.includes(hostname) ||
        currentHostname.includes(adapterHostnameNoWww) ||
        currentHostnameNoWww.includes(hostname)
      ) {
        hostnameMatch = true;
        break;
      }
    }

    if (hostnameMatch) {
      logMessage(`Found site adapter for ${adapter.name}`);
      return adapter;
    }
  }

  logMessage(`No adapter found for hostname: ${currentHostname}`);
  return null;
}

/**
 * Initialize the appropriate site adapter for the current website
 */
export function initializeSiteAdapter(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    logMessage(`Initializing site adapter for ${adapter.name}`);
    adapter.initialize();
  }
}

/**
 * Force rescan using the appropriate site adapter
 */
export function forceSiteRescan(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    logMessage(`Forcing rescan with site adapter for ${adapter.name}`);
    adapter.forceRescan();
  }
}

/**
 * Toggle sidebar using the appropriate site adapter
 */
export function toggleSiteSidebar(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    adapter.toggleSidebar();
  }
}

/**
 * Show sidebar with tool outputs using the appropriate site adapter
 */
export function showSiteSidebarWithToolOutputs(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    logMessage(`Showing sidebar with tool outputs for ${adapter.name}`);
    adapter.showSidebarWithToolOutputs();
  }
}

/**
 * Update connection status using the appropriate site adapter
 */
export function updateSiteConnectionStatus(isConnected: boolean): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    adapter.updateConnectionStatus(isConnected);
  }
}

/**
 * Clean up resources using the appropriate site adapter
 */
export function cleanupSiteAdapter(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    logMessage(`Cleaning up site adapter for ${adapter.name}`);
    adapter.cleanup();
  }
}

/**
 * Refresh the sidebar content using the appropriate site adapter
 */
export function refreshSiteSidebarContent(): void {
  const adapter = getSiteAdapter();

  if (adapter) {
    logMessage(`Refreshing sidebar content for ${adapter.name}`);
    adapter.refreshSidebarContent();
  }
}
