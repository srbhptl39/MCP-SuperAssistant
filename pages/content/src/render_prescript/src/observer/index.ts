// Observer functionality exports
import {
  processUpdateQueue,
  processFunctionCalls,
  checkForUnprocessedFunctionCalls,
  startDirectMonitoring,
  stopDirectMonitoring,
  initializeObserver,
} from './mutationObserver';
import {
  processFunctionResults,
  checkForUnprocessedFunctionResults,
  startFunctionResultMonitoring,
  stopFunctionResultMonitoring,
  initializeFunctionResultObserver,
} from './functionResultObserver';
import {
  checkStalledStreams,
  detectPreExistingIncompleteBlocks,
  preExistingIncompleteBlocks,
  startStalledStreamDetection,
  stopStalledStreamDetection,
  updateStalledStreamTimeoutConfig,
} from './stalledStreamHandler';
import { checkStreamingUpdates } from './streamObserver';

// Re-export only the functions that need to be public
export {
  // Main functions
  processFunctionCalls,
  checkForUnprocessedFunctionCalls,
  startDirectMonitoring,
  stopDirectMonitoring,
  initializeObserver,

  // Function result functions
  processFunctionResults,
  checkForUnprocessedFunctionResults,
  startFunctionResultMonitoring,
  stopFunctionResultMonitoring,
  initializeFunctionResultObserver,

  // Streaming and updates
  processUpdateQueue,
  checkStreamingUpdates,

  // Stalled streams
  checkStalledStreams,
  detectPreExistingIncompleteBlocks,
  preExistingIncompleteBlocks,
  startStalledStreamDetection,
  stopStalledStreamDetection,
  updateStalledStreamTimeoutConfig,
};
