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
  // streamingContainerSelectors: ['.message-content', '.chat-message', '.message-body', '.message'],
  updateThrottle: 100,
  streamingMonitoringInterval: 300,
  largeContentThreshold: Number.MAX_SAFE_INTEGER,
  progressiveUpdateInterval: 750,
  maxContentPreviewLength: Number.MAX_SAFE_INTEGER,
  usePositionFixed: false,
  stabilizeTimeout: 2000,
  debug: false,
  // Theme detection
  useHostTheme: true,
  // Stalled stream detection - improved defaults
  enableStalledStreamDetection: true,
  stalledStreamTimeout: 8000,
  stalledStreamCheckInterval: 3000,
  maxRetryAttempts: 5,
  retryDelay: 2000,
  reconnectDelay: 5000,
  maxReconnectAttempts: 3,
  exponentialBackoff: true,
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
    },
  },
  {
    urlPattern: 'perplexity',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['.pre'],
    },
  },
  {
    urlPattern: 'gemini',
    config: {
      targetSelectors: ['code-block'],
      streamingContainerSelectors: ['.code-block'],
    },
  },
  {
    urlPattern: 'openrouter.ai',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
    },
  },
  {
    urlPattern: 'chatgpt.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
    },
  },
  {
    urlPattern: 'chat.openai.com',
    config: {
      targetSelectors: ['pre'],
      streamingContainerSelectors: ['pre'],
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
