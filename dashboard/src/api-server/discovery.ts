import * as dgram from 'dgram'
import * as os from 'os'
import { EventEmitter } from 'events'

const DISCOVERY_PORT = 41234
const BROADCAST_INTERVAL = 5000
const SERVER_TTL = 15000

export interface ServerAnnouncement {
  type: 'midi-server-announce'
  version: 1
  serverName: string
  apiUrl: string
  midiServerPort: number
  timestamp: number
}

export interface DiscoveredServer {
  serverName: string
  apiUrl: string
  midiServerPort: number
  lastSeen: number
  isLocal: boolean
}

interface DiscoveryEvents {
  'server-added': [server: DiscoveredServer]
  'server-removed': [server: DiscoveredServer]
}

export class DiscoveryService extends EventEmitter<DiscoveryEvents> {
  private socket: dgram.Socket | null = null
  private broadcastTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private servers: Map<string, DiscoveredServer> = new Map()
  private serverName: string
  private apiUrl: string
  private midiServerPort: number
  private running = false

  constructor(apiUrl: string, midiServerPort: number, serverName?: string) {
    super()
    this.apiUrl = apiUrl
    this.midiServerPort = midiServerPort
    this.serverName = serverName ?? os.hostname()
  }

  start(): void {
    if (this.running) return
    this.running = true

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('error', (err) => {
        console.error('[Discovery] Socket error:', err.message)
      })

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo)
      })

      this.socket.on('listening', () => {
        const address = this.socket?.address()
        console.log(`[Discovery] Listening on ${address?.address}:${address?.port}`)
        this.socket?.setBroadcast(true)
        this.startBroadcasting()
      })

      this.socket.bind(DISCOVERY_PORT)

      // Start cleanup timer
      this.cleanupTimer = setInterval(() => this.cleanupStaleServers(), SERVER_TTL / 2)
    } catch (err) {
      console.error('[Discovery] Failed to start:', err)
      this.running = false
    }
  }

  stop(): void {
    if (!this.running) return
    this.running = false

    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer)
      this.broadcastTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.servers.clear()
  }

  getServers(): DiscoveredServer[] {
    return Array.from(this.servers.values())
  }

  setServerName(name: string): void {
    this.serverName = name
  }

  getServerName(): string {
    return this.serverName
  }

  private startBroadcasting(): void {
    // Broadcast immediately
    this.broadcast()

    // Then broadcast every interval
    this.broadcastTimer = setInterval(() => {
      this.broadcast()
    }, BROADCAST_INTERVAL)
  }

  private broadcast(): void {
    if (!this.socket) return

    const announcement: ServerAnnouncement = {
      type: 'midi-server-announce',
      version: 1,
      serverName: this.serverName,
      apiUrl: this.apiUrl,
      midiServerPort: this.midiServerPort,
      timestamp: Date.now()
    }

    const message = Buffer.from(JSON.stringify(announcement))

    // Get broadcast addresses for all network interfaces
    const broadcastAddresses = this.getBroadcastAddresses()

    for (const address of broadcastAddresses) {
      this.socket.send(message, DISCOVERY_PORT, address, (err) => {
        if (err) {
          console.error(`[Discovery] Failed to broadcast to ${address}:`, err.message)
        }
      })
    }
  }

  private getBroadcastAddresses(): string[] {
    const addresses: string[] = ['255.255.255.255']
    const interfaces = os.networkInterfaces()

    for (const iface of Object.values(interfaces)) {
      if (!iface) continue
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          // Calculate broadcast address from IP and netmask
          const ipParts = info.address.split('.').map(Number)
          const maskParts = info.netmask.split('.').map(Number)
          const broadcastParts = ipParts.map((ip, i) => ip | (~maskParts[i] & 255))
          addresses.push(broadcastParts.join('.'))
        }
      }
    }

    return [...new Set(addresses)]
  }

  private handleMessage(msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString()) as ServerAnnouncement

      if (data.type !== 'midi-server-announce' || data.version !== 1) {
        return
      }

      // Check if this is our own announcement
      const isLocal = data.apiUrl === this.apiUrl

      const server: DiscoveredServer = {
        serverName: data.serverName,
        apiUrl: data.apiUrl,
        midiServerPort: data.midiServerPort,
        lastSeen: Date.now(),
        isLocal
      }

      const existing = this.servers.get(data.apiUrl)
      if (!existing) {
        // New server discovered
        this.servers.set(data.apiUrl, server)
        if (!isLocal) {
          console.log(`[Discovery] Found server: ${data.serverName} at ${data.apiUrl}`)
        }
        this.emit('server-added', server)
      } else {
        // Update last seen time
        existing.lastSeen = Date.now()
        existing.serverName = data.serverName
      }
    } catch {
      // Invalid message, ignore
    }
  }

  private cleanupStaleServers(): void {
    const now = Date.now()
    const staleThreshold = now - SERVER_TTL

    for (const [url, server] of this.servers) {
      if (server.lastSeen < staleThreshold && !server.isLocal) {
        console.log(`[Discovery] Server offline: ${server.serverName} at ${url}`)
        this.servers.delete(url)
        this.emit('server-removed', server)
      }
    }
  }
}
