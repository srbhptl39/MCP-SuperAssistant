/**
 * Gemini Module
 *
 * This file exports all Gemini-related functionality
 */

import { logMessage } from '@src/utils/helpers';
import { GeminiMarkdownHandler } from './markdownHandler';
import { MarkdownHandler } from '@src/components/common/markdownHandler';

export * from './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export tool output handler functions from common
export {
  processGeminiToolOutputElement,
  getGeminiProcessedToolOutputs,
  clearGeminiProcessedToolOutputs,
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

// Export all functions from the Gemini module
export * from './markdownHandler';

// Export the pattern-based observer
export { GeminiPatternUnifiedObserver, createGeminiPatternObserver } from './PatternUnifiedObserver';

// Register the Gemini markdown handler
const geminiMarkdownHandler = new GeminiMarkdownHandler();
MarkdownHandler.registerHandler('gemini', geminiMarkdownHandler);
logMessage('Registered markdown handler for gemini');
