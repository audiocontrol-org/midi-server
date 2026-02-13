import { useState, useEffect, useCallback } from 'react'
import { useServerConnection } from '@/hooks/useServerConnection'
import { usePlatform } from '@/hooks/usePlatform'
import { ServerControl } from '@/components/ServerControl'
import { PortList } from '@/components/PortList'
import { BuildInfoButton } from '@/components/BuildInfoButton'
import { BuildInfoModal } from '@/components/BuildInfoModal'
import type { MidiPort } from '@/types/api'
import type { ServerProcess, BuildInfo } from '@/platform'

export function Dashboard(): React.JSX.Element {
  const platform = usePlatform()
  const { status, ports, connect, disconnect, refresh } = useServerConnection({ autoConnect: false })
  const [serverProcess, setServerProcess] = useState<ServerProcess | null>(null)
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Fetch build info on mount
  useEffect(() => {
    platform.getBuildInfo().then(setBuildInfo).catch(console.error)
  }, [platform])

  // Poll server process status in Electron mode
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
    } catch (err) {
      console.error('Failed to stop server:', err)
    }
  }, [platform, disconnect])

  const handlePortClick = (port: MidiPort): void => {
    console.log('Port clicked:', port)
    // TODO: Open port and show details/messages
  }

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
      <div className="max-w-4xl mx-auto space-y-6">
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
          <div className="grid md:grid-cols-2 gap-6">
            <PortList title="MIDI Inputs" ports={ports.inputs} onPortClick={handlePortClick} />
            <PortList title="MIDI Outputs" ports={ports.outputs} onPortClick={handlePortClick} />
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
