/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the Perplexity chat input area
 */

import { logMessage } from '@src/utils/helpers';

/**
 * Find the Perplexity chat input textarea element
 * @returns The chat input textarea element or null if not found
 */
export const findChatInputElement = (): HTMLTextAreaElement | null => {
  // Try to find the main "Ask anything..." input first
  let chatInput = document.querySelector('textarea[placeholder="Ask anything..."]');

  if (chatInput) {
    logMessage('Found Perplexity main input with "Ask anything..." placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // Fall back to the follow-up input if main input not found
  chatInput = document.querySelector('textarea[placeholder="Ask follow-up"]');

  if (chatInput) {
    logMessage('Found Perplexity follow-up input with "Ask follow-up" placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // If neither specific placeholder is found, try a more general approach
  chatInput = document.querySelector('textarea[placeholder*="Ask"]');

  if (chatInput) {
    logMessage(
      `Found Perplexity input with generic "Ask" in placeholder: ${(chatInput as HTMLTextAreaElement).placeholder}`,
    );
    return chatInput as HTMLTextAreaElement;
  }

  logMessage('Could not find any Perplexity chat input textarea');
  return null;
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
 * Insert text into the Perplexity chat input
 * @param text The text to insert
 * @returns True if successful, false otherwise
 */
export const insertTextToChatInput = (text: string): boolean => {
  try {
    const chatInput = findChatInputElement();

    if (chatInput) {
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
    } else {
      logMessage('Could not find Perplexity chat input');
      console.error('Could not find Perplexity chat input textarea');
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into chat input: ${errorMessage}`);
    console.error('Error inserting text into chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the Perplexity chat input
 * @param result The tool result to insert
 * @returns True if successful, false otherwise
 */
export const insertToolResultToChatInput = (result: any): boolean => {
  try {
    // Format the tool result as JSON string
    // const formattedResult = formatAsJson(result);
    // const wrappedResult = wrapInToolOutput(formattedResult);
    if (typeof result !== 'string') {
      result = JSON.stringify(result, null, 2);
      logMessage('Converted tool result to string format');
    }

    return insertTextToChatInput(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error formatting tool result: ${errorMessage}`);
    console.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the Perplexity input
 * @param file The file to attach
 * @returns Promise that resolves to true if successful
 */
export const attachFileToChatInput = async (file: File): Promise<boolean> => {
  try {
    // First try to find the hidden file input element in Perplexity
    const fileInputSelector = 'input[type="file"][multiple][accept*=".pdf"]';
    let fileInput = document.querySelector(fileInputSelector) as HTMLInputElement | null;

    if (!fileInput) {
      logMessage('Could not find Perplexity file input element, looking for more generic selector');
      // Try a more generic selector if the specific one fails
      fileInput = document.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
    }

    if (fileInput) {
      logMessage('Found Perplexity file input element');

      // Create a DataTransfer object and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set the files property on the input element
      fileInput.files = dataTransfer.files;

      // Trigger the change event to notify the application
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      logMessage(`Attached file ${file.name} to Perplexity input via file input element`);
      return true;
    }

    // Fallback to the original method if no file input element is found
    logMessage('No file input element found, falling back to drag and drop simulation');
    const chatInput = findChatInputElement();

    if (!chatInput) {
      logMessage('Could not find Perplexity input element for file attachment');
      return false;
    }

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
    chatInput.addEventListener('dragover', e => e.preventDefault(), { once: true });
    chatInput.dispatchEvent(dragOverEvent);

    // Simulate the drop event
    chatInput.dispatchEvent(dropEvent);

    // Also try to create a clipboard item as a fallback
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [file.type]: file,
        }),
      ]);

      // Focus the textarea to make it easier to paste
      chatInput.focus();
      logMessage('File copied to clipboard, user can now paste manually if needed');
    } catch (clipboardError) {
      logMessage(`Could not copy to clipboard: ${clipboardError}`);
    }

    logMessage(`Attached file ${file.name} to Perplexity input via drag and drop simulation`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to Perplexity input: ${errorMessage}`);
    console.error('Error attaching file to Perplexity input:', error);
    return false;
  }
};

/**
 * Submit the current chat input (equivalent to pressing Enter)
 * @returns True if submission was successful, false otherwise
 */
export const submitChatInput = async (maxWaitTime = 5000): Promise<boolean> => {
  try {
    const chatInput = findChatInputElement();
    if (!chatInput) {
      logMessage('Could not find chat input to submit');
      return false;
    }

    const findSubmitButton = (): HTMLButtonElement | null => {
      return (document.querySelector('button[aria-label="Submit"]') ??
        document.querySelector('button[aria-label="Send"]') ??
        document.querySelector('button[type="submit"]') ??
        chatInput.parentElement?.querySelector('button') ??
        document.querySelector('button svg[stroke="currentColor"]')?.closest('button')) as HTMLButtonElement | null;
    };

    const isDisabled = (btn: HTMLButtonElement) =>
      btn.disabled ||
      btn.getAttribute('disabled') !== null ||
      btn.getAttribute('aria-disabled') === 'true' ||
      btn.classList.contains('disabled');

    let button = findSubmitButton();
    if (button) {
      logMessage(`Found submit button (${button.getAttribute('aria-label') || 'unknown'})`);
      const start = Date.now();
      while (isDisabled(button) && Date.now() - start < maxWaitTime) {
        await new Promise(res => setTimeout(res, 300));
        button = findSubmitButton()!;
      }
      if (!isDisabled(button)) {
        logMessage('Clicking submit button');
        button.click();
        return true;
      }
      logMessage('Submit button remained disabled, falling back to Enter key');
    }

    // Fallback: simulate Enter key
    chatInput.focus();
    ['keydown', 'keypress', 'keyup'].forEach(type => {
      chatInput.dispatchEvent(
        new KeyboardEvent(type, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Form submission fallback
    const form = chatInput.closest<HTMLFormElement>('form');
    if (form) {
      logMessage('Submitting form as fallback');
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error submitting chat input: ${errorMessage}`);
    console.error('Error submitting chat input:', error);
    return false;
  }
};
