import { useEffect, useState } from 'react';
import { requestFullAccess, useFullAccess } from '@src/access';
import { primaryButtonClass, buttonClass } from '@src/ui';

/**
 * Compact permission prompt, opened by the background as a small popup window over the
 * current tab (options/index.html#grant). One click on Allow brings up Chrome's own dialog.
 */
const Grant = () => {
  const granted = useFullAccess();
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (granted) {
      const t = setTimeout(() => window.close(), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [granted]);

  const allow = async () => {
    setDeclined(false);
    if (!(await requestFullAccess())) setDeclined(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon-34.png" alt="" className="h-8 w-8" />
          <h1 className="text-base font-semibold">Allow browser access</h1>
        </div>

        {granted ? (
          <p className="text-sm text-green-700 dark:text-green-400">Access allowed. You can close this window.</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              MCP SuperAssistant needs permission to read pages so it can attach your open tabs to a chat. Your browser
              will ask you to confirm. You can remove access any time in Settings.
            </p>
            {declined ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">Access was not allowed. Try again or close.</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass} onClick={() => window.close()}>
                Not now
              </button>
              <button type="button" className={primaryButtonClass} disabled={granted === null} onClick={allow}>
                Allow
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Grant;
