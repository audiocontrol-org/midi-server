import type { LogEntry, LogSeverity, BuildInfo } from '@shared/types/log-entry'
import type { UpdateService } from '@shared/types/update'

export interface ServerStatus {
  running: boolean
  pid: number | null
  port: number | null
  url: string | null
}

export interface ApiServerConfig {
  apiPort: number
  midiServerPort: number
  midiServerBinaryPath: string
  updateService?: UpdateService
  /** Directory to serve static files from (for web UI). If not set, no static files are served. */
  staticDir?: string
}

export { LogEntry, LogSeverity, BuildInfo }
