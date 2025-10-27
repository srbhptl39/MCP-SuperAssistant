import type { ParamValueElement } from '../core/types';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Create a Trusted Type policy if available in the browser
 */

const logger = createLogger('DOMUtils');

let scriptSanitizerPolicy: any | null = null;
if (typeof window !== 'undefined' && (window as any).trustedTypes && (window as any).trustedTypes.createPolicy) {
  try {
    scriptSanitizerPolicy = (window as any).trustedTypes.createPolicy('scriptSanitizerPolicy', {
      createHTML: (input: string) => input,
    });
  } catch (e) {
    // Policy might already exist or creation failed
    if ((window as any).trustedTypes && (window as any).trustedTypes.policies) {
      scriptSanitizerPolicy = (window as any).trustedTypes.policies.get('scriptSanitizerPolicy') || null;
    }
    if (!scriptSanitizerPolicy && console) {
      logger.warn('Could not create or retrieve Trusted Types policy "scriptSanitizerPolicy".', e);
    }
  }
}

/**
 * Decode HTML entities in a string
 */
export const decodeHtml = (html: string): string => {
  const txt = document.createElement('textarea');
  // Use Trusted Types policy if available and successfully created
  if (scriptSanitizerPolicy) {
    // Assign TrustedHTML directly to innerHTML
    txt.innerHTML = scriptSanitizerPolicy.createHTML(html);
  } else if (typeof window !== 'undefined' && !(window as any).trustedTypes) {
    // Fallback ONLY if Trusted Types are not supported/enforced
    txt.innerHTML = html;
  } else {
    // If Trusted Types exist but policy creation failed, avoid innerHTML and log error
    logger.error('Trusted Types are enforced, but the policy creation failed. Cannot set innerHTML for decoding.');
    // Return the original string or a sanitized version, depending on requirements
    return html;
  }
  return txt.value;
};

/**
 * Format osascript commands for better readability
 */
export const formatOsascript = (cmd: string): string => {
  return cmd.replace(/\s-e\s'/g, "\n    -e '").replace(/osascript/, 'osascript\n   ');
};

/**
 * Safely set content of a DOM element
 */
export const safelySetContent = (
  element: ParamValueElement,
  content: string | null | undefined,
  isHtml = false,
): void => {
  try {
    content = content || ''; // Ensure content is not null/undefined

    // Check if the element is meant for streaming, regardless of the parameter name
    if (element.hasAttribute('data-streaming')) {
      let preElement = element.querySelector<HTMLPreElement>('pre');
      if (!preElement) {
        // Clear existing content and create the <pre> structure safely
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        preElement = document.createElement('pre');
        // Apply necessary styles for the <pre> element
        preElement.style.fontFamily = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
        preElement.style.fontSize = '13px';
        preElement.style.lineHeight = '1.5';
        preElement.style.whiteSpace = 'pre-wrap';
        preElement.style.backgroundColor = 'inherit';
        preElement.style.color = 'inherit';
        preElement.style.border = 'none';
        preElement.style.margin = '0';
        preElement.style.padding = '10px';
        preElement.style.overflowX = 'auto';
        preElement.style.overflowY = 'auto';
        preElement.style.flex = '1';
        preElement.style.minHeight = '30px'; // Ensure a minimum height
        element.appendChild(preElement);

        // Adjust the container element's styles
        element.style.display = 'flex';
        element.style.flexDirection = 'column';
        element.style.padding = '0'; // Remove padding from container, apply to pre
        element.style.overflow = 'hidden'; // Hide overflow on container
      }

      // Set the content inside the <pre> element using textContent (CSP-safe)
      preElement.textContent = content;
      element.setAttribute('data-rendered-length', String(content.length));

      // Force scroll to bottom for streaming effect
      const forceScrollToBottom = () => {
        if (preElement && element) {
          // Scroll the container, not the pre element directly for better control
          element.scrollTop = element.scrollHeight;
        }
      };
      // Use timeouts to ensure scrolling happens after rendering updates
      setTimeout(forceScrollToBottom, 0);
      setTimeout(forceScrollToBottom, 50);
      setTimeout(forceScrollToBottom, 100);
    } else {
      // Standard non-streaming content setting - always use textContent for CSP safety
      // Clear existing content first
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }

      // Set content using CSP-safe methods
      const textNode = document.createTextNode(content);
      element.appendChild(textNode);

      element.removeAttribute('data-rendered-length');
      // Remove potentially added styles if it was previously streaming
      element.style.display = '';
      element.style.flexDirection = '';
      element.style.padding = '';
      element.style.overflow = '';
      // Remove the <pre> element if it exists from a previous streaming state
      const existingPre = element.querySelector('pre');
      if (existingPre) {
        existingPre.remove();
      }
    }
  } catch (e) {
    logger.error('Error setting content:', e);
    // Fallback: Ensure content is displayed even if an error occurs
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    element.appendChild(document.createTextNode(content || ''));
    element.removeAttribute('data-rendered-length');
    // Basic scroll attempt on error during streaming
    if (element.hasAttribute('data-streaming')) {
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 0);
    }
  }
};
