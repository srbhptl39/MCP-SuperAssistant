// Thin wrapper around chrome.runtime.sendMessage matching the background's
// handleMcpMessage envelope. Requests: { type, payload, origin, timestamp, id }.
// Responses come back through sendResponse as { type, payload, success, error }.

export type ConnectionType = 'sse' | 'websocket' | 'streamable-http';

export interface ServerConfig {
  uri: string;
  connectionType: ConnectionType;
}

interface McpResponse<T> {
  type: string;
  payload?: T;
  success: boolean;
  error?: string;
}

let counter = 0;
const nextId = () => `options-${Date.now()}-${counter++}`;

const rawSend = <T>(type: string, payload: Record<string, unknown>): Promise<McpResponse<T>> =>
  chrome.runtime.sendMessage({ type, payload, origin: 'options', timestamp: Date.now(), id: nextId() });

// The background may be asleep when the page opens; the first message can be
// dropped while the worker spins up, so retry once.
const send = async <T>(type: string, payload: Record<string, unknown> = {}): Promise<T> => {
  let res: McpResponse<T> | undefined;
  try {
    res = await rawSend<T>(type, payload);
  } catch {
    res = undefined;
  }
  if (!res) {
    res = await rawSend<T>(type, payload);
  }
  if (!res?.success) {
    throw new Error(res?.error || 'No response from background');
  }
  return res.payload as T;
};

export const getServerConfig = () => send<ServerConfig>('mcp:get-server-config');

export const updateServerConfig = (config: ServerConfig) =>
  send<{ success: boolean }>('mcp:update-server-config', { config });

export const getConnectionStatus = () =>
  send<{ status: string; isConnected: boolean; timestamp: number }>('mcp:get-connection-status');
