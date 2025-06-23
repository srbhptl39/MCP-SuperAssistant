import type { AdapterConfig } from './types';

/**
 * Default configuration for Gemini Adapter
 * This serves as the fallback when Firebase Remote Config is not available
 * Keep only essential configurations to minimize bundle size
 */
export const GEMINI_DEFAULT_CONFIG: AdapterConfig = {
  selectors: {
    // Core selectors - essential for basic functionality
    chatInput: 'div.ql-editor.textarea.new-input-ui p, .ql-editor p, div[contenteditable="true"]',
    submitButton: 'button.mat-mdc-icon-button.send-button, button[aria-label*="Send"], button[data-testid="send-button"]',
    fileUploadButton: 'button[aria-label="Add files"], button[aria-label*="attach"]',
    fileInput: 'input[type="file"]',
    mainPanel: '.chat-web, .main-content, .conversation-container',
    dropZone: 'div[xapfileselectordropzone], .text-input-field, .input-area, .ql-editor, .chat-input-container',
    filePreview: '.file-preview, .xap-filed-upload-preview, .attachment-preview',
    buttonInsertionContainer: '.leading-actions-wrapper, .input-area .actions, .chat-input-actions',
    fallbackInsertion: '.input-area, .chat-input-container, .conversation-input',
    
    // Extended selectors for enhanced functionality
    newChatButton: 'button[aria-label*="New chat"], .new-chat-button',
    conversationHistory: '.conversation-history, .chat-history, .sidebar-content',
    conversationItem: '.conversation-item, .chat-item, .history-item',
    messageContainer: '.message-container, .chat-message, .conversation-turn',
    userMessage: '.user-message, .human-message, [data-role="user"]',
    aiMessage: '.ai-message, .assistant-message, [data-role="assistant"]',
    loadingIndicator: '.loading-indicator, .spinner, .progress-indicator',
    typingIndicator: '.typing-indicator, .thinking-indicator, .generating',
    errorMessage: '.error-message, .error-banner, .alert-error',
    retryButton: 'button[aria-label*="Retry"], .retry-button'
  },
  
  ui: {
    typing: {
      minDelay: 50,
      maxDelay: 150,
      characterDelay: 10
    },
    animations: {
      fadeIn: 300,
      slideIn: 250,
      buttonPress: 150
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
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      timeout: 30000
    },
    polling: {
      elementWait: 100,
      statusCheck: 1000,
      configRefresh: 300000 // 5 minutes
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
    
    // Advanced features (default off)
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

export default GEMINI_DEFAULT_CONFIG;
