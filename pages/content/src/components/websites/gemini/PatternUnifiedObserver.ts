/**
 * Gemini Pattern Unified Observer
 *
 * This file implements a pattern-based observer for Gemini's DOM structure.
 */

import { logMessage } from '@src/utils/helpers';
import type { DetectedToolCommand } from '@src/components/common/unifiedPatternObserver';
import { BaseUnifiedObserver } from '@src/components/common/unifiedPatternObserver';
import type { SiteAdapter } from '@src/utils/siteAdapter';
import type { ToolOutputHandler } from '@src/components/sidebar';
import type { DetectedTool } from '@src/utils/toolDetector';

/**
 * Gemini Pattern-based Unified Observer class
 */
export class GeminiPatternUnifiedObserver extends BaseUnifiedObserver {
  /**
   * Constructor for GeminiPatternUnifiedObserver
   * @param adapter Site adapter for Gemini
   * @param toolOutputHandler Tool output handler
   */
  constructor(adapter: SiteAdapter, toolOutputHandler: ToolOutputHandler) {
    super('gemini', adapter, toolOutputHandler);
    logMessage('GeminiPatternUnifiedObserver initialized');
  }

  /**
   * Handle detected tool command
   * @param toolCommand The detected tool command
   */
  protected handleDetectedTool(toolCommand: DetectedToolCommand): void {
    logMessage(`Detected tool command in Gemini: ${toolCommand.toolName}`);

    // Convert to DetectedTool format
    const detectedTool: DetectedTool = {
      id: toolCommand.id,
      name: toolCommand.toolName,
      args: toolCommand.arguments,
      domPosition: toolCommand.domIndex,
    };

    // Create custom event
    const event = new CustomEvent('mcpToolDetected', {
      detail: {
        tool: detectedTool,
        domPosition: toolCommand.domIndex,
      },
      bubbles: true,
    });

    // Dispatch event
    window.dispatchEvent(event);
  }
}

/**
 * Factory function to create a GeminiPatternUnifiedObserver
 * @param adapter The Gemini site adapter
 * @param toolOutputHandler The tool output handler
 * @returns A new GeminiPatternUnifiedObserver instance
 */
export const createGeminiPatternObserver = (
  adapter: SiteAdapter,
  toolOutputHandler: ToolOutputHandler,
): GeminiPatternUnifiedObserver => {
  return new GeminiPatternUnifiedObserver(adapter, toolOutputHandler);
};
