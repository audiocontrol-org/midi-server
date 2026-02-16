import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import chokidar, { type FSWatcher } from 'chokidar'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  UpdateEvent,
  UpdateService,
  UpdateSettings,
  UpdateStatus
} from '@shared/types/update'

interface UpdateManagerOptions {
  currentVersion: string
}

const DEFAULT_SETTINGS: UpdateSettings = {
  autoCheck: true,
  autoDownload: false,
  autoInstallOnQuit: false,
  devMode: false,
  devBuildPath: null,
  checkIntervalMinutes: 60
}

export class UpdateManager implements UpdateService {
  private settings: UpdateSettings = { ...DEFAULT_SETTINGS }
  private status: UpdateStatus
  private listeners: Set<(event: UpdateEvent) => void> = new Set()
  private settingsPath: string
  private checkTimer: NodeJS.Timeout | null = null
  private watcher: FSWatcher | null = null
  private pendingDevBuild: DevBuildMetadata | null = null

  constructor(options: UpdateManagerOptions) {
    this.settingsPath = join(app.getPath('userData'), 'update-settings.json')
    this.status = {
      phase: 'idle',
      channel: 'production',
      currentVersion: options.currentVersion,
      availableVersion: null,
      downloadProgress: null,
      downloaded: false,
      message: null,
      lastCheckedAt: null,
      lastError: null
    }
  }

  async initialize(): Promise<void> {
    await this.loadSettings()
    this.configureAutoUpdater()
    await this.applySettingsSideEffects()
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  getSettings(): UpdateSettings {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<UpdateSettings>): UpdateSettings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    void this.persistSettings()
    void this.applySettingsSideEffects()
    this.emitStatus()
    return this.getSettings()
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.settings.devMode) {
      await this.checkDevelopmentBuild()
      return this.getStatus()
    }

    this.updateStatus({
      phase: 'checking',
      message: 'Checking for updates...',
      lastError: null,
      downloadProgress: null,
      lastCheckedAt: Date.now()
    })

    await autoUpdater.checkForUpdates()
    return this.getStatus()
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (this.settings.devMode) {
      if (this.status.phase !== 'available' || !this.pendingDevBuild) {
        throw new Error('No development update available to apply')
      }

      this.updateStatus({
        phase: 'downloaded',
        availableVersion: this.pendingDevBuild.version,
        downloaded: true,
        downloadProgress: 100,
        message: `Development build ${this.pendingDevBuild.version} ready to apply`
      })
      return this.getStatus()
    }

    await autoUpdater.downloadUpdate()
    return this.getStatus()
  }

  async installUpdate(): Promise<void> {
    if (this.settings.devMode) {
      if (!this.status.downloaded) {
        throw new Error('No downloaded development build to install')
      }

      if (!this.pendingDevBuild?.executablePath) {
        throw new Error('No local development build executable is available to launch')
      }

      this.updateStatus({ phase: 'installing', message: 'Restarting to apply development build' })

      app.relaunch({
        execPath: this.pendingDevBuild.executablePath,
        args: process.argv.slice(1)
      })
      app.exit(0)
      return
    }

    if (!this.status.downloaded) {
      throw new Error('No downloaded update available to install')
    }

    this.updateStatus({ phase: 'installing', message: 'Installing update and restarting...' })
    autoUpdater.quitAndInstall()
  }

  onStatusChange(listener: (event: UpdateEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async shutdown(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  private configureAutoUpdater(): void {
    autoUpdater.autoDownload = this.settings.autoDownload
    autoUpdater.autoInstallOnAppQuit = this.settings.autoInstallOnQuit

    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({
        phase: 'checking',
        channel: 'production',
        message: 'Checking for updates...',
        lastError: null
      })
    })

    autoUpdater.on('update-available', (info) => {
      this.updateStatus({
        phase: 'available',
        channel: 'production',
        availableVersion: info.version,
        downloaded: false,
        downloadProgress: 0,
        message: `Update ${info.version} is available`
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.updateStatus({
        phase: 'not-available',
        channel: 'production',
        availableVersion: null,
        downloaded: false,
        downloadProgress: null,
        message: 'No updates available'
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.updateStatus({
        phase: 'downloading',
        channel: 'production',
        downloadProgress: Math.max(0, Math.min(100, progress.percent)),
        message: 'Downloading update...'
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.updateStatus({
        phase: 'downloaded',
        channel: 'production',
        availableVersion: info.version,
        downloaded: true,
        downloadProgress: 100,
        message: 'Update downloaded and ready to install'
      })
    })

    autoUpdater.on('error', (error) => {
      this.updateStatus({
        phase: 'error',
        channel: this.settings.devMode ? 'development' : 'production',
        message: 'Update check failed',
        lastError: getErrorMessage(error)
      })
    })
  }

  private async loadSettings(): Promise<void> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf8')
      const parsed = JSON.parse(content) as Partial<UpdateSettings>
      this.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...parsed })
    } catch {
      this.settings = { ...DEFAULT_SETTINGS }
      await this.persistSettings()
    }
  }

  private async persistSettings(): Promise<void> {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8')
  }

  private async applySettingsSideEffects(): Promise<void> {
    this.status.channel = this.settings.devMode ? 'development' : 'production'
    autoUpdater.autoDownload = this.settings.autoDownload
    autoUpdater.autoInstallOnAppQuit = this.settings.autoInstallOnQuit

    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    if (this.settings.autoCheck) {
      const intervalMs = this.settings.checkIntervalMinutes * 60 * 1000
      this.checkTimer = setInterval(() => {
        void this.checkForUpdates().catch((err) => {
          this.updateStatus({
            phase: 'error',
            message: 'Periodic update check failed',
            lastError: err instanceof Error ? err.message : String(err)
          })
        })
      }, intervalMs)
    }

    await this.configureDevelopmentWatcher()

    if (this.settings.autoCheck) {
      void this.checkForUpdates().catch((err) => {
        this.updateStatus({
          phase: 'error',
          message: 'Startup update check failed',
          lastError: err instanceof Error ? err.message : String(err)
        })
      })
    }
  }

  private async configureDevelopmentWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    if (!this.settings.devMode || !this.settings.devBuildPath) {
      return
    }

    const watchPath = this.settings.devBuildPath
    this.watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })

    this.watcher.on('add', (path) => {
      if (path.endsWith('Info.plist')) {
        void this.checkDevelopmentBuild()
      }
    })
    this.watcher.on('change', (path) => {
      if (path.endsWith('Info.plist')) {
        void this.checkDevelopmentBuild()
      }
    })
    this.watcher.on('error', (error) => {
      this.updateStatus({
        phase: 'error',
        channel: 'development',
        message: 'Development watcher failed',
        lastError: getErrorMessage(error)
      })
    })
  }

  private async checkDevelopmentBuild(): Promise<void> {
    if (!this.settings.devBuildPath) {
      this.updateStatus({
        phase: 'error',
        channel: 'development',
        message: 'Dev mode enabled, but no build path is configured',
        lastError: 'Missing devBuildPath'
      })
      return
    }

    this.updateStatus({
      phase: 'checking',
      channel: 'development',
      message: 'Checking development build...',
      lastCheckedAt: Date.now(),
      lastError: null
    })

    const devBuild = await this.readDevBuildMetadata(this.settings.devBuildPath)
    if (!devBuild) {
      this.pendingDevBuild = null
      this.updateStatus({
        phase: 'not-available',
        channel: 'development',
        availableVersion: null,
        downloaded: false,
        message: 'No development build found at configured path'
      })
      return
    }

    if (compareVersions(devBuild.version, this.status.currentVersion) > 0) {
      this.pendingDevBuild = devBuild
      this.updateStatus({
        phase: 'available',
        channel: 'development',
        availableVersion: devBuild.version,
        downloaded: false,
        downloadProgress: 0,
        message: `Development build ${devBuild.version} is available`
      })
      return
    }

    this.pendingDevBuild = null
    this.updateStatus({
      phase: 'not-available',
      channel: 'development',
      availableVersion: null,
      downloaded: false,
      downloadProgress: null,
      message: 'Current version is up to date'
    })
  }

  private async readDevBuildMetadata(basePath: string): Promise<DevBuildMetadata | null> {
    const appCandidates = [
      join(basePath, 'MidiServer.app'),
      basePath.endsWith('.app') ? basePath : null
    ].filter((path): path is string => Boolean(path))

    for (const appPath of appCandidates) {
      const plistPath = join(appPath, 'Contents', 'Info.plist')
      try {
        const content = await fs.readFile(plistPath, 'utf8')
        const version = extractBundleVersion(content)
        const executableName = extractPlistValue(content, 'CFBundleExecutable')
        if (!version || !executableName) {
          continue
        }

        const executablePath = join(appPath, 'Contents', 'MacOS', executableName)
        await fs.access(executablePath)

        return {
          version,
          appPath,
          executablePath
        }
      } catch {
        // Try the next candidate
      }
    }

    const plistCandidates = [
      join(basePath, 'MidiServer.app', 'Contents', 'Info.plist'),
      join(basePath, 'Contents', 'Info.plist'),
      basePath
    ]

    for (const candidate of plistCandidates) {
      try {
        const content = await fs.readFile(candidate, 'utf8')
        const version = extractBundleVersion(content)
        if (version) {
          return {
            version,
            appPath: null,
            executablePath: null
          }
        }
      } catch {
        // Try the next candidate
      }
    }

    return null
  }

  private updateStatus(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emitStatus()
  }

  private emitStatus(): void {
    const event: UpdateEvent = {
      type: 'status',
      status: this.getStatus()
    }
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

interface DevBuildMetadata {
  version: string
  appPath: string | null
  executablePath: string | null
}

function extractBundleVersion(plist: string): string | null {
  const versionMatch = plist.match(
    /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/i
  )
  if (versionMatch?.[1]) {
    return versionMatch[1]
  }

  const shortVersionMatch = plist.match(
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/i
  )
  if (shortVersionMatch?.[1]) {
    return shortVersionMatch[1]
  }

  return null
}

function extractPlistValue(plist: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keyValueMatch = plist.match(
    new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]+)</string>`, 'i')
  )
  if (keyValueMatch?.[1]) {
    return keyValueMatch[1]
  }
  return null
}

function sanitizeSettings(settings: UpdateSettings): UpdateSettings {
  return {
    autoCheck: Boolean(settings.autoCheck),
    autoDownload: Boolean(settings.autoDownload),
    autoInstallOnQuit: Boolean(settings.autoInstallOnQuit),
    devMode: Boolean(settings.devMode),
    devBuildPath: settings.devBuildPath || null,
    checkIntervalMinutes: Math.max(1, Math.floor(settings.checkIntervalMinutes || 60))
  }
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const bParts = b.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < maxLength; i += 1) {
    const aPart = aParts[i] ?? 0
    const bPart = bParts[i] ?? 0
    if (aPart > bPart) return 1
    if (aPart < bPart) return -1
  }
  return 0
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
