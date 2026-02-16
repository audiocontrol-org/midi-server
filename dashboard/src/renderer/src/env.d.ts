/// <reference types="vite/client" />

import type { BuildInfo } from '@shared/types/log-entry'

declare global {
  const __BUILD_INFO__: BuildInfo
}
