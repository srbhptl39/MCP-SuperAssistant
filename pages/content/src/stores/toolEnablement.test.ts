// Run: pnpm dlx tsx --test pages/content/src/stores/toolEnablement.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEnablement } from './toolEnablement';

const s = (...n: string[]) => new Set(n);
const sorted = (x: Set<string>) => [...x].sort();

test('fresh install: everything on', () => {
  const r = resolveEnablement(s(), null, ['a.x', 'a.y']);
  assert.deepEqual(sorted(r.enabled), ['a.x', 'a.y']);
});

test('upgrade with stale names from another server: current tools on, stale kept but harmless', () => {
  const r = resolveEnablement(s('old.1', 'old.2'), null, ['b.x', 'b.y']);
  assert.deepEqual(sorted(r.enabled), ['b.x', 'b.y', 'old.1', 'old.2']);
});

test('upgrade with real choices: a disabled current tool stays off', () => {
  const r = resolveEnablement(s('a.x'), null, ['a.x', 'a.y']);
  assert.deepEqual(sorted(r.enabled), ['a.x']);
});

test('disconnected server keeps its choices; new tools start on', () => {
  const r = resolveEnablement(s('browser_a', 'mcp.x'), s('browser_a', 'mcp.x', 'mcp.y'), ['browser_a', 'browser_b']);
  assert.deepEqual(sorted(r.enabled), ['browser_a', 'browser_b', 'mcp.x']);
  const back = resolveEnablement(r.enabled, r.known, ['browser_a', 'browser_b', 'mcp.x', 'mcp.y']);
  assert.deepEqual(sorted(back.enabled), ['browser_a', 'browser_b', 'mcp.x']); // mcp.y stays off
});

test('disable all survives a reload', () => {
  const r = resolveEnablement(s(), s('a.x', 'a.y'), ['a.x', 'a.y']);
  assert.deepEqual(sorted(r.enabled), []);
});
