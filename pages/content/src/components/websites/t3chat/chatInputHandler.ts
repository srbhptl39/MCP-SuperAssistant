/**
 * Chat Input Handler for T3 Chat
 *
 * Utility functions for interacting with the T3 Chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the T3 Chat input element.
 * @returns Array of CSS selectors.
 */
export const getT3ChatInputSelectors = (): string[] => {
  return [
    'textarea#chat-input',
    'textarea[placeholder="Type your message here..."]',
    // Fallbacks from original findChatInputElement
    'textarea.resize-none',
    'textarea[aria-label="Message input"]',
    'div[role="textbox"]',
    'div.chat-input',
    'textarea[data-testid="chat-input"]',
    'div[contenteditable="true"]',
    'textarea.message-input',
  ];
};

/**
 * Returns an array of selectors for the T3 Chat submit button.
 * @returns Array of CSS selectors.
 */
export const getT3ChatSubmitButtonSelectors = (): string[] => {
  return [
    'button[type="submit"]',
    'button[aria-label="Submit"]',
    'button[aria-label="Send message"]',
    'button.send-button',
    'button.chat-submit',
    'button[data-testid="send-button"]',
    'svg.send-icon', // Icon based
  ];
};

/**
 * Returns an array of selectors for the T3 Chat file input element.
 * @returns Array of CSS selectors.
 */
export const getT3ChatFileInputSelectors = (): string[] => {
  return [
    'input[type="file"]', // Generic
    'button[aria-label*="Attach"] input[type="file"]',
    'div[class*="upload"] input[type="file"]',
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
 * Insert text into the T3 Chat input.
 * @param element The chat input HTMLElement.
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element) {
    logMessage('insertTextToChatInput (T3Chat): Element not provided.');
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
    logMessage('Appended text to T3 Chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into T3 Chat input: ${errorMessage}`);
    console.error('Error inserting text into T3 Chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the T3 Chat input.
 * @param element The chat input HTMLElement.
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput (T3Chat): Element not provided.');
    return false;
  }
  let textToInsert = result;
  if (typeof result !== 'string') {
    textToInsert = JSON.stringify(result, null, 2);
    logMessage('Converted tool result to string format for T3Chat.');
  }
  return insertTextToChatInput(element, textToInsert);
};

/**
 * Attach a file to the T3 Chat input.
 * @param fileInputElement The file input HTMLElement.
 * @param file The file to attach.
 * @returns True if successful, false otherwise.
 */
export const attachFileToChatInput = (fileInputElement: HTMLInputElement | null, file: File): boolean => {
  logMessage(`Attempting to attach file to T3 Chat input: ${file.name}`);
  if (!fileInputElement) {
    logMessage('attachFileToChatInput (T3Chat): fileInputElement not provided.');
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
    logMessage(`Error attaching file to T3 Chat: ${error}`);
    console.error('Error attaching file to T3 Chat:', error);
    return false;
  }
};

/**
 * Submit the T3 Chat input.
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
      logMessage('T3Chat submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('T3Chat submit button not found or disabled. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      return true;
    }

    logMessage('T3Chat chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting T3 Chat input: ${errorMessage}`);
    console.error('Error submitting T3 Chat input:', error);
    return false;
  }
};
