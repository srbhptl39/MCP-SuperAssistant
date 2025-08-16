/**
 * CodeMirror Content Accessor - High-Performance Real-Time Monitor
 * Event-driven monitoring with immediate updates for CodeMirror editors
 */

(function() {
  'use strict';
  
  const ATTRIBUTE_PREFIX = 'cm-editor-data-attribute';
  const POLLING_FALLBACK_INTERVAL = 200; // ms - fallback only
  
  // Function call pattern detection
  const FUNCTION_CALL_PATTERNS = [
    /<function_calls>/i,
    /<invoke\s+name=/i,
    /<function_calls>/i
  ];
  
  // Track monitored editors and their data
  const monitoredEditors = new WeakSet();
  const editorData = new WeakMap();
  const eventListeners = new WeakMap();
  const hiddenEditors = new WeakSet();
  
  let observer = null;
  let fallbackIntervalId = null;
  
  function detectFunctionCallPattern(content) {
    if (!content || typeof content !== 'string') return false;
    
    // Check for any opening XML tags that indicate function calls
    const hasOpeningTag = content.includes('<function_calls>') || 
                         content.includes('<invoke ') || 
                         content.match(/<[a-zA-Z_][a-zA-Z0-9_-]*\s*[^>]*>/);
    
    return hasOpeningTag;
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
      return;
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
    
    if (!preElement) {
      // Create new hidden pre element
      preElement = document.createElement('pre');
      preElement.id = preId;
      preElement.style.cssText = 'display: none !important; visibility: hidden !important; position: absolute !important; left: -9999px !important;';
      preElement.setAttribute('data-cm-source', uniqueId);
      
      // Insert after the cm-editor element
      cmEditor.parentNode.insertBefore(preElement, cmEditor.nextSibling);
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
        
        // Listen to CodeMirror's update events
        const updateListener = view.viewState.state.facet ? 
          view.dom.addEventListener('input', () => updateEditorDataImmediately(cmEditor), true) :
          null;
          
        if (updateListener) {
          listeners.push({ element: view.dom, event: 'input', listener: updateListener });
        }
      }
    } catch (e) {
      // Fallback to DOM events
    }
    
    // DOM-based event listeners as fallback/supplement
    const domEvents = ['input', 'keyup', 'paste', 'cut', 'change'];
    
    domEvents.forEach(eventType => {
      const listener = () => {
        // Use requestAnimationFrame for immediate but optimized updates
        requestAnimationFrame(() => updateEditorDataImmediately(cmEditor));
      };
      
      cmEditor.addEventListener(eventType, listener, true);
      listeners.push({ element: cmEditor, event: eventType, listener });
    });
    
    // Monitor for content changes in cm-content specifically
    const cmContent = cmEditor.querySelector('.cm-content');
    if (cmContent) {
      const contentListener = () => {
        requestAnimationFrame(() => updateEditorDataImmediately(cmEditor));
      };
      
      ['DOMCharacterDataModified', 'DOMSubtreeModified', 'input'].forEach(eventType => {
        cmContent.addEventListener(eventType, contentListener, true);
        listeners.push({ element: cmContent, event: eventType, listener: contentListener });
      });
    }
    
    // Store listeners for cleanup
    eventListeners.set(cmEditor, listeners);
  }
  
  function removeEditorEventListeners(cmEditor) {
    const listeners = eventListeners.get(cmEditor);
    if (!listeners) return;
    
    listeners.forEach(({ element, event, listener }) => {
      element.removeEventListener(event, listener, true);
    });
    
    eventListeners.delete(cmEditor);
  }
  
  function processEditor(cmEditor) {
    if (monitoredEditors.has(cmEditor)) {
      // Just update content for existing editors
      updateEditorDataImmediately(cmEditor);
      return;
    }
    
    // New editor found
    monitoredEditors.add(cmEditor);
    
    // Set up event listeners for real-time updates
    setupEditorEventListeners(cmEditor);
    
    // Initial content extraction
    updateEditorDataImmediately(cmEditor);
  }
  
  function scanForEditors() {
    try {
      const editors = document.querySelectorAll('.cm-editor');
      editors.forEach(processEditor);
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
                  node.querySelector?.('.cm-editor')) {
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
        
        // Check for class changes
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList?.contains('cm-editor')) {
            shouldScan = true;
          }
        }
        
        if (shouldScan) break;
      }
      
      if (shouldScan) {
        // Immediate scan for new editors
        requestAnimationFrame(scanForEditors);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  function startMonitoring() {
    // Initial scan
    scanForEditors();
    
    // Setup mutation observer for new editors
    setupMutationObserver();
    
    // Light fallback polling (much less frequent now)
    fallbackIntervalId = setInterval(scanForEditors, POLLING_FALLBACK_INTERVAL);
  }
  
  function stopMonitoring() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    if (fallbackIntervalId) {
      clearInterval(fallbackIntervalId);
      fallbackIntervalId = null;
    }
    
    // Clean up all event listeners
    for (const cmEditor of monitoredEditors) {
      removeEditorEventListeners(cmEditor);
    }
    
    // Clean up hidden pre elements
    cleanupHiddenPreElements();
  }
  
  function cleanupHiddenPreElements() {
    const hiddenPres = document.querySelectorAll('pre[id^="cm-hidden-pre-"]');
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
    getEditorData: function(editorElement) {
      const data = editorData.get(editorElement);
      return data ? data.content : null;
    },
    getAllMonitoredEditors: function() {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-monitored]'));
    },
    getHiddenPreElements: function() {
      return Array.from(document.querySelectorAll('pre[id^="cm-hidden-pre-"]'));
    },
    getPreElementByEditorId: function(uniqueId) {
      return document.getElementById(`cm-hidden-pre-${uniqueId}`);
    },
    getHiddenEditors: function() {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-hidden-function-call]'));
    },
    getFunctionCallEditors: function() {
      return Array.from(document.querySelectorAll('.cm-editor[data-cm-has-function-call]'));
    },
    hideEditor: hideEditor,
    showEditor: showEditor,
    detectFunctionCall: function(content) {
      return detectFunctionCallPattern(content);
    },
    forceUpdate: function() {
      scanForEditors();
    },
    forceUpdateEditor: function(cmEditor) {
      updateEditorDataImmediately(cmEditor);
    },
    stop: stopMonitoring,
    start: startMonitoring
  };
  
})();