// Run: npx tsx --test chrome-extension/utils/telemetry-core.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as t from './telemetry-core';

const D1 = '2026-11-14';
const D2 = '2026-11-15';
const names = (evs: t.Ev[]) => evs.map(e => e.event);

test('site() only ever yields the enum', () => {
  assert.equal(t.site('chatgpt'), 'chatgpt');
  assert.equal(t.site('zchat'), 'zai');
  assert.equal(t.site('https://chatgpt.com/c/abc?x=1'), 'chatgpt');
  assert.equal(t.site('https://www.kimi.ai/chat'), 'kimi');
  assert.equal(t.site('https://evilchatgpt.com/'), 'other');
  assert.equal(t.site('evil.example.com'), 'other');
  assert.equal(t.site(undefined), 'other');
  assert.ok(t.isFeature('chip') && !t.isFeature('page_view'));
});

test('record: active_day once per day, counters keep rising', () => {
  const s = t.emptyState();
  assert.deepEqual(names(t.record(s, D1, 'tool_run', 'chatgpt')), ['active_day']);
  assert.deepEqual(t.record(s, D1, 'tool_run', 'chatgpt'), []);
  assert.deepEqual(t.record(s, D1, 'chip', 'claude'), []);
  assert.equal(s.counts.tool_runs, 2);
  assert.deepEqual(s.sites, ['chatgpt', 'claude']);
});

test('day rollover: one usage_day stamped to the old day, then nothing', () => {
  const s = t.emptyState();
  t.record(s, D1, 'tool_run', 'chatgpt');
  t.bump(s, D1, 'mcp_connect_fail');
  s.hbDay = D1;
  const evs = t.tick(s, D2, () => ({ mcp_connected: true }));
  assert.deepEqual(names(evs), ['usage_day', 'heartbeat']);
  assert.equal(new Date(evs[0].ts!).toISOString().slice(0, 10), D1);
  assert.equal(evs[0].props.tool_runs, 1);
  assert.equal(evs[0].props.mcp_connect_fail, 1);
  assert.deepEqual(s.counts, {});
  assert.deepEqual(
    t.tick(s, D2, () => ({})),
    [],
  );
  // next engagement on the new day still gets its active_day
  assert.deepEqual(names(t.record(s, D2, 'sidebar', 'grok')), ['active_day']);
});

test('no usage_day for a day without engagement; heartbeat once per day', () => {
  const s = t.emptyState();
  t.bump(s, D1, 'mcp_connect_fail');
  assert.deepEqual(names(t.tick(s, D2, () => ({}))), ['heartbeat']);
  assert.deepEqual(
    t.tick(s, D2, () => ({})),
    [],
  );
});

test('caps: errors 5/day, milestones once', () => {
  const s = t.emptyState();
  const n = Array.from({ length: 8 }, () => t.error(s, D1, 'tool_failed', 'other').length).reduce((a, b) => a + b);
  assert.equal(n, t.MAX_ERRORS_PER_DAY);
  assert.equal(t.error(s, D2, 'sw_unhandled', 'other').length, 1);
  assert.equal(t.milestone(s, 'activated', {}).length, 1);
  assert.equal(t.milestone(s, 'activated', {}).length, 0);
});

test('GA4 body: flat scalars, engagement only on engaged events, nothing older than 72h', () => {
  const now = Date.parse(`${D2}T12:00:00Z`);
  const usage = {
    event: 'usage_day',
    ts: Date.parse(`${D1}T23:59:59Z`),
    props: { sites: ['chatgpt', 'claude'], tool_runs: 3 },
  };
  const body = t.gaBody('id', usage, { ext_version: '1' }, now)!;
  assert.deepEqual(body.events[0].params, { ext_version: '1', sites: 'chatgpt,claude', tool_runs: 3 });
  const hb = t.gaBody('id', { event: 'heartbeat', props: { mcp_connected: false } }, {}, now)!;
  assert.equal(hb.events[0].params.mcp_connected, 'false');
  assert.equal(hb.events[0].params.engagement_time_msec, 100);
  assert.equal(t.gaBody('id', { ...usage, ts: now - 73 * 3600_000 }, {}, now), null);
});

test('serial(): 20 concurrent read-modify-writes lose nothing', async () => {
  let stored = t.emptyState();
  const load = async () => {
    await new Promise(r => setTimeout(r, Math.random() * 5));
    return structuredClone(stored);
  };
  const locked = t.serial();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      locked(async () => {
        const s = await load();
        t.record(s, D1, 'tool_run', 'chatgpt');
        stored = s;
      }),
    ),
  );
  assert.equal(stored.counts.tool_runs, 20);
  // a failing section doesn't break the chain
  await assert.rejects(locked(async () => Promise.reject(new Error('x'))));
  assert.equal(await locked(async () => 1), 1);
});

test('failReason buckets messages into fixed codes', () => {
  assert.equal(t.failReason('Request timed out after 30s'), 'timeout');
  assert.equal(t.failReason("Tool 'x' not found on server"), 'not_found');
  assert.equal(t.failReason('MCP error -32602: Invalid params'), 'invalid_args');
  assert.equal(t.failReason('fetch failed: ECONNREFUSED'), 'disconnected');
  assert.equal(t.failReason('boom'), 'other');
  assert.equal(t.failReason(undefined, true), 'tool_error');
});

test('cards: per-site counts land in usage_day even without engagement', () => {
  const s = t.emptyState();
  t.card(s, D1, 'gemini');
  t.card(s, D1, 'gemini');
  t.card(s, D1, 'claude');
  const [u] = t.tick(s, D2, () => ({}));
  assert.equal(u.event, 'usage_day');
  assert.deepEqual(u.props.cards_by_site, { gemini: 2, claude: 1 });
  assert.equal(u.props.cards_rendered, 3);
  assert.deepEqual(s.cards, {});
});

test('oncePerDay sends once per UTC day', () => {
  const s = t.emptyState();
  assert.equal(t.oncePerDay(s, D1, 'proxy_connected_day', {}).length, 1);
  assert.equal(t.oncePerDay(s, D1, 'proxy_connected_day', {}).length, 0);
  assert.equal(t.oncePerDay(s, D2, 'proxy_connected_day', {}).length, 1);
});

test('GA4 body flattens objects to a short JSON string', () => {
  const body = t.gaBody('id', { event: 'usage_day', props: { cards_by_site: { gemini: 2 } } }, {}, Date.now())!;
  assert.equal(body.events[0].params.cards_by_site, '{"gemini":2}');
});

test('installRecord: cohort and date', () => {
  const r = t.installRecord('install', undefined, '0.7.2', undefined, undefined, false);
  assert.equal(r.installCohort, 'new');
  assert.ok(r.installDate && r.installDate !== 'unknown');
  assert.deepEqual(t.installRecord('update', '0.6.0', '0.7.2', undefined, undefined, false), {
    installCohort: 'existing',
    installDate: 'unknown',
  });
  assert.deepEqual(t.installRecord('update', '0.7.1', '0.7.2', undefined, undefined, true), { installCohort: 'new' });
  assert.deepEqual(t.installRecord('update', '0.7.2', '0.7.2', undefined, undefined, false), {}); // reload
  assert.deepEqual(t.installRecord('update', '0.7.1', '0.7.2', undefined, '2026-11-17T00:00:00Z', false), {
    installCohort: 'existing',
    installDate: 'unknown',
  }); // 0.6 -> 0.7.0 updater whose date was faked
  assert.deepEqual(t.installRecord('update', '0.6.0', '0.7.2', 'new', '2026-01-01', false), {}); // already recorded
});

test('connectFail maps messages to fixed codes', () => {
  assert.equal(t.connectFail('TypeError: Failed to fetch'), 'unreachable');
  assert.equal(t.connectFail('WebSocket connection failed'), 'unreachable');
  assert.equal(t.connectFail('MCP client connection timeout after 30000ms'), 'timeout');
  assert.equal(t.connectFail('Session not found (404)'), 'session');
  assert.equal(t.connectFail('Invalid WebSocket protocol: http:'), 'bad_config');
  assert.equal(t.connectFail('weird'), 'other');
});

test('proxyVersion only names our proxy; serverCount ignores browser tools', () => {
  assert.equal(t.proxyVersion('mcp-superassistant-proxy-unified', '0.1.9'), '0.1.9');
  assert.equal(t.proxyVersion('my-secret-server', '2.0'), 'other');
  assert.equal(t.proxyVersion(undefined, undefined), 'unknown');
  assert.equal(t.serverCount(['github.create_issue', 'github.list', 'fs.read', 'browser_click', 'plain']), 2);
});

test('connection_day: counts and maxes per day, sent on rollover even without engagement', () => {
  const s = t.emptyState();
  t.connCount(s, '2026-11-20', { drops: 1, max_call_ms: 500 }, { transport: 'sse' });
  t.connCount(s, '2026-11-20', { drops: 1, max_call_ms: 200 });
  const out = t.tick(s, '2026-11-21', () => ({}));
  const day = out.find(e => e.event === 'connection_day');
  assert.ok(day);
  assert.deepEqual(
    { drops: day.props.drops, max: day.props.max_call_ms, t: day.props.transport },
    { drops: 2, max: 500, t: 'sse' },
  );
  assert.equal(t.tick(s, '2026-11-22', () => ({})).filter(e => e.event === 'connection_day').length, 0);
});

test('connEvent is capped per event per day', () => {
  const s = t.emptyState();
  const sent = Array.from({ length: 8 }, () => t.connEvent(s, '2026-11-20', 'mcp_drop', {})).flat();
  assert.equal(sent.length, t.MAX_CONN_EVENTS_PER_DAY);
  assert.equal(t.connEvent(s, '2026-11-21', 'mcp_drop', {}).filter(e => e.event === 'mcp_drop').length, 1);
});
