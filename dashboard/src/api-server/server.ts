import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { execSync } from 'child_process'
import * as os from 'os'
import type { ApiServerConfig, BuildInfo, LogEntry, LogSeverity } from './types'
import { ProcessManager } from './process-manager'
import { LogBuffer } from './log-buffer'
import { proxyToMidiServer } from './midi-proxy'
import { DiscoveryService } from './discovery'
import { RoutesStorage } from './routes-storage'
import { VirtualPortsStorage } from './virtual-ports-storage'
import { RoutingEngine } from './routing-engine'
import { createRoutingHandlers, type RoutingHandlers } from './routing-handlers'
import { UpdateHandlers } from './update-handlers'
import { getLocalClient } from './local-client'

export class ApiServer {
  private server: Server | null = null
  private logBuffer: LogBuffer
  private processManager: ProcessManager
  private config: ApiServerConfig
  private buildInfo: BuildInfo
  private sseClients: Set<ServerResponse> = new Set()

  // Routing services
  private discovery: DiscoveryService | null = null
  private routesStorage: RoutesStorage | null = null
  private virtualPortsStorage: VirtualPortsStorage | null = null
  private routingEngine: RoutingEngine | null = null
  private routingHandlers: RoutingHandlers | null = null
  private updateHandlers: UpdateHandlers

  constructor(config: ApiServerConfig, buildInfo: BuildInfo) {
    this.config = config
    this.buildInfo = buildInfo
    this.logBuffer = new LogBuffer()
    this.processManager = new ProcessManager(config.midiServerBinaryPath, this.logBuffer)
    this.updateHandlers = new UpdateHandlers(config.updateService)

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
        const localUrl = this.getLocalServerUrl()
        console.log(`API server listening on ${localUrl}`)

        // Initialize routing services
        this.initializeRoutingServices(localUrl)

        resolve()
      })
    })
  }

  private getLocalServerUrl(port?: number): string {
    const actualPort = port ?? this.config.apiPort
    // Get the first non-internal IPv4 address for the API URL
    const interfaces = os.networkInterfaces()
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          return `http://${info.address}:${actualPort}`
        }
      }
    }
    return `http://localhost:${actualPort}`
  }

  /**
   * Initialize routing services when running as Vite middleware.
   * Called by vite-plugin after the HTTP server starts listening.
   */
  initializeRoutingServicesForMiddleware(actualPort: number): void {
    const localUrl = this.getLocalServerUrl(actualPort)
    this.initializeRoutingServices(localUrl)
  }

  private initializeRoutingServices(localUrl: string): void {
    this.routesStorage = new RoutesStorage()
    this.virtualPortsStorage = new VirtualPortsStorage()
    this.discovery = new DiscoveryService(localUrl, this.config.midiServerPort)
    this.routingEngine = new RoutingEngine(this.routesStorage, this.config.midiServerPort, this.logBuffer)

    this.routingHandlers = createRoutingHandlers({
      discovery: this.discovery,
      routes: this.routesStorage,
      virtualPorts: this.virtualPortsStorage,
      routingEngine: this.routingEngine,
      localServerUrl: localUrl,
      localMidiServerPort: this.config.midiServerPort
    })

    // Recreate persisted virtual ports in C++ binary
    this.recreateVirtualPorts()

    // Start services
    this.discovery.start()
    this.routingEngine.start()

    console.log('[ApiServer] Routing services initialized')
  }

  private async recreateVirtualPorts(): Promise<void> {
    if (!this.virtualPortsStorage) return

    const ports = this.virtualPortsStorage.getAll()
    if (ports.length === 0) return

    console.log(`[ApiServer] Recreating ${ports.length} virtual ports...`)

    const client = getLocalClient(this.config.midiServerPort)
    for (const port of ports) {
      try {
        await client.createVirtualPort(port.id, port.name, port.type)
        console.log(`[ApiServer] Recreated virtual port: ${port.name}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[ApiServer] Failed to recreate virtual port ${port.name}: ${message}`)
        // Continue on error - don't fail startup
      }
    }
  }

  async stop(): Promise<void> {
    this.updateHandlers.dispose()

    // Stop routing services
    if (this.routingEngine) {
      this.routingEngine.stop()
    }
    if (this.discovery) {
      this.discovery.stop()
    }

    // Stop MIDI server
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const reqUrl = req.url || '/'
    const path = reqUrl.split('?')[0]

    try {
      // Core API routes
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

      if (path === '/api/config') {
        return this.handleConfig(res)
      }

      if (path === '/api/update/status' && req.method === 'GET') {
        return this.updateHandlers.handleStatus(res)
      }
      if (path === '/api/update/check' && req.method === 'POST') {
        return await this.updateHandlers.handleCheck(res)
      }
      if (path === '/api/update/download' && req.method === 'POST') {
        return await this.updateHandlers.handleDownload(res)
      }
      if (path === '/api/update/install' && req.method === 'POST') {
        return await this.updateHandlers.handleInstall(res)
      }
      if (path === '/api/update/settings' && req.method === 'GET') {
        return this.updateHandlers.handleGetSettings(res)
      }
      if (path === '/api/update/settings' && req.method === 'PUT') {
        return await this.updateHandlers.handlePutSettings(req, res)
      }
      if (path === '/api/update/stream' && req.method === 'GET') {
        return this.updateHandlers.handleStream(res)
      }

      // Discovery routes
      if (this.routingHandlers) {
        if (path === '/api/local/ports' && req.method === 'GET') {
          return await this.routingHandlers.handleLocalPorts(res)
        }
        if (path === '/api/discovery/servers' && req.method === 'GET') {
          return this.routingHandlers.handleDiscoveryServers(res)
        }
        if (path === '/api/discovery/status' && req.method === 'GET') {
          return this.routingHandlers.handleDiscoveryStatus(res)
        }
        if (path === '/api/discovery/name' && req.method === 'POST') {
          return await this.routingHandlers.handleDiscoverySetName(req, res)
        }

        // Route management routes
        if (path === '/api/routes' && req.method === 'GET') {
          return this.routingHandlers.handleGetRoutes(res)
        }
        if (path === '/api/routes' && req.method === 'POST') {
          return await this.routingHandlers.handleCreateRoute(req, res)
        }

        // Route CRUD with ID
        const routeMatch = path.match(/^\/api\/routes\/([^/]+)$/)
        if (routeMatch) {
          const routeId = routeMatch[1]
          if (req.method === 'PUT') {
            return await this.routingHandlers.handleUpdateRoute(req, res, routeId)
          }
          if (req.method === 'DELETE') {
            return this.routingHandlers.handleDeleteRoute(res, routeId)
          }
        }

        // Virtual port management routes
        if (path === '/api/virtual-ports' && req.method === 'GET') {
          return await this.routingHandlers.handleGetVirtualPorts(res)
        }
        if (path === '/api/virtual-ports' && req.method === 'POST') {
          return await this.routingHandlers.handleCreateVirtualPort(req, res)
        }

        // Virtual port CRUD with ID
        const virtualPortMatch = path.match(/^\/api\/virtual-ports\/([^/]+)$/)
        if (virtualPortMatch) {
          const portId = virtualPortMatch[1]
          if (req.method === 'DELETE') {
            return await this.routingHandlers.handleDeleteVirtualPort(res, portId)
          }
        }

        // Remote server proxy routes
        const serverPortsMatch = path.match(/^\/api\/servers\/([^/]+)\/ports$/)
        if (serverPortsMatch && req.method === 'GET') {
          return await this.routingHandlers.handleRemoteServerPorts(res, serverPortsMatch[1])
        }

        const serverHealthMatch = path.match(/^\/api\/servers\/([^/]+)\/health$/)
        if (serverHealthMatch && req.method === 'GET') {
          return await this.routingHandlers.handleRemoteServerHealth(res, serverHealthMatch[1])
        }

        const serverSendMatch = path.match(/^\/api\/servers\/([^/]+)\/port\/([^/]+)\/send$/)
        if (serverSendMatch && req.method === 'POST') {
          return await this.routingHandlers.handleRemoteServerSend(
            req,
            res,
            serverSendMatch[1],
            serverSendMatch[2]
          )
        }

        const serverStatusMatch = path.match(/^\/api\/servers\/([^/]+)\/status$/)
        if (serverStatusMatch && req.method === 'GET') {
          return await this.routingHandlers.handleRemoteServerStatus(res, serverStatusMatch[1])
        }

        const serverStartMatch = path.match(/^\/api\/servers\/([^/]+)\/start$/)
        if (serverStartMatch && req.method === 'POST') {
          return await this.routingHandlers.handleRemoteServerStart(res, serverStartMatch[1])
        }

        const serverStopMatch = path.match(/^\/api\/servers\/([^/]+)\/stop$/)
        if (serverStopMatch && req.method === 'POST') {
          return await this.routingHandlers.handleRemoteServerStop(res, serverStopMatch[1])
        }
      }

      // Proxy to MIDI server (strip /midi prefix)
      if (path.startsWith('/midi')) {
        const status = this.processManager.getStatus()
        if (!status.running || !status.port) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'MIDI server not running' }))
          return
        }

        const midiPath = path.slice(5) || '/'
        return await proxyToMidiServer(
          req,
          res,
          { targetHost: 'localhost', targetPort: status.port },
          midiPath
        )
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
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    this.sseClients.add(res)
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

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

  private handleConfig(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        midiServerPort: this.config.midiServerPort
      })
    )
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
