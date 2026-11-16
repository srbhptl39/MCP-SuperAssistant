import type { UserConfig } from 'vite';
import { defineConfig } from 'vite';
import { watchRebuildPlugin } from '@extension/hmr';
import react from '@vitejs/plugin-react-swc';
import deepmerge from 'deepmerge';
import { IS_DEV, IS_PROD } from '@extension/env';

export const watchOption = IS_DEV
  ? {
      exclude: [/\/pages\/content-ui\/dist\/.*\.(css)$/],
      chokidar: {
        awaitWriteFinish: true,
        ignored: [/\/packages\/.*\.(ts|tsx|map)$/, /\/pages\/content-ui\/dist\/.*/],
      },
    }
  : undefined;

export const withPageConfig = (config: UserConfig) =>
  defineConfig(
    deepmerge(
      {
        define: {
          // Only NODE_ENV: defining the whole env object inlined every .env value (API secrets
          // included) into every page bundle, the content script that runs on AI sites among them.
          'process.env': JSON.stringify({ NODE_ENV: IS_DEV ? 'development' : 'production' }),
        },
        base: '',
        plugins: [react(), IS_DEV && watchRebuildPlugin({ refresh: true })],
        build: {
          sourcemap: IS_DEV,
          minify: IS_PROD,
          reportCompressedSize: IS_PROD,
          emptyOutDir: IS_PROD,
          watch: watchOption,
          rollupOptions: {
            external: ['chrome'],
          },
        },
      },
      config,
    ),
  );
