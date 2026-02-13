import type { PlatformServices } from './types'
import { ElectronPlatform } from './electron'
import { WebPlatform } from './web'

export type { PlatformServices, ServerProcess, LogEntry, LogSeverity, BuildInfo } from './types'

/**
 * Detect if running in Electron environment
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI !== undefined
}

/**
 * Create the appropriate platform services instance
 */
function createPlatform(): PlatformServices {
  if (isElectron()) {
    return new ElectronPlatform()
  }
  return new WebPlatform()
}

/**
 * Singleton platform services instance
 */
export const platform: PlatformServices = createPlatform()
