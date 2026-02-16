import { useState, useEffect, useRef, useCallback } from 'react'
import type { OpenPort, MidiMessage } from '@/types/api'
import { createClient } from '@/api/client'

interface PortDetailProps {
  port: OpenPort
  onClose: () => void
  onMessagesReceived: (messages: MidiMessage[]) => void
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function formatMidiMessage(data: number[]): string {
  if (data.length === 0) return '(empty)'

  const status = data[0]
  const channel = (status & 0x0f) + 1
  const type = status & 0xf0

  if (status === 0xf0) {
    return `SysEx [${data.length} bytes]`
  }

  switch (type) {
    case 0x80: {
      const note = data[1]
      const velocity = data[2]
      const noteName = NOTE_NAMES[note % 12] + Math.floor(note / 12 - 1)
      return `Note Off ch${channel} ${noteName} vel=${velocity}`
    }
    case 0x90: {
      const note = data[1]
      const velocity = data[2]
      const noteName = NOTE_NAMES[note % 12] + Math.floor(note / 12 - 1)
      return velocity > 0
        ? `Note On ch${channel} ${noteName} vel=${velocity}`
        : `Note Off ch${channel} ${noteName}`
    }
    case 0xa0:
      return `Aftertouch ch${channel} note=${data[1]} pressure=${data[2]}`
    case 0xb0:
      return `CC ch${channel} cc${data[1]}=${data[2]}`
    case 0xc0:
      return `Program ch${channel} prog=${data[1]}`
    case 0xd0:
      return `Ch Pressure ch${channel} pressure=${data[1]}`
    case 0xe0: {
      const bend = data[1] | (data[2] << 7)
      return `Pitch Bend ch${channel} value=${bend - 8192}`
    }
    default:
      return `[${data.map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`
  }
}

export function PortDetail({ port, onClose, onMessagesReceived }: PortDetailProps): React.JSX.Element {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef(createClient())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Poll for messages on input ports
  useEffect(() => {
    if (port.type !== 'input') return

    const pollMessages = async (): Promise<void> => {
      try {
        const response = await clientRef.current.getMessages(port.portId)
        if (response.messages.length > 0) {
          onMessagesReceived(response.messages)
        }
      } catch (err) {
        console.error('Failed to poll messages:', err)
      }
    }

    const interval = setInterval(pollMessages, 100) // Poll every 100ms
    return () => clearInterval(interval)
  }, [port.portId, port.type, onMessagesReceived])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [port.messages])

  const sendNote = useCallback(
    async (note: number, velocity: number) => {
      setSending(true)
      setError(null)
      try {
        // Note On
        await clientRef.current.sendMessage(port.portId, [0x90, note, velocity])
        // Note Off after 200ms
        setTimeout(async () => {
          try {
            await clientRef.current.sendMessage(port.portId, [0x80, note, 0])
          } catch {
            // Ignore note off errors
          }
        }, 200)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send')
      } finally {
        setSending(false)
      }
    },
    [port.portId]
  )

  const sendCC = useCallback(
    async (cc: number, value: number) => {
      setSending(true)
      setError(null)
      try {
        await clientRef.current.sendMessage(port.portId, [0xb0, cc, value])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send')
      } finally {
        setSending(false)
      }
    },
    [port.portId]
  )

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{port.name}</h3>
          <p className="text-sm text-gray-400">
            {port.type === 'input' ? 'Input' : 'Output'} • ID: {port.portId}
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          Close Port
        </button>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-900/50 border border-red-600 rounded text-sm text-red-200">
          {error}
        </div>
      )}

      {port.type === 'output' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-300">Send Test Notes</h4>
            <div className="flex flex-wrap gap-2">
              {[60, 62, 64, 65, 67, 69, 71, 72].map((note) => (
                <button
                  key={note}
                  onClick={() => sendNote(note, 100)}
                  disabled={sending}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-mono"
                >
                  {NOTE_NAMES[note % 12]}
                  {Math.floor(note / 12 - 1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2 text-gray-300">Send CC</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => sendCC(1, 127)}
                disabled={sending}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
              >
                Mod Wheel Max
              </button>
              <button
                onClick={() => sendCC(1, 0)}
                disabled={sending}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
              >
                Mod Wheel Off
              </button>
              <button
                onClick={() => sendCC(64, 127)}
                disabled={sending}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
              >
                Sustain On
              </button>
              <button
                onClick={() => sendCC(64, 0)}
                disabled={sending}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
              >
                Sustain Off
              </button>
            </div>
          </div>
        </div>
      )}

      {port.type === 'input' && (
        <div>
          <h4 className="text-sm font-medium mb-2 text-gray-300">
            Incoming Messages ({port.messages.length})
          </h4>
          <div className="bg-gray-900 rounded p-2 h-48 overflow-y-auto font-mono text-xs">
            {port.messages.length === 0 ? (
              <p className="text-gray-500">Waiting for MIDI messages...</p>
            ) : (
              port.messages.map((msg, i) => (
                <div key={i} className="py-0.5 text-gray-300">
                  <span className="text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>{' '}
                  {formatMidiMessage(msg.data)}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
