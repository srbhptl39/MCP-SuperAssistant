/**
 * Common Tool Output Handler
 *
 * This file contains common functions for processing tool output elements
 * that can be used across different site adapters.
 */

import { logMessage } from '../../utils/helpers';
import { extractToolOutput, parseToolOutputJson } from './toolcallParser';
import { markElement, isElementMarked, getElementId } from '../../utils/elementTracker';
import { startOperation, endOperation } from '../../utils/performanceMonitor';

// Interface for processed tool outputs
export interface ProcessedToolOutput {
  id: string;
  content: string;
  timestamp: number;
  domIndex: number;
}

export const TOOL_OUTPUT_TYPE = 'tool-output';

/**
 * Base class for tool output handlers
 */
export abstract class BaseToolOutputHandler {
  protected processedOutputs: ProcessedToolOutput[] = [];

  /**
   * Gets all processed tool outputs
   * @returns Array of processed tool outputs
   */
  getProcessedToolOutputs(): ProcessedToolOutput[] {
    if (this.processedOutputs.length > 0) {
      logMessage(
        `Returning ${this.processedOutputs.length} tool outputs with DOM indices: ${this.processedOutputs.map(o => o.domIndex).join(', ')}`,
      );
    }
    return [...this.processedOutputs];
  }

  /**
   * Clears the list of processed tool outputs
   */
  clearProcessedToolOutputs(): void {
    this.processedOutputs.length = 0;
    logMessage('Cleared processed tool outputs');
  }

  /**
   * Adds a processed tool output to the list
   * @param output The processed tool output to add
   */
  protected addProcessedToolOutput(output: ProcessedToolOutput): void {
    this.processedOutputs.push(output);
    logMessage(`Added tool output with ID ${output.id} at DOM index ${output.domIndex}`);
  }

  /**
   * Processes a tool output element
   * @param element The element to process
   * @param domIndex The index of the element in the DOM
   */
  abstract processToolOutputElement(element: Element, domIndex: number): void;
}

// Define the site types
export type SiteType = 'perplexity' | 'chatgpt' | 'grok' | 'gemini' | 'aistudio';

/**
 * Tool output handler class for processing tool outputs
 */
export class ToolOutputHandler extends BaseToolOutputHandler {
  private static perplexityInstance: ToolOutputHandler;
  private static chatgptInstance: ToolOutputHandler;
  private static grokInstance: ToolOutputHandler;
  private static geminiInstance: ToolOutputHandler;
  private static aistudioInstance: ToolOutputHandler;
  private siteType: SiteType;

  private constructor(siteType: SiteType) {
    super();
    this.siteType = siteType;
    logMessage(`Created tool output handler for ${siteType}`);
  }

  /**
   * Gets a singleton instance of the tool output handler
   * @param siteType The site type
   * @returns A singleton instance of the tool output handler
   */
  public static getInstance(siteType: SiteType): ToolOutputHandler {
    // Return the existing instance if available
    switch (siteType) {
      case 'perplexity':
        if (!ToolOutputHandler.perplexityInstance) {
          ToolOutputHandler.perplexityInstance = new ToolOutputHandler(siteType);
        }
        return ToolOutputHandler.perplexityInstance;
      case 'chatgpt':
        if (!ToolOutputHandler.chatgptInstance) {
          ToolOutputHandler.chatgptInstance = new ToolOutputHandler(siteType);
        }
        return ToolOutputHandler.chatgptInstance;
      case 'grok':
        if (!ToolOutputHandler.grokInstance) {
          ToolOutputHandler.grokInstance = new ToolOutputHandler(siteType);
        }
        return ToolOutputHandler.grokInstance;
      case 'gemini':
        if (!ToolOutputHandler.geminiInstance) {
          ToolOutputHandler.geminiInstance = new ToolOutputHandler(siteType);
        }
        return ToolOutputHandler.geminiInstance;
      case 'aistudio':
        if (!ToolOutputHandler.aistudioInstance) {
          ToolOutputHandler.aistudioInstance = new ToolOutputHandler(siteType);
        }
        return ToolOutputHandler.aistudioInstance;
      default:
        // For any unexpected site type, create and return a new instance
        return new ToolOutputHandler(siteType as SiteType);
    }
  }

  /**
   * Process a tool output element and extract the tool output content
   * @param element The element to process
   * @param domIndex The index of the element in the DOM
   */
  processToolOutputElement(element: Element, domIndex: number): void {
    // Skip if already processed
    if (isElementMarked(element, TOOL_OUTPUT_TYPE)) {
      // logMessage(`Element already processed as tool output: ${getElementId(element)}`);
      return;
    }

    // Start performance measurement
    startOperation('processToolOutputElement');

    try {
      // Get the element text content
      const textContent = element.textContent || '';

      // Skip if no content
      if (!textContent) {
        // logMessage('Skipping empty element');
        return;
      }

      // Skip if the content doesn't look like a tool output
      const toolOutput = extractToolOutput(element);
      if (!toolOutput || !parseToolOutputJson(toolOutput)) {
        // logMessage('Element does not contain tool output');
        return;
      }

      // Mark the element as processed
      const id = markElement(element, TOOL_OUTPUT_TYPE);

      // Add the tool output to the list
      this.addProcessedToolOutput({
        id,
        content: toolOutput,
        timestamp: Date.now(),
        domIndex,
      });
    } finally {
      // End performance measurement
      endOperation('processToolOutputElement');
    }
  }
}

// -------------------- Perplexity Functions --------------------

export const getPerplexityToolOutputHandler = (): ToolOutputHandler => {
  return ToolOutputHandler.getInstance('perplexity');
};

export const processPerplexityToolOutputElement = (element: Element, domIndex: number): void => {
  getPerplexityToolOutputHandler().processToolOutputElement(element, domIndex);
};

export const getPerplexityProcessedToolOutputs = (): ProcessedToolOutput[] => {
  return getPerplexityToolOutputHandler().getProcessedToolOutputs();
};

export const clearPerplexityProcessedToolOutputs = (): void => {
  getPerplexityToolOutputHandler().clearProcessedToolOutputs();
};

// -------------------- AiStudio Functions --------------------

export const getAiStudioToolOutputHandler = (): ToolOutputHandler => {
  return ToolOutputHandler.getInstance('aistudio');
};

export const processAiStudioToolOutputElement = (element: Element, domIndex: number): void => {
  getAiStudioToolOutputHandler().processToolOutputElement(element, domIndex);
};

export const getAiStudioProcessedToolOutputs = (): ProcessedToolOutput[] => {
  return getAiStudioToolOutputHandler().getProcessedToolOutputs();
};

export const clearAiStudioProcessedToolOutputs = (): void => {
  getAiStudioToolOutputHandler().clearProcessedToolOutputs();
};

// -------------------- ChatGPT Functions --------------------

export const getChatGptToolOutputHandler = (): ToolOutputHandler => {
  return ToolOutputHandler.getInstance('chatgpt');
};

export const processChatGptToolOutputElement = (element: Element, domIndex: number): void => {
  getChatGptToolOutputHandler().processToolOutputElement(element, domIndex);
};

export const getChatGptProcessedToolOutputs = (): ProcessedToolOutput[] => {
  return getChatGptToolOutputHandler().getProcessedToolOutputs();
};

export const clearChatGptProcessedToolOutputs = (): void => {
  getChatGptToolOutputHandler().clearProcessedToolOutputs();
};

// -------------------- Grok Functions --------------------

export const getGrokToolOutputHandler = (): ToolOutputHandler => {
  return ToolOutputHandler.getInstance('grok');
};

export const processGrokToolOutputElement = (element: Element, domIndex: number): void => {
  getGrokToolOutputHandler().processToolOutputElement(element, domIndex);
};

export const getGrokProcessedToolOutputs = (): ProcessedToolOutput[] => {
  return getGrokToolOutputHandler().getProcessedToolOutputs();
};

export const clearGrokProcessedToolOutputs = (): void => {
  getGrokToolOutputHandler().clearProcessedToolOutputs();
};

// -------------------- Gemini Functions --------------------

export const getGeminiToolOutputHandler = (): ToolOutputHandler => {
  return ToolOutputHandler.getInstance('gemini');
};

export const processGeminiToolOutputElement = (element: Element, domIndex: number): void => {
  getGeminiToolOutputHandler().processToolOutputElement(element, domIndex);
};

export const getGeminiProcessedToolOutputs = (): ProcessedToolOutput[] => {
  return getGeminiToolOutputHandler().getProcessedToolOutputs();
};

export const clearGeminiProcessedToolOutputs = (): void => {
  getGeminiToolOutputHandler().clearProcessedToolOutputs();
};
