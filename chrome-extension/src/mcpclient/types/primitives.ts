export type PrimitiveType = 'resource' | 'tool' | 'prompt';

export interface PrimitiveValue {
  name: string;
  description?: string;
  uri?: string;
  inputSchema?: any;
  input_schema?: any;  // snake_case variant for compatibility
  arguments?: any[];
  schema?: string;     // JSON string representation for legacy compatibility
}

export interface Primitive {
  type: PrimitiveType;
  value: PrimitiveValue;
}

export interface NormalizedTool {
  name: string;
  description: string;
  input_schema: any;
  schema: string;
  uri?: string;
  arguments?: any[];
}

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResult {
  content: any[];
  isError?: boolean;
}

export interface PrimitivesResponse {
  tools: NormalizedTool[];
  resources: any[];
  prompts: any[];
  timestamp: number;
}