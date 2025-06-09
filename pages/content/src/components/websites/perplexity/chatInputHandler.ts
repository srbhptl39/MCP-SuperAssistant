/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the Perplexity chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the Perplexity chat input textarea element.
 * @returns Array of CSS selectors.
 */
export const getPerplexityChatInputSelectors = (): string[] => {
  return [
    'textarea[placeholder="Ask anything..."]', // Main input
    'textarea[placeholder="Ask follow-up"]', // Follow-up input
    'textarea[placeholder*="Ask"]', // Generic "Ask" placeholder
    'textarea.editorContent', // A class that might be used
    'div[contenteditable="true"] textarea', // Textarea within a contenteditable (less likely for Perplexity but for robustness)
  ];
};

/**
 * Returns an array of selectors for the Perplexity submit button.
 * @returns Array of CSS selectors.
 */
export const getPerplexitySubmitButtonSelectors = (): string[] => {
  return [
    'button[aria-label="Submit"]',
    'button[aria-label="Send"]',
    'button[type="submit"]',
    // Assuming the button might be a direct sibling or child of the form/input container
    // These are context-dependent and might be better handled by finding input then navigating
    // For direct findElement, more specific global selectors are better.
    'button > svg[data-icon="arrow-right"]', // Icon based
    'button > svg[class*="fa-arrow-right"]', // FontAwesome icon based
  ];
};

/**
 * Returns an array of selectors for the Perplexity file input element.
 * @returns Array of CSS selectors.
 */
export const getPerplexityFileInputSelectors = (): string[] => {
  return [
    'input[type="file"][multiple][accept*=".pdf"]',
    'input[type="file"][multiple]',
    'button[aria-label*="Attach"] input[type="file"]', // If input is child of attach button
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
 * Insert text into the Perplexity chat input.
 * @param element The chat input HTMLElement (expected to be a textarea).
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element || element.tagName !== 'TEXTAREA') {
    logMessage('insertTextToChatInput: Provided element is not a TEXTAREA.');
    return false;
  }
  const chatInput = element as HTMLTextAreaElement;
  try {
    // Append the text to the existing text in the textarea
    const currentText = chatInput.value;
    // Add new line before and after the current text if there's existing content
    const formattedText = currentText ? `${currentText}\n\n${text}` : text;
    chatInput.value = formattedText;

    // Trigger input event to make Perplexity recognize the change
    const inputEvent = new Event('input', { bubbles: true });
    chatInput.dispatchEvent(inputEvent);

    // Focus the textarea
    chatInput.focus();

    logMessage('Appended text to Perplexity chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into Perplexity chat input: ${errorMessage}`);
    console.error('Error inserting text into chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the Perplexity chat input.
 * @param element The chat input HTMLElement (expected to be a textarea).
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput: Element not provided.');
    return false;
  }
  try {
    let textToInsert = result;
    if (typeof result !== 'string') {
      textToInsert = JSON.stringify(result, null, 2);
      logMessage('Converted tool result to string format for Perplexity.');
    }
    return insertTextToChatInput(element, textToInsert);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting tool result to Perplexity: ${errorMessage}`);
    console.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the Perplexity input.
 * @param fileInputElement The file input HTMLElement.
 * @param chatInputElement The chat input HTMLElement (for fallback drag/drop).
 * @param file The file to attach.
 * @returns Promise that resolves to true if successful.
 */
export const attachFileToChatInput = async (
  fileInputElement: HTMLInputElement | null,
  chatInputElement: HTMLElement | null,
  file: File,
): Promise<boolean> => {
  try {
    if (fileInputElement) {
      logMessage('Using Perplexity file input element for attachment.');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputElement.files = dataTransfer.files;
      const changeEvent = new Event('change', { bubbles: true });
      fileInputElement.dispatchEvent(changeEvent);
      logMessage(`Attached file ${file.name} via file input element.`);
      return true;
    }

    if (chatInputElement) {
      logMessage('File input element not found, falling back to drag and drop simulation on chat input.');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const dragOverEvent = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
      const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
      chatInputElement.addEventListener('dragover', e => e.preventDefault(), { once: true });
      chatInputElement.dispatchEvent(dragOverEvent);
      chatInputElement.dispatchEvent(dropEvent);
      logMessage(`Attached file ${file.name} via drag and drop simulation.`);
      // Clipboard fallback could also be attempted here if needed.
      return true;
    }

    logMessage('Neither file input nor chat input element found for file attachment.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to Perplexity: ${errorMessage}`);
    console.error('Error attaching file to Perplexity input:', error);
    return false;
  }
};

/**
 * Submit the Perplexity chat input.
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
      logMessage('Perplexity submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('Perplexity submit button not found, disabled, or other issue. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      return true;
    }

    logMessage('Perplexity chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting Perplexity chat input: ${errorMessage}`);
    console.error('Error submitting chat input:', error);
    return false;
  }
};
