import type { Config } from 'tailwindcss';
import baseConfig from '@extension/tailwindcss-config';

export default {
  ...baseConfig,
  content: ['index.html', 'src/**/*.{ts,tsx}'],
} satisfies Config;
