import type { PlatformServices, ServerProcess, LogEntry, LogSeverity, BuildInfo } from './types'

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

  constructor(name: 'electron' | 'web', apiBaseUrl: string) {
    this.name = name
    this.apiBaseUrl = apiBaseUrl
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
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

  addLog(message: string, severity: LogSeverity): void {
    // Fire and forget - send log to API server
    this.request('/api/logs', {
      method: 'POST',
      body: JSON.stringify({ message, severity })
    }).catch((err) => {
      console.error('Failed to add log:', err)
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
}
