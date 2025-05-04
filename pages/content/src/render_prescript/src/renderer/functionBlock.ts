import { CONFIG } from '../core/config';
import { containsFunctionCalls, extractLanguageTag } from '../parser/index';
import { safelySetContent } from '../utils/index';
import {
  addRawXmlToggle,
  addExecuteButton,
  setupAutoScroll,
  smoothlyUpdateBlockContent,
  extractFunctionParameters,
} from './components';
import { applyThemeClass } from '../utils/themeDetector';
import { getPreviousExecution, getPreviousExecutionLegacy, generateContentSignature } from '../mcpexecute/storage';
import type { ParamValueElement } from '../core/types';
import { streamingLastUpdated } from '../observer/streamObserver';
import { stalledStreamRetryCount, stalledStreams } from '../observer/stalledStreamHandler';

// Define custom property for tracking scroll state
declare global {
  interface HTMLElement {
    _userHasScrolled?: boolean;
  }
}

// Monaco editor CSP-compatible configuration
const configureMonacoEditorForCSP = () => {
  if (typeof window !== 'undefined' && (window as any).monaco) {
    try {
      // Override worker creation to disable web workers
      // This is not ideal for performance but allows Monaco to work in strict CSP environments
      (window as any).monaco.editor.onDidCreateEditor((editor: any) => {
        // Disable worker-based features
        editor.updateOptions({
          wordBasedSuggestions: false,
          snippetSuggestions: false,
          suggestOnTriggerCharacters: false,
          semanticHighlighting: { enabled: false },
          codeLens: false,
          formatOnType: false,
          folding: false,
        });
      });

      // Override Monaco environment worker URL generation
      (window as any).MonacoEnvironment = {
        getWorkerUrl: function () {
          // Return a script that defines a no-op worker
          return 'data:text/javascript;charset=utf-8,console.debug("Monaco worker disabled for CSP compatibility");';
        },
      };

      console.debug('Monaco editor configured for CSP compatibility');
    } catch (e) {
      console.error('Failed to configure Monaco editor for CSP:', e);
    }
  }
};

// State management for rendered elements
export const processedElements = new WeakSet<HTMLElement>();
export const renderedFunctionBlocks = new Map<string, HTMLDivElement>();

// Maximum number of retry attempts before giving up on auto-execution
const MAX_AUTO_EXECUTE_ATTEMPTS = 3;

// Centralized execution tracking system to prevent race conditions and duplicate executions
interface ExecutionTracker {
  // Track auto-execution attempts to prevent endless retries for removed blocks
  attempts: Map<string, number>;
  // Track blocks that have been successfully auto-executed or are in progress
  executed: Set<string>;
  // Track function call signatures (callId + contentSignature) that have been executed
  executedFunctions: Set<string>;
  // Check if a function has been executed or is scheduled for execution
  isFunctionExecuted(callId: string, contentSignature: string, functionName?: string): boolean;
  // Mark a function as executed or in progress
  markFunctionExecuted(callId: string, contentSignature: string, functionName?: string): void;
  // Check if a block has been auto-executed
  isBlockExecuted(blockId: string): boolean;
  // Mark a block as auto-executed
  markBlockExecuted(blockId: string): void;
  // Get attempts for a block
  getAttempts(blockId: string): number;
  // Increment attempts for a block
  incrementAttempts(blockId: string): number;
  // Clean up tracking data for a block
  cleanupBlock(blockId: string): void;
}

// Implementation of the execution tracker
export const executionTracker: ExecutionTracker = {
  attempts: new Map<string, number>(),
  executed: new Set<string>(),
  executedFunctions: new Set<string>(),

  isFunctionExecuted(callId: string, contentSignature: string, functionName?: string): boolean {
    console.debug(
      `[Debug] isFunctionExecuted called with: callId='${callId}', signature='${contentSignature}', funcName='${functionName || 'undefined'}'`,
    );

    // Determine the function name to use (prefer provided, fallback to extracting from memory)
    let effectiveFunctionName = functionName;
    let foundNameInMemory = false;

    // Try to extract from executedFunctions set keys IF functionName was NOT provided initially
    if (typeof effectiveFunctionName === 'undefined' || effectiveFunctionName === null) {
      let functionNameFromMemory = '';
      for (const key of this.executedFunctions) {
        const parts = key.split(':');
        if (parts.length === 3 && parts[1] === callId && parts[2] === contentSignature) {
          functionNameFromMemory = parts[0];
          break;
        }
      }
      if (functionNameFromMemory) {
        effectiveFunctionName = functionNameFromMemory; // Set effectiveFunctionName if found in memory
        foundNameInMemory = true;
        console.debug(`[Debug] Found functionName='${effectiveFunctionName}' from executedFunctions set`);
      }
    }

    // Use Standard Check if we have a function name (either passed or found in memory)
    if (typeof effectiveFunctionName === 'string') {
      // Check if we have *any* string name
      const key = `${effectiveFunctionName}:${callId}:${contentSignature}`;
      const inMemory = this.executedFunctions.has(key);
      // Use the specific function name for storage lookup
      const inStorage = getPreviousExecution(effectiveFunctionName, callId, contentSignature) !== null;
      console.debug(
        `[Debug] isFunctionExecuted (Standard Check): Key='${key}', inMemory=${inMemory}, inStorage=${inStorage}`,
      );
      return inMemory || inStorage;
    }
    // Fallback to Legacy Check ONLY if no function name was passed AND none was found in memory
    else {
      const key = `${callId}:${contentSignature}`;
      const inMemory = this.executedFunctions.has(key) || this.executedFunctions.has(`:${callId}:${contentSignature}`); // Check legacy key format too
      const inStorage = getPreviousExecutionLegacy(callId, contentSignature) !== null;
      console.debug(
        `[Debug] isFunctionExecuted (Legacy Check): Key='${key}', inMemory=${inMemory}, inStorage=${inStorage}`,
      );
      return inMemory || inStorage;
    }
  },

  markFunctionExecuted(callId: string, contentSignature: string, functionName?: string): void {
    // Use the function name if provided, otherwise just use callId and contentSignature
    const key = functionName ? `${functionName}:${callId}:${contentSignature}` : `${callId}:${contentSignature}`;
    this.executedFunctions.add(key);
  },

  isBlockExecuted(blockId: string): boolean {
    return this.executed.has(blockId) === true;
  },

  markBlockExecuted(blockId: string): void {
    this.executed.add(blockId);
  },

  getAttempts(blockId: string): number {
    return this.attempts.get(blockId) || 0;
  },

  incrementAttempts(blockId: string): number {
    const current = this.getAttempts(blockId);
    const newValue = current + 1;
    this.attempts.set(blockId, newValue);
    return newValue;
  },

  cleanupBlock(blockId: string): void {
    this.attempts.delete(blockId);
  },
};

/**
 * Main function to render a function call block
 *
 * @param block HTML element containing a function call
 * @param isProcessingRef Reference to processing state
 * @returns Boolean indicating whether rendering was successful
 */
// Configure Monaco once before rendering any blocks
if (typeof window !== 'undefined') {
  configureMonacoEditorForCSP();
}

export const renderFunctionCall = (block: HTMLPreElement, isProcessingRef: { current: boolean }): boolean => {
  try {
    const functionInfo = containsFunctionCalls(block);

    if (!functionInfo.hasFunctionCalls || block.closest('.function-block')) {
      return false;
    }

    const blockId =
      block.getAttribute('data-block-id') || `block-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Get the set of pre-existing incomplete blocks if it exists
    const preExistingIncompleteBlocks = (window as any).preExistingIncompleteBlocks || new Set<string>();

    // Check if this is a pre-existing incomplete block that should not get spinners
    const isPreExistingIncomplete = preExistingIncompleteBlocks.has(blockId);

    let existingDiv = renderedFunctionBlocks.get(blockId);
    let isNewRender = false;
    let previousCompletionStatus: boolean | null = null;

    // Track retry attempts for this block
    const retryCount = (window as any)._stalledStreamRetryCount?.get(blockId) || 0;
    const maxRetries = CONFIG.maxRetryAttempts;

    // Enhanced error recovery - check if we're in a retry situation
    const isRetry = retryCount > 0;
    if (isRetry) {
      console.debug(`Retry attempt ${retryCount}/${maxRetries} for block ${blockId}`);
    }

    // If this is a retry and we've exceeded max attempts, mark as permanently failed
    if (isRetry && retryCount >= maxRetries) {
      console.warn(`Max retry attempts (${maxRetries}) reached for block ${blockId}`);
      block.classList.add('function-permanently-failed');
      return false;
    }

    if (processedElements.has(block)) {
      if (!existingDiv) {
        const existingDivs = document.querySelectorAll<HTMLDivElement>(`.function-block[data-block-id="${blockId}"]`);
        if (existingDivs.length > 0) {
          existingDiv = existingDivs[0];
          renderedFunctionBlocks.set(blockId, existingDiv);
        } else {
          processedElements.delete(block);
        }
      }
    }

    if (!existingDiv) {
      isNewRender = true;
      if (!processedElements.has(block)) {
        processedElements.add(block);
        block.setAttribute('data-block-id', blockId);
      }
    } else {
      previousCompletionStatus = !existingDiv.classList.contains('function-loading');
    }

    const rawContent = block.textContent?.trim() || '';
    const { tag, content } = extractLanguageTag(rawContent);

    // CRITICAL: Use the existing div if available for streaming updates, or create a new one
    const blockDiv = existingDiv || document.createElement('div');

    // Only update these properties on a new render, not during streaming updates
    if (isNewRender) {
      blockDiv.className = 'function-block';
      blockDiv.setAttribute('data-block-id', blockId);

      // Apply theme class based on current theme
      applyThemeClass(blockDiv);

      // Register this block
      renderedFunctionBlocks.set(blockId, blockDiv);
    }

    // Handle state transitions when block completion status changes
    if (!isNewRender) {
      const justCompleted = previousCompletionStatus === false && functionInfo.isComplete;
      const justBecameIncomplete = previousCompletionStatus === true && !functionInfo.isComplete;

      if (justCompleted) {
        // Update UI state when transitioning from loading to complete
        blockDiv.classList.remove('function-loading');
        blockDiv.classList.add('function-complete');

        // Remove spinner if exists
        const spinner = blockDiv.querySelector('.spinner');
        if (spinner) {
          spinner.remove();
        }
      } else if (justBecameIncomplete) {
        // Update UI state when transitioning from complete to loading
        blockDiv.classList.remove('function-complete');
        blockDiv.classList.add('function-loading');
      }
    } else {
      // Only add loading state for new renders if not pre-existing incomplete
      if (!functionInfo.isComplete && !isPreExistingIncomplete) {
        blockDiv.classList.add('function-loading');
      }

      // Add language tag if needed for new renders
      if (tag || functionInfo.languageTag) {
        const langTag = document.createElement('div');
        langTag.className = 'language-tag';
        langTag.textContent = tag || functionInfo.languageTag;
        blockDiv.appendChild(langTag);
      }
    }

    // Extract function name from the raw content
    // Use regex to extract function name directly from content as a fallback for functionInfo
    const invokeMatch = content.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/i);
    const functionName = invokeMatch ? invokeMatch[1] : 'function';
    const callId = invokeMatch && invokeMatch[2] ? invokeMatch[2] : blockId;

    // Handle function name creation or update
    let functionNameElement = blockDiv.querySelector<HTMLDivElement>('.function-name');

    if (!functionNameElement) {
      // Create function name if not exists (new render)
      functionNameElement = document.createElement('div');
      functionNameElement.className = 'function-name';

      const functionNameText = document.createElement('span');
      functionNameText.className = 'function-name-text';
      functionNameText.textContent = functionName;
      functionNameElement.appendChild(functionNameText);

      // Add call ID to the function name element (positioned top right via CSS)
      if (callId) {
        const callIdElement = document.createElement('span');
        callIdElement.className = 'call-id';
        callIdElement.textContent = callId;
        functionNameElement.appendChild(callIdElement);
      }

      // If function is not complete and not a pre-existing incomplete block, add spinner
      if (!functionInfo.isComplete && !isPreExistingIncomplete) {
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        functionNameElement.appendChild(spinner);
      }

      blockDiv.appendChild(functionNameElement);
    } else {
      // Update existing function name (streaming update)
      const nameText = functionNameElement.querySelector<HTMLSpanElement>('.function-name-text');
      if (nameText && nameText.textContent !== functionName) {
        nameText.textContent = functionName;
      }

      // Update call ID if needed
      const callIdElement = functionNameElement.querySelector<HTMLSpanElement>('.call-id');
      if (callId) {
        if (callIdElement) {
          if (callIdElement.textContent !== callId) {
            callIdElement.textContent = callId;
          }
        } else {
          const newCallId = document.createElement('span');
          newCallId.className = 'call-id';
          newCallId.textContent = callId;
          functionNameElement.appendChild(newCallId);
        }
      }
    }

    // Get existing or create a new parameter container
    let paramsContainer = blockDiv.querySelector<HTMLDivElement>('.function-params');

    if (!paramsContainer) {
      // Create parameter container if it doesn't exist
      paramsContainer = document.createElement('div');
      paramsContainer.className = 'function-params';
      paramsContainer.style.display = 'flex';
      paramsContainer.style.flexDirection = 'column';
      paramsContainer.style.gap = '4px';
      paramsContainer.style.width = '100%';
      blockDiv.appendChild(paramsContainer);
    }

    // --- START: Incremental Parameter Parsing and Rendering ---
    const partialParameters: Record<string, string> = {};
    const paramStartRegex = /<parameter\s+name="([^"]+)"[^>]*>/gs;
    let match;
    while ((match = paramStartRegex.exec(rawContent)) !== null) {
      const paramName = match[1];
      
      try {
        const result = extractParameterValue(rawContent, match.index);
        if (result !== null) {
          partialParameters[paramName] = result.value;
          createOrUpdateParamElement(paramsContainer!, paramName, result.value, blockId, isNewRender, result.isStreaming);
        }
      } catch (paramError) {
        console.warn(`Error extracting parameter ${paramName}:`, paramError);
        // Continue with next parameter instead of failing completely
        continue;
      }
    }
    // --- END: Incremental Parameter Parsing and Rendering ---

    // Extract *complete* parameters using the function from components.ts *only when needed*
    let completeParameters: Record<string, any> | null = null;
    if (functionInfo.isComplete) {
      completeParameters = extractFunctionParameters(rawContent);
    }

    // Generate content signature *only* when complete
    let contentSignature: string | null = null;
    if (functionInfo.isComplete && completeParameters) {
      contentSignature = generateContentSignature(functionName, completeParameters);
    }

    // Only replace the original element with our render if this is a new render
    if (isNewRender) {
      if (block.parentNode) {
        block.parentNode.insertBefore(blockDiv, block);
        block.style.display = 'none';
      } else {
        if (CONFIG.debug) console.warn('Function call block has no parent element, cannot insert rendered block');
        return false;
      }
    }

    // Create a button container if it doesn't exist
    let buttonContainer = blockDiv.querySelector<HTMLDivElement>('.function-buttons');
    if (!buttonContainer) {
      // Create a container for the buttons
      buttonContainer = document.createElement('div');
      buttonContainer.className = 'function-buttons';
      blockDiv.appendChild(buttonContainer);

      // Add spacing between parameters and buttons
      const spacer = document.createElement('div');
      spacer.style.height = '8px';
      blockDiv.insertBefore(spacer, buttonContainer);
    }

    // Add a raw XML toggle if the function is complete
    if (functionInfo.isComplete && !blockDiv.querySelector('.raw-toggle')) {
      // If we're using the button container, pass it instead of blockDiv
      if (buttonContainer) {
        addRawXmlToggle(buttonContainer, rawContent);
      } else {
        addRawXmlToggle(blockDiv, rawContent);
      }
    }

    // Add execute button if the function is complete and not already added
    if (functionInfo.isComplete && !blockDiv.querySelector('.execute-button')) {
      // Ensure completeParameters is available before adding button/setting up auto-exec
      if (!completeParameters) {
        completeParameters = extractFunctionParameters(rawContent);
      }
      // If we're using the button container, pass it instead of blockDiv
      if (buttonContainer) {
        addExecuteButton(buttonContainer, rawContent); // rawContent has full data here
      } else {
        addExecuteButton(blockDiv, rawContent);
      }

      // Setup auto-execution with proper wait time for DOM stabilization
      // This ensures we wait until the function block is fully rendered and stable
      const autoExecuteEnabled = (window as any).toggleState?.autoExecute === true;

      // Extract function information for execution tracking
      const invokeMatch = content.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/i);
      const extractedCallId = invokeMatch && invokeMatch[2] ? invokeMatch[2] : blockId;

      // Check if the function has already been executed using the complete signature
      if (contentSignature && !executionTracker.isFunctionExecuted(extractedCallId, contentSignature, functionName)) {
        // Proceed with auto-execution setup
        // STRICT CHECK #1: Is auto-execute enabled in UI settings?
        if (autoExecuteEnabled !== true) {
          console.debug(`Auto-execution disabled by user settings for block ${blockId} (${functionName})`);
          return true;
        }

        // STRICT CHECK #2: Has this block already been processed for auto-execution?
        if (executionTracker.isBlockExecuted(blockId) === true) {
          console.debug(`Auto-execution skipped: Block ${blockId} (${functionName}) has already been processed`);
          return true;
        }

        // At this point, we've passed all checks and can proceed with auto-execution
        // Immediately mark function as scheduled for execution to prevent race conditions
        executionTracker.markFunctionExecuted(extractedCallId, contentSignature, functionName);
        executionTracker.markBlockExecuted(blockId);

        console.debug(`Setting up auto-execution for block ${blockId} (${functionName})`);

        // Store function details for use in the retry mechanism (use completeParameters)
        const functionDetails = {
          functionName,
          callId: extractedCallId,
          contentSignature,
          params: completeParameters || {}, // Ensure params is an object
        };
        // Use a more robust retry mechanism with proper cleanup
        const setupAutoExecution = () => {
          const attempts = executionTracker.incrementAttempts(blockId);

          if (attempts > MAX_AUTO_EXECUTE_ATTEMPTS) {
            console.debug(`Auto-execute: Giving up on block ${blockId} after ${attempts - 1} attempts`);
            executionTracker.cleanupBlock(blockId);
            return;
          }

          console.debug(`Auto-execute attempt ${attempts}/${MAX_AUTO_EXECUTE_ATTEMPTS} for block ${blockId}`);

          setTimeout(() => {
            let currentBlock = document.querySelector<HTMLDivElement>(`.function-block[data-block-id="${blockId}"]`);

            if (!currentBlock) {
              console.debug(`Auto-execute: Original block ${blockId} not found. Searching for replacement...`);
              const potentialBlocks = document.querySelectorAll<HTMLDivElement>('.function-block');
              for (const block of potentialBlocks) {
                const preElement = block.querySelector('pre');
                if (!preElement || !preElement.textContent) continue; // Skip if no pre element or content

                // Manually parse name and callId from content here
                const content = preElement.textContent;
                const invokeRegex = /<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/i;
                const match = content.match(invokeRegex);

                // Check if the parsed details match the function we are trying to execute
                if (match && match[1] === functionDetails.functionName && match[2] === functionDetails.callId) {
                  const replacementBlockId = block.getAttribute('data-block-id');
                  // Use the imported getPreviousExecution which checks storage
                  const alreadyExecuted = getPreviousExecution(
                    functionDetails.functionName,
                    functionDetails.callId,
                    functionDetails.contentSignature,
                  );
                  // Removed isBeingProcessed check

                  if (!alreadyExecuted) {
                    console.debug(
                      `Auto-execute: Found potential replacement block ${replacementBlockId || 'unknown ID'}. Attempting execution.`,
                    );
                    currentBlock = block; // Target the replacement block
                    break;
                  } else {
                    console.debug(
                      `Auto-execute: Replacement block ${replacementBlockId || 'unknown ID'} skipped (already executed).`,
                    ); // Updated log message
                  }
                }
              }
            }

            if (!currentBlock) {
              console.debug(
                `Auto-execute: Block ${blockId} (and suitable replacement) not found in DOM (attempt ${attempts}/${MAX_AUTO_EXECUTE_ATTEMPTS})`,
              );
              if (attempts < MAX_AUTO_EXECUTE_ATTEMPTS) {
                setTimeout(setupAutoExecution, 500); // Retry
              } else {
                console.debug(`Auto-execute: Giving up on block ${blockId} - not found in DOM`);
                executionTracker.cleanupBlock(blockId);
              }
              return;
            }

            // --- START: Added final check against persistent storage ---
            // Use the imported getPreviousExecution which checks storage
            const finalCheckExecuted = getPreviousExecution(
              functionDetails.functionName,
              functionDetails.callId,
              functionDetails.contentSignature,
            );
            if (finalCheckExecuted) {
              console.debug(
                `Auto-execute: Function ${functionDetails.functionName} (callId: ${functionDetails.callId}) was found in execution history right before click. Skipping.`,
              );
              executionTracker.cleanupBlock(blockId); // Clean up tracker
              return;
            }
            // --- END: Added final check against persistent storage ---

            const executeButton = currentBlock.querySelector<HTMLButtonElement>('.execute-button');
            if (executeButton) {
              console.debug(
                `Auto-execute: Executing function in block ${currentBlock.getAttribute('data-block-id') || blockId} (${functionDetails.functionName}) after DOM stabilization`,
              );
              executeButton.click();
              // NOTE: Execution marking should happen *after* click success, likely handled by the execute button's click handler via functionHistory/storage.
              executionTracker.cleanupBlock(blockId); // Clean up tracker for *this* attempt
            } else {
              console.debug(
                `Auto-execute: Execute button not found in block ${currentBlock.getAttribute('data-block-id') || blockId} (attempt ${attempts}/${MAX_AUTO_EXECUTE_ATTEMPTS})`,
              );
              if (attempts < MAX_AUTO_EXECUTE_ATTEMPTS) {
                setTimeout(setupAutoExecution, 500); // Retry
              } else {
                console.debug(`Auto-execute: Giving up on block ${blockId} - button not found`);
                executionTracker.cleanupBlock(blockId);
              }
            }
          }, 500); // Reduced initial wait to 500ms
        };

        setupAutoExecution();
      }
    }

    // Enhanced completion status handling
    if (functionInfo.isComplete) {
      block.classList.remove('function-loading', 'function-stalled');
      block.classList.add('function-complete');
      
      // Clear retry count on successful completion
      stalledStreamRetryCount.delete(blockId);
      stalledStreams.delete(blockId);
      
      // Remove any stalled indicators
      const stalledIndicator = block.querySelector(`.stalled-indicator[data-stalled-for="${blockId}"]`);
      stalledIndicator?.remove();
    } else {
      block.classList.add('function-loading');
      if (!isPreExistingIncomplete) {
        // Update last activity timestamp
        streamingLastUpdated.set(blockId, Date.now());
      }
    }

    return true;
  } catch (error) {
    console.error('Error in renderFunctionCall:', error);
    
    // Enhanced error recovery
    const blockId = block.getAttribute('data-block-id');
    if (blockId) {
      const retryCount = (window as any)._stalledStreamRetryCount?.get(blockId) || 0;
      if (retryCount < CONFIG.maxRetryAttempts) {
        // Schedule a retry with exponential backoff
        const delay = Math.min(CONFIG.retryDelay * Math.pow(2, retryCount), 30000);
        setTimeout(() => {
          console.debug(`Retrying render for block ${blockId} after error (attempt ${retryCount + 1})`);
          (window as any)._stalledStreamRetryCount?.set(blockId, retryCount + 1);
          renderFunctionCall(block, isProcessingRef);
        }, delay);
      }
    }
    
    return false;
  }
};

/**
 * Create or update a parameter element in the function block
 *
 * @param blockDiv The function block container div
 * @param name The name of the parameter
 * @param value The value of the parameter
 * @param blockId ID of the block
 * @param isNewRender Whether this is a new render
 */
export const createOrUpdateParamElement = (
  container: HTMLDivElement,
  name: string,
  value: any,
  blockId: string,
  isNewRender: boolean,
  isStreaming: boolean = false,
): void => {
  const paramId = `${blockId}-${name}`;

  // First check within the passed container
  let paramNameElement = container.querySelector<HTMLDivElement>(`.param-name[data-param-id="${paramId}"]`);
  let paramValueElement = container.querySelector<HTMLDivElement>(`.param-value[data-param-id="${paramId}"]`);

  // If not found in the container, check the entire document (for backward compatibility)
  if (!paramNameElement) {
    paramNameElement = document.querySelector<HTMLDivElement>(`.param-name[data-param-id="${paramId}"]`);
  }
  if (!paramValueElement) {
    paramValueElement = document.querySelector<HTMLDivElement>(`.param-value[data-param-id="${paramId}"]`);
  }

  // Create parameter name and value elements if they don't exist
  if (!paramNameElement) {
    paramNameElement = document.createElement('div');
    paramNameElement.className = 'param-name';
    paramNameElement.textContent = name;
    paramNameElement.setAttribute('data-param-id', paramId);
    container.appendChild(paramNameElement);
  }

  if (!paramValueElement) {
    paramValueElement = document.createElement('div');
    paramValueElement.className = 'param-value';
    paramValueElement.setAttribute('data-param-id', paramId);
    paramValueElement.setAttribute('data-param-name', name);
    container.appendChild(paramValueElement);
  }

  // Update or set the value display with proper formatting
  const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

  // For streaming updates: if streaming or already has the streaming attribute
  if (isStreaming || paramValueElement.hasAttribute('data-streaming')) {
    // Get or create a pre element to hold the content for better streaming control
    let preElement = paramValueElement.querySelector('pre');
    if (!preElement) {
      preElement = document.createElement('pre');
      preElement.style.margin = '0';
      preElement.style.padding = '0';
      preElement.style.whiteSpace = 'pre-wrap';
      preElement.style.width = '100%';
      preElement.style.height = '100%';
      preElement.style.fontFamily = 'inherit';
      preElement.style.fontSize = 'inherit';
      preElement.style.lineHeight = '1.5';

      // Clear the parameter value element and append the pre
      paramValueElement.innerHTML = '';
      paramValueElement.appendChild(preElement);
    }

    // Always update content during streaming - this is crucial for real-time updates
    preElement.textContent = displayValue;
  } else {
    // Normal parameter (not streaming): update directly
    paramValueElement.textContent = displayValue;
  }

  // Set the initial value attribute for input elements if needed
  paramValueElement.setAttribute('data-param-value', JSON.stringify(value));

  // Ensure the param value has appropriate styling for scrolling
  if (paramValueElement.scrollHeight > 300) {
    paramValueElement.style.overflow = 'auto';
    paramValueElement.style.scrollBehavior = 'smooth';
  }

  // Clear any existing timeout for this parameter
  const timeoutKey = `streaming-timeout-${paramId}`;
  const existingTimeout = (window as any)[timeoutKey];
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    (window as any)[timeoutKey] = null;
  }

  // Handle streaming state
  if (isStreaming) {
    // Add streaming class to parameter name for visual indicator
    paramNameElement.classList.add('streaming-param-name');
    // Set data-streaming attribute on the parameter value element
    paramValueElement.setAttribute('data-streaming', 'true');

    // Force the parameter value element to have the right styling for streaming
    paramValueElement.style.overflow = 'auto';
    paramValueElement.style.maxHeight = '300px';
    paramValueElement.style.scrollBehavior = 'smooth';

    // Setup auto-scroll for both the container and any pre element inside
    setupAutoScroll(paramValueElement as ParamValueElement);

    const preElement = paramValueElement.querySelector('pre');
    if (preElement) {
      (preElement as any)._userHasScrolled = false; // Reset scroll state
      (preElement as any)._autoScrollToBottom = () => {
        preElement.scrollTop = preElement.scrollHeight;
      };
      (preElement as any)._autoScrollToBottom();
    }

    // Force scroll to bottom for all elements (immediate and after a short delay)
    const scrollToBottom = () => {
      if (
        paramValueElement.scrollHeight > paramValueElement.clientHeight &&
        !(paramValueElement as any)._userHasScrolled
      ) {
        paramValueElement.scrollTop = paramValueElement.scrollHeight;
      }

      if (preElement && preElement.scrollHeight > preElement.clientHeight && !(preElement as any)._userHasScrolled) {
        preElement.scrollTop = preElement.scrollHeight;
      }
    };

    // Execute immediately and after a delay to ensure content has rendered
    scrollToBottom();
    setTimeout(scrollToBottom, 10);
    setTimeout(scrollToBottom, 50);

    // Store timeout in a global property to be able to clear it later
    (window as any)[timeoutKey] = setTimeout(() => {
      if (paramNameElement && document.body.contains(paramNameElement)) {
        paramNameElement.classList.remove('streaming-param-name');
        if (paramValueElement) {
          paramValueElement.removeAttribute('data-streaming');
        }
      }
      (window as any)[timeoutKey] = null;
    }, 3000); // Reduced from 5000ms to 3000ms for more responsive feedback
  } else {
    // If parameter was previously streaming but is now complete, remove the indicator immediately
    if (paramNameElement.classList.contains('streaming-param-name')) {
      paramNameElement.classList.remove('streaming-param-name');
      if (paramValueElement) {
        paramValueElement.removeAttribute('data-streaming');
      }
    }
  }
};

/**
 * Extract parameter value from raw content
 */
const extractParameterValue = (rawContent: string, matchIndex: number): { value: string; isStreaming: boolean } | null => {
  const startTag = '<parameter>';
  const endTag = '</parameter>';
  const startIndex = rawContent.indexOf(startTag, matchIndex) + startTag.length;
  const endTagIndex = rawContent.indexOf(endTag, startIndex);

  // Determine if parameter is complete (has ending tag) or still streaming
  const isStreaming = endTagIndex === -1;
  let extractedValue: string;

  if (!isStreaming) {
    // Full parameter content available
    extractedValue = rawContent.substring(startIndex, endTagIndex);
  } else {
    // Partial parameter content (streaming)
    extractedValue = rawContent.substring(startIndex);
  }

  // Handle potential CDATA within the extracted value
  const cdataMatch = extractedValue.match(/<!\[CDATA\[(.*?)(?:\]\]>)?$/s);
  if (cdataMatch) {
    // Use CDATA content, remove partial end tag if streaming
    extractedValue = cdataMatch[1];
  } else {
    // Trim only if not CDATA, as CDATA preserves whitespace
    extractedValue = extractedValue.trim();
  }

  return { value: extractedValue, isStreaming };
};
