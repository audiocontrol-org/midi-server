import { useState, useEffect, useRef, useCallback } from 'react'
import { platform } from '@/platform'
import { midiMessageStore } from '@/stores/midi-message-store'

export type PortConnectionStatus = 'connecting' | 'connected' | 'error'

export interface PortSubscription {
  portId: string
  portName: string
}

export interface UseMidiStreamResult {
  connectionStatuses: ReadonlyMap<string, PortConnectionStatus>
  getPortStatus: (portId: string) => PortConnectionStatus | undefined
}

interface MidiEventData {
  bytes: number[]
  timestamp: number
}

function parseMidiEventData(raw: string): MidiEventData {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('bytes' in parsed) ||
    !('timestamp' in parsed)
  ) {
    throw new Error(`Invalid MIDI event data: missing 'bytes' or 'timestamp' fields`)
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.bytes)) {
    throw new Error(`Invalid MIDI event data: 'bytes' is not an array`)
  }

  if (typeof obj.timestamp !== 'number') {
    throw new Error(`Invalid MIDI event data: 'timestamp' is not a number`)
  }

  return {
    bytes: obj.bytes as number[],
    timestamp: obj.timestamp as number,
  }
}

/**
 * Creates a stable string key from the subscriptions array for use in
 * dependency comparisons. Sorted to ensure order-independence.
 */
function subscriptionsKey(subscriptions: ReadonlyArray<PortSubscription>): string {
  return subscriptions
    .map((s) => `${s.portId}:${s.portName}`)
    .sort()
    .join('|')
}

/**
 * React hook that opens EventSource connections to the SSE proxy for each
 * subscribed MIDI port and pushes incoming messages into the centralized
 * midi-message-store.
 *
 * Connections are automatically cleaned up on unmount or when the
 * subscriptions list changes.
 */
export function useMidiStream(
  subscriptions: ReadonlyArray<PortSubscription>
): UseMidiStreamResult {
  const [statusMap, setStatusMap] = useState<ReadonlyMap<string, PortConnectionStatus>>(
    () => new Map()
  )

  // Use a ref for subscriptions to avoid stale closures in EventSource callbacks,
  // while still using the key for the effect dependency.
  const subscriptionsRef = useRef(subscriptions)
  subscriptionsRef.current = subscriptions

  const key = subscriptionsKey(subscriptions)

  useEffect(() => {
    const currentSubscriptions = subscriptionsRef.current
    if (currentSubscriptions.length === 0) {
      setStatusMap(new Map())
      return
    }

    const eventSources = new Map<string, EventSource>()
    const nextStatuses = new Map<string, PortConnectionStatus>()

    // Initialize all ports as 'connecting'
    for (const sub of currentSubscriptions) {
      nextStatuses.set(sub.portId, 'connecting')
    }
    setStatusMap(new Map(nextStatuses))

    function updateStatus(portId: string, status: PortConnectionStatus): void {
      setStatusMap((prev) => {
        const next = new Map(prev)
        next.set(portId, status)
        return next
      })
    }

    for (const sub of currentSubscriptions) {
      const url = `${platform.apiBaseUrl}/api/port/${sub.portId}/events`
      const es = new EventSource(url)
      eventSources.set(sub.portId, es)

      es.addEventListener('midi', (event: MessageEvent<string>) => {
        try {
          const data = parseMidiEventData(event.data)
          midiMessageStore.addMessage(sub.portId, sub.portName, data.bytes, data.timestamp)
        } catch (err) {
          console.error(`[useMidiStream] Failed to parse MIDI event for port ${sub.portId}:`, err)
        }
      })

      es.onopen = (): void => {
        updateStatus(sub.portId, 'connected')
      }

      es.onerror = (): void => {
        // EventSource automatically reconnects on error. We mark the port
        // as 'error' so the UI can reflect the transient disconnection.
        // When the connection re-establishes, 'onopen' fires again.
        updateStatus(sub.portId, 'error')
      }
    }

    return (): void => {
      for (const es of eventSources.values()) {
        es.close()
      }
      eventSources.clear()
    }
  }, [key])

  const getPortStatus = useCallback(
    (portId: string): PortConnectionStatus | undefined => {
      return statusMap.get(portId)
    },
    [statusMap]
  )

  return {
    connectionStatuses: statusMap,
    getPortStatus,
  }
}
