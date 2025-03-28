/**
 * Tool Detector
 *
 * This file implements a tool detector that can be used to detect MCP tools on the page
 * and notify listeners when tools are detected.
 */

import { logMessage } from './helpers';
import { ToolDetector } from './siteAdapter';

// Define interface for detected tools
export interface DetectedTool {
  id: string;
  name: string;
  args: any;
  domPosition?: number; // Optional property to track DOM position
}

/**
 * Simple implementation of the ToolDetector interface
 * that allows registering callbacks for tool detection
 */
export class SimpleToolDetector implements ToolDetector {
  private callbacks: ((tools: DetectedTool[]) => void)[] = [];
  private detectedTools: DetectedTool[] = [];
  private connected: boolean = true;

  /**
   * Register a callback to be called when tools are detected
   * @param callback Function to call when tools are detected
   */
  onDetect(callback: (tools: DetectedTool[]) => void): void {
    this.callbacks.push(callback);

    // Immediately call the callback with any existing tools
    if (this.detectedTools.length > 0) {
      callback(this.detectedTools);
    }
  }

  /**
   * Disconnect the tool detector and stop detecting tools
   */
  disconnect(): void {
    this.connected = false;
    this.callbacks = [];
    logMessage('Tool detector disconnected');
  }

  /**
   * Get the currently detected tools
   * @returns Array of detected tools
   */
  getTools(): DetectedTool[] {
    return [...this.detectedTools];
  }

  /**
   * Update the list of detected tools and notify all callbacks
   * @param tools The new list of detected tools
   */
  updateTools(tools: DetectedTool[]): void {
    if (!this.connected) return;

    this.detectedTools = tools;

    // Notify all callbacks
    for (const callback of this.callbacks) {
      try {
        callback(tools);
      } catch (error) {
        logMessage(`Error in tool detection callback: ${error}`);
      }
    }
  }
}

// Create a factory function to create a new tool detector
export function createToolDetector(): SimpleToolDetector {
  return new SimpleToolDetector();
}
