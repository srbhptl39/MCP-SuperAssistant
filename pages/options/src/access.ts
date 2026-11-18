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

// Firefox 140+ asks for data collection consent separately from the Settings toggle, and does not
// ask people who updated from an older version. null = this browser has no such consent.
type DataPerms = chrome.permissions.Permissions & { data_collection?: string[] };
const DATA: DataPerms = { data_collection: ['technicalAndInteraction'] };

export const useDataConsent = () => {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () =>
      chrome.permissions
        .getAll()
        .then(p => {
          const dc = (p as DataPerms).data_collection;
          setGranted(dc ? dc.includes('technicalAndInteraction') : null);
        })
        .catch(() => setGranted(null));
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

// Must run inside a click handler.
export const requestDataConsent = () => chrome.permissions.request(DATA as chrome.permissions.Permissions);
