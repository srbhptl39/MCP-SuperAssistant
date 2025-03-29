import { useEffect, useRef } from 'react';
import { logMessage } from '@src/utils/helpers';

/**
 * Custom hook for applying and managing additional styles within Shadow DOM
 * Useful for dynamically applying styles that might not be in the injected CSS
 *
 * @param selector The CSS selector to target
 * @param cssRules The CSS rules to apply
 * @returns void
 */
export const useShadowDomStyles = (selector: string, cssRules: string): void => {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    // Find the shadow root
    const shadowHost = document.getElementById('mcp-sidebar-shadow-host');
    if (!shadowHost) {
      logMessage('Shadow host not found for style injection');
      return;
    }

    const shadowRoot = shadowHost.shadowRoot;
    if (!shadowRoot) {
      logMessage('Shadow root not available for style injection');
      return;
    }

    // Create or update style element
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      shadowRoot.appendChild(styleRef.current);
    }

    // Set the CSS content
    styleRef.current.textContent = `${selector} { ${cssRules} }`;

    return () => {
      // Clean up on unmount
      if (styleRef.current && styleRef.current.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [selector, cssRules]);
};

/**
 * Creates a function to generate class names with the Shadow DOM in mind
 * Works similarly to the cn utility but with additional Shadow DOM awareness
 *
 * @returns A function to combine class names safely for Shadow DOM usage
 */
export const useShadowDomClasses = () => {
  return (...classes: (string | boolean | undefined | null)[]): string => {
    return classes.filter(Boolean).join(' ');
  };
};
