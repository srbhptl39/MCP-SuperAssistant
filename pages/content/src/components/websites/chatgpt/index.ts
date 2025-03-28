/**
 * ChatGPT Module
 *
 * This file exports all ChatGPT-related functionality
 */

// export * from './selectors';
// toolcallParser is now imported from common
// toolOutputHandler is now imported from common
// markdownParser is now imported from common
// markdownHandler is now imported from common
export * from './PatternUnifiedObserver';
export * from './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export tool output handler functions from common
export {
  processChatGptToolOutputElement as processToolOutputElement,
  getChatGptProcessedToolOutputs as getProcessedToolOutputs,
  clearChatGptProcessedToolOutputs as clearProcessedToolOutputs,
} from '@src/components/common/toolOutputHandler';

// Export markdown handler functions from common
export {
  processMarkdownElement,
  getProcessedMarkdownContents,
  clearProcessedMarkdownContents,
  getMcpToolContents,
  MCP_TOOL_TYPE,
  THINK_TYPE,
} from '@src/components/common/markdownHandler';

// Export the unified observer as the preferred method for observing elements
// export { observeAllElements, ChatGptPatternUnifiedObserver } from './PatternUnifiedObserver';

// Export all functions from the chatgpt module
export * from './chatInputHandler';
export * from './markdownHandler';
export * from './PatternUnifiedObserver';

// Export the new pattern-based observer
export { ChatGptPatternUnifiedObserver, createChatGptPatternObserver } from './PatternUnifiedObserver';
