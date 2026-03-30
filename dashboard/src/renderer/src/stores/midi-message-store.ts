/**
 * Centralized MIDI message store.
 * Messages are stored per-port in memory, independent of component lifecycle.
 * This ensures messages persist when switching tabs or closing/reopening port views.
 */

import { useSyncExternalStore, useCallback } from 'react'

export interface StoredMidiMessage {
  data: number[]
  timestamp: number
  portId: string
  portName: string
}

interface PortMessageBuffer {
  messages: StoredMidiMessage[]
  portName: string
}

type StoreListener = () => void

interface MidiMessageStoreConfig {
  maxHistoryPerPort: number
}

const DEFAULT_CONFIG: MidiMessageStoreConfig = {
  maxHistoryPerPort: 1000,
}

interface MidiMessageStore {
  addMessage(portId: string, portName: string, data: number[], timestamp: number): void
  addMessages(
    portId: string,
    portName: string,
    messages: ReadonlyArray<{ data: number[]; timestamp: number }>
  ): void
  getMessages(portId?: string): ReadonlyArray<StoredMidiMessage>
  clear(portId?: string): void
  subscribe(callback: StoreListener): () => void
  getSnapshot(): ReadonlyArray<StoredMidiMessage>
  getPortSnapshot(portId: string): ReadonlyArray<StoredMidiMessage>
}

export function createMidiMessageStore(
  config: Partial<MidiMessageStoreConfig> = {}
): MidiMessageStore {
  const resolvedConfig: MidiMessageStoreConfig = { ...DEFAULT_CONFIG, ...config }
  const portBuffers = new Map<string, PortMessageBuffer>()
  const listeners = new Set<StoreListener>()

  // Snapshot caches for useSyncExternalStore compatibility
  let allMessagesSnapshot: ReadonlyArray<StoredMidiMessage> = []
  const portSnapshots = new Map<string, ReadonlyArray<StoredMidiMessage>>()

  function notifyListeners(): void {
    // Invalidate the all-messages snapshot
    allMessagesSnapshot = buildAllMessagesSnapshot()
    // Invalidate per-port snapshots
    portSnapshots.clear()

    for (const listener of listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[MidiMessageStore] Listener error:', err)
      }
    }
  }

  function buildAllMessagesSnapshot(): ReadonlyArray<StoredMidiMessage> {
    const all: StoredMidiMessage[] = []
    for (const buffer of portBuffers.values()) {
      all.push(...buffer.messages)
    }
    all.sort((a, b) => a.timestamp - b.timestamp)
    return all
  }

  function getOrCreateBuffer(portId: string, portName: string): PortMessageBuffer {
    let buffer = portBuffers.get(portId)
    if (!buffer) {
      buffer = { messages: [], portName }
      portBuffers.set(portId, buffer)
    } else {
      // Update port name in case it changed
      buffer.portName = portName
    }
    return buffer
  }

  function pruneBuffer(buffer: PortMessageBuffer): void {
    if (buffer.messages.length > resolvedConfig.maxHistoryPerPort) {
      const excess = buffer.messages.length - resolvedConfig.maxHistoryPerPort
      buffer.messages.splice(0, excess)
    }
  }

  function addMessage(
    portId: string,
    portName: string,
    data: number[],
    timestamp: number
  ): void {
    const buffer = getOrCreateBuffer(portId, portName)
    buffer.messages.push({ data, timestamp, portId, portName })
    pruneBuffer(buffer)
    notifyListeners()
  }

  function addMessages(
    portId: string,
    portName: string,
    messages: ReadonlyArray<{ data: number[]; timestamp: number }>
  ): void {
    if (messages.length === 0) return

    const buffer = getOrCreateBuffer(portId, portName)
    for (const msg of messages) {
      buffer.messages.push({
        data: msg.data,
        timestamp: msg.timestamp,
        portId,
        portName,
      })
    }
    pruneBuffer(buffer)
    notifyListeners()
  }

  function getMessages(portId?: string): ReadonlyArray<StoredMidiMessage> {
    if (portId !== undefined) {
      const buffer = portBuffers.get(portId)
      if (!buffer) return []
      return [...buffer.messages]
    }
    return buildAllMessagesSnapshot()
  }

  function clear(portId?: string): void {
    if (portId !== undefined) {
      portBuffers.delete(portId)
    } else {
      portBuffers.clear()
    }
    notifyListeners()
  }

  function subscribe(callback: StoreListener): () => void {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }

  function getSnapshot(): ReadonlyArray<StoredMidiMessage> {
    return allMessagesSnapshot
  }

  function getPortSnapshot(portId: string): ReadonlyArray<StoredMidiMessage> {
    let snapshot = portSnapshots.get(portId)
    if (!snapshot) {
      const buffer = portBuffers.get(portId)
      snapshot = buffer ? [...buffer.messages] : []
      portSnapshots.set(portId, snapshot)
    }
    return snapshot
  }

  return {
    addMessage,
    addMessages,
    getMessages,
    clear,
    subscribe,
    getSnapshot,
    getPortSnapshot,
  }
}

// Singleton instance
export const midiMessageStore = createMidiMessageStore()

// React hook: subscribe to all messages
export function useMidiMessages(): ReadonlyArray<StoredMidiMessage> {
  return useSyncExternalStore(
    midiMessageStore.subscribe,
    midiMessageStore.getSnapshot
  )
}

// React hook: subscribe to messages for a specific port
export function usePortMidiMessages(portId: string): ReadonlyArray<StoredMidiMessage> {
  const subscribe = useCallback(
    (callback: () => void) => midiMessageStore.subscribe(callback),
    []
  )

  const getSnapshot = useCallback(
    () => midiMessageStore.getPortSnapshot(portId),
    [portId]
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}
