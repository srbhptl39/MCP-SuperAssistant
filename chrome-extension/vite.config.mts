import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import libAssetsPlugin from '@laynezh/vite-plugin-lib-assets';
import makeManifestPlugin from './utils/plugins/make-manifest-plugin.js';
import { watchPublicPlugin, watchRebuildPlugin } from '@extension/hmr';
import { watchOption } from '@extension/vite-config';
import env, { IS_DEV, IS_PROD } from '@extension/env';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

const outDir = resolve(rootDir, '..', 'dist');
export default defineConfig({
  define: {
    'process.env': env,
  },
  envPrefix: ['VITE_', 'CEB_'],
  resolve: {
    // NOTE: Vite only supports RegExp aliases via the array form.
    alias: [
      { find: '@root', replacement: rootDir },
      { find: '@src', replacement: srcDir },
      { find: '@assets', replacement: resolve(srcDir, 'assets') },
      // MV3 CSP: ajv-formats can import deep subpaths (e.g. `ajv-formats/dist/formats`).
      // Catch all of them and route to a no-op shim.
      { find: /^ajv-formats(\/.*)?$/, replacement: resolve(srcDir, 'shims', 'ajv-formats.ts') },
      // MV3 CSP: some dependencies (often via MCP SDK) may pull Ajv which uses `new Function()`.
      // Alias all Ajv imports (including subpaths) to a CSP-safe stub to prevent service worker crashes.
      // If upstream removes Ajv, this alias becomes a no-op.
      // Ajv internal imports used by ajv-formats expect codegen exports like `operators`, `_`, `str`, etc.
      { find: 'ajv/dist/compile/codegen', replacement: resolve(srcDir, 'shims', 'ajv-codegen.ts') },
      // Fallback: route any other Ajv entry/subpath to the main Ajv shim.
      { find: /^ajv(\/.*)?$/, replacement: resolve(srcDir, 'shims', 'ajv.ts') },
    ],
  },
  plugins: [
    libAssetsPlugin({
      outputPath: outDir,
    }) as PluginOption,
    watchPublicPlugin(),
    makeManifestPlugin({ outDir }),
    IS_DEV && watchRebuildPlugin({ reload: true, id: 'chrome-extension-hmr' }),
    nodePolyfills(),
  ],
  publicDir: resolve(rootDir, 'public'),
  build: {
    lib: {
      name: 'BackgroundScript',
      fileName: 'background',
      formats: ['es'],
      entry: resolve(srcDir, 'background', 'index.ts'),
    },
    outDir,
    emptyOutDir: false,
    sourcemap: IS_DEV,
    minify: IS_PROD,
    reportCompressedSize: IS_PROD,
    watch: watchOption,
    rollupOptions: {
      external: ['chrome'],
    },
  },
});
