/**
 * MCP-SuperAssistant Adapter Components
 *
 * This file exports the initialization functions for the adapter components
 * for different websites. The common logic is handled within the 'common.ts'
 * module and invoked by these initialization functions.
 */

// Export Grok components initializer
export { initGrokComponents } from './grok';

// Export Perplexity components initializer
export { initPerplexityComponents } from './perplexity';

// Export Gemini components initializer
export { initGeminiComponents } from './gemini';

// Export ChatGPT components initializer
export { initChatGPTComponents } from './chatgpt';

// Export AI Studio components initializer
export {
  initAIStudioComponents
} from './aistudio';

// Export DeepSeek components initializer
export {
  initDeepSeekComponents
} from './deepseek';

// Note: Functions like insertToggleButtons, handleAutoInsert, handleAutoSubmit
// are now part of the common framework and are not directly exported per adapter.
// The initialization functions configure and start the common framework for each site.
