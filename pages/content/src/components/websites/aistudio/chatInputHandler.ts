/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the AiStudio chat input area
 */

import { logMessage } from '@src/utils/helpers';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Find the AiStudio chat input textarea element
 * @returns The chat input textarea element or null if not found
 */

const logger = createLogger('AIStudioChatInputHandler');

export const findChatInputElement = (): HTMLTextAreaElement | null => {
  // Try to find the main "Ask anything..." input first
  let chatInput = document.querySelector('textarea.textarea[placeholder="Type something"]');

  if (chatInput) {
    logMessage('Found AiStudio main input with "Type something" placeholder');
    return chatInput as HTMLTextAreaElement;
  }
  // Try to find the main "Ask anything..." input first
  chatInput = document.querySelector('textarea.textarea[aria-label="Type something or pick one from prompt gallery"]');

  if (chatInput) {
    logMessage('Found AiStudio main input with "Type something or pick one from prompt gallery" placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // Fall back to the follow-up input if main input not found
  chatInput = document.querySelector('textarea[placeholder="Ask follow-up"]');

  if (chatInput) {
    logMessage('Found AiStudio follow-up input with "Ask follow-up" placeholder');
    return chatInput as HTMLTextAreaElement;
  }

  // Try to find the input with "Type something or tab to choose an example prompt" aria-label
  chatInput = document.querySelector(
    "textarea.textarea[aria-label='Type something or tab to choose an example prompt']",
  );

  if (chatInput) {
    logMessage('Found AiStudio input with "Type something or tab to choose an example prompt" aria-label');
    return chatInput as HTMLTextAreaElement;
  }

  // Try to find the input with "Start typing a prompt" aria-label
  chatInput = document.querySelector("textarea.textarea[aria-label='Start typing a prompt']");

  if (chatInput) {
    logMessage('Found AiStudio input with "Start typing a prompt" aria-label');
    return chatInput as HTMLTextAreaElement;
  }

  // If neither specific placeholder is found, try a more general approach
  chatInput = document.querySelector('textarea[placeholder*="Ask"]');

  if (chatInput) {
    logMessage(
      `Found AiStudio input with generic "Ask" in placeholder: ${(chatInput as HTMLTextAreaElement).placeholder}`,
    );
    return chatInput as HTMLTextAreaElement;
  }

  logMessage('Could not find any AiStudio chat input textarea');
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
 * Insert text into the AiStudio chat input
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

      // Trigger input event to make AiStudio recognize the change
      const inputEvent = new Event('input', { bubbles: true });
      chatInput.dispatchEvent(inputEvent);

      // Focus the textarea
      chatInput.focus();

      logMessage('Appended text to AiStudio chat input');
      return true;
    } else {
      logMessage('Could not find AiStudio chat input');
      logger.error('Could not find AiStudio chat input textarea');
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error inserting text into chat input: ${errorMessage}`);
    logger.error('Error inserting text into chat input:', error);
    return false;
  }
};

/**
 * Insert tool result into the AiStudio chat input
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
    logger.error('Error formatting tool result:', error);
    return false;
  }
};

/**
 * Attach a file to the AiStudio input
 * @param file The file to attach
 * @returns Promise that resolves to true if successful
 */
export const attachFileToChatInput = async (file: File): Promise<boolean> => {
  try {
    // Find the AiStudio input element
    const chatInput = findChatInputElement();

    if (!chatInput) {
      logMessage('Could not find AiStudio input element for file attachment');
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

    logMessage(`Attached file ${file.name} to AiStudio input`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to AiStudio input: ${errorMessage}`);
    logger.error('Error attaching file to AiStudio input:', error);
    return false;
  }
};

/**
 * Submit the current chat input (equivalent to pressing Enter)
 * @returns True if submission was successful, false otherwise
 */
export const submitChatInput = (maxWaitTime = 5000): Promise<boolean> => {
  return new Promise(resolve => {
    try {
      const chatInput = findChatInputElement();

      if (!chatInput) {
        logMessage('Could not find chat input to submit');
        resolve(false);
        return;
      }

      // Define a function to find the submit button
      const findSubmitButton = (): HTMLButtonElement | null => {
        const submitButton =
          document.querySelector('button[aria-label="Submit"]') ||
          document.querySelector('button[aria-label="Send"]') ||
          document.querySelector('button[type="submit"]') ||
          // Look for a button next to the textarea
          chatInput.parentElement?.querySelector('button') ||
          // Common pattern: button with paper plane icon
          document.querySelector('button svg[stroke="currentColor"]')?.closest('button');

        return submitButton as HTMLButtonElement | null;
      };

      // Try to find and check the submit button
      const submitButton = findSubmitButton();

      if (submitButton) {
        logMessage(`Found submit button (${submitButton.getAttribute('aria-label') || 'unknown'})`);

        // Function to check if button is enabled and click it
        const tryClickingButton = () => {
          const button = findSubmitButton();
          if (!button) {
            logMessage('Submit button no longer found');
            resolve(false);
            return;
          }

          // Check if the button is disabled
          const isDisabled =
            button.disabled ||
            button.getAttribute('disabled') !== null ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.classList.contains('disabled');

          if (!isDisabled) {
            logMessage('Submit button is enabled, clicking it');
            button.click();
            resolve(true);
          } else {
            logMessage('Submit button is disabled, waiting...');
          }
        };

        // Set up a timer to periodically check if the button becomes enabled
        let elapsedTime = 0;
        const checkInterval = 200; // Check every 200ms

        const intervalId = setInterval(() => {
          elapsedTime += checkInterval;

          tryClickingButton();

          // If we've waited too long, try alternative methods
          if (elapsedTime >= maxWaitTime) {
            clearInterval(intervalId);
            logMessage(`Button remained disabled for ${maxWaitTime}ms, trying alternative methods`);

            // Method 2: Simulate Enter key press
            logMessage('Simulating Enter key press as fallback');

            // Focus the textarea first
            chatInput.focus();

            // Create and dispatch keydown event (Enter key)
            const keydownEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Create and dispatch keypress event
            const keypressEvent = new KeyboardEvent('keypress', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Create and dispatch keyup event
            const keyupEvent = new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            });

            // Dispatch all events in sequence
            chatInput.dispatchEvent(keydownEvent);
            chatInput.dispatchEvent(keypressEvent);
            chatInput.dispatchEvent(keyupEvent);

            // Try to find and submit a form as a last resort
            const form = chatInput.closest('form');
            if (form) {
              logMessage('Found form element, submitting it');
              form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
            }

            logMessage('Attempted all fallback methods to submit chat input');
            resolve(true);
          }
        }, checkInterval);

        // Initial check - maybe it's already enabled
        tryClickingButton();

        // If the button is already enabled and clicked, clear the interval
        if (submitButton && !submitButton.disabled) {
          clearInterval(intervalId);
        }
      } else {
        // If no button found, proceed with alternative methods immediately
        logMessage('No submit button found, trying alternative methods');

        // Method 2: Simulate Enter key press
        logMessage('Simulating Enter key press as fallback');

        // Focus the textarea first
        chatInput.focus();

        // Create and dispatch keydown event (Enter key)
        const keydownEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Create and dispatch keypress event
        const keypressEvent = new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Create and dispatch keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        // Dispatch all events in sequence
        chatInput.dispatchEvent(keydownEvent);
        chatInput.dispatchEvent(keypressEvent);
        chatInput.dispatchEvent(keyupEvent);

        // Try to find and submit a form as a last resort
        const form = chatInput.closest('form');
        if (form) {
          logMessage('Found form element, submitting it');
          form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        }

        logMessage('Attempted all methods to submit chat input');
        resolve(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error submitting chat input: ${errorMessage}`);
      logger.error('Error submitting chat input:', error);
      resolve(false);
    }
  });
};
