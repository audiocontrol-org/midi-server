import type { PlatformServices, ServerProcess, LogEntry, LogSeverity, BuildInfo } from './types'

// Type for the API exposed by the preload script
interface ElectronAPI {
  startServer: (port: number) => Promise<ServerProcess>
  stopServer: () => Promise<void>
  getServerStatus: () => Promise<ServerProcess>
  getStorageItem: (key: string) => Promise<string | null>
  setStorageItem: (key: string, value: string) => Promise<void>
  getLogs: () => Promise<LogEntry[]>
  clearLogs: () => Promise<void>
  getBuildInfo: () => Promise<BuildInfo>
  onLogEntry: (callback: (entry: LogEntry) => void) => () => void
  addLog: (message: string, severity: LogSeverity) => Promise<LogEntry>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

/**
 * Electron platform implementation.
 * Delegates to the preload bridge for server management.
 */
export class ElectronPlatform implements PlatformServices {
  readonly name = 'electron' as const
  readonly canManageServer = true

  private get api(): ElectronAPI {
    if (!window.electronAPI) {
      throw new Error('electronAPI not available. Are you running in Electron?')
    }
    return window.electronAPI
  }

  async startServer(port: number): Promise<ServerProcess> {
    return this.api.startServer(port)
  }

  async stopServer(): Promise<void> {
    return this.api.stopServer()
  }

  async getServerStatus(): Promise<ServerProcess> {
    return this.api.getServerStatus()
  }

  async setStorageItem(key: string, value: string): Promise<void> {
    return this.api.setStorageItem(key, value)
  }

  async getStorageItem(key: string): Promise<string | null> {
    return this.api.getStorageItem(key)
  }

  async getLogs(): Promise<LogEntry[]> {
    return this.api.getLogs()
  }

  async clearLogs(): Promise<void> {
    return this.api.clearLogs()
  }

  async getBuildInfo(): Promise<BuildInfo> {
    return this.api.getBuildInfo()
  }

  onLogEntry(callback: (entry: LogEntry) => void): () => void {
    return this.api.onLogEntry(callback)
  }

  addLog(message: string, severity: LogSeverity): void {
    this.api.addLog(message, severity)
  }
}
