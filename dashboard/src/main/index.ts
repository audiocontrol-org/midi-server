import { app, shell, BrowserWindow } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createApiServer, ApiServer } from '../api-server'
import type { BuildInfo } from '../api-server/types'
import { UpdateManager } from './update-manager'

// Build info injected at build time by electron-vite
declare const __BUILD_INFO__: BuildInfo

let mainWindow: BrowserWindow | null = null
let apiServer: ApiServer | null = null
let updateManager: UpdateManager | null = null

const API_PORT = 3001
const MIDI_PORT = 0 // Let OS assign an available port

function getBundledBinaryPath(): string {
  // Allow override via environment variable
  if (process.env.MIDI_BINARY_PATH) {
    return process.env.MIDI_BINARY_PATH
  }

  if (is.dev) {
    // In development, resolve relative to app directory
    return resolve(app.getAppPath(), '../build/MidiHttpServer_artefacts/Release/MidiHttpServer')
  }

  // In production, use the bundled binary in Resources
  return join(process.resourcesPath, 'bin', 'midi-http-server')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'AudioControl MidiServer',
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

  // In development, load from Vite server (set by dev script)
  // In production, load built files
  if (is.dev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('org.audiocontrol.midi-server')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the API server in production mode
  // (In dev mode, Vite middleware handles API routes)
  if (!is.dev) {
    updateManager = new UpdateManager({
      currentVersion: app.getVersion()
    })
    await updateManager.initialize()

    const binaryPath = getBundledBinaryPath()
    console.log(`Starting API server with binary: ${binaryPath}`)

    apiServer = createApiServer({
      apiPort: API_PORT,
      midiServerPort: MIDI_PORT,
      midiServerBinaryPath: binaryPath,
      updateService: updateManager,
      buildInfo: __BUILD_INFO__
    })

    try {
      await apiServer.start()
      console.log(`API server started on port ${API_PORT}`)
    } catch (err) {
      console.error('Failed to start API server:', err)
    }
  }

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

app.on('before-quit', async () => {
  if (updateManager) {
    await updateManager.shutdown()
  }

  if (apiServer) {
    console.log('Stopping API server...')
    await apiServer.stop()
  }
})
