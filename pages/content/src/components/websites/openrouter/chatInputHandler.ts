/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the OpenRouter chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the OpenRouter chat input element.
 * @returns Array of CSS selectors.
 */
export const getOpenRouterChatInputSelectors = (): string[] => {
  return [
    'textarea[name="Chat Input"][placeholder="Start a message..."].w-full', // Primary
    'textarea[placeholder="Start a message..."]', // Simpler placeholder match
    'textarea[placeholder="Ask anything"]', // Common placeholder
    'div[contenteditable="true"]', // Generic contenteditable as a fallback
    // Selectors based on common chat UI patterns (if primary ones fail)
    'textarea.chat-input',
    'div[role="textbox"]',
  ];
};

/**
 * Returns an array of selectors for the OpenRouter submit button.
 * @returns Array of CSS selectors.
 */
export const getOpenRouterSubmitButtonSelectors = (): string[] => {
  return [
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button svg[data-icon="paper-airplane"]', // Icon based
    'button[type="submit"]',
    // More specific selector if available, e.g., a button that's a sibling of the input's parent
    // Example: 'textarea[name="Chat Input"] + button', but this depends on exact DOM structure
  ];
};

// No specific file input selectors are evident from the original code,
// so attachFile will likely rely on drag-and-drop to the chat input area.

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
 * Insert text into the OpenRouter chat input.
 * @param element The chat input HTMLElement.
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element) {
    logMessage('insertTextToChatInput (OpenRouter): Element not provided.');
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
      const textToInsert = currentText.trim() !== '' ? `\n\n${text}` : text; // Add newlines if content exists
      document.execCommand('insertText', false, textToInsert);
    } else if ('value' in element) {
      // General input fallback
      (element as HTMLInputElement).value = text;
    } else {
      // Last resort
      element.textContent = text;
    }

    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    logMessage('Appended text to OpenRouter chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text to OpenRouter input: ${errorMessage}`);
    console.error('Error appending text to OpenRouter input:', error);
    return false;
  }
};

/**
 * Insert tool result into the OpenRouter chat input.
 * @param element The chat input HTMLElement.
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput (OpenRouter): Element not provided.');
    return false;
  }
  try {
    let textToInsert = result;
    if (typeof result !== 'string') {
      textToInsert = JSON.stringify(result, null, 2);
      logMessage('Converted tool result to string format for OpenRouter.');
    }
    return insertTextToChatInput(element, textToInsert);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting tool result to OpenRouter: ${errorMessage}`);
    console.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the OpenRouter input.
 * Typically by drag-and-drop simulation onto the chat input area.
 * @param chatInputElement The chat input HTMLElement (acts as drop zone).
 * @param file The file to attach.
 * @returns Promise that resolves to true if successful.
 */
export const attachFileToChatInput = async (chatInputElement: HTMLElement | null, file: File): Promise<boolean> => {
  if (!chatInputElement) {
    logMessage('attachFileToChatInput (OpenRouter): chatInputElement not provided.');
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

    logMessage(`Attached file ${file.name} to OpenRouter input`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to OpenRouter input: ${errorMessage}`);
    console.error('Error attaching file to OpenRouter input:', error);
    return false;
  }
};

/**
 * Submit the OpenRouter chat input.
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
      logMessage('OpenRouter submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('OpenRouter submit button not found or disabled. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      return true;
    }

    logMessage('OpenRouter chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting OpenRouter chat input: ${errorMessage}`);
    console.error('Error submitting OpenRouter chat input:', error);
    return false; // Corrected: return false directly
    // Removed incorrect resolve call from the Promise-based version
  }
  // Removed });
};
