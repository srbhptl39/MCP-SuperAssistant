/**
 * Common Markdown Content Parser
 *
 * This file contains functions for parsing content from markdown elements
 * that can be used across different site adapters.
 */

import { logMessage } from '../../utils/helpers';
import { XMLParser } from 'fast-xml-parser';

// Interfaces for the extracted content
export interface ThinkContent {
  content: string;
}

export interface McpToolContent {
  serverName: string;
  toolName: string;
  arguments: any;
  rawArguments: string;
}

export interface MarkdownExtractedContent {
  id: string;
  elementId: string;
  thinkContent?: ThinkContent;
  mcpToolContents?: McpToolContent[];
  timestamp: number;
  domIndex?: number;
}

const mcpToolId = 'use_mcp_tool';
const mcpToolRegex = new RegExp(`<${mcpToolId}>([\\s\\S]*?)<\/${mcpToolId}>`);

const thinkId = 'think';
const thinkRegex = new RegExp(`<${thinkId}>([\\s\\S]*?)<\/${thinkId}>`);

const serverNameId = 'server_name';
const serverNameRegex = new RegExp(`<${serverNameId}>([\\s\\S]*?)<\/${serverNameId}>`);

const toolNameId = 'tool_name';
const toolNameRegex = new RegExp(`<${toolNameId}>([\\s\\S]*?)<\/${toolNameId}>`);

const argumentsId = 'arguments';
const argumentsRegex = new RegExp(`<${argumentsId}>([\\s\\S]*?)<\/${argumentsId}>`);

/**
 * Detects if a string is in JSON or XML format
 * @param content The string to check
 * @returns 'json', 'xml', or 'unknown'
 */
export const detectArgumentFormat = (content: string): 'json' | 'xml' | 'unknown' => {
  // Trim whitespace
  const trimmed = content.trim();

  // Check for JSON format (starts with { or [)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch (e) {
      // Not valid JSON
    }
  }

  // Check for XML format (starts with < and ends with >)
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    // Simple check for XML-like structure
    const hasClosingTag = /<\/[^>]+>/.test(trimmed);
    if (hasClosingTag) {
      return 'xml';
    }
  }

  return 'unknown';
};

/**
 * Parses XML-formatted arguments into an object using fast-xml-parser
 * @param xmlContent The XML content to parse
 * @returns Parsed object or null if parsing fails
 */
export const parseXmlArguments = (xmlContent: string): any => {
  try {
    // Configure parser options
    const options = {
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseAttributeValue: true,
      trimValues: true,
      parseTagValue: true,
      isArray: (name: string, jpath: string) => {
        // Handle arrays if needed
        return false;
      },
    };

    // Create parser instance
    const parser = new XMLParser(options);

    // Parse the XML content
    const result = parser.parse(`<root>${xmlContent}</root>`);

    logMessage(`Parsed XML arguments non json: ${result}`);
    logMessage(`Parsed XML arguments: ${JSON.stringify(result)}`);

    // Return the parsed content (removing the root wrapper)
    return result.root || {};
  } catch (error) {
    logMessage(`Error parsing XML arguments with fast-xml-parser: ${error}`);
    return null;
  }
};

/**
 * Extracts think content from a string
 * @param content The string to extract from
 * @returns ThinkContent object or undefined if not found
 */
export const extractThinkContent = (content: string): ThinkContent | undefined => {
  try {
    // Check if the content contains think tags
    const match = content.match(thinkRegex);

    if (match && match[1]) {
      logMessage('Found think content');
      return {
        content: match[1].trim(),
      };
    }

    return undefined;
  } catch (error) {
    logMessage(`Error extracting think content: ${error}`);
    return undefined;
  }
};

/**
 * Extracts all MCP tool contents from a string
 * @param content The string to extract from
 * @returns Array of McpToolContent objects or undefined if none found
 */
export const extractMcpToolContents = (content: string): McpToolContent[] | undefined => {
  try {
    const results: McpToolContent[] = [];
    let remainingContent = content;
    let match;
    const uniqueTools = new Map<string, McpToolContent>();

    // Find all MCP tool blocks in the content
    while ((match = remainingContent.match(mcpToolRegex)) !== null) {
      const fullMatch = match[0];
      const toolContent = match[1];

      // Extract the tool content
      const extractedTool = extractMcpToolContent(toolContent);
      if (extractedTool) {
        // Create a unique key based on the most stable properties
        // Using a more structured approach to make sure the key is consistent
        const toolKey = `${extractedTool.serverName}::${extractedTool.toolName}::${extractedTool.rawArguments.trim()}`;

        // Only add if we haven't seen this exact tool before
        if (!uniqueTools.has(toolKey)) {
          uniqueTools.set(toolKey, extractedTool);
          logMessage(`Added unique tool with key: ${toolKey}`);
        } else {
          logMessage(`Skipped duplicate tool with key: ${toolKey}`);
        }
      }

      // Remove the processed part from the remaining content
      const matchIndex = remainingContent.indexOf(fullMatch);
      if (matchIndex !== -1) {
        remainingContent = remainingContent.substring(matchIndex + fullMatch.length);
      } else {
        break; // Safety check to prevent infinite loop
      }
    }

    // Convert the unique tools map to an array
    const uniqueResults = Array.from(uniqueTools.values());

    if (uniqueResults.length > 0) {
      logMessage(`Found ${uniqueResults.length} unique MCP tool blocks`);
      return uniqueResults;
    }

    return undefined;
  } catch (error) {
    logMessage(`Error extracting MCP tool contents: ${error}`);
    return undefined;
  }
};

/**
 * Extracts a single MCP tool content from a string
 * @param content The string to extract from
 * @returns McpToolContent object or null if not found
 */
export const extractMcpToolContent = (content: string): McpToolContent | null => {
  try {
    // Extract server name
    const serverNameMatch = content.match(serverNameRegex);
    const serverName = serverNameMatch && serverNameMatch[1] ? serverNameMatch[1].trim() : '';

    // Extract tool name
    const toolNameMatch = content.match(toolNameRegex);
    const toolName = toolNameMatch && toolNameMatch[1] ? toolNameMatch[1].trim() : '';

    // Extract arguments
    const argumentsMatch = content.match(argumentsRegex);
    const rawArguments = argumentsMatch && argumentsMatch[1] ? argumentsMatch[1].trim() : '';

    // Parse arguments based on format
    let parsedArguments: any = null;
    if (rawArguments) {
      const format = detectArgumentFormat(rawArguments);
      if (format === 'json') {
        try {
          parsedArguments = JSON.parse(rawArguments);
        } catch (e) {
          logMessage(`Error parsing JSON arguments: ${e}`);
        }
      } else if (format === 'xml') {
        parsedArguments = parseXmlArguments(rawArguments);
      } else {
        logMessage(`Unknown argument format: ${rawArguments}`);
        // For unknown format, just use the raw string
        // parsedArguments = rawArguments;
      }
    }

    // Only return if we have at least a server name or tool name
    if (serverName || toolName) {
      return {
        serverName,
        toolName,
        arguments: parsedArguments,
        rawArguments,
      };
    }

    return null;
  } catch (error) {
    logMessage(`Error extracting MCP tool content: ${error}`);
    return null;
  }
};

/**
 * Extracts markdown content from an HTML element
 * @param element The element to extract from
 * @returns MarkdownExtractedContent object or null if extraction fails
 */
export const extractMarkdownContent = (element: Element): MarkdownExtractedContent | null => {
  try {
    const content = element.textContent || '';

    // Generate a unique ID for this content
    const id = `md-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Extract think content
    const thinkContent = extractThinkContent(content);

    // Extract MCP tool contents
    const mcpToolContents = extractMcpToolContents(content);

    // Only return if we found either think content or MCP tool contents
    if (thinkContent || (mcpToolContents && mcpToolContents.length > 0)) {
      return {
        id,
        elementId: '', // This will be set by the caller
        thinkContent,
        mcpToolContents,
        timestamp: Date.now(),
      };
    }

    return null;
  } catch (error) {
    logMessage(`Error extracting markdown content: ${error}`);
    return null;
  }
};
