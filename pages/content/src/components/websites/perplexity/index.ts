/**
 * Perplexity Module
 *
 * This file exports all perplexity-related functionality
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
  processPerplexityToolOutputElement as processToolOutputElement,
  getPerplexityProcessedToolOutputs as getProcessedToolOutputs,
  clearPerplexityProcessedToolOutputs as clearProcessedToolOutputs,
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



// Export all functions from the perplexity module
export * from './chatInputHandler';
export * from './markdownHandler';
// export * from './unifiedObserver';

// Export the new pattern-based observer
export { PerplexityPatternUnifiedObserver, createPerplexityPatternObserver } from './PatternUnifiedObserver';
