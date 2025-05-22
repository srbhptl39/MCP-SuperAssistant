import type { ParamValueElement } from '../core/types';
import { StabilizedBlock } from '../core/types';
import { CONFIG } from '../core/config';
import { safelySetContent } from '../utils/index';
import { storeExecutedFunction, generateContentSignature } from '../mcpexecute/storage';
import { checkAndDisplayFunctionHistory, createHistoryPanel, updateHistoryPanel } from './functionHistory';

// Add type declarations for the global adapter access
declare global {
  interface Window {
    mcpAdapter?: any;
    getCurrentAdapter?: () => any;
  }
}

const MAX_INSERT_LENGTH = 39000; // Define the threshold for maximum insert length
const WEBSITE_NAME_FOR_MAX_INSERT_LENGTH_CHECK = ['perplexity'];
// const WEBSITE_NAME_FOR_MAX_INSERT_LENGTH_CHECK = ['perplexity', 'chatgpt', 'chatgpt.com', 'chat.openai.com'];
const websiteName = window.location.hostname
  .toLowerCase()
  .replace(/^www\./i, '')
  .split('.')[0];
/**
 * Add the raw XML toggle button and pre element to a function block
 *
 * @param blockDiv Function block div container
 * @param rawContent Raw XML content to display when toggled
 */
export const addRawXmlToggle = (blockDiv: HTMLDivElement, rawContent: string): void => {
  // Check for existing toggle to avoid duplicates
  if (blockDiv.querySelector('.raw-toggle')) {
    return;
  }

  // Get the original pre element that contains the function call
  const blockId = blockDiv.getAttribute('data-block-id');
  const originalBlock = null;

  if (blockId) {
    // Try to find the original element with the complete XML
    const originalPre = document.querySelector(`pre[data-block-id="${blockId}"]`);
    if (originalPre) {
      // Use the original content directly
      rawContent = originalPre.textContent?.trim() || rawContent;
    }
  }

  // Create container for raw XML content (similar to function-results-panel)
  const rawXmlContainer = document.createElement('div');
  rawXmlContainer.className = 'function-results-panel xml-results-panel';
  rawXmlContainer.style.display = 'none';
  rawXmlContainer.style.marginTop = '12px';
  rawXmlContainer.style.marginBottom = '4px';

  // Create the pre element for displaying raw XML
  const rawXmlPre = document.createElement('pre');
  rawXmlPre.style.whiteSpace = 'pre-wrap'; // Ensure wrapping in raw view
  rawXmlPre.style.margin = '0'; // Remove default margins
  rawXmlPre.style.padding = '12px';
  // Use system font styling - inherit from parent
  rawXmlPre.style.fontFamily = 'inherit';
  rawXmlPre.style.fontSize = '13px';
  rawXmlPre.style.lineHeight = '1.5';
  rawXmlPre.textContent = rawContent;

  // Add pre to container
  rawXmlContainer.appendChild(rawXmlPre);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'raw-toggle';
  toggleBtn.textContent = 'Show Raw XML';
  toggleBtn.style.display = 'flex';
  toggleBtn.style.alignItems = 'center';
  toggleBtn.style.justifyContent = 'center';
  toggleBtn.style.gap = '6px';

  // Create icon for toggle button
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="currentColor"/></svg>';
  iconSpan.style.display = 'inline-flex';
  toggleBtn.prepend(iconSpan);

  toggleBtn.onclick = () => {
    if (rawXmlContainer.style.display === 'none') {
      rawXmlContainer.style.display = 'block';
      toggleBtn.textContent = 'Hide Raw XML';
      // Re-add the icon
      toggleBtn.prepend(iconSpan);
    } else {
      rawXmlContainer.style.display = 'none';
      toggleBtn.textContent = 'Show Raw XML';
      // Re-add the icon
      toggleBtn.prepend(iconSpan);
    }
  };

  // Add toggle button to the container
  blockDiv.appendChild(toggleBtn);

  // Always add the raw XML container to the main block div
  // This ensures it's not constrained by the button container's layout
  if (blockDiv.classList.contains('function-buttons')) {
    // If we're in a button container, add rawXmlContainer to the parent
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      parentBlock.appendChild(rawXmlContainer);
    } else {
      blockDiv.appendChild(rawXmlContainer);
    }
  } else {
    blockDiv.appendChild(rawXmlContainer);
  }
};

/**
 * Setup auto-scroll functionality for parameter value divs
 *
 * @param paramValueDiv Parameter value div element
 */
export const setupAutoScroll = (paramValueDiv: ParamValueElement): void => {
  // Auto scroll disabled.
};

/**
 * Stabilize block height to prevent layout shifts during updates
 *
 * @param block The block element
 */
export const stabilizeBlock = (block: HTMLElement): void => {
  if (block.style.height === '') {
    const rect = block.getBoundingClientRect();
    block.style.height = `${rect.height}px`;
    block.style.overflow = 'hidden'; // Optional: prevent content overflow during transition
    if (CONFIG.debug) console.debug(`Stabilized block height: ${rect.height}px`);
  }
};

/**
 * Remove stabilized height
 *
 * @param block The block element
 */
export const unstabilizeBlock = (block: HTMLElement): void => {
  if (block.style.height !== '') {
    block.style.height = '';
    block.style.overflow = ''; // Reset overflow
    if (CONFIG.debug) console.debug('Unstabilized block height');
  }
};

/**
 * Smoothly update a function block's content without causing flicker
 *
 * @param block The function block to update
 * @param newContent New HTML content to place inside the block
 * @param isStreaming Whether the content is still streaming
 */
export const smoothlyUpdateBlockContent = (
  block: HTMLElement,
  newContent: string | HTMLElement,
  isStreaming: boolean = false,
): void => {
  if (!block) return;

  // Check if we're already updating this block to prevent multiple updates
  // For streaming content, allow updates regardless of lock state to prevent freezing during rapid updates
  if (!isStreaming && block.hasAttribute('data-smooth-updating')) return;

  // Store the original state before we begin modifications
  const blockId = block.getAttribute('data-block-id');
  const originalClasses = Array.from(block.classList);
  const originalAttributes = Array.from(block.attributes)
    .filter(attr => !['data-smooth-updating', 'style'].includes(attr.name))
    .map(attr => ({ name: attr.name, value: attr.value }));

  // Mark block as currently updating
  block.setAttribute('data-smooth-updating', 'true');

  // Create a shadow element to track the original block in case it gets removed
  const shadowTracker = document.createElement('div');
  shadowTracker.style.display = 'none';
  shadowTracker.setAttribute('data-shadow-for', blockId || 'unknown-block');
  shadowTracker.setAttribute('data-update-in-progress', 'true');
  // Insert shadow element as a sibling to track position in DOM
  if (block.parentNode) {
    block.parentNode.insertBefore(shadowTracker, block.nextSibling);
  }

  // Store original dimensions to minimize layout shifts
  const originalHeight = block.clientHeight;
  const originalScrollHeight = block.scrollHeight;
  const originalWidth = block.clientWidth;
  const wasScrollable = block.scrollHeight > block.clientHeight;
  const scrollPosition = block.scrollTop;
  const originalParent = block.parentNode;
  const originalNextSibling = block.nextSibling;

  // For streaming content, use more conservative stabilization
  if (isStreaming) {
    stabilizeBlock(block);
  }

  // Create a temporary container for the new content
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.visibility = 'hidden';
  tempContainer.style.width = `${originalWidth}px`;
  tempContainer.classList.add('function-block-temp');

  // Add the new content to the temp container using CSP-safe methods
  if (typeof newContent === 'string') {
    // Use DOM methods instead of innerHTML for CSP safety
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(newContent, 'text/html');
      // Import and append each node from the body
      Array.from(doc.body.childNodes).forEach(node => {
        tempContainer.appendChild(document.importNode(node, true));
      });
    } catch (e) {
      // Fallback to simpler method if DOMParser fails
      tempContainer.textContent = newContent;
    }
  } else {
    // Clone the HTMLElement instead
    tempContainer.appendChild(newContent.cloneNode(true));
  }

  // Add temporary container to DOM to calculate its dimensions
  document.body.appendChild(tempContainer);
  const newHeight = tempContainer.offsetHeight;
  document.body.removeChild(tempContainer);

  // Prepare the block for smooth transition
  block.style.height = `${originalHeight}px`;
  block.style.overflow = 'hidden';
  block.style.transition = isStreaming ? 'height 0.15s ease-in-out' : 'height 0.25s ease-in-out';

  // Create wrapper for current content to allow fade transition
  const contentWrapper = document.createElement('div');
  contentWrapper.classList.add('function-content-wrapper');

  // Move all child elements to the wrapper
  while (block.firstChild) {
    contentWrapper.appendChild(block.firstChild);
  }

  // Add the wrapper back to the block
  block.appendChild(contentWrapper);

  // Create new content wrapper with fade-in effect
  const newContentWrapper = document.createElement('div');
  newContentWrapper.classList.add('function-content-wrapper', 'function-content-new');
  newContentWrapper.style.opacity = '0';
  newContentWrapper.style.transform = 'translateY(10px)';
  newContentWrapper.style.transition = isStreaming
    ? 'opacity 0.1s ease-out, transform 0.1s ease-out'
    : 'opacity 0.2s ease-out, transform 0.2s ease-out';

  // Add new content using CSP-safe methods
  if (typeof newContent === 'string') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(newContent, 'text/html');
      // Import and append each node from the body
      Array.from(doc.body.childNodes).forEach(node => {
        newContentWrapper.appendChild(document.importNode(node, true));
      });
    } catch (e) {
      // Fallback to simpler method if DOMParser fails
      newContentWrapper.textContent = newContent;
    }
  } else {
    // Clone each child node individually
    Array.from(newContent.childNodes).forEach(node => {
      newContentWrapper.appendChild(node.cloneNode(true));
    });
  }

  // Add the new content wrapper
  block.appendChild(newContentWrapper);

  // Force a reflow to ensure transitions work
  void block.offsetWidth;

  // Start transitions
  contentWrapper.style.opacity = '0';
  contentWrapper.style.transform = 'translateY(-10px)';
  contentWrapper.style.transition = isStreaming
    ? 'opacity 0.1s ease-out, transform 0.1s ease-out'
    : 'opacity 0.15s ease-out, transform 0.15s ease-out';

  // Adjust height for the new content
  block.style.height = `${newHeight}px`;

  // After a short delay, show the new content
  setTimeout(
    () => {
      newContentWrapper.style.opacity = '1';
      newContentWrapper.style.transform = 'translateY(0)';
    },
    isStreaming ? 30 : 50,
  );

  // Setup a mutation observer to detect if our block is removed from the DOM
  let blockRemoved = false;
  let replacementBlock: HTMLElement | null = null;

  const observeRoot = originalParent || document.body;
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Check if our block was removed
        if (Array.from(mutation.removedNodes).includes(block)) {
          blockRemoved = true;

          // Look for a replacement function block that was added
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i] as HTMLElement;
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.classList.contains('function-block') &&
              node.getAttribute('data-block-id') === blockId
            ) {
              replacementBlock = node;
              break;
            }
          }

          // Stop observing as we found what we needed
          observer.disconnect();
          break;
        }
      }
    }
  });

  // Start observing
  observer.observe(observeRoot, { childList: true, subtree: true });

  // Transition duration + buffer
  const transitionDuration = isStreaming ? 200 : 300;

  // After transitions complete, clean up
  setTimeout(() => {
    // Disconnect the observer first
    observer.disconnect();

    // If the block was removed and replaced, transfer styles to the new block
    if (blockRemoved && replacementBlock) {
      // Apply all the original attributes to the replacement block
      originalAttributes.forEach(attr => {
        replacementBlock!.setAttribute(attr.name, attr.value);
      });

      // Apply original classes, preserving any new classes
      const newClasses = Array.from(replacementBlock.classList);
      originalClasses.forEach(cls => {
        if (!newClasses.includes(cls)) {
          replacementBlock!.classList.add(cls);
        }
      });

      // Apply current dimensions if needed
      if (wasScrollable) {
        replacementBlock.scrollTop = scrollPosition;
      }

      // Ensure the animation properties are cleaned up
      replacementBlock.style.transition = '';
      replacementBlock.style.height = '';
      replacementBlock.style.overflow = '';
      replacementBlock.removeAttribute('data-smooth-updating');

      // Remove the shadow tracker
      if (shadowTracker.parentNode) {
        shadowTracker.parentNode.removeChild(shadowTracker);
      }

      // We're done here, since we're working with a replacement block
      return;
    }

    // If the block is still in the DOM, finish our normal cleanup
    if (document.body.contains(block)) {
      // Remove the old content wrapper
      if (block.contains(contentWrapper)) {
        block.removeChild(contentWrapper);
      }

      // Move the children from newContentWrapper directly to block
      while (newContentWrapper.firstChild) {
        block.appendChild(newContentWrapper.firstChild);
      }

      // Remove the temporary wrapper
      if (block.contains(newContentWrapper)) {
        block.removeChild(newContentWrapper);
      }

      // Restore dimensions if they were stabilized (but not for streaming content)
      if (block.style.minHeight && !isStreaming) {
        unstabilizeBlock(block);
      }

      // Restore scroll position if the block was scrollable
      if (wasScrollable) {
        block.scrollTop = scrollPosition;
      }

      block.style.overflow = '';
      block.style.height = '';
      block.style.transition = '';

      // Mark as done updating
      block.removeAttribute('data-smooth-updating');
    }

    // Remove the shadow tracker
    if (shadowTracker.parentNode) {
      shadowTracker.parentNode.removeChild(shadowTracker);
    }
  }, transitionDuration);
};

/**
 * Add execute button and results panel to a function block
 *
 * @param blockDiv Function block div container
 * @param rawContent Raw XML content containing the function call
 */
export const addExecuteButton = (blockDiv: HTMLDivElement, rawContent: string): void => {
  // Check for existing execute button to avoid duplicates
  if (blockDiv.querySelector('.execute-button')) {
    return;
  }

  // Parse the raw XML to extract function name and parameters
  const functionName = extractFunctionName(rawContent);
  const parameters = extractFunctionParameters(rawContent);

  // If we couldn't extract a function name, don't add the button
  if (!functionName) {
    return;
  }

  // Extract call_id from the raw content if available
  const callIdMatch = rawContent.match(/<invoke name="[^"]+"\s+call_id="([^"]+)">/);
  const callId =
    callIdMatch && callIdMatch[1] ? callIdMatch[1] : `call-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Generate content signature for this function call
  const contentSignature = generateContentSignature(functionName, parameters);

  // Create execute button
  const executeButton = document.createElement('button');
  executeButton.className = 'execute-button';
  executeButton.style.display = 'flex';
  executeButton.style.alignItems = 'center';
  executeButton.style.justifyContent = 'center';
  executeButton.style.gap = '6px';

  // Create icon for execute button
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  iconSpan.style.display = 'inline-flex';

  executeButton.appendChild(iconSpan);
  executeButton.appendChild(document.createTextNode('Run'));
  executeButton.style.marginLeft = '0'; // Reset any margin

  // Create results panel (initially hidden)
  const resultsPanel = document.createElement('div');
  resultsPanel.className = 'function-results-panel';
  resultsPanel.style.display = 'none';
  resultsPanel.style.maxHeight = '200px';
  resultsPanel.style.overflow = 'auto';
  // Add data attributes for call_id and functionName
  resultsPanel.setAttribute('data-call-id', callId);
  resultsPanel.setAttribute('data-function-name', functionName);

  // Create loading indicator that will be shown during execution
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'function-loading';
  loadingIndicator.style.display = 'none';
  loadingIndicator.style.marginTop = '12px';
  loadingIndicator.style.padding = '10px';
  loadingIndicator.style.borderRadius = '8px';
  loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
  loadingIndicator.style.border = '1px solid rgba(0, 0, 0, 0.06)';

  // Handle click event
  executeButton.onclick = () => {
    // Add spinner to the button and disable it
    executeButton.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'execute-spinner';
    spinner.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 31.4" transform="rotate(-90 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
    spinner.style.display = 'inline-flex';
    spinner.style.marginLeft = '8px';
    executeButton.appendChild(spinner);

    // Hide results panel while loading
    resultsPanel.style.display = 'none';
    resultsPanel.innerHTML = '';

    // Execute the function using mcpHandler
    try {
      // Access the global mcpHandler
      const mcpHandler = (window as any).mcpHandler;

      if (!mcpHandler) {
        // Remove spinner and re-enable button
        if (spinner.parentNode === executeButton) executeButton.removeChild(spinner);
        executeButton.disabled = false;
        displayResult(resultsPanel, loadingIndicator, false, 'Error: mcpHandler not found');
        resultsPanel.style.display = 'block';
        return;
      }

      console.debug(`Executing function ${functionName}, call_id: ${callId} with arguments:`, parameters);

      mcpHandler.callTool(functionName, parameters, (result: any, error: any) => {
        // Remove spinner and re-enable button
        if (spinner.parentNode === executeButton) executeButton.removeChild(spinner);
        executeButton.disabled = false;

        // Show results panel
        resultsPanel.style.display = 'block';
        resultsPanel.innerHTML = '';
        resultsPanel.appendChild(loadingIndicator);

        if (error) {
          // Pass the error directly without adding "Error:" prefix since the error message
          // already contains the necessary information
          displayResult(resultsPanel, loadingIndicator, false, error);
        } else {
          displayResult(resultsPanel, loadingIndicator, true, result);

          // Store the execution in local storage
          const executionData = storeExecutedFunction(functionName, callId, parameters, contentSignature);

          // Update or create the history panel immediately
          const historyPanel =
            blockDiv.querySelector('.function-history-panel') || createHistoryPanel(blockDiv, callId, contentSignature);

          // Access the global mcpHandler
          updateHistoryPanel(historyPanel as HTMLDivElement, executionData, mcpHandler);
        }
      });
    } catch (error) {
      if (spinner.parentNode === executeButton) executeButton.removeChild(spinner);
      executeButton.disabled = false;
      resultsPanel.style.display = 'block';
      displayResult(
        resultsPanel,
        loadingIndicator,
        false,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Add execute button to the container
  blockDiv.appendChild(executeButton);

  // Always add the results panel to the main block div
  // This ensures it's not constrained by the button container's layout
  if (blockDiv.classList.contains('function-buttons')) {
    // If we're in a button container, add resultsPanel to the parent
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      parentBlock.appendChild(resultsPanel);
    } else {
      blockDiv.appendChild(resultsPanel);
    }
  } else {
    blockDiv.appendChild(resultsPanel);
  }

  // Check for previous executions and display history if found
  checkAndDisplayFunctionHistory(blockDiv, functionName, callId, contentSignature);
};

/**
 * Extract function name from raw XML content
 *
 * @param rawContent Raw XML content
 * @returns The function name or null if not found
 */
const extractFunctionName = (rawContent: string): string | null => {
  const invokeMatch = rawContent.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/);
  return invokeMatch && invokeMatch[1] ? invokeMatch[1] : null;
};

/**
 * Extract function parameters from raw XML content
 *
 * @param rawContent Raw XML content
 * @returns Object with parameter names and values
 */
export const extractFunctionParameters = (rawContent: string): Record<string, any> => {
  const parameters: Record<string, any> = {};

  // Find all parameter tags using a more robust regex with the 's' flag
  const paramRegex = /<parameter\s+name="([^"]+)"\s*(?:type="([^"]+)")?\s*>(.*?)<\/parameter>/gs;
  let match;
  while ((match = paramRegex.exec(rawContent)) !== null) {
    const name = match[1];
    const type = match[2] || 'string';
    let value: any = match[3].trim();
    const originalValue = value; // Keep original string for CDATA check

    // Check if the content is wrapped in CDATA tags
    const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/;
    const cdataMatch = originalValue.match(cdataPattern);

    if (cdataMatch) {
      try {
        // Extract the content from within CDATA tags and trim
        value = cdataMatch[1].trim();
        console.debug(`Extracted CDATA content for parameter ${name}`);
      } catch (e) {
        // If extraction fails, use the original string value (already set)
        console.error(`Failed to extract CDATA content for parameter ${name}:`, e);
        value = originalValue; // Ensure we fall back to original if trim fails
      }
    }

    const rawValue = originalValue;
    if (type === 'json') {
      try {
        value = JSON.parse(rawValue);
      } catch (e) {
        console.warn(`Failed to parse JSON for parameter '${name}'.`, e);
      }
    } else if (type === 'number') {
      const num = parseFloat(rawValue);
      if (!isNaN(num)) value = num;
    } else if (type === 'boolean') {
      value = rawValue.toLowerCase() === 'true';
    } else {
      // Auto-detect number
      if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
        value = parseFloat(rawValue);
      } else if (/^(true|false)$/i.test(rawValue)) {
        value = rawValue.toLowerCase() === 'true';
      } else if (
        (rawValue.startsWith('{') && rawValue.endsWith('}')) ||
        (rawValue.startsWith('[') && rawValue.endsWith(']'))
      ) {
        try {
          value = JSON.parse(rawValue);
        } catch (e) {
          console.warn(`Failed to auto-parse JSON for parameter '${name}'.`, e);
        }
      }
    }
    parameters[name] = value;
  }

  return parameters;
};

/**
 * Helper function to attach the result text as a file.
 * @param adapter The MCP adapter instance.
 * @param functionName The name of the executed function.
 * @param callId The unique call ID for the execution.
 * @param rawResultText The raw text content of the result.
 * @param button The button element that triggered the action.
 * @param iconSpan The icon span element within the button.
 * @returns Promise resolving to an object with success status and confirmation message.
 */
const attachResultAsFile = async (
  adapter: any,
  functionName: string,
  callId: string,
  rawResultText: string,
  button: HTMLButtonElement,
  iconSpan: HTMLElement,
  skipAutoInsertCheck: boolean = false,
): Promise<{ success: boolean; message: string | null }> => {
  if (
    adapter &&
    typeof adapter.attachFile === 'function' &&
    typeof adapter.supportsFileUpload === 'function' &&
    adapter.supportsFileUpload()
  ) {
    const fileName = `${functionName}_result_call_id_${callId}.txt`;
    const file = new File([rawResultText], fileName, { type: 'text/plain' });
    const originalButtonText = button.textContent || 'Attach File'; // Store original text
    let confirmationText: string | null = null; // Initialize confirmation text

    try {
      button.textContent = 'Attaching...';
      button.prepend(iconSpan); // Ensure icon is present
      button.disabled = true;
      const success = true; // Skip adapter.attachFile, handled by Perplexity adapter
      if (success) {
        button.textContent = 'Attached!';
        button.classList.add('attach-success'); // Use attach-success for consistency
        // Insert confirmation text
        confirmationText = `Result attached as file: ${fileName}`; // Store confirmation text
        // adapter.insertTextIntoInput(confirmationText);

        // Dispatch the same event used for text insertion, now including file for auto-insert with file handling
        document.dispatchEvent(
          new CustomEvent('mcp:tool-execution-complete', {
            detail: {
              file,
              result: confirmationText,
              isFileAttachment: true,
              fileName: fileName,
              confirmationText: confirmationText,
              skipAutoInsertCheck: skipAutoInsertCheck,
            },
          }),
        );

        // Reset button after a delay
        setTimeout(() => {
          button.textContent = originalButtonText; // Restore original text
          button.prepend(iconSpan); // Re-add the icon
          button.classList.remove('attach-success', 'attach-error');
          button.disabled = false;
        }, 2000);
        return { success: true, message: confirmationText }; // Return success and message
      } else {
        button.textContent = 'Failed';
        button.classList.add('attach-error');
      }
    } catch (e) {
      button.textContent = 'Failed';
      button.classList.add('attach-error');
    } finally {
      // Reset button after a delay if not successful
      if (!confirmationText) {
        // Only reset if not successful
        setTimeout(() => {
          button.textContent = originalButtonText; // Restore original text
          button.prepend(iconSpan); // Re-add the icon
          button.classList.remove('attach-success', 'attach-error');
          button.disabled = false;
        }, 2000);
      }
    }
  } else {
    // Handle case where adapter doesn't support file attachment
    button.textContent = 'Attach Not Supported';
    button.classList.add('attach-error');
    setTimeout(() => {
      button.textContent = button.classList.contains('insert-result-button') ? 'Insert' : 'Attach File'; // Restore correct original text
      button.prepend(iconSpan);
      button.classList.remove('attach-error');
    }, 2000);
    console.error('Adapter not available or does not support file attachment.');
  }
  return { success: false, message: null }; // Return failure
};

/**
 * Display result in the results panel
 *
 * @param resultsPanel Results panel element
 * @param loadingIndicator Loading indicator element
 * @param success Whether the execution was successful
 * @param result Result or error message
 */
export const displayResult = (
  resultsPanel: HTMLDivElement,
  loadingIndicator: HTMLDivElement,
  success: boolean,
  result: any,
): void => {
  // Retrieve call_id and function name
  const callId = resultsPanel.getAttribute('data-call-id') || '';
  const functionName = resultsPanel.getAttribute('data-function-name') || '';

  // --- Start Modification: Clear previous results ---
  // 1. Remove loading indicator if it's still present
  if (loadingIndicator.parentNode === resultsPanel) {
    resultsPanel.removeChild(loadingIndicator);
  }

  // 2. Find and remove previous result content within the resultsPanel
  const existingResultContent = resultsPanel.querySelector('.function-result-success, .function-result-error');
  if (existingResultContent) {
    resultsPanel.removeChild(existingResultContent);
  }

  // 3. Find and remove previous insert button container (must be the immediate next sibling)
  const existingButtonContainer = resultsPanel.nextElementSibling;
  if (existingButtonContainer && existingButtonContainer.classList.contains('insert-button-container')) {
    existingButtonContainer.parentNode?.removeChild(existingButtonContainer);
  }
  // --- End Modification ---

  // Hide loading indicator (redundant now, but safe to keep)
  loadingIndicator.style.display = 'none';

  // Create result content
  const resultContent = document.createElement('div');

  // Store the raw result value for inserting later
  let rawResultText = '';

  if (success) {
    resultContent.className = 'function-result-success';

    // Format the result appropriately
    if (typeof result === 'object') {
      try {
        rawResultText = JSON.stringify(result, null, 2);
        const pre = document.createElement('pre');
        pre.textContent = rawResultText;
        if (pre.style.fontFamily) resultContent.style.fontFamily = pre.style.fontFamily;
        pre.style.fontFamily = 'inherit'; // Use inherited font
        pre.style.fontSize = '13px'; // Consistent font size
        pre.style.lineHeight = '1.5';
        pre.style.padding = '0';
        pre.style.margin = '0'; // Ensure no extra margins
        resultContent.appendChild(pre);
      } catch (e) {
        rawResultText = String(result);
        resultContent.textContent = rawResultText;
      }
    } else {
      rawResultText = String(result);
      resultContent.textContent = rawResultText;
    }

    // Add result content to results panel
    resultsPanel.appendChild(resultContent);

    // Create button container for the insert button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'function-buttons insert-button-container'; // Added class for removal
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end'; // Align button to the right
    buttonContainer.style.marginTop = '10px';
    buttonContainer.style.marginBottom = '10px'; // Add some space below

    // Create insert button
    const insertButton = document.createElement('button');
    insertButton.className = 'insert-result-button'; // For styling/selection
    insertButton.textContent = 'Insert';
    insertButton.setAttribute('data-result-id', `result-${callId}-${Date.now()}`); // More specific ID

    // Add icon to the insert button
    const insertIconSpan = document.createElement('span');
    insertIconSpan.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 12l-7-7v4H2v6h7v4l7-7z" fill="currentColor"/></svg>';
    insertIconSpan.style.display = 'inline-flex';
    insertIconSpan.style.marginRight = '4px'; // Space between icon and text
    insertButton.prepend(insertIconSpan);

    // Add button styles similar to execute button
    insertButton.style.display = 'flex';
    insertButton.style.alignItems = 'center';
    insertButton.style.justifyContent = 'center';
    insertButton.style.gap = '6px';

    // Click handler for insert button
    insertButton.onclick = async () => {
      // Make handler async
      // Access the current adapter
      const adapter = window.mcpAdapter || window.getCurrentAdapter?.();

      if (!adapter) {
        console.error('Adapter not available.');
        insertButton.textContent = 'Failed (No Adapter)';
        insertButton.classList.add('insert-error');
        setTimeout(() => {
          insertButton.textContent = 'Insert';
          insertButton.prepend(insertIconSpan); // Re-add the icon
          insertButton.classList.remove('insert-error');
        }, 2000);
        return;
      }

      const wrapperText = `<function_result call_id="${callId}">\n${rawResultText}\n</function_result>`;
      // // Check result length
      if (rawResultText.length > MAX_INSERT_LENGTH && WEBSITE_NAME_FOR_MAX_INSERT_LENGTH_CHECK.includes(websiteName)) {
        // If result is too long, attach as file using the helper function
        console.log(`Result length (${wrapperText.length}) exceeds ${MAX_INSERT_LENGTH}. Attaching as file.`);
        await attachResultAsFile(adapter, functionName, callId, wrapperText, insertButton, insertIconSpan, true);
      } else {
        // Otherwise, insert as text
        if (typeof adapter.insertTextIntoInput === 'function') {
          // Removed direct text insertion via adapter.insertTextIntoInput
          // adapter.insertTextIntoInput(wrapperText);

          // Dispatch the same event used for text insertion
          // This ensures that auto-submit logic is triggered in the same way
          // for both text insertion and file attachment
          document.dispatchEvent(
            new CustomEvent('mcp:tool-execution-complete', {
              detail: {
                result: wrapperText,
                isFileAttachment: false,
                fileName: '',
                skipAutoInsertCheck: true,
              },
            }),
          );

          // Add visual feedback that insertion was successful
          insertButton.textContent = 'Inserted!';
          insertButton.classList.add('insert-success');
          insertButton.disabled = true;

          // Reset button after a delay
          setTimeout(() => {
            insertButton.textContent = 'Insert';
            insertButton.prepend(insertIconSpan); // Re-add the icon
            insertButton.classList.remove('insert-success');
            insertButton.disabled = false;
          }, 2000);
        } else {
          // Show error message if insertTextIntoInput method not found
          console.error('Adapter insertTextIntoInput method not found');
          insertButton.textContent = 'Failed (No Insert Method)';
          insertButton.classList.add('insert-error');

          // Reset button after a delay
          setTimeout(() => {
            insertButton.textContent = 'Insert';
            insertButton.prepend(insertIconSpan); // Re-add the icon
            insertButton.classList.remove('insert-error');
          }, 2000);
        }
      }
    };

    // --- Attach File Button ---
    const attachButton = document.createElement('button');
    attachButton.className = 'attach-file-button';
    attachButton.textContent = 'Attach File';
    attachButton.setAttribute('data-result-id', `attach-${callId}-${Date.now()}`);
    // Add icon to the attach button
    const attachIconSpan = document.createElement('span');
    attachIconSpan.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6h8M8 10h8M8 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    attachIconSpan.style.display = 'inline-flex';
    attachIconSpan.style.marginRight = '4px';
    attachButton.prepend(attachIconSpan);
    attachButton.style.display = 'flex';
    attachButton.style.alignItems = 'center';
    attachButton.style.justifyContent = 'center';
    attachButton.style.gap = '6px';

    attachButton.onclick = async () => {
      const adapter = window.mcpAdapter || window.getCurrentAdapter?.();
      // Use the helper function for attaching the file
      await attachResultAsFile(adapter, functionName, callId, rawResultText, attachButton, attachIconSpan, true);
    };

    // Append the buttons to their container
    buttonContainer.appendChild(insertButton);
    // Only show attach button if the adapter supports it
    const adapter = window.mcpAdapter || window.getCurrentAdapter?.();
    if (adapter && typeof adapter.supportsFileUpload === 'function' && adapter.supportsFileUpload()) {
      buttonContainer.appendChild(attachButton);
    }

    // Insert the button container after results panel
    resultsPanel.parentNode?.insertBefore(buttonContainer, resultsPanel.nextSibling);

    // Check if we need to auto-attach file based on size
    if (
      rawResultText.length > MAX_INSERT_LENGTH &&
      adapter &&
      typeof adapter.supportsFileUpload === 'function' &&
      adapter.supportsFileUpload() &&
      WEBSITE_NAME_FOR_MAX_INSERT_LENGTH_CHECK.includes(websiteName)
    ) {
      console.debug(`Auto-attaching file: Result length (${rawResultText.length}) exceeds ${MAX_INSERT_LENGTH}`);

      // Create a fake button element that won't be displayed, just for the attachResultAsFile function
      const fakeButton = document.createElement('button');
      fakeButton.className = 'insert-result-button'; // Match class for consistency
      fakeButton.style.display = 'none'; // Hide it

      // Create fake icon span
      const fakeIconSpan = document.createElement('span');
      fakeIconSpan.style.display = 'none';

      // Auto attach the file
      attachResultAsFile(adapter, functionName, callId, rawResultText, fakeButton, fakeIconSpan, false)
        .then(({ success, message }) => {
          if (success) {
            console.debug(`Auto-attached file successfully: ${message}`);

            // File is already attached via the attachResultAsFile function
            // and the event is dispatched there, so we don't need to do it again
          } else {
            console.error('Failed to auto-attach file.');
            // Fallback: use the normal attach button
            if (attachButton && attachButton.parentNode) {
              console.debug('Clicking attach button as fallback...');
              // Wait a moment before clicking the fallback
              setTimeout(() => attachButton.click(), 100);
            }
          }
        })
        .catch(err => {
          console.error('Error auto-attaching file:', err);
        });
    } else {
      // For normal-sized results, just dispatch the event for auto-insert/auto-submit
      const wrappedResult = `<function_result call_id="${callId}">\n${rawResultText}\n</function_result>`;
      document.dispatchEvent(
        new CustomEvent('mcp:tool-execution-complete', {
          detail: { result: wrappedResult, skipAutoInsertCheck: false },
        }),
      );
    }
  } else {
    // For error results, don't add insert button
    resultContent.className = 'function-result-error';
    
    // Check for specific server-related error messages
    let errorMessage = '';
    
    // Handle different error formats
    if (typeof result === 'string') {
      errorMessage = result;
    } else if (result && typeof result === 'object') {
      errorMessage = result.message || 'An unknown error occurred';
    } else {
      errorMessage = 'An unknown error occurred';
    }
    
    // Handle server disconnection errors
    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('SERVER_UNAVAILABLE')) {
        errorMessage = 'Server is disconnected. Please check your connection settings.';
      } else if (errorMessage.includes('CONNECTION_ERROR') || errorMessage.includes('RECONNECT_ERROR')) {
        errorMessage = 'Connection to server failed. Please try reconnecting.';
      } else if (errorMessage.includes('SERVER_ERROR')) {
        errorMessage = 'Server error occurred. Please check server status.';
      }
    }
    
    resultContent.textContent = errorMessage;

    // Add error content directly to results panel
    resultsPanel.appendChild(resultContent);
  }
};
