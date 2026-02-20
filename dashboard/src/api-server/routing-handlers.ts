import type { IncomingMessage, ServerResponse } from 'http'
import type { DiscoveryService } from './discovery'
import type { VirtualPortsStorage } from './virtual-ports-storage'
import { getMidiClient } from './client-factory'
import { getLocalClient } from './local-client'

interface RoutingServices {
  discovery: DiscoveryService
  virtualPorts: VirtualPortsStorage
  localServerUrl: string
  localMidiServerPort: number
}

export function createRoutingHandlers(services: RoutingServices) {
  const { discovery, virtualPorts, localServerUrl, localMidiServerPort } = services

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

  // Route endpoints - proxy to C++ native routing
  async function handleGetRoutes(res: ServerResponse): Promise<void> {
    try {
      const client = getLocalClient(localMidiServerPort)
      const result = await client.getRoutes()
      sendJson(res, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to get routes: ${message}`, 502)
    }
  }

  async function handleCreateRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      enabled?: boolean
      source: {
        serverUrl: string
        portId: string
        portName: string
      }
      destination: {
        serverUrl: string
        portId: string
        portName: string
      }
    }>(req)

    if (!body?.source?.portId || !body?.destination?.portId) {
      sendError(res, 'Missing source.portId or destination.portId')
      return
    }

    try {
      const client = getLocalClient(localMidiServerPort)
      const result = await client.createRoute({
        enabled: body.enabled ?? true,
        source: body.source,
        destination: body.destination
      })
      sendJson(res, result, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to create route: ${message}`, 502)
    }
  }

  async function handleUpdateRoute(
    req: IncomingMessage,
    res: ServerResponse,
    routeId: string
  ): Promise<void> {
    const body = await readJsonBody<{ enabled?: boolean }>(req)
    if (body?.enabled === undefined) {
      sendError(res, 'Missing enabled field')
      return
    }

    try {
      const client = getLocalClient(localMidiServerPort)
      const result = await client.updateRoute(routeId, body.enabled)
      sendJson(res, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('not found')) {
        sendError(res, 'Route not found', 404)
      } else {
        sendError(res, `Failed to update route: ${message}`, 502)
      }
    }
  }

  async function handleDeleteRoute(res: ServerResponse, routeId: string): Promise<void> {
    try {
      const client = getLocalClient(localMidiServerPort)
      const result = await client.deleteRoute(routeId)
      sendJson(res, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('not found')) {
        sendError(res, 'Route not found', 404)
      } else {
        sendError(res, `Failed to delete route: ${message}`, 502)
      }
    }
  }

  // Remote server proxy endpoints
  async function handleLocalPorts(res: ServerResponse): Promise<void> {
    try {
      const client = getMidiClient('local', localMidiServerPort)
      const ports = await client.getPorts()
      sendJson(res, ports)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to fetch local ports: ${message}`, 502)
    }
  }

  async function handleRemoteServerPorts(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const client = getMidiClient(serverUrl, localMidiServerPort)
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
      const client = getMidiClient(serverUrl, localMidiServerPort)
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

      const client = getMidiClient(serverUrl, localMidiServerPort)
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

  // Virtual port endpoints
  async function handleGetVirtualPorts(res: ServerResponse): Promise<void> {
    try {
      // Get stored virtual ports config
      const storedPorts = virtualPorts.getAll()

      // Also get live data from C++ binary to verify ports exist
      const client = getLocalClient(localMidiServerPort)
      let livePorts: { inputs: string[]; outputs: string[] } = { inputs: [], outputs: [] }
      try {
        livePorts = await client.getVirtualPorts()
      } catch {
        // C++ binary may not be running, just return stored ports
      }

      sendJson(res, {
        virtualPorts: storedPorts,
        liveInputs: livePorts.inputs,
        liveOutputs: livePorts.outputs
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to get virtual ports: ${message}`, 500)
    }
  }

  async function handleCreateVirtualPort(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      name: string
      type: 'input' | 'output'
      isAutoCreated?: boolean
      associatedRouteId?: string
    }>(req)

    if (!body?.name || !body?.type) {
      sendError(res, 'Missing name or type field')
      return
    }

    if (body.type !== 'input' && body.type !== 'output') {
      sendError(res, 'Type must be "input" or "output"')
      return
    }

    try {
      // Save to storage first
      const port = virtualPorts.create({
        name: body.name,
        type: body.type,
        isAutoCreated: body.isAutoCreated ?? false,
        associatedRouteId: body.associatedRouteId
      })

      // Create in C++ binary
      const client = getLocalClient(localMidiServerPort)
      await client.createVirtualPort(port.id, port.name, port.type)

      sendJson(res, { virtualPort: port }, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to create virtual port: ${message}`, 500)
    }
  }

  async function handleDeleteVirtualPort(res: ServerResponse, portId: string): Promise<void> {
    try {
      // Delete from C++ binary first
      const client = getLocalClient(localMidiServerPort)
      try {
        await client.deleteVirtualPort(portId)
      } catch {
        // Port may not exist in binary, continue with storage deletion
      }

      // Delete from storage
      const deleted = virtualPorts.delete(portId)
      if (!deleted) {
        sendError(res, 'Virtual port not found', 404)
        return
      }

      sendJson(res, { success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to delete virtual port: ${message}`, 500)
    }
  }

  return {
    handleDiscoveryServers,
    handleDiscoveryStatus,
    handleDiscoverySetName,
    handleLocalPorts,
    handleGetRoutes,
    handleCreateRoute,
    handleUpdateRoute,
    handleDeleteRoute,
    handleRemoteServerPorts,
    handleRemoteServerHealth,
    handleRemoteServerSend,
    handleRemoteServerStatus,
    handleRemoteServerStart,
    handleRemoteServerStop,
    handleGetVirtualPorts,
    handleCreateVirtualPort,
    handleDeleteVirtualPort
  }
}

export type RoutingHandlers = ReturnType<typeof createRoutingHandlers>
