#!/usr/bin/env tsx
/**
 * MIDI Server Dashboard
 *
 * Runs Vite with API middleware. Automatically finds available ports.
 * Both Electron and browsers connect to this same server.
 *
 * Usage:
 *   tsx scripts/server.ts           # Start server + Electron
 *   tsx scripts/server.ts --web     # Start server only (browser access)
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { createServer as createViteServer, ViteDevServer } from 'vite'
import { createServer as createNetServer } from 'net'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiServerPlugin } from '../src/api-server/vite-plugin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')

const packageJson = JSON.parse(readFileSync(resolve(ROOT_DIR, 'package.json'), 'utf-8'))

/**
 * Get an available port from the OS by binding to port 0
 */
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.once('listening', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close()
        reject(new Error('Failed to get port from server address'))
      }
    })
    server.listen(0)
  })
}

function getBuildInfo() {
  const version = packageJson.version
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    // Git not available
  }
  const buildTime = new Date().toISOString()
  const buildDate = buildTime.split('T')[0].replace(/-/g, '')
  return { version, commit, buildTime, serial: `v${version}-${commit}-${buildDate}` }
}

async function startServer(
  midiPort: number,
  forcedApiPort?: number | null
): Promise<{ server: ViteDevServer; apiPort: number }> {
  const midiServerBinaryPath = resolve(
    ROOT_DIR,
    '../build/MidiHttpServer_artefacts/Release/MidiHttpServer'
  )

  const server = await createViteServer({
    configFile: false,
    root: resolve(ROOT_DIR, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(ROOT_DIR, 'src/renderer/src'),
        '@shared': resolve(ROOT_DIR, 'src/shared')
      }
    },
    define: {
      __BUILD_INFO__: JSON.stringify(getBuildInfo())
    },
    plugins: [
      react(),
      tailwindcss(),
      apiServerPlugin({
        midiServerPort: midiPort,
        midiServerBinaryPath,
        buildInfo: getBuildInfo()
      })
    ],
    server: {
      port: forcedApiPort ?? 0, // Let OS assign an available port or use forced port
      strictPort: !!forcedApiPort,
      host: '0.0.0.0' // Listen on all interfaces for cross-machine discovery
    }
  })

  await server.listen()

  // Get the actual port Vite is listening on
  const addr = server.httpServer?.address()
  const apiPort = addr && typeof addr === 'object' ? addr.port : 3001

  console.log(`\n  Dashboard: http://localhost:${apiPort}`)
  console.log(`  API:       http://localhost:${apiPort}/api/health`)
  console.log(`  MIDI Port: ${midiPort}\n`)

  return { server, apiPort }
}

function buildElectron(): void {
  console.log('Building Electron main/preload...')
  execSync('npx electron-vite build --outDir out', { cwd: ROOT_DIR, stdio: 'inherit' })
}

function startElectron(serverPort: number): ChildProcess {
  const electron = spawn('npx', ['electron', '.'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${serverPort}` }
  })
  return electron
}

async function main() {
  const webOnly = process.argv.includes('--web')
  const headless = process.env.HEADLESS === '1'

  console.log('Finding available ports...')

  // Support forced ports for integration testing
  const forcedMidiPort = process.env.FORCE_MIDI_PORT
    ? parseInt(process.env.FORCE_MIDI_PORT, 10)
    : null
  const forcedApiPort = process.env.FORCE_API_PORT ? parseInt(process.env.FORCE_API_PORT, 10) : null

  // Get available ports from OS (or use forced ports)
  const midiPort = forcedMidiPort ?? (await getAvailablePort())

  console.log(`  MIDI server port: ${midiPort}`)

  const { server, apiPort } = await startServer(midiPort, forcedApiPort)

  let electron: ChildProcess | null = null
  if (!webOnly && !headless) {
    buildElectron()
    electron = startElectron(apiPort)
    electron.on('close', (code) => {
      server.close().then(() => process.exit(code ?? 0))
    })
  }

  const shutdown = async () => {
    console.log('\nShutting down...')
    electron?.kill()
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
