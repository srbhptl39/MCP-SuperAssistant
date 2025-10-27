import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { eventBus } from '../events';
import type { ConnectionStatus, ServerConfig } from '../types/stores';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('useConnectionStore');

export interface ConnectionState {
  status: ConnectionStatus;
  serverConfig: ServerConfig;
  lastConnectedAt: number | null;
  connectionAttempts: number;
  error: string | null;
  isReconnecting: boolean;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setServerConfig: (config: Partial<ServerConfig>) => void;
  setLastError: (error: string | null) => void;
  incrementAttempts: () => void;
  resetAttempts: () => void;
  setConnected: (timestamp: number) => void;
  setDisconnected: (error?: string) => void;
  startReconnecting: () => void;
  stopReconnecting: () => void;
}

const defaultServerConfig: ServerConfig = {
  uri: 'http://localhost:3006/sse', // Default from migration guide, should be configurable
  connectionType: 'sse',
  timeout: 5000, // ms
  retryAttempts: 3,
  retryDelay: 2000, // ms
};

const initialState: Omit<ConnectionState, 'setStatus' | 'setServerConfig' | 'setLastError' | 'incrementAttempts' | 'resetAttempts' | 'setConnected' | 'setDisconnected' | 'startReconnecting' | 'stopReconnecting'> = {
  status: 'disconnected',
  serverConfig: defaultServerConfig,
  lastConnectedAt: null,
  connectionAttempts: 0,
  error: null,
  isReconnecting: false,
};

export const useConnectionStore = create<ConnectionState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setStatus: (status: ConnectionStatus) => {
        const oldStatus = get().status;
        set({ status });
        logger.debug(`Status changed from ${oldStatus} to: ${status}`);
        eventBus.emit('connection:status-changed', { status, error: get().error || undefined });
      },

      setServerConfig: (config: Partial<ServerConfig>) => {
        set(state => ({ 
          serverConfig: { ...state.serverConfig, ...config }
        }));
        logger.debug('[ConnectionStore] Server config updated:', get().serverConfig);
      },

      setLastError: (error: string | null) => {
        set({ error });
        if (error) {
          logger.error('[ConnectionStore] Error set:', error);
          eventBus.emit('connection:error', { error: error });
        }
      },

      incrementAttempts: () => {
        const newAttempts = get().connectionAttempts + 1;
        set({ connectionAttempts: newAttempts });
        logger.debug(`Connection attempts: ${newAttempts}`);
        eventBus.emit('connection:attempt', { attempt: newAttempts, maxAttempts: get().serverConfig.retryAttempts });
      },

      resetAttempts: () => {
        set({ connectionAttempts: 0 });
        logger.debug('[ConnectionStore] Connection attempts reset.');
      },
      
      setConnected: (timestamp: number) => {
        set({
          status: 'connected',
          lastConnectedAt: timestamp,
          connectionAttempts: 0,
          error: null,
          isReconnecting: false,
        });
        logger.debug(`Connected at: ${new Date(timestamp).toISOString()}`);
        eventBus.emit('connection:status-changed', { status: 'connected' });
      },

      setDisconnected: (error?: string) => {
        set(state => ({
          status: error ? 'error' : 'disconnected',
          error: error || state.error, // Keep existing error if no new one provided
          isReconnecting: false, // Ensure reconnecting is false when explicitly disconnected
        }));
        logger.debug(`Disconnected. ${error ? 'Error: ' + error : ''}`);
        eventBus.emit('connection:status-changed', { status: get().status, error: error || get().error || undefined });
      },

      startReconnecting: () => {
        if (get().status === 'connected') return; // Don't try to reconnect if already connected
        set({ isReconnecting: true, status: 'reconnecting' });
        logger.debug('[ConnectionStore] Reconnecting started...');
        eventBus.emit('connection:status-changed', { status: 'reconnecting' });
      },

      stopReconnecting: () => {
        // Only stop if actually reconnecting, and revert to a sensible prior state
        if (get().isReconnecting) {
          const previousStatus = get().error ? 'error' : 'disconnected';
          set({ isReconnecting: false, status: previousStatus });
          logger.debug('[ConnectionStore] Reconnecting stopped.');
        }
      },
    }),
    { name: 'ConnectionStore', store: 'connection' } // For Redux DevTools extension
  )
);

// Example of how this store might be used by a connection manager service
// (This logic would typically live in a separate service/module)
/*
const connect = () => {
  const { serverConfig, incrementAttempts, setConnected, setLastError, setStatus } = useConnectionStore.getState();
  setStatus('connecting');
  incrementAttempts();

  fetch(serverConfig.uri)
    .then(response => {
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      return response.text(); // or .json() depending on SSE or other protocol
    })
    .then(() => {
      setConnected(Date.now());
    })
    .catch(err => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setLastError(errorMsg);
      setStatus('error');
      // Implement retry logic here if needed, or handle in a dedicated connection manager
    });
};
*/
