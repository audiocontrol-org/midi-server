import type { IncomingMessage, ServerResponse } from 'http'
import type { DiscoveryService, DiscoveredServer } from './discovery'
import type { VirtualPortsStorage } from './virtual-ports-storage'
import type { MidiRoute } from './local-client'
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

  // Propagation helpers for cross-server route replication

  function getMidiUrlForPeer(server: DiscoveredServer): string {
    const url = new URL(server.apiUrl)
    return `http://${url.hostname}:${server.midiServerPort}`
  }

  function buildLocalMidiUrl(): string {
    const url = new URL(localServerUrl)
    return `http://${url.hostname}:${localMidiServerPort}`
  }

  function resolveLocalUrls(route: MidiRoute, originMidiUrl: string): MidiRoute {
    if (route.source.serverUrl === 'local' || route.source.serverUrl === '') {
      route.source.serverUrl = originMidiUrl
    }
    if (route.destination.serverUrl === 'local' || route.destination.serverUrl === '') {
      route.destination.serverUrl = originMidiUrl
    }
    return route
  }

  async function propagateRoute(
    route: { id: string; enabled?: boolean; source?: MidiRoute['source']; destination?: MidiRoute['destination'] },
    operation: 'create' | 'update' | 'delete',
    excludeMidiUrl?: string
  ): Promise<void> {
    const peers = discovery.getServers().filter((s) => !s.isLocal && s.midiServerPort > 0)
    const localMidiUrl = buildLocalMidiUrl()
    const normalizedRoute = resolveLocalUrls(
      JSON.parse(JSON.stringify(route)) as MidiRoute,
      localMidiUrl
    )

    for (const peer of peers) {
      const midiUrl = getMidiUrlForPeer(peer)
      if (midiUrl === excludeMidiUrl) continue
      if (operation === 'create') {
        fetch(`${midiUrl}/routes`, {
          method: 'POST',
          body: JSON.stringify({
            id: normalizedRoute.id,
            enabled: normalizedRoute.enabled,
            source: normalizedRoute.source,
            destination: normalizedRoute.destination
          }),
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => { /* best effort */ })
      } else if (operation === 'update') {
        fetch(`${midiUrl}/routes/${normalizedRoute.id}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: normalizedRoute.enabled }),
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => { /* best effort */ })
      } else if (operation === 'delete') {
        fetch(`${midiUrl}/routes/${normalizedRoute.id}`, {
          method: 'DELETE'
        }).catch(() => { /* best effort */ })
      }
    }
  }

  async function syncRoutesFromPeers(localMidiPort: number): Promise<void> {
    const peers = discovery.getServers().filter((s) => !s.isLocal && s.midiServerPort > 0)
    if (peers.length === 0) return

    let localRoutes: MidiRoute[] = []
    try {
      const localRes = await fetch(`http://localhost:${localMidiPort}/routes`)
      const data = (await localRes.json()) as { routes: MidiRoute[] }
      localRoutes = data.routes
    } catch {
      return // Can't reach local MIDI binary, skip sync
    }

    const localIds = new Set(localRoutes.map((r) => r.id))

    for (const peer of peers) {
      try {
        const midiUrl = getMidiUrlForPeer(peer)
        const peerRes = await fetch(`${midiUrl}/routes`)
        const data = (await peerRes.json()) as { routes: MidiRoute[] }

        for (const route of data.routes) {
          if (localIds.has(route.id)) continue

          const normalized = resolveLocalUrls(
            JSON.parse(JSON.stringify(route)) as MidiRoute,
            midiUrl
          )

          await fetch(`http://localhost:${localMidiPort}/routes`, {
            method: 'POST',
            body: JSON.stringify({
              id: normalized.id,
              enabled: normalized.enabled,
              source: normalized.source,
              destination: normalized.destination
            }),
            headers: { 'Content-Type': 'application/json' }
          })
          localIds.add(normalized.id)
        }
      } catch {
        /* best effort - continue with next peer */
      }
    }
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
      propagateRoute(result.route, 'create').catch(() => { /* best effort */ })
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
      propagateRoute({ id: routeId, enabled: body.enabled }, 'update').catch(() => { /* best effort */ })
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
      propagateRoute({ id: routeId }, 'delete').catch(() => { /* best effort */ })
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

  // Remote server route management - proxy to remote server's MIDI server
  async function handleRemoteServerGetRoutes(res: ServerResponse, encodedUrl: string): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      // Get MIDI server port from the remote API server
      const statusResponse = await fetch(`${serverUrl}/api/status`)
      if (!statusResponse.ok) {
        throw new Error(`Failed to get remote server status: HTTP ${statusResponse.status}`)
      }
      const status = await statusResponse.json()
      const midiServerPort = status.port
      if (!midiServerPort) {
        throw new Error('Remote MIDI server not running')
      }

      // Extract host from serverUrl and build MIDI server URL
      const url = new URL(serverUrl)
      const midiServerUrl = `http://${url.hostname}:${midiServerPort}`

      const routesResponse = await fetch(`${midiServerUrl}/routes`)
      if (!routesResponse.ok) {
        throw new Error(`HTTP ${routesResponse.status}`)
      }
      const routes = await routesResponse.json()
      sendJson(res, routes)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to get remote routes: ${message}`, 502)
    }
  }

  async function handleRemoteServerCreateRoute(
    req: IncomingMessage,
    res: ServerResponse,
    encodedUrl: string
  ): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const body = await readJsonBody<{
        enabled: boolean
        source: { serverUrl: string; portId: string; portName: string }
        destination: { serverUrl: string; portId: string; portName: string }
      }>(req)

      if (!body) {
        sendError(res, 'Missing request body')
        return
      }

      // Get MIDI server port from the remote API server
      const statusResponse = await fetch(`${serverUrl}/api/status`)
      if (!statusResponse.ok) {
        throw new Error(`Failed to get remote server status: HTTP ${statusResponse.status}`)
      }
      const status = await statusResponse.json()
      const midiServerPort = status.port
      if (!midiServerPort) {
        throw new Error('Remote MIDI server not running')
      }

      // Extract host from serverUrl and build MIDI server URL
      const url = new URL(serverUrl)
      const midiServerUrl = `http://${url.hostname}:${midiServerPort}`

      // Normalize "local" serverUrls before sending to the remote server:
      // - "local" source → local to the remote server (midiServerUrl)
      // - "local" destination → this dashboard's MIDI server (buildLocalMidiUrl)
      const localMidiUrl = buildLocalMidiUrl()
      const normalizedBody = {
        ...body,
        source: {
          ...body.source,
          serverUrl: body.source.serverUrl === 'local' || body.source.serverUrl === ''
            ? midiServerUrl : body.source.serverUrl
        },
        destination: {
          ...body.destination,
          serverUrl: body.destination.serverUrl === 'local' || body.destination.serverUrl === ''
            ? localMidiUrl : body.destination.serverUrl
        }
      }

      const routeResponse = await fetch(`${midiServerUrl}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedBody)
      })
      if (!routeResponse.ok) {
        const errorBody = await routeResponse.text()
        throw new Error(errorBody || `HTTP ${routeResponse.status}`)
      }
      const route = await routeResponse.json() as { route: MidiRoute }
      sendJson(res, route, 201)

      // Propagate to local C++ binary and other peers (fire-and-forget)
      ;(async () => {
        const createdRoute = route.route
        if (!createdRoute?.id) return

        const normalized = resolveLocalUrls(
          JSON.parse(JSON.stringify(createdRoute)) as MidiRoute,
          midiServerUrl
        )
        const payload = JSON.stringify({
          id: normalized.id,
          enabled: normalized.enabled,
          source: normalized.source,
          destination: normalized.destination
        })
        const headers = { 'Content-Type': 'application/json' }

        fetch(`http://localhost:${localMidiServerPort}/routes`, {
          method: 'POST', body: payload, headers
        }).catch(() => { /* best effort */ })

        const otherPeers = discovery.getServers().filter(
          (s) => !s.isLocal && s.midiServerPort > 0 && getMidiUrlForPeer(s) !== midiServerUrl
        )
        for (const peer of otherPeers) {
          fetch(`${getMidiUrlForPeer(peer)}/routes`, {
            method: 'POST', body: payload, headers
          }).catch(() => { /* best effort */ })
        }
      })().catch(() => { /* best effort */ })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to create remote route: ${message}`, 502)
    }
  }

  async function handleRemoteServerUpdateRoute(
    req: IncomingMessage,
    res: ServerResponse,
    encodedUrl: string,
    routeId: string
  ): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)
      const body = await readJsonBody<{ enabled?: boolean }>(req)

      // Get MIDI server port from the remote API server
      const statusResponse = await fetch(`${serverUrl}/api/status`)
      if (!statusResponse.ok) {
        throw new Error(`Failed to get remote server status: HTTP ${statusResponse.status}`)
      }
      const status = await statusResponse.json()
      const midiServerPort = status.port
      if (!midiServerPort) {
        throw new Error('Remote MIDI server not running')
      }

      // Extract host from serverUrl and build MIDI server URL
      const url = new URL(serverUrl)
      const midiServerUrl = `http://${url.hostname}:${midiServerPort}`

      const routeResponse = await fetch(`${midiServerUrl}/routes/${routeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!routeResponse.ok) {
        throw new Error(`HTTP ${routeResponse.status}`)
      }
      const result = await routeResponse.json()
      sendJson(res, result)

      // Propagate to local C++ binary and other peers (fire-and-forget)
      ;(async () => {
        const headers = { 'Content-Type': 'application/json' }
        const payload = JSON.stringify({ enabled: body?.enabled })

        fetch(`http://localhost:${localMidiServerPort}/routes/${routeId}`, {
          method: 'PUT', body: payload, headers
        }).catch(() => { /* best effort */ })

        const otherPeers = discovery.getServers().filter(
          (s) => !s.isLocal && s.midiServerPort > 0 && getMidiUrlForPeer(s) !== midiServerUrl
        )
        for (const peer of otherPeers) {
          fetch(`${getMidiUrlForPeer(peer)}/routes/${routeId}`, {
            method: 'PUT', body: payload, headers
          }).catch(() => { /* best effort */ })
        }
      })().catch(() => { /* best effort */ })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to update remote route: ${message}`, 502)
    }
  }

  async function handleRemoteServerDeleteRoute(
    res: ServerResponse,
    encodedUrl: string,
    routeId: string
  ): Promise<void> {
    try {
      const serverUrl = decodeURIComponent(encodedUrl)

      // Get MIDI server port from the remote API server
      const statusResponse = await fetch(`${serverUrl}/api/status`)
      if (!statusResponse.ok) {
        throw new Error(`Failed to get remote server status: HTTP ${statusResponse.status}`)
      }
      const status = await statusResponse.json()
      const midiServerPort = status.port
      if (!midiServerPort) {
        throw new Error('Remote MIDI server not running')
      }

      // Extract host from serverUrl and build MIDI server URL
      const url = new URL(serverUrl)
      const midiServerUrl = `http://${url.hostname}:${midiServerPort}`

      const routeResponse = await fetch(`${midiServerUrl}/routes/${routeId}`, {
        method: 'DELETE'
      })
      if (!routeResponse.ok) {
        throw new Error(`HTTP ${routeResponse.status}`)
      }
      const result = await routeResponse.json()
      sendJson(res, result)

      // Propagate to local C++ binary and other peers (fire-and-forget)
      ;(async () => {
        fetch(`http://localhost:${localMidiServerPort}/routes/${routeId}`, {
          method: 'DELETE'
        }).catch(() => { /* best effort */ })

        const otherPeers = discovery.getServers().filter(
          (s) => !s.isLocal && s.midiServerPort > 0 && getMidiUrlForPeer(s) !== midiServerUrl
        )
        for (const peer of otherPeers) {
          fetch(`${getMidiUrlForPeer(peer)}/routes/${routeId}`, {
            method: 'DELETE'
          }).catch(() => { /* best effort */ })
        }
      })().catch(() => { /* best effort */ })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, `Failed to delete remote route: ${message}`, 502)
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
    syncRoutesFromPeers,
    handleCreateVirtualPort,
    handleDeleteVirtualPort,
    handleRemoteServerGetRoutes,
    handleRemoteServerCreateRoute,
    handleRemoteServerUpdateRoute,
    handleRemoteServerDeleteRoute
  }
}

export type RoutingHandlers = ReturnType<typeof createRoutingHandlers>
