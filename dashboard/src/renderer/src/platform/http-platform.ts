import type {
  PlatformServices,
  ServerProcess,
  LogEntry,
  LogSeverity,
  BuildInfo
} from './types'
import type { UpdateSettings, UpdateStatus } from '@shared/types/update'
import { logStore } from '@/stores/log-store'

/**
 * HTTP-based platform implementation.
 * Works identically for both Electron and Web modes.
 * All functionality is provided via HTTP calls to the API server.
 */
export class HttpPlatform implements PlatformServices {
  readonly name: 'electron' | 'web'
  readonly apiBaseUrl: string
  readonly canManageServer = true

  private eventSource: EventSource | null = null
  private logListeners: Set<(entry: LogEntry) => void> = new Set()
  private updateEventSource: EventSource | null = null
  private updateListeners: Set<(status: UpdateStatus) => void> = new Set()

  constructor(name: 'electron' | 'web', apiBaseUrl: string) {
    this.name = name
    this.apiBaseUrl = apiBaseUrl
    console.log(`[HttpPlatform] Initialized: name=${name}, apiBaseUrl=${apiBaseUrl || '(relative)'}`)
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }))
        const message = error.error || `HTTP ${response.status}`
        console.error(`[HttpPlatform] Request failed: ${options.method || 'GET'} ${url} - ${message}`)
        throw new Error(message)
      }

      return response.json()
    } catch (err) {
      // Log network errors (connection refused, timeout, etc.)
      if (err instanceof TypeError) {
        console.error(`[HttpPlatform] Network error: ${options.method || 'GET'} ${url} - ${err.message}`)
      }
      throw err
    }
  }

  async startServer(port?: number): Promise<ServerProcess> {
    return this.request<ServerProcess>('/api/server/start', {
      method: 'POST',
      body: JSON.stringify({ port })
    })
  }

  async stopServer(): Promise<void> {
    await this.request('/api/server/stop', { method: 'POST' })
  }

  async getServerStatus(): Promise<ServerProcess> {
    return this.request<ServerProcess>('/api/status')
  }

  async setStorageItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  }

  async getStorageItem(key: string): Promise<string | null> {
    return localStorage.getItem(key)
  }

  async getLogs(): Promise<LogEntry[]> {
    return this.request<LogEntry[]>('/api/logs')
  }

  async clearLogs(): Promise<void> {
    await this.request('/api/logs', { method: 'DELETE' })
  }

  async getBuildInfo(): Promise<BuildInfo> {
    return this.request<BuildInfo>('/api/build-info')
  }

  async getConfig(): Promise<{ midiServerPort: number }> {
    return this.request<{ midiServerPort: number }>('/api/config')
  }

  onLogEntry(callback: (entry: LogEntry) => void): () => void {
    this.logListeners.add(callback)

    // Start SSE connection if not already connected
    if (!this.eventSource) {
      this.connectLogStream()
    }

    return () => {
      this.logListeners.delete(callback)

      // Close SSE connection if no more listeners
      if (this.logListeners.size === 0 && this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
    }
  }

  async getUpdateStatus(): Promise<UpdateStatus> {
    return this.request<UpdateStatus>('/api/update/status')
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    return this.request<UpdateStatus>('/api/update/check', { method: 'POST' })
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    return this.request<UpdateStatus>('/api/update/download', { method: 'POST' })
  }

  async installUpdate(): Promise<void> {
    await this.request('/api/update/install', { method: 'POST' })
  }

  async getUpdateSettings(): Promise<UpdateSettings> {
    return this.request<UpdateSettings>('/api/update/settings')
  }

  async setUpdateSettings(settings: Partial<UpdateSettings>): Promise<UpdateSettings> {
    return this.request<UpdateSettings>('/api/update/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
  }

  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void {
    this.updateListeners.add(callback)

    if (!this.updateEventSource) {
      this.connectUpdateStream()
    }

    return () => {
      this.updateListeners.delete(callback)

      if (this.updateListeners.size === 0 && this.updateEventSource) {
        this.updateEventSource.close()
        this.updateEventSource = null
      }
    }
  }

  addLog(message: string, severity: LogSeverity): void {
    // ALWAYS add to local store first - this guarantees the log is captured
    logStore.add(message, severity, 'dashboard')

    // Then try to sync to API
    this.request('/api/logs', {
      method: 'POST',
      body: JSON.stringify({ message, severity })
    }).catch((err) => {
      // Log the API failure locally too
      const apiError = err instanceof Error ? err.message : String(err)
      logStore.add(`[API sync failed] ${apiError}`, 'warning', 'system')
    })
  }

  private connectLogStream(): void {
    const url = `${this.apiBaseUrl}/api/logs/stream`
    this.eventSource = new EventSource(url)

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'log' && data.entry) {
          for (const listener of this.logListeners) {
            listener(data.entry)
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    this.eventSource.onerror = () => {
      // Reconnect after a delay
      if (this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }

      if (this.logListeners.size > 0) {
        setTimeout(() => this.connectLogStream(), 2000)
      }
    }
  }

  private connectUpdateStream(): void {
    const url = `${this.apiBaseUrl}/api/update/stream`
    this.updateEventSource = new EventSource(url)

    this.updateEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'status' && data.status) {
          for (const listener of this.updateListeners) {
            listener(data.status)
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    this.updateEventSource.onerror = () => {
      if (this.updateEventSource) {
        this.updateEventSource.close()
        this.updateEventSource = null
      }

      if (this.updateListeners.size > 0) {
        setTimeout(() => this.connectUpdateStream(), 2000)
      }
    }
  }
}
