/**
 * Storage functionality for executed functions
 * This module provides utilities to store and retrieve information about executed functions
 * URL-based storage implementation with race condition prevention
 */

// Define the interface for stored function execution data
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('STORAGE_KEY');

export interface ExecutedFunction {
  functionName: string; // Name of the executed function
  callId: string; // Unique ID for the function call
  contentSignature: string; // Hash or signature of the function content
  executedAt: number; // Timestamp when the function was executed
  params: Record<string, any>; // Parameters used in the function call
  paramsOmitted?: true; // Set when params were too large to persist (dropped on store)
}

// Define the URL-based storage structure
interface URLBasedFunctionHistory {
  [url: string]: Record<string, ExecutedFunction>; // Key is functionName:callId:contentSignature
}

// Storage key for the executed functions
const STORAGE_KEY = 'mcp_url_based_function_history';

// Cleanup / growth-limiting knobs (single source of truth)
const CLEANUP = {
  TTL_MS: 14 * 24 * 60 * 60 * 1000, // entries older than 14 days
  MAX_ENTRIES_PER_URL: 50,
  MAX_ENTRIES_TOTAL: 500,
  MAX_TOTAL_BYTES: 512 * 1024, // serialized blob cap
  MAX_ENTRY_BYTES: 64 * 1024, // single record cap → params omitted
  PERIODIC_MS: 10 * 60 * 1000, // re-prune while page stays open
} as const;

// Memoized blob so completed renders don't re-parse the whole thing every time.
let memo: URLBasedFunctionHistory | null = null;

const parseFromLocalStorage = (): URLBasedFunctionHistory => {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY);
    return storedData ? JSON.parse(storedData) : {};
  } catch (error) {
    logger.error('Failed to retrieve URL-based function history:', error);
    return {};
  }
};

// Invalidate the memo when another tab writes the same key.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) memo = null;
  });
}

// Single write path: persist + keep the memo in sync.
const writeURLBasedStorage = (storage: URLBasedFunctionHistory): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  memo = storage;
};

/**
 * Store information about an executed function with race condition prevention
 *
 * @param functionName Name of the executed function
 * @param callId Unique ID for the function call
 * @param params Parameters used in the function call
 * @param contentSignature Hash or signature of the function content
 * @returns The stored function data
 */
export const storeExecutedFunction = (
  functionName: string,
  callId: string,
  params: Record<string, any>,
  contentSignature: string,
): ExecutedFunction => {
  // Get current URL
  const url = window.location.href;

  // Create the execution record
  let executionRecord: ExecutedFunction = {
    functionName,
    callId,
    contentSignature,
    executedAt: Date.now(),
    params,
  };

  // Cap a single record: if the params blow past the per-entry budget, drop them.
  // Dedupe still works (key is name:callId:signature); only re-execute loses its args.
  if (JSON.stringify(executionRecord).length > CLEANUP.MAX_ENTRY_BYTES) {
    executionRecord = { ...executionRecord, params: {}, paramsOmitted: true };
  }

  // Create a unique key for this function execution
  const executionKey = generateExecutionKey(functionName, callId, contentSignature);

  // Use transaction pattern to prevent race conditions
  const storage = getURLBasedStorage();

  // Ensure this URL exists in storage
  if (!storage[url]) {
    storage[url] = {};
  }

  // Add/update the execution record
  storage[url][executionKey] = executionRecord;

  // Save back; on quota errors, prune once (which frees space) and retry.
  try {
    writeURLBasedStorage(storage);
  } catch (error) {
    logger.warn('Storage write failed, pruning and retrying once:', error);
    try {
      pruneFunctionHistory();
      const pruned = getURLBasedStorage();
      if (!pruned[url]) pruned[url] = {};
      pruned[url][executionKey] = executionRecord;
      writeURLBasedStorage(pruned);
    } catch (retryError) {
      logger.error('Failed to store executed function after prune+retry:', retryError);
    }
  }

  return executionRecord;
};

/**
 * Prune the function history in place: drop expired entries, cap per-URL and
 * global entry counts, and cap the serialized blob size (oldest-first eviction).
 * Exported so cleanup scheduling can call it directly.
 */
export const pruneFunctionHistory = (): void => {
  let storage: URLBasedFunctionHistory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    storage = JSON.parse(raw);
  } catch (error) {
    // Corrupt blob — nuke it rather than let it wedge every future write.
    logger.error('Function history unparseable, clearing:', error);
    localStorage.removeItem(STORAGE_KEY);
    memo = null;
    return;
  }

  let changed = false;
  const cutoff = Date.now() - CLEANUP.TTL_MS;

  // 1. TTL sweep + drop empty buckets.
  for (const url of Object.keys(storage)) {
    const bucket = storage[url];
    for (const key of Object.keys(bucket)) {
      if (bucket[key].executedAt < cutoff) {
        delete bucket[key];
        changed = true;
      }
    }
    if (Object.keys(bucket).length === 0) {
      delete storage[url];
      changed = true;
    }
  }

  // 2. Per-bucket cap: keep newest MAX_ENTRIES_PER_URL.
  for (const url of Object.keys(storage)) {
    const bucket = storage[url];
    const keys = Object.keys(bucket);
    if (keys.length > CLEANUP.MAX_ENTRIES_PER_URL) {
      const survivors = keys
        .sort((a, b) => bucket[b].executedAt - bucket[a].executedAt)
        .slice(0, CLEANUP.MAX_ENTRIES_PER_URL);
      const kept: Record<string, ExecutedFunction> = {};
      for (const k of survivors) kept[k] = bucket[k];
      storage[url] = kept;
      changed = true;
    }
  }

  // Flatten to a single oldest-first list for global eviction passes.
  const flatten = () => {
    const flat: { url: string; key: string; entry: ExecutedFunction }[] = [];
    for (const url of Object.keys(storage)) {
      for (const key of Object.keys(storage[url])) {
        flat.push({ url, key, entry: storage[url][key] });
      }
    }
    flat.sort((a, b) => a.entry.executedAt - b.entry.executedAt); // oldest first
    return flat;
  };

  const evict = ({ url, key }: { url: string; key: string }) => {
    delete storage[url][key];
    if (Object.keys(storage[url]).length === 0) delete storage[url];
    changed = true;
  };

  // 3. Global entry cap.
  let flat = flatten();
  while (flat.length > CLEANUP.MAX_ENTRIES_TOTAL) {
    evict(flat.shift()!);
  }

  // 4. Serialized byte cap.
  if (JSON.stringify(storage).length > CLEANUP.MAX_TOTAL_BYTES) {
    flat = flat.length ? flat : flatten();
    while (flat.length > 0 && JSON.stringify(storage).length > CLEANUP.MAX_TOTAL_BYTES) {
      evict(flat.shift()!);
    }
  }

  if (changed) {
    try {
      writeURLBasedStorage(storage);
    } catch (error) {
      logger.error('Failed to write pruned function history:', error);
      memo = storage; // keep the in-memory view consistent even if persist failed
    }
  }
};

/**
 * Run storage cleanup: prune now, sweep the legacy chrome.storage key, and
 * schedule periodic re-prune once. Idempotent — safe to call on every init.
 */
let cleanupScheduled = false;
export const runStorageCleanup = (): void => {
  pruneFunctionHistory();

  // Legacy sweep: the old mcp_executed_tools key is dead code now.
  try {
    chrome?.storage?.local?.remove?.('mcp_executed_tools');
  } catch {
    // chrome.storage may be unavailable; nothing to clean up then.
  }

  if (!cleanupScheduled) {
    cleanupScheduled = true;
    setInterval(pruneFunctionHistory, CLEANUP.PERIODIC_MS);
  }
};

/**
 * Generate a unique key for function execution tracking
 */
const generateExecutionKey = (functionName: string, callId: string, contentSignature: string): string => {
  return `${functionName}:${callId}:${contentSignature}`;
};

/**
 * Get URL-based storage data
 *
 * @returns URL-based function history storage
 */
const getURLBasedStorage = (): URLBasedFunctionHistory => (memo ??= parseFromLocalStorage());

/**
 * Get all stored executed functions (legacy interface for backward compatibility)
 *
 * @returns Array of executed function records with URL included
 */
export const getExecutedFunctions = (): (ExecutedFunction & { url: string })[] => {
  try {
    const storage = getURLBasedStorage();
    const result: (ExecutedFunction & { url: string })[] = [];

    // Convert URL-based structure to flat array
    Object.entries(storage).forEach(([url, functions]) => {
      Object.values(functions).forEach(func => {
        result.push({
          ...func,
          url,
        });
      });
    });

    return result;
  } catch (error) {
    logger.error('Failed to retrieve executed functions:', error);
    return [];
  }
};

/**
 * Get executed functions for the current URL
 *
 * @returns Array of executed function records for the current URL
 */
export const getExecutedFunctionsForCurrentUrl = (): ExecutedFunction[] => {
  const currentUrl = window.location.href;
  const storage = getURLBasedStorage();

  // Direct access to current URL's functions
  if (!storage[currentUrl]) {
    return [];
  }

  return Object.values(storage[currentUrl]);
};

/**
 * Get executed functions for a specific URL
 *
 * @param url The URL to get functions for
 * @returns Array of executed function records for the specified URL
 */
export const getExecutedFunctionsForUrl = (url: string): ExecutedFunction[] => {
  const storage = getURLBasedStorage();

  // Direct access to URL's functions
  if (!storage[url]) {
    return [];
  }

  return Object.values(storage[url]);
};

/**
 * Check if a function has been previously executed
 *
 * @param functionName Name of the function
 * @param callId Unique ID for the function call
 * @param contentSignature Hash or signature of the function content
 * @returns The executed function record if found, null otherwise
 */
export const getPreviousExecution = (
  functionName: string,
  callId: string,
  contentSignature: string,
): ExecutedFunction | null => {
  const currentUrl = window.location.href;
  const storage = getURLBasedStorage();

  // Check if URL exists in storage
  if (!storage[currentUrl]) {
    return null;
  }

  // Generate the execution key
  const executionKey = generateExecutionKey(functionName, callId, contentSignature);

  // Direct lookup by key
  return storage[currentUrl][executionKey] || null;
};

/**
 * Check if a function has been previously executed (backward compatibility version)
 *
 * @param callId Unique ID for the function call
 * @param contentSignature Hash or signature of the function content
 * @returns The executed function record if found, null otherwise
 */
export const getPreviousExecutionLegacy = (callId: string, contentSignature: string): ExecutedFunction | null => {
  const currentUrl = window.location.href;
  const storage = getURLBasedStorage();

  // Check if URL exists in storage
  if (!storage[currentUrl]) {
    return null;
  }

  // Find by callId and contentSignature
  const functionEntry = Object.entries(storage[currentUrl]).find(
    ([_, func]) => func.callId === callId && func.contentSignature === contentSignature,
  );

  return functionEntry ? functionEntry[1] : null;
};

/**
 * Generate a content signature for a function call
 *
 * @param functionName Name of the function
 * @param params Parameters of the function call
 * @returns A string signature representing the function call
 */
export const generateContentSignature = (functionName: string, params: Record<string, any>): string => {
  // Create a simple hash of the function name and parameters
  try {
    // Sort keys of params for deterministic stringification
    const sortedParams: Record<string, any> = {};
    Object.keys(params)
      .sort()
      .forEach(key => {
        sortedParams[key] = params[key];
      });

    const content = JSON.stringify({ name: functionName, params: sortedParams });
    // Simple hash function for the content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  } catch (error) {
    logger.error('Failed to generate content signature:', error);
    // Fallback to timestamp if hashing fails
    return Date.now().toString(16);
  }
};

/**
 * Format a timestamp to a human-readable date string
 *
 * @param timestamp Timestamp in milliseconds
 * @returns Formatted date string
 */
export const formatExecutionTime = (timestamp: number): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (error) {
    return 'Unknown date';
  }
};
