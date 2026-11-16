/**
 * Which tools are enabled, given what is stored. Tools never seen before start enabled, so a new
 * MCP server (or tools from a newer proxy) are on by default while the user's earlier choices hold.
 * Stored names for tools that are not listed right now are kept, so choices for a server that is
 * temporarily disconnected survive.
 *
 * `known` is null on the first run after upgrading (no record of seen tools yet). If the stored set
 * shares names with the current tools, the current tools count as already seen, so their on/off state
 * is kept. Otherwise the stored set describes some other server, and every current tool starts on.
 */
export function resolveEnablement(stored: Set<string>, known: Set<string> | null, current: string[]) {
  const seen = known ?? new Set(current.some(n => stored.has(n)) ? [...stored, ...current] : stored);
  const enabled = new Set(stored);
  const nextKnown = new Set(seen);
  for (const name of current) {
    if (seen.has(name)) continue;
    enabled.add(name);
    nextKnown.add(name);
  }
  return { enabled, known: nextKnown };
}
