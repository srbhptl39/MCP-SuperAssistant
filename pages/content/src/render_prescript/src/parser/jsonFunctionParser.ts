import type { FunctionInfo } from '../core/types';

/**
 * JSON function call line types
 */
interface JSONFunctionLine {
  type: 'function_call_start' | 'description' | 'parameter' | 'function_call_end';
  name?: string;
  call_id?: number | string;
  text?: string;
  key?: string;
  value?: any;
}

/**
 * State for tracking JSON function call parsing
 */
interface JSONFunctionState {
  hasFunctionStart: boolean;
  hasFunctionEnd: boolean;
  functionName: string | null;
  callId: string | null;
  description: string | null;
  parameterCount: number;
  lines: JSONFunctionLine[];
}

/**
 * Parse a single line of JSON function call
 */
const parseJSONLine = (line: string): JSONFunctionLine | null => {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const parsed = JSON.parse(trimmed);

    // Validate it's a function call line
    if (!parsed.type || typeof parsed.type !== 'string') {
      return null;
    }

    return parsed as JSONFunctionLine;
  } catch (e) {
    return null;
  }
};

/**
 * Check if content contains JSON-style function calls
 * Returns detailed information about the JSON function call state
 */
export const containsJSONFunctionCalls = (block: HTMLElement): FunctionInfo => {
  const content = block.textContent?.trim() || '';
  const result: FunctionInfo = {
    hasFunctionCalls: false,
    isComplete: false,
    hasInvoke: false,
    hasParameters: false,
    hasClosingTags: false,
    languageTag: null,
    detectedBlockType: null,
    partialTagDetected: false,
  };

  // Quick check: must contain JSON-like patterns
  if (!content.includes('"type"') || !content.includes('function_call')) {
    return result;
  }

  const state: JSONFunctionState = {
    hasFunctionStart: false,
    hasFunctionEnd: false,
    functionName: null,
    callId: null,
    description: null,
    parameterCount: 0,
    lines: [],
  };

  // Parse line by line
  const lines = content.split('\n');

  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) continue;

    state.lines.push(parsed);

    switch (parsed.type) {
      case 'function_call_start':
        state.hasFunctionStart = true;
        state.functionName = parsed.name || null;
        state.callId = parsed.call_id?.toString() || null;
        break;

      case 'description':
        state.description = parsed.text || null;
        break;

      case 'parameter':
        state.parameterCount++;
        break;

      case 'function_call_end':
        state.hasFunctionEnd = true;
        break;
    }
  }

  // Determine if this is a JSON function call
  if (state.hasFunctionStart) {
    result.hasFunctionCalls = true;
    result.detectedBlockType = 'json';
    result.hasInvoke = true;
    result.hasParameters = state.parameterCount > 0;
    result.hasClosingTags = state.hasFunctionEnd;
    result.isComplete = state.hasFunctionStart && state.hasFunctionEnd;
    result.invokeName = state.functionName || undefined;
    result.textContent = state.description || undefined;
  }

  return result;
};

/**
 * Extract function name and call_id from JSON function calls
 */
export const extractJSONFunctionInfo = (content: string): {
  functionName: string | null;
  callId: string | null;
  description: string | null;
} => {
  const lines = content.split('\n');
  let functionName: string | null = null;
  let callId: string | null = null;
  let description: string | null = null;

  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) continue;

    if (parsed.type === 'function_call_start') {
      functionName = parsed.name || null;
      callId = parsed.call_id?.toString() || null;
    } else if (parsed.type === 'description') {
      description = parsed.text || null;
    }

    // Early exit once we have all info
    if (functionName && callId && description) {
      break;
    }
  }

  return { functionName, callId, description };
};

/**
 * Extract parameters from JSON function calls
 */
export const extractJSONParameters = (content: string): Record<string, any> => {
  const parameters: Record<string, any> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) continue;

    if (parsed.type === 'parameter' && parsed.key) {
      parameters[parsed.key] = parsed.value;
    }
  }

  return parameters;
};

/**
 * Check if JSON function call is streaming (incomplete)
 */
export const isJSONFunctionStreaming = (content: string): boolean => {
  const lines = content.split('\n');
  let hasStart = false;
  let hasEnd = false;

  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) continue;

    if (parsed.type === 'function_call_start') {
      hasStart = true;
    } else if (parsed.type === 'function_call_end') {
      hasEnd = true;
    }
  }

  return hasStart && !hasEnd;
};
