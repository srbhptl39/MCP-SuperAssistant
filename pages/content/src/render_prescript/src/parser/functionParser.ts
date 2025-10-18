import type { FunctionInfo } from '../core/types';
import { extractLanguageTag } from './languageParser';
import { containsJSONFunctionCalls, extractJSONFunctionInfo } from './jsonFunctionParser';

/**
 * Analyzes content to determine if it contains function calls
 * and related information about their completeness
 *
 * @param block The HTML element containing potential function call content
 * @returns Information about the detected function calls
 */
export const containsFunctionCalls = (block: HTMLElement): FunctionInfo => {
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

  // First, check for JSON function calls
  const jsonResult = containsJSONFunctionCalls(block);
  if (jsonResult.hasFunctionCalls) {
    // Extract description for JSON format
    const { description } = extractJSONFunctionInfo(content);
    return {
      ...jsonResult,
      description,
    };
  }

  // Check for XML function call content
  if (
    !content.includes('<') &&
    !content.includes('<function_calls>') &&
    !content.includes('<invoke') &&
    !content.includes('</invoke>') &&
    !content.includes('<parameter')
  ) {
    return result;
  }

  // Detect language tag and update content to examine
  const langTagResult = extractLanguageTag(content);
  if (langTagResult.tag) {
    result.languageTag = langTagResult.tag;
  }

  // The content to analyze (with or without language tag)
  const contentToExamine = langTagResult.content || content;

  // Check for Claude Opus style function calls (XML)
  if (contentToExamine.includes('<function_calls>') || contentToExamine.includes('<invoke')) {
    result.hasFunctionCalls = true;
    result.detectedBlockType = 'antml';

    result.hasInvoke = contentToExamine.includes('<invoke');
    result.hasParameters = contentToExamine.includes('<parameter');

    // Extract function name from invoke tag if present
    if (result.hasInvoke) {
      const invokeMatch = contentToExamine.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/);
      if (invokeMatch && invokeMatch[1]) {
        result.invokeName = invokeMatch[1];
      }
    }

    // Check for complete structure
    const hasOpeningTag = contentToExamine.includes('<function_calls>');
    const hasClosingTag = contentToExamine.includes('</function_calls>');

    result.hasClosingTags = hasOpeningTag && hasClosingTag;
    result.isComplete = result.hasClosingTags;
  }

  return result;
};
