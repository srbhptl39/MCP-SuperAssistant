import { useToolStore } from '../stores/tool.store';

/**
 * Meta-tools — client-side discovery helpers that never reach the background /
 * MCP proxy. They read the tool list (with schemas) already held in the tool
 * store and return the standard `{ content: [{ type:'text', text }] }` shape so
 * the existing result/auto-insert pipeline is unchanged.
 *
 * The names below are a fixed cross-agent contract: the compact prompt, the
 * functionBlock auto-run bypass, and the mcp-client intercept all reference
 * exactly these strings.
 */
export const GET_TOOL_SCHEMA = 'get_tool_schema';
export const TOOL_LOOKUP = 'tool_lookup';
export const META_TOOLS = new Set<string>([GET_TOOL_SCHEMA, TOOL_LOOKUP]);

export function runMetaTool(name: string, args: Record<string, unknown>) {
  const tools = useToolStore.getState().availableTools;

  if (name === GET_TOOL_SCHEMA) {
    const names: string[] = Array.isArray((args as any).names)
      ? ((args as any).names as string[])
      : (args as any).name
        ? [(args as any).name as string]
        : [];
    const found = names
      .map(n => tools.find(t => t.name === n))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
    const missing = names.filter(n => !tools.some(t => t.name === n));
    const text = found.length
      ? JSON.stringify(found, null, 2) + (missing.length ? `\n\nUnknown tools: ${missing.join(', ')}` : '')
      : `No matching tools. Unknown: ${names.join(', ')}. Use ${TOOL_LOOKUP} to search.`;
    return { content: [{ type: 'text', text }] };
  }

  // tool_lookup: fuzzy name/description search → returns the index (name + one-liner), no schema
  const q = String((args as any).query || '').toLowerCase();
  const hits = tools
    .filter(t => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
    .slice(0, 25)
    .map(t => `- ${t.name} — ${(t.description || '').slice(0, 120)}`);
  return { content: [{ type: 'text', text: hits.length ? hits.join('\n') : `No tools match "${q}".` }] };
}
