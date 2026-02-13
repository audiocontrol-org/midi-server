import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface RouteEndpoint {
  serverUrl: string
  portId: string
  portName: string
}

export interface Route {
  id: string
  enabled: boolean
  source: RouteEndpoint
  destination: RouteEndpoint
}

export interface RoutesConfig {
  routes: Route[]
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'audiocontrol.org', 'midi-server')
const ROUTES_FILE = path.join(CONFIG_DIR, 'routes.json')

export class RoutesStorage {
  private routes: Map<string, Route> = new Map()
  private saveDebounceTimer: NodeJS.Timeout | null = null

  constructor() {
    this.ensureConfigDir()
    this.load()
  }

  private ensureConfigDir(): void {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    } catch (err) {
      console.error('[RoutesStorage] Failed to create config directory:', err)
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(ROUTES_FILE)) {
        const data = fs.readFileSync(ROUTES_FILE, 'utf-8')
        const config = JSON.parse(data) as RoutesConfig
        this.routes.clear()
        for (const route of config.routes) {
          this.routes.set(route.id, route)
        }
        console.log(`[RoutesStorage] Loaded ${this.routes.size} routes from ${ROUTES_FILE}`)
      }
    } catch (err) {
      console.error('[RoutesStorage] Failed to load routes:', err)
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
      const config: RoutesConfig = {
        routes: Array.from(this.routes.values())
      }
      fs.writeFileSync(ROUTES_FILE, JSON.stringify(config, null, 2))
    } catch (err) {
      console.error('[RoutesStorage] Failed to save routes:', err)
    }
  }

  getAll(): Route[] {
    return Array.from(this.routes.values())
  }

  get(id: string): Route | undefined {
    return this.routes.get(id)
  }

  create(route: Omit<Route, 'id'>): Route {
    const id = this.generateId()
    const newRoute: Route = { ...route, id }
    this.routes.set(id, newRoute)
    this.save()
    return newRoute
  }

  update(id: string, updates: Partial<Omit<Route, 'id'>>): Route | undefined {
    const existing = this.routes.get(id)
    if (!existing) {
      return undefined
    }

    const updated: Route = { ...existing, ...updates }
    this.routes.set(id, updated)
    this.save()
    return updated
  }

  delete(id: string): boolean {
    const deleted = this.routes.delete(id)
    if (deleted) {
      this.save()
    }
    return deleted
  }

  getEnabled(): Route[] {
    return Array.from(this.routes.values()).filter((route) => route.enabled)
  }

  private generateId(): string {
    return `route-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}
