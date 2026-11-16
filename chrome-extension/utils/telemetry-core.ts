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
export type Props = Record<string, string | number | boolean | string[]>;
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
}

export const emptyState = (): State => ({ counts: {}, sites: [], features: [], errors: 0, milestones: {}, queue: [] });

/** Close out a finished day: one usage_day (only if it had engagement), timestamped to that day. */
function rollover(s: State, day: string): Ev[] {
  if (!s.day || s.day >= day) return [];
  const out: Ev[] = s.features.length
    ? [
        {
          event: 'usage_day',
          ts: Date.parse(`${s.day}T23:59:59Z`),
          props: { day: s.day, sites: s.sites, features: s.features, ...s.counts },
        },
      ]
    : [];
  Object.assign(s, { day, counts: {}, sites: [], features: [] });
  return out;
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
  const out = rollover(s, day);
  if (s.hbDay !== day) {
    s.hbDay = day;
    out.push({ event: 'heartbeat', props: heartbeat() });
  }
  return out;
}

export function milestone(s: State, name: string, props: Props): Ev[] {
  if (s.milestones[name]) return [];
  s.milestones[name] = true;
  return [{ event: name, props }];
}

export function error(s: State, day: string, code: ErrorCode, siteId: string): Ev[] {
  if (s.errDay !== day) Object.assign(s, { errDay: day, errors: 0 });
  if (s.errors >= MAX_ERRORS_PER_DAY) return [];
  s.errors++;
  return [{ event: 'ext_error', props: { code, site: siteId } }]; // `error` is reserved in GA4
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
    params[k] = Array.isArray(v) ? v.join(',').slice(0, 100) : typeof v === 'boolean' ? String(v) : v;
  if (GA_ENGAGED.has(e.event))
    Object.assign(params, { session_id: String(Math.floor(ts / 1000)), engagement_time_msec: 100 });
  return { client_id: id, timestamp_micros: ts * 1000, events: [{ name: e.event, params }] };
}
