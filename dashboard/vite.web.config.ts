import { resolve } from 'path'
import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiServerPlugin } from './src/api-server/vite-plugin'
import packageJson from './package.json'

function getBuildInfo(): {
  version: string
  commit: string
  buildTime: string
  serial: string
} {
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

const buildInfo = getBuildInfo()

// Default binary path for development
const midiServerBinaryPath = resolve(__dirname, '../build/MidiHttpServer_artefacts/Release/MidiHttpServer')

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo)
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
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
