/**
 * Grok Module
 *
 * This file exports all Grok-related functionality
 */

// Import local modules to ensure TypeScript recognizes them
import './PatternUnifiedObserver';
import './chatInputHandler';
import './markdownHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export tool output handler functions from common
export {
  processGrokToolOutputElement as processToolOutputElement,
  getGrokProcessedToolOutputs as getProcessedToolOutputs,
  clearGrokProcessedToolOutputs as clearProcessedToolOutputs,
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

// Export all functions from the grok module
export * from './chatInputHandler';
export * from './markdownHandler';
export * from './PatternUnifiedObserver';

// Export the new pattern-based observer
export { GrokPatternUnifiedObserver, createGrokPatternObserver } from './PatternUnifiedObserver';
