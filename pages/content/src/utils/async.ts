// Async Utility Functions

/**
 * Debounces a function, delaying its execution until after a specified wait time has elapsed since the last call.
 * @param func - The function to debounce.
 * @param delay - The delay in milliseconds.
 * @returns A debounced version of the function.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  } as T;
}

/**
 * Throttles a function, ensuring it's called at most once within a specified time window.
 * @param func - The function to throttle.
 * @param delay - The time window in milliseconds.
 * @returns A throttled version of the function.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const remainingTime = delay - (now - lastCallTime);

    if (remainingTime <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      func.apply(this, args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        func.apply(this, args);
      }, remainingTime);
    }
  } as T;
}
