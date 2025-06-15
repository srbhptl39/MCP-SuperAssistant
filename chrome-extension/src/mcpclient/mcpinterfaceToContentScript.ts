/**
 * LEGACY MCP Interface - DEPRECATED
 * 
 * This file contains legacy code that is being phased out in favor of the new 
 * ContextBridge-based communication system. It is kept for backward compatibility
 * and will be removed in a future version.
 * 
 * The new communication flow is:
 * Content Script -> ContextBridge -> Background Script -> MCP Server
 * 
 * Most functionality in this file has been disabled and replaced by the
 * background script's direct message handling.
 */

// Import required functions from the official MCP client
import {
  checkMcpServerConnection,
  getPrimitivesWithSSE,
  callToolWithSSE,
  forceReconnectToMcpServer
} from './officialmcpclient';

// Define the Primitive type locally since it's not exported from officialmcpclient
type PrimitiveType = 'resource' | 'tool' | 'prompt';
type PrimitiveValue = {
  name: string;
  description?: string;
  uri?: string;
  inputSchema?: any;
  arguments?: any[];
};

type Primitive = {
  type: PrimitiveType;
  value: PrimitiveValue;
};

/**
 * Simplified legacy interface for backward compatibility
 */
class LegacyMcpInterface {
  private static instance: LegacyMcpInterface | null = null;
  private serverUrl: string = 'http://localhost:3006/sse';
  private isConnected: boolean = false;
  private isInitialized: boolean = false;
  private connectionCount: number = 0;
  private toolDetailsCache: {
    primitives: Primitive[];
    lastFetch: number;
  } = {
    primitives: [],
    lastFetch: 0
  };

  private constructor() {
    this.initializeServerUrl().then(() => {
      this.isInitialized = true;
      console.log('[Legacy MCP Interface] Initialized with server URL:', this.serverUrl);
    });
  }

  /**
   * Initialize server URL from storage
   */
  private async initializeServerUrl(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('mcpServerUrl');
      this.serverUrl = result.mcpServerUrl || this.serverUrl;
      console.log('[Legacy MCP Interface] Server URL loaded from storage:', this.serverUrl);
    } catch (error) {
      console.warn('[Legacy MCP Interface] Failed to load server URL from storage, using default:', error);
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LegacyMcpInterface {
    if (!LegacyMcpInterface.instance) {
      LegacyMcpInterface.instance = new LegacyMcpInterface();
    }
    return LegacyMcpInterface.instance;
  }

  /**
   * Wait for initialization to complete
   */
  public async waitForInitialization(): Promise<void> {
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get the current server URL
   */
  public getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Update the server URL
   */
  public updateServerUrl(url: string): void {
    this.serverUrl = url;
    console.log('[Legacy MCP Interface] Server URL updated to:', url);
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Update connection status
   */
  public updateConnectionStatus(status: boolean): void {
    this.isConnected = status;
    console.log('[Legacy MCP Interface] Connection status updated to:', status);
  }

  /**
   * Get connection count
   */
  public getConnectionCount(): number {
    return this.connectionCount;
  }

  /**
   * Increment connection count
   */
  public incrementConnectionCount(): void {
    this.connectionCount++;
  }

  /**
   * Decrement connection count
   */
  public decrementConnectionCount(): void {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
  }

  /**
   * Check if the server is connected
   */
  private async checkServerConnection(): Promise<boolean> {
    try {
      return await checkMcpServerConnection();
    } catch (error) {
      console.error('[Legacy MCP Interface] Error checking server connection:', error);
      return false;
    }
  }

  /**
   * Enhanced tool verification that checks if a tool exists
   */
  private async enhancedToolVerification(
    toolName: string,
  ): Promise<{ exists: boolean; reason?: string; cached: boolean }> {
    try {
      const now = Date.now();
      const VERIFICATION_CACHE_TTL = 60000; // 1 minute cache

      // Check if we have recent primitives cache
      const hasFreshCache =
        this.toolDetailsCache.primitives.length > 0 && 
        now - this.toolDetailsCache.lastFetch < VERIFICATION_CACHE_TTL;

      if (hasFreshCache) {
        const toolExists = this.toolDetailsCache.primitives.some(
          (primitive: Primitive) => primitive.type === 'tool' && primitive.value.name === toolName
        );
        return { exists: toolExists, cached: true };
      }

      // Refresh cache
      console.log('[Legacy MCP Interface] Refreshing tool cache for verification');
      const primitives = await getPrimitivesWithSSE(this.serverUrl);
      
      // Filter and store primitives
      const filteredPrimitives = primitives
        .filter((primitive: any) => primitive.type === 'tool')
        .map((p: any) => p);

      this.toolDetailsCache = {
        primitives: filteredPrimitives,
        lastFetch: now
      };

      const toolExists = filteredPrimitives.some(
        (p: any) => p.value.name === toolName
      );

      return { exists: toolExists, cached: false };
    } catch (error) {
      console.error('[Legacy MCP Interface] Error in enhanced tool verification:', error);
      return { exists: false, reason: error instanceof Error ? error.message : String(error), cached: false };
    }
  }

  /**
   * Call a tool with the given arguments
   */
  public async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    try {
      console.log(`[Legacy MCP Interface] Calling tool: ${toolName}`);
      return await callToolWithSSE(this.serverUrl, toolName, args);
    } catch (error) {
      console.error(`[Legacy MCP Interface] Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Force reconnect to the MCP server
   */
  public async forceReconnect(): Promise<void> {
    try {
      console.log('[Legacy MCP Interface] Force reconnecting to server...');
      await forceReconnectToMcpServer(this.serverUrl);
      this.isConnected = await this.checkServerConnection();
      console.log('[Legacy MCP Interface] Reconnection completed, status:', this.isConnected);
    } catch (error) {
      console.error('[Legacy MCP Interface] Error during force reconnect:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Get primitives (tools, resources, prompts)
   */
  public async getPrimitives(forceRefresh: boolean = false): Promise<Primitive[]> {
    try {
      const now = Date.now();
      const CACHE_TTL = 30000; // 30 seconds

      // Use cache if available and not forcing refresh
      if (!forceRefresh && 
          this.toolDetailsCache.primitives.length > 0 && 
          now - this.toolDetailsCache.lastFetch < CACHE_TTL) {
        console.log('[Legacy MCP Interface] Using cached primitives');
        return this.toolDetailsCache.primitives;
      }

      console.log('[Legacy MCP Interface] Fetching fresh primitives');
      const primitives = await getPrimitivesWithSSE(this.serverUrl);
      
      this.toolDetailsCache = {
        primitives,
        lastFetch: now
      };

      return primitives;
    } catch (error) {
      console.error('[Legacy MCP Interface] Error getting primitives:', error);
      return [];
    }
  }

  /**
   * Dispose resources (compatibility method)
   */
  public dispose(): void {
    console.log('[Legacy MCP Interface] Disposed');
    this.toolDetailsCache = { primitives: [], lastFetch: 0 };
    this.connectionCount = 0;
  }
}

// Export the singleton instance for backward compatibility
export const mcpInterface = LegacyMcpInterface.getInstance();