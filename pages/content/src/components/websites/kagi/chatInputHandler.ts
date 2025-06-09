/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the Kagi chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the Kagi chat input element.
 * @returns Array of CSS selectors.
 */
export const getKagiChatInputSelectors = (): string[] => {
  // Based on the original findChatInputElement logic
  return [
    'textarea[aria-label="Ask Kagi anything"]',
    'textarea[placeholder="Ask anything"]',
    'textarea[placeholder]', // Generic placeholder
    'textarea[spellcheck="false"]',
    'textarea[data-gramm="false"]',
    'div.css-146c3p1 textarea', // Example of specific class structure, might need updates
    'textarea.r-30o5oe', // Example of specific class
    'div[contenteditable="true"]', // Generic contenteditable
    // Fallbacks
    'textarea.chat-input',
    'div[role="textbox"]',
    'div.chat-input',
    'textarea[data-testid="chat-input"]',
    'textarea.message-input',
    // Kagi specific selectors from inspecting kagi.com/assistant
    '#kagi-chat-input', // If an ID is available
    '.kagi-chat-input-textarea', // If a class is available
  ];
};

/**
 * Returns an array of selectors for the Kagi submit button.
 * @returns Array of CSS selectors.
 */
export const getKagiSubmitButtonSelectors = (): string[] => {
  return [
    'button[aria-label="Submit"]',
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]',
    'button.send-button',
    'button.chat-submit',
    'button[type="submit"]',
    'svg.send-icon', // Icon based
    'button.submit-button',
    // Kagi specific selectors
    'button[name="kagi-chat-submit-button"]',
    '.kagi-chat-send-btn',
  ];
};

/**
 * Returns an array of selectors for the Kagi file input element.
 * @returns Array of CSS selectors.
 */
export const getKagiFileInputSelectors = (): string[] => {
  return [
    'input[type="file"]', // Generic
    'button[aria-label*="Attach"] input[type="file"]', // Input nested in an attach button
    'div[class*="upload"] input[type="file"]',
    // Kagi specific
    '.kagi-file-upload input[type="file"]',
  ];
};

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
 * Insert text into the Kagi chat input.
 * @param element The chat input HTMLElement.
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element) {
    logMessage('insertTextToChatInput (Kagi): Element not provided.');
    return false;
  }
  try {
    element.focus();
    // Kagi's input is typically a TEXTAREA
    if (element.tagName === 'TEXTAREA') {
      const textarea = element as HTMLTextAreaElement;
      const currentText = textarea.value;
      textarea.value = currentText ? `${currentText}\n\n${text}` : text; // Append with newlines
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    } else if (element.isContentEditable) {
      // Fallback for contenteditable
      const currentText = element.textContent || '';
      const textToInsert = currentText.trim() !== '' ? `\n\n${text}` : text;
      document.execCommand('insertText', false, textToInsert);
    } else if ('value' in element) {
      // General input
      (element as HTMLInputElement).value = text;
    } else {
      // Last resort
      element.textContent = text;
    }

    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    logMessage('Appended text to Kagi chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into Kagi input: ${errorMessage}`);
    console.error('Error inserting text into Kagi input:', error);
    return false;
  }
};

/**
 * Insert tool result into the Kagi chat input.
 * @param element The chat input HTMLElement.
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput (Kagi): Element not provided.');
    return false;
  }
  let textToInsert = result;
  if (typeof result !== 'string') {
    textToInsert = JSON.stringify(result, null, 2);
    logMessage('Converted tool result to string format for Kagi.');
  }
  return insertTextToChatInput(element, textToInsert);
};

/**
 * Attach a file to the Kagi chat input.
 * @param fileInputElement The file input HTMLElement.
 * @param file The file to attach.
 * @returns True if successful, false otherwise.
 */
export const attachFileToChatInput = (fileInputElement: HTMLInputElement | null, file: File): boolean => {
  logMessage(`Attempting to attach file to Kagi chat input: ${file.name}`);
  if (!fileInputElement) {
    logMessage('attachFileToChatInput (Kagi): fileInputElement not provided.');
    return false;
  }
  try {
    // Create a DataTransfer object to simulate a file drop
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInputElement.files = dataTransfer.files;

    // Trigger change event
    const changeEvent = new Event('change', { bubbles: true });
    fileInputElement.dispatchEvent(changeEvent);

    logMessage(`Successfully attached file: ${file.name}`);
    return true;
  } catch (error) {
    logMessage(`Error attaching file to Kagi chat: ${error}`);
    console.error('Error attaching file to Kagi chat:', error);
    return false;
  }
};

/**
 * Submit the Kagi chat input.
 * @param chatInputElement The chat input HTMLElement.
 * @param submitButtonElement The submit button HTMLElement.
 * @param simulateEnterFn Function to simulate Enter key (from BaseAdapter).
 * @returns True if submission was attempted, false otherwise.
 */
export const submitChatInput = async (
  chatInputElement: HTMLElement | null,
  submitButtonElement: HTMLElement | null,
  simulateEnterFn: (element: HTMLElement) => void,
): Promise<boolean> => {
  try {
    if (
      submitButtonElement &&
      !(submitButtonElement as HTMLButtonElement).disabled &&
      submitButtonElement.getAttribute('aria-disabled') !== 'true'
    ) {
      logMessage('Kagi submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('Kagi submit button not found or disabled. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      return true;
    }

    logMessage('Kagi chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting Kagi chat input: ${errorMessage}`);
    console.error('Error submitting Kagi chat input:', error);
    return false;
  }
};
