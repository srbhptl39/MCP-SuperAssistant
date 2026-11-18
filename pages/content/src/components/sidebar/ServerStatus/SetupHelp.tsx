import { useState } from 'react';
import { telemetry } from '../../../utils/telemetry';

const TRANSPORT_FLAG: Record<string, string> = { sse: 'sse', 'streamable-http': 'streamableHttp', websocket: 'ws' };

const CONFIG = `{
  "mcpServers": {
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander"]
    }
  }
}`;

/** The proxy command for the transport and port the extension is set to use. */
export function proxyCommand(connectionType: string, serverUri: string): string {
  let port = '';
  try {
    const p = new URL(serverUri).port;
    if (p && p !== '3006') port = ` --port ${p}`;
  } catch {
    /* keep the default port */
  }
  const flag = TRANSPORT_FLAG[connectionType] ?? 'sse';
  return `npx -y @srbhptl39/mcp-superassistant-proxy@latest --config ./config.json --outputTransport ${flag}${port}`;
}

const Step = ({ n, title, code, onCopy }: { n: number; title: string; code?: string; onCopy?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy?.();
    });
  };
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="font-medium">{n}.</span> {title}
        </span>
        {code && (
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {code && (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-1.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {code}
        </pre>
      )}
    </li>
  );
};

/** Shown while no MCP proxy is reachable: the three steps to start one, with copy buttons. */
const SetupHelp = ({ connectionType, serverUri }: { connectionType: string; serverUri: string }) => {
  const [open, setOpen] = useState(true);
  const copied = () => telemetry('setup_copy');
  return (
    <div className="mx-3 mb-2 rounded-md border border-slate-200 p-2.5 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between font-medium text-slate-800 dark:text-slate-100">
        <span>Set up your tools in 2 minutes</span>
        <span className="text-slate-400">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          <li className="text-slate-500 dark:text-slate-400">
            MCP SuperAssistant needs a small local proxy that runs your MCP servers. You need Node.js installed.
          </li>
          <Step n={1} title="Save your MCP servers as config.json (example):" code={CONFIG} onCopy={copied} />
          <Step
            n={2}
            title="In a terminal, in that folder, run:"
            code={proxyCommand(connectionType, serverUri)}
            onCopy={copied}
          />
          <Step n={3} title="Leave it running, then click Reconnect above." />
          <li>
            <a
              href="https://github.com/srbhptl39/MCP-SuperAssistant#readme"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400">
              Full setup guide
            </a>
            {' · '}You can reuse an existing Claude Desktop or Cursor config file.
          </li>
        </ol>
      )}
    </div>
  );
};

export default SetupHelp;
