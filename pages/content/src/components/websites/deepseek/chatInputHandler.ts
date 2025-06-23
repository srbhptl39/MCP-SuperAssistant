/**
 * Chat Input Handler
 *
 * Utility functions for interacting with the DeepSeek chat input area
 */

import { logMessage } from '@src/utils/helpers';

// Cache for the last found input element to improve reliability
let lastFoundInputElement: HTMLElement | null = null;

/**
 * Find the DeepSeek chat input element
 * @returns The chat input element or null if not found
 */
export const findChatInputElement = (): HTMLElement | null => {
  // Try to find DeepSeek's textarea or contenteditable div
  // Note: These selectors may need to be updated based on DeepSeek's actual DOM structure
  const deepseekInput = document.querySelector(
    'textarea[aria-label="Ask DeepSeek anything"], textarea[placeholder="Ask anything"], textarea[placeholder], textarea[spellcheck="false"], textarea[data-gramm="false"], div.css-146c3p1 textarea, textarea.r-30o5oe, div[contenteditable="true"]',
  );

  if (deepseekInput) {
    logMessage('Found DeepSeek input element');
    lastFoundInputElement = deepseekInput as HTMLElement;
    return deepseekInput as HTMLElement;
  }

  // Fallback: Try to find the input element using common chat input patterns
  logMessage('Primary selector failed, trying fallback method');

  // Try to find by common class names or attributes used in chat interfaces
  const possibleInputSelectors = [
    'textarea.chat-input',
    'div[role="textbox"]',
    'div.chat-input',
    'textarea[data-testid="chat-input"]',
    'div[contenteditable="true"]',
    'textarea.message-input',
    'textarea[aria-label="Ask DeepSeek anything"]',
  ];

  for (const selector of possibleInputSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      logMessage(`Found DeepSeek input element via selector: ${selector}`);
      lastFoundInputElement = element as HTMLElement;
      return element as HTMLElement;
    }
  }

  // If we still haven't found it, try using the last found element if available
  if (lastFoundInputElement && document.body.contains(lastFoundInputElement)) {
    logMessage('Using cached input element');
    return lastFoundInputElement;
  }

  logMessage('Could not find DeepSeek input element');
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
      logMessage('Could not find DeepSeek input element');
      console.error('Could not find DeepSeek input element');
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

      logMessage('Appended text to element via textContent property');
      return true;
    }
  } catch (error) {
    logMessage(`Error inserting text into DeepSeek input: ${error}`);
    console.error('Error inserting text into DeepSeek input:', error);
    return false;
  }
};

/**
 * Insert tool result into the chat input
 * @param result The tool result to insert
 * @returns True if successful, false otherwise
 */
export const insertToolResultToChatInput = (result: string): boolean => {
  logMessage('Inserting tool result to DeepSeek chat input');
  // const formattedResult = wrapInToolOutput(result);
  return insertTextToChatInput(result);
};

/**
 * Attach a file to the chat input
 * @param file The file to attach
 * @returns True if successful, false otherwise
 */
export const attachFileToChatInput = (file: File): boolean => {
  logMessage(`Attempting to attach file to DeepSeek chat input: ${file.name}`);
  try {
    // Find file input element
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    if (!fileInput) {
      logMessage('Could not find file input element in DeepSeek');
      return false;
    }

    // Create a DataTransfer object to simulate a file drop
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Trigger change event
    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);

    logMessage(`Successfully attached file: ${file.name}`);
    return true;
  } catch (error) {
    logMessage(`Error attaching file to DeepSeek chat: ${error}`);
    console.error('Error attaching file to DeepSeek chat:', error);
    return false;
  }
};

/**
 * Submit the chat input
 * @returns True if successful, false otherwise
 */
export const submitChatInput = async (maxWaitTime = 5000): Promise<boolean> => {
  try {
    // Find the chat input element
    let chatInput: HTMLElement | null = null;
    if (window.location.hostname === 'chat.deepseek.com') {
      chatInput = findChatInputElement();

      if (!chatInput) {
        logMessage('Could not find DeepSeek input element for submission');
        return false;
      }
    }

    // First try to find a submit button
    const submitButtonSelectors = [
      // 'button[type="submit"]',
      'button[aria-label="Submit"]',
      'button.send-button',
      'button[aria-label="Send message"]',
      'button.chat-submit',
      'button[data-testid="send-button"]',
      'svg.send-icon',
      'button.submit-button',
    ];

    let submitButton: HTMLElement | null = null;

    for (const selector of submitButtonSelectors) {
      const button = document.querySelector(selector);
      if (button && button instanceof HTMLElement) {
        submitButton = button;
        // console.debug(submitButton)
        break;
      }
    }

    if (submitButton) {
      logMessage('Found submit button, clicking it');
      submitButton.click();
      return true;
    }

    // If no submit button found, try to simulate Enter key press
    logMessage('No submit button found, simulating Enter key press');

    // Create and dispatch keydown event
    const enterKeyEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });

    if (chatInput) {
      chatInput.dispatchEvent(enterKeyEvent);
    } else {
      logMessage('No chat input found for dispatching Enter key event');
      return false;
    }

    // If the keydown event didn't trigger submission (it was prevented),
    // try to find and click a submit button again after a short delay
    return new Promise(resolve => {
      setTimeout(() => {
        // Check if any new submit buttons appeared
        for (const selector of submitButtonSelectors) {
          const button = document.querySelector(selector);
          if (button && button instanceof HTMLElement) {
            logMessage('Found submit button after delay, clicking it');
            button.click();
            resolve(true);
            return;
          }
        }

        // If still no submit button, try one more approach: form submission
        if (!chatInput) {
          logMessage('No chat input found for form submission');
          resolve(false);
          return;
        }

        const form = chatInput.closest('form');
        if (form) {
          logMessage('Found form, submitting it');
          form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
          resolve(true);
          return;
        }

        logMessage('Could not find a way to submit the DeepSeek chat input');
        resolve(false);
      }, 500);
    });
  } catch (error) {
    logMessage(`Error submitting DeepSeek chat input: ${error}`);
    console.error('Error submitting DeepSeek chat input:', error);
    return false;
  }
};
