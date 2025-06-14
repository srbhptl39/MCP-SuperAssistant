// Legacy initializer - now delegates to the main initializer
import { applicationInit, applicationCleanup } from './core/main-initializer';

/**
 * Legacy initialization function - now delegates to the comprehensive main initializer
 * @deprecated Use applicationInit from main-initializer instead
 */
export async function initializeApp(): Promise<void> {
  console.warn('[Initializer] Using legacy initializeApp - consider using applicationInit from main-initializer');
  return applicationInit();
}

/**
 * Legacy cleanup function - now delegates to the comprehensive cleanup
 * @deprecated Use applicationCleanup from main-initializer instead
 */
export async function cleanupApp(): Promise<void> {
  console.warn('[Initializer] Using legacy cleanupApp - consider using applicationCleanup from main-initializer');
  return applicationCleanup();
}

// Re-export the new functions for convenience
export { applicationInit, applicationCleanup } from './core/main-initializer';
