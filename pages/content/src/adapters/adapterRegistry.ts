/**
 * Adapter Registry
 *
 * This file defines a registry for managing site adapters and provides a hook
 * to access the appropriate adapter based on the current hostname.
 */

import { SiteAdapter } from '../utils/siteAdapter';
import { logMessage } from '../utils/helpers';

// Interface for the adapter registry
interface AdapterRegistry {
  getAdapter(hostname: string, url?: string): SiteAdapter | undefined;
}

// Implementation of the adapter registry
class AdapterRegistryImpl implements AdapterRegistry {
  private adapters: Map<string, SiteAdapter> = new Map();

  // Register a new adapter
  registerAdapter(adapter: SiteAdapter): void {
    const hostnames = Array.isArray(adapter.hostname) ? adapter.hostname : [adapter.hostname];
    
    for (const hostname of hostnames) {
      logMessage(`Registering adapter for hostname: ${hostname}`);
      this.adapters.set(hostname, adapter);
    }
    
    logMessage(`Current registered adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
  }

  // Retrieve an adapter by hostname and optional URL
  getAdapter(hostname: string, url: string = window.location.href): SiteAdapter | undefined {
    logMessage(`Looking for adapter for hostname: ${hostname} and URL: ${url}`);
    logMessage(`Current registered adapters: ${Array.from(this.adapters.keys()).join(', ')}`);

    // Special case for Gemini
    // if (hostname.includes('gemini.google.com')) {
    //   logMessage('Special case: gemini.google.com detected');
    //   for (const [adapterHostname, adapterInstance] of this.adapters.entries()) {
    //     if (adapterHostname === 'gemini.google.com' || 
    //         (Array.isArray(adapterInstance.hostname) && 
    //          adapterInstance.hostname.includes('gemini.google.com'))) {
    //       logMessage(`Found Gemini adapter for hostname: ${hostname}`);
    //       return adapterInstance;
    //     }
    //   }
    // }

    // First try direct match
    let adapter = this.adapters.get(hostname);
    
    if (adapter) {
      logMessage(`Found direct match for hostname: ${hostname}`);
    }

    // If no direct match, try flexible matching
    if (!adapter) {
      // Remove 'www.' from the hostname for comparison
      const hostnameNoWww = hostname.replace(/^www\./, '');
      logMessage(`Trying flexible matching with hostname without www: ${hostnameNoWww}`);

      // Try to find an adapter that matches the hostname without 'www.'
      for (const [adapterHostname, adapterInstance] of this.adapters.entries()) {
        const adapterHostnameNoWww = adapterHostname.replace(/^www\./, '');
        logMessage(`Checking adapter hostname: ${adapterHostname} (without www: ${adapterHostnameNoWww})`);

        // Check if the current hostname includes the adapter's hostname
        // or if the adapter's hostname without 'www.' is included in the current hostname
        // or if the current hostname without 'www.' includes the adapter's hostname
        if (
          hostname.includes(adapterHostname) ||
          hostname.includes(adapterHostnameNoWww) ||
          hostnameNoWww.includes(adapterHostname) ||
          hostnameNoWww.includes(adapterHostnameNoWww)
        ) {
          logMessage(`Hostname match found: ${hostname} matches ${adapterHostname}`);
          
          // Check URL patterns if they exist
          if (adapterInstance.urlPatterns && adapterInstance.urlPatterns.length > 0) {
            const matchesUrlPattern = adapterInstance.urlPatterns.some(pattern => pattern.test(url));
            if (!matchesUrlPattern) {
              logMessage(`Hostname matched for ${adapterHostname} but URL pattern didn't match`);
              continue; // Skip this adapter if URL pattern doesn't match
            }
            logMessage(`URL pattern matched for ${adapterHostname}`);
          }
          
          adapter = adapterInstance;
          logMessage(`Found adapter for hostname: ${hostname} using flexible matching with ${adapterHostname}`);
          break;
        } else {
          logMessage(`No match between ${hostname} and ${adapterHostname}`);
        }
      }
    } else {
      // We found a direct match, but still need to check URL patterns
      if (adapter.urlPatterns && adapter.urlPatterns.length > 0) {
        const matchesUrlPattern = adapter.urlPatterns.some(pattern => pattern.test(url));
        if (!matchesUrlPattern) {
          logMessage(`Direct hostname match for ${hostname} but URL pattern didn't match`);
          adapter = undefined; // URL pattern didn't match
        } else {
          logMessage(`URL pattern matched for direct hostname match ${hostname}`);
        }
      }
    }

    if (adapter) {
      logMessage(`Found adapter for hostname: ${hostname}`);
    } else {
      logMessage(`No adapter found for hostname: ${hostname}`);
    }

    return adapter;
  }
}

// Singleton instance of the adapter registry
export const adapterRegistry = new AdapterRegistryImpl();
logMessage('Adapter registry initialized');

// Hook to access the site adapter based on the current hostname
export function useSiteAdapter(): SiteAdapter {
  const hostname = window.location.hostname;
  const url = window.location.href;
  logMessage(`useSiteAdapter called for hostname: ${hostname} and URL: ${url}`);

  const adapter = adapterRegistry.getAdapter(hostname, url);

  if (!adapter) {
    logMessage(
      `No adapter found for hostname: ${hostname}. Available adapters: ${Array.from(adapterRegistry['adapters'].keys()).join(', ')}`,
    );
    throw new Error(`No adapter found for hostname: ${hostname}`);
  }

  logMessage(`Using adapter for hostname: ${hostname}`);
  return adapter;
}
