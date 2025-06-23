/**
 * Type definitions for adapter configurations
 * These types ensure type safety for both default configs and Firebase Remote Config
 */

export interface AdapterSelectors {
  chatInput: string;
  submitButton: string;
  fileUploadButton: string;
  fileInput: string;
  mainPanel: string;
  dropZone: string;
  filePreview: string;
  buttonInsertionContainer: string;
  fallbackInsertion: string;
  newChatButton?: string;
  conversationHistory?: string;
  conversationItem?: string;
  messageContainer?: string;
  userMessage?: string;
  aiMessage?: string;
  loadingIndicator?: string;
  typingIndicator?: string;
  toolbar?: string;
  toolbarActions?: string;
  settingsButton?: string;
  optionsMenu?: string;
  voiceInputButton?: string;
  modelSelector?: string;
  responseActions?: string;
  copyButton?: string;
  regenerateButton?: string;
  shareButton?: string;
  errorMessage?: string;
  retryButton?: string;
}

export interface AdapterUIConfig {
  typing: {
    minDelay: number;
    maxDelay: number;
    characterDelay: number;
  };
  animations: {
    fadeIn: number;
    slideIn: number;
    buttonPress: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
  fileUpload: {
    maxSize: number;
    allowedTypes: string[];
    timeout: number;
  };
  polling: {
    elementWait: number;
    statusCheck: number;
    configRefresh: number;
  };
}

export interface AdapterFeatures {
  textInsertion: boolean;
  formSubmission: boolean;
  fileAttachment: boolean;
  voiceInput: boolean;
  smartRetry: boolean;
  enhancedUi: boolean;
  aiAssistance: boolean;
  contextAwareness: boolean;
  multimodalSupport: boolean;
  lazyLoading: boolean;
  preloading: boolean;
  caching: boolean;
  darkModeSupport: boolean;
  customThemes: boolean;
  animations: boolean;
  highContrast: boolean;
  screenReader: boolean;
  keyboardNavigation: boolean;
}

/**
 * Override configuration for adapter config merging
 * When a key is set to true, remote config values will completely override defaults for that section
 * instead of merging them together
 */
export interface AdapterOverrides {
  /** Override all selectors completely with remote config values */
  selectors?: boolean;
  /** Override specific UI configuration sections */
  ui?: {
    /** Override typing configuration completely */
    typing?: boolean;
    /** Override animations configuration completely */
    animations?: boolean;
    /** Override retry configuration completely */
    retry?: boolean;
    /** Override fileUpload configuration completely */
    fileUpload?: boolean;
    /** Override polling configuration completely */
    polling?: boolean;
    /** Override entire UI section completely */
    all?: boolean;
  };
  /** Override all features completely with remote config values */
  features?: boolean;
  /** Override specific configuration keys by name */
  keys?: string[];
}

export interface AdapterConfig {
  selectors: AdapterSelectors;
  ui: AdapterUIConfig;
  features: AdapterFeatures;
  version: string;
  lastUpdated: string;
  schemaVersion: number;
  /** 
   * Override configuration - when specified, these sections will use only remote config values
   * instead of merging with defaults. Provides fail-safe behavior with fallbacks.
   */
  overrides?: AdapterOverrides;
}

export interface AdapterConfigVariants {
  [key: string]: AdapterConfig;
}

// Type for the remote config key structure
export interface RemoteAdapterConfigs {
  [adapterName: string]: AdapterConfig;
}
