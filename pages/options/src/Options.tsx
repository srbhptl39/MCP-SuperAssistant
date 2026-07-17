import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useStorage } from '@extension/shared';
import {
  AI_PLATFORMS,
  BROWSER_BRIDGE_DEFAULTS,
  browserBridgeStorage,
  type BrowserBridgeSettings,
} from '@extension/storage';
import { buttonClass, Card, Field, inputClass, RadioGroup, SavedTag, Toggle } from '@src/ui';
import { getConnectionStatus, getServerConfig, updateServerConfig, type ConnectionType } from '@src/mcp';

const ALL_URLS: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

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

const OptionsInner = () => {
  const settings = useStorage(browserBridgeStorage);
  const { saved, flash } = useSavedFlash();

  const update = useCallback(
    (patch: Partial<BrowserBridgeSettings>) => {
      void browserBridgeStorage.set(s => ({ ...s, ...patch }));
      flash();
    },
    [flash],
  );

  const version = chrome.runtime.getManifest().version;

  /* --- Capture: keyboard shortcut binding --- */
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    chrome.commands.getAll().then(cmds => {
      const cmd = cmds.find(c => c.name === 'capture-page');
      setShortcut(cmd?.shortcut || '');
    });
  }, []);

  /* --- Browser tools: host permission --- */
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [permNote, setPermNote] = useState('');
  useEffect(() => {
    const sync = () => chrome.permissions.contains(ALL_URLS).then(setHasFullAccess);
    sync();
    chrome.permissions.onAdded.addListener(sync);
    chrome.permissions.onRemoved.addListener(sync);
    return () => {
      chrome.permissions.onAdded.removeListener(sync);
      chrome.permissions.onRemoved.removeListener(sync);
    };
  }, []);

  const grantFullAccess = async () => {
    const granted = await chrome.permissions.request(ALL_URLS);
    if (granted) {
      setHasFullAccess(true);
      setPermNote('');
    } else {
      setPermNote('Chrome permission was declined — tab reading stays limited.');
    }
  };

  const toggleBrowserTools = async (next: boolean) => {
    if (next) {
      const granted = await chrome.permissions.request(ALL_URLS);
      if (!granted) {
        setPermNote('Permission denied — browser tools stay off.');
        setHasFullAccess(false);
        return;
      }
      setPermNote('');
      setHasFullAccess(true);
      update({ browserToolsEnabled: true });
    } else {
      update({ browserToolsEnabled: false });
    }
  };

  /* --- Denylist editor --- */
  const [denyInput, setDenyInput] = useState('');
  const addDeny = () => {
    const host = denyInput.trim().toLowerCase();
    if (!host) return;
    if (!settings.domainDenylist.includes(host)) {
      update({ domainDenylist: [...settings.domainDenylist, host] });
    }
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

  const caution = 'text-xs leading-relaxed text-amber-600 dark:text-amber-500';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">MCP SuperAssistant</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Settings · v{version}</p>
          </div>
          <SavedTag show={saved} />
        </header>

        {/* 1. General */}
        <Card title="General">
          <Field label="Default AI platform" hint="Where the capture shortcut sends the current page.">
            <select
              className={inputClass}
              value={settings.defaultAiPlatform}
              onChange={e => update({ defaultAiPlatform: e.target.value as BrowserBridgeSettings['defaultAiPlatform'] })}>
              {Object.values(AI_PLATFORMS).map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="When sending a capture">
            <RadioGroup
              name="openBehavior"
              value={settings.openBehavior}
              onChange={v => update({ openBehavior: v })}
              options={[
                { value: 'focus-existing', label: 'Focus an existing tab if one is open' },
                { value: 'always-new-tab', label: 'Always open a new tab' },
              ]}
            />
          </Field>
        </Card>

        {/* 2. Capture */}
        <Card title="Capture">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Pressing the capture shortcut sends the current page to your default AI platform.
          </p>

          <Field label="Keyboard shortcut">
            <div className="flex items-center gap-3">
              <kbd className="rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                {shortcut === null ? '…' : shortcut || 'Not set'}
              </kbd>
              <button
                type="button"
                className={buttonClass}
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
                Change shortcut
              </button>
            </div>
          </Field>

          <Field label="Capture mode">
            <RadioGroup
              name="captureMode"
              value={settings.captureMode}
              onChange={v => update({ captureMode: v })}
              options={[
                { value: 'article', label: 'Article (main content)' },
                { value: 'full_text', label: 'Full page text' },
              ]}
            />
          </Field>

          <Field
            label="Insertion template"
            hint={
              <>
                Placeholders: <code>{'{title}'}</code> <code>{'{url}'}</code> <code>{'{content}'}</code>
              </>
            }>
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
          </Field>

          <div className="flex items-start justify-between gap-4">
            <Field
              label="Auto-submit after inserting"
              hint={<span className={caution}>The message sends immediately after it is inserted.</span>}
            />
            <Toggle
              label="Auto-submit after inserting"
              checked={settings.autoSubmitCapture}
              onChange={v => update({ autoSubmitCapture: v })}
            />
          </div>
        </Card>

        {/* 3. Browser tools */}
        <Card title="Browser tools (AI access to your browser)">
          <div className="flex items-start justify-between gap-4">
            <Field
              label="Let the AI read your tabs"
              hint={
                <span
                  className={
                    'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                    (hasFullAccess
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                  }>
                  {hasFullAccess ? 'Full access granted' : 'Limited — capture only'}
                </span>
              }>
              {settings.browserToolsEnabled && !hasFullAccess ? (
                <button
                  type="button"
                  className={
                    buttonClass + ' border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200'
                  }
                  onClick={grantFullAccess}>
                  Grant full page access
                </button>
              ) : null}
              {permNote ? <span className={caution}>{permNote}</span> : null}
            </Field>
            <Toggle
              label="Let the AI read your tabs"
              checked={settings.browserToolsEnabled}
              onChange={toggleBrowserTools}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <Field
              label="Allow tab control (open, close, navigate, focus)"
              hint={<span className={caution}>Lets the AI act on your browser, not just read it.</span>}
            />
            <Toggle
              label="Allow tab control"
              checked={settings.browserControlEnabled}
              disabled={!settings.browserToolsEnabled}
              onChange={v => update({ browserControlEnabled: v })}
            />
          </div>

          <Field label="Never allow on these domains" hint="Bare hostnames, e.g. mail.google.com. The AI can never read or touch these.">
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

        {/* 4. MCP server */}
        <Card title="MCP server">
          <Field label="Server URL">
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="http://localhost:3006/sse"
                value={uri}
                onChange={e => setUri(e.target.value)}
              />
              <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                <span
                  className={
                    'inline-block h-2.5 w-2.5 rounded-full ' +
                    (connected === null
                      ? 'bg-neutral-400'
                      : connected
                        ? 'bg-green-500'
                        : 'bg-red-500')
                  }
                />
                {connected === null ? 'Unknown' : connected ? 'Connected' : 'Disconnected'}
              </div>
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
            <button type="button" className={buttonClass} onClick={saveServer}>
              Save
            </button>
            <SavedTag show={mcpSaved} />
            {mcpErr ? <span className={caution}>{mcpErr}</span> : null}
          </div>
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
