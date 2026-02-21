import { resolve } from 'path'
import { execSync } from 'child_process'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import packageJson from './package.json'
import { apiServerPlugin } from './src/api-server/vite-plugin'

// Use env var or resolve from config file location
const midiServerBinaryPath =
  process.env.MIDI_BINARY_PATH ||
  resolve(__dirname, '../build/MidiHttpServer_artefacts/Release/MidiHttpServer')

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

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: {
      __BUILD_INFO__: JSON.stringify(buildInfo)
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    define: {
      __BUILD_INFO__: JSON.stringify(buildInfo)
    },
    plugins: [
      react(),
      tailwindcss(),
      apiServerPlugin({
        midiServerBinaryPath,
        buildInfo
      })
    ]
  }
})
