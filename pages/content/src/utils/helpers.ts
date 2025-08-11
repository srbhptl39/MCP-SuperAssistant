/**
 * Helper Utilities
 *
 * This file contains helper functions for the content script.
 * You can add your utility functions here as needed.
 */

import { CONFIG } from '@src/render_prescript/src';

/**
 * Example utility function
 * @param message The message to log
 */
export const logMessage = (message: string): void => {
  console.debug(`[Content Script]: ${message}`);
};

/**
 * Injects CSS into a Shadow DOM with proper error handling
 *
 * @param shadowRoot The Shadow DOM root to inject styles into
 * @param cssPath The path to the CSS file relative to the extension root
 * @returns Promise that resolves when the CSS is injected or rejects with an error
 */
export const injectCSSIntoShadowDOM = async (shadowRoot: ShadowRoot, cssPath: string): Promise<void> => {
  if (!shadowRoot) {
    throw new Error('Shadow root is not available for style injection');
  }

  try {
    const cssUrl = chrome.runtime.getURL(cssPath);
    logMessage(`Fetching CSS from: ${cssUrl}`);

    const response = await fetch(cssUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSS: ${response.statusText} (URL: ${cssUrl})`);
    }

    const cssText = await response.text();
    if (cssText.length === 0) {
      throw new Error('CSS content is empty');
    }

    logMessage(`Fetched CSS content (${cssText.length} bytes)`);

    const styleElement = document.createElement('style');
    styleElement.textContent = cssText;
    shadowRoot.appendChild(styleElement);

    logMessage('Successfully injected CSS into Shadow DOM');
    return Promise.resolve();
  } catch (error) {
    logMessage(`Error injecting CSS into Shadow DOM: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

/**
 * Utility for debugging Shadow DOM styling issues
 * This helps identify which styles are being properly applied
 * Only use this in development mode
 *
 * @param shadowRoot The Shadow DOM root to debug
 */
export const debugShadowDomStyles = (shadowRoot: ShadowRoot): void => {
  if (!shadowRoot) {
    logMessage('Cannot debug styles: Shadow root is null');
    return;
  }

  // Count all style elements
  const styleElements = shadowRoot.querySelectorAll('style');
  logMessage(`Shadow DOM contains ${styleElements.length} style elements`);

  // Log CSS rule count
  let totalRules = 0;
  styleElements.forEach((style, index) => {
    if (style.sheet) {
      const ruleCount = style.sheet.cssRules.length;
      totalRules += ruleCount;
      logMessage(`Style element #${index + 1} has ${ruleCount} CSS rules`);
    } else {
      logMessage(`Style element #${index + 1} has no CSS sheet attached`);
    }
  });

  logMessage(`Total CSS rules in Shadow DOM: ${totalRules}`);

  // Add a temporary visual indicator to help identify Shadow DOM boundaries
  const debugStyle = document.createElement('style');
  debugStyle.textContent = `
    :host {
      outline: 2px dashed red !important;
    }
    * {
      background-color: rgba(0, 0, 255, 0.05) !important;
    }
  `;

  shadowRoot.appendChild(debugStyle);
  logMessage('Added debug styling to Shadow DOM - will be visible for 5 seconds');

  // Remove the debug styles after 5 seconds
  setTimeout(() => {
    if (debugStyle.parentNode) {
      debugStyle.parentNode.removeChild(debugStyle);
      logMessage('Removed debug styling from Shadow DOM');
    }
  }, 5000);
};

export function getCMContent(el: Element | Node): string | null {
  // Verify element is inside a recognized CodeMirror container and has .cm-content
  if (
    !(
      (CONFIG.streamingContainerSelectors.includes('.cm-editor') ||
        CONFIG.streamingContainerSelectors.includes('.cm-gutters')) &&
      el.parentElement?.querySelector('.cm-content')
    )
  ) {
    return null;
  }

  let node = el as HTMLElement;

  // Climb DOM until reaching .cm-editor or <body>
  while (!node.matches('.cm-editor') && node !== document.body) {
    node = node.parentElement!;
  }

  if (node === document.body) {
    return null;
  }

  const element = node.querySelector('.cm-content');
  if (element == null) return null;

  // Unique ID for targeting in injected script
  const uniqueId = 'cm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  element.setAttribute('data-cm-id', uniqueId);

  // Inject script in page context to access cmView (CodeMirror internal API)
  // NOTE: Using doc.toString() here may alter formatting (line breaks/spacing).
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const el = document.querySelector('[data-cm-id="${uniqueId}"]');
      if (el && el.cmView) {
        const content = el.cmView.view?.viewState?.state?.doc?.toString();
        el.setAttribute('data-cm-text', content);
      }
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();

  // Read extracted content
  const target = document.querySelector('[data-cm-id="' + uniqueId + '"]');
  const content = target?.getAttribute('data-cm-text') || '';
  if (target) {
    target.removeAttribute('data-cm-text');
  }

  return content;
}
