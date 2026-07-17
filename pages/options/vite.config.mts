import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'options'),
    rollupOptions: {
      input: resolve(rootDir, 'index.html'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
});
