/**
 * Utility functions for robust JSON and XML parsing
 * Handles Unicode characters, streaming content, and edge cases
 */

/**
 * Check if a string looks like valid JSON (even if incomplete)
 * Enhanced to handle Unicode characters and various edge cases
 */
export const isJSONLike = (content: string): boolean => {
  const trimmed = content.trim();

  // Must start with { or [
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  // Must contain valid JSON patterns
  const hasKeyValuePair = /["']?\w+["']?\s*:/u.test(trimmed);
  const hasQuotes = trimmed.includes('"') || trimmed.includes("'");

  return hasKeyValuePair || hasQuotes;
};

/**
 * Find the first complete JSON object in a string
 * This is useful for extracting JSON from content that has prefixes
 */
export const extractFirstJSONObject = (content: string): string | null => {
  const firstBraceIndex = content.indexOf('{');
  if (firstBraceIndex === -1) return null;

  // Try to parse from the first brace
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBraceIndex; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      if (braceCount === 0) {
        // Found a complete object
        return content.substring(firstBraceIndex, i + 1);
      }
    }
  }

  return null;
};

/**
 * Strip non-ASCII prefixes from JSON content
 * Handles cases where Chinese/Japanese/Arabic text appears before JSON
 */
export const stripNonASCIIPrefix = (content: string): string => {
  const firstBrace = content.indexOf('{');
  if (firstBrace <= 0) return content;

  const prefix = content.substring(0, firstBrace);

  // Check if prefix contains only non-ASCII characters and whitespace
  const hasNonASCII = /[^\x00-\x7F]/.test(prefix);
  const hasValidJSONPrefix = /^(?:\s*[a-zA-Z_]+\s*:\s*)?$/.test(prefix);

  // If prefix has non-ASCII or looks like invalid JSON, strip it
  if (hasNonASCII || !hasValidJSONPrefix) {
    return content.substring(firstBrace);
  }

  return content;
};

/**
 * Detect if JSON is likely streaming (incomplete)
 */
export const isStreamingJSON = (content: string): boolean => {
  const trimmed = content.trim();

  // Check for unbalanced braces
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') braceCount++;
      if (char === '}' || char === ']') braceCount--;
    }
  }

  // If braces are not balanced, it's streaming
  if (braceCount !== 0) return true;

  // Check for trailing comma or incomplete value
  if (/,\s*$/.test(trimmed) || /:\s*["']?$/.test(trimmed)) {
    return true;
  }

  return false;
};

/**
 * Extract all JSON objects from a string, handling partial/streaming content
 */
export const extractAllJSONObjects = (content: string): string[] => {
  const objects: string[] = [];
  let searchStart = 0;

  while (searchStart < content.length) {
    const startIndex = content.indexOf('{', searchStart);
    if (startIndex === -1) break;

    const obj = extractFirstJSONObject(content.substring(startIndex));
    if (obj) {
      objects.push(obj);
      searchStart = startIndex + obj.length;
    } else {
      searchStart = startIndex + 1;
    }
  }

  return objects;
};

/**
 * Normalize Unicode string for comparison
 * This helps with content deduplication and caching
 */
export const normalizeUnicodeString = (str: string): string => {
  return str.normalize('NFC');
};

/**
 * Count Unicode characters correctly (not just code units)
 */
export const countUnicodeChars = (str: string): number => {
  return [...str].length;
};

/**
 * Extract parameter values from JSON with proper Unicode and escape handling
 */
export const extractJSONParameterValues = (content: string): Map<string, string> => {
  const parameters = new Map<string, string>();

  // First try to parse as complete JSON
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'parameter' && parsed.key && parsed.value !== undefined) {
      const value = typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value);
      parameters.set(parsed.key, unescapeJSONString(value));
    }
  } catch (e) {
    // Fall back to regex extraction for partial/streaming content
    const paramPattern =
      /"type"\s*:\s*"parameter"[\s\S]*?"key"\s*:\s*"([^"]+)"[\s\S]*?"value"\s*:\s*"((?:[\s\S](?!""\s*}))*)/;
    const match = content.match(paramPattern);

    if (match && match[1] && match[2]) {
      parameters.set(match[1], unescapeJSONString(match[2]));
    }
  }

  return parameters;
};

/**
 * Unescape JSON string with full support for all escape sequences
 */
export const unescapeJSONString = (str: string): string => {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
};

/**
 * Validate if content contains function call patterns (both JSON and XML)
 */
export const containsFunctionCallPattern = (content: string): boolean => {
  const trimmed = content.trim();

  // JSON patterns
  if (isJSONLike(trimmed)) {
    return /["']?type["']?\s*:\s*["']?function_call/u.test(trimmed) || /"type"\s*:\s*"parameter"/u.test(trimmed);
  }

  // XML patterns
  return /<function_calls>|<invoke\s+name|<parameter\s+name/u.test(trimmed);
};

/**
 * Merge parameter updates while preserving streaming state
 */
export const mergeParameterUpdates = (
  existing: Map<string, string>,
  updates: Map<string, string>,
): Map<string, string> => {
  const merged = new Map(existing);

  for (const [key, value] of updates) {
    // Only update if the new value is longer (more complete)
    const existingValue = merged.get(key);
    if (!existingValue || value.length > existingValue.length) {
      merged.set(key, value);
    }
  }

  return merged;
};
