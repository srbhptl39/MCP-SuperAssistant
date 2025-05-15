/**
 * AgentHustle Chat Input Handler
 * 
 * This file contains functions for interacting with AgentHustle's chat interface.
 */

import { logMessage } from '../../../utils/helpers';

/**
 * Insert text into the chat input field
 */
export function insertToolResultToChatInput(text: string): void {
  try {
    // Find the chat input element using the correct selector
    const chatInput = document.querySelector('input.flex-1.rounded-lg.border.border-border.bg-card.px-3.py-2.text-card-foreground') as HTMLInputElement;
    if (!chatInput) {
      throw new Error('Chat input element not found');
    }

    // Insert the text
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    logMessage('Successfully inserted text into AgentHustle chat input');
  } catch (error) {
    logMessage(`Error inserting text into AgentHustle chat input: ${error}`);
  }
}

/**
 * Submit the chat input
 */
export function submitChatInput(): void {
  try {
    // Find the submit button - it's likely next to the input
    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (!submitButton) {
      throw new Error('Submit button not found');
    }

    // Click the button
    submitButton.click();
    logMessage('Successfully submitted AgentHustle chat input');
  } catch (error) {
    logMessage(`Error submitting AgentHustle chat input: ${error}`);
  }
}

/**
 * Check if file upload is supported
 */
export function supportsFileUpload(): boolean {
  // Return true if AgentHustle supports file uploads
  return false;
}

/**
 * Attach a file to the chat input
 */
export async function attachFileToChatInput(file: File): Promise<boolean> {
  try {
    // Find the file input element
    const fileInput = document.querySelector('input[type="file"].chat-file-input') as HTMLInputElement;
    if (!fileInput) {
      throw new Error('File input element not found');
    }

    // Create a DataTransfer object and add the file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Trigger change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    logMessage('Successfully attached file to AgentHustle chat input');
    return true;
  } catch (error) {
    logMessage(`Error attaching file to AgentHustle chat input: ${error}`);
    return false;
  }
} 