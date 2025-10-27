/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the ChatGPT chat input area
 */

import { logMessage } from '@src/utils/helpers';
import { createLogger } from '@extension/shared/lib/logger';

// Cache for the last found input element to improve reliability

const logger = createLogger('ChatInputHandler');

let lastFoundInputElement: HTMLElement | null = null;

/**
 * Find the ChatGPT chat input element
 * @returns The chat input element or null if not found
 */
export const findChatInputElement = (): HTMLElement | null => {
  // Try to find ChatGPT's contenteditable div
  const chatGptInput = document.querySelector(
    'div[contenteditable="true"][translate="no"][class="ProseMirror"][id="prompt-textarea"]',
  );

  if (chatGptInput) {
    logMessage('Found ChatGPT input element');
    lastFoundInputElement = chatGptInput as HTMLElement;
    return chatGptInput as HTMLElement;
  }

  // Fallback: Try to find the input element using the placeholder element
  logMessage('Primary selector failed, trying fallback method');
  const placeholderElement = document.querySelector('p[data-placeholder="Ask anything"].placeholder');

  if (placeholderElement) {
    logMessage('Found placeholder element, looking for parent input element');
    // The placeholder is typically inside the actual input element or a sibling
    // First, try to find a parent that is contenteditable
    let parent = placeholderElement.parentElement;
    while (parent) {
      if (parent.getAttribute('contenteditable') === 'true') {
        logMessage('Found ChatGPT input element via placeholder parent');
        lastFoundInputElement = parent;
        return parent;
      }
      parent = parent.parentElement;
    }

    // If no contenteditable parent found, look for a sibling of the parent that is contenteditable
    const parentSiblings = placeholderElement.parentElement?.parentElement?.children;
    if (parentSiblings) {
      for (let i = 0; i < parentSiblings.length; i++) {
        const sibling = parentSiblings[i];
        if (sibling.getAttribute('contenteditable') === 'true') {
          logMessage('Found ChatGPT input element via placeholder sibling');
          lastFoundInputElement = sibling as HTMLElement;
          return sibling as HTMLElement;
        }
      }
    }
  }

  // Second fallback: Try to find the textarea element with placeholder "Ask anything..."
  logMessage('First fallback failed, trying textarea selector');
  const textareaElement = document.querySelector('textarea[placeholder="Ask anything..."]');

  if (textareaElement) {
    logMessage('Found ChatGPT input element via textarea selector');
    lastFoundInputElement = textareaElement as HTMLElement;
    return textareaElement as HTMLElement;
  }

  logMessage('Could not find ChatGPT input element');
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
 * Insert text into the chat input
 * @param text The text to insert
 * @returns True if successful, false otherwise
 */
export const insertTextToChatInput = (text: string): boolean => {
  try {
    const chatInput = findChatInputElement();

    if (!chatInput) {
      logMessage('Could not find ChatGPT input element');
      logger.error('Could not find ChatGPT input element');
      return false;
    }

    // First check if it's a textarea element (most reliable method)
    if (chatInput.tagName === 'TEXTAREA') {
      const textarea = chatInput as HTMLTextAreaElement;
      const currentText = textarea.value;

      // For textareas, we can just use the \n character directly
      const formattedText = currentText ? `${currentText}\n\n${text}` : text;
      textarea.value = formattedText;

      // Position cursor at the end
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

      // Trigger input event
      const inputEvent = new InputEvent('input', { bubbles: true });
      textarea.dispatchEvent(inputEvent);

      // Focus the textarea
      textarea.focus();

      logMessage('Appended text to textarea with preserved newlines');
      return true;
    }
    // Check if it's a contenteditable div
    else if (chatInput.getAttribute('contenteditable') === 'true') {
      // More reliable approach for contenteditable elements using Selection and Range
      // This preserves the current content and adds the new text at the end
      // with proper newline handling

      // First, focus the element and move cursor to the end
      chatInput.focus();

      // Get current content
      const currentText = chatInput.textContent || '';

      // Create a text node with the new content
      const textToInsert = text;

      // If there's existing content, add newlines before the new text
      if (currentText && currentText.trim() !== '') {
        // Ensure the element has some content at the end to place cursor after
        if (!chatInput.lastChild || chatInput.lastChild.nodeType !== Node.TEXT_NODE) {
          chatInput.appendChild(document.createTextNode(''));
        }

        // Move cursor to the end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(chatInput);
        range.collapse(false); // collapse to end
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Insert two newlines before the text
        document.execCommand('insertText', false, '\n\n');
      }

      // Use execCommand to insert text, which properly handles newlines
      document.execCommand('insertText', false, textToInsert);

      // Trigger input event for contenteditable
      const inputEvent = new InputEvent('input', { bubbles: true });
      chatInput.dispatchEvent(inputEvent);

      logMessage('Appended text to contenteditable with preserved newlines using execCommand');
      return true;
    }
    // Fallback for other element types
    else {
      logMessage('Using fallback method for unknown element type');

      // Try using value property first (for input-like elements)
      if ('value' in chatInput) {
        const inputElement = chatInput as HTMLInputElement;
        const currentValue = inputElement.value;
        inputElement.value = currentValue ? `${currentValue}\n\n${text}` : text;

        // Trigger input event
        const inputEvent = new InputEvent('input', { bubbles: true });
        inputElement.dispatchEvent(inputEvent);

        // Focus the element
        inputElement.focus();

        logMessage('Appended text to input element via value property');
        return true;
      }

      // Last resort: use textContent
      const currentText = chatInput.textContent || '';
      chatInput.textContent = currentText ? `${currentText}\n\n${text}` : text;

      // Trigger input event
      const inputEvent = new InputEvent('input', { bubbles: true });
      chatInput.dispatchEvent(inputEvent);

      // Focus the element
      chatInput.focus();

      logMessage('Appended text using textContent (fallback method)');
      return true;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error appending text to ChatGPT input: ${errorMessage}`);
    logger.error('Error appending text to ChatGPT input:', error);
    return false;
  }
};

/**
 * Insert tool result into the chat input
 * @param result The tool result to insert
 * @returns True if successful, false otherwise
 */
export const insertToolResultToChatInput = (result: any): boolean => {
  try {
    // Format the tool result as JSON string
    // const formattedResult = formatAsJson(result);
    // const wrappedResult = wrapInToolOutput(formattedResult);
    // Convert result to string if it's not already a string
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
 * Attach a file to the ChatGPT input
 * @param file The file to attach
 * @returns Promise that resolves to true if successful
 */
export const attachFileToChatInput = async (file: File): Promise<boolean> => {
  try {
    // Find the ChatGPT input element
    const chatInput = findChatInputElement();

    if (!chatInput) {
      logMessage('Could not find ChatGPT input element for file attachment');
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

    logMessage(`Attached file ${file.name} to ChatGPT input`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(`Error attaching file to ChatGPT input: ${errorMessage}`);
    logger.error('Error attaching file to ChatGPT input:', error);
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
      // Try to use the cached input element first, then fall back to finding it again
      const chatInput = lastFoundInputElement || findChatInputElement();

      if (!chatInput) {
        logMessage('Could not find chat input to submit');
        resolve(false);
        return;
      }

      // Define a function to find the submit button
      const findSubmitButton = (): HTMLButtonElement | null => {
        const submitButton =
          document.querySelector('button[aria-label="Send message"]') ||
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[aria-label="Send prompt"]') ||
          // Try to find button with paper airplane icon (common pattern in ChatGPT)
          document.querySelector('button svg[data-icon="paper-airplane"]')?.closest('button') ||
          document.querySelector('button svg path[d*="M12 3.5"]')?.closest('button') ||
          // Look for any button near the input area that looks like a submit button
          chatInput.closest('form')?.querySelector('button[type="submit"]') ||
          chatInput.closest('div')?.querySelector('button:last-child');

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

            // Method 2: Look for the form and submit it directly
            const form = chatInput.closest('form');
            if (form) {
              logMessage('Found form element, submitting it');
              const submitEvent = new SubmitEvent('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
              resolve(true);
              return;
            }

            // Method 3: Simulate Enter key press
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
              composed: true, // This enables the event to cross the shadow DOM boundary
            });

            // Create and dispatch keypress event
            const keypressEvent = new KeyboardEvent('keypress', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
              composed: true,
            });

            // Create and dispatch keyup event
            const keyupEvent = new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
              composed: true,
            });

            // Dispatch all events in sequence
            const keydownResult = chatInput.dispatchEvent(keydownEvent);
            const keypressResult = chatInput.dispatchEvent(keypressEvent);
            const keyupResult = chatInput.dispatchEvent(keyupEvent);

            logMessage(
              `Attempted to submit chat input via key simulation (keydown: ${keydownResult}, keypress: ${keypressResult}, keyup: ${keyupResult})`,
            );
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

        // Method 2: Look for the form and submit it directly
        const form = chatInput.closest('form');
        if (form) {
          logMessage('Found form element, submitting it');
          const submitEvent = new SubmitEvent('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
          resolve(true);
          return;
        }

        // Method 3: Simulate Enter key press
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
          composed: true,
        });

        // Create and dispatch keypress event
        const keypressEvent = new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        });

        // Create and dispatch keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        });

        // Dispatch all events in sequence
        const keydownResult = chatInput.dispatchEvent(keydownEvent);
        const keypressResult = chatInput.dispatchEvent(keypressEvent);
        const keyupResult = chatInput.dispatchEvent(keyupEvent);

        logMessage(
          `Attempted to submit chat input via key simulation (keydown: ${keydownResult}, keypress: ${keypressResult}, keyup: ${keyupResult})`,
        );
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
