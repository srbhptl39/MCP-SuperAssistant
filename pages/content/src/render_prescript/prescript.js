import { getCMContent } from '@src/utils/helpers';

(() => {
  // Configurable options
  const CONFIG = {
    // List of known code language identifiers
    knownLanguages: [
      'xml',
      'html',
      'python',
      'javascript',
      'js',
      'ruby',
      'bash',
      'shell',
      'css',
      'json',
      'java',
      'c',
      'cpp',
      'csharp',
      'php',
      'typescript',
      'ts',
      'go',
      'rust',
      'swift',
      'kotlin',
      'sql',
    ],
    // Whether to try to handle language identifiers in pre blocks
    handleLanguageTags: true,
    // Maximum lines to check for function calls after a language tag
    maxLinesAfterLangTag: 3,
    // Whether to use direct monitoring for streaming content
    enableDirectMonitoring: true,
    // Selectors for containers that might contain streaming content
    streamingContainerSelectors: ['.message-content', '.chat-message', '.message-body', '.message'],
    // Update throttle to prevent too frequent updates (in ms)
    updateThrottle: 25, // Reducing throttle time to make updates appear more responsive
    // More responsive monitoring for streaming content
    streamingMonitoringInterval: 100, // Interval for checking streaming content in ms
    // Enhanced options for large content streams
    largeContentThreshold: Number.MAX_SAFE_INTEGER, // Character count to consider content "large" - set to max to never truncate
    progressiveUpdateInterval: 250, // Interval to forcefully update large content in ms
    maxContentPreviewLength: Number.MAX_SAFE_INTEGER, // Maximum length to show for previewing large content - set to max to show all
    // Smooth rendering options
    usePositionFixed: false, // Use position: fixed during updates for smoother appearance - disabled to prevent zoom issues
    stabilizeTimeout: 500, // Time to wait before restoring normal positioning (ms)
    // Debug mode for logging
    debug: false,
  };

  // Create and inject styles with dark mode support
  const style = document.createElement('style');
  style.textContent = `
      /* Light mode styles */
      .function-block {
        background: #ffffff;
        margin: 15px 0;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
        transition: background-color 0.3s, color 0.3s;
      }
      
      /* Style for stabilized blocks during updates */
      .function-block-stabilized {
        position: fixed !important;
        z-index: 1000 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        transition: none !important; /* Disable transitions during stabilization */
      }
      
      .function-name {
        color: #1a73e8;
        font-weight: bold;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        font-size: 16px;
      }
      .call-id {
        color: #5f6368;
        font-weight: normal;
        font-size: 0.9em;
      }
      .param-name {
        color: #202124;
        font-weight: 500;
        margin-top: 10px;
        margin-bottom: 4px;
      }
      .param-value {
        background-color: #f1f3f4;
        padding: 10px;
        border-radius: 6px;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        white-space: pre-wrap;
        overflow-x: auto;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        max-height: 300px;
        overflow-y: auto;
        scrollbar-width: thin;
        position: relative;
        pointer-events: auto !important; /* Ensure scrolling works during updates */
      }
      
      /* Styles for large content */
      .large-content {
        position: relative;
      }
      
      .large-content::after {
        content: "";
        display: none; /* Hide the streaming indicator */
      }
      
      .content-truncated {
        display: none; /* Hide the truncation notice */
      }
      
      /* Code display improvements */
      .param-value[data-param-name="content"] {
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      .param-value[data-param-name="content"] > pre {
        margin: 0;
        padding: 10px;
        overflow-x: auto;
        overflow-y: auto;
        max-height: 300px;
        flex: 1;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        background-color: inherit;
        color: inherit;
        border: none;
      }
      
      /* Streaming parameter styles */
      .streaming-param-name {
        position: relative;
        padding-left: 14px;
      }
      
      .streaming-param-name:before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #1a73e8;
        animation: pulse 1.5s infinite ease-in-out;
      }
      
      .incomplete-tag {
        border-left: 3px dashed #1a73e8 !important;
        background-color: #e8f0fe !important;
      }
      
      .raw-toggle {
        background: #f8f9fa;
        border: 1px solid #dadce0;
        color: #1a73e8;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        margin-top: 8px;
      }
      .language-tag {
        display: inline-block;
        background: #e8f0fe;
        color: #1a73e8;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        margin-bottom: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      /* Dark mode styles */
      @media (prefers-color-scheme: dark) {
        .function-block {
          background: #292a2d;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          color: #e8eaed;
        }
        .function-name {
          color: #8ab4f8;
        }
        .call-id {
          color: #9aa0a6;
        }
        .param-name {
          color: #e8eaed;
        }
        .param-value {
          background-color: #202124;
          color: #e8eaed;
          border: 1px solid #3c4043;
        }
        .raw-toggle {
          background: #3c4043;
          border: 1px solid #5f6368;
          color: #8ab4f8;
        }
        .language-tag {
          background: #353639;
          color: #8ab4f8;
        }
        .streaming-param-name:before {
          background-color: #8ab4f8;
        }
        .incomplete-tag {
          border-left: 3px dashed #8ab4f8 !important;
          background-color: #353639 !important;
        }
        .content-truncated {
          background: rgba(138, 180, 248, 0.1);
          color: #8ab4f8;
        }
        .large-content::after {
          color: #8ab4f8;
        }
      }
      
      /* Scrollbar styling */
      .param-value::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .param-value::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 4px;
      }
      .param-value::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }
      @media (prefers-color-scheme: dark) {
        .param-value::-webkit-scrollbar-thumb {
          background: #5f6368;
        }
        .param-value::-webkit-scrollbar-thumb:hover {
          background: #7e868c;
        }
      }
      
      /* Spinner styles */
      .function-spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        margin-left: 10px;
        border: 2px solid rgba(0, 0, 0, 0.1);
        border-top-color: #1a73e8;
        border-radius: 50%;
        animation: spinner 1s linear infinite;
        transform-origin: center center;
        will-change: transform;
        backface-visibility: hidden;
        perspective: 1000px;
        transition: none !important;
      }
      
      @keyframes spinner {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      @media (prefers-color-scheme: dark) {
        .function-spinner {
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: #8ab4f8;
        }
      }
      
      .function-loading {
        opacity: 1.0; /* Changed from 0.7 to remove grey appearance */
      }
      
      /* Parameter streaming animation */
      .param-streaming {
        border-left: 3px solid #1a73e8;
        animation: pulse 1.5s infinite ease-in-out;
      }
      
      @keyframes pulse {
        0% { border-left-color: rgba(26, 115, 232, 0.5); }
        50% { border-left-color: rgba(26, 115, 232, 1); }
        100% { border-left-color: rgba(26, 115, 232, 0.5); }
      }
      
      @media (prefers-color-scheme: dark) {
        .param-streaming {
          border-left: 3px solid #8ab4f8;
          animation: pulse-dark 1.5s infinite ease-in-out;
        }
        
        @keyframes pulse-dark {
          0% { border-left-color: rgba(138, 180, 248, 0.5); }
          50% { border-left-color: rgba(138, 180, 248, 1); }
          100% { border-left-color: rgba(138, 180, 248, 0.5); }
        }
      }
      
      /* Style for HTML content being rendered inside a streaming parameter */
      .param-value[data-param-name="content"][data-streaming="true"] {
        white-space: normal;
        line-height: 1.5;
        font-family: inherit;
        scroll-behavior: smooth;
        overflow-y: auto !important;
        max-height: 300px !important;
      }
      
      /* Improve scrolling behavior for content parameters */
      .param-value[data-param-name="content"] > pre {
        margin: 0;
        padding: 10px;
        overflow-x: auto;
        overflow-y: auto;
        max-height: none !important; /* Let the parent control max-height */
        flex: 1;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        background-color: inherit;
        color: inherit;
        border: none;
        min-height: 30px; /* Ensure there's always some content space */
      }
    `;
  document.head.appendChild(style);

  // Helper functions
  const decodeHtml = html => {
    const txt = document.createElement('textarea');
    txt.textContent = html;
    return txt.value;
  };

  const formatOsascript = cmd => {
    return cmd.replace(/\s-e\s'/g, "\n    -e '").replace(/osascript/, 'osascript\n   ');
  };

  // Safe method to update content without using innerHTML
  const safelySetContent = (element, content, isHtml = false) => {
    try {
      if (element.getAttribute('data-param-name') === 'content') {
        // For content parameters, ensure a <pre> element exists
        let preElement = element.querySelector('pre');
        if (!preElement) {
          // If not, clear and create it (needed for initial set or full replacement)
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
          preElement = document.createElement('pre');
          // Apply necessary styles from original function if needed (e.g., font, line-height)
          // You might want to copy relevant styles from the CSS or apply classes
          preElement.style.fontFamily = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
          preElement.style.fontSize = '13px';
          preElement.style.lineHeight = '1.5';
          preElement.style.whiteSpace = 'pre-wrap';
          preElement.style.backgroundColor = 'inherit'; // Inherit from parent .param-value
          preElement.style.color = 'inherit';
          preElement.style.border = 'none';
          preElement.style.margin = '0';
          preElement.style.padding = '10px'; // Keep padding inside pre
          preElement.style.overflowX = 'auto'; // Allow horizontal scroll if needed
          preElement.style.overflowY = 'auto'; // Allow vertical scroll if needed
          preElement.style.flex = '1'; // Allow flex sizing if parent is flex
          preElement.style.minHeight = '30px'; // Keep min height
          element.appendChild(preElement);
          // Ensure parent has necessary styles for flex layout
          element.style.display = 'flex';
          element.style.flexDirection = 'column';
          element.style.padding = '0'; // Padding is now on the inner pre
          element.style.overflow = 'hidden'; // Parent controls overflow mainly via max-height
        }

        // Set the full content for initial render or non-incremental updates
        preElement.textContent = content;
        element.setAttribute('data-rendered-length', (content || '').length); // Initialize/reset length

        // Re-add truncated indicator logic if needed (currently commented out)
        // ...

        // Special handling for content scrolling (keep this logic)
        if (element.hasAttribute('data-streaming')) {
          const forceScrollToBottom = () => {
            if (preElement && element) {
              // Scroll the outer container based on the inner pre's scroll height
              element.scrollTop = preElement.scrollHeight;
            }
          };
          // Use timeouts to ensure scrolling happens after rendering
          setTimeout(forceScrollToBottom, 0);
          setTimeout(forceScrollToBottom, 50);
          setTimeout(forceScrollToBottom, 100); // Keep multiple for reliability
        }
      } else {
        // For other parameters, use textContent directly on the element
        element.textContent = content;
        element.removeAttribute('data-rendered-length'); // Clear attribute for non-content params

        // Auto-scroll if this is a streaming parameter with auto-scroll enabled
        if (element.hasAttribute('data-streaming') && element._autoScrollToBottom) {
          setTimeout(element._autoScrollToBottom, 0); // Use the existing scroll function if defined
        }
      }
    } catch (e) {
      console.error('Error setting content:', e);
      // Fallback to a safer approach
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      element.appendChild(document.createTextNode(content || '')); // Ensure content is not undefined
      element.removeAttribute('data-rendered-length');

      // Try auto-scroll even in error case
      if (element.hasAttribute('data-streaming')) {
        setTimeout(() => {
          element.scrollTop = element.scrollHeight;
        }, 0);
      }
    }
  };

  // Track current partial parameter state
  const partialParameterState = new Map();

  // Track content length for large parameter streaming
  const streamingContentLengths = new Map();
  let progressiveUpdateTimer = null;

  // Extract parameters with better handling of HTML content and support for partial parameters
  const extractParameters = (content, blockId = null) => {
    const parameters = [];
    // More permissive regex to catch partial parameter tags - enhanced to detect incomplete tags
    const regex = /<parameter\s+name="([^"]+)"(?:[^>]*?)(?:>|$)/g;
    const partialParams = blockId ? partialParameterState.get(blockId) || {} : {};

    let match;
    let lastIndex = 0;
    const newPartialState = {};

    while ((match = regex.exec(content)) !== null) {
      const paramName = match[1];
      const fullMatch = match[0];
      const startPos = match.index + fullMatch.length;

      // Check if this is an incomplete parameter tag (no closing '>')
      const isIncompleteTag = !fullMatch.endsWith('>');

      if (isIncompleteTag) {
        // It's a parameter tag that's still being typed out
        // Store the partial content after the parameter name
        const partialContent = content.substring(startPos);

        newPartialState[paramName] = partialContent;

        // Add the partial parameter to the result
        parameters.push({
          name: paramName,
          value: decodeHtml(partialContent),
          isComplete: false,
          isNew: !partialParams[paramName] || partialParams[paramName] !== partialContent,
          isStreaming: true, // Mark as currently streaming
          originalContent: partialContent, // Store original unescaped content for HTML rendering
          isIncompleteTag: true, // Flag indicating the tag itself is incomplete
        });
        continue;
      }

      // Find the correct closing tag by tracking nesting level
      let endPos = startPos;
      let nestLevel = 1;
      let foundEnd = false;

      // Start searching from where the parameter opening tag ends
      for (let i = startPos; i < content.length; i++) {
        // More permissive pattern matching for nested parameters
        if (content.substr(i).match(/^<parameter[\s>]/)) {
          nestLevel++;
          i += 10; // Skip ahead to avoid re-matching
        } else if (content.substr(i).match(/^<\/parameter>/)) {
          nestLevel--;
          if (nestLevel === 0) {
            endPos = i;
            foundEnd = true;
            break;
          }
          i += 11; // Skip ahead to avoid re-matching
        }
      }

      if (foundEnd) {
        // Complete parameter
        const paramValue = content.substring(startPos, endPos);

        // Track content length for large parameters
        if (blockId && paramValue.length > CONFIG.largeContentThreshold) {
          streamingContentLengths.set(`${blockId}-${paramName}`, paramValue.length);
        }

        parameters.push({
          name: paramName,
          value: decodeHtml(paramValue),
          isComplete: true,
        });
        lastIndex = endPos + 12; // Update the last index position
      } else {
        // Partial parameter - keep tracking it
        const partialValue = content.substring(startPos);
        newPartialState[paramName] = partialValue;

        // For large streaming content, track length changes to detect streaming progress
        if (blockId) {
          const key = `${blockId}-${paramName}`;
          const prevLength = streamingContentLengths.get(key) || 0;
          const newLength = partialValue.length;

          // Store current length for future comparison
          streamingContentLengths.set(key, newLength);

          // Check if content has grown significantly
          const isLargeContent = newLength > CONFIG.largeContentThreshold;
          const hasGrown = newLength > prevLength;
          const isNew = !partialParams[paramName] || partialParams[paramName] !== partialValue;

          // For large streaming content, limit what we extract to avoid memory issues
          let displayValue = '';
          let originalContent = '';

          if (isLargeContent) {
            // Don't truncate content - show everything
            try {
              displayValue = decodeHtml(partialValue);
              originalContent = partialValue;
            } catch (e) {
              console.error('Error processing large content:', e);
              displayValue = `[Error processing content: ${e.message}]`;
              originalContent = displayValue;
            }
          } else {
            displayValue = decodeHtml(partialValue);
            originalContent = partialValue;
          }

          // Add the partial parameter to the result
          parameters.push({
            name: paramName,
            value: displayValue,
            isComplete: false,
            isNew: isNew || hasGrown, // Mark as new if content has grown
            isStreaming: true, // Mark as currently streaming
            originalContent: originalContent, // Limit preview for large content
            isLargeContent: isLargeContent,
            contentLength: newLength,
            truncated: isLargeContent,
          });

          // For large content that's still streaming, ensure we keep updating
          if (isLargeContent && hasGrown && !progressiveUpdateTimer) {
            startProgressiveUpdates();
          }
        } else {
          // Without a blockId, just add the parameter normally
          parameters.push({
            name: paramName,
            value: decodeHtml(partialValue),
            isComplete: false,
            isNew: !partialParams[paramName] || partialParams[paramName] !== partialValue,
            isStreaming: true,
            originalContent: partialValue,
          });
        }
      }
    }

    // Enhanced handling for streaming content detection
    // Look for partial parameter tags that might be in the process of being typed
    if (blockId && content.includes('<parameter')) {
      // Check for parameter tags that are still being formed
      const partialTagRegex = /<parameter(?:\s+name="([^"]*)")?[^>]*$/;
      const partialTagMatch = content.match(partialTagRegex);

      if (partialTagMatch) {
        // We found an incomplete parameter tag at the end of the content
        const paramName = partialTagMatch[1] || 'unnamed_parameter';

        // Store the partial tag state
        newPartialState[`__partial_tag_${Date.now()}`] = partialTagMatch[0];

        // Add a placeholder for the incomplete parameter if we have a name
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

      // Extract content after the last parameter opening tag
      const lastParamTagRegex = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*)$/i;
      const lastParamTagMatch = content.match(lastParamTagRegex);

      if (lastParamTagMatch) {
        const paramName = lastParamTagMatch[1];
        const partialContent = lastParamTagMatch[2];

        // Only process if we found content and a parameter name
        if (paramName && partialContent) {
          // Store the partial parameter content with the parameter name
          newPartialState[`__streaming_content_${paramName}`] = partialContent;

          // Check if we already processed this parameter earlier in the loop
          const existingParam = parameters.find(p => p.name === paramName);

          if (!existingParam) {
            // Add new parameter with the streaming content
            parameters.push({
              name: paramName,
              value: decodeHtml(partialContent),
              isComplete: false,
              isStreaming: true,
              originalContent: partialContent,
            });
          }
        }
      }
    }

    // Update partial state if a blockId was provided
    if (blockId) {
      partialParameterState.set(blockId, newPartialState);
    }

    return parameters;
  };

  // Check if a block contains function calls, handling language tags
  // Returns an object with more detailed information about the function call state
  const containsFunctionCalls = block => {
    var content = getCMContent(block)?.trim() || block.textContent.trim();

    const result = {
      hasFunctionCalls: false,
      isComplete: false,
      hasInvoke: false,
      hasParameters: false,
      hasClosingTags: false,
      languageTag: null,
      detectedBlockType: null,
      partialTagDetected: false,
    };

    // More permissive regex patterns for detecting partial XML tags
    const functionCallsPattern = /<func(?:tion_calls)?(?:\s|>)/i;
    const invokePattern = /<inv(?:oke)?(?:\s|>)/i;
    const parameterPattern = /<param(?:eter)?(?:\s|>)/i;
    const closingFunctionCallsPattern = /<\/func(?:tion_calls)?>/i;

    // Direct check for function_calls tag (complete or partial)
    if (functionCallsPattern.test(content)) {
      result.hasFunctionCalls = true;
      result.detectedBlockType = 'function_calls';

      // Check for partial tag detection
      if (!content.includes('<function_calls>') && !content.includes('<function_calls>')) {
        result.partialTagDetected = true;
      }

      // Check for invoke tag (complete or partial)
      if (invokePattern.test(content)) {
        result.hasInvoke = true;

        // Check for parameters (complete or partial)
        if (parameterPattern.test(content)) {
          result.hasParameters = true;
        }

        // Check for closing tags
        if (closingFunctionCallsPattern.test(content)) {
          result.hasClosingTags = true;
          result.isComplete = true;
        }
      }
    }

    // Check with language tags if enabled
    if (CONFIG.handleLanguageTags && !result.hasFunctionCalls) {
      const lines = content.split('\n');
      if (lines.length > 1) {
        const firstLine = lines[0].trim();

        // If first line is a known language identifier
        if (CONFIG.knownLanguages.includes(firstLine.toLowerCase())) {
          result.languageTag = firstLine.toLowerCase();

          // Check next few lines for function calls (complete or partial)
          for (let i = 1; i < Math.min(lines.length, CONFIG.maxLinesAfterLangTag + 1); i++) {
            if (functionCallsPattern.test(lines[i])) {
              result.hasFunctionCalls = true;
              result.detectedBlockType = 'function_calls';

              // Check for partial tag detection
              if (!lines[i].includes('<function_calls>') && !lines[i].includes('<function_calls>')) {
                result.partialTagDetected = true;
              }

              // Check for invoke tag (complete or partial)
              if (invokePattern.test(content)) {
                result.hasInvoke = true;

                // Check for parameters (complete or partial)
                if (parameterPattern.test(content)) {
                  result.hasParameters = true;
                }

                // Check for closing tags
                if (closingFunctionCallsPattern.test(content)) {
                  result.hasClosingTags = true;
                  result.isComplete = true;
                }
              }

              break;
            }
          }
        }
      }
    }

    return result;
  };

  // Extract possible language tag from content
  const extractLanguageTag = content => {
    const lines = content.split('\n');
    if (lines.length > 0) {
      // Handle case where language is at start of first line with no newline
      const firstLine = lines[0].trim();
      for (const lang of CONFIG.knownLanguages) {
        if (firstLine.startsWith(lang)) {
          // Return the content without the language tag
          return {
            tag: lang,
            content: firstLine.substring(lang.length) + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : ''),
          };
        }
      }
    }
    return { tag: null, content };
  };

  // Track processed elements to avoid infinite loops
  const processedElements = new WeakSet();

  // Flag to prevent concurrent processing
  let isProcessing = false;

  // Map to track blocks that are being progressively updated
  const progressiveBlocks = new Map();

  // Map to track rendered function blocks by their ID
  const renderedFunctionBlocks = new Map();

  // Main rendering function with support for progressive updates
  const renderFunctionCall = block => {
    // Get detailed function call information
    const functionInfo = containsFunctionCalls(block);

    if (!block || !functionInfo.hasFunctionCalls || block.closest('.function-block')) {
      return false;
    }

    // Check if this is a block we're already tracking for progressive updates
    const blockId =
      block.getAttribute('data-block-id') || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let existingDiv = renderedFunctionBlocks.get(blockId);
    let isNewRender = false; // Flag to track if we're creating or updating
    let previousCompletionStatus = null; // Track previous completion status

    // If we've seen this block before, find its rendered div
    if (processedElements.has(block)) {
      if (!existingDiv) {
        // Try to find it in the DOM if not in map (e.g., after page reload/script re-run)
        const existingDivs = document.querySelectorAll(`.function-block[data-block-id="${blockId}"]`);
        if (existingDivs.length > 0) {
          existingDiv = existingDivs[0];
          renderedFunctionBlocks.set(blockId, existingDiv); // Re-add to map
        } else {
          // Original block exists, but rendered div is gone. Treat as new render.
          processedElements.delete(block); // Remove from processed to allow re-creation
        }
      }
    }

    if (!existingDiv) {
      isNewRender = true;
      // Mark as processed and set block ID
      if (!processedElements.has(block)) {
        processedElements.add(block);
        block.setAttribute('data-block-id', blockId);
      }
    } else {
      // Get previous completion status for comparison
      previousCompletionStatus = !existingDiv.classList.contains('function-loading');
    }

    // Store current function info for future comparisons (removed from here, handled by update logic)
    // progressiveBlocks.set(blockId, functionInfo);

    const rawContent = block.textContent.trim();
    const { tag, content } = extractLanguageTag(rawContent);

    // Create or reuse block div
    const blockDiv = existingDiv || document.createElement('div');

    if (isNewRender) {
      blockDiv.className = 'function-block';
      blockDiv.setAttribute('data-block-id', blockId);

      // Add loading class if not complete
      if (!functionInfo.isComplete) {
        blockDiv.classList.add('function-loading');
      }

      // Add language tag if found
      if (tag || functionInfo.languageTag) {
        const langTag = document.createElement('div');
        langTag.className = 'language-tag';
        langTag.textContent = tag || functionInfo.languageTag;
        blockDiv.appendChild(langTag);
      }

      // Store the new div in our map
      renderedFunctionBlocks.set(blockId, blockDiv);
    } else {
      // --- UPDATE LOGIC ---
      // Only update loading class and spinner based on completion status change
      const justCompleted = previousCompletionStatus === false && functionInfo.isComplete;
      const justBecameIncomplete = previousCompletionStatus === true && !functionInfo.isComplete; // Less likely

      if (justCompleted) {
        blockDiv.classList.remove('function-loading');
        const nameDiv = blockDiv.querySelector('.function-name');
        if (nameDiv) {
          const spinner = nameDiv.querySelector('.function-spinner');
          if (spinner) {
            spinner.remove();
          }
          // Add toggle button now that it's complete (if not already present)
          if (!blockDiv.querySelector('.raw-toggle')) {
            addRawXmlToggle(blockDiv, rawContent);
          }
        }
      } else if (justBecameIncomplete) {
        blockDiv.classList.add('function-loading');
        const nameDiv = blockDiv.querySelector('.function-name');
        if (nameDiv && !nameDiv.querySelector('.function-spinner')) {
          const spinner = document.createElement('span');
          spinner.className = 'function-spinner';
          // Try to insert after name span, fallback to end
          const nameSpan = nameDiv.querySelector('span:not(.call-id)');
          if (nameSpan && nameSpan.nextSibling) {
            nameDiv.insertBefore(spinner, nameSpan.nextSibling);
          } else {
            nameDiv.appendChild(spinner);
          }
        }
        // Remove toggle button if present
        const toggleBtn = blockDiv.querySelector('.raw-toggle');
        const originalPre = blockDiv.querySelector('pre[style*="display"]'); // Find the hidden pre
        if (toggleBtn) toggleBtn.remove();
        if (originalPre) originalPre.remove();
      }
      // --- End of Update Logic specific to completion status change ---
    }

    // Parse function call information (needed for both initial and update)
    const invokeMatch = content.match(/<invoke name="([^"]+)"(?:\s+call_id="([^"]+)")?>/);

    // --- Initial Render Logic for Name/Invoke ---
    if (isNewRender && (invokeMatch || functionInfo.hasInvoke)) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'function-name';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = invokeMatch ? invokeMatch[1] : 'Loading...';
      nameDiv.appendChild(nameSpan);

      // Add spinner for incomplete function calls
      if (!functionInfo.isComplete) {
        const spinner = document.createElement('span');
        spinner.className = 'function-spinner';
        nameDiv.appendChild(spinner);
      }

      // Add call ID if available
      if (invokeMatch && invokeMatch[2]) {
        const callIdSpan = document.createElement('span');
        callIdSpan.className = 'call-id';
        callIdSpan.textContent = `call_id: ${invokeMatch[2]}`;
        // Insert call ID before spinner if spinner exists
        const spinner = nameDiv.querySelector('.function-spinner');
        if (spinner) {
          nameDiv.insertBefore(callIdSpan, spinner);
        } else {
          nameDiv.appendChild(callIdSpan);
        }
      }
      blockDiv.appendChild(nameDiv);
    } else if (isNewRender && !invokeMatch && functionInfo.hasFunctionCalls) {
      // Show a loading message for detected but incomplete function calls (initial)
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'function-name'; // Use same class for consistency
      loadingDiv.textContent = 'Function call loading...';

      const spinner = document.createElement('span');
      spinner.className = 'function-spinner';
      loadingDiv.appendChild(spinner);

      blockDiv.appendChild(loadingDiv);
    }
    // --- End Initial Render Logic for Name/Invoke ---

    // --- Parameter Processing (Both Initial and Update) ---
    if (invokeMatch || functionInfo.hasParameters) {
      // Process if invoke OR parameters detected
      const parameters = extractParameters(content, blockId);

      // Set to keep track of parameters processed in this update cycle
      const processedParamNames = new Set();

      parameters.forEach(param => {
        if (!param || !param.name) return; // Skip invalid parameters
        processedParamNames.add(param.name);

        try {
          // Find existing parameter elements within the current blockDiv
          const existingParamName = blockDiv.querySelector(`.param-name[data-param-name="${param.name}"]`);
          let existingParamValue = blockDiv.querySelector(`.param-value[data-param-name="${param.name}"]`);

          if (existingParamName && existingParamValue) {
            // --- UPDATE EXISTING PARAMETER ---
            const paramJustCompleted = existingParamValue.hasAttribute('data-streaming') && param.isComplete;
            const paramStillStreaming = !param.isComplete;

            // Update streaming class and attribute
            if (paramStillStreaming) {
              if (!existingParamValue.classList.contains('param-streaming')) {
                existingParamValue.classList.add('param-streaming');
                existingParamValue.setAttribute('data-streaming', 'true');
                setupAutoScroll(existingParamValue); // Setup scroll and observer
              }
            } else if (paramJustCompleted) {
              existingParamValue.classList.remove('param-streaming');
              existingParamValue.removeAttribute('data-streaming');
              existingParamValue.removeAttribute('data-rendered-length'); // Clean up length attribute
              // Disconnect observer if it exists
              if (existingParamValue._autoScrollObserver) {
                existingParamValue._autoScrollObserver.disconnect();
                existingParamValue._autoScrollObserver = null; // Clear reference
              }
              if (existingParamValue._scrollTimeout) {
                clearTimeout(existingParamValue._scrollTimeout);
                existingParamValue._scrollTimeout = null;
              }
            }

            // Update large content class
            if (param.isLargeContent) {
              existingParamValue.classList.add('large-content');
              existingParamValue.setAttribute('data-content-length', param.contentLength || 'unknown');
            } else {
              existingParamValue.classList.remove('large-content');
              existingParamValue.removeAttribute('data-content-length');
            }

            // Update incomplete tag class on name
            if (param.isIncompleteTag && !existingParamName.classList.contains('streaming-param-name')) {
              existingParamName.classList.add('streaming-param-name');
              existingParamValue.classList.add('incomplete-tag'); // Add to value too
            } else if (!param.isIncompleteTag && existingParamName.classList.contains('streaming-param-name')) {
              existingParamName.classList.remove('streaming-param-name');
              existingParamValue.classList.remove('incomplete-tag'); // Add to value too
            }

            // Update content ONLY IF IT HAS CHANGED or is streaming
            if (param.isNew || paramStillStreaming) {
              const isStreamingContent = paramStillStreaming && param.name === 'content';
              const fullNewValue = (param.originalContent !== undefined ? param.originalContent : param.value) || '';

              // --- Incremental Append Logic ---
              if (isStreamingContent) {
                let preElement = existingParamValue.querySelector('pre');
                if (!preElement) {
                  // Handle case where pre might be missing (shouldn't happen with safelySetContent)
                  console.warn(`Pre element missing for streaming update on ${param.name}. Replacing fully.`);
                  safelySetContent(existingParamValue, fullNewValue);
                } else {
                  let currentRenderedLength = parseInt(
                    existingParamValue.getAttribute('data-rendered-length') || '0',
                    10,
                  );

                  if (fullNewValue.length > currentRenderedLength) {
                    const newTextPortion = fullNewValue.substring(currentRenderedLength);
                    preElement.textContent += newTextPortion; // Append only new text
                    existingParamValue.setAttribute('data-rendered-length', fullNewValue.length); // Update length

                    // Trigger auto-scroll
                    if (existingParamValue._autoScrollToBottom) {
                      setTimeout(existingParamValue._autoScrollToBottom, 0); // Use minimal timeout
                    }
                  } else if (fullNewValue.length < currentRenderedLength) {
                    // Content shrunk or changed drastically? Replace fully for safety.
                    console.warn(`Streaming content for ${param.name} shrunk. Replacing fully.`);
                    safelySetContent(existingParamValue, fullNewValue); // SafelySetContent resets length attribute
                  }
                  // If length is the same, do nothing for append logic
                }
              } else if (param.isNew) {
                // Only update non-content if it's new
                // Fallback to full replacement for non-content params, or completed params
                if (param.value && typeof param.value === 'string' && param.value.includes('osascript')) {
                  safelySetContent(existingParamValue, formatOsascript(param.value));
                } else {
                  safelySetContent(existingParamValue, fullNewValue);
                }
              }
              // --- End Incremental Append Logic ---
            }
            // --- End Update Existing Parameter ---
          } else {
            // --- CREATE NEW PARAMETER (Should only happen on initial render or rare edge cases) ---
            const paramNameDiv = document.createElement('div');
            paramNameDiv.className = 'param-name';
            paramNameDiv.textContent = param.name;
            paramNameDiv.setAttribute('data-param-name', param.name);

            if (param.isIncompleteTag) {
              paramNameDiv.classList.add('streaming-param-name');
            }
            blockDiv.appendChild(paramNameDiv);

            // Add parameter value
            const paramValueDiv = document.createElement('div');
            paramValueDiv.className = 'param-value';
            paramValueDiv.setAttribute('data-param-name', param.name);

            if (!param.isComplete) {
              paramValueDiv.classList.add('param-streaming');
              paramValueDiv.setAttribute('data-streaming', 'true');
              setupAutoScroll(paramValueDiv); // Setup scroll and observer
            }

            if (param.isIncompleteTag) {
              paramValueDiv.classList.add('incomplete-tag');
            }

            if (param.isLargeContent) {
              paramValueDiv.classList.add('large-content');
              paramValueDiv.setAttribute('data-content-length', param.contentLength || 'unknown');
            }

            // Set initial content using safelySetContent
            const initialValue = (param.originalContent !== undefined ? param.originalContent : param.value) || '';
            safelySetContent(paramValueDiv, initialValue); // Handles <pre> creation for 'content'

            blockDiv.appendChild(paramValueDiv);
            // --- End Create New Parameter ---
          }
        } catch (e) {
          console.error(`Error processing parameter ${param.name}:`, e);
        }
      }); // End forEach parameter

      // --- Clean up parameter elements that are no longer present ---
      if (!isNewRender) {
        const currentParamValueDivs = blockDiv.querySelectorAll('.param-value');
        currentParamValueDivs.forEach(pvDiv => {
          const paramName = pvDiv.getAttribute('data-param-name');
          if (!processedParamNames.has(paramName)) {
            // This parameter was in the DOM but not in the latest parse, remove it
            const pnDiv = blockDiv.querySelector(`.param-name[data-param-name="${paramName}"]`);
            if (pnDiv) pnDiv.remove();
            // Clean up observers/timeouts before removing
            if (pvDiv._autoScrollObserver) {
              pvDiv._autoScrollObserver.disconnect();
            }
            if (pvDiv._scrollTimeout) {
              clearTimeout(pvDiv._scrollTimeout);
            }
            pvDiv.remove();
            if (CONFIG.debug) console.log(`Removed stale parameter: ${paramName}`);
          }
        });
      }
      // --- End Parameter Cleanup ---
    } // End if (invokeMatch || functionInfo.hasParameters)

    // --- Add Raw XML Toggle (Only on initial render if already complete) ---
    if (isNewRender && functionInfo.isComplete) {
      addRawXmlToggle(blockDiv, rawContent);
    }
    // --- End Add Raw XML Toggle ---

    // --- Final DOM Insertion (Only on initial render) ---
    if (isNewRender) {
      // Check if the original block has a sibling that's our rendered block (e.g., from a previous script run)
      const nextSibling = block.nextSibling;
      if (
        nextSibling &&
        nextSibling.classList &&
        nextSibling.classList.contains('function-block') &&
        nextSibling.getAttribute('data-block-id') === blockId
      ) {
        // Replace the old rendered block with the new one
        nextSibling.parentNode.replaceChild(blockDiv, nextSibling);
        // Hide the original pre block
        block.style.display = 'none';
      } else {
        // First time: Hide the original pre element but keep it in the DOM
        block.style.display = 'none';
        // Insert our rendered block after the original pre
        if (block.nextSibling) {
          block.parentNode.insertBefore(blockDiv, block.nextSibling);
        } else {
          block.parentNode.appendChild(blockDiv);
        }
      }
      return true; // Indicate a new block was rendered/inserted
    } else {
      // We updated an existing div in place.
      return true; // Indicate an update happened
    }
    // --- End Final DOM Insertion ---
  };

  // Helper to add the raw XML toggle button and pre
  const addRawXmlToggle = (blockDiv, rawContent) => {
    const originalPre = document.createElement('pre');
    originalPre.style.display = 'none';
    originalPre.style.whiteSpace = 'pre-wrap'; // Ensure wrapping in raw view
    originalPre.style.maxHeight = '400px'; // Limit height
    originalPre.style.overflow = 'auto'; // Allow scrolling
    originalPre.textContent = rawContent;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'raw-toggle';
    toggleBtn.textContent = 'Show Raw XML';
    toggleBtn.onclick = () => {
      if (originalPre.style.display === 'none') {
        originalPre.style.display = 'block';
        toggleBtn.textContent = 'Hide Raw XML';
      } else {
        originalPre.style.display = 'none';
        toggleBtn.textContent = 'Show Raw XML';
      }
    };

    blockDiv.appendChild(toggleBtn);
    blockDiv.appendChild(originalPre);
  };

  // Helper to setup auto-scroll and observer for a paramValueDiv
  const setupAutoScroll = paramValueDiv => {
    // Define the scroll function
    const autoScrollToBottom = () => {
      // Check if element is still in DOM and has scrolling
      if (!document.body.contains(paramValueDiv) || paramValueDiv.scrollHeight <= paramValueDiv.clientHeight) {
        // Element removed or no scrollbar, clean up observer/timeout if they exist
        if (paramValueDiv._autoScrollObserver) {
          paramValueDiv._autoScrollObserver.disconnect();
          paramValueDiv._autoScrollObserver = null;
        }
        if (paramValueDiv._scrollTimeout) {
          clearTimeout(paramValueDiv._scrollTimeout);
          paramValueDiv._scrollTimeout = null;
        }
        return;
      }

      paramValueDiv.scrollTop = paramValueDiv.scrollHeight;
      const preElement = paramValueDiv.querySelector('pre');
      if (preElement) {
        // Scroll the inner pre as well, necessary for flex layout
        paramValueDiv.scrollTop = preElement.scrollHeight; // Scroll outer based on inner
      }
    };

    // Store the function for later use
    paramValueDiv._autoScrollToBottom = autoScrollToBottom;

    // Initial scroll to bottom
    setTimeout(autoScrollToBottom, 0);
    setTimeout(autoScrollToBottom, 50); // Add redundancy

    // Add mutation observer if not already added
    if (!paramValueDiv._autoScrollObserver) {
      paramValueDiv._autoScrollObserver = new MutationObserver(mutations => {
        // Debounce scroll updates slightly
        if (!paramValueDiv._scrollTimeout) {
          paramValueDiv._scrollTimeout = setTimeout(() => {
            if (paramValueDiv.hasAttribute('data-streaming')) {
              // Only scroll if still streaming
              autoScrollToBottom();
            }
            paramValueDiv._scrollTimeout = null;
          }, 30); // Slightly increased debounce for stability
        }
      });

      // Observe the inner pre for changes if it exists, otherwise the div itself
      const targetNode = paramValueDiv.querySelector('pre') || paramValueDiv;
      paramValueDiv._autoScrollObserver.observe(targetNode, {
        childList: true,
        characterData: true,
        subtree: true, // Need subtree if observing the div directly
      });
    }
  };

  // Process existing function call blocks with support for progressive updates
  const processFunctionCalls = () => {
    // Prevent concurrent processing
    if (isProcessing) return 0;
    isProcessing = true;

    // Temporarily disconnect observer to prevent it from reacting to our changes
    if (window.functionCallObserver) {
      window.functionCallObserver.disconnect();
    }

    try {
      // Find all pre blocks that might contain function calls
      const allPreBlocks = Array.from(document.querySelectorAll('pre'));

      // First, check for new function call blocks that haven't been processed yet
      const newFunctionCallBlocks = allPreBlocks.filter(block => {
        const functionInfo = containsFunctionCalls(block);
        return functionInfo.hasFunctionCalls && !processedElements.has(block) && !block.closest('.function-block');
      });

      // Then, check for existing blocks that might have updates
      const existingBlocks = allPreBlocks.filter(block => {
        return (
          processedElements.has(block) &&
          block.hasAttribute('data-block-id') &&
          !block.style.display === 'none' &&
          progressiveBlocks.has(block.getAttribute('data-block-id')) &&
          !progressiveBlocks.get(block.getAttribute('data-block-id')).isComplete
        );
      });

      // Also check for hidden blocks whose rendered divs might have been removed
      const hiddenBlocks = allPreBlocks.filter(block => {
        return processedElements.has(block) && block.hasAttribute('data-block-id') && block.style.display === 'none';
      });

      hiddenBlocks.forEach(block => {
        const blockId = block.getAttribute('data-block-id');
        const renderedBlock = renderedFunctionBlocks.get(blockId);

        // If we have a record of a rendered block but it's not in the DOM anymore
        if (renderedBlock && !document.contains(renderedBlock)) {
          // Reset the tracking so it gets re-rendered
          renderedFunctionBlocks.delete(blockId);
          // Make the original block visible again
          block.style.display = '';
        }
      });

      // Process all blocks (new and existing with updates)
      const blocksToProcess = [...newFunctionCallBlocks, ...existingBlocks];

      let count = 0;
      blocksToProcess.forEach(block => {
        try {
          if (renderFunctionCall(block)) count++;
        } catch (e) {
          console.error('Error rendering function call:', e);
        }
      });

      if (count > 0 && CONFIG.debug) {
        console.log(
          `Processed ${count} function call blocks (${newFunctionCallBlocks.length} new, ${existingBlocks.length} updated)`,
        );
      }

      return count;
    } catch (e) {
      console.error('Error in processFunctionCalls:', e);
      return 0;
    } finally {
      // Reconnect observer and reset processing flag
      if (window.functionCallObserver) {
        window.functionCallObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          characterDataOldValue: true,
        });
      }
      isProcessing = false;
    }
  };

  // Initial processing
  processFunctionCalls();

  // Debounce function to limit rapid successive calls
  const debounce = (func, wait) => {
    let timeout;
    return function () {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  };

  // Debounced processing function
  const debouncedProcessing = debounce(() => {
    processFunctionCalls();
  }, 100);

  // Function to check for unprocessed function calls in the document
  const checkForUnprocessedFunctionCalls = () => {
    // Find all pre blocks containing function calls that haven't been processed
    const unprocessedBlocks = Array.from(document.querySelectorAll('pre')).filter(
      block => containsFunctionCalls(block) && !processedElements.has(block) && !block.closest('.function-block'),
    );

    if (unprocessedBlocks.length > 0) {
      debouncedProcessing();
      return true;
    }
    return false;
  };

  // Set up MutationObserver to watch for new pre blocks and text changes
  window.functionCallObserver = new MutationObserver(mutations => {
    if (isProcessing) return; // Skip if we're already processing

    let shouldProcess = false;
    let hasTextChanges = false;
    let hasStreamingContainerChanges = false;
    let potentialStreamingBlocks = new Set(); // Track blocks that may be streaming content
    let removedNodes = new Set(); // Track removed nodes that we need to check

    for (const mutation of mutations) {
      // Check for childList changes (new nodes or removed nodes)
      if (mutation.type === 'childList') {
        // Check added nodes
        if (mutation.addedNodes.length > 0) {
          // Check if any added node is a pre with function calls or contains such a pre
          for (const node of mutation.addedNodes) {
            // Skip non-element nodes
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            // Check if this is a pre node with function calls
            if (
              node.nodeName === 'PRE' &&
              containsFunctionCalls(node) &&
              !processedElements.has(node) &&
              !node.closest('.function-block')
            ) {
              shouldProcess = true;
              potentialStreamingBlocks.add(node);
            }

            // Check if this contains any pre nodes with function calls
            const childPreNodes = node.querySelectorAll('pre');
            if (childPreNodes.length > 0) {
              for (const preNode of childPreNodes) {
                if (
                  containsFunctionCalls(preNode) &&
                  !processedElements.has(preNode) &&
                  !preNode.closest('.function-block')
                ) {
                  shouldProcess = true;
                  potentialStreamingBlocks.add(preNode);
                }
              }
            }

            if (!shouldProcess) {
              const isStreamingContainer = CONFIG.streamingContainerSelectors.some(
                selector => node.matches(selector) || node.querySelector(selector),
              );
              if (isStreamingContainer) {
                hasStreamingContainerChanges = true;
              }
            }

            if (shouldProcess) break;
          }
        }

        // Check if any of our rendered blocks were removed
        if (mutation.removedNodes.length > 0) {
          for (const node of mutation.removedNodes) {
            // Skip non-element nodes
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            // Check if the removed node is one of our function blocks
            if (node.classList && node.classList.contains('function-block') && node.hasAttribute('data-block-id')) {
              // Remember this block ID to check if we need to restore it
              removedNodes.add(node.getAttribute('data-block-id'));
            }

            // Also check if the removed node contains any of our function blocks
            const functionBlocks = node.querySelectorAll && node.querySelectorAll('.function-block[data-block-id]');
            if (functionBlocks && functionBlocks.length > 0) {
              for (const block of functionBlocks) {
                removedNodes.add(block.getAttribute('data-block-id'));
              }
            }
          }
        }
      }

      // Also check for characterData changes (text changes)
      if (!shouldProcess && mutation.type === 'characterData') {
        hasTextChanges = true;
      }

      if (shouldProcess) break;
    }

    // Check if we need to restore any removed blocks
    if (removedNodes.size > 0) {
      for (const blockId of removedNodes) {
        // Find the original pre element that was hidden
        const originalPre = document.querySelector(`pre[data-block-id="${blockId}"][style*="display: none"]`);
        if (originalPre) {
          // Check if the rendered function block is missing from the DOM
          const renderedBlock = renderedFunctionBlocks.get(blockId);
          if (!renderedBlock || !document.contains(renderedBlock)) {
            // Make the original pre visible again and remove from tracking
            originalPre.style.display = '';
            renderedFunctionBlocks.delete(blockId);
            // Flag that we need to process this again
            shouldProcess = true;
          }
        }
      }
    }

    // Process if we found unprocessed function calls or need to restore blocks
    if (shouldProcess) {
      debouncedProcessing();
    }
    // For text changes or streaming container changes, do more specific handling
    else if (hasTextChanges || hasStreamingContainerChanges) {
      // Process any new function call blocks that appeared
      const newFunctionBlocks = [];

      // Check for new pre blocks with function calls
      document.querySelectorAll('pre').forEach(block => {
        if (processedElements.has(block)) {
          // For already processed blocks, check if the content is still streaming
          if (block.hasAttribute('data-block-id') && block.textContent.includes('<parameter')) {
            const blockId = block.getAttribute('data-block-id');

            // Check if its rendered block is still in the DOM
            const renderedBlock = renderedFunctionBlocks.get(blockId);
            if (!renderedBlock || !document.contains(renderedBlock)) {
              // The rendered block was removed, we need to re-render
              block.style.display = '';
              renderedFunctionBlocks.delete(blockId);
              potentialStreamingBlocks.add(block);
            } else {
              // Block still exists, check if it needs an update
              const functionInfo = containsFunctionCalls(block);
              if (functionInfo.hasFunctionCalls && !functionInfo.isComplete) {
                potentialStreamingBlocks.add(block);
              }
            }
          }
          return;
        }

        const functionInfo = containsFunctionCalls(block);
        if (functionInfo.hasFunctionCalls) {
          // Set up block ID if needed
          const blockId =
            block.getAttribute('data-block-id') || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          block.setAttribute('data-block-id', blockId);
          newFunctionBlocks.push(block);

          // Set up direct monitoring for this block
          if (CONFIG.enableDirectMonitoring && !functionInfo.isComplete) {
            monitorNode(block, blockId);
          }
        }
      });

      // Process the new blocks if any were found
      if (newFunctionBlocks.length > 0 || potentialStreamingBlocks.size > 0) {
        setTimeout(() => {
          if (!isProcessing) {
            isProcessing = true;
            try {
              // First process any potential streaming blocks for better responsiveness
              potentialStreamingBlocks.forEach(block => {
                // Skip if already in newFunctionBlocks to avoid duplicate processing
                if (newFunctionBlocks.includes(block)) return;

                const functionInfo = containsFunctionCalls(block);

                // For blocks that have function calls in progress
                if (functionInfo.hasFunctionCalls) {
                  // Assign block ID if not already present
                  const blockId =
                    block.getAttribute('data-block-id') ||
                    `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  block.setAttribute('data-block-id', blockId);

                  // Process blocks that have partial tags or streaming parameters
                  if (functionInfo.partialTagDetected || !functionInfo.isComplete) {
                    try {
                      renderFunctionCall(block);
                    } catch (e) {
                      console.error('Error rendering streaming function call:', e);
                    }
                  }

                  // Set up direct monitoring if not already monitoring
                  if (CONFIG.enableDirectMonitoring && !streamingObservers.has(blockId)) {
                    monitorNode(block, blockId);
                  }
                }
              });

              // Then process any completely new blocks
              newFunctionBlocks.forEach(block => {
                try {
                  renderFunctionCall(block);
                } catch (e) {
                  console.error('Error rendering new function call:', e);
                }
              });
            } finally {
              isProcessing = false;
            }
          }
        }, 10);
      }
    }
  });

  // Start observing the document with the configured parameters
  window.functionCallObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true, // Also observe text changes
    characterDataOldValue: true, // Keep old value for comparison
  });

  // Direct monitoring of streaming content
  const streamingObservers = new Map();
  const updateQueue = new Map();
  let updateThrottleTimer = null;
  let streamingMonitorInterval = null;

  // Function to add a node to monitoring
  const monitorNode = (node, blockId) => {
    if (streamingObservers.has(blockId)) return;

    if (CONFIG.debug) console.log(`Setting up direct monitoring for block: ${blockId}`);

    // Create a mutation observer specifically for this node
    const observer = new MutationObserver(mutations => {
      // If the node is being processed, skip
      if (isProcessing) return;

      let contentChanged = false;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          contentChanged = true;
          break;
        }
      }

      if (contentChanged) {
        // Queue this node for update with throttling
        updateQueue.set(blockId, node);

        // Set up throttling to process updates
        if (!updateThrottleTimer) {
          updateThrottleTimer = setTimeout(() => {
            processUpdateQueue();
            updateThrottleTimer = null;
          }, CONFIG.updateThrottle);
        }
      }
    });

    // Start observing with a comprehensive config
    observer.observe(node, {
      characterData: true,
      childList: true,
      subtree: true,
      characterDataOldValue: true,
    });

    // Store the observer
    streamingObservers.set(blockId, observer);

    // Clean up observer when node is removed (optional, but good practice)
    // Requires a mechanism to detect when the original <pre> block is permanently removed
    // Example using MutationObserver on parent or document is complex.
    // For now, rely on manual stop or page unload.
  };

  // Helper function to stabilize a rendered function block during updates
  const stabilizeBlock = blockId => {
    if (!CONFIG.usePositionFixed) return null;

    const block = renderedFunctionBlocks.get(blockId);
    if (!block || !document.contains(block)) return null;

    // Get current position and dimensions
    const rect = block.getBoundingClientRect();

    // Store original styles
    const originalStyles = {
      position: block.style.position,
      top: block.style.top,
      left: block.style.left,
      width: block.style.width,
      height: block.style.height,
      zIndex: block.style.zIndex,
    };

    // Apply fixed positioning to keep it visually stable
    block.style.position = 'fixed';
    block.style.top = rect.top + 'px';
    block.style.left = rect.left + 'px';
    block.style.width = rect.width + 'px';
    block.style.height = rect.height + 'px';
    block.style.zIndex = '1000';
    block.classList.add('function-block-stabilized');

    // Create a placeholder to maintain document flow
    const placeholder = document.createElement('div');
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.margin = '15px 0';
    placeholder.style.opacity = '0';
    placeholder.setAttribute('data-stabilizer-for', blockId);

    // Insert placeholder
    block.parentNode.insertBefore(placeholder, block);

    return {
      block,
      placeholder,
      originalStyles,
    };
  };

  // Restore block to normal positioning
  const unstabilizeBlock = stabilizedInfo => {
    if (!stabilizedInfo) return;

    const { block, placeholder, originalStyles } = stabilizedInfo;

    // Make sure elements still exist in DOM
    if (!document.contains(block) || !document.contains(placeholder)) return;

    // Restore original styles
    Object.entries(originalStyles).forEach(([prop, value]) => {
      block.style[prop] = value;
    });

    // Remove stabilizing class
    block.classList.remove('function-block-stabilized');

    // Remove placeholder
    placeholder.parentNode.removeChild(placeholder);
  };

  // Process queued updates with stabilization for smoothness
  const processUpdateQueue = () => {
    // Optimization: Check if the nodes in the queue still exist in the DOM
    const validUpdates = new Map();
    updateQueue.forEach((node, blockId) => {
      if (document.body.contains(node)) {
        validUpdates.set(blockId, node);
      } else {
        // Node removed, clean up associated state
        if (CONFIG.debug) console.log(`Node for block ${blockId} removed, skipping update and cleaning up.`);
        const observer = streamingObservers.get(blockId);
        if (observer) {
          observer.disconnect();
          streamingObservers.delete(blockId);
        }
        // Clean up other related state if necessary (e.g., partialParameterState)
        partialParameterState.delete(blockId);
        renderedFunctionBlocks.delete(blockId); // Remove from rendered map too
        streamingContentLengths.delete(blockId); // Remove length tracking if any starts with blockId-
        // Clean up keys starting with blockId- from streamingContentLengths
        Array.from(streamingContentLengths.keys())
          .filter(key => key.startsWith(`${blockId}-`))
          .forEach(key => streamingContentLengths.delete(key));
      }
    });

    if (validUpdates.size === 0) {
      updateQueue.clear(); // Clear the original queue
      if (isProcessing) isProcessing = false; // Ensure flag is reset if we were processing
      return; // Nothing to process
    }

    // Replace the old queue with only valid nodes before processing
    updateQueue.clear();
    validUpdates.forEach((node, blockId) => updateQueue.set(blockId, node));

    if (isProcessing) return; // Check again after cleanup, maybe another process started
    isProcessing = true;

    // Map to track stabilized blocks
    const stabilizedBlocks = new Map();

    try {
      // First stabilize all blocks before updating
      if (CONFIG.usePositionFixed) {
        updateQueue.forEach((node, blockId) => {
          const stabilized = stabilizeBlock(blockId);
          if (stabilized) {
            stabilizedBlocks.set(blockId, stabilized);
          }
        });
      }

      // Process all queued updates
      updateQueue.forEach((node, blockId) => {
        if (CONFIG.debug) console.log(`Processing update for block: ${blockId}`);
        renderFunctionCall(node);
      });

      // Clear the queue
      updateQueue.clear();

      // Check if we need to continue progressive updates
      const hasLargeStreaming = Array.from(streamingContentLengths.keys()).some(
        key => streamingContentLengths.get(key) > CONFIG.largeContentThreshold,
      );

      if (hasLargeStreaming && !progressiveUpdateTimer) {
        startProgressiveUpdates();
      }
    } catch (e) {
      console.error('Error processing update queue:', e);
    } finally {
      // Restore blocks with a slight delay to ensure smooth rendering
      if (stabilizedBlocks.size > 0) {
        setTimeout(() => {
          stabilizedBlocks.forEach(stabilized => {
            unstabilizeBlock(stabilized);
          });
        }, CONFIG.stabilizeTimeout);
      }

      isProcessing = false;
    }
  };

  // Enhanced monitoring to check for streaming parameter updates periodically
  const checkStreamingUpdates = () => {
    if (isProcessing) return;

    // Find all pre blocks with function calls that might be streaming
    const preBlocks = document.querySelectorAll('pre[data-block-id]');

    preBlocks.forEach(block => {
      // Optimization: Skip checks if the block is not visible (or its rendered counterpart)
      const blockId = block.getAttribute('data-block-id');
      if (!blockId) return;
      const renderedBlock = renderedFunctionBlocks.get(blockId);
      // Check if the original block OR the rendered block exists and is likely visible
      // This is an approximation; IntersectionObserver would be more accurate but complex here.
      const isPotentiallyVisible =
        document.body.contains(block) || (renderedBlock && document.body.contains(renderedBlock));
      if (!isPotentiallyVisible) {
        // Maybe stop monitoring this block if it's persistently not visible?
        // For now, just skip the check for this iteration.
        return;
      }

      // Only check blocks that we're tracking and might have streaming content
      if (processedElements.has(block)) {
        const content = block.textContent;

        // Check for paramter tags or streaming indicators
        if (content.includes('<parameter') || content.includes('<invoke')) {
          const functionInfo = containsFunctionCalls(block);

          // If it's still in progress or has incomplete tags
          if (!functionInfo.isComplete || content.match(/<parameter[^>]*$/)) {
            // Add to update queue for processing
            updateQueue.set(blockId, block);
          }
        }
      }
    });

    // Process any updates if we found something
    if (updateQueue.size > 0 && !updateThrottleTimer) {
      updateThrottleTimer = setTimeout(() => {
        processUpdateQueue();
        updateThrottleTimer = null;
      }, CONFIG.updateThrottle);
    }
  };

  // Function for progressive updates of large streaming content
  const startProgressiveUpdates = () => {
    if (progressiveUpdateTimer) return;

    progressiveUpdateTimer = setInterval(() => {
      if (isProcessing) return;

      // Find all pre blocks with data-block-id
      const preBlocks = document.querySelectorAll('pre[data-block-id]');
      let foundLargeStreaming = false;

      preBlocks.forEach(block => {
        const blockId = block.getAttribute('data-block-id');
        if (!blockId) return;

        // Check if this block has any large streaming content
        const hasLargeContent = Array.from(streamingContentLengths.keys()).some(
          key => key.startsWith(`${blockId}-`) && streamingContentLengths.get(key) > CONFIG.largeContentThreshold,
        );

        if (hasLargeContent) {
          foundLargeStreaming = true;
          updateQueue.set(blockId, block);
        }
      });

      // If we found blocks with large streaming content, process them
      if (foundLargeStreaming && !updateThrottleTimer) {
        updateThrottleTimer = setTimeout(() => {
          processUpdateQueue();
          updateThrottleTimer = null;
        }, 10); // Use a very short delay for large content updates
      }

      // If no more large streaming content, stop the timer
      if (!foundLargeStreaming) {
        clearInterval(progressiveUpdateTimer);
        progressiveUpdateTimer = null;
      }
    }, CONFIG.progressiveUpdateInterval);
  };

  // Function to start monitoring streaming content
  const startDirectMonitoring = () => {
    if (!CONFIG.enableDirectMonitoring) return;

    // Find and monitor existing pre blocks with function calls
    const preBlocks = document.querySelectorAll('pre');
    preBlocks.forEach(block => {
      const functionInfo = containsFunctionCalls(block);
      if (functionInfo.hasFunctionCalls && !functionInfo.isComplete) {
        const blockId =
          block.getAttribute('data-block-id') || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        block.setAttribute('data-block-id', blockId);
        monitorNode(block, blockId);
      }
    });

    // Start interval for checking streaming updates
    if (!streamingMonitorInterval && CONFIG.streamingMonitoringInterval > 0) {
      streamingMonitorInterval = setInterval(checkStreamingUpdates, CONFIG.streamingMonitoringInterval);
    }

    if (CONFIG.debug) console.log('Direct monitoring started');
  };

  // Function to stop direct monitoring
  const stopDirectMonitoring = () => {
    if (CONFIG.debug) console.log('Stopping direct monitoring...'); // Added log
    streamingObservers.forEach((observer, blockId) => {
      observer.disconnect();
      if (CONFIG.debug) console.log(`Disconnected observer for block ${blockId}`); // Added log
    });
    streamingObservers.clear();
    updateQueue.clear();

    if (updateThrottleTimer) {
      clearTimeout(updateThrottleTimer);
      updateThrottleTimer = null;
    }

    if (streamingMonitorInterval) {
      clearInterval(streamingMonitorInterval);
      streamingMonitorInterval = null;
    }

    if (progressiveUpdateTimer) {
      clearInterval(progressiveUpdateTimer);
      progressiveUpdateTimer = null;
    }

    if (CONFIG.debug) console.log('Direct monitoring stopped');
  };

  // Start direct monitoring
  startDirectMonitoring();

  // Configure function to allow customizing options
  window.configureFunctionCallRenderer = options => {
    let monitoringRestart = false;

    // Force our preferred settings first
    CONFIG.usePositionFixed = false;
    CONFIG.largeContentThreshold = Number.MAX_SAFE_INTEGER;
    CONFIG.maxContentPreviewLength = Number.MAX_SAFE_INTEGER;

    if (options.knownLanguages) {
      CONFIG.knownLanguages = [...options.knownLanguages];
    }
    if (options.handleLanguageTags !== undefined) {
      CONFIG.handleLanguageTags = !!options.handleLanguageTags;
    }
    if (options.maxLinesAfterLangTag !== undefined) {
      CONFIG.maxLinesAfterLangTag = options.maxLinesAfterLangTag;
    }
    if (options.updateThrottle !== undefined) {
      CONFIG.updateThrottle = options.updateThrottle;
      monitoringRestart = true;
    }
    if (options.enableDirectMonitoring !== undefined) {
      CONFIG.enableDirectMonitoring = !!options.enableDirectMonitoring;
      monitoringRestart = true;
    }
    if (options.streamingContainerSelectors !== undefined) {
      CONFIG.streamingContainerSelectors = [...options.streamingContainerSelectors];
    }
    if (options.streamingMonitoringInterval !== undefined) {
      CONFIG.streamingMonitoringInterval = options.streamingMonitoringInterval;
      monitoringRestart = true;
    }
    if (options.largeContentThreshold !== undefined) {
      CONFIG.largeContentThreshold = options.largeContentThreshold;
    }
    if (options.progressiveUpdateInterval !== undefined) {
      CONFIG.progressiveUpdateInterval = options.progressiveUpdateInterval;
      monitoringRestart = true;
    }
    if (options.maxContentPreviewLength !== undefined) {
      CONFIG.maxContentPreviewLength = options.maxContentPreviewLength;
    }
    if (options.usePositionFixed !== undefined) {
      CONFIG.usePositionFixed = !!options.usePositionFixed;
    }
    if (options.stabilizeTimeout !== undefined) {
      CONFIG.stabilizeTimeout = options.stabilizeTimeout;
    }
    if (options.debug !== undefined) {
      CONFIG.debug = !!options.debug;
    }

    // Restart monitoring if needed
    if (monitoringRestart) {
      stopDirectMonitoring();
      if (CONFIG.enableDirectMonitoring) {
        startDirectMonitoring();
      }
    }

    console.log('Function call renderer configuration updated:', CONFIG);

    // Re-process with new configuration
    processFunctionCalls();
  };

  // Expose monitoring controls globally
  window.startFunctionCallMonitoring = startDirectMonitoring;
  window.stopFunctionCallMonitoring = stopDirectMonitoring;
  window.checkForFunctionCalls = checkForUnprocessedFunctionCalls;
  window.forceStreamingUpdate = () => {
    // Force check for streaming updates
    checkStreamingUpdates();
  };

  // Expose the processing function globally for manual triggering if needed
  window.renderFunctionCalls = processFunctionCalls;

  console.log('Function call renderer initialized with improved parameter extraction and streaming support.');
})();
