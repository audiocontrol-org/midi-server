export type UpdateChannel = 'production' | 'development'
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface UpdateSettings {
  autoCheck: boolean
  autoDownload: boolean
  autoInstallOnQuit: boolean
  devMode: boolean
  devBuildPath: string | null
  checkIntervalMinutes: number
}

export interface UpdateStatus {
  phase: UpdatePhase
  channel: UpdateChannel
  currentVersion: string
  availableVersion: string | null
  downloadProgress: number | null
  downloaded: boolean
  message: string | null
  lastCheckedAt: number | null
  lastError: string | null
}

export interface UpdateEvent {
  type: 'status'
  status: UpdateStatus
}

export interface UpdateService {
  getStatus(): UpdateStatus
  getSettings(): UpdateSettings
  updateSettings(patch: Partial<UpdateSettings>): UpdateSettings
  checkForUpdates(): Promise<UpdateStatus>
  downloadUpdate(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  onStatusChange(listener: (event: UpdateEvent) => void): () => void
  shutdown(): Promise<void>
}
