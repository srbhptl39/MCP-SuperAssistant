import { initializeEventBus } from './event-bus';
import { initializeGlobalEventHandlers, cleanupGlobalEventHandlers } from './event-handlers';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Initializes the entire event system, including the event bus and global handlers.
 */

const logger = createLogger('EventSystem');

export async function initializeEventSystem(): Promise<void> {
  logger.debug('[EventSystem] Initializing event system...');
  await initializeEventBus(); // Assuming initializeEventBus might be async in the future
  initializeGlobalEventHandlers();
  logger.debug('[EventSystem] Event system initialized successfully.');
}

/**
 * Cleans up the entire event system, removing global handlers.
 */
export function cleanupEventSystem(): void {
  logger.debug('[EventSystem] Cleaning up event system...');
  cleanupGlobalEventHandlers();
  // If eventBus itself had global state or resources to clear beyond listeners,
  // it would be done here. For now, global handlers cleanup is the main action.
  logger.debug('[EventSystem] Event system cleaned up.');
}
