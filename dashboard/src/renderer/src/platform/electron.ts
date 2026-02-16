import { HttpPlatform } from './http-platform'

// Type for the minimal API exposed by the preload script
interface ElectronAPI {
  isElectron: boolean
  isDev?: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

/**
 * Electron platform implementation.
 * In dev mode: Uses same origin (Vite middleware handles API routes)
 * In production: Uses localhost:3001 (separate API server started by main process)
 */
export class ElectronPlatform extends HttpPlatform {
  constructor() {
    // In production, the API server runs on port 3001
    // In dev, Vite middleware handles API routes on same origin
    const isDev = window.electronAPI?.isDev ?? false
    const apiBaseUrl = isDev ? '' : 'http://localhost:3001'
    super('electron', apiBaseUrl)
  }
}
