import { HttpPlatform } from './http-platform'

// Type for the minimal API exposed by the preload script
interface ElectronAPI {
  isElectron: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

/**
 * Determine the API base URL based on how the page was loaded.
 * - If loaded from http://localhost:*, use same origin (Vite dev server)
 * - If loaded from file://, use http://localhost:3001 (production API server)
 */
function getApiBaseUrl(): string {
  const { protocol, hostname, port } = window.location

  // Dev mode: loaded from Vite dev server
  if (protocol === 'http:' && hostname === 'localhost') {
    console.log(`[ElectronPlatform] Dev mode detected (${protocol}//${hostname}:${port}), using relative URLs`)
    return ''
  }

  // Production: loaded from file:// or other
  console.log(`[ElectronPlatform] Production mode (${protocol}), using http://localhost:3001`)
  return 'http://localhost:3001'
}

/**
 * Electron platform implementation.
 * Automatically detects dev vs production based on page origin.
 */
export class ElectronPlatform extends HttpPlatform {
  constructor() {
    super('electron', getApiBaseUrl())
  }
}
