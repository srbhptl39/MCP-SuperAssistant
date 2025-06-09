import { CONFIG } from '../core/config';
import { renderFunctionResult, processedResultElements } from '../renderer/functionResult';

// State for processing and observers
const isProcessing = false;
let functionResultObserver: MutationObserver | null = null;

/**
 * Process all function results in the document
 * @returns Number of processed function results
 */
export const processFunctionResults = (): number => {
  if (!CONFIG.function_result_selector || CONFIG.function_result_selector.length === 0) {
    return 0;
  }

  return checkForUnprocessedFunctionResults();
};

/**
 * Check for unprocessed function results in the document
 * @returns Number of processed function results
 */
export const checkForUnprocessedFunctionResults = (): number => {
  if (!CONFIG.function_result_selector || CONFIG.function_result_selector.length === 0) {
    return 0;
  }

  const targetElements = getTargetElements();
  let processedCount = 0;

  // Process each target element
  for (const element of targetElements) {
    if (!processedResultElements.has(element)) {
      const isProcessingRef = { current: isProcessing };
      const success = renderFunctionResult(element, isProcessingRef);
      if (success) {
        processedCount++;
      }
    }
  }

  if (CONFIG.debug && processedCount > 0) {
    console.debug(`Processed ${processedCount} function results`);
  }

  return processedCount;
};

/**
 * Get all elements in the document that might contain function results
 * @returns Array of HTML elements
 */
const getTargetElements = (): HTMLElement[] => {
  if (!CONFIG.function_result_selector || CONFIG.function_result_selector.length === 0) {
    return [];
  }

  const elements: HTMLElement[] = [];

  // Get all elements matching the function result selectors
  for (const selector of CONFIG.function_result_selector) {
    try {
      // Handle standard CSS selector
      const matches = document.querySelectorAll(selector);
      for (const match of Array.from(matches)) {
        // Added Array.from()
        if (match instanceof HTMLElement) {
          elements.push(match);
        }
      }

      // If the selector contains multiple classes, also try to find elements by individual classes
      if (selector.includes('.') && selector.includes(' ')) {
        // This might be a complex selector with multiple classes
        handleComplexSelector(selector, elements);
      } else if (selector.startsWith('div.') && selector.split('.').length > 2) {
        // This is a div with multiple classes like 'div.class1.class2.class3'
        handleMultiClassSelector(selector, elements);
      }
    } catch (e) {
      console.error(`Invalid selector: ${selector}`, e);
      // Try alternative approach for complex selectors
      if (selector.includes('.')) {
        handleFallbackSelector(selector, elements);
      }
    }
  }

  return elements;
};

/**
 * Handle a complex selector with multiple parts
 * @param selector The complex CSS selector
 * @param elements Array to add found elements to
 */
const handleComplexSelector = (selector: string, elements: HTMLElement[]): void => {
  // Split by spaces to get individual parts
  const parts = selector.split(' ');

  // Start with all elements matching the first part
  let currentMatches: Element[] = Array.from(document.querySelectorAll(parts[0]));

  // For each subsequent part, filter the matches
  for (let i = 1; i < parts.length; i++) {
    const nextPart = parts[i];
    const nextMatches: Element[] = [];

    for (const match of currentMatches) {
      // Find children matching the next part
      const children = match.querySelectorAll(nextPart);
      children.forEach(child => nextMatches.push(child));
    }

    currentMatches = nextMatches;
  }

  // Add the final matches to the elements array
  for (const match of currentMatches) {
    if (match instanceof HTMLElement && !elements.includes(match)) {
      elements.push(match);
    }
  }
};

/**
 * Handle a selector with multiple classes on a single element
 * @param selector The multi-class selector (e.g., 'div.class1.class2.class3')
 * @param elements Array to add found elements to
 */
const handleMultiClassSelector = (selector: string, elements: HTMLElement[]): void => {
  // Parse the selector to get element type and classes
  const [elementType, ...classNames] = selector.split('.');

  // Find all elements of the specified type
  const allElements = document.querySelectorAll(elementType);

  // Filter elements that have all the specified classes
  for (const element of Array.from(allElements)) {
    // Added Array.from()
    if (classNames.every(className => element.classList.contains(className))) {
      if (element instanceof HTMLElement && !elements.includes(element)) {
        elements.push(element);
      }
    }
  }
};

/**
 * Fallback method for handling selectors that might be causing errors
 * @param selector The problematic selector
 * @param elements Array to add found elements to
 */
const handleFallbackSelector = (selector: string, elements: HTMLElement[]): void => {
  if (CONFIG.debug) {
    console.debug(`Using fallback method for selector: ${selector}`);
  }

  // Try to extract the element type and classes
  const match = selector.match(/^([a-z]+)\.(.*)/i);
  if (!match) return;

  const [, elementType, classesStr] = match;
  const classes = classesStr.split('.');

  // Find all elements of the specified type
  const allElements = document.querySelectorAll(elementType);

  // Check each element for the required classes
  for (const element of Array.from(allElements)) {
    // Added Array.from()
    // For complex selectors, we'll be more lenient and match if ANY of the classes match
    const hasAnyClass = classes.some(cls => element.classList.contains(cls));

    if (hasAnyClass && element instanceof HTMLElement && !elements.includes(element)) {
      elements.push(element);
    }
  }
};

/**
 * Handle DOM changes by checking for new function results
 */
const handleDomChanges = (): void => {
  setTimeout(() => {
    processFunctionResults();
  }, 0);
};

/**
 * Start direct monitoring of content for function results
 */
export const startFunctionResultMonitoring = (): void => {
  if (!CONFIG.function_result_selector || CONFIG.function_result_selector.length === 0) {
    if (CONFIG.debug) {
      console.debug('Function result monitoring disabled: no selectors configured');
    }
    return;
  }

  if (functionResultObserver) {
    stopFunctionResultMonitoring();
  }

  if (CONFIG.debug) {
    console.debug('Starting function result monitoring');
  }

  // Initial processing
  processFunctionResults();

  // Create a new mutation observer
  functionResultObserver = new MutationObserver(mutations => {
    let shouldProcess = false;
    let potentialFunctionResult = false;

    // Check if any mutation might contain a function result
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Check if the element matches any function result selector
            const isTargetElement = CONFIG.function_result_selector?.some(selector => {
              try {
                return element.matches(selector);
              } catch (e) {
                return false;
              }
            });

            // Check if the element contains any elements matching the function result selectors
            const hasTargetElements = CONFIG.function_result_selector?.some(selector => {
              try {
                return element.querySelectorAll(selector).length > 0;
              } catch (e) {
                return false;
              }
            });

            // Also check if the content of any text nodes might contain function result patterns
            if (
              element.textContent &&
              (element.textContent.includes('<function_result') || element.textContent.includes('</function_result>'))
            ) {
              potentialFunctionResult = true;
            }

            if (isTargetElement || hasTargetElements || potentialFunctionResult) {
              shouldProcess = true;
              break;
            }
          } else if (node.nodeType === Node.TEXT_NODE) {
            // Also check text nodes for function result patterns
            const textContent = node.textContent || '';
            if (textContent.includes('<function_result') || textContent.includes('</function_result>')) {
              potentialFunctionResult = true;
              shouldProcess = true;
              break;
            }
          }
        }
      } else if (mutation.type === 'characterData') {
        // Check if the characterData mutation might be adding function result content
        const textContent = mutation.target.textContent || '';
        if (textContent.includes('<function_result') || textContent.includes('</function_result>')) {
          potentialFunctionResult = true;
          shouldProcess = true;
        }
      }

      if (shouldProcess) break;
    }

    if (shouldProcess) {
      if (potentialFunctionResult && CONFIG.debug) {
        console.debug('Potential function result detected, processing DOM changes');
      }
      handleDomChanges();
    }
  });

  // Configure the observer to watch for changes to the document
  functionResultObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  });

  if (CONFIG.debug) {
    console.debug('Function result monitoring started');
  }
};

/**
 * Stop direct monitoring of content for function results
 */
export const stopFunctionResultMonitoring = (): void => {
  if (functionResultObserver) {
    functionResultObserver.disconnect();
    functionResultObserver = null;

    if (CONFIG.debug) {
      console.debug('Function result monitoring stopped');
    }
  }
};

/**
 * Initialize the observer for function results
 */
export const initializeFunctionResultObserver = (): void => {
  if (!CONFIG.function_result_selector || CONFIG.function_result_selector.length === 0) {
    if (CONFIG.debug) {
      console.debug('Function result observer not initialized: no selectors configured');
    }
    return;
  }

  startFunctionResultMonitoring();
};
