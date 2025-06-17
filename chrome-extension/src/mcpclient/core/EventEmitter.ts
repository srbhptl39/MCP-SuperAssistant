export type EventListener<T = any> = (data: T) => void | Promise<void>;

export class EventEmitter<TEvents = Record<string, any>> {
  private listeners = new Map<keyof TEvents, Set<EventListener>>();
  private maxListeners = 100;

  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    
    if (eventListeners.size >= this.maxListeners) {
      console.warn(`EventEmitter: Maximum listeners (${this.maxListeners}) exceeded for event '${String(event)}'`);
    }

    eventListeners.add(listener);
    return this;
  }

  off<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  once<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): this {
    const onceWrapper: EventListener<TEvents[K]> = (data) => {
      this.off(event, onceWrapper);
      return listener(data);
    };
    return this.on(event, onceWrapper);
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return false;
    }

    // Execute all listeners asynchronously
    eventListeners.forEach(async (listener) => {
      try {
        await listener(data);
      } catch (error) {
        console.error(`EventEmitter: Error in listener for event '${String(event)}':`, error);
      }
    });

    return true;
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  eventNames(): (keyof TEvents)[] {
    return Array.from(this.listeners.keys());
  }

  setMaxListeners(n: number): this {
    this.maxListeners = Math.max(0, n);
    return this;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }
}