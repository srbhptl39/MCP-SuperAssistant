/**
 * Context Bridge for Chrome Extension Communication
 * 
 * Handles communication between different contexts in the Chrome extension:
 * - Content script ↔ Background script
 * - Content script ↔ Popup
 * - Content script ↔ Options page
 */

import { eventBus } from '../events/event-bus';
import type { EventMap } from '../events/event-types';

export interface ContextMessage {
  type: string;
  payload?: any;
  origin: 'content' | 'background' | 'popup' | 'options';
  timestamp: number;
  id?: string;
}

export interface ContextBridgeConfig {
  enableLogging?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

class ContextBridge {
  private initialized = false;
  private messageListeners = new Map<string, Array<(message: ContextMessage) => void>>();
  private pendingRequests = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();
  private config: ContextBridgeConfig;

  constructor(config: ContextBridgeConfig = {}) {
    this.config = {
      enableLogging: process.env.NODE_ENV === 'development',
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * Initialize the context bridge
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('[ContextBridge] Already initialized');
      return;
    }

    // Set up Chrome runtime message listener
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.handleChromeMessage.bind(this));
      
      // Listen for tab updates and connection changes
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
      }
    }

    // Set up event bus integration
    this.setupEventBusIntegration();

    this.initialized = true;
    console.log('[ContextBridge] Initialized successfully');
  }

  /**
   * Handle Chrome runtime messages
   */
  private handleChromeMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    if (this.config.enableLogging) {
      console.log('[ContextBridge] Received Chrome message:', message, 'from:', sender);
    }

    const contextMessage: ContextMessage = {
      type: message.type || message.command || 'unknown',
      payload: message,
      origin: this.inferOrigin(sender),
      timestamp: Date.now(),
      id: message.id,
    };

    // Handle response-based messages
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message);
      }
      return false; // Don't keep the message channel open
    }

    // Emit to local event bus
    eventBus.emit('context:message-received', {
      message: contextMessage,
      sender,
    });

    // Forward to registered listeners
    const listeners = this.messageListeners.get(contextMessage.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(contextMessage);
        } catch (error) {
          console.error('[ContextBridge] Error in message listener:', error);
        }
      });
    }

    // Send acknowledgment for fire-and-forget messages
    if (!message.expectResponse) {
      sendResponse({ received: true, timestamp: Date.now() });
      return false;
    }

    return true; // Keep channel open for async response
  }

  /**
   * Handle tab updates
   */
  private handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
    if (changeInfo.status === 'complete' && tab.url) {
      eventBus.emit('context:tab-updated', {
        tabId,
        url: tab.url,
        changeInfo,
      });
    }
  }

  /**
   * Infer origin from sender information
   */
  private inferOrigin(sender: chrome.runtime.MessageSender): ContextMessage['origin'] {
    if (sender.tab) return 'content';
    if (sender.url?.includes('popup.html')) return 'popup';
    if (sender.url?.includes('options.html')) return 'options';
    return 'background';
  }

  /**
   * Set up integration with event bus
   */
  private setupEventBusIntegration(): void {
    // Listen for events that should be forwarded to other contexts
    eventBus.on('context:broadcast', ({ event, data, excludeOrigin }) => {
      this.broadcast(event, data, excludeOrigin as ContextMessage['origin']);
    });

    eventBus.on('connection:status-changed', (data) => {
      this.broadcast('connection:status-changed', data);
    });

    eventBus.on('adapter:activated', (data) => {
      this.broadcast('adapter:activated', data);
    });

    eventBus.on('tool:execution-completed', (data) => {
      this.broadcast('tool:execution-completed', data);
    });
  }

  /**
   * Send a message to a specific context
   */
  async sendMessage(
    target: 'background' | 'popup' | 'options' | 'content',
    type: string,
    payload?: any,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<any> {
    const messageId = this.generateMessageId();
    const message: ContextMessage = {
      type,
      payload,
      origin: 'content', // Assuming we're in content script context
      timestamp: Date.now(),
      id: messageId,
    };

    if (this.config.enableLogging) {
      console.log('[ContextBridge] Sending message:', message, 'to:', target);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Message timeout: ${type}`));
      }, options.timeout || 5000);

      this.pendingRequests.set(messageId, { resolve, reject, timeout });

      try {
        if (target === 'background') {
          chrome.runtime.sendMessage({ ...message, expectResponse: true });
        } else {
          // For other contexts, we might need tab-specific messaging
          // This is a simplified implementation
          chrome.runtime.sendMessage({ ...message, target, expectResponse: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * Broadcast a message to all contexts
   */
  broadcast(type: string, payload?: any, excludeOrigin?: ContextMessage['origin']): void {
    const message: ContextMessage = {
      type,
      payload,
      origin: 'content',
      timestamp: Date.now(),
    };

    if (this.config.enableLogging) {
      console.log('[ContextBridge] Broadcasting message:', message);
    }

    try {
      chrome.runtime.sendMessage({
        ...message,
        broadcast: true,
        excludeOrigin,
      });
    } catch (error) {
      console.error('[ContextBridge] Error broadcasting message:', error);
    }
  }

  /**
   * Register a listener for specific message types
   */
  onMessage(type: string, listener: (message: ContextMessage) => void): () => void {
    if (!this.messageListeners.has(type)) {
      this.messageListeners.set(type, []);
    }
    this.messageListeners.get(type)!.push(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.messageListeners.get(type);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this.messageListeners.delete(type);
        }
      }
    };
  }

  /**
   * Sync store state across contexts
   */
  syncStore(storeName: string, state: any): void {
    this.broadcast('store:sync', { storeName, state });
  }

  /**
   * Request store state from other contexts
   */
  async requestStoreState(storeName: string, fromOrigin: ContextMessage['origin'] = 'background'): Promise<any> {
    return this.sendMessage(fromOrigin, 'store:request', { storeName });
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection status with other contexts
   */
  async getConnectionStatus(): Promise<{ [key: string]: boolean }> {
    const statuses: { [key: string]: boolean } = {};
    
    try {
      const backgrounds = await this.sendMessage('background', 'ping', {}, { timeout: 2000 });
      statuses.background = !!backgrounds;
    } catch {
      statuses.background = false;
    }

    return statuses;
  }

  /**
   * Cleanup context bridge
   */
  cleanup(): void {
    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Context bridge cleanup'));
    }
    this.pendingRequests.clear();

    // Clear listeners
    this.messageListeners.clear();

    this.initialized = false;
    console.log('[ContextBridge] Cleaned up');
  }
}

// Create and export singleton instance
export const contextBridge = new ContextBridge();

// Export class for custom instances
export { ContextBridge };