/**
 * Adapter Plugins Export Module
 * 
 * This file exports all available adapter plugins for the MCP-SuperAssistant.
 */

export { BaseAdapterPlugin } from './base.adapter';
export { DefaultAdapter } from './default.adapter';
export { ExampleForumAdapter } from './example-forum.adapter';
export { GeminiAdapter } from './gemini.adapter';
export { PerplexityAdapter } from './perplexity.adapter';

// Export types
export type { 
  AdapterPlugin, 
  AdapterConfig, 
  PluginRegistration,
  AdapterCapability,
  PluginContext 
} from '../plugin-types';
