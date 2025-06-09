/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the AiStudio chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Returns an array of selectors for the AiStudio chat input textarea element.
 * @returns Array of CSS selectors.
 */
export const getAiStudioChatInputSelectors = (): string[] => {
  return [
    'textarea.textarea[placeholder="Type something"]',
    'textarea.textarea[aria-label="Type something or pick one from prompt gallery"]',
    'textarea[placeholder="Ask follow-up"]',
    "textarea.textarea[aria-label='Type something or tab to choose an example prompt']",
    "textarea.textarea[aria-label='Start typing a prompt']",
    'textarea[placeholder*="Ask"]', // Generic
    // Add other selectors for AiStudio if they exist, e.g. by ID or more specific classes
    '.chat-input-container textarea', // Example of a more structural selector
  ];
};

/**
 * Returns an array of selectors for the AiStudio submit button.
 * @returns Array of CSS selectors.
 */
export const getAiStudioSubmitButtonSelectors = (): string[] => {
  // Based on the submitChatInput function's logic
  return [
    'button[aria-label="Submit"]',
    'button[aria-label="Send"]',
    'button[type="submit"]',
    // '.chat-input-container button[aria-label*="Send"]', // More specific example
    'button svg[stroke="currentColor"]', // Generic icon button often used for send
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
 * Insert text into the AiStudio chat input.
 * @param element The chat input HTMLElement (expected to be a textarea).
 * @param text The text to insert.
 * @returns True if successful, false otherwise.
 */
export const insertTextToChatInput = (element: HTMLElement, text: string): boolean => {
  if (!element || element.tagName !== 'TEXTAREA') {
    logMessage('insertTextToChatInput (AiStudio): Provided element is not a TEXTAREA.');
    return false;
  }
  const chatInput = element as HTMLTextAreaElement;
  try {
    // Append the text to the existing text in the textarea
    const currentText = chatInput.value;
    const formattedText = currentText ? `${currentText}\n\n${text}` : text;
    chatInput.value = formattedText;

    // Trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    chatInput.dispatchEvent(inputEvent);
    chatInput.focus();
    logMessage('Appended text to AiStudio chat input');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into AiStudio chat input: ${errorMessage}`);
    console.error('Error inserting text into chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the AiStudio chat input.
 * @param element The chat input HTMLElement (expected to be a textarea).
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns True if successful, false otherwise.
 */
export const insertToolResultToChatInput = (element: HTMLElement, result: any): boolean => {
  if (!element) {
    logMessage('insertToolResultToChatInput (AiStudio): Element not provided.');
    return false;
  }
  try {
    let textToInsert = result;
    if (typeof result !== 'string') {
      textToInsert = JSON.stringify(result, null, 2);
      logMessage('Converted tool result to string format for AiStudio.');
    }
    return insertTextToChatInput(element, textToInsert);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting tool result to AiStudio: ${errorMessage}`);
    console.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the AiStudio input.
 * @param chatInputElement The chat input HTMLElement (used as a drop target).
 * @param file The file to attach.
 * @returns Promise that resolves to true if successful.
 */
export const attachFileToChatInput = async (chatInputElement: HTMLElement | null, file: File): Promise<boolean> => {
  if (!chatInputElement) {
    logMessage('attachFileToChatInput (AiStudio): chatInputElement not provided.');
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

    // Also try to create a clipboard item as a fallback
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [file.type]: file,
        }),
      ]);

      // Focus the textarea to make it easier to paste
      chatInputElement.focus();
      logMessage('File copied to clipboard, user can now paste manually if needed');
    } catch (clipboardError) {
      const typedClipboardError = clipboardError instanceof Error ? clipboardError.message : String(clipboardError);
      logMessage(`Could not copy to clipboard: ${typedClipboardError}`);
    }

    logMessage(`Attached file ${file.name} to AiStudio input`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to AiStudio input: ${errorMessage}`);
    console.error('Error attaching file to AiStudio input:', error);
    return false;
  }
};

/**
 * Submit the AiStudio chat input.
 * @param chatInputElement The chat input HTMLElement.
 * @param submitButtonElement The submit button HTMLElement.
 * @param simulateEnterFn Function to simulate Enter key (from BaseAdapter).
 * @returns True if submission was successful, false otherwise.
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
      logMessage('AiStudio submit button found and enabled, clicking it.');
      submitButtonElement.click();
      return true;
    }

    logMessage('AiStudio submit button not found, disabled, or other issue. Falling back to Enter key simulation.');
    if (chatInputElement) {
      simulateEnterFn(chatInputElement);
      // For AiStudio, after simulating enter, check if a "Stop" button appears,
      // as this might indicate successful submission if the main button is perma-disabled.
      // This is a heuristic and might need adjustment.
      await new Promise(r => setTimeout(r, 200)); // wait for UI to update
      const stopButton = document.querySelector('button[aria-label="Stop generating"]');
      if (stopButton) {
        logMessage('AiStudio "Stop generating" button appeared after Enter simulation, assuming success.');
        return true;
      }
      logMessage('AiStudio "Stop generating" button did not appear after Enter simulation.');
      // Still return true as we attempted the submission.
      return true;
    }

    logMessage('AiStudio chat input element not found for Enter key simulation.');
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting AiStudio chat input: ${errorMessage}`);
    console.error('Error submitting AiStudio chat input:', error);
    return false; // Corrected: return false directly
    // Removed incorrect resolve call from the Promise-based version
  }
  // Removed });
};
