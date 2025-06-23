/**
 * Default configurations for adapters
 * Centralized exports for type-safe adapter configurations
 */

export * from './types';
export * from './config-manager';
export * from './gemini.config';
export * from './chatgpt.config';

// Re-export for easy access
export { adapterConfigManager as configManager } from './config-manager';
export { GEMINI_DEFAULT_CONFIG as geminiDefaults } from './gemini.config';
export { CHATGPT_DEFAULT_CONFIG as chatgptDefaults } from './chatgpt.config';
