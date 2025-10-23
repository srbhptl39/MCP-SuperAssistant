import { CONFIG } from '../core/config';
import { applyThemeClass, isDarkTheme } from '../utils/themeDetector';

// State management for rendered elements
export const processedResultElements = new WeakSet<HTMLElement>();
export const renderedFunctionResults = new Map<string, HTMLDivElement>();

/**
 * Common interface for expandable content configuration
 */
interface ExpandableConfig {
  blockId: string;
  className: string;
  headerText: string;
  expandTitle: string;
  collapseTitle: string;
  callId?: string;
}

/**
 * Creates a themed content area with consistent styling
 */
const createThemedContentArea = (className: string): HTMLDivElement => {
  const contentArea = document.createElement('div');
  contentArea.className = className;
  contentArea.style.width = '100%';
  contentArea.style.boxSizing = 'border-box';
  contentArea.style.whiteSpace = 'pre-wrap';
  contentArea.style.wordBreak = 'break-word';

  // Apply theme-specific styles
  if (isDarkTheme()) {
    contentArea.style.backgroundColor = '#2d2d2d';
    contentArea.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    contentArea.style.color = '#e8eaed';
  } else {
    contentArea.style.backgroundColor = '#f8f9fa';
    contentArea.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    contentArea.style.color = '#202124';
  }

  return contentArea;
};

/**
 * Creates an expandable content wrapper with consistent styling
 */
const createExpandableContent = (): HTMLDivElement => {
  const expandableContent = document.createElement('div');
  expandableContent.className = 'expandable-content';
  expandableContent.style.overflow = 'hidden';
  expandableContent.style.maxHeight = '0px';
  expandableContent.style.opacity = '0';
  expandableContent.style.padding = '0 12px';
  expandableContent.style.width = '100%';
  expandableContent.style.boxSizing = 'border-box';
  expandableContent.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
  return expandableContent;
};

/**
 * Creates a header with expand/collapse functionality
 */
const createExpandableHeader = (
  config: ExpandableConfig,
): { header: HTMLDivElement; expandButton: HTMLButtonElement } => {
  const header = document.createElement('div');
  header.className = config.className.includes('system') ? 'function-name system-header' : 'function-name';

  // Create left section
  const leftSection = document.createElement('div');
  leftSection.className = 'function-name-left';

  const nameText = document.createElement('div');
  nameText.className = 'function-name-text';
  nameText.textContent = config.headerText;
  leftSection.appendChild(nameText);

  // Create right section
  const rightSection = document.createElement('div');
  rightSection.className = 'function-name-right';

  // Add call ID if available (for function results)
  if (config.callId) {
    const callIdElement = document.createElement('div');
    callIdElement.className = 'call-id';
    callIdElement.textContent = config.callId;
    rightSection.appendChild(callIdElement);
  }

  // Create expand button
  const expandButton = document.createElement('button');
  expandButton.className = 'expand-button';
  expandButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  expandButton.title = config.expandTitle;
  rightSection.appendChild(expandButton);

  header.appendChild(leftSection);
  header.appendChild(rightSection);

  return { header, expandButton };
};

/**
 * Sets up expand/collapse functionality for a container
 */
const setupExpandCollapse = (
  container: HTMLDivElement,
  expandableContent: HTMLDivElement,
  expandButton: HTMLButtonElement,
  config: ExpandableConfig,
): void => {
  expandButton.onclick = e => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrentlyExpanded = container.classList.contains('expanded');
    const expandIcon = expandButton.querySelector('svg path');

    if (isCurrentlyExpanded) {
      // Collapse
      container.classList.remove('expanded');

      // Get current computed height including padding
      const currentHeight = expandableContent.scrollHeight;
      expandableContent.style.maxHeight = currentHeight + 'px';
      expandableContent.offsetHeight; // Force reflow

      requestAnimationFrame(() => {
        expandableContent.style.maxHeight = '0px';
        expandableContent.style.opacity = '0';
        expandableContent.style.paddingTop = '0';
        expandableContent.style.paddingBottom = '0';

        if (expandIcon) {
          expandIcon.setAttribute('d', 'M8 10l4 4 4-4');
        }
        expandButton.title = config.expandTitle;
      });
    } else {
      // Expand
      container.classList.add('expanded');
      expandableContent.style.display = 'block';
      expandableContent.style.maxHeight = '0px';
      expandableContent.style.opacity = '0';
      expandableContent.style.paddingTop = '0';
      expandableContent.style.paddingBottom = '0';

      // Calculate target height with padding
      const targetHeight = expandableContent.scrollHeight + 24; // 12px top + 12px bottom padding

      requestAnimationFrame(() => {
        expandableContent.style.maxHeight = targetHeight + 'px';
        expandableContent.style.opacity = '1';
        expandableContent.style.paddingTop = '12px';
        expandableContent.style.paddingBottom = '12px';

        if (expandIcon) {
          expandIcon.setAttribute('d', 'M16 14l-4-4-4 4');
        }
        expandButton.title = config.collapseTitle;
      });
    }
  };
};

/**
 * Creates a themed container with consistent setup
 */
const createThemedContainer = (className: string, blockId: string): HTMLDivElement => {
  const container = document.createElement('div');
  container.className = className;
  container.setAttribute('data-block-id', blockId);
  container.style.width = '100%';
  container.style.boxSizing = 'border-box';

  // Apply theme class
  if (CONFIG.useHostTheme) {
    applyThemeClass(container);
    if (isDarkTheme()) {
      container.classList.add('theme-dark');
    } else {
      container.classList.add('theme-light');
    }
  }

  return container;
};

/**
 * Replaces the content of a block with new content
 */
const replaceBlockContent = (block: HTMLElement, newContent: HTMLElement): void => {
  while (block.firstChild) {
    block.removeChild(block.firstChild);
  }
  block.appendChild(newContent);
};

/**
 * Renders a system message box
 *
 * @param block HTML element to render the system message in
 * @param content The system message content
 */
const renderSystemMessageBox = (block: HTMLElement, content: string): void => {
  try {
    // Generate a unique ID for this block
    const blockId = `system-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    block.setAttribute('data-block-id', blockId);

    // Create container
    const systemContainer = createThemedContainer('function-block system-message-container', blockId);

    // Create header and expand button
    const config: ExpandableConfig = {
      blockId,
      className: 'system-message-container',
      headerText: 'MCP SuperAssistant',
      expandTitle: 'Expand system message',
      collapseTitle: 'Collapse system message',
    };

    const { header, expandButton } = createExpandableHeader(config);
    const expandableContent = createExpandableContent();
    const contentArea = createThemedContentArea('param-value system-message-content');

    // Fix border style for system messages
    if (isDarkTheme()) {
      contentArea.style.border = 'solid rgba(255, 255, 255, 0.1)';
    } else {
      contentArea.style.border = 'solid rgba(0, 0, 0, 0.1)';
    }

    // Add the system message content with proper newline handling
    // Force proper text formatting to override any website CSS
    contentArea.style.whiteSpace = 'pre-wrap';
    contentArea.style.wordBreak = 'break-word';
    contentArea.style.overflowWrap = 'break-word';
    contentArea.style.fontFamily =
      'var(--font-system), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    contentArea.textContent = content;
    expandableContent.appendChild(contentArea);

    // Setup expand/collapse functionality
    setupExpandCollapse(systemContainer, expandableContent, expandButton, config);

    // Add components to container
    systemContainer.appendChild(header);
    systemContainer.appendChild(expandableContent);

    // Replace the original block with our rendered version
    replaceBlockContent(block, systemContainer);
  } catch (e) {
    console.error('[renderSystemMessageBox] Error rendering system message:', e);
  }
};

/**
 * Renders different content types in the function result
 */
const renderFunctionResultContent = (resultContent: string, contentArea: HTMLDivElement): void => {
  try {
    const jsonResult = JSON.parse(resultContent);

    // If it's JSON and has content array, render it properly
    if (jsonResult && jsonResult.content && Array.isArray(jsonResult.content)) {
      // Render each content item
      jsonResult.content.forEach((item: any) => {
        if (item.type === 'text') {
          const textDiv = document.createElement('div');
          textDiv.className = 'function-result-text';
          textDiv.style.margin = '0 0 10px 0';
          textDiv.style.whiteSpace = 'pre-wrap';
          textDiv.style.wordBreak = 'break-word';
          textDiv.textContent = item.text;
          contentArea.appendChild(textDiv);
        } else if (item.type === 'image' && item.url) {
          const imgContainer = document.createElement('div');
          imgContainer.className = 'function-result-image';
          imgContainer.style.margin = '10px 0';

          const img = document.createElement('img');
          img.src = item.url;
          img.alt = item.alt || 'Image';
          img.style.maxWidth = '100%';
          img.style.borderRadius = '4px';

          imgContainer.appendChild(img);
          contentArea.appendChild(imgContainer);
        } else if (item.type === 'code' && item.code) {
          const codeContainer = document.createElement('div');
          codeContainer.className = 'function-result-code';
          codeContainer.style.margin = '10px 0';
          codeContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          codeContainer.style.borderRadius = '4px';
          codeContainer.style.padding = '10px';

          const pre = document.createElement('pre');
          pre.style.margin = '0';
          pre.style.whiteSpace = 'pre-wrap';
          pre.style.wordBreak = 'break-word';
          pre.style.fontFamily = 'monospace';
          pre.textContent = item.code;

          codeContainer.appendChild(pre);
          contentArea.appendChild(codeContainer);
        } else {
          // For unknown types, just render as JSON
          const unknownDiv = document.createElement('div');
          unknownDiv.className = 'function-result-unknown';
          unknownDiv.style.margin = '5px 0';
          unknownDiv.style.fontFamily = 'monospace';
          unknownDiv.style.fontSize = '12px';
          unknownDiv.textContent = JSON.stringify(item, null, 2);
          contentArea.appendChild(unknownDiv);
        }
      });
    } else {
      // If it's JSON but not in the expected format, format it nicely
      const pre = document.createElement('pre');
      pre.style.margin = '0';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.style.fontFamily = 'monospace';
      pre.textContent = JSON.stringify(jsonResult, null, 2);
      contentArea.appendChild(pre);
    }
  } catch (e) {
    // If not JSON, just display as text with proper line breaks
    contentArea.style.whiteSpace = 'pre-wrap';
    contentArea.style.wordBreak = 'break-word';
    contentArea.textContent = resultContent;
  }
};

/**
 * Creates a complete expandable block with header and content
 */
const createExpandableBlock = (config: ExpandableConfig, contentArea: HTMLDivElement): HTMLDivElement => {
  const container = createThemedContainer('function-block ' + config.className, config.blockId);
  const { header, expandButton } = createExpandableHeader(config);
  const expandableContent = createExpandableContent();

  expandableContent.appendChild(contentArea);
  setupExpandCollapse(container, expandableContent, expandButton, config);

  container.appendChild(header);
  container.appendChild(expandableContent);

  return container;
};

/**
 * Main function to render a function result block
 *
 * @param block HTML element containing a function result
 * @param isProcessingRef Reference to processing state
 * @returns Boolean indicating whether rendering was successful
 */
export const renderFunctionResult = (block: HTMLElement, isProcessingRef: { current: boolean }): boolean => {
  try {
    // Skip if already processed
    if (processedResultElements.has(block)) {
      return false;
    }

    // Mark as processed to avoid duplicate processing
    processedResultElements.add(block);

    // Get the content of the block
    // let content = block.textContent || '';
    let content = block.textContent || '';

    // Check if it contains MCP SuperAssistant system message tags
    if (content.includes('<SYSTEM>') || content.includes('</SYSTEM>') || content.includes('<system>') || content.includes('</system>')) {
      // Extract content between SYSTEM tags
      const systemMatch = content;
      if (systemMatch) {
        const systemContent = systemMatch.trim();
        renderSystemMessageBox(block, systemContent);
        return true;
      }
    }

    // Check if it's a function result
    if (!content.includes('<function_result') && !content.includes('</function_result>')) {
      return false;
    }

    // Generate a unique ID for this block
    const blockId = `result-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    block.setAttribute('data-block-id', blockId);
    

    // Parse the function result content
    let resultContent = '';
    try {
      // Extract content between function_result tags
      const resultMatch = content.match(/<function_result[^>]*>([\s\S]*?)<\/function_result>/);
      if (resultMatch && resultMatch[1]) {
        resultContent = resultMatch[1].trim();
      }

      // Extract call_id if available
      const callIdMatch = content.match(/call_id="([^"]*)"/);
      const callId = callIdMatch ? callIdMatch[1] : '';

      // Create configuration for expandable block
      const config: ExpandableConfig = {
        blockId,
        className: 'function-result-container',
        headerText: 'Function Result',
        expandTitle: 'Expand function result',
        collapseTitle: 'Collapse function result',
        callId,
      };

      // Create content area and render content
      const contentArea = createThemedContentArea('param-value function-result-content');
      renderFunctionResultContent(resultContent, contentArea);

      // Create the complete expandable block
      const resultContainer = createExpandableBlock(config, contentArea);

      // Replace the original block with our rendered version
      replaceBlockContent(block, resultContainer);

      // Store the rendered block for future reference
      renderedFunctionResults.set(blockId, resultContainer);

      return true;
    } catch (e) {
      console.error('Error parsing function result:', e);
      return false;
    }
  } catch (e) {
    console.error('Error rendering function result:', e);
    return false;
  } finally {
    // Reset processing state
    isProcessingRef.current = false;
  }
};
