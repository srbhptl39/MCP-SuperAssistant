/**
 * Perplexity Pattern-based Unified Observer
 *
 * This file implements a pattern-based unified observer for Perplexity that
 * extends the new base unified observer to detect tool commands based on
 * text patterns rather than CSS selectors.
 */

import { logMessage } from '@src/utils/helpers';
import type { DetectedToolCommand } from '@src/components/common/unifiedPatternObserver';
import { BaseUnifiedObserver, TOOL_COMMAND_TYPE } from '@src/components/common/unifiedPatternObserver';
import type { SiteAdapter } from '@src/utils/siteAdapter';
import type { ToolOutputHandler } from '@src/components/sidebar';
import type { DetectedTool } from '@src/utils/toolDetector';

/**
 * Perplexity Pattern-based Unified Observer class
 */
export class PerplexityPatternUnifiedObserver extends BaseUnifiedObserver {
  /**
   * Constructor for PerplexityPatternUnifiedObserver
   * @param adapter Site adapter for Perplexity
   * @param toolOutputHandler Tool output handler
   */
  constructor(adapter: SiteAdapter, toolOutputHandler: ToolOutputHandler) {
    super('perplexity', adapter, toolOutputHandler);
    logMessage('PerplexityPatternUnifiedObserver initialized');
  }

  /**
   * Handle detected tool commands
   * @param toolCommand The detected tool command
   */
  protected handleDetectedTool(toolCommand: DetectedToolCommand): void {
    logMessage(`Detected tool: ${toolCommand.toolName} on server ${toolCommand.serverName}`);

    // Store the detected command for later use
    // The sidebar will access these when refreshContent() is called

    // Create a DetectedTool object to update the tool detector
    const detectedTool: DetectedTool = {
      id: `tool-${toolCommand.id}`,
      name: toolCommand.toolName,
      args: toolCommand.arguments || {},
    };

    // Get all detected tools and add the new one
    const toolDetector = this.adapter.getToolDetector();
    toolDetector.onDetect(currentTools => {
      // Since we can't directly update the tools, we'll add a custom event
      // that will be handled by the adapter's handleMcpToolDetected method
      window.dispatchEvent(
        new CustomEvent<{ tool: DetectedTool; domPosition: number }>('mcpToolDetected', {
          detail: {
            tool: detectedTool,
            domPosition: toolCommand.domIndex, // Include DOM position information
          },
        }),
      );
    });

    // Dispatch event for tool detection
    window.dispatchEvent(
      new CustomEvent('mcpToolsUpdated', {
        detail: {
          toolName: toolCommand.toolName,
          serverName: toolCommand.serverName,
          arguments: toolCommand.arguments,
        },
      }),
    );
  }
}

/**
 * Factory function to create a PerplexityPatternUnifiedObserver
 * @param adapter The Perplexity site adapter
 * @param toolOutputHandler The tool output handler
 * @returns A new PerplexityPatternUnifiedObserver instance
 */
export const createPerplexityPatternObserver = (
  adapter: SiteAdapter,
  toolOutputHandler: ToolOutputHandler,
): PerplexityPatternUnifiedObserver => {
  return new PerplexityPatternUnifiedObserver(adapter, toolOutputHandler);
};
