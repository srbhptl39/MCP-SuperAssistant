import type { EventMap, TypedEventCallback, WildcardEventCallback, UnsubscribeFunction } from './event-types';

class TypedEventBus {
  private wildcardListeners = new Set<WildcardEventCallback>();
  private eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];
  private maxHistorySize = 100;
  private isEnabled = true;
  private listeners = new Map<keyof EventMap, Set<TypedEventCallback<any>>>();
  private onceListeners = new Map<keyof EventMap, Set<TypedEventCallback<any>>>();
  private maxListeners: number = 50; // Default max listeners

  constructor(maxListeners?: number, maxHistorySize?: number) {
    if (maxListeners !== undefined) {
      this.maxListeners = maxListeners;
    }
    if (maxHistorySize !== undefined) {
      this.maxHistorySize = maxHistorySize;
    }
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    if (!this.isEnabled) return;

    const timestamp = Date.now();
    // Add to history
    this.eventHistory.push({ event: event as string, data, timestamp });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    const regularListeners = this.listeners.get(event);
    if (regularListeners) {
      // Iterate over a copy in case a listener modifies the set during iteration
      [...regularListeners].forEach(callback => {
        try {
          (callback as TypedEventCallback<K>)(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for event "${String(event)}":`, error);
          // Emit a specific error event for unhandled listener errors
          this.emit('error:unhandled', { 
            error: error as Error, 
            context: `event-listener-${String(event)}` 
          });
        }
      });
    }

    const onceOnlyListeners = this.onceListeners.get(event);
    if (onceOnlyListeners) {
      // Iterate over a copy and clear before execution to ensure "once" behavior
      const listenersToExecute = [...onceOnlyListeners];
      this.onceListeners.delete(event); // Remove before executing to prevent re-triggering if emit is called within a listener
      listenersToExecute.forEach(callback => {
        try {
          (callback as TypedEventCallback<K>)(data);
        } catch (error) {
          console.error(`[EventBus] Error in once listener for event "${String(event)}":`, error);
          this.emit('error:unhandled', { 
            error: error as Error, 
            context: `once-event-listener-${String(event)}` 
          });
        }
      });
    }

    // Emit to wildcard listeners
    // Iterate over a copy in case a listener modifies the set during iteration
    [...this.wildcardListeners].forEach(callback => {
      try {
        // For wildcard, pass an object with event name and data
        (callback as WildcardEventCallback)({ event, data });
      } catch (error) {
        console.error(`[EventBus] Error in wildcard event listener:`, error);
        // Potentially emit 'error:unhandled' here too, if wildcard errors should be globally reported
        this.emit('error:unhandled', { 
          error: error as Error, 
          context: `wildcard-event-listener` 
        });
      }
    });

    // Development logging
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.log(`[EventBus] Emitted "${String(event)}":`, data);
    }
  }

  on<K extends keyof EventMap>(
    event: K,
    callback: TypedEventCallback<K>
  ): UnsubscribeFunction {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const eventListenersSet = this.listeners.get(event)!;

    if (eventListenersSet.size >= this.maxListeners) {
      console.warn(
        `[EventBus] Max listeners (${this.maxListeners}) reached for event "${String(event)}". ` +
        `This might indicate a memory leak.`
      );
    }
    eventListenersSet.add(callback as TypedEventCallback<any>);
    return () => this.off(event, callback);
  }

  once<K extends keyof EventMap>(
    event: K,
    callback: TypedEventCallback<K>
  ): UnsubscribeFunction {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    const eventListenersSet = this.onceListeners.get(event)!;

    if (eventListenersSet.size >= this.maxListeners) {
      console.warn(
        `[EventBus] Max listeners (${this.maxListeners}) reached for event (once) "${String(event)}". ` +
        `This might indicate a memory leak.`
      );
    }
    eventListenersSet.add(callback as TypedEventCallback<any>);
    
    // Return a function that specifically removes this 'once' listener
    return () => {
      const currentOnceListeners = this.onceListeners.get(event);
      if (currentOnceListeners) {
        currentOnceListeners.delete(callback as TypedEventCallback<any>);
        if (currentOnceListeners.size === 0) {
          this.onceListeners.delete(event);
        }
      }
    };
  }

  off<K extends keyof EventMap>(
    event: K,
    callback: TypedEventCallback<K>
  ): void {
    const regularListeners = this.listeners.get(event);
    if (regularListeners) {
      regularListeners.delete(callback as TypedEventCallback<any>);
      if (regularListeners.size === 0) {
        this.listeners.delete(event);
      }
    }

    const onceOnlyListeners = this.onceListeners.get(event);
    if (onceOnlyListeners) {
      onceOnlyListeners.delete(callback as TypedEventCallback<any>);
      if (onceOnlyListeners.size === 0) {
        this.onceListeners.delete(event);
      }
    }
  }

  removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  getListenerCount(event: keyof EventMap): number {
    const regular = this.listeners.get(event)?.size || 0;
    const once = this.onceListeners.get(event)?.size || 0;
    return regular + once;
  }
  
  setMaxListeners(count: number): void {
    if (count > 0) {
      this.maxListeners = count;
    } else {
      console.warn('[EventBus] Max listeners must be a positive number.');
    }
  }

  onAny(callback: WildcardEventCallback): UnsubscribeFunction {
    this.wildcardListeners.add(callback);
    return () => {
      this.wildcardListeners.delete(callback);
    };
  }

  getEventHistory(): Array<{ event: string; data: any; timestamp: number }> {
    return [...this.eventHistory]; // Return a copy
  }

  getEventNames(): Array<keyof EventMap> {
    const eventNames = new Set<keyof EventMap>();
    this.listeners.forEach((_, eventName) => eventNames.add(eventName));
    this.onceListeners.forEach((_, eventName) => eventNames.add(eventName));
    return Array.from(eventNames);
  }

  enable(): void {
    this.isEnabled = true;
    console.log('[EventBus] Enabled.');
  }

  disable(): void {
    this.isEnabled = false;
    console.log('[EventBus] Disabled.');
  }

  debugInfo(): object {
    const activeListeners: Record<string, number> = {};
    this.listeners.forEach((callbacks, event) => {
      activeListeners[String(event)] = callbacks.size;
    });

    const onceListenersInfo: Record<string, number> = {};
    this.onceListeners.forEach((callbacks, event) => {
      onceListenersInfo[String(event)] = callbacks.size;
    });

    return {
      isEnabled: this.isEnabled,
      maxListeners: this.maxListeners,
      activeListeners,
      onceListeners: onceListenersInfo,
      wildcardListenerCount: this.wildcardListeners.size,
      eventHistorySize: this.eventHistory.length,
      maxHistorySize: this.maxHistorySize,
      totalListenerRegistrations: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0) +
                                Array.from(this.onceListeners.values()).reduce((sum, set) => sum + set.size, 0) +
                                this.wildcardListeners.size
    };
  }
}

export const eventBus = new TypedEventBus();

// Development tools integration as per Session 2.md
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    (window as any).__eventBus = eventBus;
    (window as any).__eventBusDebug = () => eventBus.debugInfo();
  }
}

// Optional: Global initialization function (can be called from app initializer)
export async function initializeEventBus(): Promise<void> {
  console.info('[MCPSuperAssistant] Event bus initialized.');
  // Example: eventBus.setMaxListeners(100);
  // Add any other global setup for the event bus here if needed.
}
