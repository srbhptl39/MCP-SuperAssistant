import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('WebSocketTransport');

export interface WebSocketTransportOptions {
  protocols?: string[];
  pingInterval?: number;
  pongTimeout?: number;
  binaryType?: 'blob' | 'arraybuffer';
  maxReconnectAttempts?: number;
}

export class WebSocketTransport implements Transport {
  // Transport interface callbacks - required by MCP client
  onmessage?: (message: any) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {
    // Required by Transport interface - delegate to connect method
    logger.debug('[WebSocketTransport] Start method called - initiating connection');
    await this.connect();
  }
  private ws: WebSocket | null = null;
  private url: string;
  private options: WebSocketTransportOptions;
  private messageQueue: any[] = [];
  private isConnected: boolean = false;
  // Removed ping/pong timers - using MCP protocol connection management
  private eventListeners = new Map<string, Set<Function>>();

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url;
    this.options = {
      protocols: ['mcp-v1'],
      pingInterval: 30000,
      pongTimeout: 5000,
      binaryType: 'arraybuffer',
      maxReconnectAttempts: 3,
      ...options,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
      logger.debug('[WebSocketTransport] Already connected or connecting');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.debug(`Connecting to: ${this.url}`);

        this.ws = new WebSocket(this.url, this.options.protocols);
        this.ws.binaryType = this.options.binaryType || 'arraybuffer';

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          logger.debug('[WebSocketTransport] Connected');
          this.isConnected = true;
          this.startPingPong();
          this.processMessageQueue();
          resolve();
        };

        this.ws.onclose = event => {
          clearTimeout(connectionTimeout);
          logger.debug(`Disconnected: ${event.code} ${event.reason}`);
          this.isConnected = false;
          this.stopPingPong();
          this.emit('close', { code: event.code, reason: event.reason });
          // Call Transport interface callback
          if (this.onclose) {
            this.onclose();
          }
        };

        this.ws.onerror = error => {
          clearTimeout(connectionTimeout);
          logger.error('[WebSocketTransport] Error:', error);
          this.isConnected = false;
          this.emit('error', error);
          // Call Transport interface callback
          if (this.onerror) {
            this.onerror(new Error('WebSocket connection failed'));
          }
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onmessage = event => {
          try {
            let data;
            if (typeof event.data === 'string') {
              data = JSON.parse(event.data);
            } else if (event.data instanceof ArrayBuffer) {
              // Handle binary data if needed
              const text = new TextDecoder().decode(event.data);
              data = JSON.parse(text);
            } else {
              logger.warn('[WebSocketTransport] Received unknown data type:', typeof event.data);
              return;
            }

            // Don't handle custom ping/pong - let MCP protocol handle it
            // The server logs show it's forwarding our ping messages to the child process
            // which suggests the server expects standard MCP messages only

            this.emit('message', data);

            // Call Transport interface callback - this is critical for MCP client
            if (this.onmessage) {
              this.onmessage(data);
            }
          } catch (error) {
            logger.error('[WebSocketTransport] Failed to parse message:', error);
            const parseError = new Error('Failed to parse WebSocket message');
            this.emit('error', parseError);
            // Call Transport interface callback for errors
            if (this.onerror) {
              this.onerror(parseError);
            }
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    logger.debug('[WebSocketTransport] Closing connection');
    this.isConnected = false;
    this.stopPingPong();

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
  }

  async send(data: any): Promise<void> {
    const message = JSON.stringify(data);

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.debug('[WebSocketTransport] Queuing message (not connected)');
      this.messageQueue.push(data);
      return;
    }

    try {
      this.ws.send(message);
    } catch (error) {
      logger.error('[WebSocketTransport] Failed to send message:', error);
      this.messageQueue.push(data);
      throw error;
    }
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    logger.debug(`Processing ${this.messageQueue.length} queued messages`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(message => {
      try {
        this.send(message);
      } catch (error) {
        logger.error('[WebSocketTransport] Failed to send queued message:', error);
        // Re-queue the message
        this.messageQueue.push(message);
      }
    });
  }

  private startPingPong(): void {
    // Disable custom ping/pong - MCP protocol and the server handle connection monitoring
    // The server logs show it's sending its own ping messages to the child process
    logger.debug('[WebSocketTransport] Skipping custom ping/pong - relying on MCP protocol and server-side monitoring');
    return;
  }

  private stopPingPong(): void {
    // No-op since we're not using custom ping/pong
  }

  // Removed custom ping/pong methods - using MCP protocol instead

  // Event emitter functionality
  on(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          logger.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}
