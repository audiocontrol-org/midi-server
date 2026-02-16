import type { UpdateSettings, UpdateStatus } from '@shared/types/update'

export type LogSeverity = 'debug' | 'info' | 'warning' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  severity: LogSeverity
  message: string
  source: 'server' | 'dashboard' | 'system'
}

export interface BuildInfo {
  version: string
  commit: string
  buildTime: string
  serial: string
}

export interface ServerProcess {
  running: boolean
  pid: number | null
  port: number | null
  url: string | null
}

export interface PlatformServices {
  /** Platform identifier */
  readonly name: 'electron' | 'web'

  /** API server base URL */
  readonly apiBaseUrl: string

  /** Whether this platform can manage the server process (always true with API server) */
  readonly canManageServer: boolean

  /** Start the MIDI HTTP Server */
  startServer(port?: number): Promise<ServerProcess>

  /** Stop the MIDI HTTP Server */
  stopServer(): Promise<void>

  /** Get current server process status */
  getServerStatus(): Promise<ServerProcess>

  /** Store a value persistently */
  setStorageItem(key: string, value: string): Promise<void>

  /** Retrieve a stored value */
  getStorageItem(key: string): Promise<string | null>

  /** Get all buffered logs */
  getLogs(): Promise<LogEntry[]>

  /** Clear the log buffer */
  clearLogs(): Promise<void>

  /** Get build information */
  getBuildInfo(): Promise<BuildInfo>

  /** Get server configuration (auto-assigned ports) */
  getConfig(): Promise<{ midiServerPort: number }>

  /** Subscribe to new log entries (returns unsubscribe function) */
  onLogEntry(callback: (entry: LogEntry) => void): () => void

  /** Get current update state */
  getUpdateStatus(): Promise<UpdateStatus>

  /** Trigger update check */
  checkForUpdates(): Promise<UpdateStatus>

  /** Download the currently available update */
  downloadUpdate(): Promise<UpdateStatus>

  /** Install downloaded update */
  installUpdate(): Promise<void>

  /** Get update settings */
  getUpdateSettings(): Promise<UpdateSettings>

  /** Update settings */
  setUpdateSettings(settings: Partial<UpdateSettings>): Promise<UpdateSettings>

  /** Subscribe to update status stream (returns unsubscribe function) */
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void

  /** Add a log entry from the dashboard */
  addLog(message: string, severity: LogSeverity): void
}
