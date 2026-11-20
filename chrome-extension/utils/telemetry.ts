/**
 * Anonymous usage statistics, background service worker only. Model: see telemetry-core.ts.
 * Sends to PostHog when CEB_POSTHOG_KEY is set and mirrors to GA4 when CEB_GA_* are set.
 * Nothing is sent when neither is configured, when the user opted out (Settings / Firefox data
 * consent), or from an unpacked build unless chrome.storage.local.telemetryDebug === true.
 */
import { browserBridgeStorage, telemetryStorage } from '@extension/storage';
import { createLogger } from '@extension/shared/lib/logger';
import * as core from './telemetry-core';
import type { DropCause, ErrorCode, Ev, FailReason, Feature, Props, State } from './telemetry-core';

const logger = createLogger('Telemetry');

const PH_KEY: string | undefined = import.meta.env.CEB_POSTHOG_KEY;
const PH_HOST: string = import.meta.env.CEB_POSTHOG_HOST || 'https://eu.i.posthog.com';
const GA_ID: string | undefined = import.meta.env.CEB_GA_MEASUREMENT_ID;
const GA_SECRET: string | undefined = import.meta.env.CEB_GA_API_SECRET;
const GA_ON = !!(GA_ID && GA_SECRET);

// Opened by the browser after an uninstall. With usage statistics on, the page records one anonymous
// ext_uninstalled event for this install id; with them off it gets no parameters and records nothing.
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
    // 'new' = installed with this telemetry; 'existing' = updated from a version without it.
    cohort: (await chrome.storage.local.get<{ installCohort?: string }>('installCohort')).installCohort ?? 'unknown',
  };
}

async function uninstallParams(): Promise<Record<string, string>> {
  const c = await common();
  return { i: await installId(), v: String(c.ext_version), b: String(c.browser), e: String(c.env) };
}

/** Whole days since install, or {} when the install date is unknown (installs from before 0.7). */
async function daysSinceInstall(): Promise<Props> {
  const { installDate } = await chrome.storage.local.get<{ installDate?: string }>('installDate');
  const t = installDate ? Date.parse(installDate) : NaN;
  return Number.isNaN(t) ? {} : { days_since_install: Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) };
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
      return [...evs, ...core.milestone(s, 'activated', { site, ...(await daysSinceInstall()) })];
    }),

  /** Proxy connected. First ever connection is a milestone; tools_listed sends the daily signal. */
  connected: (transport: string) =>
    update(async s =>
      s.milestones.mcp_first_connected
        ? []
        : core.milestone(s, 'mcp_first_connected', { transport, ...(await daysSinceInstall()) }),
    ),

  /** Tools fetched from a connected proxy: one proxy_connected_day per UTC day. */
  toolsListed: (transport: string, tools: number) =>
    update((s, day) => core.oncePerDay(s, day, 'proxy_connected_day', { transport, tools_count: core.bucket(tools) })),

  /** Instructions inserted into a chat (chip or plain text). */
  instructions: (where?: string) =>
    update(async (s, day) => {
      const site = core.site(where);
      return [
        ...core.oncePerDay(s, day, 'instructions_day', { site }),
        ...core.milestone(s, 'first_instructions', { site, ...(await daysSinceInstall()) }),
      ];
    }),

  /** A tool card rendered in a chat: per-site counts in usage_day, plus a first-time milestone. */
  card: (where?: string) =>
    update(async (s, day) => {
      const site = core.site(where);
      const evs = core.card(s, day, site);
      if (s.milestones.first_card) return evs;
      return [...evs, ...core.milestone(s, 'first_card', { site, ...(await daysSinceInstall()) })];
    }),

  /** A setup step was copied from the sidebar's setup help (proxy not running). */
  setupCopied: (where?: string) =>
    update(async (s, day) => [
      ...core.oncePerDay(s, day, 'setup_help_day', { site: core.site(where) }),
      ...core.milestone(s, 'setup_help_used', { site: core.site(where), ...(await daysSinceInstall()) }),
    ]),

  error: (code: ErrorCode, where?: string, reason?: FailReason, extra?: Props) =>
    update((s, day) => core.error(s, day, code, core.site(where), reason, extra)),

  /**
   * Connection health. Counters go into a daily connection_day; drops, recoveries and connect failures
   * also send a capped event. Only enums, counts and coarse buckets: no URLs, tool/server names or messages.
   */
  conn: {
    /** Connected to the proxy (first connect, reconnect or recovery after a drop). */
    connected: (info: { transport: string; proxyVersion: string; tools: number; servers: number }) =>
      update((s, day) => {
        const ctx = {
          transport: info.transport,
          proxy_version: info.proxyVersion,
          tools_count: core.bucket(info.tools),
          servers_count: core.bucket(info.servers),
        };
        const out = core.connCount(s, day, { connects_ok: 1 }, ctx);
        const c = s.conn!;
        if (c.downSince) {
          const down = Date.now() - c.downSince;
          out.push(
            ...core.connCount(s, day, { recoveries: 1, max_recovery_ms: down }),
            ...core.connEvent(s, day, 'mcp_recovered', {
              transport: info.transport,
              proxy_version: info.proxyVersion,
              downtime: core.msBucket(down),
              attempts: c.downAttempts ?? 0,
            }),
          );
          delete c.downSince;
          delete c.downAttempts;
        }
        return out;
      }),

    /** The link to a connected proxy dropped. */
    dropped: (info: { transport: string; proxyVersion: string; cause: DropCause; connectedMs: number; inFlight: number }) =>
      update((s, day) => {
        const out = core.connCount(s, day, { drops: 1, [`drop_${info.cause}`]: 1 });
        s.conn!.downSince ??= Date.now();
        s.conn!.downAttempts = 0;
        return [
          ...out,
          ...core.connEvent(s, day, 'mcp_drop', {
            transport: info.transport,
            proxy_version: info.proxyVersion,
            cause: info.cause,
            connected_for: core.msBucket(info.connectedMs),
            in_flight_calls: Math.min(info.inFlight, 10),
          }),
        ];
      }),

    /**
     * A connect attempt failed. Installs that never connected (no proxy set up) are just "not set up",
     * so for them only unusual failures are reported, not "unreachable".
     */
    connectFailed: (info: { transport: string; message?: string; attempt: number }) =>
      update((s, day) => {
        const reason = core.connectFail(info.message);
        const everConnected = !!s.milestones.mcp_first_connected;
        if (!everConnected && reason === 'unreachable') return [];
        if (s.conn?.downSince) s.conn.downAttempts = (s.conn.downAttempts ?? 0) + 1;
        return [
          ...core.connCount(s, day, { connect_failures: 1, [`connect_fail_${reason}`]: 1 }),
          ...core.connEvent(s, day, 'mcp_connect_failed', {
            transport: info.transport,
            reason,
            attempt: Math.min(info.attempt, 10),
            ever_connected: everConnected,
          }),
        ];
      }),

    /** An MCP tool call finished (browser_* tools are not MCP and are not counted here). */
    toolCall: (info: { ok: boolean; reason?: FailReason; ms: number }) =>
      update((s, day) =>
        core.connCount(s, day, {
          calls: 1,
          ...(info.ok ? {} : { calls_failed: 1, [`call_fail_${info.reason ?? 'other'}`]: 1 }),
          ...(info.ms > 30000 ? { calls_over_30s: 1 } : {}),
          ...(info.ms > 60000 ? { calls_over_60s: 1 } : {}),
          max_call_ms: info.ms,
        }),
      ),

    /** The user pressed Reconnect or saved new server settings. */
    manualReconnect: () => update((s, day) => core.connCount(s, day, { manual_reconnects: 1 })),
  },

  /** Install/update. Cohort and install date are recorded even with statistics off, so they stay right if turned on later. */
  installed: async (reason: string, previousVersion?: string) => {
    try {
      const version = chrome.runtime.getManifest().version;
      const stored = await chrome.storage.local.get<{
        installCohort?: string;
        installDate?: string;
        [STATE_KEY]?: State;
      }>(['installCohort', 'installDate', STATE_KEY]);
      const patch = core.installRecord(
        reason,
        previousVersion,
        version,
        stored.installCohort,
        stored.installDate,
        !!stored[STATE_KEY]?.milestones?.ext_installed,
      );
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
    } catch (e) {
      logger.debug('[Telemetry] install record failed:', e);
    }
    return update(s => {
      if (reason === 'install') return core.milestone(s, 'ext_installed', {});
      // Reloading an unpacked build fires `update` with the same version.
      if (reason === 'update' && previousVersion !== chrome.runtime.getManifest().version)
        return [{ event: 'ext_updated', props: { from_version: previousVersion ?? 'unknown' } }];
      return [];
    });
  },

  /** Daily heartbeat, yesterday's usage_day, and retry of queued sends. Safe to call often. */
  async tick(mcp: { connected: boolean; transport: string; tools: number }) {
    const hb = async (): Promise<Props> => {
      const bb = await browserBridgeStorage.get();
      const fullAccess = await chrome.permissions.contains({ origins: ['<all_urls>'] });
      return {
        mcp_connected: mcp.connected,
        transport: mcp.transport,
        tools_count: core.bucket(mcp.tools),
        browser_tools_enabled: bb.browserToolsEnabled,
        browser_control_enabled: bb.browserControlEnabled,
        full_access: fullAccess,
        // What actually matters: the toggle is on AND the user granted access to all sites.
        browser_tools_usable: bb.browserToolsEnabled && fullAccess,
        ...(await daysSinceInstall()),
      };
    };
    return update(async (s, day) => {
      const props = s.hbDay === day ? {} : await hb();
      return [...s.queue.splice(0), ...core.tick(s, day, () => props)];
    });
  },

  /** Point the browser's uninstall page at our site; with statistics on, it carries the anonymous id. */
  async setUninstallUrl() {
    try {
      const params = (await enabled()) ? `?${new URLSearchParams({ ...(await uninstallParams()) })}` : '';
      await chrome.runtime.setUninstallURL(UNINSTALL_URL + params);
    } catch (e) {
      logger.debug('[Telemetry] uninstall URL not set:', e);
    }
  },
};
