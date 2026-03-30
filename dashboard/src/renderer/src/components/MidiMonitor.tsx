/**
 * MidiMonitor component.
 *
 * Displays a unified, real-time stream of MIDI messages from multiple
 * input ports. Supports filtering by message type and port, auto-scrolling,
 * and per-port connection status indicators.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMidiMessages, midiMessageStore } from '@/stores/midi-message-store'
import type { StoredMidiMessage } from '@/stores/midi-message-store'
import { useMidiStream } from '@/hooks/useMidiStream'
import type { PortSubscription, PortConnectionStatus } from '@/hooks/useMidiStream'
import {
  formatMidiMessage,
  formatTimestamp,
  classifyMidiMessage,
  type MidiMessageType
} from '@/utils/midi-format'
import type { MidiPort } from '@/types/api'

interface MidiMonitorProps {
  /** All available input ports (physical + virtual) */
  inputPorts: ReadonlyArray<MidiPort>
}

const MESSAGE_TYPE_LABELS: ReadonlyArray<{ value: MidiMessageType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Note' },
  { value: 'cc', label: 'CC' },
  { value: 'sysex', label: 'SysEx' },
  { value: 'system', label: 'System' },
  { value: 'other', label: 'Other' }
]

/**
 * Deterministic color assignment for port labels based on port index.
 */
const PORT_COLORS = [
  'text-blue-400',
  'text-green-400',
  'text-yellow-400',
  'text-purple-400',
  'text-pink-400',
  'text-cyan-400',
  'text-orange-400',
  'text-red-400'
]

function getPortColor(index: number): string {
  return PORT_COLORS[index % PORT_COLORS.length]
}

function statusDotClass(status: PortConnectionStatus | undefined): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500'
    case 'connecting':
      return 'bg-yellow-500 animate-pulse'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

/**
 * Build a stable portId string that matches what the SSE endpoint expects.
 * Physical ports use numeric IDs; virtual ports use "virtual:<id>".
 */
function buildPortId(port: MidiPort): string {
  if (port.isVirtual) {
    const raw = String(port.id)
    return raw.startsWith('virtual:') ? raw : `virtual:${raw}`
  }
  return String(port.id)
}

export function MidiMonitor({ inputPorts }: MidiMonitorProps): React.JSX.Element {
  // Track which ports the user has selected for monitoring
  const [selectedPortIds, setSelectedPortIds] = useState<ReadonlySet<string>>(() => new Set())
  const [typeFilter, setTypeFilter] = useState<MidiMessageType>('all')
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollBottomRef = useRef<HTMLDivElement>(null)

  // Build SSE subscriptions for selected ports
  const subscriptions: ReadonlyArray<PortSubscription> = useMemo(() => {
    return inputPorts
      .filter((port) => selectedPortIds.has(buildPortId(port)))
      .map((port) => ({
        portId: buildPortId(port),
        portName: port.name
      }))
  }, [inputPorts, selectedPortIds])

  const { getPortStatus } = useMidiStream(subscriptions)

  // All messages from the centralized store
  const allMessages = useMidiMessages()

  // Build a portId->index map for color assignment (stable ordering from inputPorts)
  const portColorMap = useMemo(() => {
    const map = new Map<string, number>()
    inputPorts.forEach((port, index) => {
      map.set(buildPortId(port), index)
    })
    return map
  }, [inputPorts])

  // Filter messages to only selected ports and matching type
  const filteredMessages: ReadonlyArray<StoredMidiMessage> = useMemo(() => {
    return allMessages.filter((msg) => {
      if (!selectedPortIds.has(msg.portId)) return false
      if (typeFilter === 'all') return true
      return classifyMidiMessage(msg.data) === typeFilter
    })
  }, [allMessages, selectedPortIds, typeFilter])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollBottomRef.current) {
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredMessages, autoScroll])

  // Detect when user scrolls away from the bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40
    setAutoScroll(isAtBottom)
  }, [])

  const togglePort = useCallback((portId: string) => {
    setSelectedPortIds((prev) => {
      const next = new Set(prev)
      if (next.has(portId)) {
        next.delete(portId)
      } else {
        next.add(portId)
      }
      return next
    })
  }, [])

  const selectAllPorts = useCallback(() => {
    setSelectedPortIds(new Set(inputPorts.map((p) => buildPortId(p))))
  }, [inputPorts])

  const deselectAllPorts = useCallback(() => {
    setSelectedPortIds(new Set())
  }, [])

  const handleClear = useCallback(() => {
    midiMessageStore.clear()
  }, [])

  const allSelected = inputPorts.length > 0 && selectedPortIds.size === inputPorts.length

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Port selector */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-medium text-gray-300">Input Ports</h4>
            <button
              onClick={allSelected ? deselectAllPorts : selectAllPorts}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {inputPorts.length === 0 ? (
            <p className="text-xs text-gray-500">No input ports available</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {inputPorts.map((port) => {
                const portId = buildPortId(port)
                const isSelected = selectedPortIds.has(portId)
                const colorIndex = portColorMap.get(portId) ?? 0
                const status = getPortStatus(portId)

                return (
                  <button
                    key={portId}
                    onClick={() => togglePort(portId)}
                    className={`
                      flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono
                      border transition-colors
                      ${
                        isSelected
                          ? 'border-gray-500 bg-gray-700 text-gray-200'
                          : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600'
                      }
                    `}
                  >
                    {isSelected && (
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${statusDotClass(status)}`}
                      />
                    )}
                    <span className={isSelected ? getPortColor(colorIndex) : ''}>{port.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Type filter */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">Message Type</h4>
          <div className="flex flex-wrap gap-1">
            {MESSAGE_TYPE_LABELS.map((item) => (
              <button
                key={item.value}
                onClick={() => setTypeFilter(item.value)}
                className={`
                  px-2 py-1 rounded text-xs transition-colors
                  ${
                    typeFilter === item.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleClear}
            className="px-3 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Clear
          </button>
          <span className="text-xs text-gray-500">
            {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Message stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-700 overflow-y-auto font-mono text-xs"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">
              {selectedPortIds.size === 0
                ? 'Select one or more input ports to begin monitoring'
                : 'Waiting for MIDI messages...'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
              <tr className="text-gray-500 text-left">
                <th className="px-3 py-1.5 w-28">Time</th>
                <th className="px-3 py-1.5 w-48">Port</th>
                <th className="px-3 py-1.5">Message</th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.map((msg, index) => {
                const colorIndex = portColorMap.get(msg.portId) ?? 0
                return (
                  <tr
                    key={`${msg.portId}-${msg.timestamp}-${index}`}
                    className="border-b border-gray-800 hover:bg-gray-800/50"
                  >
                    <td className="px-3 py-1 text-gray-500 whitespace-nowrap">
                      {formatTimestamp(msg.timestamp)}
                    </td>
                    <td
                      className={`px-3 py-1 whitespace-nowrap truncate max-w-[12rem] ${getPortColor(colorIndex)}`}
                      title={msg.portName}
                    >
                      {msg.portName}
                    </td>
                    <td className="px-3 py-1 text-gray-300">{formatMidiMessage(msg.data)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div ref={scrollBottomRef} />
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && filteredMessages.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true)
            scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="fixed bottom-6 right-6 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-full shadow-lg transition-colors"
        >
          Scroll to latest
        </button>
      )}
    </div>
  )
}
