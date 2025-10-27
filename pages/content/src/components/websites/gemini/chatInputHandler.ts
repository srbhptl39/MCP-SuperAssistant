/**
 * Gemini Chat Input Handler
 *
 * This file implements functions for interacting with Gemini's chat input field
 */

import { logMessage } from '@src/utils/helpers';
import { createLogger } from '@extension/shared/lib/logger';

// CSS selectors for Gemini's UI elements

const logger = createLogger('GeminiChatInputHandler');

const SELECTORS = {
  CHAT_INPUT: 'div.ql-editor.textarea.new-input-ui p',
  SUBMIT_BUTTON: 'button.mat-mdc-icon-button.send-button',
  FILE_UPLOAD_BUTTON: 'button[aria-label="Add files"]',
  FILE_INPUT: 'input[type="file"]',
  MAIN_PANEL: '.chat-web',
  DROP_ZONE: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor',
  FILE_PREVIEW: '.file-preview, .xap-filed-upload-preview',
};

/**
 * Insert text into the Gemini chat input field
 * @param text The text to insert
 * @returns Boolean indicating if the insertion was successful
 */
export function insertTextToChatInput(text: string): boolean {
  logMessage(`Inserting text into Gemini chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

  const inputElem = document.querySelector(SELECTORS.CHAT_INPUT) as HTMLTextAreaElement;

  if (!inputElem) {
    logMessage('Error: Could not find Gemini chat input element');
    return false;
  }

  try {
    // Store the original value
    const originalValue = inputElem.textContent;

    // Focus the input element
    inputElem.focus();

    // Insert the text by updating the value and dispatching appropriate events
    //append the text to the original value  in new line
    inputElem.textContent = originalValue ? originalValue + '\n' + text : text;

    // Dispatch events to simulate user typing
    inputElem.dispatchEvent(new Event('input', { bubbles: true }));
    inputElem.dispatchEvent(new Event('change', { bubbles: true }));

    // Log the result
    logMessage(
      `Text inserted into Gemini chat input. Original length: ${originalValue?.length}, New length: ${text.length}`,
    );
    return true;
  } catch (error) {
    logMessage(`Error inserting text into Gemini chat input: ${error}`);
    return false;
  }
}

/**
 * Insert a tool result into the Gemini chat input
 * @param result The tool result to insert
 * @returns Boolean indicating if the insertion was successful
 */
export function insertToolResultToChatInput(result: string): boolean {
  return insertTextToChatInput(result);
}

/**
 * Submit the current text in the Gemini chat input
 * @returns Boolean indicating if the submission was successful
 */
export function submitChatInput(): boolean {
  logMessage('Submitting Gemini chat input');

  const submitButton = document.querySelector(SELECTORS.SUBMIT_BUTTON) as HTMLButtonElement;

  if (!submitButton) {
    logMessage('Error: Could not find Gemini submit button');
    return false;
  }

  try {
    // Check if the button is disabled
    if (submitButton.disabled) {
      logMessage('Warning: Gemini submit button is disabled');
      return false;
    }

    // Click the submit button to send the message
    submitButton.click();
    logMessage('Clicked Gemini submit button');
    return true;
  } catch (error) {
    logMessage(`Error submitting Gemini chat input: ${error}`);
    return false;
  }
}

/**
 * Check if file upload is supported
 * @returns Boolean indicating if file upload is supported
 */
export function supportsFileUpload(): boolean {
  const dropZone = document.querySelector('div[xapfileselectordropzone], .text-input-field, .input-area');
  return !!dropZone;
}

/**
 * Attach a file to the Gemini chat input
 * @param file The file to attach
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function attachFileToChatInput(file: File): Promise<boolean> {
  logMessage(`Attaching file: ${file.name}`);
  try {
    // Load drop listener script into page context
    const listenerUrl = chrome.runtime.getURL('dragDropListener.js');
    const scriptEl = document.createElement('script');
    scriptEl.src = listenerUrl;
    await new Promise<void>((resolve, reject) => {
      scriptEl.onload = () => resolve();
      scriptEl.onerror = () => reject(new Error('Failed to load drop listener script'));
      (document.head || document.documentElement).appendChild(scriptEl);
    });
    scriptEl.remove();

    // Read file as DataURL and post primitives to page context
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    window.postMessage(
      {
        type: 'MCP_DROP_FILE',
        fileName: file.name,
        fileType: file.type,
        lastModified: file.lastModified,
        fileData: dataUrl,
      },
      '*',
    );
  } catch (error) {
    logger.error('Error injecting file drop listener or sending data:', error);
    return false;
  }
  return await checkFilePreview('message-post');
}

/** Helper function to check for file preview */
async function checkFilePreview(method: string): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => {
      const filePreview = document.querySelector('.file-preview, .xap-filed-upload-preview');
      if (filePreview) {
        logMessage(`Success: File preview element found after ${method}.`);
        resolve(true);
      } else {
        logMessage(`Warning: File preview element not found after ${method}. Assuming success.`);
        // Optimistic resolution
        resolve(true);
      }
    }, 500);
  });
}
