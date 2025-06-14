/**
 * UI Initialization Example (Session 10)
 * 
 * Example implementation for popup and options page initialization.
 * This demonstrates how to initialize the core application before rendering React UI.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { applicationInit, applicationCleanup } from '../core/main-initializer';
import { logMessage } from '../utils/helpers';

// Simple logger for UI contexts
class UILogger {
  constructor(private context: string) {}
  
  log(message: string, ...args: any[]): void {
    logMessage(`[${this.context}] ${message}`);
    if (args.length > 0) {
      console.log(...args);
    }
  }
  
  error(message: string, ...args: any[]): void {
    console.error(`[${this.context}] ${message}`, ...args);
  }
}

/**
 * Initialize and render a React application with proper core initialization
 */
export async function initializeUIApplication(
  appComponent: React.ComponentType,
  rootElementId: string = 'root',
  context: string = 'UI'
): Promise<void> {
  const logger = new UILogger(context);
  
  logger.log('UI application initialization started...');
  
  try {
    // Step 1: Initialize core application
    logger.log('Initializing core application...');
    await applicationInit();
    logger.log('Core application initialized successfully.');

    // Step 2: Find root element
    const rootElement = document.getElementById(rootElementId);
    if (!rootElement) {
      throw new Error(`Root element #${rootElementId} not found`);
    }

    // Step 3: Create React root and render
    logger.log('Creating React root and rendering application...');
    const root = ReactDOM.createRoot(rootElement);
    
    // Use React.createElement instead of JSX to avoid TypeScript compilation issues
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(appComponent)
      )
    );
    
    logger.log('React UI rendered successfully.');

  } catch (error) {
    logger.error('Failed to initialize and render UI application:', error);
    
    // Display an error message in the UI if possible
    const rootElement = document.getElementById(rootElementId);
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="
          color: #ef4444; 
          padding: 20px; 
          font-family: system-ui, -apple-system, sans-serif;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          margin: 20px;
        ">
          <h3 style="margin: 0 0 10px 0; color: #dc2626;">
            Application Initialization Error
          </h3>
          <p style="margin: 0;">
            ${error instanceof Error ? error.message : String(error)}
          </p>
          <details style="margin-top: 10px;">
            <summary style="cursor: pointer; color: #dc2626;">
              Technical Details
            </summary>
            <pre style="
              margin-top: 10px; 
              font-size: 12px; 
              background: #fff; 
              padding: 10px; 
              border-radius: 4px;
              overflow: auto;
            ">${error instanceof Error ? error.stack : 'No stack trace available'}</pre>
          </details>
        </div>
      `;
    }
    
    throw error; // Re-throw for any external error handling
  }
}

/**
 * Example popup initialization
 */
export async function initializePopupApp(AppComponent: React.ComponentType): Promise<void> {
  return initializeUIApplication(AppComponent, 'root', 'PopupApp');
}

/**
 * Example options page initialization
 */
export async function initializeOptionsApp(AppComponent: React.ComponentType): Promise<void> {
  return initializeUIApplication(AppComponent, 'root', 'OptionsApp');
}

/**
 * Cleanup handler for UI applications
 */
export function setupUICleanup(): void {
  // Optional: Cleanup when the page/popup closes
  // Note: This might not always run reliably for popups due to their lifecycle
  window.addEventListener('beforeunload', () => {
    applicationCleanup().catch(err => {
      console.error('Error during UI cleanup:', err);
    });
  });

  // For Chrome extension contexts, also listen for the page hiding
  window.addEventListener('pagehide', () => {
    applicationCleanup().catch(err => {
      console.error('Error during page hide cleanup:', err);
    });
  });
}

/**
 * Complete popup app setup (example usage)
 */
export async function setupPopupApp(AppComponent: React.ComponentType): Promise<void> {
  setupUICleanup();
  await initializePopupApp(AppComponent);
}

/**
 * Complete options app setup (example usage)
 */
export async function setupOptionsApp(AppComponent: React.ComponentType): Promise<void> {
  setupUICleanup();
  await initializeOptionsApp(AppComponent);
}

// Export for convenience
export { applicationInit, applicationCleanup } from '../core/main-initializer';
