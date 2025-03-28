/**
 * Common Tool Call Parser
 *
 * This file contains functions for parsing tool output content from HTML elements
 * that can be used across different site adapters.
 */

import { logMessage } from '../../utils/helpers';

/**
 * Extracts tool output content from an HTML element
 * @param element The element containing tool output
 * @returns The extracted tool output text or null if not found
 */

const toolOutputId = 'tool_output';
const toolOutputRegex = new RegExp(`<${toolOutputId}>([\\s\\S]*?)<\/${toolOutputId}>`);

export const extractToolOutput = (element: Element): string | null => {
  try {
    const content = element.textContent || '';

    // Check if the content contains tool output tags
    const match = content.match(toolOutputRegex);

    if (match && match[1]) {
      logMessage('Found tool output content');
      return match[1].trim();
    }

    return null;
  } catch (error) {
    logMessage(`Error extracting tool output: ${error}`);
    return null;
  }
};

/**
 * Parses JSON content from tool output
 * @param toolOutputText The raw tool output text
 * @returns Parsed JSON object or null if parsing fails
 */
export const parseToolOutputJson = (toolOutputText: string): any | null => {
  try {
    const jsonContent = JSON.parse(toolOutputText);
    logMessage('Successfully parsed tool output JSON');
    return jsonContent;
  } catch (error) {
    logMessage(`Error parsing tool output JSON: ${error}`);
    return null;
  }
};
