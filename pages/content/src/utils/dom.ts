// DOM Utility Functions

/**
 * Creates an HTML element with specified attributes and children.
 * @param tag - The HTML tag name.
 * @param attrs - An object of attributes to set on the element.
 * @param children - An array of child nodes or strings to append.
 * @returns The created HTML element.
 */
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('DOMUtils');

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const key in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      element.setAttribute(key, attrs[key]);
    }
  }
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  logger.debug(`Created <${tag}> element.`);
  return element;
}

/**
 * Waits for an element to appear in the DOM.
 * @param selector - The CSS selector for the element.
 * @param timeout - Maximum time to wait in milliseconds.
 * @param root - The root element to search within (default: document).
 * @returns A promise that resolves with the element or null if not found within timeout.
 */
export function waitForElement(
  selector: string,
  timeout = 5000,
  root: Document | Element = document
): Promise<HTMLElement | null> {
  logger.debug(`Waiting for selector: "${selector}" with timeout ${timeout}ms.`);
  return new Promise((resolve) => {
    const startTime = Date.now();
    const observer = new MutationObserver((mutationsList, obs) => {
      const element = root.querySelector(selector) as HTMLElement | null;
      if (element) {
        obs.disconnect();
        logger.debug(`Element "${selector}" found.`);
        resolve(element);
        return;
      }
      if (Date.now() - startTime > timeout) {
        obs.disconnect();
        logger.warn(`Timeout waiting for element "${selector}".`);
        resolve(null);
      }
    });

    // Check if element already exists
    const existingElement = root.querySelector(selector) as HTMLElement | null;
    if (existingElement) {
      logger.debug(`Element "${selector}" already exists.`);
      resolve(existingElement);
      return;
    }

    observer.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Injects a CSS string into the document's head.
 * @param css - The CSS string to inject.
 * @param id - An optional ID for the style tag.
 * @returns The created style element.
 */
export function injectCSS(css: string, id?: string): HTMLStyleElement {
  const styleElement = document.createElement('style');
  if (id) {
    styleElement.id = id;
  }
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  logger.debug(`CSS injected${id ? ' with ID: ' + id : ''}.`);
  return styleElement;
}

/**
 * Observes DOM mutations on a target node.
 * @param targetNode - The node to observe.
 * @param callback - The function to call on mutations.
 * @param options - MutationObserverInit options.
 * @returns The MutationObserver instance.
 */
export function observeChanges(
  targetNode: Node,
  callback: MutationCallback,
  options: MutationObserverInit
): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, options);
  logger.debug('[Utils.observeChanges] Mutation observer started.');
  return observer;
}
