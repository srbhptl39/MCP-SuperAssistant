/**
 * Anonymous usage statistics, background service worker only. Model: see telemetry-core.ts.
 * Sends to PostHog when CEB_POSTHOG_KEY is set and mirrors to GA4 when CEB_GA_* are set.
 * Nothing is sent when neither is configured, when the user opted out (Settings / Firefox data
 * consent), or from an unpacked build unless chrome.storage.local.telemetryDebug === true.
 */
import { browserBridgeStorage, telemetryStorage } from '@extension/storage';
import { createLogger } from '@extension/shared/lib/logger';
import * as core from './telemetry-core';
import type { ErrorCode, Ev, Feature, Props, State } from './telemetry-core';

const logger = createLogger('Telemetry');

const PH_KEY: string | undefined = import.meta.env.CEB_POSTHOG_KEY;
const PH_HOST: string = import.meta.env.CEB_POSTHOG_HOST || 'https://eu.i.posthog.com';
const GA_ID: string | undefined = import.meta.env.CEB_GA_MEASUREMENT_ID;
const GA_SECRET: string | undefined = import.meta.env.CEB_GA_API_SECRET;
const GA_ON = !!(GA_ID && GA_SECRET);

// TODO(uninstall): once https://mcpsuperassistant.ai/uninstalled exists, call
// chrome.runtime.setUninstallURL(`${UNINSTALL_URL}?v=<version>&d=<days installed>&a=<activated 0|1>`)
// at worker start. Not called yet: a 404 on uninstall is worse than nothing.
export const UNINSTALL_URL = 'https://mcpsuperassistant.ai/uninstalled';
export const TELEMETRY_ALARM = 'telemetry';
export const HEARTBEAT_EVERY_MINUTES = 180;

const STATE_KEY = 'tel';
const locked = core.serial();
let idPromise: Promise<string> | undefined;
let devInstall: Promise<boolean> | undefined;

const isDev = () => (devInstall ??= chrome.management.getSelf().then(s => s.installType === 'development'));

/** Existing GA clientId reused as the anonymous install id. Throws (=> nothing sent) if storage fails. */
function installId(): Promise<string> {
  return (idPromise ??= (async () => {
    const { clientId } = await chrome.storage.local.get<{ clientId?: string }>('clientId');
    if (clientId) return clientId;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ clientId: id });
    return id;
  })().catch(e => {
    idPromise = undefined;
    throw e;
  }));
}

async function enabled(): Promise<boolean> {
  if (!PH_KEY && !GA_ON) return false;
  if (!(await telemetryStorage.get()).enabled) return false;
  // Firefox 140+ built-in data consent (manifest data_collection_permissions).
  const perms = (await chrome.permissions.getAll()) as { data_collection?: string[] };
  if (perms.data_collection && !perms.data_collection.includes('technicalAndInteraction')) return false;
  if (await isDev()) return (await chrome.storage.local.get('telemetryDebug')).telemetryDebug === true;
  return true;
}

async function common(): Promise<Props> {
  const ua = navigator.userAgent;
  return {
    ext_version: chrome.runtime.getManifest().version,
    browser: ua.includes('Firefox/') ? 'firefox' : ua.includes('Edg/') ? 'edge' : 'chrome',
    os: (await chrome.runtime.getPlatformInfo()).os,
    env: (await isDev()) ? 'dev' : 'prod',
  };
}

async function daysSinceInstall(): Promise<number> {
  let { installDate } = await chrome.storage.local.get<{ installDate?: string }>('installDate');
  if (!installDate) await chrome.storage.local.set({ installDate: (installDate = new Date().toISOString()) });
  return Math.max(0, Math.floor((Date.now() - Date.parse(installDate)) / 86_400_000));
}

const load = async (): Promise<State> => ({
  ...core.emptyState(),
  ...(await chrome.storage.local.get<Record<string, State>>(STATE_KEY))[STATE_KEY],
});
const save = (s: State) => chrome.storage.local.set({ [STATE_KEY]: s });

/** One send fans out to every configured provider. Must be called outside `locked`. */
async function send(evs: Ev[]): Promise<void> {
  if (!evs.length) return;
  const now = Date.now();
  const stamped = evs.map(e => ({ ...e, ts: e.ts ?? now }));
  const [id, props] = await Promise.all([installId(), common()]);
  if (GA_ON) {
    for (const e of stamped) {
      const body = !e.retry && core.gaBody(id, e, props, now);
      if (body)
        fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_SECRET}`, {
          method: 'POST',
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
    }
  }
  if (!PH_KEY) return;
  try {
    // No Content-Type header => text/plain, a CORS "simple" request (no host permission needed).
    const r = await fetch(`${PH_HOST}/batch/`, {
      method: 'POST',
      body: JSON.stringify(core.posthogBatch(PH_KEY, id, stamped, props)),
      keepalive: true,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    logger.debug('[Telemetry] send failed, queued:', e);
    await locked(async () => {
      const s = await load();
      s.queue = [...s.queue, ...stamped.map(e => ({ ...e, retry: true }))].slice(-core.MAX_QUEUE);
      await save(s);
    });
  }
}

/** Run a state transition under the lock, persist it, then send what it produced. Never throws. */
function update(fn: (s: State, day: string) => Ev[] | Promise<Ev[]>): Promise<void> {
  return enabled()
    .then(on => {
      if (!on) return;
      return locked(async () => {
        const s = await load();
        const evs = await fn(s, core.today());
        await save(s);
        return evs;
      }).then(send);
    })
    .catch(e => logger.debug('[Telemetry] skipped:', e));
}

export const telemetry = {
  /** A user engagement on `where` (site id, URL or hostname; reduced to the site enum). */
  record: (feature: Feature, where?: string) => update((s, day) => core.record(s, day, feature, core.site(where))),

  /** A tool call finished (MCP or browser_*). `ok` false = the tool reported an error. */
  toolRun: (browserTool: boolean, ok: boolean, where?: string) =>
    update(async (s, day) => {
      const site = core.site(where);
      const evs = core.record(s, day, browserTool ? 'browser_tool' : 'tool_run', site);
      if (!ok) return [...evs, ...core.bump(s, day, 'tool_errors')];
      if (s.milestones.activated) return evs;
      return [...evs, ...core.milestone(s, 'activated', { site, days_since_install: await daysSinceInstall() })];
    }),

  connected: (transport: string) =>
    update(async (s, day) => {
      const evs = core.bump(s, day, 'mcp_connect_ok');
      if (s.milestones.mcp_first_connected) return evs;
      return [
        ...evs,
        ...core.milestone(s, 'mcp_first_connected', { transport, days_since_install: await daysSinceInstall() }),
      ];
    }),

  /** Proxy connection attempt failed: a counter only, so the reconnect loop costs nothing. */
  connectFailed: () => update((s, day) => core.bump(s, day, 'mcp_connect_fail')),

  error: (code: ErrorCode, where?: string) => update((s, day) => core.error(s, day, code, core.site(where))),

  installed: (reason: string, previousVersion?: string) =>
    update(s => {
      if (reason === 'install') return core.milestone(s, 'ext_installed', {});
      // Reloading an unpacked build fires `update` with the same version.
      if (reason === 'update' && previousVersion !== chrome.runtime.getManifest().version)
        return [{ event: 'ext_updated', props: { from_version: previousVersion ?? 'unknown' } }];
      return [];
    }),

  /** Daily heartbeat, yesterday's usage_day, and retry of queued sends. Safe to call often. */
  async tick(mcp: { connected: boolean; transport: string; tools: number }) {
    const hb = async (): Promise<Props> => {
      const bb = await browserBridgeStorage.get();
      return {
        mcp_connected: mcp.connected,
        transport: mcp.transport,
        tools_count: core.bucket(mcp.tools),
        browser_tools_enabled: bb.browserToolsEnabled,
        browser_control_enabled: bb.browserControlEnabled,
        full_access: await chrome.permissions.contains({ origins: ['<all_urls>'] }),
        days_since_install: await daysSinceInstall(),
      };
    };
    return update(async (s, day) => {
      const props = s.hbDay === day ? {} : await hb();
      return [...s.queue.splice(0), ...core.tick(s, day, () => props)];
    });
  },
};
