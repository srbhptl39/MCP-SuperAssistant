/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the DeepSeek chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the DeepSeek chat input element.
 * @returns Array of CSS selectors.
 */
export const getDeepSeekChatInputSelectors = (): string[] => {
  return [
    'textarea[aria-label="Ask DeepSeek anything"]',
    'textarea[placeholder="Ask anything"]',
    'textarea[placeholder]', // Generic
    'textarea[spellcheck="false"]',
    'textarea[data-gramm="false"]',
    'div.css-146c3p1 textarea', // Specific class structure
    'textarea.r-30o5oe', // Specific class
    'div[contenteditable="true"]', // Generic contenteditable
    // Fallbacks from original findChatInputElement
    'textarea.chat-input',
    'div[role="textbox"]',
    'div.chat-input',
    'textarea[data-testid="chat-input"]',
    'textarea.message-input',
  ];
};

/**
 * Returns an array of selectors for the DeepSeek submit button.
 * @returns Array of CSS selectors.
 */
export const getDeepSeekSubmitButtonSelectors = (): string[] => {
  return [
    'button[aria-label="Submit"]',
    'button.send-button',
    'button[aria-label="Send message"]',
    'button.chat-submit',
    'button[data-testid="send-button"]',
    'svg.send-icon', // Icon based
    'button.submit-button',
    // Selector for a button that is a sibling of the textarea's parent, common in some UIs
    // e.g., 'textarea[placeholder="Ask anything"] + button' or similar relative selectors
    // For findElement, direct selectors are usually better unless context is passed.
  ];
};

/**
 * Returns an array of selectors for the DeepSeek file input element.
 * @returns Array of CSS selectors.
 */
export const getDeepSeekFileInputSelectors = (): string[] => {
  return [
    'input[type="file"]', // Generic
    'button[aria-label*="Attach"] input[type="file"]',
    'div[class*="upload"] input[type="file"]', // Class indicating upload functionality
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
 * Insert text into the DeepSeek chat input.
 * @param element The chat input HTMLElement.
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element) {
    logMessage('insertTextToChatInput (DeepSeek): Element not provided.');
    return false;
  }
  try {
    element.focus();
    if (element.tagName === 'TEXTAREA') {
      const textarea = element as HTMLTextAreaElement;
      const currentText = textarea.value;
      textarea.value = currentText ? `${currentText}\n\n${text}` : text;
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    } else if (element.isContentEditable) {
      const currentText = element.textContent || '';
      const textToInsert = currentText.trim() !== '' ? `\n\n${text}` : text;
      document.execCommand('insertText', false, textToInsert);
    } else if ('value' in element) {
      (element as HTMLInputElement).value = text;
    } else {
      element.textContent = text;
    }

    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    logMessage('Appended text to DeepSeek chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into DeepSeek input: ${errorMessage}`);
    console.error('Error inserting text into DeepSeek input:', error);
    return false;
  }
};

/**
 * Insert tool result into the DeepSeek chat input.
 * @param element The chat input HTMLElement.
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput (DeepSeek): Element not provided.');
    return false;
  }
  let textToInsert = result;
  if (typeof result !== 'string') {
    textToInsert = JSON.stringify(result, null, 2);
    logMessage('Converted tool result to string format for DeepSeek.');
  }
  return insertTextToChatInput(element, textToInsert);
};

/**
 * Attach a file to the DeepSeek chat input.
 * @param fileInputElement The file input HTMLElement.
 * @param file The file to attach.
 * @returns True if successful, false otherwise.
 */
export const attachFileToChatInput = (fileInputElement: HTMLInputElement | null, file: File): boolean => {
  logMessage(`Attempting to attach file to DeepSeek chat input: ${file.name}`);
  if (!fileInputElement) {
    logMessage('attachFileToChatInput (DeepSeek): fileInputElement not provided.');
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
    logMessage(`Error attaching file to DeepSeek chat: ${error}`);
    console.error('Error attaching file to DeepSeek chat:', error);
    return false;
  }
};

/**
 * Submit the DeepSeek chat input.
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
      logMessage('DeepSeek submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('DeepSeek submit button not found or disabled. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      return true;
    }

    logMessage('DeepSeek chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting DeepSeek chat input: ${errorMessage}`);
    console.error('Error submitting DeepSeek chat input:', error);
    return false;
  }
};
