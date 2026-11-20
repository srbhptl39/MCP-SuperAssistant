/**
 * Pure telemetry decisions (no chrome.* / network), unit-tested in telemetry-core.test.ts.
 * Every recurring event is capped per install per UTC day, using state persisted in storage.
 */

export const SITES = [
  'chatgpt',
  'claude',
  'gemini',
  'aistudio',
  'perplexity',
  'grok',
  'deepseek',
  'copilot',
  'mistral',
  'qwen',
  'kimi',
  'zai',
  't3chat',
  'openrouter',
] as const;
export const FEATURES = [
  'tool_run',
  'auto_execute',
  'browser_tool',
  'tab_attach',
  'capture',
  'chip',
  'sidebar',
] as const;
export type Feature = (typeof FEATURES)[number];
export type Props = Record<string, string | number | boolean | string[] | Record<string, number>>;
export interface Ev {
  event: string;
  props: Props;
  ts?: number; // epoch ms; defaults to now when sent
  retry?: boolean; // re-sent from the queue (already mirrored to GA4)
}

// Feature -> usage_day counter.
const COUNTER: Record<Feature, string> = {
  tool_run: 'tool_runs',
  auto_execute: 'auto_runs',
  browser_tool: 'browser_tool_runs',
  tab_attach: 'tab_attaches',
  capture: 'captures',
  chip: 'chips',
  sidebar: 'sidebar_opens',
};
const HOSTS: [string, string][] = [
  ['chatgpt.com', 'chatgpt'],
  ['chat.openai.com', 'chatgpt'],
  ['claude.ai', 'claude'],
  ['gemini.google.com', 'gemini'],
  ['aistudio.google.com', 'aistudio'],
  ['perplexity.ai', 'perplexity'],
  ['grok.com', 'grok'],
  ['x.com', 'grok'],
  ['twitter.com', 'grok'],
  ['chat.deepseek.com', 'deepseek'],
  ['github.com', 'copilot'],
  ['chat.mistral.ai', 'mistral'],
  ['chat.qwen.ai', 'qwen'],
  ['kimi.com', 'kimi'],
  ['kimi.ai', 'kimi'],
  ['chat.z.ai', 'zai'],
  ['t3.chat', 't3chat'],
  ['openrouter.ai', 'openrouter'],
];
export const MAX_ERRORS_PER_DAY = 5;
export const MAX_QUEUE = 50;
export type ErrorCode = 'tool_failed' | 'sw_unhandled';
/** Why a tool call failed, as a fixed code. Never the message itself. */
export type FailReason = 'timeout' | 'not_found' | 'invalid_args' | 'disconnected' | 'tool_error' | 'other';

export function failReason(message: string | undefined, toolReportedError = false): FailReason {
  if (toolReportedError) return 'tool_error';
  const m = (message ?? '').toLowerCase();
  if (/timed? ?out|etimedout/.test(m)) return 'timeout';
  if (/not found|not available|-32601/.test(m)) return 'not_found';
  if (/invalid (arguments|params|parameters)|-32602|-32600|validation/.test(m)) return 'invalid_args';
  if (/econnrefused|connection|network|fetch failed|not connected|transport|disconnect/.test(m)) return 'disconnected';
  return 'other';
}

/** Why the link to the proxy dropped while it was connected. */
export type DropCause = 'health_timeout' | 'health_unreachable' | 'socket_closed' | 'call_lost' | 'other';
/** Why a connect attempt failed, as a fixed code. Never the message itself. */
export type ConnectFail = 'unreachable' | 'timeout' | 'session' | 'bad_config' | 'other';

export function connectFail(message: string | undefined): ConnectFail {
  const m = (message ?? '').toLowerCase();
  if (/timed? ?out|etimedout/.test(m)) return 'timeout';
  if (/session|\b404\b/.test(m)) return 'session';
  if (/invalid|protocol|url|not support/.test(m)) return 'bad_config';
  if (/refused|failed to fetch|fetch failed|connection failed|network|unavailable|not connected|err_connection|sse error|websocket/.test(m))
    return 'unreachable';
  return 'other';
}

/** Durations as coarse buckets, so no exact timings are sent. */
export const msBucket = (ms: number) =>
  ms < 1000 ? '<1s' : ms < 5000 ? '1-5s' : ms < 15000 ? '5-15s' : ms < 60000 ? '15-60s' : ms < 300000 ? '1-5m' : '5m+';

/** Our proxy reports its version; any other MCP server is just "other" (no names sent). */
export const proxyVersion = (name?: string, version?: string) =>
  !name ? 'unknown' : /superassistant/i.test(name) ? (version || 'unknown').slice(0, 20) : 'other';

/** Distinct MCP servers behind the proxy, from "server.tool" names (browser_* tools are ours, not counted). */
export const serverCount = (toolNames: string[]) =>
  new Set(toolNames.filter(n => !n.startsWith('browser_') && n.includes('.')).map(n => n.split('.')[0])).size;

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Map a site id, URL or hostname to the fixed site enum. Never returns anything else. */
export function site(v?: string): string {
  if (!v) return 'other';
  if (v === 'zchat') return 'zai'; // AiPlatformId spelling
  if ((SITES as readonly string[]).includes(v)) return v;
  let host = v.toLowerCase();
  try {
    host = new URL(v).hostname;
  } catch {
    /* already a hostname */
  }
  return HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? 'other';
}

export const isFeature = (f: unknown): f is Feature => (FEATURES as readonly unknown[]).includes(f);

export const bucket = (n: number) => (n <= 0 ? '0' : n <= 5 ? '1-5' : n <= 20 ? '6-20' : n <= 50 ? '21-50' : '51+');

export interface State {
  hbDay?: string;
  activeDay?: string;
  day?: string; // the UTC day `counts` belong to
  counts: Record<string, number>;
  sites: string[];
  features: string[];
  errDay?: string;
  errors: number;
  milestones: Record<string, boolean>;
  queue: Ev[]; // PostHog sends that failed; retried on tick
  cards?: Record<string, number>; // tool cards rendered today, per site
  once?: Record<string, string>; // once-per-day event name -> last day sent
  conn?: ConnState; // connection health for connection_day
}

/** Connection health for one UTC day, sent as connection_day; kept apart from usage_day so it is sent even without engagement. */
export interface ConnState {
  day?: string;
  counts: Record<string, number>;
  info: Record<string, string>; // last transport / proxy_version / tools_count / servers_count seen that day
  capped: Record<string, number>; // event name -> sent today (MAX_CONN_EVENTS_PER_DAY)
  downSince?: number; // epoch ms the link dropped, until it recovers
  downAttempts?: number;
}
export const MAX_CONN_EVENTS_PER_DAY = 5;

export const emptyState = (): State => ({ counts: {}, sites: [], features: [], errors: 0, milestones: {}, queue: [] });

/** Close out a finished day: one usage_day (only if it had engagement), timestamped to that day. */
function rollover(s: State, day: string): Ev[] {
  if (!s.day || s.day >= day) return [];
  const cards = s.cards ?? {};
  const out: Ev[] =
    s.features.length || Object.keys(cards).length
      ? [
          {
            event: 'usage_day',
            ts: Date.parse(`${s.day}T23:59:59Z`),
            props: { day: s.day, sites: s.sites, features: s.features, ...s.counts, cards_by_site: cards },
          },
        ]
      : [];
  Object.assign(s, { day, counts: {}, sites: [], features: [], cards: {} });
  return out;
}

const conn = (s: State): ConnState => (s.conn ??= { counts: {}, info: {}, capped: {} });

/** Close out a finished day of connection health: one connection_day if anything happened. */
function connRollover(s: State, day: string): Ev[] {
  const c = conn(s);
  if (c.day && c.day < day) {
    const out: Ev[] = Object.keys(c.counts).length
      ? [{ event: 'connection_day', ts: Date.parse(`${c.day}T23:59:59Z`), props: { day: c.day, ...c.info, ...c.counts } }]
      : [];
    Object.assign(c, { counts: {}, capped: {} });
    c.day = day;
    return out;
  }
  c.day = day;
  return [];
}

/** Add to connection_day counters (`max_*` keys keep the day's maximum) and remember context. */
export function connCount(s: State, day: string, add: Record<string, number>, info: Record<string, string> = {}): Ev[] {
  const out = connRollover(s, day);
  const c = conn(s);
  for (const [k, v] of Object.entries(add)) c.counts[k] = k.startsWith('max_') ? Math.max(c.counts[k] ?? 0, v) : (c.counts[k] ?? 0) + v;
  Object.assign(c.info, info);
  return out;
}

/** A diagnostic event, at most MAX_CONN_EVENTS_PER_DAY of each name per UTC day. */
export function connEvent(s: State, day: string, event: string, props: Props): Ev[] {
  const out = connRollover(s, day);
  const c = conn(s);
  if ((c.capped[event] ?? 0) >= MAX_CONN_EVENTS_PER_DAY) return out;
  c.capped[event] = (c.capped[event] ?? 0) + 1;
  return [...out, { event, props }];
}

/** Count a non-engagement counter (mcp_connect_ok, mcp_connect_fail, tool_errors). */
export function bump(s: State, day: string, counter: string): Ev[] {
  const out = rollover(s, day);
  s.day = day;
  s.counts[counter] = (s.counts[counter] ?? 0) + 1;
  return out;
}

/** An engagement: increments counters and sends active_day once per UTC day. */
export function record(s: State, day: string, feature: Feature, siteId: string): Ev[] {
  const out = bump(s, day, COUNTER[feature]);
  if (!s.features.includes(feature)) s.features.push(feature);
  if (!s.sites.includes(siteId)) s.sites.push(siteId);
  if (s.activeDay !== day) {
    s.activeDay = day;
    out.push({ event: 'active_day', props: { site: siteId, feature } });
  }
  return out;
}

/** Alarm / startup tick: daily heartbeat and yesterday's usage_day. */
export function tick(s: State, day: string, heartbeat: () => Props): Ev[] {
  const out = [...rollover(s, day), ...connRollover(s, day)];
  if (s.hbDay !== day) {
    s.hbDay = day;
    out.push({ event: 'heartbeat', props: heartbeat() });
  }
  return out;
}

/**
 * What to store on install/update: installCohort ('new' installed with telemetry, 'existing' came from
 * a version before it) and installDate (ISO, or 'unknown' for those older installs). Runs once per install.
 */
export function installRecord(
  reason: string,
  previousVersion: string | undefined,
  version: string,
  cohort: string | undefined,
  installDate: string | undefined,
  hadInstallMilestone: boolean,
): { installCohort?: string; installDate?: string } {
  if (reason === 'install') {
    const out: { installCohort?: string; installDate?: string } = {};
    if (!cohort) out.installCohort = 'new';
    if (!installDate) out.installDate = new Date().toISOString();
    return out;
  }
  if (reason !== 'update' || previousVersion === version || cohort) return {}; // reload, or already recorded
  // A fresh 0.7+ install with statistics on has the ext_installed milestone. Without it, assume the install
  // predates telemetry: 0.7.0/0.7.1 stored "today" as its install date on first use, so that date is wrong too.
  if (hadInstallMilestone) return { installCohort: 'new' };
  return { installCohort: 'existing', installDate: 'unknown' };
}

/** A tool card rendered on a site (also from chat history). Counts only; not an engagement. */
export function card(s: State, day: string, siteId: string): Ev[] {
  const out = bump(s, day, 'cards_rendered');
  s.cards = { ...s.cards, [siteId]: (s.cards?.[siteId] ?? 0) + 1 };
  return out;
}

/** An event sent at most once per UTC day. */
export function oncePerDay(s: State, day: string, event: string, props: Props): Ev[] {
  if (s.once?.[event] === day) return [];
  s.once = { ...s.once, [event]: day };
  return [{ event, props }];
}

export function milestone(s: State, name: string, props: Props): Ev[] {
  if (s.milestones[name]) return [];
  s.milestones[name] = true;
  return [{ event: name, props }];
}

export function error(s: State, day: string, code: ErrorCode, siteId: string, reason?: FailReason, extra: Props = {}): Ev[] {
  if (s.errDay !== day) Object.assign(s, { errDay: day, errors: 0 });
  if (s.errors >= MAX_ERRORS_PER_DAY) return [];
  s.errors++;
  const props: Props = { code, site: siteId, ...extra };
  if (reason) props.reason = reason;
  return [{ event: 'ext_error', props }]; // `error` is reserved in GA4
}

/** Serialize async read-modify-write sections so concurrent messages can't lose increments. */
export function serial() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
}

// --- Provider payloads ---------------------------------------------------------

const GA_MAX_AGE_MS = 71 * 3600_000; // GA4 drops events older than 72h
const GA_ENGAGED = new Set(['active_day', 'heartbeat']);

export const posthogBatch = (key: string, id: string, evs: Ev[], common: Props, now = Date.now()) => ({
  api_key: key,
  batch: evs.map(e => ({
    event: e.event,
    timestamp: new Date(e.ts ?? now).toISOString(),
    properties: { distinct_id: id, ...common, ...e.props, $geoip_disable: true },
  })),
});

/** GA4 Measurement Protocol body for one event: flat scalar params, session/engagement only on engaged events. */
export function gaBody(id: string, e: Ev, common: Props, now = Date.now()) {
  const ts = e.ts ?? now;
  if (now - ts > GA_MAX_AGE_MS) return null;
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries({ ...common, ...e.props }))
    params[k] = Array.isArray(v)
      ? v.join(',').slice(0, 100)
      : typeof v === 'boolean'
        ? String(v)
        : typeof v === 'object'
          ? JSON.stringify(v).slice(0, 100)
          : v;
  if (GA_ENGAGED.has(e.event))
    Object.assign(params, { session_id: String(Math.floor(ts / 1000)), engagement_time_msec: 100 });
  return { client_id: id, timestamp_micros: ts * 1000, events: [{ name: e.event, params }] };
}
