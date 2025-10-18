import type { FunctionInfo } from '../core/types';
import { CONFIG } from '../core/config';

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

    // Strip language tags that might appear before JSON (e.g., "json{...}", "javascript{...}")
    // This handles cases where code blocks include language identifiers
    const cleaned = trimmed.replace(/^(json|javascript|js|typescript|ts|python|py|bash|sh)\s*/i, '');
    if (!cleaned) return null;

    const parsed = JSON.parse(cleaned);

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
  // Try to get content from code child if present (for syntax-highlighted blocks)
  let content = block.textContent?.trim() || '';

  const codeChild = block.querySelector('code');
  if (codeChild && codeChild.textContent) {
    content = codeChild.textContent.trim();
  }

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

  // Always log for debugging (will add CONFIG check later)
  if (CONFIG.debug) {
    console.debug('[JSON Parser] Checking element:', block.tagName, block.className);
    console.debug('[JSON Parser] Content length:', content.length);
    console.debug('[JSON Parser] First 200 chars:', content.substring(0, 200));
  }

  // Quick check: must contain JSON-like patterns (lenient for streaming)
  const hasTypeField = content.includes('"type"') || content.includes("'type'") || content.includes('type:');

  // Accept partial matches during streaming (e.g., "function_ca" while typing "function_call")
  const hasFunctionCall = content.includes('function_call') ||
                         (content.includes('"type"') && /function_call_\w*/.test(content)) ||
                         (content.includes('"type"') && content.includes('function_ca')); // Partial match

  const hasParameter = content.includes('"parameter"') || content.includes("'parameter'") || content.includes('parameter');

  // Also check if it looks like start of JSON object with type field
  const looksLikeJSONStart = content.includes('{"type"') || content.includes('{ "type"');

  if (CONFIG.debug) {
    console.debug('[JSON Parser] Pattern check:', {
      hasTypeField,
      hasFunctionCall,
      hasParameter,
      looksLikeJSONStart,
      willProceed: hasTypeField && (hasFunctionCall || hasParameter || looksLikeJSONStart)
    });
  }

  // Accept if it looks like JSON function call structure (lenient for streaming)
  if (!(hasTypeField && (hasFunctionCall || hasParameter || looksLikeJSONStart))) {
    if (CONFIG.debug) {
      console.debug('[JSON Parser] Quick check failed - not JSON function call');
    }
    return result;
  }

  if (CONFIG.debug) {
    console.debug('[JSON Parser] Quick check passed - parsing JSON lines');
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
  let hasPartialJSON = false;

  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) {
      // Check if line looks like incomplete JSON
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
        hasPartialJSON = true;
        if (CONFIG.debug) {
          console.debug('[JSON Parser] Detected partial JSON line:', trimmed.substring(0, 50));
        }
      }
      continue;
    }

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
  // Accept if we found a function start OR if we have partial JSON that looks like a function call
  if (state.hasFunctionStart || (hasPartialJSON && looksLikeJSONStart)) {
    result.hasFunctionCalls = true;
    result.detectedBlockType = 'json';
    result.hasInvoke = state.hasFunctionStart;
    result.hasParameters = state.parameterCount > 0;
    result.hasClosingTags = state.hasFunctionEnd;
    result.isComplete = state.hasFunctionStart && state.hasFunctionEnd;
    result.invokeName = state.functionName || undefined;
    result.textContent = state.description || undefined;
    result.partialTagDetected = hasPartialJSON;
  }

  if (typeof window !== 'undefined' && (window as any).__DEBUG_JSON_PARSER) {
    console.debug('[JSON Parser] Final result:', {
      hasFunctionCalls: result.hasFunctionCalls,
      detectedBlockType: result.detectedBlockType,
      isComplete: result.isComplete,
      functionName: state.functionName,
      paramCount: state.parameterCount,
      hasEnd: state.hasFunctionEnd
    });
  }

  return result;
};

/**
 * Extract function name and call_id from JSON function calls (handles partial/streaming content)
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
    if (!parsed) {
      // Try to extract from partial JSON line
      let trimmed = line.trim();
      // Strip language tags before checking
      trimmed = trimmed.replace(/^(json|javascript|js|typescript|ts|python|py|bash|sh)\s*/i, '');

      if (trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('function_call_start')) {
        // Try to extract name from partial JSON
        const nameMatch = trimmed.match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) {
          functionName = nameMatch[1];
        }
        const callIdMatch = trimmed.match(/"call_id"\s*:\s*(\d+|"[^"]+")/);
        if (callIdMatch) {
          callId = callIdMatch[1].replace(/"/g, '');
        }
      }
      continue;
    }

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

  if (!content || typeof content !== 'string') {
    if (CONFIG.debug) {
      console.debug('[JSON Parser] extractJSONParameters: Invalid content');
    }
    return parameters;
  }

  const lines = content.split('\n');

  // First pass: Extract from complete, parseable JSON lines
  for (const line of lines) {
    const parsed = parseJSONLine(line);
    if (!parsed) continue;

    if (parsed.type === 'parameter' && parsed.key) {
      parameters[parsed.key] = parsed.value ?? '';  // Ensure value is never undefined
    }
  }

  // Second pass: Fallback regex extraction for incomplete/streaming parameter lines
  // This handles cases where parameter values are long and arrive in chunks
  // Pattern matches: {"type": "parameter", "key": "keyname", "value": "partial content...
  // Even if the closing quote and brace are missing (streaming incomplete JSON)
  // Note: No trailing quote required - matches partial values during streaming
  const parameterPattern = /"type"\s*:\s*"parameter"[^}]*"key"\s*:\s*"([^"]+)"[^}]*"value"\s*:\s*"((?:[^"\\]|\\.)*)/g;

  let match;
  while ((match = parameterPattern.exec(content)) !== null) {
    const key = match[1];
    const value = match[2];

    // Only use regex-extracted value if we don't already have this parameter
    // (prefer complete values from successfully parsed JSON lines)
    if (!parameters.hasOwnProperty(key)) {
      // Unescape the value (handle \n, \t, \", etc.)
      const unescapedValue = value
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      parameters[key] = unescapedValue;

      if (CONFIG.debug) {
        console.debug(`[JSON Parser] Extracted partial parameter via regex: ${key} (${unescapedValue.length} chars)`);
      }
    }
  }

  if (CONFIG.debug && Object.keys(parameters).length > 0) {
    console.debug('[JSON Parser] extractJSONParameters result:', Object.keys(parameters));
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
