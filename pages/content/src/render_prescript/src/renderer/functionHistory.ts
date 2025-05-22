/**
 * Function history component for displaying previously executed functions
 * This module provides functionality to display and re-execute previously run functions
 * Using URL-based storage to prevent race conditions and isolate function executions by URL
 */

import type { ExecutedFunction } from '../mcpexecute/storage';
import {
  formatExecutionTime,
  getExecutedFunctionsForCurrentUrl,
  storeExecutedFunction,
  getPreviousExecution,
} from '../mcpexecute/storage';
import { displayResult } from './components';

/**
 * Create a history panel for previously executed functions
 *
 * @param blockDiv Function block div container
 * @param callId Unique ID for the function call
 * @param contentSignature Content signature for the function call
 * @returns The created history panel element
 */
export const createHistoryPanel = (
  blockDiv: HTMLDivElement,
  callId: string,
  contentSignature: string,
): HTMLDivElement => {
  // First, remove any existing history panels to ensure we only have one
  const existingPanels = blockDiv.querySelectorAll('.function-history-panel');
  existingPanels.forEach(panel => panel.remove());

  // Also check if we're in a function-buttons container and need to clean up the parent block
  if (blockDiv.classList.contains('function-buttons')) {
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      const parentPanels = parentBlock.querySelectorAll('.function-history-panel');
      parentPanels.forEach(panel => panel.remove());
    }
  }

  // Create history panel
  const historyPanel = document.createElement('div');
  historyPanel.className = 'function-history-panel';
  historyPanel.style.display = 'none';

  // Add to block div
  if (blockDiv.classList.contains('function-buttons')) {
    // If we're in a button container, add historyPanel to the parent
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      parentBlock.appendChild(historyPanel);
    } else {
      blockDiv.appendChild(historyPanel);
    }
  } else {
    blockDiv.appendChild(historyPanel);
  }

  return historyPanel;
};

/**
 * Update the history panel with execution data
 *
 * @param historyPanel History panel element
 * @param executionData Execution data to display
 * @param mcpHandler MCP handler for re-executing functions
 */
export const updateHistoryPanel = (
  historyPanel: HTMLDivElement,
  executionData: ExecutedFunction,
  mcpHandler: any,
): void => {
  // Clear existing content
  historyPanel.innerHTML = '';

  // Create header
  const header = document.createElement('div');
  header.className = 'function-history-header';
  header.textContent = 'Execution History';
  historyPanel.appendChild(header);

  // Create execution info
  const executionInfo = document.createElement('div');
  executionInfo.className = 'function-execution-info';

  // Format the execution time
  const executionTime = formatExecutionTime(executionData.executedAt);

  executionInfo.innerHTML = `
    <div>Function: <strong>${executionData.functionName}</strong></div>
    <div>Last executed: <strong>${executionTime}</strong></div>
  `;
  historyPanel.appendChild(executionInfo);

  // Create re-execute button
  const reExecuteBtn = document.createElement('button');
  reExecuteBtn.className = 'function-reexecute-button';
  reExecuteBtn.textContent = 'Re-execute';

  // Handle re-execution
  reExecuteBtn.onclick = () => {
    // Create results panel if it doesn't exist
    let resultsPanel = historyPanel.parentElement?.querySelector(
      `.function-results-panel[data-call-id="${executionData.callId}"]`,
    ) as HTMLDivElement;

    // overflow
    if (resultsPanel) {
      resultsPanel.style.overflow = 'auto';
      resultsPanel.style.maxHeight = '200px';
    }

    if (!resultsPanel) {
      resultsPanel = document.createElement('div');
      resultsPanel.className = 'function-results-panel';
      resultsPanel.setAttribute('data-call-id', executionData.callId);
      resultsPanel.setAttribute('data-function-name', executionData.functionName);
      resultsPanel.style.display = 'block';
      historyPanel.parentElement?.appendChild(resultsPanel);
    } else {
      resultsPanel.style.display = 'block';
      resultsPanel.innerHTML = '';
    }

    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'function-results-loading';
    loadingIndicator.textContent = 'Executing...';
    resultsPanel.appendChild(loadingIndicator);

    try {
      if (!mcpHandler) {
        displayResult(resultsPanel, loadingIndicator, false, 'Error: mcpHandler not found');
        return;
      }

      console.debug(`Re-executing function ${executionData.functionName} with arguments:`, executionData.params);

      mcpHandler.callTool(executionData.functionName, executionData.params, (result: any, error: any) => {
        if (error) {
          // Pass the error directly without adding "Error:" prefix
          displayResult(resultsPanel, loadingIndicator, false, error);
        } else {
          displayResult(resultsPanel, loadingIndicator, true, result);

          // Update the execution record with new timestamp
          // Always use the current URL context when storing execution data
          const updatedExecutionData = storeExecutedFunction(
            executionData.functionName,
            executionData.callId,
            executionData.params,
            executionData.contentSignature,
          );

          // Update the history panel with the new timestamp
          updateHistoryPanel(historyPanel, updatedExecutionData, mcpHandler);
        }
      });
    } catch (error) {
      displayResult(
        resultsPanel,
        loadingIndicator,
        false,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  historyPanel.appendChild(reExecuteBtn);

  // Show the panel
  historyPanel.style.display = 'block';
};

/**
 * Check for previously executed functions and update the UI accordingly
 *
 * @param blockDiv Function block div container
 * @param functionName Name of the function
 * @param callId Unique ID for the function call
 * @param contentSignature Content signature for the function
 */
export const checkAndDisplayFunctionHistory = (
  blockDiv: HTMLDivElement,
  functionName: string,
  callId: string,
  contentSignature: string,
): void => {
  // Get executed functions for the current URL
  const executedFunctions = getExecutedFunctionsForCurrentUrl();

  // Find matching executions - direct lookup from localStorage to prevent race conditions
  const exactMatch = getPreviousExecution(functionName, callId, contentSignature);
  const matchingExecutions = exactMatch ? [exactMatch] : [];

  // Fallback to filter method if exact match not found
  if (!exactMatch) {
    const filteredMatches = executedFunctions.filter(
      func => func.callId === callId && func.contentSignature === contentSignature,
    );
    filteredMatches.forEach(match => matchingExecutions.push(match));
  }

  if (matchingExecutions.length > 0) {
    // Sort by execution time (newest first) and take only the latest
    const latestExecution = matchingExecutions.sort((a, b) => b.executedAt - a.executedAt)[0];

    // Create history panel (this will remove any existing panels)
    const historyPanel = createHistoryPanel(blockDiv, callId, contentSignature);

    // Access the global mcpHandler
    const mcpHandler = (window as any).mcpHandler;

    // Update the panel with the latest execution data
    updateHistoryPanel(historyPanel, latestExecution, mcpHandler);

    // Log that we're showing only the latest execution
    console.debug(
      `Showing only the latest execution from ${matchingExecutions.length} matches for function ${functionName}`,
    );
  }
};
