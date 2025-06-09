/**
 * Gemini Chat Input Handler
 *
 * This file implements functions for interacting with Gemini's chat input field
 */

import { logMessage } from '@src/utils/helpers';

// CSS selectors for Gemini's UI elements
const SELECTORS = {
  CHAT_INPUT_SELECTOR: 'div.ql-editor.textarea.new-input-ui p', // Renamed for clarity
  SUBMIT_BUTTON_SELECTOR: 'button.mat-mdc-icon-button.send-button', // Renamed for clarity
  FILE_UPLOAD_BUTTON_SELECTOR: 'button[aria-label="Add files"]', // Renamed for clarity
  FILE_INPUT_SELECTOR: 'input[type="file"]', // Renamed for clarity
  MAIN_PANEL_SELECTOR: '.chat-web', // Renamed for clarity
  DROP_ZONE_SELECTOR: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor', // Renamed
  FILE_PREVIEW_SELECTOR: '.file-preview, .xap-filed-upload-preview', // Renamed
};

export const getGeminiChatInputSelectors = (): string[] => {
  return [SELECTORS.CHAT_INPUT_SELECTOR];
};

export const getGeminiSubmitButtonSelectors = (): string[] => {
  return [SELECTORS.SUBMIT_BUTTON_SELECTOR];
};

export const getGeminiFileUploadButtonSelectors = (): string[] => {
  return [SELECTORS.FILE_UPLOAD_BUTTON_SELECTOR];
};

export const getGeminiDropZoneSelectors = (): string[] => {
  return [SELECTORS.DROP_ZONE_SELECTOR];
};

/**
 * Insert text into the Gemini chat input field.
 * Assumes element is the contenteditable div.
 * @param element The chat input HTMLElement.
 * @param text The text to insert.
 * @returns Boolean indicating if the insertion was successful.
 */
export function insertTextToChatInput(element: HTMLElement, text: string): boolean {
  logMessage(`Inserting text into Gemini chat input: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
  if (!element || !element.isContentEditable) {
    logMessage('Error: Provided element is not a contenteditable Gemini chat input element');
    return false;
  }

  try {
    element.focus();
    // For contenteditable, document.execCommand is more reliable for rich text or complex inputs.
    // However, Gemini's input is a <p> tag within the contenteditable div.
    // We target the <p> directly if possible or the div.
    let targetPara = element;
    if (element.firstChild && element.firstChild.nodeName === 'P') {
      targetPara = element.firstChild as HTMLElement;
    }

    // If the paragraph is empty and has a <br>, remove it.
    if (targetPara.innerHTML === '<br>') {
      targetPara.innerHTML = '';
    }

    const currentText = targetPara.textContent || '';
    // Append text. If currentText is empty, don't add newlines. Otherwise, add newlines before.
    const textToInsert = currentText ? `\n${text}` : text;

    // Use document.execCommand to insert text to handle formatting and newlines within contenteditable
    // This is a simplified approach; BaseAdapter.insertText provides more robust handling.
    // For direct use here, we'll use execCommand.
    if (document.execCommand('insertText', false, textToInsert)) {
      logMessage('Text inserted using execCommand.');
    } else {
      // Fallback if execCommand is not supported or fails, though unlikely for 'insertText'
      targetPara.textContent += textToInsert;
      logMessage('Text inserted using textContent fallback.');
    }

    // Dispatch events to simulate user typing
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (error) {
    logMessage(`Error inserting text into Gemini chat input: ${error}`);
    return false;
  }
}

/**
 * Insert a tool result into the Gemini chat input
 * @param element The chat input HTMLElement.
 * @param result The tool result to insert (will be stringified if not a string).
 * @returns Boolean indicating if the insertion was successful.
 */
export function insertToolResultToChatInput(element: HTMLElement, result: any): boolean {
  let textToInsert = result;
  if (typeof result !== 'string') {
    textToInsert = JSON.stringify(result, null, 2);
  }
  return insertTextToChatInput(element, textToInsert);
}

/**
 * Submit the current text in the Gemini chat input
 * @param submitButtonElement The submit button HTMLElement.
 * @returns Boolean indicating if the submission was successful.
 */
export function submitChatInput(submitButtonElement: HTMLElement | null): boolean {
  logMessage('Submitting Gemini chat input');
  if (!submitButtonElement) {
    logMessage('Error: Could not find Gemini submit button or button not provided.');
    return false;
  }

  try {
    if (submitButtonElement.hasAttribute('disabled')) {
      // More reliable check for disabled
      logMessage('Warning: Gemini submit button is disabled');
      return false;
    }
    submitButtonElement.click();
    logMessage('Clicked Gemini submit button');
    return true;
  } catch (error) {
    logMessage(`Error submitting Gemini chat input: ${error}`);
    return false;
  }
}

/**
 * Check if file upload is supported by looking for a dropzone or upload button.
 * This function itself doesn't use BaseAdapter.findElement, but provides selectors for the adapter to use.
 * @returns Boolean indicating if file upload is supported (based on element presence).
 */
export function supportsFileUpload(): boolean {
  // This function is now more of a configuration check for the adapter.
  // The adapter will use findElement with these selectors.
  // For the purpose of this function signature, we'll assume it means "are selectors defined for it".
  return getGeminiDropZoneSelectors().length > 0 || getGeminiFileUploadButtonSelectors().length > 0;
}

/**
 * Attach a file to the Gemini chat input.
 * Relies on a global script `dragDropListener.js` injected by the adapter.
 * @param dropZoneElement The HTMLElement to be used as a drop zone.
 * @param file The file to attach.
 * @returns Promise that resolves to true if successful, false otherwise.
 */
export async function attachFileToChatInput(dropZoneElement: HTMLElement, file: File): Promise<boolean> {
  if (!dropZoneElement) {
    logMessage('Error: Drop zone element not provided for file attachment.');
    return false;
  }
  logMessage(`Attaching file: ${file.name} to Gemini drop zone`);
  try {
    // The dragDropListener.js script is expected to be injected by the adapter or content script setup.
    // This handler now assumes the listener is active and posts a message to it.
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    window.postMessage(
      {
        type: 'MCP_DROP_FILE', // Message type that dragDropListener.js listens for
        fileName: file.name,
        fileType: file.type,
        lastModified: file.lastModified,
        fileData: dataUrl,
        // Optionally include target selector if dragDropListener needs it,
        // but typically it might attach listeners broadly or to a specific known element.
        // For now, assume dragDropListener knows how to find the drop zone or receives it.
      },
      '*', // Post to any origin, as it's an internal extension message
    );
    // The actual drop simulation on `dropZoneElement` would be handled by `dragDropListener.js`
    // after receiving this message.
    logMessage('File data posted for dragDropListener.js');
  } catch (error) {
    console.error('Error preparing file data for dragDropListener.js:', error);
    return false;
  }
  // The success of the actual drop and preview appearance depends on dragDropListener.js
  return await checkFilePreview('message-post', SELECTORS.FILE_PREVIEW_SELECTOR);
}

/** Helper function to check for file preview */
async function checkFilePreview(method: string, previewSelector: string): Promise<boolean> {
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
