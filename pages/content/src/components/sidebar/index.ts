/**
 * Common Sidebar Components
 *
 * This file exports common sidebar components and utilities that can be used
 * by both ChatGPT and Perplexity implementations.
 */

import { SidebarManager } from './SidebarManager';
import { BaseSidebarManager } from './base/BaseSidebarManager';
import type { SiteType } from './base/BaseSidebarManager';

// Inject React error handlers to catch and log React errors
if (typeof window !== 'undefined') {
  // Create a global error handler for React errors
  window.addEventListener('error', event => {
    if (
      event.error &&
      event.error.message &&
      (event.error.message.includes('React') || event.error.message.includes('Minified React error'))
    ) {
      // Log React errors for debugging
      console.error('[Sidebar] React error caught by global handler:', event.error);

      // Prevent the sidebar from getting into an inconsistent state
      try {
        const activeSidebarManager = (window as any).activeSidebarManager;
        if (activeSidebarManager) {
          // Force re-initialization after a small delay
          setTimeout(() => {
            try {
              // If sidebar exists but is in error state, reinitialize it
              const hostElement = activeSidebarManager.getShadowHost();
              if (hostElement && hostElement.style.display !== 'none') {
                activeSidebarManager.destroy();
                activeSidebarManager.initialize();
              }
            } catch (reinitError) {
              console.error('[Sidebar] Error during re-initialization:', reinitError);
            }
          }, 500);
        }
      } catch (handlerError) {
        console.error('[Sidebar] Error in React error handler:', handlerError);
      }
    }
  });
}

// Export components and utilities
export { BaseSidebarManager, SidebarManager };

// Export types
export type { SiteType };
