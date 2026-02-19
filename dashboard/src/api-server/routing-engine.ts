import { EventEmitter } from 'events'
import type { Route } from './routes-storage'
import { RoutesStorage } from './routes-storage'
import { getMidiClient } from './client-factory'

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
  private midiServerPort: number
  private pollTimer: NodeJS.Timeout | null = null
  private running = false
  private routeStatuses: Map<string, RouteStatus> = new Map()
  private openPorts: Map<string, OpenPortState> = new Map()
  private lastErrorLog: Map<string, number> | null = null
  private syncInProgress = false
  private syncPending = false

  constructor(storage: RoutesStorage, midiServerPort: number) {
    super()
    this.storage = storage
    this.midiServerPort = midiServerPort
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
    console.log('[RoutingEngine] start() triggering sync')
    this.syncInProgress = true
    this.syncPending = false
    this.doSyncRoutePorts()

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
    console.log(`[RoutingEngine] onRoutesChanged() called, syncInProgress=${this.syncInProgress}`)
    // Prevent concurrent syncs - queue if one is in progress
    if (this.syncInProgress) {
      console.log('[RoutingEngine] sync in progress, queueing')
      this.syncPending = true
      return
    }
    // Set flag BEFORE calling async function to prevent race
    console.log('[RoutingEngine] onRoutesChanged() triggering sync')
    this.syncInProgress = true
    this.syncPending = false
    this.doSyncRoutePorts()
  }

  private async doSyncRoutePorts(): Promise<void> {
    try {
      await this.syncRoutePorts()
    } finally {
      this.syncInProgress = false
      // If another sync was requested while we were running, do it now
      if (this.syncPending) {
        this.syncInProgress = true
        this.syncPending = false
        this.doSyncRoutePorts()
      }
    }
  }

  private syncId = 0

  private async syncRoutePorts(): Promise<void> {
    const syncId = ++this.syncId
    console.log(`[RoutingEngine] syncRoutePorts #${syncId} starting`)
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
      console.log(`[RoutingEngine] Opening port ${name} (${type}) on ${serverUrl}`)
      const client = getMidiClient(serverUrl, this.midiServerPort)
      const result = await client.openPort(portId, name, type)
      console.log(`[RoutingEngine] Port ${portId} opened: ${JSON.stringify(result)}`)
    } catch (err) {
      console.error(`[RoutingEngine] Failed to open port ${portId} on ${serverUrl}:`, err)
    }
  }

  private async closePort(serverUrl: string, portId: string): Promise<void> {
    try {
      const client = getMidiClient(serverUrl, this.midiServerPort)
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

  private pollCount = 0

  private async pollRoutes(): Promise<void> {
    const enabledRoutes = this.storage.getEnabled()

    // Log every 100 polls (~5 seconds) to show we're running
    this.pollCount++
    if (this.pollCount % 100 === 0) {
      console.log(`[RoutingEngine] Poll cycle ${this.pollCount}, ${enabledRoutes.length} enabled routes`)
    }

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
      const client = getMidiClient(serverUrl, this.midiServerPort)
      const response = await client.getMessages(portId)

      if (response.messages.length === 0) return

      console.log(`[RoutingEngine] Got ${response.messages.length} messages from ${serverUrl} port ${portId}`)

      // Forward each message to all destinations
      for (const message of response.messages) {
        for (const route of routes) {
          await this.forwardMessage(route, message)
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const errorKey = `${serverUrl}:${portId}`
      const now = Date.now()

      // If port not found or bad gateway, try to re-open it (rate-limited to once per 5 seconds)
      if (errorMsg.includes('Port not found') || errorMsg.includes('Bad Gateway')) {
        const retryKey = `retry:${errorKey}`
        const lastRetry = this.lastErrorLog?.get(retryKey) ?? 0
        if (now - lastRetry > 5000) {
          const portState = this.openPorts.get(errorKey)
          if (portState) {
            const route = routes[0]
            const portInfo = route.source.portId === portId ? route.source : route.destination
            console.log(`[RoutingEngine] Retrying port open: ${portInfo.portName} (${portState.type}) on ${serverUrl}`)
            await this.openPort(serverUrl, portId, portInfo.portName, portState.type)
            if (!this.lastErrorLog) this.lastErrorLog = new Map()
            this.lastErrorLog.set(retryKey, now)
          }
        }
      }

      // Update status for affected routes (log only once per minute to avoid spam)
      if (!this.lastErrorLog || !this.lastErrorLog.has(errorKey) || now - this.lastErrorLog.get(errorKey)! > 60000) {
        console.error(`[RoutingEngine] Poll error for ${serverUrl} port ${portId}:`, errorMsg)
        if (!this.lastErrorLog) this.lastErrorLog = new Map()
        this.lastErrorLog.set(errorKey, now)
      }
      for (const route of routes) {
        const status = this.routeStatuses.get(route.id)
        if (status) {
          status.status = 'error'
          status.error = errorMsg
          this.emit('route-status-changed', status)
        }
      }
    }
  }

  private async forwardMessage(route: Route, message: number[]): Promise<void> {
    try {
      const client = getMidiClient(route.destination.serverUrl, this.midiServerPort)
      await client.sendMessage(route.destination.portId, message)

      console.log(`[RoutingEngine] Forwarded message to ${route.destination.serverUrl} port ${route.destination.portId}: [${message.slice(0, 3).join(', ')}${message.length > 3 ? '...' : ''}]`)

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
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[RoutingEngine] Forward failed to ${route.destination.serverUrl} port ${route.destination.portId}: ${errorMsg}`)

      // If port not found or bad gateway, try to re-open it (rate-limited to once per 5 seconds)
      if (errorMsg.includes('Port not found') || errorMsg.includes('Bad Gateway')) {
        const destKey = `${route.destination.serverUrl}:${route.destination.portId}`
        const retryKey = `retry:${destKey}`
        const now = Date.now()
        const lastRetry = this.lastErrorLog?.get(retryKey) ?? 0
        if (now - lastRetry > 5000) {
          const portState = this.openPorts.get(destKey)
          if (portState) {
            console.log(`[RoutingEngine] Retrying destination port open: ${route.destination.portName} on ${route.destination.serverUrl}`)
            await this.openPort(route.destination.serverUrl, route.destination.portId, route.destination.portName, 'output')
            if (!this.lastErrorLog) this.lastErrorLog = new Map()
            this.lastErrorLog.set(retryKey, now)
          }
        }
      }

      const status = this.routeStatuses.get(route.id)
      if (status) {
        status.status = 'error'
        status.error = errorMsg
        this.emit('route-status-changed', status)
      }
    }
  }
}
