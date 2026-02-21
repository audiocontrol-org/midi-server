import { useState, useEffect } from 'react'
import type { DiscoveredServer, RouteEndpoint, VirtualPortConfig } from '@/api/client'
import type { MidiPort } from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'

interface ServerPorts {
  serverUrl: string
  ports: { inputs: MidiPort[]; outputs: MidiPort[] } | null
  loading: boolean
  error: string | null
}

interface AddRouteModalProps {
  isOpen: boolean
  servers: DiscoveredServer[]
  virtualPorts: VirtualPortConfig[]
  onClose: () => void
  onSave: (source: RouteEndpoint, destination: RouteEndpoint, sourceServerApiUrl: string) => void
  fetchServerPorts: (serverUrl: string) => Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }>
}

export function AddRouteModal({
  isOpen,
  servers,
  virtualPorts,
  onClose,
  onSave,
  fetchServerPorts
}: AddRouteModalProps): React.JSX.Element | null {
  const platform = usePlatform()
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
        platform.addLog(`[AddRouteModal] Failed to fetch ports for ${serverUrl}: ${error}`, 'error')
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

  // Convert virtual port to MidiPort format
  const virtualToMidiPort = (vp: VirtualPortConfig): MidiPort => ({
    id: vp.id,
    name: vp.name,
    type: vp.type,
    isVirtual: true
  })

  const getSourcePorts = (): MidiPort[] => {
    const state = serverPorts.get(sourceServer)
    const physicalPorts = state?.ports?.inputs ?? []

    // Add virtual input ports for local server
    const server = servers.find((s) => s.apiUrl === sourceServer)
    if (server?.isLocal) {
      const virtualInputs = virtualPorts.filter((vp) => vp.type === 'input').map(virtualToMidiPort)
      // Virtual output ports (CoreMIDI Sources) appear in the system MIDI input list —
      // filter them out by name to avoid showing the same port twice.
      const virtualNames = new Set(virtualPorts.map((vp) => vp.name))
      const truePhysical = physicalPorts.filter((p) => !virtualNames.has(p.name))
      return [...truePhysical, ...virtualInputs]
    }

    return physicalPorts
  }

  const getDestPorts = (): MidiPort[] => {
    const state = serverPorts.get(destServer)
    const physicalPorts = state?.ports?.outputs ?? []

    // Add virtual output ports for local server
    const server = servers.find((s) => s.apiUrl === destServer)
    if (server?.isLocal) {
      const virtualOutputs = virtualPorts.filter((vp) => vp.type === 'output').map(virtualToMidiPort)
      // Virtual input ports (CoreMIDI Destinations) appear in the system MIDI output list —
      // filter them out by name to avoid showing the same port twice.
      const virtualNames = new Set(virtualPorts.map((vp) => vp.name))
      const truePhysical = physicalPorts.filter((p) => !virtualNames.has(p.name))
      return [...truePhysical, ...virtualOutputs]
    }

    return physicalPorts
  }

  const generatePortId = (port: MidiPort): string => {
    // Virtual ports use "virtual:{id}" format
    if (port.isVirtual) {
      return `virtual:${port.id}`
    }
    return `${port.type}-${port.id}`
  }

  // Convert API URL to MIDI server URL for routing
  const getMidiServerUrl = (server: DiscoveredServer | undefined): string => {
    if (!server || server.isLocal) return 'local'
    // Extract host from API URL and use MIDI server port
    try {
      const url = new URL(server.apiUrl)
      return `http://${url.hostname}:${server.midiServerPort}`
    } catch {
      return server.apiUrl
    }
  }

  const handleSave = (): void => {
    const sourcePorts = getSourcePorts()
    const destPorts = getDestPorts()

    const selectedSourcePort = sourcePorts.find((p) => generatePortId(p) === sourcePort)
    const selectedDestPort = destPorts.find((p) => generatePortId(p) === destPort)
    const selectedSourceServer = servers.find((s) => s.apiUrl === sourceServer)
    const selectedDestServer = servers.find((s) => s.apiUrl === destServer)

    if (!selectedSourcePort || !selectedDestPort) return

    // Use MIDI server URL (not API URL) for routing - C++ RouteManager needs direct access
    const source: RouteEndpoint = {
      serverUrl: getMidiServerUrl(selectedSourceServer),
      portId: sourcePort,
      portName: selectedSourcePort.name
    }

    const destination: RouteEndpoint = {
      serverUrl: getMidiServerUrl(selectedDestServer),
      portId: destPort,
      portName: selectedDestPort.name
    }

    // Pass the source server's API URL so the route can be created on that server
    onSave(source, destination, sourceServer)
  }

  const isValid = Boolean(sourceServer && sourcePort && destServer && destPort)

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
                {port.isVirtual ? `[Virtual] ${port.name}` : port.name}
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
                {port.isVirtual ? `[Virtual] ${port.name}` : port.name}
              </option>
            ))}
          </select>
        </div>

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
