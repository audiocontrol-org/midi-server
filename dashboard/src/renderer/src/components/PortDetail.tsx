import { useState, useEffect, useRef, useCallback } from 'react'
import type { OpenPort, MidiMessage } from '@/types/api'
import { createClient } from '@/api/client'
import { useMidiStream } from '@/hooks/useMidiStream'
import { usePortMidiMessages } from '@/stores/midi-message-store'
import { formatMidiMessage, NOTE_NAMES } from '@/utils/midi-format'

interface PortDetailProps {
  port: OpenPort
  onClose: () => void
  onMessagesReceived: (messages: MidiMessage[]) => void
}

export function PortDetail({
  port,
  onClose,
  onMessagesReceived
}: PortDetailProps): React.JSX.Element {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef(createClient())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check if this is a virtual port (portId starts with "virtual:")
  const isVirtual = port.portId.startsWith('virtual:')
  const virtualPortId = isVirtual ? port.portId.replace('virtual:', '') : null

  // For real input ports: subscribe to SSE stream
  const isRealInput = port.type === 'input' && !isVirtual
  const sseSubscriptions = isRealInput
    ? [{ portId: port.portId, portName: port.name }]
    : []
  const { getPortStatus } = useMidiStream(sseSubscriptions)
  const sseStatus = isRealInput ? getPortStatus(port.portId) : undefined

  // Read messages from the centralized store for real input ports
  const storeMessages = usePortMidiMessages(port.portId)

  // For virtual input ports: keep polling
  useEffect(() => {
    if (port.type !== 'input' || !isVirtual || !virtualPortId) return

    const pollMessages = async (): Promise<void> => {
      try {
        const response = await clientRef.current.getVirtualMessages(virtualPortId)
        if (response.messages.length > 0) {
          onMessagesReceived(response.messages)
        }
      } catch (err) {
        console.error('Failed to poll messages:', err)
      }
    }

    const interval = setInterval(pollMessages, 100)
    return () => clearInterval(interval)
  }, [port.portId, port.type, onMessagesReceived, isVirtual, virtualPortId])

  // Determine which messages to display
  const displayMessages: ReadonlyArray<{ data: number[]; timestamp: number }> = isRealInput
    ? storeMessages
    : port.messages

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  const sendMessage = useCallback(
    async (message: number[]) => {
      if (isVirtual && virtualPortId) {
        return clientRef.current.sendVirtualMessage(virtualPortId, message)
      }
      return clientRef.current.sendMessage(port.portId, message)
    },
    [port.portId, isVirtual, virtualPortId]
  )

  const sendNote = useCallback(
    async (note: number, velocity: number) => {
      setSending(true)
      setError(null)
      try {
        // Note On
        await sendMessage([0x90, note, velocity])
        // Note Off after 200ms
        setTimeout(async () => {
          try {
            await sendMessage([0x80, note, 0])
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
    [sendMessage]
  )

  const sendCC = useCallback(
    async (cc: number, value: number) => {
      setSending(true)
      setError(null)
      try {
        await sendMessage([0xb0, cc, value])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send')
      } finally {
        setSending(false)
      }
    },
    [sendMessage]
  )

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{port.name}</h3>
          <p className="text-sm text-gray-400">
            {isVirtual && <span className="text-purple-400">Virtual </span>}
            {port.type === 'input' ? 'Input' : 'Output'} • ID: {port.portId}
          </p>
        </div>
        <button onClick={onClose} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm">
          {isVirtual ? 'Deselect' : 'Close Port'}
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
            Incoming Messages ({displayMessages.length})
            {isRealInput && sseStatus && (
              <span className={`ml-2 text-xs ${
                sseStatus === 'connected' ? 'text-green-400' :
                sseStatus === 'connecting' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {sseStatus === 'connected' ? '(streaming)' :
                 sseStatus === 'connecting' ? '(connecting...)' :
                 '(connection error)'}
              </span>
            )}
          </h4>
          <div className="bg-gray-900 rounded p-2 h-48 overflow-y-auto font-mono text-xs">
            {displayMessages.length === 0 ? (
              <p className="text-gray-500">Waiting for MIDI messages...</p>
            ) : (
              displayMessages.map((msg, i) => (
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
