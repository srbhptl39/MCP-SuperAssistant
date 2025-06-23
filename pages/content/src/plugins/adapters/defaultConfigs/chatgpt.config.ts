import type { AdapterConfig } from './types';

/**
 * Default configuration for ChatGPT Adapter
 * This serves as the fallback when Firebase Remote Config is not available
 */
export const CHATGPT_DEFAULT_CONFIG: AdapterConfig = {
  selectors: {
    // Core selectors for ChatGPT
    chatInput: '#prompt-textarea, div[contenteditable="true"][role="textbox"]',
    submitButton: 'button[data-testid="send-button"], button:has(svg[data-testid="send-icon"])',
    fileUploadButton: 'button[aria-label*="Attach"], input[type="file"] + button',
    fileInput: 'input[type="file"]',
    mainPanel: '.chat-main, .conversation-container, main',
    dropZone: '#prompt-textarea, .composer-text-area, .input-area',
    filePreview: '.file-preview, .attachment-item',
    buttonInsertionContainer: '.composer-buttons, .input-actions',
    fallbackInsertion: '.composer-parent, .input-container',
    
    // Extended selectors
    newChatButton: 'a[href="/"], button[aria-label*="New chat"]',
    conversationHistory: '.conversation-list, .chat-history',
    conversationItem: '.conversation-item, .chat-item',
    messageContainer: '.message, .conversation-turn',
    userMessage: '.user-message, [data-role="user"]',
    aiMessage: '.assistant-message, [data-role="assistant"]',
    loadingIndicator: '.loading, .spinner',
    typingIndicator: '.typing-indicator, .thinking',
    errorMessage: '.error-message, .alert-error',
    retryButton: 'button[aria-label*="Retry"], .retry-button'
  },
  
  ui: {
    typing: {
      minDelay: 30,
      maxDelay: 120,
      characterDelay: 8
    },
    animations: {
      fadeIn: 250,
      slideIn: 200,
      buttonPress: 100
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000
    },
    fileUpload: {
      maxSize: 52428800, // 50MB
      allowedTypes: [
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'text/plain',
        'text/csv',
        'application/pdf'
      ],
      timeout: 30000
    },
    polling: {
      elementWait: 100,
      statusCheck: 1000,
      configRefresh: 300000
    }
  },
  
  features: {
    // Core features
    textInsertion: true,
    formSubmission: true,
    fileAttachment: true,
    
    // UI features
    enhancedUi: true,
    animations: true,
    lazyLoading: true,
    caching: true,
    
    // Accessibility
    darkModeSupport: true,
    highContrast: true,
    screenReader: true,
    keyboardNavigation: true,
    
    // Advanced features (default off for ChatGPT)
    voiceInput: false,
    smartRetry: false,
    aiAssistance: false,
    contextAwareness: false,
    multimodalSupport: false,
    preloading: false,
    customThemes: false
  },
  
  version: '2.0.0',
  lastUpdated: new Date().toISOString(),
  schemaVersion: 1
};

export default CHATGPT_DEFAULT_CONFIG;
