/**
 * Element Tracker
 *
 * A utility for tracking and identifying DOM elements with a unique ID system.
 * This helps prevent duplicate processing of the same elements across the extension.
 */

import { logMessage } from './helpers';

// Prefix for data attribute used to mark processed elements
const TOOL_OUTPUT_ID_ATTR = 'tool-output-data-extension-element-id';
const MCP_TOOL_ID_ATTR = 'data-mcp-tool-processed';
const TOOL_COMMAND_ID_ATTR = 'data-tool-command-processed';
const ELEMENT_CONTENT_ATTR = 'data-last-processed-content';

// Counter for generating unique IDs
let idCounter = 0;

// Map to store references to tracked elements
const trackedElements = new Map<string, Element>();

// Map to store the last processed content of elements
const elementContents = new Map<string, string>();

/**
 * Generates a unique ID for an element based on its content and position
 * @param element The DOM element to generate an ID for
 * @returns A unique identifier string
 */
export const generateElementId = (element: Element): string => {
  // Get element content hash
  const content = element.textContent || '';
  const contentHash = hashString(content);

  // Get position information
  const positionInfo = getElementPositionInfo(element);

  // Combine information for a unique ID
  return `el-${contentHash}-${positionInfo}-${Date.now()}-${idCounter++}`;
};

/**
 * Simple string hashing function
 * @param str String to hash
 * @returns A numeric hash code
 */
const hashString = (str: string): number => {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash);
};

/**
 * Gets position information for an element
 * @param element The DOM element
 * @returns A string representing the element's position in the DOM
 */
const getElementPositionInfo = (element: Element): string => {
  // Get the path from the element to the root
  const path: number[] = [];
  const tagPath: string[] = [];
  let current = element;

  while (current.parentElement) {
    const parent = current.parentElement;
    const children = Array.from(parent.children);
    const index = children.indexOf(current as Element);
    
    // Add the index and tag name to the paths
    path.unshift(index);
    tagPath.unshift(current.tagName.toLowerCase());
    
    // Get information about siblings to help distinguish position
    const siblingInfo = children.length > 1 ? `-${children.length}` : '';
    tagPath[0] += siblingInfo;
    
    current = parent;
  }

  // Create a more detailed position signature that includes tag names and sibling counts
  const detailedPath = tagPath.join('>');
  
  // Include nearest ancestor with an ID if available, which helps with distinguishing
  // elements in different conversation parts
  let idAncestor = element;
  let ancestorWithId = '';
  
  // Look for up to 5 levels up for an ancestor with an ID
  for (let i = 0; i < 5; i++) {
    if (!idAncestor.parentElement) break;
    idAncestor = idAncestor.parentElement;
    
    const id = idAncestor.id;
    if (id) {
      ancestorWithId = id;
      break;
    }
    
    // Also check for data attributes that might help identify the conversation container
    const dataAttrs = Array.from(idAncestor.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name}=${attr.value}`)
      .join('|');
      
    if (dataAttrs) {
      ancestorWithId = dataAttrs;
      break;
    }
  }
  
  // Combine all information for a robust position signature
  return `${path.join('-')}:${detailedPath}${ancestorWithId ? `:${ancestorWithId}` : ''}`;
};

/**
 * Marks an element as processed with a unique ID
 * @param element The DOM element to mark
 * @returns The ID assigned to the element
 */
export const markElement = (element: Element, type: 'tool-output' | 'mcp-tool' | 'tool-command'): string => {
  // Get the appropriate attribute based on type
  const attr = 
    type === 'tool-output' ? TOOL_OUTPUT_ID_ATTR : 
    type === 'mcp-tool' ? MCP_TOOL_ID_ATTR : 
    TOOL_COMMAND_ID_ATTR;
    
  // Check if element is already marked
  const existingId = element.getAttribute(attr);
  if (existingId) {
    // Store current content for change detection
    const currentContent = element.textContent || '';
    element.setAttribute(ELEMENT_CONTENT_ATTR, currentContent);
    elementContents.set(existingId, currentContent);
    return existingId;
  }

  // Generate and assign a new ID
  const id = generateElementId(element);
  element.setAttribute(attr, id);
  
  // Store content for change detection
  const content = element.textContent || '';
  element.setAttribute(ELEMENT_CONTENT_ATTR, content);
  elementContents.set(id, content);
  
  trackedElements.set(id, element);

  return id;
};

/**
 * Checks if an element has already been processed
 * @param element The DOM element to check
 * @returns Boolean indicating if the element has been processed
 */
export const isElementMarked = (element: Element, type: 'tool-output' | 'mcp-tool' | 'tool-command'): boolean => {
  // Get the appropriate attribute based on type
  // logMessage(`isElementMarked: Checking if element is marked: ${element.textContent}`);
  const attr = 
    type === 'tool-output' ? TOOL_OUTPUT_ID_ATTR : 
    type === 'mcp-tool' ? MCP_TOOL_ID_ATTR : 
    TOOL_COMMAND_ID_ATTR;

    let isMarked = element.hasAttribute(attr);
    logMessage(`isElementMarked: Element is marked: ${isMarked}`);
    
  return isMarked;
};

/**
 * Checks if an element's content has changed since it was last processed
 * @param element The DOM element to check
 * @param type The type of processing marker
 * @returns Boolean indicating if the content has changed
 */
export const hasElementContentChanged = (element: Element, type: 'tool-output' | 'mcp-tool' | 'tool-command'): boolean => {
  const attr = 
    type === 'tool-output' ? TOOL_OUTPUT_ID_ATTR : 
    type === 'mcp-tool' ? MCP_TOOL_ID_ATTR : 
    TOOL_COMMAND_ID_ATTR;
    
  const id = element.getAttribute(attr);
  if (!id) return false; // Not marked yet
  
  const lastContent = elementContents.get(id) || element.getAttribute(ELEMENT_CONTENT_ATTR) || '';
  const currentContent = element.textContent || '';
  
  // Return true if content has changed and is longer (indicating new content was streamed)
  return currentContent !== lastContent && currentContent.length > lastContent.length;
};

/**
 * Unmarks an element so it can be processed again
 * @param element The DOM element to unmark
 * @param type The type of processing marker
 */
export const unmarkElement = (element: Element, type: 'tool-output' | 'mcp-tool' | 'tool-command'): void => {
  const attr = 
    type === 'tool-output' ? TOOL_OUTPUT_ID_ATTR : 
    type === 'mcp-tool' ? MCP_TOOL_ID_ATTR : 
    TOOL_COMMAND_ID_ATTR;
    
  const id = element.getAttribute(attr);
  if (id) {
    element.removeAttribute(attr);
    elementContents.delete(id);
    trackedElements.delete(id);
  }
  
  // Also remove the content tracking attribute
  element.removeAttribute(ELEMENT_CONTENT_ATTR);
};

/**
 * Gets the ID of a marked element
 * @param element The DOM element
 * @returns The element's ID or null if not marked
 */
export const getElementId = (element: Element, type: 'tool-output' | 'mcp-tool' | 'tool-command'): string | null => {
  // Get the appropriate attribute based on type
  const attr = 
    type === 'tool-output' ? TOOL_OUTPUT_ID_ATTR : 
    type === 'mcp-tool' ? MCP_TOOL_ID_ATTR : 
    TOOL_COMMAND_ID_ATTR;
    
  return element.getAttribute(attr);
};

/**
 * Gets an element by its tracking ID
 * @param id The element tracking ID
 * @returns The element or undefined if not found
 */
export const getElementById = (id: string): Element | undefined => {
  return trackedElements.get(id);
};

/**
 * Clears all tracked elements
 */
export const clearTrackedElements = (): void => {
  trackedElements.clear();
  elementContents.clear();
  idCounter = 0;
  logMessage('Cleared all tracked elements');
};

/**
 * Gets the count of currently tracked elements
 * @returns Number of tracked elements
 */
export const getTrackedElementCount = (): number => {
  return trackedElements.size;
};
