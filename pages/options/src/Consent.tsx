import { useEffect } from 'react';
import { requestDataConsent, useDataConsent } from '@src/access';
import { buttonClass, primaryButtonClass } from '@src/ui';

/** Small window (options/index.html#consent) asking Firefox users to allow anonymous usage statistics. */
const Consent = () => {
  const granted = useDataConsent();

  useEffect(() => {
    if (!granted) return undefined;
    const t = setTimeout(() => window.close(), 900);
    return () => clearTimeout(t);
  }, [granted]);

  const notNow = () => {
    void chrome.storage.local.set({ consentPromptDismissed: true });
    window.close();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon-34.png" alt="" className="h-8 w-8" />
          <h1 className="text-base font-semibold">Share anonymous usage statistics?</h1>
        </div>
        {granted ? (
          <p className="text-sm text-green-700 dark:text-green-400">
            Thanks! You can change this any time in Settings.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              Counts like how many people use each feature and site help us fix what breaks. We never collect chats,
              page content, URLs or tool details. Firefox will ask you to confirm.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass} onClick={notNow}>
                Not now
              </button>
              <button type="button" className={primaryButtonClass} onClick={() => void requestDataConsent()}>
                Allow
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Consent;
