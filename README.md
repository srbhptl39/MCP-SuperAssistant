# MCP SuperAssistant Chrome Extension

![MCP SuperAssistant](assets/logo.png)

## Overview

MCP SuperAssistant is a Chrome extension that integrates the Model Context Protocol (MCP) tools with AI platforms like Perplexity, ChatGPT, Google Gemini, and Grok. It allows users to execute MCP tools directly from these platforms and insert the results back into the conversation, enhancing the capabilities of web-based AI assistants.

## What is MCP?

The Model Context Protocol (MCP) is an open standard developed by Anthropic that connects AI assistants to systems where data actually lives, including content repositories, business tools, and development environments. It serves as a universal protocol that enables AI systems to securely and dynamically interact with data sources in real time.

## Key Features

- **Multiple AI Platform Support**: Works with ChatGPT, Perplexity, Google Gemini, Grok, AiStudio and more!
- **Sidebar UI**: Clean, unobtrusive interface that integrates with the AI platform
- **Tool Detection**: Automatically detects MCP tool calls in AI responses
- **Tool Execution**: Execute MCP tools with a single click
- **Tool Result Integration**: Seamlessly insert tool execution results back into the AI conversation
- **Auto-Execute Mode**: Automatically execute detected tools
- **Auto-Submit Mode**: Automatically submit chat input after result insertion
- **Push Content Mode**: Option to push page content instead of overlaying
- **Preferences Persistence**: Remembers sidebar position, size, and settings
- **Dark/Light Mode Support**: Adapts to the AI platform's theme

## Architecture

MCP SuperAssistant follows a modular architecture:

- **Content Scripts**: Inject the sidebar UI into supported AI platforms
- **Site Adapters**: Handle platform-specific logic for different AI platforms
- **Unified Observers**: Monitor the DOM for MCP tool patterns
- **Shadow DOM**: Isolates the UI styling from the host page
- **Background Script**: Manages connection to MCP servers and tool execution

## Installation

### From Chrome Web Store

1. Visit the [Chrome Web Store page](#) for MCP SuperAssistant
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation (Development)

1. Clone this repository
2. Run `pnpm install` to install dependencies
3. Run `pnpm build` to build the extension
4. Navigate to `chrome://extensions/` in Chrome
5. Enable "Developer mode"
6. Click "Load unpacked" and select the `dist` directory

## Usage

1. Navigate to a supported AI platform (ChatGPT, Perplexity, Google Gemini, or Grok)
2. The MCP SuperAssistant sidebar will appear on the right side of the page
3. Configure your MCP server by clicking on the server status indicator
4. Interact with the AI and use MCP tools by:
   - Waiting for the AI to suggest a tool (auto-detected)
   - Executing the tool via the sidebar
   - Viewing the result and inserting it back into the conversation

## Development

### Prerequisites

- Node.js (v16+)
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Create zip package for distribution
pnpm zip
```

### Project Structure

```
pages/content/src/
├── adapters/              # Site adapter implementations
├── components/            # UI and functional components
│   ├── common/            # Shared component functionality
│   ├── perplexity/        # Perplexity-specific components
│   ├── chatgpt/           # ChatGPT-specific components
│   ├── gemini/            # Gemini-specific components
│   ├── grok/              # Grok-specific components
│   ├── sidebar/           # Sidebar components
│   └── ui/                # Shared UI components
└── utils/                 # Utility functions
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) by Anthropic
- Built with [Chrome Extension Boilerplate with React + Vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
