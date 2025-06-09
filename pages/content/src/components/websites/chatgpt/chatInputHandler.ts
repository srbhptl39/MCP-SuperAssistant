/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the ChatGPT chat input area
 */

import { logMessage } from '@src/utils/helpers';

// Cache for the last found input element - Removed as adapter manages element finding.
// let lastFoundInputElement: HTMLElement | null = null;

/**
 * Find the ChatGPT chat input element
 * @returns The chat input element or null if not found
 */
export const getChatInputSelectors = (): string[] => {
  return [
    'div[contenteditable="true"][translate="no"][class*="ProseMirror"][id="prompt-textarea"]', // Primary selector for contenteditable div
    'textarea[placeholder="Ask anything..."]', // Textarea fallback
    'textarea[placeholder*="Send a message"]', // Another common placeholder for textarea
    '#prompt-textarea', // Direct ID selector often used
    // Placeholder based - these are less direct, find placeholder then navigate.
    // For BaseAdapter.findElement, these would need to be handled differently,
    // so keeping direct selectors for input element itself.
    // Consider adding selectors for parent of placeholder if that's how it's structured.
  ];
};

/**
 */
// export const setLastFoundInputElement = (element: HTMLElement | null) => {
//   lastFoundInputElement = element;
// };
// export const getLastFoundInputElement = (): HTMLElement | null => {
//   return lastFoundInputElement;
// };

/**
 * Wrap content in tool_output tags
 * @param content The content to wrap
 * @returns The wrapped content
 */
export const wrapInToolOutput = (content: string): string => {
  return `<tool_output>\n${content}\n</tool_output>`;
};

/**
 * Format an object as a JSON string
 * @param data The data to format
 * @returns Formatted JSON string
 */
export const formatAsJson = (data: any): string => {
  return JSON.stringify(data, null, 2);
};

/**
 * Insert text into the provided chat input element.
 * This function now assumes the element is already found and passed as an argument.
 * @param chatInputElement The chat input HTMLElement.
 * @param text The text to insert.
 * @param asHtml Whether to insert the text as HTML (for contenteditable).
 * @returns True if successful, false otherwise.
 */
// export const insertTextToChatInput = ( ... ) // Removed: Logic moved to BaseAdapter.insertText
// export const insertToolResultToChatInput = ( ... ) // Removed: Logic moved to BaseAdapter.insertTextIntoInput

/**
 * Attach a file to the ChatGPT input
 * @param chatInputElement The chat input HTMLElement to attach the file to (or drop zone).
 * @param file The file to attach.
 * @returns Promise that resolves to true if successful.
 */
export const attachFileToChatInput = async (chatInputElement: HTMLElement, file: File): Promise<boolean> => {
  if (!chatInputElement) {
    logMessage('attachFileToChatInput: chatInputElement is null');
    return false;
  }
  try {
    // Create a DataTransfer object
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Create custom events
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dataTransfer,
    });

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dataTransfer,
    });

    // Prevent default on dragover to enable drop
    chatInputElement.addEventListener('dragover', (e: DragEvent) => e.preventDefault(), { once: true });
    chatInputElement.dispatchEvent(dragOverEvent);

    // Simulate the drop event
    chatInputElement.dispatchEvent(dropEvent);

    logMessage(`Attached file ${file.name} to ChatGPT input`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to ChatGPT input: ${errorMessage}`);
    console.error('Error attaching file to ChatGPT input:', error);
    return false;
  }
};

/**
 * Provides an array of selectors for finding the submit button.
 * @returns Array of CSS selectors for the submit button.
 */
export const getSubmitButtonSelectors = (): string[] => {
  return [
    'button[data-testid="send-button"]', // Primary selector
    'button[aria-label="Send message"]',
    'button[aria-label="Send prompt"]',
    'button svg[data-icon="paper-airplane"]', // Icon based
    'button svg path[d*="M12 3.5"]', // Icon path based
    'form button[type="submit"]', // Generic form submit
    // Consider a selector for a button that is a sibling to the input area's parent
  ];
};

/**
 * Simulates Enter key press on an element.
 * @param element The HTMLElement to dispatch key events on.
 */
// const simulateEnterKeyOnElement = ( ... ) // Removed: Logic moved to BaseAdapter.simulateEnterKey

/**
 * Submit the current chat input.
 * This function now expects the specific input and button elements to be passed.
 * The adapter will be responsible for finding them, potentially using BaseAdapter.waitForElement.
 * @param chatInputElement The chat input HTMLElement.
 * @param submitButtonElement The submit button HTMLElement.
 * @returns True if submission was attempted, false otherwise.
 */
// export const submitChatInput = async ( ... ) // Removed: Logic moved to BaseAdapter.triggerSubmission
