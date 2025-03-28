/**
 * Base Unified Pattern Observer
 *
 * This file contains a base class for unified observers that can detect tool commands
 * based on text patterns rather than CSS selectors. It can be extended
 * by site-specific implementations to reliably observe and process tool commands
 * in their natural DOM order across any website.
 */

import { logMessage } from '../../utils/helpers';
import { markElement, isElementMarked, hasElementContentChanged, unmarkElement } from '../../utils/elementTracker';
import { startOperation, endOperation } from '../../utils/performanceMonitor';
import { SidebarManager, SiteType, ToolOutputHandler } from '../sidebar';
import { McpToolContent, extractMcpToolContents } from './markdownParser';
import { SiteAdapter } from '../../utils/siteAdapter';

// Define a constant for marking tool command elements
export const TOOL_COMMAND_TYPE = 'tool-command';

// Interface for detected tool commands
export interface DetectedToolCommand {
  serverName: string;
  toolName: string;
  arguments: any;
  rawArguments: string;
  element: Element;
  id: string;
  timestamp: number;
  domIndex: number;
  contentHash: string;
}

/**
 * Base class for unified pattern-based observers
 */
export abstract class BaseUnifiedObserver {
  protected siteType: SiteType;
  protected adapter: SiteAdapter;
  protected sidebarManager: SidebarManager;
  private observer: MutationObserver | null = null;
  private processedElements = new Set<Element>();
  protected detectedToolCommands: DetectedToolCommand[] = [];
  private _fullScanTimeout: ReturnType<typeof setTimeout> | null = null;
  // Track elements with their last content to detect changes during streaming
  private elementContentMap = new Map<Element, string>();
  // Track current URL to detect navigation
  private currentUrl: string = window.location.href;
  // Global content hash set to track the same content across different elements
  private contentHashRegistry = new Set<string>();

  /**
   * Constructor for BaseUnifiedObserver
   * @param siteType The type of site (perplexity or chatgpt)
   * @param adapter Site-specific adapter
   * @param toolOutputHandler Handler for tool outputs
   */
  constructor(siteType: SiteType, adapter: SiteAdapter, toolOutputHandler: ToolOutputHandler) {
    this.siteType = siteType;
    this.adapter = adapter;
    this.sidebarManager = SidebarManager.getInstance(siteType, toolOutputHandler);
  }

  /**
   * Process a single element containing a potential tool command
   */
  protected processToolCommandElement(element: Element): void {
    startOperation('processToolCommandElement');
    
    try {
      const text = element.textContent || '';
      let shouldProcess = false;
      let id = '';
      
      // Check if element has been marked already
      if (isElementMarked(element, TOOL_COMMAND_TYPE)) {
        // Check if the content has changed since last processing (streaming case)
        if (hasElementContentChanged(element, TOOL_COMMAND_TYPE)) {
          logMessage(`Element content has changed, reprocessing: ${text.substring(0, 30)}...`);
          // Store the current content for later comparison
          this.elementContentMap.set(element, text);
          shouldProcess = true;
          // Get existing ID
          id = element.getAttribute('data-tool-command-processed') || '';
        } else {
          // Content hasn't changed, skip processing
          return;
        }
      } else {
        // New element, mark it and process
        id = markElement(element, TOOL_COMMAND_TYPE);
        // Store initial content
        this.elementContentMap.set(element, text);
        shouldProcess = true;
        logMessage(`New element marked with id ${id}`);
      }

      if (shouldProcess) {
        const mcpToolContents = extractMcpToolContents(text);

        if (mcpToolContents && mcpToolContents.length > 0) {
          const domIndex = Array.from(document.getElementsByTagName('*')).indexOf(element);
          
          // Get element hierarchy path to better distinguish identical tools in different parts of the DOM
          const elementPath = this.getElementHierarchyPath(element);
          
          // Track tool signatures to avoid duplicates within the entire document
          const globalToolSignatures = this.getGlobalToolSignatures();
          
          // Create a global tool registry for this exact text content
          // This helps with cases where the same exact tool is rendered in multiple elements
          const contentHash = this.hashContent(text);
          
          // Get existing tools for this element by its ID (for streaming updates)
          const existingElementTools = this.detectedToolCommands.filter(cmd => 
            cmd.element === element || cmd.id.startsWith(`${id}-`));
            
          // Track signatures for this specific element (to handle streaming updates)
          const elementToolSignatures = new Set<string>();
          
          // For fast streaming detection, keep track of tool positions 
          // in the raw text to avoid detecting the same tool multiple times
          const toolPositionsInText = new Set<number>();
          
          // Find existing tool positions in the raw text
          existingElementTools.forEach(tool => {
            const rawArgs = tool.rawArguments.trim();
            const rawTool = `${tool.serverName}::${tool.toolName}`;
            
            // Try to find the position of this tool in the text
            const toolPattern = new RegExp(`<use_mcp_tool>[\\s\\S]*?<server_name>${tool.serverName}<\\/server_name>[\\s\\S]*?<tool_name>${tool.toolName}<\\/tool_name>[\\s\\S]*?<arguments>${rawArgs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/arguments>[\\s\\S]*?<\\/use_mcp_tool>`, 'g');
            
            let match;
            while ((match = toolPattern.exec(text)) !== null) {
              toolPositionsInText.add(match.index);
            }
            
            // Content signature for the current element's tools
            const contentSignature = `${tool.serverName}::${tool.toolName}::${rawArgs}`;
            elementToolSignatures.add(contentSignature);
            
            // Global signature that includes position for cross-element deduplication
            const globalSignature = `${contentSignature}::${elementPath}`;
            globalToolSignatures.add(globalSignature);
          });
          
          // Process each tool, with enhanced duplicate detection for fast streaming
          mcpToolContents.forEach((toolContent: McpToolContent) => {
            // Create content-only signature for deduplication within the same element
            const contentSignature = `${toolContent.serverName}::${toolContent.toolName}::${toolContent.rawArguments.trim()}`;
            
            // Create a content+hash signature to detect duplicate tools across different elements with the same content
            const contentAndHashSignature = `${contentSignature}::${contentHash}`;
            
            // Try to find position in the text for this tool to handle fast streaming
            const toolPattern = new RegExp(`<use_mcp_tool>[\\s\\S]*?<server_name>${toolContent.serverName}<\\/server_name>[\\s\\S]*?<tool_name>${toolContent.toolName}<\\/tool_name>[\\s\\S]*?<arguments>${toolContent.rawArguments.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/arguments>[\\s\\S]*?<\\/use_mcp_tool>`, 'g');
            
            // Check if this tool appears at a position we've already processed
            let isDuplicateByPosition = false;
            let match;
            while ((match = toolPattern.exec(text)) !== null) {
              if (toolPositionsInText.has(match.index)) {
                isDuplicateByPosition = true;
                break;
              }
              // Mark this position as processed
              toolPositionsInText.add(match.index);
            }
            
            // Create global signature that includes DOM position
            const globalSignature = `${contentSignature}::${elementPath}`;
            
            // Check for duplicates using multiple strategies
            const isDuplicateInElement = elementToolSignatures.has(contentSignature);
            const isDuplicateGlobally = globalToolSignatures.has(globalSignature);
            
            // Check for duplicate based on content hash across all elements
            const isDuplicateByContentHash = this.isContentHashDuplicate(contentAndHashSignature);
            
            // Skip if duplicate by any detection method
            if (!isDuplicateInElement && !isDuplicateGlobally && !isDuplicateByPosition && !isDuplicateByContentHash) {
              const toolCommand: DetectedToolCommand = {
                ...toolContent,
                element,
                id: `${id}-${this.detectedToolCommands.length}`,
                timestamp: Date.now(),
                domIndex,
                contentHash,
              };
              
              // Add to detected tools
              this.detectedToolCommands.push(toolCommand);
              
              // Register this content hash to prevent duplicates
              this.registerContentHash(contentAndHashSignature);
              
              // Update signature tracking
              elementToolSignatures.add(contentSignature);
              globalToolSignatures.add(globalSignature);
              
              // Handle the newly detected tool
              this.handleDetectedTool(toolCommand);
              logMessage(`Added new tool with signature: ${contentSignature} at DOM path: ${elementPath}`);
            } else if (isDuplicateByContentHash) {
              logMessage(`Skipped duplicate tool with signature: ${contentSignature} (duplicate by content hash)`);
            } else if (isDuplicateByPosition) {
              logMessage(`Skipped duplicate tool with signature: ${contentSignature} (duplicate by text position)`);
            } else if (isDuplicateInElement) {
              logMessage(`Skipped duplicate tool with signature: ${contentSignature} (duplicate within element ${id})`);
            } else {
              logMessage(`Skipped duplicate tool with signature: ${globalSignature} (duplicate across elements)`);
            }
          });
          
          logMessage(`Processed element ${id} with ${mcpToolContents.length} total tools`);
        }
        this.processedElements.add(element);
      }
    } catch (error) {
      logMessage(`Error processing tool command element: ${error}`);
    } finally {
      endOperation('processToolCommandElement');
    }
  }

  /**
   * Process all elements in DOM order
   */
  protected processElementsInDomOrder(): void {
    const toolCommandElements = this.adapter.getToolCommandElements();
    logMessage(`Found ${toolCommandElements.length} potential tool command elements`);

    for (const element of toolCommandElements) {
      this.processToolCommandElement(element);
    }

    

    // Sort detected commands by DOM index to ensure DOM order
    this.detectedToolCommands.sort((a, b) => a.domIndex - b.domIndex);
    this.sidebarManager.refreshContent();
  }

  /**
   * Clear all detected tools and reset state
   * This is called when URL changes or navigation occurs
   */
  protected clearAndResetState(): void {
    logMessage(`URL changed, clearing and resetting state for ${this.siteType}`);
    this.detectedToolCommands = [];
    this.processedElements.clear();
    this.elementContentMap.clear();
    this.contentHashRegistry.clear(); // Clear the content hash registry
    this.sidebarManager.refreshContent();
  }

  /**
   * Set up URL change detection
   */
  private setupUrlChangeDetection(): void {
    // Method 1: Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', () => {
      if (this.currentUrl !== window.location.href) {
        logMessage(`URL changed via popstate: ${this.currentUrl} -> ${window.location.href}`);
        this.currentUrl = window.location.href;
        this.clearAndResetState();
      }
    });

    // Method 2: Intercept history methods
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => {
        if (this.currentUrl !== window.location.href) {
          logMessage(`URL changed via pushState: ${this.currentUrl} -> ${window.location.href}`);
          this.currentUrl = window.location.href;
          this.clearAndResetState();
        }
      }, 0);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => {
        if (this.currentUrl !== window.location.href) {
          logMessage(`URL changed via replaceState: ${this.currentUrl} -> ${window.location.href}`);
          this.currentUrl = window.location.href;
          this.clearAndResetState();
        }
      }, 0);
    };

    // Method 3: Periodic check for SPA navigation (fallback)
    setInterval(() => {
      if (this.currentUrl !== window.location.href) {
        logMessage(`URL changed (detected by interval): ${this.currentUrl} -> ${window.location.href}`);
        this.currentUrl = window.location.href;
        this.clearAndResetState();
      }
    }, 1000);
  }

  /**
   * Abstract method to handle detected tool commands
   * Must be implemented by subclasses
   */
  protected abstract handleDetectedTool(toolCommand: DetectedToolCommand): void;

  /**
   * Start observing the DOM for tool commands
   */
  public observeAllElements(): void {
    const startObserving = () => {
      // Set up URL change detection
      this.setupUrlChangeDetection();
      
      // Add 1 second delay before starting processing
      setTimeout(() => {
        logMessage(`Starting observer after page load and delay for ${this.siteType}`);
        
        // Initial scan
        this.processElementsInDomOrder();
    
        // Set up MutationObserver
        this.observer = new MutationObserver((mutations) => {
          let shouldRefresh = false;
          
          for (const mutation of mutations) {
            // logMessage(`Mutation detected: ${mutation.type}`);
            // logMessage(`Mutation addedNodes: ${mutation.addedNodes.length}`);
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              // logMessage(`Added nodes: ${mutation.addedNodes.length}`);
              for (const addedNode of Array.from(mutation.addedNodes)) {
                // logMessage(`Added node: ${addedNode}`);
                if (addedNode instanceof Element) {
                  // logMessage(`Added node is an Element`);
                  // Check if this element or any of its children might contain tool commands
                  const newElements = this.adapter.getToolCommandElements(addedNode);
                  
                  // Also check if the parent container was modified and might now contain tool commands
                  // This handles cases where Perplexity adds content to existing containers
                  let parentContainer = addedNode.parentElement;
                  while (parentContainer && !shouldRefresh) {
                    const parentElements = this.adapter.getToolCommandElements(parentContainer);
                    if (parentElements.length > 0) {
                      for (const element of parentElements) {
                        // logMessage(`MutationObserver: Parent element: ${element.textContent}`);
                        // Process regardless of previous marking to catch streaming content changes
                        this.processToolCommandElement(element);
                        shouldRefresh = true;
                      }
                    }
                    parentContainer = parentContainer.parentElement;
                  }
                  
                  // Process elements found directly in the added node
                  if (newElements.length > 0) {
                    shouldRefresh = true;
                    for (const element of newElements) {
                      this.processToolCommandElement(element);
                    }
                  }
                  
                  // If this is a substantial DOM change, scan the entire document occasionally
                  // This helps catch elements that might have been missed by selective scanning
                  if (addedNode.querySelectorAll('*').length > 5) {
                    // Debounce full scans to avoid performance issues
                    if (this._fullScanTimeout) {
                      clearTimeout(this._fullScanTimeout);
                    }
                    this._fullScanTimeout = setTimeout(() => {
                    //   logMessage('Performing full document scan after substantial DOM changes');
                      this.processElementsInDomOrder();
                    }, 500); // Wait 500ms before doing a full scan
                  }
                }
              }
            } else if (mutation.type === 'characterData') {
              // This is important for streaming content - directly check the parent of the text node
              if (mutation.target.parentElement) {
                const textNodeParent = mutation.target.parentElement;
                // Check all parents up to a reasonable depth for tool command containers
                let current: Element | null = textNodeParent;
                let depth = 0;
                const MAX_DEPTH = 5; // Limit search depth to avoid performance issues
                
                while (current && depth < MAX_DEPTH) {
                  // Check if this is a container we care about
                  const containerElements = this.adapter.getToolCommandElements(current);
                  if (containerElements.length > 0) {
                    for (const element of containerElements) {
                      // Always process on character data mutation for streaming content
                      this.processToolCommandElement(element);
                      shouldRefresh = true;
                    }
                    break; // Found relevant containers, stop traversing up
                  }
                  
                  // Check if this element was previously processed
                  if (this.processedElements.has(current)) {
                    // Reprocess the element since its content has changed
                    this.processToolCommandElement(current);
                    shouldRefresh = true;
                    break;
                  }
                  
                  current = current.parentElement;
                  depth++;
                }
              }
            }
          }
          
          if (shouldRefresh) {
            // Sort detected commands by DOM index to ensure DOM order
            this.detectedToolCommands.sort((a, b) => a.domIndex - b.domIndex);
            this.sidebarManager.refreshContent();
          }
        });
    
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
    
        logMessage(`Started observing DOM for ${this.siteType} tool commands`);
      }, 1000); // 1 second delay
    };

    // Check if document has already loaded
    if (document.readyState === 'complete') {
      logMessage(`Page already loaded for ${this.siteType}, adding delay before processing`);
      startObserving();
    } else {
      // Wait for the page to fully load before starting
      logMessage(`Waiting for page load for ${this.siteType} before processing`);
      window.addEventListener('load', () => {
        logMessage(`Page load complete for ${this.siteType}, adding delay before processing`);
        startObserving();
      });
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this._fullScanTimeout) {
      clearTimeout(this._fullScanTimeout);
      this._fullScanTimeout = null;
    }
    this.processedElements.clear();
    this.detectedToolCommands = [];
    this.elementContentMap.clear();
    logMessage(`Cleaned up observer for ${this.siteType}`);
  }

  /**
   * Process all elements in DOM order - exposed for adapters to use directly
   * @public Allows adapters to trigger a full scan programmatically
   */
  public scanAllElements(): void {
    logMessage(`Running full document scan for ${this.siteType}`);
    this.processElementsInDomOrder();
  }

  /**
   * Get a set of all global tool signatures for deduplication
   * @returns Set of global tool signatures
   */
  private getGlobalToolSignatures(): Set<string> {
    const signatures = new Set<string>();
    
    this.detectedToolCommands.forEach(cmd => {
      const elementPath = this.getElementHierarchyPath(cmd.element);
      const contentSignature = `${cmd.serverName}::${cmd.toolName}::${cmd.rawArguments.trim()}`;
      const globalSignature = `${contentSignature}::${elementPath}`;
      signatures.add(globalSignature);
    });
    
    return signatures;
  }
  
  /**
   * Get a string representation of an element's position in the DOM hierarchy
   * This helps distinguish between identical tools in different parts of the DOM
   * @param element The element to get a path for
   * @returns A string representation of the element's position in the DOM
   */
  private getElementHierarchyPath(element: Element): string {
    // Get the nearest conversation container (usually has a data-conversation-id or similar)
    let conversationContainer = '';
    let current = element;
    
    // Look for conversation container attributes up to 10 levels up
    for (let i = 0; i < 10; i++) {
      if (!current.parentElement) break;
      current = current.parentElement;
      
      // Check for attributes that might identify a conversation
      const hasConversationId = Array.from(current.attributes).some(
        attr => attr.name.includes('conversation') || 
               attr.value.includes('conversation') ||
               attr.name.includes('message') ||
               attr.name.includes('chat')
      );
      
      if (hasConversationId || current.id) {
        // Use ID or first data attribute as container marker
        conversationContainer = current.id || 
          Array.from(current.attributes)
            .find(attr => attr.name.startsWith('data-'))?.value || '';
        break;
      }
    }
    
    // Get more stable hierarchical information
    const parentChain = [];
    current = element;
    
    // Build a chain of parent element tag names and indices
    for (let i = 0; i < 5; i++) { // Limit to 5 levels for performance
      if (!current.parentElement) break;
      
      const parent = current.parentElement;
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current as Element);
      const tagName = current.tagName.toLowerCase();
      
      // Create a stable identifier for this level
      parentChain.unshift(`${tagName}[${index}/${siblings.length}]`);
      current = parent;
    }
    
    // Get the DOM index - more expensive but very precise
    const domIndex = Array.from(document.getElementsByTagName('*')).indexOf(element);
    
    // Get element class names if any (often useful for identifying the role of an element)
    const classNames = element.className && typeof element.className === 'string' 
      ? element.className.split(' ').filter(Boolean).sort().join('.')
      : '';
    
    // Create a multi-layer signature to better identify elements during fast streaming
    return [
      conversationContainer || 'root',
      parentChain.join('>'),
      domIndex.toString(),
      classNames
    ].filter(Boolean).join(':');
  }

  /**
   * Hash the content of a tool to detect duplicates
   * @param content The content to hash
   * @returns A string hash of the content
   */
  private hashContent(content: string): string {
    // Create a simple hash of the content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
  
  /**
   * Check if a content hash has already been detected
   * @param contentAndHashSignature The content+hash signature to check
   * @returns True if this content hash has already been seen
   */
  private isContentHashDuplicate(contentAndHashSignature: string): boolean {
    return this.contentHashRegistry.has(contentAndHashSignature);
  }
  
  /**
   * Register a content hash to prevent duplicates
   * @param contentAndHashSignature The content+hash signature to register
   */
  private registerContentHash(contentAndHashSignature: string): void {
    this.contentHashRegistry.add(contentAndHashSignature);
  }
}