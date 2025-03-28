/**
 * Common Markdown Content Handler
 *
 * This file contains a base class for handling markdown content elements
 * that can be used across different site adapters.
 */

import { logMessage } from '../../utils/helpers';
import type { MarkdownExtractedContent, McpToolContent } from './markdownParser';
import { extractMarkdownContent } from './markdownParser';
import { markElement, isElementMarked } from '../../utils/elementTracker';

// Type constants
export const MCP_TOOL_TYPE = 'mcp-tool';
export const THINK_TYPE = 'think';

// Site type definition
export type SiteType = 'chatgpt' | 'perplexity' | 'grok' | 'x' | 'gemini' | 'aistudio' | string;

// Registry of site-specific handlers
const markdownHandlerRegistry: Record<SiteType, MarkdownHandler> = {};

// Map of hostnames to site types
const hostnameToSiteType: Record<string, SiteType> = {
  'chatgpt.com': 'chatgpt',
  'perplexity.ai': 'perplexity',
  'grok.com': 'grok',
  'x.com': 'x',
  'gemini.google.com': 'gemini',
  'aistudio.google.com': 'aistudio',
};

/**
 * Base class for markdown content handlers
 */
export class MarkdownHandler {
  protected processedMarkdownContents: MarkdownExtractedContent[] = [];
  protected siteType: SiteType;
  protected shouldDispatchMcpToolsUpdatedEvent: boolean;

  /**
   * Constructor for MarkdownHandler
   * @param siteType The type of site this handler is for
   * @param shouldDispatchMcpToolsUpdatedEvent Whether to dispatch an event when MCP tools are updated
   */
  constructor(siteType: SiteType, shouldDispatchMcpToolsUpdatedEvent: boolean = false) {
    this.siteType = siteType;
    this.shouldDispatchMcpToolsUpdatedEvent = shouldDispatchMcpToolsUpdatedEvent;
    logMessage(`Created MarkdownHandler for ${siteType}`);
  }

  /**
   * Register a site-specific markdown handler
   * @param siteType The type of site
   * @param handler The handler instance
   */
  static registerHandler(siteType: SiteType, handler: MarkdownHandler): void {
    markdownHandlerRegistry[siteType] = handler;
    logMessage(`Registered markdown handler for ${siteType}`);
  }

  /**
   * Get the handler for a specific site
   * @param siteType The type of site
   * @returns The handler instance for the site
   */
  static getHandler(siteType: SiteType): MarkdownHandler {
    const handler = markdownHandlerRegistry[siteType];
    if (!handler) {
      throw new Error(`No markdown handler registered for ${siteType}`);
    }
    return handler;
  }

  /**
   * Get the handler for the current site based on hostname
   * @returns The handler instance for the current site
   */
  static getHandlerForCurrentSite(): MarkdownHandler {
    const hostname = window.location.hostname;

    // Find the site type for the current hostname
    let siteType: SiteType | undefined;
    for (const [pattern, type] of Object.entries(hostnameToSiteType)) {
      if (hostname.includes(pattern)) {
        siteType = type;
        break;
      }
    }

    if (!siteType) {
      throw new Error(`No site type found for hostname: ${hostname}`);
    }

    try {
      return MarkdownHandler.getHandler(siteType);
    } catch (error) {
      // If no handler is registered for this site type, create a default one
      logMessage(`Creating default markdown handler for ${siteType}`);
      const handler = new MarkdownHandler(siteType);
      MarkdownHandler.registerHandler(siteType, handler);
      return handler;
    }
  }

  /**
   * Gets all processed markdown contents
   * @returns Array of processed markdown contents
   */
  getProcessedMarkdownContents(): MarkdownExtractedContent[] {
    return [...this.processedMarkdownContents];
  }

  /**
   * Clears the list of processed markdown contents
   */
  clearProcessedMarkdownContents(): void {
    this.processedMarkdownContents.length = 0;
    logMessage(`Cleared processed markdown contents for ${this.siteType}`);
  }

  /**
   * Gets all MCP tool contents from processed markdown
   */
  getMcpToolContents(): Array<McpToolContent & { timestamp: number; domIndex: number; uniqueId?: string }> {
    const result = this.processedMarkdownContents
      .filter(content => content.mcpToolContents && content.mcpToolContents.length > 0)
      .flatMap((content, contentIndex) => {
        // Use the stored domIndex directly instead of trying to find the element
        const domIndex = content.domIndex || -1;

        // Map each tool content in the array to include timestamp and domIndex
        return content.mcpToolContents!.map((toolContent, toolIndex) => {
          const baseResult = {
            ...toolContent,
            timestamp: content.timestamp,
            domIndex,
          };

          // Add uniqueId if the subclass implementation needs it
          this.addUniqueId(baseResult, content.elementId, toolIndex);

          return baseResult;
        });
      });

    // Log the MCP tools we're returning, with their DOM indices
    if (result.length > 0) {
      logMessage(`Returning ${result.length} MCP tools with DOM indices: ${result.map(r => r.domIndex).join(', ')}`);
    }

    return result;
  }

  /**
   * Process a markdown element
   * @param element The element to process
   * @param domIndex The DOM index of the element
   */
  processMarkdownElement(element: Element, domIndex: number): void {
    // Skip if already processed
    if (isElementMarked(element, MCP_TOOL_TYPE)) {
      return;
    }

    // Mark the element with a unique ID
    const elementId = markElement(element, MCP_TOOL_TYPE);

    // Extract markdown content
    const markdownContent = extractMarkdownContent(element);
    if (markdownContent) {
      // Set the elementId to ensure we can find it later
      markdownContent.elementId = elementId;

      // Store the DOM index directly in the content object
      markdownContent.domIndex = domIndex;

      // Add to processed contents
      this.processedMarkdownContents.push(markdownContent);

      // Log the number of MCP tool contents found
      const toolCount = markdownContent.mcpToolContents?.length || 0;
      if (toolCount > 0) {
        logMessage(
          `Processed markdown content with ${toolCount} MCP tool blocks (ID: ${elementId}, DOM index: ${domIndex})`,
        );
      } else {
        logMessage(`Processed markdown content (ID: ${elementId}, DOM index: ${domIndex})`);
      }

      // Notify that MCP tools have been updated
      this.notifyMcpToolsUpdated();
    }
  }

  /**
   * Add a unique ID to the tool content if needed
   * This is a hook for subclasses to override
   */
  protected addUniqueId(
    toolContent: McpToolContent & { timestamp: number; domIndex: number; uniqueId?: string },
    elementId: string,
    toolIndex: number,
  ): void {
    // Default implementation does nothing
  }

  /**
   * Notify that MCP tools have been updated
   * This is a hook for subclasses to override
   */
  protected notifyMcpToolsUpdated(): void {
    // Dispatch a custom event if configured to do so
    if (this.shouldDispatchMcpToolsUpdatedEvent) {
      window.dispatchEvent(new CustomEvent('mcpToolsUpdated'));
      logMessage(`Dispatched mcpToolsUpdated event from ${this.siteType} MarkdownHandler`);
    }
  }
}

// For backward compatibility, re-export the base class as BaseMarkdownHandler
export { MarkdownHandler as BaseMarkdownHandler };

/**
 * Process a markdown element using the appropriate handler for the current site
 * @param element The element to process
 * @param domIndex The DOM index of the element
 */
export const processMarkdownElement = (element: Element, domIndex: number): void => {
  const handler = MarkdownHandler.getHandlerForCurrentSite();
  handler.processMarkdownElement(element, domIndex);
};

/**
 * Get processed markdown contents using the appropriate handler for the current site
 * @returns Array of processed markdown contents
 */
export const getProcessedMarkdownContents = (): MarkdownExtractedContent[] => {
  const handler = MarkdownHandler.getHandlerForCurrentSite();
  return handler.getProcessedMarkdownContents();
};

/**
 * Clear processed markdown contents using the appropriate handler for the current site
 */
export const clearProcessedMarkdownContents = (): void => {
  const handler = MarkdownHandler.getHandlerForCurrentSite();
  handler.clearProcessedMarkdownContents();
};

/**
 * Get MCP tool contents using the appropriate handler for the current site
 * @returns Array of MCP tool contents
 */
export const getMcpToolContents = (): Array<
  McpToolContent & { timestamp: number; domIndex: number; uniqueId?: string }
> => {
  const handler = MarkdownHandler.getHandlerForCurrentSite();
  return handler.getMcpToolContents();
};
