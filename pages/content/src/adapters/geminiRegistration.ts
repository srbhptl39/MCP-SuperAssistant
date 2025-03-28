/**
 * Gemini Adapter Registration
 *
 * This file specifically registers the Gemini adapter
 */

import { registerSiteAdapter } from '../utils/siteAdapter';
import { adapterRegistry } from './adapterRegistry';
import { GeminiAdapter } from './geminiAdapter';
import { logMessage } from '../utils/helpers';

// Create and register the Gemini adapter
export function registerGeminiAdapter() {
  try {
    logMessage('Attempting to register Gemini adapter...');
    const geminiAdapter = new GeminiAdapter();
    
    // Log detailed information
    logMessage(`Creating Gemini adapter with name: ${geminiAdapter.name}`);
    logMessage(`Gemini adapter hostname: ${JSON.stringify(geminiAdapter.hostname)}`);
    
    // Register with both systems
    registerSiteAdapter(geminiAdapter);
    adapterRegistry.registerAdapter(geminiAdapter);
    
    logMessage('Gemini adapter registered successfully!');
    return geminiAdapter;
  } catch (error) {
    logMessage(`ERROR registering Gemini adapter: ${error}`);
    console.error('Error registering Gemini adapter:', error);
    return null;
  }
} 