/**
 * Grok Markdown Content Handler
 *
 * This file contains functions for finding and processing markdown content elements on grok.com
 */

import { logMessage } from '@src/utils/helpers';
import type { McpToolContent } from '@src/components/common/markdownParser';
import { MarkdownHandler, MCP_TOOL_TYPE, THINK_TYPE } from '@src/components/common/markdownHandler';

// Singleton instance
let instance: GrokMarkdownHandler | null = null;

/**
 * Grok-specific markdown handler
 */
export class GrokMarkdownHandler extends MarkdownHandler {
  /**
   * Get the singleton instance
   */
  static getInstance(): GrokMarkdownHandler {
    if (!instance) {
      // Create a new instance with Grok-specific configuration
      instance = new GrokMarkdownHandler('grok', true);
      // Register the instance with the registry
      MarkdownHandler.registerHandler('grok', instance);
      logMessage('GrokMarkdownHandler instance created and registered');
    }
    return instance;
  }

  /**
   * Add a unique ID to the tool content
   * Grok implementation adds a uniqueId property
   */
  protected addUniqueId(
    toolContent: McpToolContent & { timestamp: number; domIndex: number; uniqueId?: string },
    elementId: string,
    toolIndex: number,
  ): void {
    // Generate a unique ID that includes the element ID, tool index, and timestamp
    toolContent.uniqueId = `grok-${elementId}-${toolIndex}-${Date.now()}`;
    logMessage(`Added unique ID ${toolContent.uniqueId} to Grok MCP tool ${toolContent.toolName}`);
  }
}

// Create the singleton instance
const markdownHandler = GrokMarkdownHandler.getInstance();

// Export functions that use the singleton
export const processMarkdownElement = (element: Element, domIndex: number): void =>
  markdownHandler.processMarkdownElement(element, domIndex);
export const getProcessedMarkdownContents = () => markdownHandler.getProcessedMarkdownContents();
export const clearProcessedMarkdownContents = () => markdownHandler.clearProcessedMarkdownContents();
export const getMcpToolContents = () => markdownHandler.getMcpToolContents();

// Re-export constants for convenience
export { MCP_TOOL_TYPE, THINK_TYPE };
