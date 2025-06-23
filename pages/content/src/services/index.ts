/**
 * Services Index
 * 
 * Centralized export point for all application services
 */

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
  console.debug('[Services] Initializing all application services...');
  
  try {
    // Initialize automation service
    const { initializeAutomationService } = await import('./automation.service');
    initializeAutomationService();
    
    console.debug('[Services] All services initialized successfully');
  } catch (error) {
    console.error('[Services] Error initializing services:', error);
    throw error;
  }
}

// Export cleanup function for all services
export async function cleanupAllServices(): Promise<void> {
  console.debug('[Services] Cleaning up all application services...');
  
  try {
    // Cleanup automation service
    const { cleanupAutomationService } = await import('./automation.service');
    cleanupAutomationService();
    
    console.debug('[Services] All services cleaned up successfully');
  } catch (error) {
    console.error('[Services] Error cleaning up services:', error);
  }
}
