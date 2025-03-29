/**
 * Gemini Markdown Handler
 *
 * This file implements functions for processing markdown content in Gemini's responses
 */

import { logMessage } from '@src/utils/helpers';
import { markElement } from '@src/utils/elementTracker';
import { MarkdownHandler } from '@src/components/common/markdownHandler';
import {
  extractMcpToolContents,
  extractMarkdownContent,
  type MarkdownExtractedContent,
  type McpToolContent,
} from '@src/components/common/markdownParser';

/**
 * Gemini Markdown Handler implementation
 */
export class GeminiMarkdownHandler extends MarkdownHandler {
  constructor() {
    // Enable dispatching mcpToolsUpdated events
    super('gemini', true);
    logMessage('GeminiMarkdownHandler instance created');
  }
}

/**
 * Process a markdown element in Gemini's responses
 * This will extract MCP tool content and track the element
 * @param element The element to process
 * @param domIndex The index of the element in the DOM
 */
export function processMarkdownElement(element: Element, domIndex: number): void {
  logMessage(`Processing markdown element in Gemini at index ${domIndex}`);

  // Use the MarkdownHandler from common to process this element
  const handler = MarkdownHandler.getHandlerForCurrentSite();
  handler.processMarkdownElement(element, domIndex);
}
