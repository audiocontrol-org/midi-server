#!/usr/bin/env tsx
/**
 * MIDI Server Dashboard
 *
 * Runs Vite with API middleware on port 3001.
 * Both Electron and browsers connect to this same server.
 *
 * Usage:
 *   tsx scripts/server.ts           # Start server + Electron
 *   tsx scripts/server.ts --web     # Start server only (browser access)
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { createServer, ViteDevServer } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiServerPlugin } from '../src/api-server/vite-plugin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')
const SERVER_PORT = 3001

const packageJson = JSON.parse(readFileSync(resolve(ROOT_DIR, 'package.json'), 'utf-8'))

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

async function startServer(): Promise<ViteDevServer> {
  const midiServerBinaryPath = resolve(ROOT_DIR, '../build/MidiHttpServer_artefacts/Release/MidiHttpServer')

  const server = await createServer({
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
        midiServerPort: 8080,
        midiServerBinaryPath,
        version: packageJson.version
      })
    ],
    server: {
      port: SERVER_PORT,
      strictPort: true
    }
  })

  await server.listen()
  console.log(`\n  Dashboard: http://localhost:${SERVER_PORT}`)
  console.log(`  API:       http://localhost:${SERVER_PORT}/api/health\n`)

  return server
}

function buildElectron(): void {
  console.log('Building Electron main/preload...')
  execSync('npx electron-vite build --outDir out', { cwd: ROOT_DIR, stdio: 'inherit' })
}

function startElectron(): ChildProcess {
  const electron = spawn('npx', ['electron', '.'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${SERVER_PORT}` }
  })
  return electron
}

async function main() {
  const webOnly = process.argv.includes('--web')

  const server = await startServer()

  let electron: ChildProcess | null = null
  if (!webOnly) {
    buildElectron()
    electron = startElectron()
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
