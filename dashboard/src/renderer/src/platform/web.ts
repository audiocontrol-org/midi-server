import type { PlatformServices, ServerProcess, LogEntry, LogSeverity, BuildInfo } from './types'

declare const __BUILD_INFO__: BuildInfo

// Local log buffer for web platform
const MAX_ENTRIES = 1000
let webLogs: LogEntry[] = []
let idCounter = 0
const listeners: Set<(entry: LogEntry) => void> = new Set()

/**
 * Web platform implementation.
 * Cannot manage server processes - only connects to remote servers.
 */
export class WebPlatform implements PlatformServices {
  readonly name = 'web' as const
  readonly canManageServer = false

  async startServer(): Promise<ServerProcess> {
    throw new Error('Cannot start server from web platform. Connect to a running server instead.')
  }

  async stopServer(): Promise<void> {
    throw new Error('Cannot stop server from web platform.')
  }

  async getServerStatus(): Promise<ServerProcess> {
    // Web platform cannot manage server processes
    return {
      running: false,
      pid: null,
      port: null,
      url: null
    }
  }

  async setStorageItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  }

  async getStorageItem(key: string): Promise<string | null> {
    return localStorage.getItem(key)
  }

  async getLogs(): Promise<LogEntry[]> {
    return [...webLogs]
  }

  async clearLogs(): Promise<void> {
    webLogs = []
  }

  async getBuildInfo(): Promise<BuildInfo> {
    return __BUILD_INFO__
  }

  onLogEntry(callback: (entry: LogEntry) => void): () => void {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }

  addLog(message: string, severity: LogSeverity): void {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${++idCounter}`,
      timestamp: Date.now(),
      severity,
      message: message.trim(),
      source: 'dashboard'
    }

    webLogs.push(entry)
    if (webLogs.length > MAX_ENTRIES) {
      webLogs = webLogs.slice(-MAX_ENTRIES)
    }

    listeners.forEach((cb) => cb(entry))
  }
}
