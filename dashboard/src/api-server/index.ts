#!/usr/bin/env node
import { join } from 'path'
import { ApiServer, getBuildInfo } from './server'
import type { ApiServerConfig, BuildInfo } from './types'

export { ApiServer, getBuildInfo } from './server'
export { LogBuffer, parseSeverityFromMessage } from './log-buffer'
export { ProcessManager } from './process-manager'
export { apiServerPlugin } from './vite-plugin'
export type { ApiServerConfig, ServerStatus, BuildInfo, LogEntry, LogSeverity } from './types'

const DEFAULT_API_PORT = 3001
const DEFAULT_MIDI_PORT = 0 // Let OS assign an available port

export function createApiServer(
  config: Partial<ApiServerConfig> & { buildInfo: BuildInfo }
): ApiServer {
  const fullConfig: ApiServerConfig = {
    apiPort: config.apiPort ?? DEFAULT_API_PORT,
    midiServerPort: config.midiServerPort ?? DEFAULT_MIDI_PORT,
    midiServerBinaryPath: config.midiServerBinaryPath ?? '',
    updateService: config.updateService
  }

  return new ApiServer(fullConfig, config.buildInfo)
}

// CLI entry point - only runs when executed directly
async function main(): Promise<void> {
  const apiPort = parseInt(process.env.API_PORT || String(DEFAULT_API_PORT), 10)
  const midiPort = parseInt(process.env.MIDI_PORT || String(DEFAULT_MIDI_PORT), 10)

  // Default binary path for development
  const defaultBinaryPath = join(
    process.cwd(),
    '../build/MidiHttpServer_artefacts/Release/MidiHttpServer'
  )
  const binaryPath = process.env.MIDI_BINARY_PATH || defaultBinaryPath

  console.log('Starting API server...')
  console.log(`  API Port: ${apiPort}`)
  console.log(`  MIDI Port: ${midiPort}`)
  console.log(`  MIDI Binary: ${binaryPath}`)

  // For CLI mode, generate build info at runtime
  const buildInfo = getBuildInfo('0.1.0')

  const server = createApiServer({
    apiPort,
    midiServerPort: midiPort,
    midiServerBinaryPath: binaryPath,
    buildInfo
  })

  await server.start()

  // Handle shutdown gracefully
  const shutdown = async (): Promise<void> => {
    console.log('\nShutting down...')
    await server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Check if this module is being run directly
const isMainModule =
  process.argv[1]?.endsWith('api-server/index.ts') ||
  process.argv[1]?.endsWith('api-server/index.js')

if (isMainModule) {
  main().catch((err) => {
    console.error('Failed to start API server:', err)
    process.exit(1)
  })
}
