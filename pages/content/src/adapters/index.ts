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
import { AgentHustleAdapter } from './agenthustleAdapter';
import type { SiteAdapter } from '../utils/siteAdapter';

// Define type for adapter constructor
type AdapterConstructor = new () => SiteAdapter;

// Adapter class instances map
const adapterClasses: AdapterConstructor[] = [
  PerplexityAdapter,
  AiStudioAdapter,
  ChatGptAdapter,
  GrokAdapter,
  GeminiAdapter,
  OpenRouterAdapter,
  AgentHustleAdapter
];

// Register all adapters
adapterClasses.forEach(AdapterClass => {
  try {
    const adapter = new AdapterClass();
    adapterRegistry.registerAdapter(adapter);
  } catch (error) {
    logMessage(`Error registering adapter ${AdapterClass.name}: ${error}`);
  }
});

// Export all adapters
export {
  PerplexityAdapter,
  AiStudioAdapter,
  ChatGptAdapter,
  GrokAdapter,
  GeminiAdapter,
  OpenRouterAdapter,
  AgentHustleAdapter
};
