import { extractLanguageTag } from './languageParser';
import { CONFIG, FunctionInfo } from '../core';


export function startsWithFunctionCalls(str: string | null): boolean {
  if (str == null) {
    return false;
  }
  if (CONFIG.targetSelectors.includes('.cm-editor')) {
    const regex = /^.*?(?:›⌄⌄\s*)?<function_calls>\n?\s*<invoke/;
    return regex.test(str);
  }

  return str.includes('<function_calls>') || str.includes('<invoke ');
}

export function getTextFromCmContent(parentElement: Element | Document = document): string | null {
  // Find all divs with class "cm-content" within the parent element
  const cmContentDivs = parentElement.querySelectorAll('.cm-content');

  if (cmContentDivs.length === 0) {
    return null;
  }

  // Get the last one
  const lastCmContentDiv = cmContentDivs[cmContentDivs.length - 1];

  // Get all text content from the div and its children
  return lastCmContentDiv.textContent || lastCmContentDiv.innerText || '';
}

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

  // Check for any signs of function call content
  if (
    !startsWithFunctionCalls(content) &&
    !content.includes('<') &&
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

  // Check for Claude Opus style function calls
  if (startsWithFunctionCalls(contentToExamine)) {
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
