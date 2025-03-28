/**
 * Gemini Chat Input Handler
 *
 * This file implements functions for interacting with Gemini's chat input field
 */

import { logMessage } from '@src/utils/helpers';

// CSS selectors for Gemini's UI elements
const SELECTORS = {
  CHAT_INPUT: 'div.ql-editor.textarea.new-input-ui p',
  SUBMIT_BUTTON: 'button.mat-mdc-icon-button.send-button[aria-label="Send message"]',
  FILE_UPLOAD_BUTTON: 'button[aria-label="Add files"]',
  FILE_INPUT: 'input[type="file"]',
  MAIN_PANEL: '.chat-web',
  DROP_ZONE: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor',
  FILE_PREVIEW: '.file-preview, .xap-filed-upload-preview'
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
    logMessage(`Text inserted into Gemini chat input. Original length: ${originalValue?.length}, New length: ${text.length}`);
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
  logMessage(`Attaching file to Gemini chat input: ${file.name} (${file.type}, ${file.size} bytes)`);
  
  try {
    // Target the drop zone with multiple fallback selectors - exactly as in the working example
    const dropZone = 
      document.querySelector('div[xapfileselectordropzone]') || 
      document.querySelector('.text-input-field') ||
      document.querySelector('.input-area');
    
    if (!dropZone) {
      logMessage('Error: Drop zone not found using any of the selectors');
      return false;
    }
    
    logMessage(`Found drop zone: ${dropZone.className}`);
    
    // Create a DataTransfer-like object exactly as in the working example
    const dataTransfer = {
      files: [file],
      types: ['Files', 'application/x-moz-file'],
      items: [{
        kind: 'file',
        type: file.type,
        getAsFile: function() { return file; }
      }],
      getData: function(format: string) { 
        if (format.toLowerCase() === 'text/plain') return '';
        return ''; 
      },
      setData: function() {},
      clearData: function() {},
      dropEffect: 'copy',
      effectAllowed: 'copyMove'
    };
    
    // Create events exactly as in the working example
    const dragEnterEvent = new Event('dragenter', { bubbles: true, cancelable: true });
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    
    // Attach dataTransfer to all events
    [dragEnterEvent, dragOverEvent, dropEvent].forEach(event => {
      Object.defineProperty(event, 'dataTransfer', {
        value: dataTransfer,
        writable: false
      });
    });
    
    // Override preventDefault exactly as in the working example
    dragOverEvent.preventDefault = function() { 
      logMessage('dragover preventDefault called');
      Event.prototype.preventDefault.call(this);
    };
    
    dropEvent.preventDefault = function() { 
      logMessage('drop preventDefault called');
      Event.prototype.preventDefault.call(this);
    };
    
    // Complete drag simulation sequence exactly as in the working example
    logMessage('Starting drag simulation sequence');
    
    logMessage('1. Dispatching dragenter event');
    dropZone.dispatchEvent(dragEnterEvent);
    
    logMessage('2. Dispatching dragover event');
    dropZone.dispatchEvent(dragOverEvent);
    
    logMessage('3. Dispatching drop event');
    dropZone.dispatchEvent(dropEvent);
    
    logMessage('Drag and drop simulation completed');
    
    // Validate the operation worked by checking for file preview element
    return new Promise((resolve) => {
      setTimeout(() => {
        const filePreview = document.querySelector('.file-preview');
        if (filePreview) {
          logMessage('Success: File preview element found in DOM');
          resolve(true);
        } else {
          logMessage('Note: File preview element not found in DOM. Checking alternative indicators...');
          
          // Check for other possible indicators of success
          const fileAttachment = document.querySelector('.attached-file');
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          const hasFileInInput = fileInput && fileInput.files && fileInput.files.length > 0;
          
          if (fileAttachment || hasFileInInput) {
            logMessage('Success: File attachment indicator found');
            resolve(true);
          } else {
            // Final fallback: try a direct file input approach
            const fileInputs = document.querySelectorAll('input[type="file"]');
            if (fileInputs.length > 0) {
              logMessage('Attempting fallback with direct file input');
              try {
                const dt = new DataTransfer();
                dt.items.add(file);
                
                // Try with each file input found
                let success = false;
                fileInputs.forEach((input: Element) => {
                  try {
                    const fileInput = input as HTMLInputElement;
                    Object.defineProperty(fileInput, 'files', {
                      value: dt.files,
                      writable: false
                    });
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    success = true;
                    logMessage('Success: Fallback file input method successful');
                  } catch (err) {
                    logMessage(`Error with fallback for input ${(input as HTMLInputElement).id || 'unnamed'}: ${err}`);
                  }
                });
                
                resolve(success);
              } catch (err) {
                logMessage(`Error in final fallback: ${err}`);
                resolve(false);
              }
            } else {
              logMessage('Warning: File likely not attached. No success indicators found.');
              resolve(false);
            }
          }
        }
      }, 1000);
    });
  } catch (error) {
    logMessage(`Error attaching file to Gemini chat input: ${error}`);
    return false;
  }
} 