import { useState, useEffect, useCallback, useRef } from 'react'
import { useServerConnection } from '@/hooks/useServerConnection'
import { usePlatform } from '@/hooks/usePlatform'
import { ServerControl } from '@/components/ServerControl'
import { PortList, generatePortId } from '@/components/PortList'
import { PortDetail } from '@/components/PortDetail'
import { BuildInfoButton } from '@/components/BuildInfoButton'
import { BuildInfoModal } from '@/components/BuildInfoModal'
import { createClient } from '@/api/client'
import type { MidiPort, MidiMessage, OpenPort } from '@/types/api'
import type { ServerProcess, BuildInfo } from '@/platform'

export function Dashboard(): React.JSX.Element {
  const platform = usePlatform()
  const { status, ports, connect, disconnect, refresh } = useServerConnection({ autoConnect: false })
  const [serverProcess, setServerProcess] = useState<ServerProcess | null>(null)
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Open ports state
  const [openPorts, setOpenPorts] = useState<Map<string, OpenPort>>(new Map())
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const clientRef = useRef(createClient())

  // Fetch build info on mount
  useEffect(() => {
    platform.getBuildInfo().then(setBuildInfo).catch(console.error)
  }, [platform])

  // Poll server process status
  useEffect(() => {
    if (!platform.canManageServer) return

    const checkStatus = async (): Promise<void> => {
      try {
        const processStatus = await platform.getServerStatus()
        setServerProcess(processStatus)

        // Auto-connect when server starts
        if (processStatus.running && !status.connected) {
          connect()
        }
      } catch (err) {
        console.error('Failed to get server status:', err)
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 2000)
    return () => clearInterval(interval)
  }, [platform, status.connected, connect])

  const handleStartServer = useCallback(
    async (port: number) => {
      try {
        const process = await platform.startServer(port)
        setServerProcess(process)
        connect()
      } catch (err) {
        console.error('Failed to start server:', err)
      }
    },
    [platform, connect]
  )

  const handleStopServer = useCallback(async () => {
    try {
      await platform.stopServer()
      setServerProcess({ running: false, pid: null, port: null, url: null })
      disconnect()
      // Clear all open ports when server stops
      setOpenPorts(new Map())
      setSelectedPortId(null)
    } catch (err) {
      console.error('Failed to stop server:', err)
    }
  }, [platform, disconnect])

  const handlePortClick = useCallback(
    async (port: MidiPort) => {
      const portId = generatePortId(port)

      if (openPorts.has(portId)) {
        // Port is open, just select it
        setSelectedPortId(portId)
        return
      }

      // Open the port
      try {
        await clientRef.current.openPort(portId, port.name, port.type)
        const newPort: OpenPort = {
          portId,
          name: port.name,
          type: port.type,
          messages: []
        }
        setOpenPorts((prev) => new Map(prev).set(portId, newPort))
        setSelectedPortId(portId)
      } catch (err) {
        console.error('Failed to open port:', err)
      }
    },
    [openPorts]
  )

  const handleClosePort = useCallback(async () => {
    if (!selectedPortId) return

    try {
      await clientRef.current.closePort(selectedPortId)
      setOpenPorts((prev) => {
        const next = new Map(prev)
        next.delete(selectedPortId)
        return next
      })
      setSelectedPortId(null)
    } catch (err) {
      console.error('Failed to close port:', err)
    }
  }, [selectedPortId])

  const handleMessagesReceived = useCallback(
    (messages: MidiMessage[]) => {
      if (!selectedPortId) return

      setOpenPorts((prev) => {
        const port = prev.get(selectedPortId)
        if (!port) return prev

        const next = new Map(prev)
        next.set(selectedPortId, {
          ...port,
          messages: [...port.messages, ...messages].slice(-100) // Keep last 100 messages
        })
        return next
      })
    },
    [selectedPortId]
  )

  const selectedPort = selectedPortId ? openPorts.get(selectedPortId) : null
  const openPortIds = new Set(openPorts.keys())

  return (
    <div className="min-h-screen p-6">
      {buildInfo && (
        <>
          <BuildInfoButton serial={buildInfo.serial} onClick={() => setIsModalOpen(true)} />
          <BuildInfoModal
            buildInfo={buildInfo}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />
        </>
      )}
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">MIDI Server Dashboard</h1>
          <p className="text-gray-400 mt-2">
            {platform.canManageServer
              ? 'Control and monitor your local MIDI HTTP Server'
              : 'Connect to a remote MIDI HTTP Server'}
          </p>
          <p className="text-xs text-gray-600 mt-1">Running in {platform.name} mode</p>
        </header>

        <ServerControl
          connectionStatus={status}
          serverProcess={serverProcess}
          canManageServer={platform.canManageServer}
          onConnect={connect}
          onDisconnect={disconnect}
          onRefresh={refresh}
          onStartServer={handleStartServer}
          onStopServer={handleStopServer}
        />

        {status.connected && ports && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid md:grid-cols-2 gap-6">
              <PortList
                title="MIDI Inputs"
                ports={ports.inputs}
                openPortIds={openPortIds}
                selectedPortId={selectedPortId}
                onPortClick={handlePortClick}
              />
              <PortList
                title="MIDI Outputs"
                ports={ports.outputs}
                openPortIds={openPortIds}
                selectedPortId={selectedPortId}
                onPortClick={handlePortClick}
              />
            </div>

            <div>
              {selectedPort ? (
                <PortDetail
                  port={selectedPort}
                  onClose={handleClosePort}
                  onMessagesReceived={handleMessagesReceived}
                />
              ) : (
                <div className="bg-gray-800 rounded-lg p-4 h-full flex items-center justify-center">
                  <p className="text-gray-500 text-center">
                    Click a port to open it and view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {!status.connected && !status.error && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {platform.canManageServer
                ? 'Start the server or connect to see available MIDI ports'
                : 'Connect to a MIDI HTTP Server to see available ports'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
