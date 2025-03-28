/**
 * Grok Pattern-based Unified Observer
 * 
 * This file implements a pattern-based unified observer for Grok that
 * extends the base unified observer to detect tool commands based on
 * text patterns rather than CSS selectors.
 */

import { logMessage } from '@src/utils/helpers';
import { BaseUnifiedObserver, DetectedToolCommand } from '@src/components/common/unifiedPatternObserver';
import { SiteAdapter } from '@src/utils/siteAdapter';
import { ToolOutputHandler } from '@src/components/sidebar';
import { DetectedTool } from '@src/utils/toolDetector';

/**
 * Grok Pattern-based Unified Observer class
 */
export class GrokPatternUnifiedObserver extends BaseUnifiedObserver {
  /**
   * Constructor for GrokPatternUnifiedObserver
   * @param adapter Site adapter for Grok
   * @param toolOutputHandler Tool output handler
   */
  constructor(adapter: SiteAdapter, toolOutputHandler: ToolOutputHandler) {
    super('grok', adapter, toolOutputHandler);
    logMessage('GrokPatternUnifiedObserver initialized');
  }

  /**
   * Handle detected tool commands
   * @param toolCommand The detected tool command
   */
  protected handleDetectedTool(toolCommand: DetectedToolCommand): void {
    logMessage(`Detected tool: ${toolCommand.toolName} on server ${toolCommand.serverName}`);
    
    // Create a DetectedTool object to update the tool detector
    const detectedTool: DetectedTool = {
      id: `tool-${toolCommand.id}`,
      name: toolCommand.toolName,
      args: toolCommand.arguments || {},
    };
    
    // Directly dispatch events instead of using onDetect which creates a memory leak
    // by adding a new listener every time a tool is detected
    
    // Dispatch event for specific tool detection
    window.dispatchEvent(
      new CustomEvent<{tool: DetectedTool; domPosition: number}>('mcpToolDetected', {
        detail: {
          tool: detectedTool,
          domPosition: toolCommand.domIndex
        },
      })
    );
    
    // Dispatch event for general tool updates
    window.dispatchEvent(
      new CustomEvent('mcpToolsUpdated', {
        detail: {
          toolName: toolCommand.toolName,
          serverName: toolCommand.serverName,
          arguments: toolCommand.arguments,
        },
      })
    );
  }
}

/**
 * Factory function to create a GrokPatternUnifiedObserver
 * @param adapter The Grok site adapter
 * @param toolOutputHandler The tool output handler
 * @returns A new GrokPatternUnifiedObserver instance
 */
export const createGrokPatternObserver = (
  adapter: SiteAdapter,
  toolOutputHandler: ToolOutputHandler
): GrokPatternUnifiedObserver => {
  return new GrokPatternUnifiedObserver(adapter, toolOutputHandler);
};
