export type LogSeverity = 'debug' | 'info' | 'warning' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  severity: LogSeverity
  message: string
  source: 'server' | 'dashboard' | 'system' | 'routing'
}

export interface BuildInfo {
  version: string
  commit: string
  buildTime: string
  serial: string
}
