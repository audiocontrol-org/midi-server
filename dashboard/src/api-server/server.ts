import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { execSync } from 'child_process'
import type { ApiServerConfig, BuildInfo, LogEntry, LogSeverity } from './types'
import { ProcessManager } from './process-manager'
import { LogBuffer } from './log-buffer'
import { proxyToMidiServer } from './midi-proxy'

export class ApiServer {
  private server: Server | null = null
  private logBuffer: LogBuffer
  private processManager: ProcessManager
  private config: ApiServerConfig
  private buildInfo: BuildInfo
  private sseClients: Set<ServerResponse> = new Set()

  constructor(config: ApiServerConfig, buildInfo: BuildInfo) {
    this.config = config
    this.buildInfo = buildInfo
    this.logBuffer = new LogBuffer()
    this.processManager = new ProcessManager(config.midiServerBinaryPath, this.logBuffer)

    // Subscribe to log entries for SSE broadcast
    this.logBuffer.subscribe((entry) => {
      this.broadcastLogEntry(entry)
    })
  }

  setBinaryPath(path: string): void {
    this.processManager.setBinaryPath(path)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res))

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(this.config.apiPort, () => {
        console.log(`API server listening on http://localhost:${this.config.apiPort}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    // Stop MIDI server first
    await this.processManager.stop()

    // Close SSE connections
    for (const client of this.sseClients) {
      client.end()
    }
    this.sseClients.clear()

    // Close HTTP server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve())
      } else {
        resolve()
      }
    })
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    // Parse path from request URL (works with both standalone server and Vite middleware)
    const reqUrl = req.url || '/'
    const path = reqUrl.split('?')[0]

    try {
      // API routes
      if (path === '/api/health') {
        return this.handleHealth(res)
      }

      if (path === '/api/status') {
        return this.handleStatus(res)
      }

      if (path === '/api/server/start' && req.method === 'POST') {
        return await this.handleServerStart(req, res)
      }

      if (path === '/api/server/stop' && req.method === 'POST') {
        return await this.handleServerStop(res)
      }

      if (path === '/api/logs' && req.method === 'GET') {
        return this.handleGetLogs(res)
      }

      if (path === '/api/logs' && req.method === 'DELETE') {
        return this.handleClearLogs(res)
      }

      if (path === '/api/logs' && req.method === 'POST') {
        return await this.handleAddLog(req, res)
      }

      if (path === '/api/logs/stream' && req.method === 'GET') {
        return this.handleLogStream(res)
      }

      if (path === '/api/build-info') {
        return this.handleBuildInfo(res)
      }

      // Proxy to MIDI server (strip /midi prefix)
      if (path.startsWith('/midi')) {
        const midiPath = path.slice(5) || '/'
        return await proxyToMidiServer(req, res, {
          targetHost: 'localhost',
          targetPort: this.config.midiServerPort
        }, midiPath)
      }

      // 404 for unknown routes
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Not Found', path }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Internal Server Error', message }))
    }
  }

  private handleHealth(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'ok', service: 'api-server' }))
  }

  private handleStatus(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(this.processManager.getStatus()))
  }

  private async handleServerStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readJsonBody<{ port?: number }>(req)
    const port = body?.port || this.config.midiServerPort

    try {
      const status = await this.processManager.start(port)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(status))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: message }))
    }
  }

  private async handleServerStop(res: ServerResponse): Promise<void> {
    await this.processManager.stop()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: true }))
  }

  private handleGetLogs(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(this.logBuffer.getAll()))
  }

  private handleClearLogs(res: ServerResponse): void {
    this.logBuffer.clear()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: true }))
  }

  private async handleAddLog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readJsonBody<{ message: string; severity: LogSeverity }>(req)

    if (!body?.message || !body?.severity) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing message or severity' }))
      return
    }

    const entry = this.logBuffer.add(body.message, body.severity, 'dashboard')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(entry))
  }

  private handleLogStream(res: ServerResponse): void {
    // Server-Sent Events for real-time log streaming
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    this.sseClients.add(res)

    // Send initial data
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    // Handle client disconnect
    res.on('close', () => {
      this.sseClients.delete(res)
    })
  }

  private broadcastLogEntry(entry: LogEntry): void {
    const data = `data: ${JSON.stringify({ type: 'log', entry })}\n\n`
    for (const client of this.sseClients) {
      client.write(data)
    }
  }

  private handleBuildInfo(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(this.buildInfo))
  }

  private readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const contentLength = req.headers['content-length']
      if (!contentLength || contentLength === '0') {
        resolve(null)
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString())
          resolve(body)
        } catch {
          resolve(null)
        }
      })
      req.on('error', reject)
    })
  }
}

export function getBuildInfo(version: string): BuildInfo {
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    // Git not available or not a repo
  }
  const buildTime = new Date().toISOString()
  const buildDate = buildTime.split('T')[0].replace(/-/g, '')
  const serial = `v${version}-${commit}-${buildDate}`

  return { version, commit, buildTime, serial }
}
