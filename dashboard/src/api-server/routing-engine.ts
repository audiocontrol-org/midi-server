import { EventEmitter } from 'events'
import type { Route } from './routes-storage'
import { RoutesStorage } from './routes-storage'
import { getRemoteClient } from './remote-client'

const POLL_INTERVAL = 50 // Poll input ports every 50ms for low latency

export interface RouteStatus {
  routeId: string
  status: 'active' | 'error' | 'disabled'
  error?: string
  messagesRouted: number
  lastMessageTime: number | null
}

interface RoutingEvents {
  'route-status-changed': [status: RouteStatus]
  'message-routed': [routeId: string, message: number[]]
}

interface OpenPortState {
  portId: string
  serverUrl: string
  type: 'input' | 'output'
  refCount: number
}

export class RoutingEngine extends EventEmitter<RoutingEvents> {
  private storage: RoutesStorage
  private pollTimer: NodeJS.Timeout | null = null
  private running = false
  private routeStatuses: Map<string, RouteStatus> = new Map()
  private openPorts: Map<string, OpenPortState> = new Map()

  constructor(storage: RoutesStorage, _localServerUrl: string) {
    super()
    this.storage = storage
  }

  start(): void {
    if (this.running) return
    this.running = true

    // Initialize route statuses
    for (const route of this.storage.getAll()) {
      this.routeStatuses.set(route.id, {
        routeId: route.id,
        status: route.enabled ? 'active' : 'disabled',
        messagesRouted: 0,
        lastMessageTime: null
      })
    }

    // Open ports for enabled routes
    this.syncRoutePorts()

    // Start polling for messages
    this.pollTimer = setInterval(() => this.pollRoutes(), POLL_INTERVAL)

    console.log('[RoutingEngine] Started')
  }

  stop(): void {
    if (!this.running) return
    this.running = false

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    // Close all opened ports
    this.closeAllPorts()

    console.log('[RoutingEngine] Stopped')
  }

  getRouteStatuses(): RouteStatus[] {
    return Array.from(this.routeStatuses.values())
  }

  getRouteStatus(routeId: string): RouteStatus | undefined {
    return this.routeStatuses.get(routeId)
  }

  // Called when routes are added/updated/deleted
  onRoutesChanged(): void {
    this.syncRoutePorts()
  }

  private async syncRoutePorts(): Promise<void> {
    const enabledRoutes = this.storage.getEnabled()
    const neededPorts = new Map<string, { portId: string; serverUrl: string; type: 'input' | 'output'; name: string }>()

    // Collect all needed ports
    for (const route of enabledRoutes) {
      const sourceKey = `${route.source.serverUrl}:${route.source.portId}`
      const destKey = `${route.destination.serverUrl}:${route.destination.portId}`

      neededPorts.set(sourceKey, {
        portId: route.source.portId,
        serverUrl: route.source.serverUrl,
        type: 'input',
        name: route.source.portName
      })

      neededPorts.set(destKey, {
        portId: route.destination.portId,
        serverUrl: route.destination.serverUrl,
        type: 'output',
        name: route.destination.portName
      })

      // Update or create route status
      if (!this.routeStatuses.has(route.id)) {
        this.routeStatuses.set(route.id, {
          routeId: route.id,
          status: 'active',
          messagesRouted: 0,
          lastMessageTime: null
        })
      }
    }

    // Close ports that are no longer needed
    const closePromises: Promise<void>[] = []
    for (const [key, state] of this.openPorts) {
      if (!neededPorts.has(key)) {
        closePromises.push(this.closePort(state.serverUrl, state.portId))
        this.openPorts.delete(key)
      }
    }
    await Promise.all(closePromises)

    // Open ports that are needed
    const openPromises: Promise<void>[] = []
    for (const [key, port] of neededPorts) {
      if (!this.openPorts.has(key)) {
        console.log(`[RoutingEngine] Opening port ${port.name} (${port.type}) on ${port.serverUrl}`)
        openPromises.push(this.openPort(port.serverUrl, port.portId, port.name, port.type))
        this.openPorts.set(key, {
          portId: port.portId,
          serverUrl: port.serverUrl,
          type: port.type,
          refCount: 1
        })
      }
    }
    await Promise.all(openPromises)

    // Update statuses for disabled routes
    for (const route of this.storage.getAll()) {
      if (!route.enabled) {
        const status = this.routeStatuses.get(route.id)
        if (status && status.status !== 'disabled') {
          status.status = 'disabled'
          this.emit('route-status-changed', status)
        }
      }
    }

    // Remove statuses for deleted routes
    for (const [routeId] of this.routeStatuses) {
      if (!this.storage.get(routeId)) {
        this.routeStatuses.delete(routeId)
      }
    }
  }

  private async openPort(serverUrl: string, portId: string, name: string, type: 'input' | 'output'): Promise<void> {
    try {
      const client = getRemoteClient(serverUrl)
      await client.openPort(portId, name, type)
    } catch (err) {
      console.error(`[RoutingEngine] Failed to open port ${portId} on ${serverUrl}:`, err)
    }
  }

  private async closePort(serverUrl: string, portId: string): Promise<void> {
    try {
      const client = getRemoteClient(serverUrl)
      await client.closePort(portId)
    } catch (err) {
      console.error(`[RoutingEngine] Failed to close port ${portId} on ${serverUrl}:`, err)
    }
  }

  private closeAllPorts(): void {
    for (const [, state] of this.openPorts) {
      this.closePort(state.serverUrl, state.portId).catch(() => {
        // Ignore errors during shutdown
      })
    }
    this.openPorts.clear()
  }

  private async pollRoutes(): Promise<void> {
    const enabledRoutes = this.storage.getEnabled()

    // Group routes by source to avoid polling same source multiple times
    const routesBySource = new Map<string, Route[]>()
    for (const route of enabledRoutes) {
      const key = `${route.source.serverUrl}:${route.source.portId}`
      const routes = routesBySource.get(key) ?? []
      routes.push(route)
      routesBySource.set(key, routes)
    }

    // Poll each source and forward messages
    for (const [, routes] of routesBySource) {
      const source = routes[0].source
      await this.pollSourceAndForward(source.serverUrl, source.portId, routes)
    }
  }

  private async pollSourceAndForward(serverUrl: string, portId: string, routes: Route[]): Promise<void> {
    try {
      const client = getRemoteClient(serverUrl)
      const response = await client.getMessages(portId)

      if (response.messages.length === 0) return

      // Forward each message to all destinations
      for (const message of response.messages) {
        for (const route of routes) {
          await this.forwardMessage(route, message)
        }
      }
    } catch (err) {
      // Update status for affected routes
      for (const route of routes) {
        const status = this.routeStatuses.get(route.id)
        if (status) {
          status.status = 'error'
          status.error = err instanceof Error ? err.message : String(err)
          this.emit('route-status-changed', status)
        }
      }
    }
  }

  private async forwardMessage(route: Route, message: number[]): Promise<void> {
    try {
      const client = getRemoteClient(route.destination.serverUrl)
      await client.sendMessage(route.destination.portId, message)

      // Update status
      const status = this.routeStatuses.get(route.id)
      if (status) {
        status.status = 'active'
        status.error = undefined
        status.messagesRouted++
        status.lastMessageTime = Date.now()
        this.emit('route-status-changed', status)
      }

      this.emit('message-routed', route.id, message)
    } catch (err) {
      const status = this.routeStatuses.get(route.id)
      if (status) {
        status.status = 'error'
        status.error = err instanceof Error ? err.message : String(err)
        this.emit('route-status-changed', status)
      }
    }
  }
}
