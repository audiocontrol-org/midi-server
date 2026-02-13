import { platform, isElectron } from '@/platform'
import type { PlatformServices } from '@/platform'

export function usePlatform(): PlatformServices {
  return platform
}

export { isElectron }
