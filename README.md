# MCP SuperAssistant (Image Enhanced)

> **Fork Features:**
> *   **Visual Preview:** Renders Base64 data as inline images.
> *   **Batch Upload:** One-click multi-image upload to chat.


## Overview

**MCP SuperAssistant** connects your local **Model Context Protocol (MCP)** servers to web-based AI platforms. It allows LLMs running in your browser (ChatGPT, Gemini, Perplexity, etc.) to execute local tools, read files, and interact with your environment securely.

## Quick Start

### 1. Installation
*   **Users:** Download the `.zip` from [Releases](https://github.com/srbhptl39/MCP-SuperAssistant/releases), unzip, and use "Load unpacked" in `chrome://extensions/`.
*   **Devs:** Clone repo -> `pnpm install` -> `pnpm build` -> Load `dist` folder.

### 2. Setup Local Proxy
The extension needs a local bridge to talk to MCP servers.

1.  Create `config.json` (defines your tools):
    ```json
    {
      "mcpServers": {
        "desktop-commander": {
          "command": "npx",
          "args": ["-y", "@wonderwhy-er/desktop-commander"]
        }
      }
    }
    ```
2.  Run the proxy:
    ```bash
    npx -y @srbhptl39/mcp-superassistant-proxy@latest --config ./config.json --outputTransport sse
    ```

### 3. Connect
Open sidebar in ChatGPT (or supported site) -> Enter `http://localhost:3006/sse` -> **Connect**.

---
*Original Project by [Saurabh Patel](https://github.com/srbhptl39).*
