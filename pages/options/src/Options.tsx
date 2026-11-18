import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStorage } from '@extension/shared';
import {
  AI_PLATFORMS,
  BROWSER_BRIDGE_DEFAULTS,
  browserBridgeStorage,
  telemetryStorage,
  type BrowserBridgeSettings,
} from '@extension/storage';
import { buttonClass, Card, Field, inputClass, primaryButtonClass, RadioGroup, SavedTag, Toggle } from '@src/ui';
import { removeFullAccess, requestDataConsent, requestFullAccess, useDataConsent, useFullAccess } from '@src/access';
import { getConnectionStatus, getServerConfig, updateServerConfig, type ConnectionType } from '@src/mcp';

const caution = 'text-xs leading-relaxed text-amber-600 dark:text-amber-500';

const useSavedFlash = () => {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback(() => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  }, []);
  return { saved, flash };
};

const ToggleRow = ({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <Field label={label} hint={hint} />
    <Toggle label={label} checked={checked} disabled={disabled} onChange={onChange} />
  </div>
);

const StatusDot = ({ state }: { state: boolean | null }) => (
  <span
    className={
      'inline-block h-2 w-2 shrink-0 rounded-full ' +
      (state === null ? 'bg-neutral-400' : state ? 'bg-green-500' : 'bg-amber-500')
    }
  />
);

const OptionsInner = () => {
  const settings = useStorage(browserBridgeStorage);
  const telemetrySettings = useStorage(telemetryStorage);
  const { saved, flash } = useSavedFlash();

  const update = useCallback(
    (patch: Partial<BrowserBridgeSettings>) => {
      void browserBridgeStorage.set(s => ({ ...s, ...patch }));
      flash();
    },
    [flash],
  );

  const version = chrome.runtime.getManifest().version;

  /* --- Browser access (<all_urls>) --- */
  const hasAccess = useFullAccess();
  const dataConsent = useDataConsent();
  const [accessNote, setAccessNote] = useState('');

  const allowAccess = async () => {
    setAccessNote('');
    const granted = await requestFullAccess();
    if (!granted) setAccessNote('Access was not allowed. Click Allow access to try again.');
    return granted;
  };

  const revokeAccess = async () => {
    await removeFullAccess();
    update({ browserToolsEnabled: false, browserControlEnabled: false });
  };

  const toggleBrowserTools = async (next: boolean) => {
    if (next && !hasAccess && !(await allowAccess())) return;
    update({ browserToolsEnabled: next });
  };

  /* --- Capture shortcut --- */
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    chrome.commands.getAll().then(cmds => setShortcut(cmds.find(c => c.name === 'capture-page')?.shortcut || ''));
  }, []);

  /* --- Denylist --- */
  const [denyInput, setDenyInput] = useState('');
  const addDeny = () => {
    const host = denyInput.trim().toLowerCase();
    if (!host) return;
    if (!settings.domainDenylist.includes(host)) update({ domainDenylist: [...settings.domainDenylist, host] });
    setDenyInput('');
  };

  /* --- MCP server --- */
  const [uri, setUri] = useState('');
  const [ctype, setCtype] = useState<ConnectionType>('sse');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [mcpErr, setMcpErr] = useState('');
  const { saved: mcpSaved, flash: mcpFlash } = useSavedFlash();

  useEffect(() => {
    getServerConfig()
      .then(cfg => {
        setUri(cfg.uri);
        setCtype(cfg.connectionType);
      })
      .catch(e => setMcpErr(String(e)));
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () =>
      getConnectionStatus()
        .then(s => active && setConnected(s.isConnected))
        .catch(() => active && setConnected(null));
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  const saveServer = async () => {
    setMcpErr('');
    try {
      await updateServerConfig({ uri: uri.trim(), connectionType: ctype });
      mcpFlash();
    } catch (e) {
      setMcpErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-5 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon-34.png" alt="" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold">MCP SuperAssistant</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Settings · v{version}</p>
            </div>
          </div>
          <SavedTag show={saved} />
        </header>

        {/* 1. Browser access: the Chrome permission first, then what the AI may do with it */}
        <Card
          title="Browser access"
          description="Lets SuperAssistant read your open tabs when you attach them or allow the AI to.">
          <div
            className={
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ' +
              (hasAccess
                ? 'border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30')
            }>
            <div className="flex items-center gap-2.5">
              <StatusDot state={hasAccess} />
              <div>
                <p className="text-sm font-medium">
                  {hasAccess === null ? 'Checking…' : hasAccess ? 'Access allowed' : 'Access not allowed'}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {hasAccess
                    ? 'Tabs can be read. Sites in the block list below stay off limits.'
                    : 'Your browser will ask you to confirm. Needed to attach tabs or use browser tools.'}
                </p>
              </div>
            </div>
            {hasAccess ? (
              <button type="button" className={buttonClass} onClick={revokeAccess}>
                Remove access
              </button>
            ) : (
              <button type="button" className={primaryButtonClass} onClick={allowAccess} disabled={hasAccess === null}>
                Allow access
              </button>
            )}
          </div>
          {accessNote ? <span className={caution}>{accessNote}</span> : null}

          <ToggleRow
            label="AI can read your tabs"
            hint="Lets the AI list your tabs and read their pages using tools."
            checked={settings.browserToolsEnabled && !!hasAccess}
            onChange={toggleBrowserTools}
          />
          <ToggleRow
            label="AI can control tabs"
            hint={<span className={caution}>Open, close, navigate and focus tabs, not just read them.</span>}
            checked={settings.browserControlEnabled}
            disabled={!settings.browserToolsEnabled || !hasAccess}
            onChange={v => update({ browserControlEnabled: v })}
          />

          <Field label="Blocked sites" hint="The AI can never read or touch these, e.g. mail.google.com.">
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="example.com"
                value={denyInput}
                onChange={e => setDenyInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDeny();
                  }
                }}
              />
              <button type="button" className={buttonClass} onClick={addDeny}>
                Add
              </button>
            </div>
            {settings.domainDenylist.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {settings.domainDenylist.map(host => (
                  <li
                    key={host}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-200 py-1 pl-3 pr-1.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {host}
                    <button
                      type="button"
                      aria-label={`Remove ${host}`}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-300 hover:text-neutral-800 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                      onClick={() => update({ domainDenylist: settings.domainDenylist.filter(h => h !== host) })}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>
        </Card>

        {/* 2. MCP server */}
        <Card title="MCP server" description="Where SuperAssistant finds your tools, usually the local proxy.">
          <Field label="Server URL">
            <div className="flex items-center gap-3">
              <input
                className={inputClass}
                placeholder="http://localhost:3006/sse"
                value={uri}
                onChange={e => setUri(e.target.value)}
              />
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                <StatusDot state={connected} />
                {connected === null ? 'Unknown' : connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </Field>
          <Field label="Transport">
            <select className={inputClass} value={ctype} onChange={e => setCtype(e.target.value as ConnectionType)}>
              <option value="sse">SSE</option>
              <option value="websocket">WebSocket</option>
              <option value="streamable-http">Streamable HTTP</option>
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <button type="button" className={primaryButtonClass} onClick={saveServer}>
              Save
            </button>
            <SavedTag show={mcpSaved} />
            {mcpErr ? <span className={caution}>{mcpErr}</span> : null}
          </div>
        </Card>

        {/* 3. Page capture */}
        <Card title="Page capture" description="Send the page you are on to an AI chat with a keyboard shortcut.">
          <Field label="Shortcut">
            <div className="flex items-center gap-3">
              <kbd className="rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                {shortcut === null ? '…' : shortcut || 'Not set'}
              </kbd>
              <button
                type="button"
                className={buttonClass}
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
                Change
              </button>
            </div>
          </Field>

          <Field label="Send to">
            <select
              className={inputClass}
              value={settings.defaultAiPlatform}
              onChange={e =>
                update({ defaultAiPlatform: e.target.value as BrowserBridgeSettings['defaultAiPlatform'] })
              }>
              {Object.values(AI_PLATFORMS).map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <RadioGroup
              name="openBehavior"
              value={settings.openBehavior}
              onChange={v => update({ openBehavior: v })}
              options={[
                { value: 'focus-existing', label: 'Use an open tab if there is one' },
                { value: 'always-new-tab', label: 'Always open a new tab' },
              ]}
            />
          </Field>

          <Field label="What to capture">
            <RadioGroup
              name="captureMode"
              value={settings.captureMode}
              onChange={v => update({ captureMode: v })}
              options={[
                { value: 'article', label: 'Main article' },
                { value: 'full_text', label: 'All page text' },
              ]}
            />
          </Field>

          <ToggleRow
            label="Send right away"
            hint={<span className={caution}>Submits the message as soon as it is inserted.</span>}
            checked={settings.autoSubmitCapture}
            onChange={v => update({ autoSubmitCapture: v })}
          />

          <details className="group">
            <summary className="cursor-pointer select-none text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Message template
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Placeholders: <code>{'{title}'}</code> <code>{'{url}'}</code> <code>{'{content}'}</code>
              </span>
              <textarea
                className={`${inputClass} min-h-[140px] resize-y font-mono text-xs`}
                value={settings.captureTemplate}
                onChange={e => update({ captureTemplate: e.target.value })}
                spellCheck={false}
              />
              <div>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => update({ captureTemplate: BROWSER_BRIDGE_DEFAULTS.captureTemplate })}>
                  Reset to default
                </button>
              </div>
            </div>
          </details>
        </Card>

        {/* 4. Usage statistics (opt-out) */}
        <Card title="Usage statistics" description="Anonymous counts that show which features and sites are used.">
          <ToggleRow
            label="Share anonymous usage statistics"
            hint="Sends a random install id, the extension version, your browser and OS, which supported AI sites you used and how many times each feature ran. Never sends chat content, page content, URLs, tool names or arguments."
            checked={telemetrySettings.enabled}
            onChange={v => {
              void telemetryStorage.set({ enabled: v });
              flash();
            }}
          />
          {dataConsent === false && telemetrySettings.enabled ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <span className="text-neutral-600 dark:text-neutral-300">
                Firefox has not been given permission to share these statistics, so nothing is sent.
              </span>
              <button type="button" className={primaryButtonClass} onClick={() => void requestDataConsent()}>
                Allow
              </button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
};

const Options = () => (
  <Suspense fallback={<div className="min-h-screen bg-neutral-50 dark:bg-neutral-950" />}>
    <OptionsInner />
  </Suspense>
);

export default Options;
