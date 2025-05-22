import { isDarkTheme } from '../utils/themeDetector';

// Determine if dark theme should be used
const useDarkTheme = isDarkTheme();

export const styles = `
  /* Base styles that apply to both light and dark themes */
  .function-block {
    margin: 20px 0;
    padding: 18px;
    border-radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    position: relative;
    transition: all 0.25s ease-in-out;
  }
  
  /* Apply theme-specific styles */
  .function-block.theme-light,
  .function-block:not(.theme-dark) {
    background: #ffffff;
    color: #202124;
    box-shadow: 0 3px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05);
    border: 1px solid rgba(0,0,0,0.03);
  }
  
  .function-block.theme-dark {
    background: #1e1e1e;
    color: #e8eaed;
    box-shadow: 0 3px 12px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15);
    border: 1px solid rgba(255,255,255,0.03);
  }
  /* Style for stabilized blocks during updates */
  
  /* Style for stabilized blocks during updates */
  .function-block-stabilized {
    position: fixed !important;
    z-index: 1000 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
    // transition: none !important; /* Disable transitions during stabilization */
  }
  
  .function-name {
    font-weight: 600;
    margin-bottom: 16px;
    display: flex;
    align-items: flex-start; /* Changed from center to flex-start */
    font-size: 16px;
    position: relative;
    width: 100%;
    gap: 8px;
    line-height: 1.4;
    border-bottom: 1px solid transparent;
    padding-bottom: 10px;
    flex-wrap: wrap; /* Allow wrapping */
  }
  
  /* Theme-specific function name colors */
  .function-block.theme-light .function-name,
  .function-block:not(.theme-dark) .function-name {
    color: #1a73e8;
    border-bottom-color: rgba(26, 115, 232, 0.2);
  }
  
  .function-block.theme-dark .function-name {
    color: #8ab4f8;
    border-bottom-color: rgba(138, 180, 248, 0.2);
  }
  
  .function-name-text {
    display: inline-block;
    font-size: 16px;
    letter-spacing: 0.3px;
    max-width: calc(100% - 90px); /* Ensure space for call ID */
    word-break: break-word; /* Break long function names */
  }
  .call-id {
    font-weight: normal;
    font-size: 0.85em;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.2px;
    transition: opacity 0.2s ease;
    margin-left: auto; /* Push to the right */
    align-self: flex-start; /* Align to top */
    white-space: nowrap; /* Prevent wrapping */
    overflow: hidden; /* Prevent overflow */
    text-overflow: ellipsis; /* Add ellipsis for overflow */
    max-width: 80px; /* Limit max width */
  }
  
  /* Theme-specific call ID styles */
  .function-block.theme-light .call-id,
  .function-block:not(.theme-dark) .call-id {
    color: #5f6368;
    background-color: rgba(240, 240, 240, 0.9);
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .function-block.theme-dark .call-id {
    color: #9aa0a6;
    background-color: rgba(45, 45, 45, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .function-block:hover .call-id {
    opacity: 1;
  }
  .param-name {
    font-weight: 500;
    margin-top: 14px;
    margin-bottom: 6px;
    padding-left: 2px;
    font-size: 14px;
    display: flex;
    align-items: center;
  }
  
  .function-block.theme-light .param-name,
  .function-block:not(.theme-dark) .param-name {
    color: #3c4043;
  }
  
  .function-block.theme-dark .param-name {
    color: #dadce0;
  }
  .param-value {
    padding: 12px 14px;
    border-radius: 8px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    white-space: pre-wrap;
    overflow-x: auto;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.5;
    max-height: 300px;
    scrollbar-width: thin;
    position: relative;
    pointer-events: auto !important; /* Ensure scrolling works during updates */
    transition: background-color 0.2s ease, border-color 0.2s ease;
    border: 1px solid transparent;
  }
  
  /* Custom scrollbar styles for Webkit browsers */
  .param-value::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .param-value::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px;
  }
  
  .param-value::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.15);
    border-radius: 20px;
    transition: background-color 0.2s ease;
  }
  
  .param-value::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }
  
  .function-block.theme-dark .param-value::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.15);
  }
  
  .function-block.theme-dark .param-value::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.25);
  }
  
  .function-block.theme-light .param-value,
  .function-block:not(.theme-dark) .param-value {
    background-color: #f5f7f9;
    border-color: rgba(0, 0, 0, 0.06);
  }
  
  .function-block.theme-dark .param-value {
    background-color: #282828;
    border-color: rgba(255, 255, 255, 0.05);
  }
  
  /* Styles for large content */
  .large-content {
    position: relative;
  }
  
  .large-content::after {
    content: "";
    display: none; /* Hide the streaming indicator */
  }
  
  .content-truncated {
    display: none; /* Hide the truncation notice */
  }
  
  /* Code display improvements - Apply to any streaming parameter */
  .param-value[data-streaming="true"] {
    padding: 0;
    overflow: auto; /* Changed from hidden to auto to enable scrolling */
    display: flex;
    flex-direction: column;
    max-height: 300px; /* Ensure we have a max height for scrolling */
    border-color: rgba(26, 115, 232, 0.3);
    animation: subtle-pulse 2s infinite ease-in-out;
  }
  
  @keyframes subtle-pulse {
    0% { border-color: rgba(26, 115, 232, 0.2); }
    50% { border-color: rgba(26, 115, 232, 0.5); }
    100% { border-color: rgba(26, 115, 232, 0.2); }
  }
  
  .function-block.theme-dark .param-value[data-streaming="true"] {
    border-color: rgba(138, 180, 248, 0.3);
    animation: subtle-pulse-dark 2s infinite ease-in-out;
  }
  
  @keyframes subtle-pulse-dark {
    0% { border-color: rgba(138, 180, 248, 0.2); }
    50% { border-color: rgba(138, 180, 248, 0.5); }
    100% { border-color: rgba(138, 180, 248, 0.2); }
  }
  
  .param-value[data-streaming="true"] > pre {
    margin: 0;
    padding: 12px 14px;
    overflow-x: auto;
    overflow-y: auto;
    max-height: 300px;
    flex: 1;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    background-color: inherit;
    color: inherit;
    border: none;
    scroll-behavior: smooth;
  }
  
  /* Streaming parameter styles */
  .streaming-param-name {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .streaming-param-name:before {
    content: "";
    margin-right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #1a73e8;
    animation: pulse 1.5s infinite ease-in-out;
    pointer-events: none; /* Ensure it doesn't interfere with interactions */
    flex-shrink: 0;
  }
  
  .function-block.theme-dark .streaming-param-name:before {
    background-color: #8ab4f8;
  }
  
  /* Stalled stream indicator styles */
  .stalled-indicator {
    margin-top: 10px;
    padding: 8px 12px;
    background-color: rgba(255, 200, 0, 0.1);
    border: 1px solid rgba(255, 200, 0, 0.3);
    border-radius: 4px;
    font-size: 14px;
    color: #664d00;
    animation: fadeIn 0.3s ease-in-out;
  }
  
  /* Pre-existing incomplete function call indicator */
  .stalled-indicator[data-pre-existing="true"] {
    background-color: rgba(180, 180, 180, 0.1);
    border: 1px solid rgba(180, 180, 180, 0.3);
    color: #555;
  }
  
  .stalled-message {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .stalled-message svg {
    flex-shrink: 0;
  }
  
  .stalled-retry-button {
    margin-top: 8px;
    padding: 4px 10px;
    background-color: rgba(255, 200, 0, 0.2);
    border: 1px solid rgba(255, 200, 0, 0.4);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: #664d00;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: background-color 0.2s;
  }
  
  .stalled-retry-button:hover {
    background-color: rgba(255, 200, 0, 0.3);
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes pulse {
    0% { opacity: 0.4; }
    50% { opacity: 1; }
    100% { opacity: 0.4; }
  }
  
  .incomplete-tag {
    border-left: 3px dashed #1a73e8 !important;
    background-color: #e8f0fe !important;
  }
  
  /* Button container for consistent alignment */
  .function-buttons {
    display: flex;
    gap: 12px;
    margin-top: 18px;
    justify-content: flex-start;
    align-items: center;
  }

  .raw-toggle,
  .execute-button,
  .insert-result-button,
  .attach-file-button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
  }
  
  .execute-button:active,
  .insert-result-button:active,
  .attach-file-button:active,
  .raw-toggle:active {
    transform: translateY(1px);
    box-shadow: 0 0 1px rgba(0,0,0,0.12);
  }
  
  /* Theme-specific raw toggle styles */
  .function-block.theme-light .raw-toggle,
  .function-block:not(.theme-dark) .raw-toggle {
    background: #f1f3f4;
    color: #5f6368;
    border: 1px solid rgba(0, 0, 0, 0.12);
  }
  
  .function-block.theme-light .raw-toggle:hover,
  .function-block:not(.theme-dark) .raw-toggle:hover {
    background: #e8eaed;
    color: #202124;
  }
  
  .function-block.theme-dark .raw-toggle {
    background: #2d2d2d;
    color: #dadce0;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  
  .function-block.theme-dark .raw-toggle:hover {
    background: #3c4043;
    color: #e8eaed;
  }
  
  /* Theme-specific button styles for execute and insert buttons - light theme */
  .function-block.theme-light .execute-button,
  .function-block:not(.theme-dark) .execute-button,
  .function-block.theme-light .insert-result-button,
  .function-block.theme-light .attach-file-button,
  .function-block:not(.theme-dark) .insert-result-button,
  .function-block:not(.theme-dark) .attach-file-button {
    background: #1a73e8;
    color: white;
    background-image: linear-gradient(to bottom, #1a73e8, #1967d2);
  }
  
  .function-block.theme-light .execute-button:hover,
  .function-block:not(.theme-dark) .execute-button:hover,
  .function-block.theme-light .insert-result-button:hover,
  .function-block.theme-light .attach-file-button:hover,
  .function-block:not(.theme-dark) .insert-result-button:hover,
  .function-block:not(.theme-dark) .attach-file-button:hover {
    background: #1967d2;
    background-image: linear-gradient(to bottom, #1967d2, #1765cc);
  }
  
  /* Theme-specific button styles for execute and insert buttons - dark theme */
  .function-block.theme-dark .execute-button,
  .function-block.theme-dark .insert-result-button,
  .function-block.theme-dark .attach-file-button {
    background: #8ab4f8;
    color: #202124;
    background-image: linear-gradient(to bottom, #8ab4f8, #7ba9f0);
  }
  
  .function-block.theme-dark .execute-button:hover,
  .function-block.theme-dark .insert-result-button:hover,
  .function-block.theme-dark .attach-file-button:hover {
    background: #7ba9f0;
    background-image: linear-gradient(to bottom, #7ba9f0, #6ca0e8);
  }
  
  /* Function results panel styles */
  .mcp-function-results-panel {
    border-radius: 6px;
    margin-top: 10px;
    overflow: auto;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 13px;
    line-height: 1.5;
  }
  
  .function-results-loading {
    padding: 10px;
    color: #5f6368;
    font-style: italic;
  }
  
  .function-result-success pre {
    margin: 0;
    padding: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .function-result-error {
    padding: 10px;
    color: #d32f2f;
    background-color: rgba(211, 47, 47, 0.05);
    border-radius: 4px;
  }
  
  .language-tag {
    display: inline-block;
    background: #e8f0fe;
    color: #1a73e8;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    margin-bottom: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  /* Dark mode styles */
  /* Additional theme-specific styles */
  .function-block.theme-light .param-name,
  .function-block:not(.theme-dark) .param-name {
    color: #202124;
  }
  
  .function-block.theme-dark .param-name {
    color: #e8eaed;
  }
  
  .function-block.theme-light .param-value,
  .function-block:not(.theme-dark) .param-value {
    background-color: #f1f3f4;
    color: #202124;
  }
  
  .function-block.theme-dark .param-value {
    background-color: #2d2d2d;
    color: #e8eaed;
  }
  
  .function-block.theme-light .language-tag,
  .function-block:not(.theme-dark) .language-tag {
    background: #e8f0fe;
    color: #1a73e8;
  }
  
  .function-block.theme-dark .language-tag {
    background: #174ea6;
    color: #e8eaed;
  }
  
  .function-block.theme-light .incomplete-tag,
  .function-block:not(.theme-dark) .incomplete-tag {
    border-left: 3px dashed #1a73e8 !important;
    background-color: #e8f0fe !important;
  }
  
  .function-block.theme-dark .incomplete-tag {
    border-left: 3px dashed #8ab4f8 !important;
    background-color: #174ea6 !important;
  }
  
  .function-block.theme-light .stalled-indicator,
  .function-block:not(.theme-dark) .stalled-indicator {
    background-color: rgba(255, 200, 0, 0.1);
    border: 1px solid rgba(255, 200, 0, 0.3);
    color: #664d00;
  }
  
  .function-block.theme-dark .stalled-indicator {
    background-color: rgba(255, 200, 0, 0.15);
    border: 1px solid rgba(255, 200, 0, 0.3);
    color: #ffcb6b;
  }
  
  .function-block.theme-light .mcp-function-results-panel,
  .function-block.theme-light .xml-results-panel,
  .function-block:not(.theme-dark) .mcp-function-results-panel,
  .function-block:not(.theme-dark) .xml-results-panel {
    background-color: #f8f9fa;
    border: 1px solid #eaecef;
    color: #202124;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    margin-top: 12px;
  }
  
  .function-block.theme-dark .mcp-function-results-panel,
  .function-block.theme-dark .xml-results-panel {
    background-color: #1e1e1e;
    border: 1px solid rgba(255,255,255,0.03);
    color: #e8eaed;
    border-radius: 8px;
    box-shadow: 0 3px 12px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15);
    margin-top: 12px;
  }
  
  .function-block.theme-light .function-result-error,
  .function-block:not(.theme-dark) .function-result-error {
    color: #d32f2f;
    background-color: rgba(211, 47, 47, 0.05);
  }
  
  .function-block.theme-dark .function-result-error {
    color: #f28b82;
    background-color: rgba(242, 139, 130, 0.1);
  }
  
  /* XML pre element styles */
  .xml-pre {
    white-space: pre-wrap;
    margin: 0;
    padding: 12px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
  }
  
  /* Small layout adjustments for mobile */
  @media (max-width: 768px) {
    .function-block {
      padding: 14px;
      margin: 15px 0;
    }
    .function-name {
      font-size: 15px;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .param-name {
      font-size: 13px;
      margin-top: 12px;
      margin-bottom: 4px;
    }
    .param-value {
      max-height: 200px;
      padding: 10px 12px;
      font-size: 12.5px;
    }
    .call-id {
      font-size: 0.8em;
      padding: 2px 6px;
    }
  }
  
  /* Spinner animation for loading state */
  .function-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
  }
  
  /* Theme-specific spinner styles */
  .function-block.theme-light .function-spinner,
  .function-block:not(.theme-dark) .function-spinner {
    border: 2px solid rgba(26,115,232,0.3);
    border-top: 2px solid rgba(26,115,232,1);
  }
  
  .function-block.theme-dark .function-spinner {
    border: 2px solid rgba(138, 180, 248, 0.3);
    border-top: 2px solid rgba(138, 180, 248, 1);
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .function-loading .function-name {
    position: relative;
  }
  
  /* Styles for insert button container */
  .insert-button-container {
    margin-top: 10px;
    margin-bottom: 10px;
    display: flex;
    justify-content: flex-end;
  }
  
  /* Button padding adjustments */
  .insert-result-button {
    padding: 4px 12px; /* Slightly smaller padding than execute button */
  }
  
  /* Success and error states for insert button */
  .insert-result-button.insert-success {
    background: #34a853 !important;
    color: white !important;
  }
  
  .insert-result-button.insert-error {
    background: #ea4335 !important;
    color: white !important;
  }
  
  /* Styles for attach file button */
  .attach-file-button {
    padding: 4px 12px;
    margin-left: 6px;
  }
  .attach-file-button.attach-success {
    background: #34a853 !important;
    color: white !important;
  }
  .attach-file-button.attach-error {
    background: #ea4335 !important;
    color: white !important;
  }
  
  /* Styles for smooth content transitions */
  .function-content-wrapper {
    position: relative;
    width: 100%;
    transition: opacity 0.2s ease-out, transform 0.2s ease-out;
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
  
  /* Transition styles end */
  
  /* Function history panel styles */
  .function-history-panel {
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  
  .function-block.theme-light .function-history-panel,
  .function-block:not(.theme-dark) .function-history-panel {
    background-color: #f8f9fa;
    border: 1px solid #dadce0;
    color: #202124;
  }
  
  .function-block.theme-dark .function-history-panel {
    background-color: #2d2d2d;
    border: 1px solid #5f6368;
    color: #e8eaed;
  }
  
  .function-history-header {
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .function-execution-info {
    margin-bottom: 8px;
    line-height: 1.4;
  }
  
  .function-reexecute-button {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  
  .function-block.theme-light .function-reexecute-button,
  .function-block:not(.theme-dark) .function-reexecute-button {
    background: #1a73e8;
    color: white;
    border: none;
  }
  
  .function-block.theme-light .function-reexecute-button:hover,
  .function-block:not(.theme-dark) .function-reexecute-button:hover {
    background: #1765cc;
  }
  
  .function-block.theme-dark .function-reexecute-button {
    background: #8ab4f8;
    color: #202124;
    border: none;
  }
  
  .function-block.theme-dark .function-reexecute-button:hover {
    background: #aecbfa;
  }
`;
