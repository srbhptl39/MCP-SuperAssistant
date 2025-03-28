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
import { registerGeminiAdapter } from './geminiRegistration';

// Create and register the Perplexity adapter
const perplexityAdapter = new PerplexityAdapter();
registerSiteAdapter(perplexityAdapter);
adapterRegistry.registerAdapter(perplexityAdapter);
logMessage(`Registering adapter for hostname: ${perplexityAdapter.hostname}`);

// Create and register the AiStudio adapter
const aistudioAdapter = new AiStudioAdapter();
registerSiteAdapter(aistudioAdapter);
adapterRegistry.registerAdapter(aistudioAdapter);
logMessage(`Registering adapter for hostname: ${aistudioAdapter.hostname}`);

// Create and register the ChatGPT adapter
const chatGptAdapter = new ChatGptAdapter();
registerSiteAdapter(chatGptAdapter);
adapterRegistry.registerAdapter(chatGptAdapter);
logMessage(`Registering adapter for hostname: ${chatGptAdapter.hostname}`);

// Create and register the Grok adapter
const grokAdapter = new GrokAdapter();
registerSiteAdapter(grokAdapter);
adapterRegistry.registerAdapter(grokAdapter);
logMessage(`Registering adapter for hostname: ${grokAdapter.hostname}`);

// Create and register the Gemini adapter using the dedicated function
const geminiAdapter = registerGeminiAdapter();

// Export all adapters
export { perplexityAdapter, aistudioAdapter, chatGptAdapter, grokAdapter, geminiAdapter };
