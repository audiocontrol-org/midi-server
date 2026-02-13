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

  /** Subscribe to new log entries (returns unsubscribe function) */
  onLogEntry(callback: (entry: LogEntry) => void): () => void

  /** Add a log entry from the dashboard */
  addLog(message: string, severity: LogSeverity): void
}
