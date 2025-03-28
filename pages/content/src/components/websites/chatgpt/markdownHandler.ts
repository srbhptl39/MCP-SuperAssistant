/**
 * ChatGPT Markdown Content Handler
 *
 * This file contains functions for finding and processing markdown content elements on chatgpt.com
 */

import { logMessage } from '@src/utils/helpers';
// import { MARKDOWN_CONTENT_SELECTOR, TOOL_CALL_SELECTOR } from './selectors';
import type { McpToolContent } from '@src/components/common/markdownParser';
import { MarkdownHandler, MCP_TOOL_TYPE, THINK_TYPE } from '@src/components/common/markdownHandler';

// Singleton instance
let instance: ChatGptMarkdownHandler | null = null;

/**
 * ChatGPT-specific markdown handler
 */
export class ChatGptMarkdownHandler extends MarkdownHandler {
  /**
   * Get the singleton instance
   */
  static getInstance(): ChatGptMarkdownHandler {
    if (!instance) {
      // Create a new instance with ChatGPT-specific configuration
      instance = new ChatGptMarkdownHandler('chatgpt', true);
      // Register the instance with the registry
      MarkdownHandler.registerHandler('chatgpt', instance);
      logMessage('ChatGptMarkdownHandler instance created and registered');
    }
    return instance;
  }

  /**
   * Add a unique ID to the tool content
   * ChatGPT implementation adds a uniqueId property
   */
  protected addUniqueId(
    toolContent: McpToolContent & { timestamp: number; domIndex: number; uniqueId?: string },
    elementId: string,
    toolIndex: number,
  ): void {
    // Generate a unique ID that includes the element ID, tool index, and timestamp
    toolContent.uniqueId = `chatgpt-${elementId}-${toolIndex}-${Date.now()}`;
    logMessage(`Added unique ID ${toolContent.uniqueId} to ChatGPT MCP tool ${toolContent.toolName}`);
  }
}

// Create the singleton instance
const markdownHandler = ChatGptMarkdownHandler.getInstance();

// Export functions that use the singleton
export const processMarkdownElement = (element: Element, domIndex: number): void =>
  markdownHandler.processMarkdownElement(element, domIndex);

export const getProcessedMarkdownContents = () => markdownHandler.getProcessedMarkdownContents();

export const clearProcessedMarkdownContents = () => markdownHandler.clearProcessedMarkdownContents();

export const getMcpToolContents = () => markdownHandler.getMcpToolContents();

// Re-export constants for convenience
export { MCP_TOOL_TYPE, THINK_TYPE };
