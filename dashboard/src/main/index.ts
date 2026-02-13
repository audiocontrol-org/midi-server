import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let viteProcess: ChildProcess | null = null

const SERVER_PORT = 3001

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

  // Load from the Vite server (same URL for Electron and browser)
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`)
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

async function startViteServer(): Promise<void> {
  const viteConfigPath = join(app.getAppPath(), 'vite.electron.config.ts')

  console.log('Starting Vite server...')

  viteProcess = spawn('npx', ['vite', '--config', viteConfigPath, '--port', String(SERVER_PORT)], {
    cwd: app.getAppPath(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  })

  viteProcess.stdout?.on('data', (data) => {
    console.log(`[vite] ${data.toString().trim()}`)
  })

  viteProcess.stderr?.on('data', (data) => {
    console.error(`[vite] ${data.toString().trim()}`)
  })

  viteProcess.on('error', (err) => {
    console.error('Failed to start Vite:', err)
  })

  viteProcess.on('exit', (code) => {
    console.log(`Vite process exited with code ${code}`)
    viteProcess = null
  })

  // Wait for server to be ready
  const ready = await waitForServer(`http://localhost:${SERVER_PORT}/api/health`, 30000)
  if (ready) {
    console.log(`Vite server running at http://localhost:${SERVER_PORT}`)
    console.log(`  → Electron and browser can both access this URL`)
  } else {
    console.error('Vite server failed to start')
  }
}

function stopViteServer(): void {
  if (viteProcess) {
    console.log('Stopping Vite server...')
    viteProcess.kill('SIGTERM')
    viteProcess = null
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.audiocontrol.midi-dashboard')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // In development, start our own Vite server
  // In production, we'd serve static files instead
  if (is.dev) {
    await startViteServer()
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

app.on('before-quit', () => {
  stopViteServer()
})
