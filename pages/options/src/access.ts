import { useEffect, useState } from 'react';

const ALL_URLS: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

/** Live `<all_urls>` grant state; null until the first check returns. */
export const useFullAccess = () => {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => chrome.permissions.contains(ALL_URLS).then(setGranted);
    sync();
    chrome.permissions.onAdded.addListener(sync);
    chrome.permissions.onRemoved.addListener(sync);
    return () => {
      chrome.permissions.onAdded.removeListener(sync);
      chrome.permissions.onRemoved.removeListener(sync);
    };
  }, []);
  return granted;
};

// Must run inside a click handler: Chrome only shows its prompt during a user gesture.
export const requestFullAccess = () => chrome.permissions.request(ALL_URLS);
export const removeFullAccess = () => chrome.permissions.remove(ALL_URLS);
