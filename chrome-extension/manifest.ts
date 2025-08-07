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
      id: 'saurabh@mcpsuperassistant.ai',
    },
  },
  version: packageJson.version,
  description: 'MCP SuperAssistant',
  host_permissions: [
    '*://*.perplexity.ai/*',
    '*://*.chat.openai.com/*',
    '*://*.chatgpt.com/*',
    '*://*.grok.com/*',
    '*://*.x.com/*',
    '*://*.twitter.com/*',
    '*://*.gemini.google.com/*',
    '*://*.aistudio.google.com/*',
    '*://*.openrouter.ai/*',
    '*://*.google-analytics.com/*',
    '*://*.chat.deepseek.com/*',
    '*://*.t3.chat/*',
    '*://*.chat.mistral.ai/*',
    '*://*.github.com/*',
    '*://*.copilot.github.com/*',
    '*://*.kimi.com/*',
    '*://*.chat.z.ai/*',

  ],

  permissions: ['storage', 'clipboardWrite'],
  // permissions: ['storage', 'scripting', 'clipboardWrite'],
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
    34: 'icon-34.png',
    16: 'icon-16.png',
  },
  content_scripts: [
    // {
    //   matches: ['http://*/*', 'https://*/*', '<all_urls>'],
    //   js: ['content/index.iife.js'],
    // },
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
      matches: ['*://*.x.com/*', '*://*.twitter.com/*', '*://*.x.com/i/grok*', '*://*.twitter.com/i/grok*'],
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
    // Specific content script for OpenRouter tool call parsing
    {
      matches: ['*://*.openrouter.ai/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for DeepSeek tool call parsing
    {
      matches: ['*://*.chat.deepseek.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for Kagi tool call parsing
    {
      matches: ['*://*.kagi.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for T3 Chat tool call parsing
    {
      matches: ['*://*.t3.chat/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for Mistral AI tool call parsing
    {
      matches: ['*://*.chat.mistral.ai/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for GitHub Copilot tool call parsing
    {
      matches: ['*://*.github.com/*', '*://*.copilot.github.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for Kimi
    {
      matches: ['*://*.kimi.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
    // Specific content script for chat.z.ai
    {
      matches: ['*://*.chat.z.ai/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
  ],
  // devtools_page: 'devtools/index.html',
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', 'content/*.css', '*.svg', 'icon-128.png', 'icon-34.png', 'icon-16.png'],
      matches: ['*://*/*'],
    },
  ],
  // side_panel: {
  //   default_path: 'side-panel/index.html',
  // },
} satisfies chrome.runtime.ManifestV3;

export default manifest;
