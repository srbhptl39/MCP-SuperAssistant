import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  important: true, // Use !important for all utilities to ensure they override Shadow DOM styles
  corePlugins: {
    preflight: true, // Enable Tailwind's base styles reset
  },
  theme: {
    extend: {
      // Add any custom theme extensions here
      // This keeps the default Tailwind theme and adds your customizations
    },
  },
  // plugins: [
  //   // Custom plugin to add Shadow DOM specific utilities
  //   function({ addBase, theme }) {
  //     addBase({
  //       // Target the shadow host and its contents
  //       ':host': {
  //         all: 'initial', // Reset all inherited styles
  //         display: 'block', // Make the shadow host a block element
  //       },
  //       // Add base styling for common elements within the Shadow DOM
  //       'h1, h2, h3, h4, h5, h6, p, span, div, button, input, select, textarea': {
  //         fontFamily: 'inherit',
  //         fontSize: 'inherit',
  //         color: 'inherit',
  //       },
  //     });
  //   },
  // ],
} satisfies Config;
