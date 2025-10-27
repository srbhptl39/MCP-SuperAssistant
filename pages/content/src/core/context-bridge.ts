/**
 * Context Bridge for Chrome Extension Communication
 * 
 * Handles communication between different contexts in the Chrome extension:
 * - Content script ↔ Background script
 * - Content script ↔ Popup
 * - Content script ↔ Options page
 * 
 * Provides type-safe message passing with retry logic, error handling,
 * and automatic message validation.
 */

import { eventBus } from '../events/event-bus';
import type { EventMap } from '../events/event-types';
import type { 
  BaseMessage, 
  RequestMessage, 
  ResponseMessage,
  McpMessageType
} from '../types/messages';
import { createLogger } from '@extension/shared/lib/logger';

// Legacy compatibility interface

const logger = createLogger('ContextBridge');

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
  private isExtensionContextValid = true;
  private lastHealthCheck = 0;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor(config: ContextBridgeConfig = {}) {
    this.config = {
      enableLogging: process.env.NODE_ENV === 'development',
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * Initialize the context bridge with enhanced error handling
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn('[ContextBridge] Already initialized');
      return;
    }

    try {
      // Validate Chrome extension context
      if (!this.validateExtensionContext()) {
        throw new Error('Chrome extension context is not available');
      }

      // Set up Chrome runtime message listener
      chrome.runtime.onMessage.addListener(this.handleChromeMessage.bind(this));

      // Listen for tab updates and connection changes (only in background context)
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
      }

      // Set up event bus integration
      this.setupEventBusIntegration();

      // Start periodic health checks
      this.startHealthCheck();

      this.initialized = true;
      logger.debug('[ContextBridge] Initialized successfully');

      // Emit initialization event
      eventBus.emit('context:bridge-initialized', { timestamp: Date.now() });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ContextBridge] Initialization failed:', errorMessage);
      this.isExtensionContextValid = false;
      throw error;
    }
  }

  /**
   * Validate that we're in a proper Chrome extension context
   */
  private validateExtensionContext(): boolean {
    try {
      // Check if chrome APIs are available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        logger.error('[ContextBridge] Chrome runtime API not available');
        this.isExtensionContextValid = false;
        return false;
      }

      // Check if we can access extension ID
      if (!chrome.runtime.id) {
        logger.error('[ContextBridge] Chrome extension ID not available');
        this.isExtensionContextValid = false;
        return false;
      }

      // Test basic message sending capability
      if (typeof chrome.runtime.sendMessage !== 'function') {
        logger.error('[ContextBridge] Chrome runtime.sendMessage not available');
        this.isExtensionContextValid = false;
        return false;
      }

      // Try to access manifest to ensure context is not invalidated
      chrome.runtime.getManifest();

      this.isExtensionContextValid = true;
      return true;
    } catch (error) {
      logger.error('[ContextBridge] Extension context validation failed:', error);
      this.isExtensionContextValid = false;

      // Emit event to notify other components
      eventBus.emit('context:bridge-invalidated', {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Start periodic health checks to monitor extension context
   */
  private startHealthCheck(): void {
    const performHealthCheck = () => {
      const now = Date.now();

      // Only perform health check if enough time has passed
      if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
        return;
      }

      this.lastHealthCheck = now;

      try {
        // Simple health check - try to access chrome.runtime.id
        if (!chrome.runtime || !chrome.runtime.id) {
          throw new Error('Extension context invalidated');
        }

        // If we were previously invalid, mark as valid again
        if (!this.isExtensionContextValid) {
          this.isExtensionContextValid = true;
          logger.debug('[ContextBridge] Extension context restored');
          eventBus.emit('context:bridge-restored', { timestamp: now });
        }
      } catch (error) {
        if (this.isExtensionContextValid) {
          this.isExtensionContextValid = false;
          logger.error('[ContextBridge] Extension context invalidated:', error);
          eventBus.emit('context:bridge-invalidated', {
            timestamp: now,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    };

    // Perform initial health check
    performHealthCheck();

    // Set up periodic health checks
    setInterval(performHealthCheck, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Handle Chrome runtime messages with enhanced error handling and validation
   */
  private handleChromeMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    try {
      if (this.config.enableLogging) {
        logger.debug('[ContextBridge] Received Chrome message:', message, 'from:', sender);
      }

      // Validate message structure
      if (!message || typeof message !== 'object') {
        logger.warn('[ContextBridge] Invalid message received:', message);
        sendResponse({ error: 'Invalid message format' });
        return false;
      }

      // Create properly structured ContextMessage
      const contextMessage: ContextMessage = {
        type: message.type || message.command || 'unknown',
        payload: message.payload,
        origin: message.origin || this.inferOrigin(sender),
        timestamp: message.timestamp || Date.now(),
        id: message.id,
      };

      // Handle response-based messages (for request-response pattern)
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (this.config.enableLogging) {
          logger.debug(`Resolving pending request ${message.id}`);
        }

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          // Return the payload if it exists, otherwise the whole message
          pending.resolve(message.payload !== undefined ? message.payload : message);
        }
        return false; // Don't keep the message channel open
      }

      // Log the processed message for debugging
      if (this.config.enableLogging) {
        logger.debug('[ContextBridge] Processed ContextMessage:', contextMessage);
      }

      // Emit to local event bus
      eventBus.emit('context:message-received', {
        message: contextMessage,
        sender,
      });

      // Forward to registered listeners
      const listeners = this.messageListeners.get(contextMessage.type);
      if (listeners && listeners.length > 0) {
        listeners.forEach(listener => {
          try {
            listener(contextMessage);
          } catch (error) {
            logger.error('[ContextBridge] Error in message listener:', error);
          }
        });
      }

      // Send acknowledgment for fire-and-forget messages
      if (!message.expectResponse) {
        sendResponse({ received: true, timestamp: Date.now() });
        return false;
      }

      return true; // Keep channel open for async response
    } catch (error) {
      logger.error('[ContextBridge] Error handling Chrome message:', error);
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
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
   * Send a message to a specific context with enhanced error handling and retry logic
   */
  async sendMessage(
    target: 'background' | 'popup' | 'options' | 'content',
    type: string,
    payload?: any,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<any> {
    // Check if extension context is valid
    if (!this.isExtensionContextValid) {
      throw new Error('Extension context is invalid - cannot send message');
    }

    if (!this.initialized) {
      throw new Error('ContextBridge not initialized');
    }

    const maxRetries = options.retries ?? this.config.maxRetries ?? 3;
    const timeout = options.timeout || 5000;

    let lastError: Error | null = null;

    // Retry logic
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.attemptSendMessage(target, type, payload, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay! * Math.pow(2, attempt); // Exponential backoff
          if (this.config.enableLogging) {
            logger.debug(`Retry ${attempt + 1}/${maxRetries} for ${type} in ${delay}ms`);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(`Failed to send message after ${maxRetries} retries: ${lastError?.message}`);
  }

  /**
   * Attempt to send a single message with enhanced error handling
   */
  private async attemptSendMessage(
    target: 'background' | 'popup' | 'options' | 'content',
    type: string,
    payload?: any,
    timeout: number = 5000
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
      logger.debug('[ContextBridge] Sending message:', message, 'to:', target);
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Message timeout after ${timeout}ms for ${type} to ${target}`));
      }, timeout);

      this.pendingRequests.set(messageId, { resolve, reject, timeout: timeoutHandle });

      try {
        // Validate chrome runtime is still available
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          throw new Error('Chrome runtime not available');
        }

        // For background messages, send directly
        if (target === 'background') {
          chrome.runtime.sendMessage({ ...message, expectResponse: true }, (response) => {
            // Clear timeout since we got a response (even if it's an error)
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(messageId);

            // Handle chrome.runtime.lastError
            if (chrome.runtime.lastError) {
              const errorMsg = `Chrome runtime error: ${chrome.runtime.lastError.message}`;
              if (this.config.enableLogging) {
                logger.error(errorMsg);
              }
              reject(new Error(errorMsg));
              return;
            }

            // Handle successful response
            if (response) {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response.payload !== undefined ? response.payload : response);
              }
            } else {
              // No response but no error either - this might be normal for some message types
              resolve(null);
            }
          });
        } else {
          // For other contexts, we might need tab-specific messaging
          // This is a simplified approach - in practice you might need more sophisticated routing
          chrome.runtime.sendMessage({ ...message, target, expectResponse: true }, (response) => {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(messageId);

            if (chrome.runtime.lastError) {
              const errorMsg = `Chrome runtime error: ${chrome.runtime.lastError.message}`;
              if (this.config.enableLogging) {
                logger.error(errorMsg);
              }
              reject(new Error(errorMsg));
              return;
            }

            if (response) {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response.payload !== undefined ? response.payload : response);
              }
            } else {
              resolve(null);
            }
          });
        }
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(messageId);

        // Check if this is an extension context invalidation
        if (error instanceof Error && error.message.includes('Extension context invalidated')) {
          this.isExtensionContextValid = false;
          eventBus.emit('context:bridge-invalidated', {
            timestamp: Date.now(),
            error: error.message
          });
        }

        if (this.config.enableLogging) {
          logger.error('[ContextBridge] Error sending message:', error);
        }

        reject(error);
      }
    });
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('extension context invalidated') ||
      message.includes('chrome runtime not available') ||
      message.includes('invalid arguments') ||
      message.includes('permission denied')
    );
  }

  /**
   * Broadcast a message to all contexts
   */
  broadcast(type: string, payload?: any, excludeOrigin?: ContextMessage['origin']): void {
    // Check if extension context is valid before attempting to broadcast
    if (!this.isExtensionContextValid) {
      if (this.config.enableLogging) {
        logger.warn('[ContextBridge] Cannot broadcast - extension context is invalid');
      }
      return;
    }

    const message: ContextMessage = {
      type,
      payload,
      origin: 'content',
      timestamp: Date.now(),
    };

    if (this.config.enableLogging) {
      logger.debug('[ContextBridge] Broadcasting message:', message);
    }

    try {
      // Validate context before sending
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        throw new Error('Chrome runtime not available');
      }

      chrome.runtime.sendMessage({
        ...message,
        broadcast: true,
        excludeOrigin,
      });
    } catch (error) {
      logger.error('[ContextBridge] Error broadcasting message:', error);

      // Check if this is an extension context invalidation
      if (error instanceof Error &&
          (error.message.includes('Extension context invalidated') ||
           error.message.includes('Chrome runtime not available'))) {
        this.isExtensionContextValid = false;
        eventBus.emit('context:bridge-invalidated', {
          timestamp: Date.now(),
          error: error.message
        });
      }
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
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Context bridge cleanup'));
    }
    this.pendingRequests.clear();

    // Clear listeners
    this.messageListeners.clear();

    this.initialized = false;
    logger.debug('[ContextBridge] Cleaned up');
  }
}

// Create and export singleton instance
export const contextBridge = new ContextBridge();

// Export class for custom instances
export { ContextBridge };