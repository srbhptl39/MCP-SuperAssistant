/**
 * Services Index
 * 
 * Centralized export point for all application services
 */

import { createLogger } from '@extension/shared/lib/logger';
const logger = createLogger('Services Index');

export { 
  AutomationService, 
  automationService, 
  initializeAutomationService, 
  cleanupAutomationService,
  type AutomationState,
  type ToolExecutionCompleteDetail
} from './automation.service';

// Export initialization function for all services
export async function initializeAllServices(): Promise<void> {
  logger.debug('[Services] Initializing all application services...');
  
  try {
    // Initialize automation service
    const { initializeAutomationService } = await import('./automation.service');
    initializeAutomationService();
    
    logger.debug('[Services] All services initialized successfully');
  } catch (error) {
    logger.error('[Services] Error initializing services:', error);
    throw error;
  }
}

// Export cleanup function for all services
export async function cleanupAllServices(): Promise<void> {
  logger.debug('[Services] Cleaning up all application services...');
  
  try {
    // Cleanup automation service
    const { cleanupAutomationService } = await import('./automation.service');
    cleanupAutomationService();
    
    logger.debug('[Services] All services cleaned up successfully');
  } catch (error) {
    logger.error('[Services] Error cleaning up services:', error);
  }
}
