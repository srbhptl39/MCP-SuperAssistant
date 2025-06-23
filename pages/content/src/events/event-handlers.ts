// This file is intended for global event handlers that subscribe to the eventBus.
// For example, logging all events, or handling specific events globally.

// import { eventBus } from './event-bus';
// import type { EventMap } from './event-types';

// Example: Log all events (for debugging purposes)
/*
function logAllEvents() {
  const allEvents = Object.keys(eventBus.getAllEventListeners()) as Array<keyof EventMap>; // Assuming getAllEventListeners exists or similar introspection

  allEvents.forEach(eventName => {
    eventBus.on(eventName, (data) => {
      console.debug(`[GlobalEventHandler] Event: ${eventName}`, data);
    });
  });
}
*/

// Example: Global handler for a specific event
/*
function handleGlobalErrorEvents() {
  eventBus.on('error:unhandled', (data) => {
    console.error('[GlobalEventHandler] Unhandled error detected:', data.error, 'Context:', data.context);
    // Potentially send to a global error tracking service
  });
}
*/

/**
 * Initializes global event handlers.
 * This function can be called once during application setup.
 */
import { eventBus } from './event-bus';
import type { EventMap, UnsubscribeFunction } from './event-types';

class GlobalEventHandlers {
  private unsubscribeFunctions: UnsubscribeFunction[] = [];

  constructor() {
    // The eventBus instance is imported directly, so no need to pass it in constructor
    // if we are creating a single global instance of these handlers.
  }

  private _logEvent<K extends keyof EventMap>(eventName: K) {
    return (data: EventMap[K]) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[GlobalEventHandlers] Event "${String(eventName)}":`, data);
      }
    };
  }

  init(): void {
    this.destroy(); // Clear any existing listeners before re-initializing
    console.debug('[GlobalEventHandlers] Initializing global event handlers...');

  

  // App lifecycle events
  this.unsubscribeFunctions.push(eventBus.on('app:initialized', this._logEvent('app:initialized')));
  this.unsubscribeFunctions.push(eventBus.on('app:shutdown', this._logEvent('app:shutdown')));
  this.unsubscribeFunctions.push(eventBus.on('app:site-changed', this._logEvent('app:site-changed')));
  this.unsubscribeFunctions.push(eventBus.on('app:settings-updated', this._logEvent('app:settings-updated')));

  // Connection events
  this.unsubscribeFunctions.push(eventBus.on('connection:status-changed', this._logEvent('connection:status-changed')));
  this.unsubscribeFunctions.push(eventBus.on('connection:error', this._logEvent('connection:error')));

  // Adapter events
  this.unsubscribeFunctions.push(eventBus.on('adapter:activated', this._logEvent('adapter:activated')));
  this.unsubscribeFunctions.push(eventBus.on('adapter:deactivated', this._logEvent('adapter:deactivated')));
  this.unsubscribeFunctions.push(eventBus.on('adapter:error', this._logEvent('adapter:error')));

  // Plugin events
  this.unsubscribeFunctions.push(eventBus.on('plugin:registered', this._logEvent('plugin:registered')));
  this.unsubscribeFunctions.push(eventBus.on('plugin:unregistered', this._logEvent('plugin:unregistered')));
  this.unsubscribeFunctions.push(eventBus.on('plugin:activation-failed', this._logEvent('plugin:activation-failed')));

  // Error events
  this.unsubscribeFunctions.push(
    eventBus.on('error:unhandled', (data) => {
      try {
        console.error('[GlobalEventHandlers] Event "error:unhandled":', data.error, 'Context:', data.context, 'Stack:', data.error?.stack);
        // TODO: Integrate with a global error tracking service if available
      } catch (handlerError) {
        // Prevent recursive error handling by just logging to console without emitting events
        console.error('[GlobalEventHandlers] Error in error:unhandled handler:', handlerError);
      }
    })
  );
  this.unsubscribeFunctions.push(eventBus.on('error:circuit-breaker-opened', this._logEvent('error:circuit-breaker-opened')));
  this.unsubscribeFunctions.push(eventBus.on('error:circuit-breaker-closed', this._logEvent('error:circuit-breaker-closed')));
  
  // UI events (optional, can be noisy, but useful for debugging)
  // UI events (optional, can be noisy, but useful for debugging if enabled)
    // this.unsubscribeFunctions.push(eventBus.on('ui:sidebar-toggle', this._logEvent('ui:sidebar-toggle')));
    // this.unsubscribeFunctions.push(eventBus.on('ui:theme-changed', this._logEvent('ui:theme-changed')));
    // this.unsubscribeFunctions.push(eventBus.on('ui:notification-added', this._logEvent('ui:notification-added')));

    // Performance events
    this.unsubscribeFunctions.push(eventBus.on('performance:measurement', this._logEvent('performance:measurement')));

    console.debug('[GlobalEventHandlers] Global event handlers initialized.');
  }

  destroy(): void {
    console.debug('[GlobalEventHandlers] Destroying global event handlers...');
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];
    console.debug('[GlobalEventHandlers] Global event handlers destroyed.');
  }
}

// Create a single instance for the application to use
const globalEventHandlers = new GlobalEventHandlers();

// Exported functions to manage the lifecycle of the global handlers
export const initializeGlobalEventHandlers = (): void => {
  globalEventHandlers.init();
};

export const cleanupGlobalEventHandlers = (): void => {
  globalEventHandlers.destroy();
};

