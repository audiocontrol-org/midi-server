import { useState, useEffect } from 'react'
import type { DiscoveredServer, RouteEndpoint } from '@/api/client'
import type { MidiPort } from '@/types/api'

interface ServerPorts {
  serverUrl: string
  ports: { inputs: MidiPort[]; outputs: MidiPort[] } | null
  loading: boolean
  error: string | null
}

interface AddRouteModalProps {
  isOpen: boolean
  servers: DiscoveredServer[]
  onClose: () => void
  onSave: (source: RouteEndpoint, destination: RouteEndpoint) => void
  fetchServerPorts: (serverUrl: string) => Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }>
}

export function AddRouteModal({
  isOpen,
  servers,
  onClose,
  onSave,
  fetchServerPorts
}: AddRouteModalProps): React.JSX.Element | null {
  const [sourceServer, setSourceServer] = useState<string>('')
  const [sourcePort, setSourcePort] = useState<string>('')
  const [destServer, setDestServer] = useState<string>('')
  const [destPort, setDestPort] = useState<string>('')

  const [serverPorts, setServerPorts] = useState<Map<string, ServerPorts>>(new Map())

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSourceServer('')
      setSourcePort('')
      setDestServer('')
      setDestPort('')
      setServerPorts(new Map())
    }
  }, [isOpen])

  // Fetch ports when a server is selected
  useEffect(() => {
    const loadPorts = async (serverUrl: string): Promise<void> => {
      if (!serverUrl || serverPorts.has(serverUrl)) return

      setServerPorts((prev) => {
        const next = new Map(prev)
        next.set(serverUrl, { serverUrl, ports: null, loading: true, error: null })
        return next
      })

      try {
        const ports = await fetchServerPorts(serverUrl)
        setServerPorts((prev) => {
          const next = new Map(prev)
          next.set(serverUrl, { serverUrl, ports, loading: false, error: null })
          return next
        })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        setServerPorts((prev) => {
          const next = new Map(prev)
          next.set(serverUrl, { serverUrl, ports: null, loading: false, error })
          return next
        })
      }
    }

    if (sourceServer) loadPorts(sourceServer)
    if (destServer) loadPorts(destServer)
  }, [sourceServer, destServer, serverPorts, fetchServerPorts])

  if (!isOpen) return null

  const getServerName = (serverUrl: string): string => {
    const server = servers.find((s) => s.apiUrl === serverUrl)
    if (server?.isLocal) return 'Local'
    return server?.serverName ?? serverUrl
  }

  const getSourcePorts = (): MidiPort[] => {
    const state = serverPorts.get(sourceServer)
    return state?.ports?.inputs ?? []
  }

  const getDestPorts = (): MidiPort[] => {
    const state = serverPorts.get(destServer)
    return state?.ports?.outputs ?? []
  }

  const generatePortId = (port: MidiPort): string => {
    return `${port.type}-${port.id}`
  }

  const handleSave = (): void => {
    const sourcePorts = getSourcePorts()
    const destPorts = getDestPorts()

    const selectedSourcePort = sourcePorts.find((p) => generatePortId(p) === sourcePort)
    const selectedDestPort = destPorts.find((p) => generatePortId(p) === destPort)

    if (!selectedSourcePort || !selectedDestPort) return

    const source: RouteEndpoint = {
      serverUrl: sourceServer,
      portId: sourcePort,
      portName: selectedSourcePort.name
    }

    const destination: RouteEndpoint = {
      serverUrl: destServer,
      portId: destPort,
      portName: selectedDestPort.name
    }

    onSave(source, destination)
  }

  const isValid =
    sourceServer && sourcePort && destServer && destPort && sourceServer !== destServer

  const sortedServers = [...servers].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1
    return a.serverName.localeCompare(b.serverName)
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold text-white mb-4">Add MIDI Route</h2>

        {/* Source server */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Source Server</label>
          <select
            value={sourceServer}
            onChange={(e) => {
              setSourceServer(e.target.value)
              setSourcePort('')
            }}
            className="w-full bg-gray-700 text-white rounded px-3 py-2"
          >
            <option value="">Select server...</option>
            {sortedServers.map((server) => (
              <option key={server.apiUrl} value={server.apiUrl}>
                {getServerName(server.apiUrl)}
              </option>
            ))}
          </select>
        </div>

        {/* Source input port */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Source Input Port</label>
          <select
            value={sourcePort}
            onChange={(e) => setSourcePort(e.target.value)}
            disabled={!sourceServer || serverPorts.get(sourceServer)?.loading}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
          >
            <option value="">
              {serverPorts.get(sourceServer)?.loading
                ? 'Loading ports...'
                : serverPorts.get(sourceServer)?.error
                  ? `Error: ${serverPorts.get(sourceServer)?.error}`
                  : 'Select input port...'}
            </option>
            {getSourcePorts().map((port) => (
              <option key={generatePortId(port)} value={generatePortId(port)}>
                {port.name}
              </option>
            ))}
          </select>
        </div>

        {/* Destination server */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Destination Server</label>
          <select
            value={destServer}
            onChange={(e) => {
              setDestServer(e.target.value)
              setDestPort('')
            }}
            className="w-full bg-gray-700 text-white rounded px-3 py-2"
          >
            <option value="">Select server...</option>
            {sortedServers.map((server) => (
              <option key={server.apiUrl} value={server.apiUrl}>
                {getServerName(server.apiUrl)}
              </option>
            ))}
          </select>
        </div>

        {/* Destination output port */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Destination Output Port</label>
          <select
            value={destPort}
            onChange={(e) => setDestPort(e.target.value)}
            disabled={!destServer || serverPorts.get(destServer)?.loading}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
          >
            <option value="">
              {serverPorts.get(destServer)?.loading
                ? 'Loading ports...'
                : serverPorts.get(destServer)?.error
                  ? `Error: ${serverPorts.get(destServer)?.error}`
                  : 'Select output port...'}
            </option>
            {getDestPorts().map((port) => (
              <option key={generatePortId(port)} value={generatePortId(port)}>
                {port.name}
              </option>
            ))}
          </select>
        </div>

        {/* Same server warning */}
        {sourceServer && destServer && sourceServer === destServer && (
          <p className="text-yellow-500 text-sm mb-4">
            Source and destination must be different servers
          </p>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add Route
          </button>
        </div>
      </div>
    </div>
  )
}
