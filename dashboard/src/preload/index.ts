import { contextBridge } from 'electron'

// Minimal preload - just expose platform detection
// All actual functionality is now handled via HTTP to the API server
const electronAPI = {
  isElectron: true,
  isDev: process.env.NODE_ENV === 'development'
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electronAPI:', error)
  }
} else {
  // @ts-expect-error define in global
  window.electronAPI = electronAPI
}
