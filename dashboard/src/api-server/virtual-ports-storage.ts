import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { VirtualPortConfig } from './types'

export interface VirtualPortsConfig {
  virtualPorts: VirtualPortConfig[]
}

// Allow override via environment variable for testing
const CONFIG_DIR =
  process.env.MIDI_SERVER_CONFIG_DIR ??
  path.join(os.homedir(), '.config', 'audiocontrol.org', 'midi-server')
const VIRTUAL_PORTS_FILE = path.join(CONFIG_DIR, 'virtual-ports.json')

export class VirtualPortsStorage {
  private virtualPorts: Map<string, VirtualPortConfig> = new Map()
  private saveDebounceTimer: NodeJS.Timeout | null = null

  constructor() {
    this.ensureConfigDir()
    this.load()
  }

  private ensureConfigDir(): void {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    } catch (err) {
      console.error('[VirtualPortsStorage] Failed to create config directory:', err)
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(VIRTUAL_PORTS_FILE)) {
        const data = fs.readFileSync(VIRTUAL_PORTS_FILE, 'utf-8')
        const config = JSON.parse(data) as VirtualPortsConfig
        this.virtualPorts.clear()
        for (const port of config.virtualPorts) {
          this.virtualPorts.set(port.id, port)
        }
        console.log(
          `[VirtualPortsStorage] Loaded ${this.virtualPorts.size} virtual ports from ${VIRTUAL_PORTS_FILE}`
        )
      }
    } catch (err) {
      console.error('[VirtualPortsStorage] Failed to load virtual ports:', err)
    }
  }

  private save(): void {
    // Debounce saves to prevent excessive disk writes
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveImmediate()
    }, 100)
  }

  private saveImmediate(): void {
    try {
      const config: VirtualPortsConfig = {
        virtualPorts: Array.from(this.virtualPorts.values())
      }
      fs.writeFileSync(VIRTUAL_PORTS_FILE, JSON.stringify(config, null, 2))
    } catch (err) {
      console.error('[VirtualPortsStorage] Failed to save virtual ports:', err)
    }
  }

  getAll(): VirtualPortConfig[] {
    return Array.from(this.virtualPorts.values())
  }

  get(id: string): VirtualPortConfig | undefined {
    return this.virtualPorts.get(id)
  }

  create(port: Omit<VirtualPortConfig, 'id' | 'createdAt'>): VirtualPortConfig {
    const id = this.generateId()
    const newPort: VirtualPortConfig = {
      ...port,
      id,
      createdAt: Date.now()
    }
    this.virtualPorts.set(id, newPort)
    this.save()
    return newPort
  }

  update(id: string, updates: Partial<Omit<VirtualPortConfig, 'id' | 'createdAt'>>): VirtualPortConfig | undefined {
    const existing = this.virtualPorts.get(id)
    if (!existing) {
      return undefined
    }

    const updated: VirtualPortConfig = { ...existing, ...updates }
    this.virtualPorts.set(id, updated)
    this.save()
    return updated
  }

  delete(id: string): boolean {
    const deleted = this.virtualPorts.delete(id)
    if (deleted) {
      this.save()
    }
    return deleted
  }

  getByType(type: 'input' | 'output'): VirtualPortConfig[] {
    return Array.from(this.virtualPorts.values()).filter((port) => port.type === type)
  }

  getByRouteId(routeId: string): VirtualPortConfig[] {
    return Array.from(this.virtualPorts.values()).filter((port) => port.associatedRouteId === routeId)
  }

  private generateId(): string {
    return `virtual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}
