**MCP SuperAssistant Proxy** 

MCP SuperAssistant Proxy runs a **MCP stdio-based servers** and **SSE-based servers** over **SSE (Server-Sent Events)** with one command. This helps MCP SuperAssistant to connect to remote MCP servers and tools to extension MCP-SuperAssistant acting like a proxy.

## Installation & Usage

Run MCP SuperAssistant Proxy via `npx`:

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@latest --stdio "uvx mcp-server-git"
```

- **`--port 8000`**: Port to listen on (default: `3007`)
- **`--stdio "command"`**: Command that runs an MCP server over stdio
- **`--ssetosse "https://mcp-server.example.com"`**: SSE URL to connect to for SSE-to-SSE mode
- **`--timeout 30000`**: Connection timeout in milliseconds for SSE connections (default: `30000`)
- **`--logLevel info | none`**: Controls logging level (default: `info`). Use `none` to suppress all logs.
- **`--cors`**: Enable CORS (Optional, by default enabled)
- **`--healthEndpoint /healthz`**: Register one or more endpoints (can be used multiple times) that respond with `"ok"`

Once started on SSE:
- **SSE endpoint**: `GET http://localhost:3007/sse`
- **POST messages**: `POST http://localhost:3007/message`

## Operating Modes

MCP SuperAssistant Proxy supports three operating modes:

### 1. Stdio to SSE Mode

In this mode, MCP SuperAssistant Proxy takes a stdio-based MCP server and exposes it via SSE endpoints:

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@latest --stdio "npx -y @modelcontextprotocol/server-filesystem /Users/MyName/Desktop"
```

### 2. SSE to SSE Mode

This mode allows MCP SuperAssistant Proxy to connect to a remote SSE server and re-expose it locally via SSE endpoints:

```bash
npx -y @srbhptl39/mcp-superassistant-proxy@latest --ssetosse "https://mcp-server.example.com" --port 3007
```

This is useful for:
- Proxying remote MCP servers
- Adding CORS support to remote servers
- Providing health endpoints for monitoring

## Example

1. **Run MCP SuperAssistant Proxy**:
   ```bash
   npx -y @srbhptl39/mcp-superassistant-proxy@latest --port 3007 \
       --stdio "npx -y @modelcontextprotocol/server-filesystem /Users/MyName/Desktop"
   ```

## Why MCP?

[Model Context Protocol](https://spec.modelcontextprotocol.io/) standardizes how AI tools exchange data. If your MCP server only speaks stdio, MCP SuperAssistant Proxy exposes an SSE-based interface so remote clients (and tools like MCP Inspector or Claude Desktop) can connect without extra server changes.

## Advanced Configuration

MCP SuperAssistant Proxy is designed with modularity in mind:
- It automatically derives the JSON‑RPC version from incoming requests, ensuring future compatibility.
- Package information (name and version) is retransmitted where possible.
- Stdio-to-SSE mode uses standard logs and SSE-to-Stdio mode logs via stderr (as otherwise it would prevent stdio functionality).
- The SSE-to-SSE mode provides automatic reconnection with backoff if the remote server connection is lost.

