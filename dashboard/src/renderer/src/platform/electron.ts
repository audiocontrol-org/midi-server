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
 * Electron platform implementation.
 * Uses HTTP to communicate with the Vite server (same origin).
 * Both Electron and browser access the same Vite server with API middleware.
 */
export class ElectronPlatform extends HttpPlatform {
  constructor() {
    // Same origin - Electron loads from the Vite server
    super('electron', '')
  }
}
