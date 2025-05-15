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
import { DeepSeekAdapter } from './deepseekAdapter';

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
  AgentHustleAdapter,  // Keep AgentHustle
  DeepSeekAdapter      // Keep DeepSeek
];

// Adapter class instances mapped to their constructors and hostnames
interface AdapterInfo {
  AdapterClass: AdapterConstructor;
  hostnames: string[];
}

// Map adapter constructors with their hostnames
const adapterInfos: AdapterInfo[] = [
  { AdapterClass: PerplexityAdapter, hostnames: ['perplexity.ai'] },
  { AdapterClass: AiStudioAdapter, hostnames: ['aistudio.google.com'] },
  { AdapterClass: ChatGptAdapter, hostnames: ['chat.openai.com', 'chatgpt.com'] },
  { AdapterClass: GrokAdapter, hostnames: ['grok.x.ai'] },
  { AdapterClass: GeminiAdapter, hostnames: ['gemini.google.com'] },
  { AdapterClass: OpenRouterAdapter, hostnames: ['openrouter.ai'] },
  { AdapterClass: AgentHustleAdapter, hostnames: ['agenthustle.com'] },  // Keep AgentHustle
  { AdapterClass: DeepSeekAdapter, hostnames: ['chat.deepseek.com'] }   // Keep DeepSeek
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

// Initialize adapters relevant to the current URL
try {
  initializeRelevantAdapters().catch(error => {
    logMessage(`Async adapter initialization error: ${error instanceof Error ? error.message : String(error)}`);
  });
} catch (error) {
  logMessage(`Error starting adapter initialization: ${error instanceof Error ? error.message : String(error)}`);
  try {
    logMessage('Falling back to immediate Perplexity adapter initialization');
    initializeAdapter(PerplexityAdapter);
    initializationComplete = true;
  } catch (fallbackError) {
    logMessage(`Critical error: Even fallback adapter failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
  }
}

// Export getter functions for lazy-initializing adapters
export const perplexityAdapter = () => initializeAdapter(PerplexityAdapter);
export const aistudioAdapter = () => initializeAdapter(AiStudioAdapter);
export const chatGptAdapter = () => initializeAdapter(ChatGptAdapter);
export const grokAdapter = () => initializeAdapter(GrokAdapter);
export const geminiAdapter = () => initializeAdapter(GeminiAdapter);
export const openrouterAdapter = () => initializeAdapter(OpenRouterAdapter);
export const agentHustleAdapter = () => initializeAdapter(AgentHustleAdapter);  // Keep AgentHustle
export const deepseekAdapter = () => initializeAdapter(DeepSeekAdapter);  // Keep DeepSeek