/**
 * Perplexity Markdown Content Handler
 *
 * This file contains functions for finding and processing markdown content elements on perplexity.com
 */

import { logMessage } from '@src/utils/helpers';
import { McpToolContent } from '@src/components/common/markdownParser';
import { MarkdownHandler, MCP_TOOL_TYPE, THINK_TYPE } from '@src/components/common/markdownHandler';

// Singleton instance
let instance: PerplexityMarkdownHandler | null = null;

/**
 * Perplexity-specific markdown handler
 */
export class PerplexityMarkdownHandler extends MarkdownHandler {
  /**
   * Get the singleton instance
   */
  static getInstance(): PerplexityMarkdownHandler {
    if (!instance) {
      // Create a new instance with Perplexity-specific configuration
      instance = new PerplexityMarkdownHandler('perplexity', false);
      // Register the instance with the registry
      MarkdownHandler.registerHandler('perplexity', instance);
      logMessage('PerplexityMarkdownHandler instance created and registered');
    }
    return instance;
  }

  // Perplexity doesn't need to override any methods as it uses the default behavior
}

// Create the singleton instance
const markdownHandler = PerplexityMarkdownHandler.getInstance();

// Export functions that use the singleton
export const processMarkdownElement = (element: Element, domIndex: number): void =>
  markdownHandler.processMarkdownElement(element, domIndex);

export const getProcessedMarkdownContents = () => markdownHandler.getProcessedMarkdownContents();

export const clearProcessedMarkdownContents = () => markdownHandler.clearProcessedMarkdownContents();

export const getMcpToolContents = () => markdownHandler.getMcpToolContents();

// Re-export constants for convenience
export { MCP_TOOL_TYPE, THINK_TYPE };
