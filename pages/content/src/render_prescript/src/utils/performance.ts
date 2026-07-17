/**
 * Debounce a function to limit how often it can be called
 * @param func The function to debounce
 * @param wait Wait time in milliseconds
 * @returns A debounced version of the function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
};

/**
 * Schedule work that must run even when the tab is hidden.
 * requestAnimationFrame callbacks never fire in a backgrounded tab, which stalls
 * functional pipelines (event dispatch, execution/completion state). When hidden,
 * fall back to setTimeout (throttled to ~1s but still fires); otherwise use rAF.
 */
export const scheduleWork = (cb: () => void): void => {
  if (document.visibilityState === 'hidden') {
    setTimeout(cb, 0);
  } else {
    requestAnimationFrame(cb);
  }
};
