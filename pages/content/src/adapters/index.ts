/**
 * Site Adapters
 *
 * This file exports all site adapters and registers them with the adapter registry.
 */

import { registerSiteAdapter } from '../utils/siteAdapter';
import { adapterRegistry } from './adapterRegistry';
import { PerplexityAdapter } from './perplexityAdapter';
import { AiStudioAdapter } from './aistudioAdapter';
import { ChatGptAdapter } from './chatgptAdapter';
import { GrokAdapter } from './grokAdapter';
import { logMessage } from '../utils/helpers';
import { GeminiAdapter } from './geminiAdapter';
import { OpenRouterAdapter } from './openrouterAdapter';
import type { SiteAdapter } from '../utils/siteAdapter';
import { DeepSeekAdapter } from './deepseekAdapter';
import { KagiAdapter } from './kagiAdapter';
import { T3ChatAdapter } from './t3chatAdapter';
import { SciraAdapter } from './sciraAdapter'; // Import SciraAdapter

// Define type for adapter constructor
type AdapterConstructor = new () => SiteAdapter;

// Adapter class instances mapped to their constructors and hostnames
interface AdapterInfo {
  AdapterClass: AdapterConstructor;
  hostnames: string[];
}

// Map adapter constructors with their hostnames to avoid creating instances prematurely
const adapterInfos: AdapterInfo[] = [
  { AdapterClass: PerplexityAdapter, hostnames: ['perplexity.ai'] },
  { AdapterClass: AiStudioAdapter, hostnames: ['aistudio.google.com'] },
  { AdapterClass: ChatGptAdapter, hostnames: ['chat.openai.com', 'chatgpt.com'] },
  { AdapterClass: GrokAdapter, hostnames: ['grok.x.ai'] },
  { AdapterClass: GeminiAdapter, hostnames: ['gemini.google.com'] },
  { AdapterClass: OpenRouterAdapter, hostnames: ['openrouter.ai'] },
  { AdapterClass: DeepSeekAdapter, hostnames: ['chat.deepseek.com'] },
  { AdapterClass: KagiAdapter, hostnames: ['kagi.com'] },
  { AdapterClass: T3ChatAdapter, hostnames: ['t3.chat'] },
  { AdapterClass: SciraAdapter, hostnames: ['scira.ai'] }, // Add SciraAdapter
];

// Map of adapter instances that will be lazily initialized
const adapterInstances = new Map<string, SiteAdapter>();

// Track initialization state
let isInitializing = false;
let initializationComplete = false;

/**
 * Gets the hostname from the current URL
 */
function getCurrentHostname(): string {
  return window.location.hostname;
}

/**
 * Gets the current full URL
 */
function getCurrentUrl(): string {
  return window.location.href;
}

/**
 * Initialize and register a specific adapter by name
 */
function initializeAdapter(AdapterClass: AdapterConstructor): SiteAdapter {
  const adapterName = AdapterClass.name;

  if (adapterInstances.has(adapterName)) {
    return adapterInstances.get(adapterName)!;
  }

  try {
    logMessage(`Initializing adapter: ${adapterName}`);
    const adapter = new AdapterClass();
    registerSiteAdapter(adapter);
    adapterRegistry.registerAdapter(adapter);
    logMessage(`Registered adapter for hostname: ${adapter.hostname}`);

    adapterInstances.set(adapterName, adapter);
    return adapter;
  } catch (error) {
    logMessage(`Error initializing adapter ${adapterName}: ${error instanceof Error ? error.message : String(error)}`);
    // Create a fallback if initialization fails to prevent crashes
    const fallbackAdapter = new AdapterClass();
    adapterInstances.set(adapterName, fallbackAdapter);
    return fallbackAdapter;
  }
}

/**
 * Determine which adapter(s) to initialize based on current URL
 * Returns a promise that resolves when initialization is complete
 */
async function initializeRelevantAdapters(): Promise<void> {
  // Prevent multiple concurrent initialization attempts
  if (isInitializing) {
    logMessage('Adapter initialization already in progress, waiting...');
    // Wait for initialization to complete
    return new Promise<void>(resolve => {
      const checkInterval = setInterval(() => {
        if (initializationComplete) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  // Set initialization flag
  isInitializing = true;

  try {
    const currentHostname = getCurrentHostname();
    const currentUrl = getCurrentUrl();
    logMessage(`Determining adapters for hostname: ${currentHostname} and URL: ${currentUrl}`);

    // For each adapter, check if it might apply to the current URL
    // without creating full instances
    let matchFound = false;
    let primaryAdapter: SiteAdapter | null = null;

    // First pass with lightweight hostname checking using predefined hostnames
    for (const { AdapterClass, hostnames } of adapterInfos) {
      // Simple hostname check without creating instances
      const mightMatch = hostnames.some(hostname => {
        const hostnameNoWww = hostname.replace(/^www\./, '');
        const currentHostnameNoWww = currentHostname.replace(/^www\./, '');

        return (
          currentHostname.includes(hostname) ||
          currentHostname.includes(hostnameNoWww) ||
          currentHostnameNoWww.includes(hostname)
        );
      });

      if (mightMatch) {
        // Initialize this adapter since the hostname matches
        const adapter = initializeAdapter(AdapterClass);
        if (!primaryAdapter) {
          primaryAdapter = adapter;
        }
        matchFound = true;
      }
    }

    // If no matches were found based on hostname, initialize all adapters as fallback
    if (!matchFound) {
      logMessage('No hostname matches found. Initializing all adapters as fallback.');
      for (const { AdapterClass } of adapterInfos) {
        const adapter = initializeAdapter(AdapterClass);
        if (!primaryAdapter) {
          primaryAdapter = adapter;
        }
      }

      // For sites without a specific adapter, use Perplexity adapter as fallback
      // since it has the most generic implementation
      primaryAdapter = initializeAdapter(PerplexityAdapter);
    }

    // Always ensure we have at least one adapter registered by using Perplexity as fallback
    if (!primaryAdapter) {
      logMessage('No primary adapter found. Using Perplexity adapter as fallback.');
      primaryAdapter = initializeAdapter(PerplexityAdapter);
    }

    // Ensure DOM is ready before initialization completes
    if (document.readyState !== 'complete') {
      await new Promise<void>(resolve => {
        window.addEventListener('load', () => resolve(), { once: true });
      });
    }
  } catch (error) {
    logMessage(`Error initializing adapters: ${error instanceof Error ? error.message : String(error)}`);
    // Fall back to initializing Perplexity adapter which has the most robust implementation
    try {
      logMessage('Falling back to Perplexity adapter only');
      initializeAdapter(PerplexityAdapter);
    } catch (fallbackError) {
      logMessage(
        `Critical error: Even fallback adapter failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }
  } finally {
    // Set initialization complete flag
    initializationComplete = true;
    isInitializing = false;
  }
}

// Initialize adapters relevant to the current URL
// Wrap this in a try-catch to ensure it doesn't crash the extension
try {
  // Use async initialization but don't wait for it to complete
  initializeRelevantAdapters().catch(error => {
    logMessage(`Async adapter initialization error: ${error instanceof Error ? error.message : String(error)}`);
  });
} catch (error) {
  logMessage(`Error starting adapter initialization: ${error instanceof Error ? error.message : String(error)}`);
  // Fall back to initializing Perplexity adapter which has the most robust implementation
  try {
    logMessage('Falling back to immediate Perplexity adapter initialization');
    initializeAdapter(PerplexityAdapter);
    initializationComplete = true;
  } catch (fallbackError) {
    logMessage(
      `Critical error: Even fallback adapter failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
    );
  }
}

// Export getter functions for adapters that will lazy-initialize them when requested
export const perplexityAdapter = () => initializeAdapter(PerplexityAdapter);
export const aistudioAdapter = () => initializeAdapter(AiStudioAdapter);
export const chatGptAdapter = () => initializeAdapter(ChatGptAdapter);
export const grokAdapter = () => initializeAdapter(GrokAdapter);
export const geminiAdapter = () => initializeAdapter(GeminiAdapter);
export const openrouterAdapter = () => initializeAdapter(OpenRouterAdapter);
export const deepseekAdapter = () => initializeAdapter(DeepSeekAdapter);
export const kagiAdapter = () => initializeAdapter(KagiAdapter);
export const t3chatAdapter = () => initializeAdapter(T3ChatAdapter);
export const sciraAdapter = () => initializeAdapter(SciraAdapter); // Export SciraAdapter getter
