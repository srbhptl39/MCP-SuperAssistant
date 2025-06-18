/**
 * Adapter Plugins Export Module
 * 
 * This file exports all available adapter plugins for the MCP-SuperAssistant.
 */

export { BaseAdapterPlugin } from './base.adapter';
export { DefaultAdapter } from './default.adapter';
export { ExampleForumAdapter } from './example-forum.adapter';
export { GeminiAdapter } from './gemini.adapter';
export { GrokAdapter } from './grok.adapter';
export { PerplexityAdapter } from './perplexity.adapter';
export { AIStudioAdapter } from './aistudio.adapter';
export { OpenRouterAdapter } from './openrouter.adapter';
export { DeepSeekAdapter } from './deepseek.adapter';
export { T3ChatAdapter } from './t3chat.adapter';
export { MistralAdapter } from './mistral.adapter';


// Export types
export type { 
  AdapterPlugin, 
  AdapterConfig, 
  PluginRegistration,
  AdapterCapability,
  PluginContext 
} from '../plugin-types';
