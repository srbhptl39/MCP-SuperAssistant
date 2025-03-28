# Gemini Adapter Components

This directory contains components specific to supporting the Google Gemini website (https://gemini.google.com/).

## Files

- `index.ts` - Exports all Gemini-related functionality
- `PatternUnifiedObserver.ts` - Implements a pattern-based observer for detecting tool commands in Gemini's DOM
- `chatInputHandler.ts` - Functions for interacting with Gemini's chat input (inserting text, submitting, uploading files)
- `markdownHandler.ts` - Functions for processing markdown content in Gemini's responses

## How it works

The Gemini adapter integrates with the extension's architecture to provide support for the Google Gemini website. It:

1. Observes the DOM for changes to detect tool commands in chat responses
2. Processes markdown content to extract MCP tool commands
3. Provides methods to interact with the chat interface (inserting text, submitting)
4. Handles file uploads if supported

## CSS Selectors

The adapter uses the following CSS selectors to interact with Gemini's UI:

- Chat input: `textarea[aria-label="Input text"]`
- Submit button: `button[role="button"][aria-label="Send message"]`
- File upload: `button[aria-label="Add files"]`
- Response content: `.model-response-text`

## Implementation Details

- Uses the BaseUnifiedObserver for pattern-based observation of the DOM
- The GeminiPatternUnifiedObserver extends BaseUnifiedObserver to provide Gemini-specific functionality
- Dispatches custom events for tool detection and sidebar integration
- Handles navigation by monitoring URL changes and popstate events
- Converts detected tools to the correct format for processing in the sidebar
- Integrates with the sidebar to display tool outputs 