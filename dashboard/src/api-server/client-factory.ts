import type { MidiClient } from './midi-client'
import { getLocalClient, clearLocalClientCache } from './local-client'
import { getRemoteClient, clearClientCache as clearRemoteClientCache } from './remote-client'

export function getMidiClient(serverUrl: string, localMidiServerPort: number): MidiClient {
  if (serverUrl === 'local') {
    return getLocalClient(localMidiServerPort)
  }
  return getRemoteClient(serverUrl)
}

export function clearMidiClientCache(): void {
  clearLocalClientCache()
  clearRemoteClientCache()
}

