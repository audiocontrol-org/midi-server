import type { IncomingMessage, ServerResponse } from 'http'
import type { DiscoveryService } from './discovery'
import type { RoutesStorage, Route, RouteEndpoint } from './routes-storage'
import type { RoutingEngine } from './routing-engine'
import { getRemoteClient } from './remote-client'

interface RoutingServices {
  discovery: DiscoveryService
  routes: RoutesStorage
  routingEngine: RoutingEngine
  localServerUrl: string
}

export function createRoutingHandlers(services: RoutingServices) {
  const { discovery, routes, routingEngine, localServerUrl } = services

  function sendJson(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }

  function sendError(res: ServerResponse, message: string, status = 400): void {
    sendJson(res, { error: message }, status)
  }

  async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
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

  // Discovery endpoints
  function handleDiscoveryServers(res: ServerResponse): void {
    const servers = discovery.getServers()
    sendJson(res, { servers })
  }

  function handleDiscoveryStatus(res: ServerResponse): void {
    sendJson(res, {
      serverName: discovery.getServerName(),
      localUrl: localServerUrl,
      discoveredCount: discovery.getServers().filter((s) => !s.isLocal).length
    })
  }

  async function handleDiscoverySetName(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{ name: string }>(req)
    if (!body?.name) {
      sendError(res, 'Missing name field')
      return
    }
    discovery.setServerName(body.name)
    sendJson(res, { success: true, serverName: body.name })
  }

  // Route endpoints
  function handleGetRoutes(res: ServerResponse): void {
    const allRoutes = routes.getAll()
    const statuses = routingEngine.getRouteStatuses()
    const statusMap = new Map(statuses.map((s) => [s.routeId, s]))

    const routesWithStatus = allRoutes.map((route) => ({
      ...route,
      status: statusMap.get(route.id) ?? {
        routeId: route.id,
        status: route.enabled ? 'active' : 'disabled',
        messagesRouted: 0,
        lastMessageTime: null
      }
    }))

    sendJson(res, { routes: routesWithStatus })
  }

  async function handleCreateRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      enabled: boolean
      source: RouteEndpoint
      destination: RouteEndpoint
    }>(req)

    if (!body?.source || !body?.destination) {
      sendError(res, 'Missing source or destination')
      return
    }

    const route = routes.create({
      enabled: body.enabled ?? true,
      source: body.source,
      destination: body.destination
    })

    routingEngine.onRoutesChanged()
    sendJson(res, { route }, 201)
  }

  async function handleUpdateRoute(
    req: IncomingMessage,
    res: ServerResponse,
    routeId: string
  ): Promise<void> {
    const body = await readJsonBody<Partial<Omit<Route, 'id'>>>(req)
    if (!body) {
      sendError(res, 'Invalid request body')
      return
    }

    const updated = routes.update(routeId, body)
    if (!updated) {
      sendError(res, 'Route not found', 404)
      return
    }

    routingEngine.onRoutesChanged()
    sendJson(res, { route: updated })
  }

  function handleDeleteRoute(res: ServerResponse, routeId: string): void {
    const deleted = routes.delete(routeId)
    if (!deleted) {
      sendError(res, 'Route not found', 404)
      return
    }

    routingEngine.onRoutesChanged()
    sendJson(res, { success: true })
  }

  // Remote server proxy endpoints
  async function handleRemoteServerPorts(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const client = getRemoteClient(serverUrl)
      const ports = await client.getPorts()
      sendJson(res, ports)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to fetch ports: ${message}`, 502)
    }
  }

  async function handleRemoteServerHealth(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const client = getRemoteClient(serverUrl)
      const health = await client.health()
      sendJson(res, health)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Health check failed: ${message}`, 502)
    }
  }

  async function handleRemoteServerSend(
    req: IncomingMessage,
    res: ServerResponse,
    encodedUrl: string,
    portId: string
  ): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const body = await readJsonBody<{ message: number[] }>(req)

      if (!body?.message || !Array.isArray(body.message)) {
        sendError(res, 'Missing or invalid message field')
        return
      }

      const client = getRemoteClient(serverUrl)
      const result = await client.sendMessage(portId, body.message)
      sendJson(res, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to send message: ${message}`, 502)
    }
  }

  async function handleRemoteServerStatus(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const response = await fetch(`${serverUrl}/api/status`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const status = await response.json()
      sendJson(res, status)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to get server status: ${message}`, 502)
    }
  }

  async function handleRemoteServerStart(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const response = await fetch(`${serverUrl}/api/server/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) {
        const body = await response.text()
        let errorMsg = `HTTP ${response.status}`
        try {
          const json = JSON.parse(body)
          if (json.error) errorMsg = json.error
        } catch {
          // Use default
        }
        throw new Error(errorMsg)
      }
      const status = await response.json()
      sendJson(res, status)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to start server: ${message}`, 502)
    }
  }

  async function handleRemoteServerStop(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const response = await fetch(`${serverUrl}/api/server/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result = await response.json()
      sendJson(res, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to stop server: ${message}`, 502)
    }
  }

  return {
    handleDiscoveryServers,
    handleDiscoveryStatus,
    handleDiscoverySetName,
    handleGetRoutes,
    handleCreateRoute,
    handleUpdateRoute,
    handleDeleteRoute,
    handleRemoteServerPorts,
    handleRemoteServerHealth,
    handleRemoteServerSend,
    handleRemoteServerStatus,
    handleRemoteServerStart,
    handleRemoteServerStop
  }
}

export type RoutingHandlers = ReturnType<typeof createRoutingHandlers>
