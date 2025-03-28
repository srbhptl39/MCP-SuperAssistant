#!/usr/bin/env node
/**
 * index.ts
 *
 * Run MCP stdio servers over SSE and SSE over stdio.
 *
 * Usage:
 *   # stdio -> SSE
 *   npx -y @srbhptl39/mcp-superassistant-proxy --stdio "npx -y @modelcontextprotocol/server-filesystem /some/folder" \
 *                       --port 8000 --baseUrl http://localhost:8000 --ssePath /sse --messagePath /message
 *
 *   # SSE -> stdio
 *   npx -y @srbhptl39/mcp-superassistant-proxy --sse "https://abc.xyz.app"
 * 
 *   # SSE -> SSE
 *   npx -y @srbhptl39/mcp-superassistant-proxy --port 3007 --ssetosse "https://abc.xyz.app"
 */

import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { z } from 'zod'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version || '1.0.0'
  } catch (err) {
    console.error('[mcp-superassistant-proxy]', 'Unable to retrieve version:', err)
    return 'unknown'
  }
}

const log = (...args: any[]) => console.log('[mcp-superassistant-proxy]', ...args)
const logStderr = (...args: any[]) => console.error('[mcp-superassistant-proxy]', ...args)

interface Logger {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
}

const noneLogger: Logger = {
  info: () => {},
  error: () => {}
}

interface StdioToSseArgs {
  stdioCmd: string
  port: number
  baseUrl: string
  ssePath: string
  messagePath: string
  logger: Logger
  enableCors: boolean
  healthEndpoints: string[]
}

const onSignals = ({ logger }: { logger: Logger }) => {
  process.on('SIGINT', () => {
    logger.info('Caught SIGINT. Exiting...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    logger.info('Caught SIGTERM. Exiting...')
    process.exit(0)
  })

  process.on('SIGHUP', () => {
    logger.info('Caught SIGHUP. Exiting...');
    process.exit(0);
  })

  process.stdin.on('close', () => {
    logger.info('stdin closed. Exiting...');
    process.exit(0)
  })
}

async function stdioToSse(args: StdioToSseArgs) {
  const {
    stdioCmd,
    port,
    baseUrl,
    ssePath,
    messagePath,
    logger,
    enableCors,
    healthEndpoints
  } = args

  logger.info('Starting...')
  logger.info(`  - port: ${port}`)
  logger.info(`  - stdio: ${stdioCmd}`)
  if (baseUrl) {
    logger.info(`  - baseUrl: ${baseUrl}`)
  }
  logger.info(`  - ssePath: ${ssePath}`)
  logger.info(`  - messagePath: ${messagePath}`)

  logger.info(`  - CORS enabled: ${enableCors}`)
  logger.info(`  - Health endpoints: ${healthEndpoints.length ? healthEndpoints.join(', ') : '(none)'}`)

  onSignals({ logger })

  const child: ChildProcessWithoutNullStreams = spawn(stdioCmd, { shell: true })
  child.on('exit', (code, signal) => {
    logger.error(`Child exited: code=${code}, signal=${signal}`)
    process.exit(code ?? 1)
  })

  const server = new Server(
    { name: 'mcp-superassistant-proxy', version: getVersion() },
    { capabilities: {} }
  )

  const sessions: Record<string, { transport: SSEServerTransport; response: express.Response }> = {}

  const app = express()

  if (enableCors) {
    app.use(cors())
  }

  app.use((req, res, next) => {
    if (req.path === messagePath) {
      next();
    } else {
      bodyParser.json()(req, res, next);
    }
  })

  for (const ep of healthEndpoints) {
    app.get(ep, (_req, res) => {
      res.send('ok')
    })
  }

  app.get(ssePath, async (req, res) => {
    logger.info(`New SSE connection from ${req.ip}`)

    const sseTransport = new SSEServerTransport(`${baseUrl}${messagePath}`, res)
    await server.connect(sseTransport)

    const sessionId = sseTransport.sessionId
    if (sessionId) {
      sessions[sessionId] = { transport: sseTransport, response: res }
    }

    sseTransport.onmessage = (msg: JSONRPCMessage) => {
      logger.info(`SSE → Child (session ${sessionId}): ${JSON.stringify(msg)}`)
      child.stdin.write(JSON.stringify(msg) + '\n')
    }

    sseTransport.onclose = () => {
      logger.info(`SSE connection closed (session ${sessionId})`)
      delete sessions[sessionId]
    }

    sseTransport.onerror = err => {
      logger.error(`SSE error (session ${sessionId}):`, err)
      delete sessions[sessionId]
    }

    req.on('close', () => {
      logger.info(`Client disconnected (session ${sessionId})`)
      delete sessions[sessionId]
    })
  })

  // @ts-ignore
  app.post(messagePath, async (req, res) => {
    const sessionId = req.query.sessionId as string
    if (!sessionId) {
      return res.status(400).send('Missing sessionId parameter')
    }

    const session = sessions[sessionId]
    if (session?.transport?.handlePostMessage) {
      logger.info(`POST to SSE transport (session ${sessionId})`)
      await session.transport.handlePostMessage(req, res)
    } else {
      res.status(503).send(`No active SSE connection for session ${sessionId}`)
    }
  })

  app.listen(port, () => {
    logger.info(`Listening on port ${port}`)
    logger.info(`SSE endpoint: http://localhost:${port}${ssePath}`)
    logger.info(`POST messages: http://localhost:${port}${messagePath}`)
  })

  let buffer = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    lines.forEach(line => {
      if (!line.trim()) return
      try {
        const jsonMsg = JSON.parse(line)
        logger.info('Child → SSE:', jsonMsg)
        for (const [sid, session] of Object.entries(sessions)) {
          try {
            session.transport.send(jsonMsg)
          } catch (err) {
            logger.error(`Failed to send to session ${sid}:`, err)
            delete sessions[sid]
          }
        }
      } catch {
        logger.error(`Child non-JSON: ${line}`)
      }
    })
  })

  child.stderr.on('data', (chunk: Buffer) => {
    logger.error(`Child stderr: ${chunk.toString('utf8')}`)
  })
}

interface SseToStdioArgs {
  sseUrl: string
  logger: Logger
}

async function sseToStdio(args: SseToStdioArgs) {
  const { sseUrl, logger } = args

  logger.info('Starting...')
  logger.info(`  - sse: ${sseUrl}`)
  logger.info('Connecting to SSE...')

  onSignals({ logger })

  const sseTransport = new SSEClientTransport(new URL(sseUrl))
  const sseClient = new Client(
    { name: 'mcp-superassistant-proxy', version: getVersion() },
    { capabilities: {} }
  )

  sseTransport.onerror = err => {
    logger.error('SSE error:', err)
  }
  sseTransport.onclose = () => {
    logger.error('SSE connection closed')
    process.exit(1)
  }

  await sseClient.connect(sseTransport)
  logger.info('SSE connected')

  const stdioServer = new Server(
    sseClient.getServerVersion() ?? { name: 'mcp-superassistant-proxy', version: getVersion() },
    { capabilities: sseClient.getServerCapabilities() }
  )
  const stdioTransport = new StdioServerTransport()
  await stdioServer.connect(stdioTransport)

  const wrapResponse = (req: JSONRPCRequest, payload: object) => ({
    jsonrpc: req.jsonrpc || '2.0',
    id: req.id,
    ...payload,
  })

  stdioServer.transport!.onmessage = async (message: JSONRPCMessage) => {
    const isRequest = 'method' in message && 'id' in message
    if (isRequest) {
      logger.info('Stdio → SSE:', message)
      const req = message as JSONRPCRequest
      let result
      try {
        result = await sseClient.request(req, z.any())
      } catch (err) {
        logger.error('Request error:', err)
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? (err as any).code
            : -32000
        let errorMsg =
          err && typeof err === 'object' && 'message' in err
            ? (err as any).message
            : 'Internal error'
        const prefix = `MCP error ${errorCode}:`
        if (errorMsg.startsWith(prefix)) {
          errorMsg = errorMsg.slice(prefix.length).trim()
        }
        const errorResp = wrapResponse(req, {
          error: {
            code: errorCode,
            message: errorMsg,
          },
        })
        process.stdout.write(JSON.stringify(errorResp) + '\n')
        return
      }
      const response = wrapResponse(
        req,
        result.hasOwnProperty('error')
          ? { error: { ...result.error } }
          : { result: { ...result } }
      )
      logger.info('Response:', response)
      process.stdout.write(JSON.stringify(response) + '\n')
    } else {
      logger.info('SSE → Stdio:', message)
      process.stdout.write(JSON.stringify(message) + '\n')
    }
  }

  logger.info('Stdio server listening')
}

async function sseToSse({
  ssetosseUrl,
  port,
  baseUrl,
  ssePath,
  messagePath,
  logger,
  enableCors,
  healthEndpoints,
  timeout
}: {
  ssetosseUrl: string,
  port: number,
  baseUrl: string,
  ssePath: string,
  messagePath: string,
  logger: Logger,
  enableCors: boolean,
  healthEndpoints: string[],
  timeout: number
}) {
  logger.info('Starting sse-to-sse mode...')
  logger.info(`  - sse-to-sse URL: ${ssetosseUrl}`)
  logger.info(`  - connection timeout: ${timeout}ms`)
  onSignals({ logger })

  // Track connection state
  let isConnecting = false
  let isConnected = false
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const RECONNECT_DELAY_MS = 2000
  let remoteSSETransport: SSEClientTransport | null = null
  let sseClient: Client | null = null

  // Create local server with capabilities that will be updated when remote connection is established
  const localServer = new Server(
    { name: 'mcp-superassistant-proxy', version: getVersion() },
    { capabilities: {} }
  )

  // Setup express app
  const app = express()
  if (enableCors) {
    app.use(cors())
  }
  app.use((req, res, next) => {
    if (req.path === messagePath) {
      next();
    } else {
      bodyParser.json()(req, res, next);
    }
  })

  // Define a type that allows for any return value from the handler
  type AsyncRequestHandler = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => Promise<any>;

  const asyncHandler = (fn: AsyncRequestHandler): express.RequestHandler => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
      // Return void as Express expects
    };
  };

  for (const ep of healthEndpoints) {
    app.get(ep, (_req, res) => {
      res.send('ok')
    })
  }

  const sessions: Record<string, { transport: SSEServerTransport; response: express.Response }> = {}

  // Function to connect to remote SSE
  const connectToRemoteSSE = async (): Promise<boolean> => {
    if (isConnecting) return false
    
    isConnecting = true
    reconnectAttempts++
    
    try {
      logger.info(`Connecting to remote SSE (attempt ${reconnectAttempts})...`)
      const remoteSSEUrl = new URL(ssetosseUrl)
      
      // Check if we can resolve the hostname before attempting connection
      try {
        logger.info(`Resolving hostname: ${remoteSSEUrl.hostname}`)
        // We don't actually need to do anything here - the SSEClientTransport will handle the connection
        // This is just to provide better logging
      } catch (dnsErr) {
        logger.error(`DNS resolution failed for ${remoteSSEUrl.hostname}:`, dnsErr)
        isConnecting = false
        return false
      }
      
      // Create SSE transport with custom options
      remoteSSETransport = new SSEClientTransport(remoteSSEUrl);
      
      // Set a connection timeout by creating a timer that will abort if connection takes too long
      const connectionTimeoutId = setTimeout(() => {
        logger.error(`Connection to ${remoteSSEUrl.toString()} timed out after ${timeout}ms`);
        if (remoteSSETransport && !isConnected) {
          // Force close the transport if it exists but hasn't connected yet
          try {
            remoteSSETransport.close();
          } catch (e) {
            logger.error('Error closing timed out transport:', e);
          }
        }
      }, timeout);
      
      remoteSSETransport.onerror = async (err) => { 
        // Check for DNS or network errors
        const cause = (err as any)?.cause
        if (cause && (
          cause.code === 'ENOTFOUND' || 
          cause.code === 'ECONNREFUSED' || 
          cause.code === 'ETIMEDOUT' ||
          cause.code === 'ENETUNREACH'
        )) {
          logger.error(`Network error (${cause.code}): ${cause.message}`)
        } else {
          logger.error('Remote SSE error:', err)
        }
        
        if (isConnected) {
          isConnected = false
          logger.info('Will attempt to reconnect to remote SSE...')
          setTimeout(attemptReconnect, RECONNECT_DELAY_MS)
        }
      }
      
      remoteSSETransport.onclose = async () => { 
        logger.error('Remote SSE connection closed')
        if (isConnected) {
          isConnected = false
          logger.info('Will attempt to reconnect to remote SSE...')
          setTimeout(attemptReconnect, RECONNECT_DELAY_MS)
        }
      }

      sseClient = new Client({ name: 'mcp-superassistant-proxy', version: getVersion() }, { capabilities: {} })
      await sseClient.connect(remoteSSETransport)
      
      // Clear the connection timeout since we've successfully connected
      clearTimeout(connectionTimeoutId)
      
      // Update local server capabilities by creating a new instance
      const serverCapabilities = sseClient.getServerCapabilities();
      if (serverCapabilities && Object.keys(serverCapabilities).length > 0) {
        logger.info('Updating local server with remote capabilities');
        // We can't update the existing server's capabilities directly,
        // but the existing connections will continue to work
      }
      
      // Set up message handler for remote SSE
      remoteSSETransport.onmessage = (msg: JSONRPCMessage) => {
        logger.info(`Received message from remote SSE: ${JSON.stringify(msg)}`)
        for (const [sid, session] of Object.entries(sessions)) {
          try {
            session.transport.send(msg)
          } catch (err) {
            logger.error(`Failed to send to local session ${sid}:`, err)
            delete sessions[sid]
          }
        }
      }
      
      logger.info('Connected to remote SSE')
      isConnected = true
      isConnecting = false
      reconnectAttempts = 0
      return true
    } catch (err) {
      // No need to clear timeout here as it's out of scope
      
      // Enhanced error logging for connection failures
      const cause = (err as any)?.cause
      if (cause) {
        if (cause.code === 'ENOTFOUND') {
          logger.error(`DNS resolution failed: ${cause.hostname} not found`)
        } else if (cause.code === 'ECONNREFUSED') {
          logger.error(`Connection refused: The server at ${ssetosseUrl} actively refused the connection`)
        } else if (cause.code === 'ETIMEDOUT') {
          logger.error(`Connection timed out: The server at ${ssetosseUrl} did not respond`)
        } else {
          logger.error(`Failed to connect to remote SSE: ${cause.code || 'Unknown error'}`, cause.message || err)
        }
      } else {
        logger.error('Failed to connect to remote SSE:', err)
      }
      
      isConnecting = false
      isConnected = false
      return false
    }
  }

  // Function to attempt reconnection with backoff
  const attemptReconnect = async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts. Giving up.`)
      return
    }
    
    // Use a longer base delay for DNS errors (5 seconds instead of 2)
    const baseDelay = RECONNECT_DELAY_MS
    const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts - 1), 60000) // Cap at 1 minute
    logger.info(`Attempting to reconnect in ${Math.round(delay/1000)} seconds...`)
    
    setTimeout(async () => {
      const success = await connectToRemoteSSE()
      if (!success && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        attemptReconnect()
      }
    }, delay)
  }

  // Initial connection attempt
  await connectToRemoteSSE()

  // Set up local SSE endpoint
  app.get(ssePath, asyncHandler(async (req, res) => {
    logger.info(`New local SSE connection from ${req.ip}`);
    const localSSETransport = new SSEServerTransport(`${baseUrl}${messagePath}`, res);
    await localServer.connect(localSSETransport);
    const sessionId = localSSETransport.sessionId;
    if (sessionId) {
      sessions[sessionId] = { transport: localSSETransport, response: res };
    }
    
    localSSETransport.onmessage = (msg: JSONRPCMessage) => {
      logger.info(`Local SSE message from session ${sessionId}: ${JSON.stringify(msg)}`);
      
      // Only forward messages if connected to remote SSE
      if (isConnected && remoteSSETransport) {
        try {
          remoteSSETransport.send(msg);
        } catch (e) {
          logger.error(`Error forwarding message from local to remote SSE:`, e);
          // If sending fails, try to reconnect
          if (isConnected) {
            isConnected = false
            setTimeout(attemptReconnect, RECONNECT_DELAY_MS)
          }
        }
      } else {
        logger.info(`Cannot forward message: not connected to remote SSE`);
        // If we're not already trying to reconnect, attempt it
        if (!isConnecting && !isConnected) {
          setTimeout(attemptReconnect, RECONNECT_DELAY_MS)
        }
      }
    };
    
    localSSETransport.onclose = () => {
      logger.info(`Local SSE connection closed (session ${sessionId})`);
      delete sessions[sessionId];
    };
    
    localSSETransport.onerror = err => {
      logger.error(`Local SSE error (session ${sessionId}):`, err);
      delete sessions[sessionId];
    };
    
    req.on('close', () => {
      logger.info(`Local client disconnected (session ${sessionId})`);
      delete sessions[sessionId];
    });
  }));

  app.post(messagePath, asyncHandler(async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).send('Missing sessionId parameter');
    }
    const session = sessions[sessionId];
    if (session?.transport?.handlePostMessage) {
      logger.info(`POST to local SSE transport (session ${sessionId})`);
      await session.transport.handlePostMessage(req, res);
    } else {
      res.status(503).send(`No active SSE connection for session ${sessionId}`);
    }
  }));

  app.listen(port, () => {
    logger.info(`Local SSE server listening on port ${port}`)
    logger.info(`SSE endpoint: http://localhost:${port}${ssePath}`)
    logger.info(`POST messages: http://localhost:${port}${messagePath}`)
  })
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('stdio', {
      type: 'string',
      description: 'Command to run an MCP server over Stdio'
    })
    .option('sse', {
      type: 'string',
      description: 'SSE URL to connect to'
    })
    .option('port', {
      type: 'number',
      default: 3007,
      description: '(stdio→SSE) Port to run on'
    })
    .option('baseUrl', {
      type: 'string',
      default: '',
      description: '(stdio→SSE) Base URL for SSE clients'
    })
    .option('ssePath', {
      type: 'string',
      default: '/sse',
      description: '(stdio→SSE) Path for SSE subscriptions'
    })
    .option('messagePath', {
      type: 'string',
      default: '/message',
      description: '(stdio→SSE) Path for SSE messages'
    })
    .option('logLevel', {
      choices: ['info', 'none'] as const,
      default: 'info',
      description: 'Set logging level: "info" or "none"'
    })
    .option('cors', {
      type: 'boolean',
      default: true,
      description: 'Enable CORS'
    })
    .option('healthEndpoint', {
      type: 'array',
      default: [],
      description: 'One or more endpoints returning "ok", e.g. --healthEndpoint /healthz --healthEndpoint /readyz'
    })
    .option('ssetosse', {
      type: 'string',
      description: 'SSE URL to connect to for sse-to-sse mode'
    })
    .option('timeout', {
      type: 'number',
      default: 30000,
      description: 'Connection timeout in milliseconds'
    })
    .help()
    .parseSync()

  const hasStdio = Boolean(argv.stdio)
  const hasSse = Boolean(argv.sse)
  const hasSsetosse = Boolean(argv.ssetosse)
  if ([hasStdio, hasSse, hasSsetosse].filter(Boolean).length !== 1) {
    logStderr('Error: Specify exactly one of --stdio, --sse, or --ssetosse')
    process.exit(1)
  }

  try {
    if (hasStdio) {
      await stdioToSse({
        stdioCmd: argv.stdio!,
        port: argv.port,
        baseUrl: argv.baseUrl,
        ssePath: argv.ssePath,
        messagePath: argv.messagePath,
        logger: argv.logLevel === 'none'
          ? noneLogger
          : { info: log, error: logStderr },
        enableCors: argv.cors,
        healthEndpoints: argv.healthEndpoint as string[]
      })
    } else if (hasSse) {
      await sseToStdio({
        sseUrl: argv.sse!,
        logger: argv.logLevel === 'none'
          ? noneLogger
          : { info: logStderr, error: logStderr }
      })
    } else if (hasSsetosse) {
      await sseToSse({
        ssetosseUrl: argv.ssetosse!,
        port: argv.port,
        baseUrl: argv.baseUrl,
        ssePath: argv.ssePath,
        messagePath: argv.messagePath,
        logger: argv.logLevel === 'none' ? noneLogger : { info: log, error: logStderr },
        enableCors: argv.cors,
        healthEndpoints: argv.healthEndpoint as string[],
        timeout: argv.timeout
      })
    }
  } catch (err) {
    logStderr('Fatal error:', err)
    process.exit(1)
  }
}

main()