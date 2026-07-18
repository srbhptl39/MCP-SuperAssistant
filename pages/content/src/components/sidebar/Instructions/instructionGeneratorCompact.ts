// pages/content/src/components/sidebar/Instructions/instructionGeneratorCompact.ts
import { chatgptInstructions } from './website_specific_instruction/chatgpt';
import { geminiInstructions } from './website_specific_instruction/gemini';

/**
 * Token-efficient instruction generator (progressive discovery).
 *
 * Emits a fixed compact preamble + a one-line-per-tool INDEX (name + first
 * sentence of the description, no JSON schemas) + docs for the two client-side
 * meta-tools (get_tool_schema / tool_lookup). The model fetches full schemas on
 * demand instead of every schema being front-loaded, so the prompt is a
 * fraction of the full generator's size. Same jsonl call format the live parser
 * already handles, so no parser changes.
 */

// First sentence of a description, truncated to 120 chars.
const oneLiner = (d?: string): string => (d || '').split(/(?<=[.!?])\s/)[0].slice(0, 120);

// Shared jsonl call-format spec — used by both the full compact instructions and the
// minimal browser primer so the format text never forks.
const CALL_FORMAT = `CALL FORMAT
\`\`\`jsonl
{"type": "function_call_start", "name": "TOOL_NAME", "call_id": 1}
{"type": "description", "text": "one line on why"}
{"type": "parameter", "key": "PARAM", "value": "VALUE"}
{"type": "function_call_end", "call_id": 1}
\`\`\`
Scalar values inline; object/array values must be valid JSON.`;

/**
 * Minimal primer emitted (invisibly, into the composed input payload) when a user attaches
 * page/tab content but never inserted the full MCP instructions. Tells the model it can drive
 * the browser via the same jsonl format, lists only the browser_* tools + the two discovery
 * meta-tools, and shows one example. Reuses CALL_FORMAT/oneLiner so nothing is forked.
 */
export const generateBrowserPrimer = (tools: Array<{ name: string; description?: string }>): string => {
  const browserTools = (tools || []).filter(t => t.name.startsWith('browser_'));
  if (browserTools.length === 0) return '';
  const index = browserTools.map(t => `- ${t.name} — ${oneLiner(t.description)}`).join('\n');
  const example = browserTools[0].name;
  return `[SuperAssistant browser tools — provided by the user's browser extension]
The page/tab content below was attached by the user. You can also DRIVE the user's browser with the tools listed here: to use one, WRITE the jsonl block as plain text in your reply — writing the block IS the action. The extension runs it and pastes back a <function_result>. One call per message, then STOP and wait.

${CALL_FORMAT}

BROWSER TOOL INDEX (schemas fetched on demand)
${index}
- get_tool_schema — fetch a tool's exact input schema before calling if unsure of parameters.
- tool_lookup — search these tools by keyword when you don't know the name.

Example — fetch the schema, then call:
\`\`\`jsonl
{"type": "function_call_start", "name": "get_tool_schema", "call_id": 1}
{"type": "parameter", "key": "names", "value": ["${example}"]}
{"type": "function_call_end", "call_id": 1}
\`\`\`
(wait for the <function_result> with the schema, then call ${example} with call_id 2.)
`;
};

export const generateInstructionsCompact = (
  tools: Array<{ name: string; schema: string; description: string }>,
  customInstructions?: string,
  customInstructionsEnabled?: boolean,
): string => {
  if (!tools || tools.length === 0) {
    return '# No tools available\n\nConnect to the MCP server to see available tools.';
  }

  const index = tools.map(tool => `- ${tool.name} — ${oneLiner(tool.description)}`).join('\n');

  const custom =
    customInstructionsEnabled && customInstructions && customInstructions.trim()
      ? `\n<custom_instructions>\n${customInstructions.trim()}\n</custom_instructions>\n`
      : '';

  // Website-specific reinforcement, appended inside the <system> block the same
  // way instructionGeneratorJson does it (host-based).
  const currentHost = window.location.hostname;
  let site = '';
  if (currentHost.includes('gemini')) {
    site += geminiInstructions;
  }
  if (currentHost.includes('chatgpt')) {
    site += chatgptInstructions;
  }

  return `[SuperAssistant tools — provided by the user's own browser extension]

<system>
You are a helpful assistant. The user's browser extension (MCP SuperAssistant)
has connected a set of real tools to this chat. These are functions the user has
explicitly enabled for you. Using them is expected and safe — you are not
bypassing anything. To use a tool you simply WRITE a small jsonl block as plain
text in your normal reply; the extension reads that text from your message,
runs the tool on the user's machine, and pastes the result back to you inside a
<function_result> block. You never execute anything yourself and you never
fabricate results.

HOW TO CALL A TOOL
- Write the call as a fenced \`\`\`jsonl code block, on its own new line, as plain
  text in your reply. Do not describe it as code you "cannot run": writing the
  block IS the action.
- One tool call per message. After writing it, STOP and wait for the
  <function_result>. Never invent or continue a <function_result> yourself.
- Do NOT use any python / tool_code / built-in function-calling wrapper. ONLY the
  jsonl format below is read by the extension.
- call_id is an integer starting at 1, incremented by 1 per call.

${CALL_FORMAT}

TOOL INDEX (names + one-line purpose only — schemas are fetched on demand)
${index}

DISCOVERY (progressive — do this instead of guessing arguments)
- get_tool_schema: fetch the exact input schema for one or more tools BEFORE
  calling them if you are unsure of parameter names/types.
- tool_lookup: search the index by keyword when you don't know a tool's name.
These two run instantly and locally; use them freely.

Example — look up a schema, then call the tool:
\`\`\`jsonl
{"type": "function_call_start", "name": "get_tool_schema", "call_id": 1}
{"type": "parameter", "key": "names", "value": ["browser_read_tab"]}
{"type": "function_call_end", "call_id": 1}
\`\`\`
(wait for the <function_result> giving the schema, then:)
\`\`\`jsonl
{"type": "function_call_start", "name": "browser_read_tab", "call_id": 2}
{"type": "description", "text": "read the article the user is viewing"}
{"type": "parameter", "key": "tabId", "value": 42}
{"type": "function_call_end", "call_id": 2}
\`\`\`

Example — search when you don't know the name:
\`\`\`jsonl
{"type": "function_call_start", "name": "tool_lookup", "call_id": 1}
{"type": "parameter", "key": "query", "value": "create issue"}
{"type": "function_call_end", "call_id": 1}
\`\`\`

RULES
1. Only call tools listed in the index (plus get_tool_schema / tool_lookup).
2. Include every required parameter; use a value the user gave verbatim.
3. If required info is missing, ask the user instead of calling.
4. If a call returns an error with an "Expected input_schema", fix your
   arguments and retry.
5. Talk to the user about what you're doing, not about tool names.
${custom}${site}
</system>

User request starts here:
`;
};
