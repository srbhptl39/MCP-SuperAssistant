// Re-export renderer functionality
export * from './functionBlock';
export * from './functionResult';
export * from './components';
export * from './styles';

// Import proper types and dependencies
import { CONFIG } from '../core/config';
import type { FunctionInfo, ParamValueElement } from '../core/types';
import { Parameter } from '../core/types';
import { extractParameters } from '../parser/index';
import { stabilizeBlock, unstabilizeBlock, addExecuteButton, smoothlyUpdateBlockContent } from './components';
import { createOrUpdateParamElement } from './functionBlock';
import { safelySetContent } from '../utils/dom';

// Define a render options interface
interface RenderOptions {
  current: boolean;
}

// Find the part where an existing function block is updated during streaming and add smooth updates

/**
 * Update an existing function block with new content
 *
 * @param block The existing function block element
 * @param functionContent The updated content to display
 * @param functionInfo Information about the function call
 * @param options Rendering options
 */
const updateExistingFunctionBlock = (
  block: HTMLElement,
  functionContent: string,
  functionInfo: FunctionInfo,
  options: RenderOptions,
): void => {
  const blockId = block.getAttribute('data-block-id');
  if (!blockId) return;

  if (CONFIG.debug) console.debug(`Updating existing function block: ${blockId}`);

  // Check if we're transitioning from loading to complete
  const wasLoading = block.classList.contains('function-loading');
  const isComplete = functionInfo.isComplete;

  // Directly update state and content when transitioning or already complete
  if (isComplete) {
    // Ensure loading class is removed and complete class is added
    if (block.classList.contains('function-loading')) {
      block.classList.remove('function-loading');
    }
    if (!block.classList.contains('function-complete')) {
      block.classList.add('function-complete');
    }

    // Update the function content area using safelySetContent
    const contentArea = block.querySelector('.function-content');
    if (contentArea) {
      safelySetContent(contentArea as ParamValueElement, functionContent);
    }

    // Update parameters if needed
    updateParameters(block, functionInfo, options);

    // Add execute button if not already present
    if (!block.querySelector('.execute-button')) {
      // Find the original pre element to get the raw content
      const originalPre = document.querySelector(`pre[data-block-id="${blockId}"]`);
      if (originalPre && originalPre.textContent?.trim()) {
        addExecuteButton(block as HTMLDivElement, originalPre.textContent!.trim());
      }
    }
  } else {
    // Handle cases where block is still loading or becomes incomplete again
    if (block.classList.contains('function-complete')) {
      block.classList.remove('function-complete');
    }
    if (!block.classList.contains('function-loading')) {
      block.classList.add('function-loading');
      // Potentially remove execute button/toggle if added previously
      const executeBtn = block.querySelector('.execute-button');
      if (executeBtn) executeBtn.remove();
      // Add spinner etc. if needed (assuming functionBlock.ts handles this primarily)
    }

    // Update the function content area using safelySetContent
    const contentArea = block.querySelector('.function-content');
    if (contentArea) {
      safelySetContent(contentArea as ParamValueElement, functionContent);
    }

    // Update parameters
    updateParameters(block, functionInfo, options);
  }
};

/**
 * Update parameters in a function block
 */
const updateParameters = (block: HTMLElement, functionInfo: FunctionInfo, options: RenderOptions): void => {
  // Get extracted parameters
  const parameters = extractParameters(
    block.getAttribute('data-content') || '',
    block.getAttribute('data-block-id') || null,
  );

  // Update parameter values
  const paramContainer = block.querySelector('.function-parameters');
  if (!paramContainer) return;

  for (const param of parameters) {
    // Find existing parameter row or create a new one
    const paramRow = paramContainer.querySelector(`.param-row[data-param-name="${param.name}"]`) as HTMLElement;
    if (!paramRow) {
      // Use standard createOrUpdateParamElement for new parameters
      createOrUpdateParamElement(
        block as HTMLDivElement,
        param.name,
        param.value,
        block.getAttribute('data-block-id') || '',
        true,
        param.isStreaming || false,
      );
    } else {
      // Get the value container
      const valueContainer = paramRow.querySelector('.param-value') as HTMLElement;
      if (!valueContainer) continue;

      // Use smoothlyUpdateBlockContent to minimize DOM changes for streaming parameters
      if (param.isStreaming) {
        // Stabilize DOM during streaming for smoother updates
        stabilizeBlock(valueContainer);
        // Apply content update with minimal DOM operations
        smoothlyUpdateBlockContent(valueContainer, param.value, true);
      } else {
        // For completed parameters, use standard update
        safelySetContent(valueContainer as ParamValueElement, param.value);
        // Ensure block is unstabilized after completion
        unstabilizeBlock(valueContainer);
      }

      // Update parameter state classes
      if (param.isComplete) {
        paramRow.classList.remove('param-streaming');
        paramRow.classList.add('param-complete');
      } else {
        paramRow.classList.remove('param-complete'); // Ensure complete is removed
        paramRow.classList.add('param-streaming');
      }
    }
  }
};
