import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess, execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ServerStatusResponse } from '@shared/ipc-channels'
import type { LogEntry, BuildInfo } from '@shared/types/log-entry'
import { LogBuffer, parseSeverityFromMessage } from './log-buffer'
import icon from '../../resources/icon.png?asset'
import packageJson from '../../package.json'

// Server process state
let serverProcess: ChildProcess | null = null
let serverPort: number | null = null
let mainWindow: BrowserWindow | null = null

// Simple storage using a Map (could use electron-store for persistence)
const storage = new Map<string, string>()

// Log buffer for capturing server output
const logBuffer = new LogBuffer()

function addLog(message: string, source: LogEntry['source'], isStderr = false): void {
  const severity = isStderr
    ? parseSeverityFromMessage(message) === 'info'
      ? 'error'
      : parseSeverityFromMessage(message)
    : parseSeverityFromMessage(message)

  const entry = logBuffer.add(message, severity, source)

  // Send to renderer if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.LOGS_NEW, entry)
  }
}

function getBuildInfo(): BuildInfo {
  const version = packageJson.version
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    // Git not available or not a repo
  }
  const buildTime = new Date().toISOString()
  const buildDate = buildTime.split('T')[0].replace(/-/g, '')
  const serial = `v${version}-${commit}-${buildDate}`

  return { version, commit, buildTime, serial }
}

function getServerBinaryPath(): string {
  // In development, use the built binary from the parent project
  // In production, it will be bundled with the app
  if (is.dev) {
    return join(app.getAppPath(), '../build/MidiHttpServer_artefacts/Release/MidiHttpServer')
  }
  // Production: binary bundled in resources
  return join(process.resourcesPath, 'bin', 'midi-http-server')
}

function getServerStatus(): ServerStatusResponse {
  const running = serverProcess !== null && serverProcess.exitCode === null
  return {
    running,
    pid: running ? (serverProcess!.pid ?? null) : null,
    port: running ? serverPort : null,
    url: running && serverPort ? `http://localhost:${serverPort}` : null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC handlers
function setupIpcHandlers(): void {
  // Start server
  ipcMain.handle(IPC_CHANNELS.SERVER_START, async (_event, { port }: { port: number }) => {
    if (serverProcess && serverProcess.exitCode === null) {
      throw new Error('Server is already running')
    }

    const binaryPath = getServerBinaryPath()
    console.log(`Starting server: ${binaryPath} ${port}`)

    serverProcess = spawn(binaryPath, [String(port)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    serverPort = port

    serverProcess.stdout?.on('data', (data) => {
      const message = data.toString()
      console.log(`[server stdout] ${message}`)
      addLog(message, 'server', false)
    })

    serverProcess.stderr?.on('data', (data) => {
      const message = data.toString()
      console.error(`[server stderr] ${message}`)
      addLog(message, 'server', true)
    })

    serverProcess.on('exit', (code) => {
      const message = `Server process exited with code ${code}`
      console.log(message)
      addLog(message, 'system', false)
      serverProcess = null
      serverPort = null
    })

    serverProcess.on('error', (err) => {
      const message = `Failed to start server: ${err.message}`
      console.error(message)
      addLog(message, 'system', true)
      serverProcess = null
      serverPort = null
    })

    // Give the server a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500))

    return getServerStatus()
  })

  // Stop server
  ipcMain.handle(IPC_CHANNELS.SERVER_STOP, async () => {
    if (!serverProcess || serverProcess.exitCode !== null) {
      return
    }

    console.log('Stopping server...')
    serverProcess.kill('SIGTERM')

    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (serverProcess && serverProcess.exitCode === null) {
          serverProcess.kill('SIGKILL')
        }
        resolve()
      }, 5000)

      serverProcess!.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    serverProcess = null
    serverPort = null
  })

  // Get server status
  ipcMain.handle(IPC_CHANNELS.SERVER_STATUS, () => {
    return getServerStatus()
  })

  // Storage get
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET, (_event, { key }: { key: string }) => {
    return storage.get(key) ?? null
  })

  // Storage set
  ipcMain.handle(
    IPC_CHANNELS.STORAGE_SET,
    (_event, { key, value }: { key: string; value: string }) => {
      storage.set(key, value)
    }
  )

  // Get all logs
  ipcMain.handle(IPC_CHANNELS.LOGS_GET, () => {
    return logBuffer.getAll()
  })

  // Clear logs
  ipcMain.handle(IPC_CHANNELS.LOGS_CLEAR, () => {
    logBuffer.clear()
  })

  // Add log from renderer
  ipcMain.handle(
    IPC_CHANNELS.LOGS_ADD,
    (
      _event,
      { message, severity }: { message: string; severity: LogEntry['severity'] }
    ): LogEntry => {
      const entry = logBuffer.add(message, severity, 'dashboard')
      // Broadcast to renderer so subscription gets notified
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.LOGS_NEW, entry)
      }
      return entry
    }
  )

  // Get build info
  ipcMain.handle(IPC_CHANNELS.BUILD_INFO_GET, () => {
    return getBuildInfo()
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.audiocontrol.midi-dashboard')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up server process on quit
app.on('before-quit', () => {
  if (serverProcess && serverProcess.exitCode === null) {
    console.log('Cleaning up server process before quit...')
    serverProcess.kill('SIGTERM')
  }
})
