import type { FunctionCallRendererConfig } from './types';

/**
 * Default configuration for the function call renderer
 */
export const DEFAULT_CONFIG: FunctionCallRendererConfig = {
  knownLanguages: [
    'xml',
    'html',
    'python',
    'javascript',
    'js',
    'ruby',
    'bash',
    'shell',
    'css',
    'json',
    'java',
    'c',
    'cpp',
    'csharp',
    'php',
    'typescript',
    'ts',
    'go',
    'rust',
    'swift',
    'kotlin',
    'sql',
  ],
  handleLanguageTags: true,
  maxLinesAfterLangTag: 3,
  targetSelectors: ['pre', 'code'],
  enableDirectMonitoring: true,
  streamingContainerSelectors: ['.pre', '.code'],
  function_result_selector: [], // Empty by default, will be populated by website-specific configs
  // streamingContainerSelectors: ['.message-content', '.chat-message', '.message-body', '.message'],
  updateThrottle: 25,
  streamingMonitoringInterval: 100,
  largeContentThreshold: Number.MAX_SAFE_INTEGER,
  progressiveUpdateInterval: 250,
  maxContentPreviewLength: Number.MAX_SAFE_INTEGER,
  usePositionFixed: false,
  stabilizeTimeout: 500,
  debug: true,
  // Theme detection
  useHostTheme: true,
  // Stalled stream detection - defaults
  enableStalledStreamDetection: true,
  stalledStreamTimeout: 3000, // 3 seconds before marking a stream as stalled
  stalledStreamCheckInterval: 1000, // Check every 1 second
};

/**
 * Website-specific configuration overrides
 * Each entry contains a URL pattern to match and configuration overrides
 */
export const WEBSITE_CONFIGS: Array<{
  urlPattern: string | RegExp;
  config: Partial<FunctionCallRendererConfig>;
}> = [
  {
    // AI Studio specific configuration
    urlPattern: 'aistudio',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['.pre'],
      function_result_selector: ['div.user-prompt-container'],
    },
  },
  {
    urlPattern: 'perplexity',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['.pre'],
      function_result_selector: ['div.group\\/query', '.group\\/query', 'div[class*="group/query"]'],
    },
  },
  {
    urlPattern: 'z',
    config: {
      targetSelectors: ['.cm-editor'],
      streamingContainerSelectors: ['.cm-editor', '.cm-gutters'],
      function_result_selector: ['div.chat-user'],
    },
  },
  {
    urlPattern: 'gemini',
    config: {
      targetSelectors: ['code-block'],
      streamingContainerSelectors: ['.code-block'],
      function_result_selector: ['div.query-content'],
    },
  },
  {
    urlPattern: 'grok.com',
    config: {
      targetSelectors: ['code'],
      streamingContainerSelectors: ['code'],
      function_result_selector: ['div.relative.items-end'],
    },
  },
  {
    urlPattern: 'openrouter.ai',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: [
        'div.min-w-0.w-full.overflow-hidden'
        // 'div.flex.max-w-full.flex-col.relative.overflow-auto.gap-1.items-end',
        // 'div.flex',
        // 'div.flex.items-end',
      ],
    },
  },
  {
    urlPattern: 'chatgpt.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div[data-message-author-role="user"]'],
    },
  },
  {
    urlPattern: 'chat.openai.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div[data-message-author-role="user"]'],
    },
  },
  {
    urlPattern: 'kagi.com',
    config: {
      targetSelectors: ['.content pre', '.codehilite', 'pre'],
      streamingContainerSelectors: ['pre', '.content'],
      function_result_selector: ['div[data-author="user"]'],
    },
  },
  {
    urlPattern: 'chat.deepseek.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div._9663006'],
    },
  },
  {
    urlPattern: 't3.chat',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div[aria-label="Your message"]'],
    },
  },
  {
    urlPattern: 'chat.mistral.ai',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div[data-message-part-type="answer"]', '.select-text'],
    },
  },
  {
    urlPattern: 'github.com/copilot',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['.UserMessage-module__container--cAvvK','.ChatMessage-module__userMessage--xvIFp'],
    },
  },
  {
    urlPattern: 'kimi.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
      function_result_selector: ['div[class*="user-content"]'],
    },
  },
  // Add more website-specific configurations as needed
  // Example:
  // {
  //   urlPattern: 'example.com',
  //   config: {
  //     targetSelectors: ['.custom-selector'],
  //     streamingContainerSelectors: ['.custom-container']
  //   }
  // }
];

/**
 * Gets the appropriate configuration based on the current URL
 * @returns The merged configuration with website-specific overrides applied if applicable
 */
export function getConfig(): FunctionCallRendererConfig {
  const currentUrl = window.location.href;
  let config = { ...DEFAULT_CONFIG };

  // Check if any website-specific config applies
  for (const siteConfig of WEBSITE_CONFIGS) {
    const { urlPattern, config: overrides } = siteConfig;

    // Check if URL matches the pattern
    const matches = typeof urlPattern === 'string' ? currentUrl.includes(urlPattern) : urlPattern.test(currentUrl);

    if (matches) {
      // Apply overrides to the default config
      config = { ...config, ...overrides };
      break; // Use first matching config
    }
  }

  return config;
}

/**
 * The active configuration - use this as the main config export
 */
export const CONFIG = getConfig();

// Re-export the config interface and utility functions
export type { FunctionCallRendererConfig };
