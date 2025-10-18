import { CONFIG } from '../core/config';
import type { Parameter, PartialParameterState } from '../core/types';
import { extractJSONParameters } from './jsonFunctionParser';

// State storage for streaming parameters
export const partialParameterState = new Map<string, PartialParameterState>();
export const streamingContentLengths = new Map<string, number>();

/**
 * Detect if content is JSON format
 */
const isJSONFormat = (content: string): boolean => {
  const trimmed = content.trim();
  return trimmed.includes('"type"') &&
         (trimmed.includes('function_call_start') || trimmed.includes('parameter'));
};

/**
 * Extract parameters from JSON format with state tracking for real-time streaming
 */
const extractParametersFromJSON = (content: string, blockId: string | null = null): Parameter[] => {
  const parameters: Parameter[] = [];
  const jsonParams = extractJSONParameters(content);

  // Get previous state for tracking changes
  const partialParams: PartialParameterState = blockId ? partialParameterState.get(blockId) || {} : {};
  const newPartialState: PartialParameterState = {};

  // Check if streaming (no function_call_end)
  const isStreaming = !content.includes('"type":"function_call_end"') &&
                      !content.includes('"type": "function_call_end"');

  Object.entries(jsonParams).forEach(([name, value]) => {
    const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

    // Track content length for large content handling
    if (blockId && displayValue.length > CONFIG.largeContentThreshold) {
      streamingContentLengths.set(`${blockId}-${name}`, displayValue.length);
    }

    // Determine if this is a new or changed parameter
    const isNew = !partialParams[name] || partialParams[name] !== displayValue;

    // Store current state for next iteration
    newPartialState[name] = displayValue;

    parameters.push({
      name,
      value: displayValue,
      isComplete: !isStreaming,
      isStreaming,
      isNew,
      originalContent: displayValue,
      contentLength: displayValue.length,
      isLargeContent: displayValue.length > CONFIG.largeContentThreshold,
    });
  });

  // Update state for next iteration
  if (blockId) {
    partialParameterState.set(blockId, newPartialState);
  }

  return parameters;
};

/**
 * Extract parameters from function call content
 *
 * @param content The content to extract parameters from
 * @param blockId Optional block ID for tracking streaming parameters
 * @returns Array of extracted parameters
 */
export const extractParameters = (content: string, blockId: string | null = null): Parameter[] => {
  // Check if JSON format
  if (isJSONFormat(content)) {
    return extractParametersFromJSON(content, blockId);
  }

  // XML format extraction
  const parameters: Parameter[] = [];
  // Improved regex to handle more edge cases in opening tag - allow for attributes in any order
  const regex = /<parameter\s+(?:name="([^"]+)"[^>]*|[^>]*name="([^"]+)")(?:>|$)/g;
  const partialParams: PartialParameterState = blockId ? partialParameterState.get(blockId) || {} : {};

  let match;
  let lastIndex = 0;
  const newPartialState: PartialParameterState = {};

  // Process all complete and partial parameter tags
  while ((match = regex.exec(content)) !== null) {
    // Use the first non-undefined group as the parameter name
    const paramName = match[1] || match[2];
    const fullMatch = match[0];
    const startPos = match.index + fullMatch.length;

    const isIncompleteTag = !fullMatch.endsWith('>');

    if (isIncompleteTag) {
      // Handle incomplete opening tag
      const partialContent = content.substring(startPos);
      newPartialState[paramName] = partialContent;
      parameters.push({
        name: paramName,
        value: partialContent,
        isComplete: false,
        isNew: !partialParams[paramName] || partialParams[paramName] !== partialContent,
        isStreaming: true,
        originalContent: partialContent,
        isIncompleteTag: true,
      });
      continue;
    }

    // Find the matching closing tag, handling nested parameters
    let endPos = startPos;
    let nestLevel = 1;
    let foundEnd = false;

    // More robust tag matching algorithm
    for (let i = startPos; i < content.length; i++) {
      // Check for another opening parameter tag
      if (i + 10 < content.length && content.substring(i, i + 10) === '<parameter') {
        // Only increment if it's actually a tag and not part of a string
        // Look for whitespace or '>' after the tag name to confirm it's a tag
        if (content.charAt(i + 10) === ' ' || content.charAt(i + 10) === '>') {
          nestLevel++;
        }
      }
      // Check for closing parameter tag
      else if (i + 12 < content.length && content.substring(i, i + 12) === '</parameter>') {
        nestLevel--;
        if (nestLevel === 0) {
          endPos = i;
          foundEnd = true;
          break;
        }
        i += 11; // Skip past the closing tag
      }
    }

    if (foundEnd) {
      // Complete parameter with both start and end tags
      const paramValue = content.substring(startPos, endPos);
      if (blockId && paramValue.length > CONFIG.largeContentThreshold) {
        streamingContentLengths.set(`${blockId}-${paramName}`, paramValue.length);
      }
      parameters.push({
        name: paramName,
        value: paramValue,
        isComplete: true,
      });
      lastIndex = endPos + 12; // Move past the closing tag
    } else {
      // Parameter with start tag but no end tag (still streaming)
      const partialValue = content.substring(startPos);
      newPartialState[paramName] = partialValue;

      if (blockId) {
        const key = `${blockId}-${paramName}`;
        const prevLength = streamingContentLengths.get(key) || 0;
        const newLength = partialValue.length;
        streamingContentLengths.set(key, newLength);

        const isLargeContent = newLength > CONFIG.largeContentThreshold;
        const hasGrown = newLength > prevLength;
        const isNew = !partialParams[paramName] || partialParams[paramName] !== partialValue;

        parameters.push({
          name: paramName,
          value: partialValue,
          isComplete: false,
          isNew: isNew || hasGrown,
          isStreaming: true,
          originalContent: partialValue,
          isLargeContent: isLargeContent,
          contentLength: newLength,
          truncated: isLargeContent,
        });
      } else {
        parameters.push({
          name: paramName,
          value: partialValue,
          isComplete: false,
          isNew: !partialParams[paramName] || partialParams[paramName] !== partialValue,
          isStreaming: true,
          originalContent: partialValue,
        });
      }
    }
  }

  // Handle partial parameter tags at the end of content
  if (blockId && content.includes('<parameter')) {
    // More robust regex for partial opening tags
    const partialTagRegex = /<parameter(?:\s+(?:name="([^"]*)")?[^>]*)?$/;
    const partialTagMatch = content.match(partialTagRegex);

    if (partialTagMatch) {
      const paramName = partialTagMatch[1] || 'unnamed_parameter';
      const partialTag = partialTagMatch[0];

      // Store the partial tag with timestamp to avoid collisions
      newPartialState[`__partial_tag_${Date.now()}`] = partialTag;

      if (paramName && paramName !== 'unnamed_parameter') {
        const existingParam = parameters.find(p => p.name === paramName);
        if (!existingParam) {
          parameters.push({
            name: paramName,
            value: '(streaming...)',
            isComplete: false,
            isStreaming: true,
            isIncompleteTag: true,
          });
        }
      }
    }

    // Enhanced regex to detect open parameter that might be streaming content
    const lastParamTagRegex = /<parameter\s+(?:name="([^"]+)"[^>]*|[^>]*name="([^"]+)")>([^<]*?)$/i;
    const lastParamTagMatch = content.match(lastParamTagRegex);

    if (lastParamTagMatch) {
      // Use the first non-undefined group as the parameter name
      const paramName = lastParamTagMatch[1] || lastParamTagMatch[2];
      const partialContent = lastParamTagMatch[3] || '';

      if (paramName && partialContent) {
        newPartialState[`__streaming_content_${paramName}`] = partialContent;
        const existingParam = parameters.find(p => p.name === paramName);
        if (!existingParam) {
          parameters.push({
            name: paramName,
            value: partialContent,
            isComplete: false,
            isStreaming: true,
            originalContent: partialContent,
          });
        }
      }
    }
  }

  // Update the partial state for this block if we have an ID
  if (blockId) {
    partialParameterState.set(blockId, newPartialState);
  }

  return parameters;
};
