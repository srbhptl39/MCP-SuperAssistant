/**
 * CodeMirror Content Accessor - High-Performance Real-Time Monitor
 * Event-driven monitoring with immediate updates for CodeMirror editors
 */

(function () {
  'use strict';

  // Prevent multiple script execution in Firefox
  if (window.CodeMirrorAccessorExecuted) {
    console.debug('[codemirror] Script already executed, skipping duplicate execution');
    return;
  }
  window.CodeMirrorAccessorExecuted = true;
  console.debug('[codemirror] Script execution started');

  const ATTRIBUTE_PREFIX = 'cm-editor-data-attribute';

  // Function call pattern detection
  const FUNCTION_CALL_PATTERNS = [
    // XML patterns
    /<function_calls>/i,
    /<invoke\s+name=/i,
    /<function_calls>/i,
    // JSON patterns
    /"type"\s*:\s*"function_call_start"/i,
    /"type"\s*:\s*"parameter"/i,
    /\{\s*"type"\s*:\s*"function_call/i
  ];

  // Track monitored editors and their data
  const monitoredEditors = new WeakSet();
  const editorData = new WeakMap();
  const eventListeners = new WeakMap();
  const hiddenEditors = new WeakSet();
  const processedMonacoBlocks = new WeakSet();

  let observer = null;

  // ============================================
  // Monaco Editor Support for Qwen
  // ============================================

  function extractMonacoContent(monacoEditor) {
    try {
      // Extract content from Monaco's view-lines structure
      const viewLines = monacoEditor.querySelectorAll('.view-lines .view-line');
      if (viewLines.length === 0) return null;

      const lines = [];
      viewLines.forEach(line => {
        // Get all text content from spans, replacing &nbsp; with regular spaces
        let lineText = '';
        const spans = line.querySelectorAll('span span');
        if (spans.length > 0) {
          spans.forEach(span => {
            lineText += span.textContent || '';
          });
        } else {
          // Fallback to direct text content
          lineText = line.textContent || '';
        }
        // Replace non-breaking spaces with regular spaces
        lineText = lineText.replace(/\u00a0/g, ' ');
        lines.push(lineText);
      });

      return lines.join('\n');
    } catch (error) {
      console.warn('[codemirror] Error extracting Monaco content:', error);
      return null;
    }
  }

  function getQwenCodeBlockLanguage(qwenBlock) {
    // Try to detect the language from the header
    const header = qwenBlock.querySelector('.qwen-markdown-code-header > div:first-child');
    if (header) {
      return header.textContent?.trim().toLowerCase() || '';
    }
    // Also check for language class on qwen-markdown-code-body
    const body = qwenBlock.querySelector('.qwen-markdown-code-body');
    if (body) {
      const classes = body.className.split(' ');
      const langClass = classes.find(c => c !== 'qwen-markdown-code-body');
      if (langClass) return langClass.toLowerCase();
    }
    return '';
  }

  function processQwenMonacoBlock(qwenBlock) {
    if (processedMonacoBlocks.has(qwenBlock)) {
      // Already processed, just update content if pre exists
      const existingPre = qwenBlock.parentNode?.querySelector('pre.qwen-monaco-extracted');
      if (existingPre) {
        const monacoEditor = qwenBlock.querySelector('.monaco-editor');
        if (monacoEditor) {
          const content = extractMonacoContent(monacoEditor);
          if (content && content !== existingPre.textContent) {
            existingPre.textContent = content;
          }
        }
      }
      return;
    }

    const monacoEditor = qwenBlock.querySelector('.monaco-editor');
    if (!monacoEditor) return;

    const content = extractMonacoContent(monacoEditor);
    if (!content) return;

    // Check if this contains function call patterns
    if (!detectFunctionCallPattern(content)) return;

    const language = getQwenCodeBlockLanguage(qwenBlock);
    const uniqueId = generateUniqueId();

    console.debug(`[codemirror] Processing Qwen Monaco block with ${language} content`);

    // Mark as processed
    processedMonacoBlocks.add(qwenBlock);

    // Hide the original qwen-markdown-code block
    qwenBlock.style.cssText = 'display: none !important; visibility: hidden !important;';
    qwenBlock.setAttribute('data-monaco-hidden-function-call', 'true');

    // Create a clean pre element with the content
    const preElement = document.createElement('pre');
    preElement.className = 'qwen-monaco-extracted';
    preElement.id = `monaco-hidden-pre-${uniqueId}`;
    preElement.style.cssText = 'display: none !important; visibility: hidden !important; position: absolute !important; left: -9999px !important;';
    preElement.setAttribute('data-monaco-source', uniqueId);
    preElement.setAttribute('data-language', language);
    preElement.setAttribute('data-cm-has-function-call', 'true');
    preElement.textContent = content;

    // Insert the pre element after the qwen block
    qwenBlock.parentNode.insertBefore(preElement, qwenBlock.nextSibling);
  }

  function scanForQwenMonacoBlocks() {
    try {
      const qwenBlocks = document.querySelectorAll('pre.qwen-markdown-code');
      if (qwenBlocks.length > 0) {
        qwenBlocks.forEach(processQwenMonacoBlock);
      }
    } catch (error) {
      console.warn('[codemirror] Error scanning Qwen Monaco blocks:', error);
    }
  }

  function detectFunctionCallPattern(content) {
    if (!content || typeof content !== 'string') return false;

    // Strip common prefixes like "jsonCopy code", "javascriptCopy", etc.
    const cleanedContent = content.replace(/^(json|javascript|js|typescript|ts|python|py|bash|sh)(\s*copy(\s+code)?)?\s*/i, '');

    // Check for XML patterns (opening tags that indicate function calls)
    const hasXMLPattern = cleanedContent.includes('<function_calls>') ||
      cleanedContent.includes('<invoke ') ||
      cleanedContent.match(/<[a-zA-Z_][a-zA-Z0-9_-]*\s*[^>]*>/);

    // Check for JSON patterns (line-by-line JSON function calls)
    const hasJSONPattern = (cleanedContent.includes('"type"') &&
      (cleanedContent.includes('function_call_start') ||
        cleanedContent.includes('function_call') ||
        cleanedContent.includes('parameter'))) ||
      cleanedContent.match(/\{\s*"type"\s*:\s*"function_call/i);

    return hasXMLPattern || hasJSONPattern;
  }

  function hideEditor(cmEditor) {
    if (hiddenEditors.has(cmEditor)) return;

    hiddenEditors.add(cmEditor);

    // Hide the editor with high priority styles
    cmEditor.style.cssText += 'display: none !important; visibility: hidden !important;';
    cmEditor.setAttribute('data-cm-hidden-function-call', 'true');

    // Also hide parent container if it looks like a function call block
    const parent = cmEditor.closest('div, section, article');
    if (parent && !parent.querySelector('.cm-editor:not([data-cm-hidden-function-call])')) {
      parent.style.cssText += 'display: none !important; visibility: hidden !important;';
      parent.setAttribute('data-cm-hidden-function-call-parent', 'true');
    }
  }

  function showEditor(cmEditor) {
    if (!hiddenEditors.has(cmEditor)) return;

    hiddenEditors.delete(cmEditor);

    // Show the editor by removing hide styles
    cmEditor.style.display = '';
    cmEditor.style.visibility = '';
    cmEditor.removeAttribute('data-cm-hidden-function-call');

    // Show parent container if hidden
    const parent = cmEditor.closest('[data-cm-hidden-function-call-parent]');
    if (parent) {
      parent.style.display = '';
      parent.style.visibility = '';
      parent.removeAttribute('data-cm-hidden-function-call-parent');
    }
  }

  function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function extractContentFromEditor(cmEditor) {
    try {
      const cmContent = cmEditor.querySelector('.cm-content');
      if (!cmContent) return null;

      // Use the exact working pattern from user's snippet
      if (cmContent.cmView?.view?.viewState?.state?.doc) {
        return cmContent.cmView.view.viewState.state.doc.toString();
      }

      // Fallback patterns
      const fallbackPatterns = [
        () => cmContent.cmView?.state?.doc?.toString(),
        () => cmEditor.cmView?.view?.viewState?.state?.doc?.toString(),
        () => cmEditor.cmView?.state?.doc?.toString()
      ];

      for (const pattern of fallbackPatterns) {
        try {
          const result = pattern();
          if (result && typeof result === 'string') {
            return result;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  function updateEditorDataImmediately(cmEditor) {
    const content = extractContentFromEditor(cmEditor);
    if (content === null) return;

    const storedData = editorData.get(cmEditor);

    // Check if content actually changed
    if (storedData && storedData.content === content) {
      return; // Skip update without logging for unchanged content
    }

    let uniqueId = storedData?.id;
    if (!uniqueId) {
      uniqueId = generateUniqueId();
    }

    // Update stored data
    editorData.set(cmEditor, { id: uniqueId, content });

    // Check for function call pattern and hide editor if detected
    const hasFunctionCall = detectFunctionCallPattern(content);
    if (hasFunctionCall) {
      hideEditor(cmEditor);
    } else {
      // Show editor if it was previously hidden but no longer has function calls
      if (hiddenEditors.has(cmEditor)) {
        showEditor(cmEditor);
      }
    }

    // Update DOM attributes immediately
    const attributeName = ATTRIBUTE_PREFIX + uniqueId;
    cmEditor.setAttribute(attributeName, content);
    cmEditor.setAttribute('data-cm-monitored', uniqueId);

    // Add function call detection attribute
    if (hasFunctionCall) {
      cmEditor.setAttribute('data-cm-has-function-call', 'true');
    } else {
      cmEditor.removeAttribute('data-cm-has-function-call');
    }

    // Update hidden pre element immediately
    updateHiddenPreElement(cmEditor, uniqueId, content);
  }

  function updateHiddenPreElement(cmEditor, uniqueId, content) {
    const preId = `cm-hidden-pre-${uniqueId}`;
    let preElement = document.getElementById(preId);

    // Additional check for Firefox: also check if any pre with this uniqueId already exists
    if (!preElement) {
      const existingPre = document.querySelector(`pre[data-cm-source="${uniqueId}"]`);
      if (existingPre) {
        preElement = existingPre;
        // Ensure it has the correct ID if missing
        if (!preElement.id) {
          preElement.id = preId;
        }
      }
    }

    if (!preElement) {
      // Double-check one more time right before creating (Firefox race condition fix)
      preElement = document.getElementById(preId);
      if (!preElement) {
        // Create new hidden pre element
        preElement = document.createElement('pre');
        preElement.id = preId;
        preElement.style.cssText = 'display: none !important; visibility: hidden !important; position: absolute !important; left: -9999px !important;';
        preElement.setAttribute('data-cm-source', uniqueId);

        // Insert after the cm-editor element
        cmEditor.parentNode.insertBefore(preElement, cmEditor.nextSibling);
      }
    }

    // Update content immediately
    preElement.textContent = content;
  }

  function setupEditorEventListeners(cmEditor) {
    if (eventListeners.has(cmEditor)) return;

    const listeners = [];

    // Try to attach to CodeMirror's native events if available
    try {
      const cmContent = cmEditor.querySelector('.cm-content');
      if (cmContent && cmContent.cmView?.view) {
        const view = cmContent.cmView.view;

        // Listen to CodeMirror's update events with debouncing
        const updateListener = () => {
          requestAnimationFrame(() => updateEditorDataImmediately(cmEditor));
        };

        // High-frequency events that need immediate response
        ['input', 'keyup', 'paste'].forEach(eventType => {
          view.dom.addEventListener(eventType, updateListener, { passive: true });
          listeners.push({ element: view.dom, event: eventType, listener: updateListener });
        });
      }
    } catch (e) {
      // Fallback to DOM events if CodeMirror API unavailable
    }

    // Optimized DOM-based event listeners
    const domEvents = ['input', 'keyup', 'paste', 'cut'];

    domEvents.forEach(eventType => {
      const listener = () => {
        requestAnimationFrame(() => updateEditorDataImmediately(cmEditor));
      };

      cmEditor.addEventListener(eventType, listener, { passive: true });
      listeners.push({ element: cmEditor, event: eventType, listener });
    });

    // Monitor for content changes in cm-content with less frequency
    const cmContent = cmEditor.querySelector('.cm-content');
    if (cmContent) {
      const contentListener = () => {
        requestAnimationFrame(() => updateEditorDataImmediately(cmEditor));
      };

      // Only use input event for content changes
      cmContent.addEventListener('input', contentListener, { passive: true });
      listeners.push({ element: cmContent, event: 'input', listener: contentListener });
    }

    // Store listeners for cleanup
    eventListeners.set(cmEditor, listeners);
  }

  function removeEditorEventListeners(cmEditor) {
    const listeners = eventListeners.get(cmEditor);
    if (!listeners) return;

    listeners.forEach(({ element, event, listener }) => {
      element.removeEventListener(event, listener);
    });

    eventListeners.delete(cmEditor);
  }

  function processEditor(cmEditor) {
    if (monitoredEditors.has(cmEditor)) {
      // Just update content for existing editors
      updateEditorDataImmediately(cmEditor);
      return;
    }

    console.debug(`[codemirror] Monitoring new editor`);
    // New editor found
    monitoredEditors.add(cmEditor);

    // Set up event listeners for real-time updates
    setupEditorEventListeners(cmEditor);

    // Initial content extraction
    updateEditorDataImmediately(cmEditor);
  }

  function scanForEditors() {
    try {
      // Scan for CodeMirror editors
      const editors = document.querySelectorAll('.cm-editor');
      if (editors.length > 0) {
        editors.forEach(processEditor);
      }

      // Also scan for Qwen Monaco blocks
      scanForQwenMonacoBlocks();
    } catch (error) {
      console.warn('CodeMirror monitor error:', error);
    }
  }

  function setupMutationObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        // Check for new nodes
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList?.contains('cm-editor') ||
                node.querySelector?.('.cm-editor') ||
                node.classList?.contains('qwen-markdown-code') ||
                node.querySelector?.('.qwen-markdown-code') ||
                node.classList?.contains('monaco-editor') ||
                node.querySelector?.('.monaco-editor')) {
                shouldScan = true;
                break;
              }
            }
          }

          // Check for removed nodes to clean up
          for (const node of mutation.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('cm-editor')) {
              removeEditorEventListeners(node);
              monitoredEditors.delete(node);
              editorData.delete(node);
            }
          }
        }

        // Check for class changes that might affect cm-editor
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList?.contains('cm-editor')) {
            shouldScan = true;
          }
        }

        // Check for content changes in existing editors
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const target = mutation.target;
          const cmEditor = target.closest?.('.cm-editor');
          if (cmEditor && monitoredEditors.has(cmEditor)) {
            // Direct content update for existing editor
            updateEditorDataImmediately(cmEditor);
          }
        }

        if (shouldScan) break;
      }

      if (shouldScan) {
        // Use requestAnimationFrame for smooth performance
        requestAnimationFrame(scanForEditors);
      }
    });

    // Enhanced observation - watch for more changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      characterData: true
    });
  }

  function startMonitoring() {
    console.debug(`[codemirror] Starting event-based monitoring`);
    // Initial scan
    scanForEditors();

    // Setup mutation observer for new editors
    setupMutationObserver();

    // No fallback polling - rely entirely on events
  }

  function stopMonitoring() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Clean up all event listeners
    for (const cmEditor of monitoredEditors) {
      removeEditorEventListeners(cmEditor);
    }

    // Clean up hidden pre elements
    cleanupHiddenPreElements();
  }

  function cleanupHiddenPreElements() {
    const hiddenPres = document.querySelectorAll('pre[id^="cm-hidden-pre-"], pre[id^="monaco-hidden-pre-"]');
    hiddenPres.forEach(pre => pre.remove());
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', stopMonitoring);

  // Start monitoring when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonitoring);
  } else {
    // DOM already loaded
    startMonitoring();
  }

  // Expose utility functions for external access
  window.CodeMirrorAccessor = {
    getEditorData: function (editorElement) {
      const data = editorData.get(editorElement);
      return data ? data.content : null;
    },
    getAllMonitoredEditors: function () {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-monitored]'));
    },
    getHiddenPreElements: function () {
      return Array.from(document.querySelectorAll('pre[id^="cm-hidden-pre-"]'));
    },
    getPreElementByEditorId: function (uniqueId) {
      return document.getElementById(`cm-hidden-pre-${uniqueId}`);
    },
    getHiddenEditors: function () {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-hidden-function-call], pre[data-monaco-hidden-function-call]'));
    },
    getFunctionCallEditors: function () {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-has-function-call], pre[data-cm-has-function-call]'));
    },
    getMonacoPreElements: function () {
      return Array.from(document.querySelectorAll('pre.qwen-monaco-extracted'));
    },
    hideEditor: hideEditor,
    showEditor: showEditor,
    detectFunctionCall: function (content) {
      return detectFunctionCallPattern(content);
    },
    forceUpdate: function () {
      scanForEditors();
    },
    forceUpdateEditor: function (cmEditor) {
      updateEditorDataImmediately(cmEditor);
    },
    forceUpdateQwenMonaco: function () {
      scanForQwenMonacoBlocks();
    },
    stop: stopMonitoring,
    start: startMonitoring
  };

})();