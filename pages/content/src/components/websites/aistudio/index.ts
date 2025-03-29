/**
 * AiStudio Module
 *
 * This file exports all aistudio-related functionality
 */

// toolcallParser is now imported from common
// toolOutputHandler is now imported from common
// markdownParser is now imported from common
// markdownHandler is now imported from common
// export * from './unifiedObserver';
export * from './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export tool output handler functions from common
export {
  processAiStudioToolOutputElement as processToolOutputElement,
  getAiStudioProcessedToolOutputs as getProcessedToolOutputs,
  clearAiStudioProcessedToolOutputs as clearProcessedToolOutputs,
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

// Export all functions from the aistudio module
export * from './chatInputHandler';
export * from './markdownHandler';
// export * from './unifiedObserver';

// Export the new pattern-based observer
export { AiStudioPatternUnifiedObserver, createAiStudioPatternObserver } from './PatternUnifiedObserver';
