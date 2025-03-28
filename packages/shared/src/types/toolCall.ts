/**
 * Shared types for tool call functionality
 */

export interface ToolCall {
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  rawContent: string;
}

export interface ToolCallMessage {
  action: 'RENDER_TOOL_CALLS';
  data: {
    toolCalls: ToolCall[];
    nodeInfo: {
      path: string;
      textContent: string | null;
    };
  };
}
