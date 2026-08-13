import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = join(tmpdir(), `mcp-superassistant-json-parser-${process.pid}.mjs`);

try {
  await build({
    entryPoints: ['tests/json-function-parser-multiline.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await unlink(outfile).catch(() => undefined);
}
