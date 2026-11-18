/** Tell the background a usage-statistics feature fired. The background maps the tab URL to a site enum and applies opt-out/caps. */
export function telemetry(feature: 'auto_execute' | 'chip' | 'sidebar' | 'instructions' | 'card' | 'setup_copy'): void {
  try {
    chrome.runtime.sendMessage({ type: 'telemetry', feature }).catch(() => {});
  } catch {
    // extension context invalidated (reload/update)
  }
}
