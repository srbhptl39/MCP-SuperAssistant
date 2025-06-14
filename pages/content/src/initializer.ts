import { initializeEventSystem } from './events/event-system';
import { eventBus } from './events/event-bus';
// import { initializeStores } from './stores'; // Placeholder - Adjust if store init is different
import { initializePluginRegistry } from './plugins/plugin-registry';

/**
 * Main application initializer.
 * Orchestrates the startup sequence of various application modules.
 */
export async function initializeApp(): Promise<void> {
  console.info('[ApplicationInitializer] Starting application initialization...');

  try {
    // 1. Initialize Stores
    // console.info('[ApplicationInitializer] Initializing stores...');
    // await initializeStores(); // Assuming stores might need async initialization
    // console.info('[ApplicationInitializer] Stores initialized.');

    // 2. Initialize Event System
    console.info('[ApplicationInitializer] Initializing event system...');
    await initializeEventSystem();
    console.info('[ApplicationInitializer] Event system initialized.');

    // 3. Initialize Plugin Registry
    console.info('[ApplicationInitializer] Initializing plugin registry...');
    await initializePluginRegistry();
    console.info('[ApplicationInitializer] Plugin registry initialized.');

    // TODO: Add other initialization steps as needed (e.g., UI, specific services)

    console.info('[ApplicationInitializer] Application initialized successfully.');
    eventBus.emit('app:initialized', { version: '0.1.0', timestamp: Date.now() }); // Example version

  } catch (error) {
    console.error('[ApplicationInitializer] Critical error during application initialization:', error);
    // Depending on the error, might want to notify the user or attempt recovery
    // For now, re-throw to make it visible at the highest level
    throw error;
  }
}

// It's common to also export a cleanup function if the app supports full teardown
export async function cleanupApp(): Promise<void> {
  console.info('[ApplicationInitializer] Starting application cleanup...');
  // Perform cleanup in reverse order of initialization
  // await cleanupPluginRegistry(); // Placeholder
  // cleanupEventSystem(); // This is already available from event-system.ts
  // await cleanupStores(); // Placeholder
  console.info('[ApplicationInitializer] Application cleaned up.');
  eventBus.emit('app:shutdown', { reason: 'Application cleanup initiated' });
}

// Note: The actual call to initializeApp() will likely be in the main entry point
// of the content script (e.g., content.ts or main.ts).
