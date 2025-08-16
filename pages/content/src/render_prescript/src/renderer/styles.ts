import { isDarkTheme } from '../utils/themeDetector';

// Determine if dark theme should be used
const useDarkTheme = isDarkTheme();

export const styles = `
  /* CSS Custom Properties for Performance */
  .function-block {
    /* Light theme variables */
    --light-bg: #ffffff;
    --light-text: #202124;
    --light-text-secondary: #5f6368;
    --light-text-tertiary: #3c4043;
    --light-border: rgba(0,0,0,0.03);
    --light-border-secondary: rgba(0,0,0,0.06);
    --light-border-tertiary: rgba(0,0,0,0.12);
    --light-shadow: 0 3px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05);
    --light-surface: #f1f3f4;
    --light-surface-secondary: #f5f7f9;
    --light-surface-tertiary: #f8f9fa;
    --light-primary: #1a73e8;
    --light-primary-hover: #1967d2;
    --light-primary-surface: #e8f0fe;
    --light-success: #34a853;
    --light-error: #ea4335;
    --light-warning: #fbbc04;
    
    /* Dark theme variables */
    --dark-bg: #1e1e1e;
    --dark-text: #e8eaed;
    --dark-text-secondary: #9aa0a6;
    --dark-text-tertiary: #dadce0;
    --dark-border: rgba(255,255,255,0.03);
    --dark-border-secondary: rgba(255,255,255,0.05);
    --dark-border-tertiary: rgba(255,255,255,0.12);
    --dark-shadow: 0 3px 12px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15);
    --dark-surface: #2d2d2d;
    --dark-surface-secondary: #282828;
    --dark-surface-tertiary: #1e1e1e;
    --dark-primary: #8ab4f8;
    --dark-primary-hover: #7ba9f0;
    --dark-primary-surface: #174ea6;
    --dark-success: #34a853;
    --dark-error: #f28b82;
    --dark-warning: #ffcb6b;
    
    /* Common variables */
    --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    --border-radius: 8px;
    --border-radius-sm: 4px;
    --border-radius-lg: 10px;
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 12px;
    --spacing-lg: 16px;
    --spacing-xl: 18px;
    --spacing-xxl: 20px;
    --transition-fast: 0.15s ease;
    --transition-normal: 0.2s ease;
    --transition-slow: 0.25s ease-in-out;
  }

  /* Base styles with CSS variables and GPU acceleration */
  .function-block {
    margin: var(--spacing-xxl) 0;
    padding: var(--spacing-xl);
    border-radius: var(--border-radius-lg);
    font-family: var(--font-system);
    position: relative;
    transition: all var(--transition-slow);
    will-change: transform, opacity, box-shadow;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    perspective: 1000px;
    box-sizing: border-box;
    overflow: hidden;
    width: 100%;
    min-width: 0;
  }
  
  /* Theme-specific styles using CSS variables */
  .function-block.theme-light,
  .function-block:not(.theme-dark) {
    background: var(--light-bg);
    color: var(--light-text);
    box-shadow: var(--light-shadow);
    border: 1px solid var(--light-border);
  }
  
  .function-block.theme-dark {
    background: var(--dark-bg);
    color: var(--dark-text);
    box-shadow: var(--dark-shadow);
    border: 1px solid var(--dark-border);
  }
  
  /* Optimized stabilized blocks */
  .function-block-stabilized {
    position: fixed !important;
    z-index: 1000 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
    transform: translate3d(0,0,0); /* Hardware acceleration */
  }
  
  /* Optimized function name styles - Always visible header */
  .function-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--spacing-lg);
    position: relative;
    width: 100%;
    max-width: 100%;
    line-height: 1.4;
    padding: 12px;
    margin-bottom: 0;
    transition: all var(--transition-normal);
    cursor: pointer;
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
    will-change: transform, opacity, background-color;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    box-sizing: border-box;
    overflow: hidden;
  }
  
  /* Left section of function header (function name) */
  .function-name-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    min-width: 0; /* Allow text truncation */
    max-width: 100%;
    overflow: hidden;
    will-change: transform;
    transform: translate3d(0, 0, 0);
  }
  
  /* Right section of function header (expand button + call-id) */
  .function-name-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    will-change: transform;
    transform: translate3d(0, 0, 0);
  }
  
  /* Collapsed state - rounded corners all around */
  .function-block:not(.expanded) .function-name {
    border-radius: var(--border-radius-md);
    margin-bottom: 0;
  }
  
  /* Expanded state - rounded top corners only */
  .function-block.expanded .function-name {
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  /* Optimized expand button styles */
  .expand-button {
    background: none;
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--border-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-normal);
    opacity: 0.8;
    will-change: transform, opacity, box-shadow;
    min-width: 28px;
    height: 28px;
    margin-left: var(--spacing-sm);
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
  }
  
  .expand-button:hover {
    opacity: 1;
    transform: scale(1.05) translate3d(0, 0, 0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  
  .expand-button:active {
    transform: scale(0.95) translate3d(0, 0, 0);
  }
  
  .expand-button svg {
    transition: transform var(--transition-normal);
    will-change: transform;
  }
  
  /* Consolidated expand button theme styles */
  .function-block.theme-light .expand-button,
  .function-block:not(.theme-dark) .expand-button {
    color: var(--light-text-secondary);
    border-color: rgba(26, 115, 232, 0.2);
    background-color: rgba(26, 115, 232, 0.05);
  }
  
  .function-block.theme-light .expand-button:hover,
  .function-block:not(.theme-dark) .expand-button:hover {
    color: var(--light-primary);
    background-color: rgba(26, 115, 232, 0.1);
    border-color: rgba(26, 115, 232, 0.4);
  }
  
  .function-block.theme-dark .expand-button {
    color: var(--dark-text-secondary);
    border-color: rgba(138, 180, 248, 0.2);
    background-color: rgba(138, 180, 248, 0.05);
  }
  
  .function-block.theme-dark .expand-button:hover {
    color: var(--dark-primary);
    background-color: rgba(138, 180, 248, 0.1);
    border-color: rgba(138, 180, 248, 0.4);
  }
  
  /* Optimized expandable content with smooth animations */
  .expandable-content {
    overflow: hidden;
    width: 100%;
    box-sizing: border-box;
    transition: max-height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), 
                opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                border-color 0.3s ease-out;
    will-change: max-height, opacity, padding;
    border: 1px solid transparent;
    border-top: none;
    border-radius: 0 0 var(--border-radius-md) var(--border-radius-md);
    background-color: rgba(0, 0, 0, 0.02);
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    max-height: 0;
    opacity: 0;
    padding: 0 12px;
  }
  
  /* Enhanced auto-expanded state for streaming content */
  .function-block.auto-expanded .expandable-content {
    animation: smoothExpand 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  
  @keyframes smoothExpand {
    from {
      max-height: 0;
      opacity: 0;
      padding: 0 12px;
    }
    to {
      max-height: 2000px;
      opacity: 1;
      padding: 12px;
    }
  }
  
  .function-block:not(.expanded) .expandable-content {
    max-height: 0;
    opacity: 0;
    padding: 0 12px;
    border-color: transparent;
  }
  
  .function-block.expanded .expandable-content {
    max-height: 2000px; /* Large enough to accommodate content */
    opacity: 1;
    padding: 12px;
  }
  
  /* Theme styles for expandable content */
  .function-block.theme-light .expandable-content,
  .function-block:not(.theme-dark) .expandable-content {
    background-color: rgba(26, 115, 232, 0.02);
    border-color: rgba(26, 115, 232, 0.2);
  }
  
  .function-block.theme-dark .expandable-content {
    background-color: rgba(138, 180, 248, 0.02);
    border-color: rgba(138, 180, 248, 0.2);
  }
  
  /* Consolidated theme styles for function name */
  .function-block.theme-light .function-name,
  .function-block:not(.theme-dark) .function-name {
    color: var(--light-primary);
    background-color: rgba(26, 115, 232, 0.05);
    border: 1px solid rgba(26, 115, 232, 0.2);
  }
  
  .function-block.theme-dark .function-name {
    color: var(--dark-primary);
    background-color: rgba(138, 180, 248, 0.05);
    border: 1px solid rgba(138, 180, 248, 0.2);
  }
  
  /* Expanded state border styling */
  .function-block.expanded.theme-light .function-name,
  .function-block.expanded:not(.theme-dark) .function-name {
    border-bottom-color: rgba(26, 115, 232, 0.3);
  }
  
  .function-block.expanded.theme-dark .function-name {
    border-bottom-color: rgba(138, 180, 248, 0.3);
  }
  
  /* Hover effect for function name */
  .function-name:hover {
    opacity: 0.8;
    transform: translateY(-1px) translate3d(0, 0, 0);
  }
  
  /* Function name text styling */
  .function-name-text {
    font-weight: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    will-change: transform;
    transform: translate3d(0, 0, 0);
  }
  
  /* Call ID styling */
  .call-id {
    font-size: 0.85em;
    opacity: 0.7;
    font-weight: 400;
    background-color: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: var(--border-radius-sm);
    font-family: monospace;
    flex-shrink: 0;
    transition: opacity var(--transition-normal);
    will-change: opacity;
    transform: translate3d(0, 0, 0);
  }
  
  /* Consolidated call ID theme styles */
  .function-block.theme-light .call-id,
  .function-block:not(.theme-dark) .call-id {
    background-color: rgba(26, 115, 232, 0.1);
    color: var(--light-text-secondary);
  }
  
  .function-block.theme-dark .call-id {
    background-color: rgba(138, 180, 248, 0.1);
    color: var(--dark-text-secondary);
  }
  
  .function-block:hover .call-id {
    opacity: 1;
    transform: scale(1.02) translate3d(0, 0, 0);
  }
  
  /* Optimized parameter styles */
  .param-name {
    font-weight: 500;
    margin-top: 14px;
    margin-bottom: 6px;
    padding-left: 2px;
    font-size: 14px;
    display: flex;
    align-items: center;
    contain: layout style;
    will-change: opacity;
    transform: translate3d(0, 0, 0);
  }
  
  /* Consolidated parameter name theme styles */
  .function-block.theme-light .param-name,
  .function-block:not(.theme-dark) .param-name {
    color: var(--light-text);
  }
  
  .function-block.theme-dark .param-name {
    color: var(--dark-text);
  }
  
  /* Optimized parameter value with hardware acceleration */
  .param-value {
    padding: var(--spacing-md) 14px;
    border-radius: var(--border-radius);
    font-family: var(--font-mono);
    white-space: pre-wrap;
    overflow: auto;
    font-size: 13px;
    line-height: 1.5;
    max-height: 300px;
    scrollbar-width: thin;
    position: relative;
    pointer-events: auto !important;
    transition: background-color var(--transition-normal), border-color var(--transition-normal);
    border: 1px solid transparent;
    contain: layout style;
    transform: translate3d(0,0,0); /* Hardware acceleration for scrolling */
  }

  /* Specific styles for system message content */
  .system-message-content {
    white-space: pre-wrap !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
    font-family: var(--font-system) !important;
  }

  /* Specific styles for function result content */
  .function-result-content {
    white-space: pre-wrap !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
  }

  /* Ensure all text content in function results preserves newlines */
  .function-result-text {
    white-space: pre-wrap !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
  }
  
  /* Optimized scrollbar styles */
  .param-value::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .param-value::-webkit-scrollbar-track {
    background: transparent;
    margin: var(--spacing-xs);
  }
  
  .param-value::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.15);
    border-radius: 20px;
    transition: background-color var(--transition-normal);
  }
  
  .param-value::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }
  
  /* Dark theme scrollbar */
  .function-block.theme-dark .param-value::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.15);
  }
  
  .function-block.theme-dark .param-value::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.25);
  }
  
  /* Consolidated parameter value theme styles */
  .function-block.theme-light .param-value,
  .function-block:not(.theme-dark) .param-value {
    background-color: var(--light-surface-secondary);
    border-color: var(--light-border-secondary);
    color: var(--light-text);
  }
  
  .function-block.theme-dark .param-value {
    background-color: var(--dark-surface-secondary);
    border-color: var(--dark-border-secondary);
    color: var(--dark-text);
  }
  
  /* Optimized large content styles */
  .large-content {
    position: relative;
    contain: layout;
  }
  
  .large-content::after,
  .content-truncated {
    display: none;
  }
  
  /* Optimized streaming parameter styles with hardware acceleration */
  .param-value[data-streaming="true"] {
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    max-height: 300px;
    border-color: rgba(26, 115, 232, 0.3);
    animation: subtle-pulse 2s infinite ease-in-out;
    will-change: border-color, transform;
    transform: translate3d(0,0,0);
    scroll-behavior: smooth !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  /* Enhanced streaming visual feedback */
  .param-value[data-streaming="true"]::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, 
      transparent 0%, 
      rgba(26, 115, 232, 0.6) 50%, 
      transparent 100%);
    animation: streamingIndicator 2s infinite linear;
    z-index: 1;
  }
  
  @keyframes streamingIndicator {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  /* Enhanced streaming content structure */
  .param-value[data-streaming="true"] .content-wrapper {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 50px;
  }
  
  /* Optimized streaming pre element */
  .param-value[data-streaming="true"] > pre,
  .param-value[data-streaming="true"] .content-wrapper > pre {
    margin: 0;
    padding: var(--spacing-md) 14px;
    overflow: auto;
    max-height: 300px;
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    background-color: inherit;
    color: inherit !important;
    border: none;
    scroll-behavior: smooth;
    contain: layout style;
    transform: translate3d(0,0,0);
    width: 100%;
    min-height: inherit;
  }
  
  /* Enhanced scrollbar for streaming content */
  .param-value[data-streaming="true"]::-webkit-scrollbar,
  .param-value[data-streaming="true"] pre::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .param-value[data-streaming="true"]::-webkit-scrollbar-track,
  .param-value[data-streaming="true"] pre::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }
  
  .param-value[data-streaming="true"]::-webkit-scrollbar-thumb,
  .param-value[data-streaming="true"] pre::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.5);
    border-radius: 3px;
    transition: background 0.2s ease;
  }
  
  .param-value[data-streaming="true"]::-webkit-scrollbar-thumb:hover,
  .param-value[data-streaming="true"] pre::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.8);
  }
  
  /* Dark theme scrollbar for streaming */
  .function-block.theme-dark .param-value[data-streaming="true"]::-webkit-scrollbar-track,
  .function-block.theme-dark .param-value[data-streaming="true"] pre::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .function-block.theme-dark .param-value[data-streaming="true"]::-webkit-scrollbar-thumb,
  .function-block.theme-dark .param-value[data-streaming="true"] pre::-webkit-scrollbar-thumb {
    background: rgba(138, 180, 248, 0.5);
  }
  
  .function-block.theme-dark .param-value[data-streaming="true"]::-webkit-scrollbar-thumb:hover,
  .function-block.theme-dark .param-value[data-streaming="true"] pre::-webkit-scrollbar-thumb:hover {
    background: rgba(138, 180, 248, 0.8);
  }
  
  /* Optimized streaming indicator */
  .streaming-param-name {
    position: relative;
    display: flex;
    align-items: center;
    contain: layout style;
  }
  
  .streaming-param-name::before {
    content: "";
    margin-right: var(--spacing-sm);
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    background-color: var(--light-primary);
    animation: pulse 1.5s infinite ease-in-out;
    pointer-events: none;
    flex-shrink: 0;
    will-change: opacity;
  }
  
  .function-block.theme-dark .streaming-param-name::before {
    background-color: var(--dark-primary);
  }
  
  /* Optimized stalled indicator styles */
  .stalled-indicator {
    margin-top: 10px;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--border-radius-sm);
    font-size: 14px;
    animation: fadeIn 0.3s ease-in-out;
    contain: layout style;
  }
  
  .stalled-indicator[data-pre-existing="true"] {
    background-color: rgba(180, 180, 180, 0.1);
    border: 1px solid rgba(180, 180, 180, 0.3);
    color: #555;
  }
  
  /* Consolidated stalled indicator theme styles */
  .function-block.theme-light .stalled-indicator,
  .function-block:not(.theme-dark) .stalled-indicator {
    background-color: rgba(255, 200, 0, 0.1);
    border: 1px solid rgba(255, 200, 0, 0.3);
    color: #664d00;
  }
  
  .function-block.theme-dark .stalled-indicator {
    background-color: rgba(255, 200, 0, 0.15);
    border: 1px solid rgba(255, 200, 0, 0.3);
    color: var(--dark-warning);
  }
  
  .stalled-message {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-family: var(--font-system);
  }
  
  .stalled-message svg {
    flex-shrink: 0;
  }
  
  .stalled-retry-button {
    margin-top: var(--spacing-sm);
    padding: var(--spacing-xs) 10px;
    background-color: rgba(255, 200, 0, 0.2);
    border: 1px solid rgba(255, 200, 0, 0.4);
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font-size: var(--spacing-md);
    color: #664d00;
    font-family: var(--font-system);
    transition: background-color var(--transition-normal);
  }
  
  .stalled-retry-button:hover {
    background-color: rgba(255, 200, 0, 0.3);
  }
  
  /* Enhanced function block states */
  .function-block.function-loading {
    background: linear-gradient(135deg, 
      rgba(26, 115, 232, 0.02) 0%, 
      rgba(26, 115, 232, 0.01) 100%);
    border-left: 3px solid rgba(26, 115, 232, 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .function-block.function-complete {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .function-block.auto-expanded {
    box-shadow: 0 4px 16px rgba(26, 115, 232, 0.15);
    border-color: rgba(26, 115, 232, 0.2);
  }
  
  .function-block.theme-dark.auto-expanded {
    box-shadow: 0 4px 16px rgba(138, 180, 248, 0.15);
    border-color: rgba(138, 180, 248, 0.2);
  }
  
  /* Optimized keyframe animations */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  
  @keyframes subtle-pulse {
    0%, 100% { border-color: rgba(26, 115, 232, 0.2); }
    50% { border-color: rgba(26, 115, 232, 0.4); }
  }
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  
  /* Optimized incomplete tag */
  .incomplete-tag {
    border-left: 3px dashed var(--light-primary) !important;
    background-color: var(--light-primary-surface) !important;
  }
  
  .function-block.theme-dark .incomplete-tag {
    border-left: 3px dashed var(--dark-primary) !important;
    background-color: var(--dark-primary-surface) !important;
  }
  
  /* Optimized button container */
  .function-buttons {
    display: flex;
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
    justify-content: flex-start;
    align-items: center;
    contain: layout;
    will-change: transform;
    transform: translate3d(0, 0, 0);
  }

  /* Unified button base styles */
  .raw-toggle,
  .execute-button,
  .insert-result-button,
  .attach-file-button {
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--border-radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-normal);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    will-change: transform, box-shadow;
    contain: layout style;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
  }
  
  /* Optimized active states with hardware acceleration */
  .execute-button:active,
  .insert-result-button:active,
  .attach-file-button:active,
  .raw-toggle:active {
    transform: translateY(1px) translate3d(0,0,0);
    box-shadow: 0 0 1px rgba(0,0,0,0.12);
  }
  
  /* Consolidated raw toggle theme styles */
  .function-block.theme-light .raw-toggle,
  .function-block:not(.theme-dark) .raw-toggle {
    background: var(--light-surface);
    color: var(--light-text-secondary);
    border: 1px solid var(--light-border-tertiary);
  }
  
  .function-block.theme-light .raw-toggle:hover,
  .function-block:not(.theme-dark) .raw-toggle:hover {
    background: #e8eaed;
    color: var(--light-text);
  }
  
  .function-block.theme-dark .raw-toggle {
    background: var(--dark-surface);
    color: var(--dark-text-tertiary);
    border: 1px solid var(--dark-border-tertiary);
  }
  
  .function-block.theme-dark .raw-toggle:hover {
    background: #3c4043;
    color: var(--dark-text);
  }
  
  /* Consolidated primary button styles - light theme */
  .function-block.theme-light .execute-button,
  .function-block:not(.theme-dark) .execute-button,
  .function-block.theme-light .insert-result-button,
  .function-block.theme-light .attach-file-button,
  .function-block:not(.theme-dark) .insert-result-button,
  .function-block:not(.theme-dark) .attach-file-button {
    background: var(--light-primary);
    color: white;
    background-image: linear-gradient(to bottom, var(--light-primary), var(--light-primary-hover));
  }
  
  .function-block.theme-light .execute-button:hover,
  .function-block:not(.theme-dark) .execute-button:hover,
  .function-block.theme-light .insert-result-button:hover,
  .function-block.theme-light .attach-file-button:hover,
  .function-block:not(.theme-dark) .insert-result-button:hover,
  .function-block:not(.theme-dark) .attach-file-button:hover {
    background: var(--light-primary-hover);
    background-image: linear-gradient(to bottom, var(--light-primary-hover), #1765cc);
  }
  
  /* Consolidated primary button styles - dark theme */
  .function-block.theme-dark .execute-button,
  .function-block.theme-dark .insert-result-button,
  .function-block.theme-dark .attach-file-button {
    background: var(--dark-primary);
    color: var(--light-text);
    background-image: linear-gradient(to bottom, var(--dark-primary), var(--dark-primary-hover));
  }
  
  .function-block.theme-dark .execute-button:hover,
  .function-block.theme-dark .insert-result-button:hover,
  .function-block.theme-dark .attach-file-button:hover {
    background: var(--dark-primary-hover);
    background-image: linear-gradient(to bottom, var(--dark-primary-hover), #6ca0e8);
  }
  
  /* Optimized function results panel */
  .mcp-function-results-panel,
  .xml-results-panel {
    border-radius: 6px;
    margin-top: 10px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
    contain: layout style;
    transform: translate3d(0,0,0);
    will-change: transform, opacity;
    transition: all var(--transition-normal);
  }
  
  .mcp-function-results-panel:hover,
  .xml-results-panel:hover {
    transform: scale(1.005) translate3d(0, 0, 0);
  }
  
  /* Consolidated results panel theme styles */
  .function-block.theme-light .mcp-function-results-panel,
  .function-block.theme-light .xml-results-panel,
  .function-block:not(.theme-dark) .mcp-function-results-panel,
  .function-block:not(.theme-dark) .xml-results-panel {
    background-color: var(--light-surface-tertiary);
    border: 1px solid #eaecef;
    color: var(--light-text);
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    margin-top: var(--spacing-md);
  }
  
  .function-block.theme-dark .mcp-function-results-panel,
  .function-block.theme-dark .xml-results-panel {
    background-color: var(--dark-surface-tertiary);
    border: 1px solid var(--dark-border);
    color: var(--dark-text);
    box-shadow: var(--dark-shadow);
    margin-top: var(--spacing-md);
  }
  
  .function-results-loading {
    padding: 10px;
    color: var(--light-text-secondary);
    font-style: italic;
  }
  
  .function-result-success pre {
    margin: 0;
    padding: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  /* Consolidated error theme styles */
  .function-block.theme-light .function-result-error,
  .function-block:not(.theme-dark) .function-result-error {
    padding: 10px;
    color: var(--light-error);
    background-color: rgba(211, 47, 47, 0.05);
    border-radius: var(--border-radius-sm);
  }
  
  .function-block.theme-dark .function-result-error {
    color: var(--dark-error);
    background-color: rgba(242, 139, 130, 0.1);
  }
  
  /* Consolidated language tag theme styles */
  .function-block.theme-light .language-tag,
  .function-block:not(.theme-dark) .language-tag {
    background: var(--light-primary-surface);
    color: var(--light-primary);
  }
  
  .function-block.theme-dark .language-tag {
    background: var(--dark-primary-surface);
    color: var(--dark-text);
  }
  
  .language-tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--border-radius-sm);
    font-size: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
    font-family: var(--font-system);
    contain: layout style;
    will-change: transform;
    transform: translate3d(0, 0, 0);
    transition: all var(--transition-normal);
  }
  
  .language-tag:hover {
    transform: scale(1.02) translate3d(0, 0, 0);
  }
  
  /* Optimized XML pre element */
  .xml-pre {
    white-space: pre-wrap;
    margin: 0;
    padding: var(--spacing-md);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    contain: layout style;
  }
  
  /* Optimized spinner with hardware acceleration for function name */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(26, 115, 232, 0.3);
    border-top: 2px solid var(--light-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
    will-change: transform;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    contain: layout style;
  }
  
  .function-block.theme-dark .spinner {
    border: 2px solid rgba(138, 180, 248, 0.3);
    border-top: 2px solid var(--dark-primary);
  }
  
  /* Optimized mobile layout with efficient media query */
  @media (max-width: 768px) {
    .function-block {
      padding: 14px;
      margin: 15px 0;
    }
    .function-name {
      font-size: 15px;
      padding-bottom: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }
    .param-name {
      font-size: 13px;
      margin-top: var(--spacing-md);
      margin-bottom: var(--spacing-xs);
    }
    .param-value {
      max-height: 200px;
      padding: 10px var(--spacing-md);
      font-size: 12.5px;
    }
    .call-id {
      font-size: 0.8em;
      padding: 2px 6px;
    }
  }
  
  /* Optimized spinner with hardware acceleration */
  .function-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
    will-change: transform;
    contain: layout style;
  }
  
  /* Consolidated spinner theme styles */
  .function-block.theme-light .function-spinner,
  .function-block:not(.theme-dark) .function-spinner {
    border: 2px solid rgba(26,115,232,0.3);
    border-top: 2px solid var(--light-primary);
  }
  
  .function-block.theme-dark .function-spinner {
    border: 2px solid rgba(138, 180, 248, 0.3);
    border-top: 2px solid var(--dark-primary);
  }
  
  /* Optimized keyframe with transform3d */
  @keyframes spin {
    0% { transform: rotate(0deg) translate3d(0,0,0); }
    100% { transform: rotate(360deg) translate3d(0,0,0); }
  }
  
  .function-loading .function-name {
    position: relative;
  }
  
  /* Optimized insert button container */
  .insert-button-container {
    margin-top: 10px;
    margin-bottom: 10px;
    display: flex;
    justify-content: flex-end;
    contain: layout;
  }
  
  .insert-result-button {
    padding: var(--spacing-xs) var(--spacing-md);
  }
  
  /* Optimized button state styles */
  .insert-result-button.insert-success,
  .attach-file-button.attach-success {
    background: var(--light-success) !important;
    color: white !important;
  }
  
  .insert-result-button.insert-error,
  .attach-file-button.attach-error {
    background: var(--light-error) !important;
    color: white !important;
  }
  
  .attach-file-button {
    padding: var(--spacing-xs) var(--spacing-md);
    margin-left: 6px;
  }
  
  /* Optimized content transitions with hardware acceleration */
  .function-content-wrapper {
    position: relative;
    width: 100%;
    transition: opacity var(--transition-normal), transform var(--transition-normal);
    will-change: opacity, transform;
    contain: layout;
  }
  
  .function-content-new {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
  
  [data-smooth-updating] {
    position: relative;
  }
  
  /* Optimized function history panel */
  .function-history-panel {
    margin-top: 10px;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--border-radius-sm);
    font-size: 0.9em;
    contain: layout style;
  }
  
  /* Consolidated history panel theme styles */
  .function-block.theme-light .function-history-panel,
  .function-block:not(.theme-dark) .function-history-panel {
    background-color: var(--light-surface-tertiary);
    border: 1px solid #dadce0;
    color: var(--light-text);
  }
  
  .function-block.theme-dark .function-history-panel {
    background-color: var(--dark-surface);
    border: 1px solid var(--light-text-secondary);
    color: var(--dark-text);
  }
  
  .function-history-header {
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .function-execution-info {
    margin-bottom: var(--spacing-sm);
    line-height: 1.4;
  }
  
  /* Base re-execute button styles */
  .function-reexecute-button {
    border: none;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--border-radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-normal);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform, box-shadow;
    contain: layout style;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    min-height: 32px;
    min-width: 80px;
  }

  .function-reexecute-button:active {
    transform: translateY(1px) translate3d(0,0,0);
    box-shadow: 0 0 1px rgba(0,0,0,0.12);
  }

  /* Consolidated re-execute button theme styles */
  .function-block.theme-light .function-reexecute-button,
  .function-block:not(.theme-dark) .function-reexecute-button {
    background: var(--light-primary);
    color: white;
    background-image: linear-gradient(to bottom, var(--light-primary), var(--light-primary-hover));
  }
  
  .function-block.theme-light .function-reexecute-button:hover,
  .function-block:not(.theme-dark) .function-reexecute-button:hover {
    background: var(--light-primary-hover);
    background-image: linear-gradient(to bottom, var(--light-primary-hover), #1765cc);
  }
  
  .function-block.theme-dark .function-reexecute-button {
    background: var(--dark-primary);
    color: var(--light-text);
    background-image: linear-gradient(to bottom, var(--dark-primary), var(--dark-primary-hover));
  }
  
  .function-block.theme-dark .function-reexecute-button:hover {
    background: var(--dark-primary-hover);
    background-image: linear-gradient(to bottom, var(--dark-primary-hover), #6ca0e8);
  }
`;
