import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * @prop default_locale
 * if you want to support multiple languages, you can use the following reference
 * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
 *
 * @prop browser_specific_settings
 * Must be unique to your extension to upload to addons.mozilla.org
 * (you can delete if you only want a chrome extension)
 *
 * @prop permissions
 * Firefox doesn't support sidePanel (It will be deleted in manifest parser)
 *
 * @prop content_scripts
 * css: ['content.css'], // public folder
 */
const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: 'MCP SuperAssistant',
  browser_specific_settings: {
    gecko: {
      id: 'mcp-superassistant@gmail.com',
      strict_min_version: '109.0',
    },
  },
  version: packageJson.version,
  description: 'MCP SuperAssistant',
  host_permissions: [
    '<all_urls>', 
    'http://localhost:3006/*', 
    '*://*.perplexity.ai/*', 
    '*://*.chat.openai.com/*',
    '*://*.chatgpt.com/*', 
    '*://*.grok.com/*', 
    '*://*.x.com/*',
    '*://*.twitter.com/*',
    '*://*.gemini.google.com/*',
    '*://*.aistudio.google.com/*'
  ],
  permissions: ['storage', 'scripting', 'tabs', 'notifications', 'sidePanel', 'webRequest', 'clipboardWrite'],
  // options_page: 'options/index.html',
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  // action: {
  //   default_popup: 'popup/index.html',
  //   default_icon: 'icon-34.png',
  // },
  // chrome_url_overrides: {
  //   newtab: 'new-tab/index.html',
  // },
  icons: {
    128: 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      js: ['content/index.iife.js'],
    },
    // Specific content script for perplexity.ai tool call parsing
    {
      matches: ['*://*.perplexity.ai/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for ChatGPT tool call parsing
    {
      matches: ['*://*.chat.openai.com/*', '*://*.chatgpt.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for grok.com tool call parsing
    {
      matches: ['*://*.grok.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for x.com and twitter.com tool call parsing (Grok integration)
    {
      matches: [
        '*://*.x.com/*', 
        '*://*.twitter.com/*',
        '*://*.x.com/i/grok*',
        '*://*.twitter.com/i/grok*'
      ],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for Gemini tool call parsing
    {
      matches: ['*://*.gemini.google.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for AiStudio tool call parsing
    {
      matches: ['*://*.aistudio.google.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
  ],
  // devtools_page: 'devtools/index.html',
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', 'icon-128.png', 'icon-34.png'],
      matches: ['*://*/*'],
    },
  ],
  // side_panel: {
  //   default_path: 'side-panel/index.html',
  // },
} satisfies chrome.runtime.ManifestV3;

export default manifest;
