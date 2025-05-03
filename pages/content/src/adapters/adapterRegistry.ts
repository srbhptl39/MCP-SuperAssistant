/**
 * Adapter Registry
 *
 * This file defines a registry for managing site adapters and provides a hook
 * to access the appropriate adapter based on the current hostname and URL.
 *
 * It also exposes the current adapter globally for any component to access.
 */

import type { SiteAdapter } from '../utils/siteAdapter';
import { logMessage } from '../utils/helpers';

// Do not declare Window interface properties here - they will be defined at runtime
// This avoids TypeScript errors about conflicting declarations

// Interface for the adapter registry
interface AdapterRegistry {
  getAdapter(hostname: string, url?: string): SiteAdapter | undefined;
}

// Implementation of the adapter registry
class AdapterRegistryImpl implements AdapterRegistry {
  private adapters: Map<string, SiteAdapter> = new Map();
  private hostnameCache: Map<string, Map<string, SiteAdapter | null>> = new Map();

  // Register a new adapter
  registerAdapter(adapter: SiteAdapter): void {
    const hostnames = Array.isArray(adapter.hostname) ? adapter.hostname : [adapter.hostname];
    if (!hostnames.length) {
      logMessage('Cannot register adapter: no hostnames provided');
      return;
    }

    for (const hostname of hostnames) {
      if (this.adapters.has(hostname)) {
        logMessage(`Adapter for hostname ${hostname} already registered, replacing...`);
      }

      this.adapters.set(hostname, adapter);
      logMessage(`Registered adapter for hostname: ${hostname}`);
    }

    // Clear the cache when a new adapter is registered
    this.hostnameCache.clear();
  }

  // Retrieve an adapter by hostname and optional URL
  getAdapter(hostname: string, url: string = window.location.href): SiteAdapter | undefined {
    // Check if we have a cached result for this hostname+url combination
    const hostnameCache = this.hostnameCache.get(hostname);
    if (hostnameCache) {
      const cachedAdapter = hostnameCache.get(url);
      if (cachedAdapter !== undefined) {
        return cachedAdapter || undefined;
      }
    }

    // 1. Try direct hostname match first (fastest path)
    let adapter = this.adapters.get(hostname);

    // 2. If direct match found, check URL patterns
    if (adapter && adapter.urlPatterns && adapter.urlPatterns.length > 0) {
      const matchesUrlPattern = adapter.urlPatterns.some(pattern => pattern.test(url));
      if (!matchesUrlPattern) {
        adapter = undefined; // URL pattern didn't match
      }
    }

    // 3. If no direct match or URL pattern didn't match, try flexible matching
    if (!adapter) {
      adapter = this.findAdapterWithFlexibleMatching(hostname, url);
    }

    // Cache the result
    if (!hostnameCache) {
      this.hostnameCache.set(hostname, new Map());
    }
    this.hostnameCache.get(hostname)?.set(url, adapter || null);

    return adapter;
  }

  // Helper method for flexible hostname matching
  private findAdapterWithFlexibleMatching(hostname: string, url: string): SiteAdapter | undefined {
    // Remove 'www.' from the hostname for comparison
    const hostnameNoWww = hostname.replace(/^www\./, '');

    // Try to find an adapter that matches the hostname with flexible rules
    for (const [adapterHostname, adapterInstance] of this.adapters.entries()) {
      const adapterHostnameNoWww = adapterHostname.replace(/^www\./, '');

      // Check if hostnames match with various patterns
      const hostnameMatches =
        hostname.includes(adapterHostname) ||
        hostname.includes(adapterHostnameNoWww) ||
        hostnameNoWww.includes(adapterHostname) ||
        hostnameNoWww.includes(adapterHostnameNoWww);

      if (hostnameMatches) {
        // Check URL patterns if they exist
        if (adapterInstance.urlPatterns && adapterInstance.urlPatterns.length > 0) {
          const matchesUrlPattern = adapterInstance.urlPatterns.some(pattern => pattern.test(url));
          if (!matchesUrlPattern) {
            continue; // Skip this adapter if URL pattern doesn't match
          }
        }

        return adapterInstance;
      }
    }

    return undefined;
  }

  // Get all registered adapters
  getAllAdapters(): SiteAdapter[] {
    // Use Set to deduplicate adapters that might be registered for multiple hostnames
    return Array.from(new Set(this.adapters.values()));
  }

  // Check if an adapter is registered for a hostname
  hasAdapter(hostname: string): boolean {
    return this.adapters.has(hostname);
  }

  // Remove an adapter by hostname
  removeAdapter(hostname: string): void {
    if (this.adapters.has(hostname)) {
      this.adapters.delete(hostname);
      logMessage(`Removed adapter for hostname: ${hostname}`);
    }
  }

  // Clear all registered adapters
  clearAdapters(): void {
    this.adapters.clear();
    logMessage('Cleared all registered adapters');
  }
}

// Singleton instance of the adapter registry
export const adapterRegistry = new AdapterRegistryImpl();
logMessage('Adapter registry initialized');

// Function to get the current adapter based on the current hostname and URL
export function getCurrentAdapter(): SiteAdapter | undefined {
  const hostname = window.location.hostname;
  const url = window.location.href;
  return adapterRegistry.getAdapter(hostname, url);
}

// Expose the getCurrentAdapter function globally
window.getCurrentAdapter = getCurrentAdapter;

// Hook to access the site adapter based on the current hostname
export function useSiteAdapter(): SiteAdapter {
  const hostname = window.location.hostname;
  const url = window.location.href;

  const adapter = adapterRegistry.getAdapter(hostname, url);

  if (!adapter) {
    logMessage(`No adapter found for hostname: ${hostname}`);
    throw new Error(`No adapter found for hostname: ${hostname}`);
  }

  return adapter;
}
