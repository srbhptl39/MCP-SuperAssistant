/**
 * ChatGPT Pattern-based Unified Observer
 *
 * This file implements a pattern-based unified observer for ChatGPT that
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
 * ChatGPT Pattern-based Unified Observer class
 */
export class ChatGptPatternUnifiedObserver extends BaseUnifiedObserver {
  /**
   * Constructor for ChatGptPatternUnifiedObserver
   * @param adapter Site adapter for ChatGPT
   * @param toolOutputHandler Tool output handler
   */
  constructor(adapter: SiteAdapter, toolOutputHandler: ToolOutputHandler) {
    super('chatgpt', adapter, toolOutputHandler);
    logMessage('ChatGptPatternUnifiedObserver initialized');
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
      // that will be handled by the ChatGptAdapter.handleMcpToolDetected method
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
 * Factory function to create a ChatGptPatternUnifiedObserver
 * @param adapter The ChatGPT site adapter
 * @param toolOutputHandler The tool output handler
 * @returns A new ChatGptPatternUnifiedObserver instance
 */
export const createChatGptPatternObserver = (
  adapter: SiteAdapter,
  toolOutputHandler: ToolOutputHandler,
): ChatGptPatternUnifiedObserver => {
  return new ChatGptPatternUnifiedObserver(adapter, toolOutputHandler);
};
