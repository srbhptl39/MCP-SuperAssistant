import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'window', {
  value: { location: { href: 'https://aistudio.google.com/' } },
  configurable: true,
});

const { extractJSONParameters } = await import(
  '../pages/content/src/render_prescript/src/parser/jsonFunctionParser.ts'
);

const multilineArrayCall = `
\`\`\`jsonl
{"type":"function_call_start","name":"create_project_artifact_from_lines","call_id":1}
{"type":"parameter","key":"project_name","value":"PathAI_V2"}
{"type":"parameter","key":"content_lines","value":[
  "# Architecture",
  "",
  "\`\`\`python",
  "payload = {\\"nested\\": true}",
  "\`\`\`"
]}
{"type":"function_call_end","call_id":1}
\`\`\`
`;

assert.deepEqual(extractJSONParameters(multilineArrayCall), {
  project_name: 'PathAI_V2',
  content_lines: ['# Architecture', '', '```python', 'payload = {"nested": true}', '```'],
});

const nestedObjectCall = `
{"type":"function_call_start","name":"example","call_id":2}
{
  "type": "parameter",
  "key": "settings",
  "value": {
    "policy": {"mode": "strict", "roles": ["owner", "teacher"]},
    "enabled": true
  }
}
{"type":"function_call_end","call_id":2}
`;

assert.deepEqual(extractJSONParameters(nestedObjectCall), {
  settings: {
    policy: { mode: 'strict', roles: ['owner', 'teacher'] },
    enabled: true,
  },
});

const compactScalarCall = `
{"type":"function_call_start","name":"example","call_id":3}
{"type":"parameter","key":"name","value":"unchanged"}
{"type":"parameter","key":"count","value":4}
{"type":"function_call_end","call_id":3}
`;

assert.deepEqual(extractJSONParameters(compactScalarCall), {
  name: 'unchanged',
  count: 4,
});

const partialStringCall = `
{"type":"function_call_start","name":"example","call_id":4}
{"type":"parameter","key":"content","value":"partial text still streaming`;

assert.deepEqual(extractJSONParameters(partialStringCall), {
  content: 'partial text still streaming',
});

console.log('json-function-parser multiline regression tests: passed');
