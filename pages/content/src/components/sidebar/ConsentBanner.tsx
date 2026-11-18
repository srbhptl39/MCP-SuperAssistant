import { useEffect, useState } from 'react';

/** Firefox only: asks once (dismissable) for the data consent that updating users were never shown. */
const ConsentBanner = () => {
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: 'telemetry:consent-needed' })
      .then(r => setNeeded(!!r?.needed))
      .catch(() => {});
  }, []);

  if (!needed) return null;
  const close = (type: string) => {
    void chrome.runtime.sendMessage({ type }).catch(() => {});
    setNeeded(false);
  };

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2.5 text-xs text-slate-600 dark:text-slate-300 space-y-2">
      <p>Help improve MCP SuperAssistant by sharing anonymous usage counts. No chats or page content.</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-2 py-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
          onClick={() => close('telemetry:consent-dismiss')}>
          No thanks
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
          onClick={() => close('telemetry:request-consent')}>
          Allow
        </button>
      </div>
    </div>
  );
};

export default ConsentBanner;
