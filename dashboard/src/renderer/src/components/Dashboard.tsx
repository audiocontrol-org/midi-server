import { useState, useEffect, useCallback, useRef } from 'react'
import { useServerConnection } from '@/hooks/useServerConnection'
import { usePlatform } from '@/hooks/usePlatform'
import { useUpdateStatus } from '@/hooks/useUpdateStatus'
import { ServerControl } from '@/components/ServerControl'
import { RemoteServerControl } from '@/components/RemoteServerControl'
import { PortList, generatePortId } from '@/components/PortList'
import { PortDetail } from '@/components/PortDetail'
import { UpdateSettingsButton } from '@/components/UpdateSettingsButton'
import { UpdateSettingsModal } from '@/components/UpdateSettingsModal'
import { BuildInfoButton } from '@/components/BuildInfoButton'
import { BuildInfoModal } from '@/components/BuildInfoModal'
import { ServerTabs } from '@/components/ServerTabs'
import { RoutingPanel } from '@/components/RoutingPanel'
import { RouteGraph } from '@/components/RouteGraph'
import { AddRouteModal } from '@/components/AddRouteModal'
import { MainTabs } from '@/components/MainTabs'
import {
  createClient,
  createApiClient,
  type DiscoveredServer,
  type Route,
  type RouteEndpoint
} from '@/api/client'
import type { MidiPort, MidiMessage, OpenPort, PortsResponse } from '@/types/api'
import type { ServerProcess, BuildInfo } from '@/platform'

const DISCOVERY_POLL_INTERVAL = 5000
const SERVER_STATUS_CHECK_INTERVAL = 10000

export function Dashboard(): React.JSX.Element {
  const platform = usePlatform()
  const update = useUpdateStatus()
  const { status, ports, connect, disconnect, refresh } = useServerConnection({
    autoConnect: false
  })
  const [serverProcess, setServerProcess] = useState<ServerProcess | null>(null)
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)

  // Open ports state
  const [openPorts, setOpenPorts] = useState<Map<string, OpenPort>>(new Map())
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const clientRef = useRef(createClient())
  const apiClientRef = useRef(createApiClient())

  // Multi-server state
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([])
  const [selectedServerUrl, setSelectedServerUrl] = useState<string | null>(null)
  const [localServerUrl, setLocalServerUrl] = useState<string | null>(null)
  const [serverStatuses, setServerStatuses] = useState<
    Map<string, 'connected' | 'disconnected' | 'checking'>
  >(new Map())
  const [remotePorts, setRemotePorts] = useState<PortsResponse | null>(null)

  // Routing state
  const [routes, setRoutes] = useState<Route[]>([])
  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false)

  // Fetch build info on mount
  useEffect(() => {
    platform.getBuildInfo().then(setBuildInfo).catch(console.error)
  }, [platform])

  // Poll for discovered servers
  useEffect(() => {
    const fetchServers = async (): Promise<void> => {
      try {
        const response = await apiClientRef.current.getDiscoveredServers()
        setDiscoveredServers(response.servers)

        // Set local server URL if not already set
        const localServer = response.servers.find((s) => s.isLocal)
        if (localServer && !localServerUrl) {
          setLocalServerUrl(localServer.apiUrl)
          if (!selectedServerUrl) {
            setSelectedServerUrl(localServer.apiUrl)
          }
        }
      } catch (err) {
        console.error('Failed to fetch discovered servers:', err)
      }
    }

    fetchServers()
    const interval = setInterval(fetchServers, DISCOVERY_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [localServerUrl, selectedServerUrl])

  // Check health of all discovered servers
  useEffect(() => {
    const checkServerHealth = async (serverUrl: string): Promise<void> => {
      setServerStatuses((prev) => {
        const next = new Map(prev)
        next.set(serverUrl, 'checking')
        return next
      })

      try {
        await apiClientRef.current.getRemoteServerHealth(serverUrl)
        setServerStatuses((prev) => {
          const next = new Map(prev)
          next.set(serverUrl, 'connected')
          return next
        })
      } catch {
        setServerStatuses((prev) => {
          const next = new Map(prev)
          next.set(serverUrl, 'disconnected')
          return next
        })
      }
    }

    // Check health for all servers
    for (const server of discoveredServers) {
      if (!server.isLocal) {
        checkServerHealth(server.apiUrl)
      }
    }

    // Mark local server as connected if connected
    if (localServerUrl) {
      setServerStatuses((prev) => {
        const next = new Map(prev)
        next.set(localServerUrl, status.connected ? 'connected' : 'disconnected')
        return next
      })
    }

    // Periodically recheck remote servers
    const interval = setInterval(() => {
      for (const server of discoveredServers) {
        if (!server.isLocal) {
          checkServerHealth(server.apiUrl)
        }
      }
    }, SERVER_STATUS_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [discoveredServers, status.connected, localServerUrl])

  // Fetch routes
  useEffect(() => {
    const fetchRoutes = async (): Promise<void> => {
      try {
        const response = await apiClientRef.current.getRoutes()
        setRoutes(response.routes)
      } catch (err) {
        console.error('Failed to fetch routes:', err)
      }
    }

    fetchRoutes()
    const interval = setInterval(fetchRoutes, 5000) // Poll for route status updates
    return () => clearInterval(interval)
  }, [])

  // Fetch ports from selected server (local or remote)
  useEffect(() => {
    const fetchRemotePorts = async (): Promise<void> => {
      if (!selectedServerUrl || selectedServerUrl === localServerUrl) {
        setRemotePorts(null)
        return
      }

      try {
        const ports = await apiClientRef.current.getRemoteServerPorts(selectedServerUrl)
        setRemotePorts(ports)
      } catch (err) {
        console.error('Failed to fetch remote ports:', err)
        setRemotePorts(null)
      }
    }

    fetchRemotePorts()
  }, [selectedServerUrl, localServerUrl])

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
        setSelectedPortId(portId)
        return
      }

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
          messages: [...port.messages, ...messages].slice(-100)
        })
        return next
      })
    },
    [selectedPortId]
  )

  const handleSelectServer = useCallback((serverUrl: string) => {
    setSelectedServerUrl(serverUrl)
    // Clear selected port when switching servers
    setSelectedPortId(null)
    setOpenPorts(new Map())
  }, [])

  const handleToggleRoute = useCallback(async (routeId: string, enabled: boolean) => {
    try {
      await apiClientRef.current.updateRoute(routeId, { enabled })
      setRoutes((prev) =>
        prev.map((route) => (route.id === routeId ? { ...route, enabled } : route))
      )
    } catch (err) {
      console.error('Failed to toggle route:', err)
    }
  }, [])

  const handleDeleteRoute = useCallback(async (routeId: string) => {
    try {
      await apiClientRef.current.deleteRoute(routeId)
      setRoutes((prev) => prev.filter((route) => route.id !== routeId))
    } catch (err) {
      console.error('Failed to delete route:', err)
    }
  }, [])

  const handleAddRoute = useCallback(async (source: RouteEndpoint, destination: RouteEndpoint) => {
    try {
      const response = await apiClientRef.current.createRoute({
        enabled: true,
        source,
        destination
      })
      setRoutes((prev) => [...prev, response.route])
      setIsAddRouteModalOpen(false)
    } catch (err) {
      console.error('Failed to create route:', err)
    }
  }, [])

  // Use refs to avoid recreating the callback when ports/localServerUrl change
  const portsRef = useRef(ports)
  const localServerUrlRef = useRef(localServerUrl)
  portsRef.current = ports
  localServerUrlRef.current = localServerUrl

  const fetchServerPorts = useCallback(
    async (serverUrl: string): Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }> => {
      if (serverUrl === localServerUrlRef.current && portsRef.current) {
        return portsRef.current
      }
      return apiClientRef.current.getRemoteServerPorts(serverUrl)
    },
    []
  )

  // Remote server management callbacks
  const getRemoteServerStatus = useCallback(
    (serverUrl: string) => apiClientRef.current.getRemoteServerStatus(serverUrl),
    []
  )

  const startRemoteServer = useCallback(
    (serverUrl: string) => apiClientRef.current.startRemoteServer(serverUrl),
    []
  )

  const stopRemoteServer = useCallback(
    (serverUrl: string) => apiClientRef.current.stopRemoteServer(serverUrl),
    []
  )

  const selectedPort = selectedPortId ? openPorts.get(selectedPortId) : null
  const openPortIds = new Set(openPorts.keys())
  const isViewingLocalServer = selectedServerUrl === localServerUrl
  const displayPorts = isViewingLocalServer ? ports : remotePorts
  const hasUpdateAvailable =
    update.status?.phase === 'available' || update.status?.phase === 'downloaded'

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
      {!update.loading && update.supported && update.status && update.settings && (
        <>
          <UpdateSettingsButton
            onClick={() => setIsUpdateModalOpen(true)}
            hasUpdateAvailable={hasUpdateAvailable}
          />
          <UpdateSettingsModal
            isOpen={isUpdateModalOpen}
            onClose={() => setIsUpdateModalOpen(false)}
            status={update.status}
            settings={update.settings}
            onCheck={update.checkNow}
            onDownload={update.downloadNow}
            onInstall={update.installNow}
            onSave={update.saveSettings}
          />
        </>
      )}
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">MIDI Server Dashboard</h1>
          <p className="text-gray-400 mt-2">
            {platform.canManageServer
              ? 'Control and monitor MIDI servers on your network'
              : 'Connect to MIDI HTTP Servers'}
          </p>
          <p className="text-xs text-gray-600 mt-1">Running in {platform.name} mode</p>
        </header>

        {/* Server Tabs */}
        {discoveredServers.length > 0 && (
          <ServerTabs
            servers={discoveredServers}
            selectedServerUrl={selectedServerUrl}
            localServerUrl={localServerUrl}
            onSelectServer={handleSelectServer}
            serverStatuses={serverStatuses}
          />
        )}

        {/* Server Control (only for local server) */}
        {isViewingLocalServer && (
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
        )}

        {/* Remote server control */}
        {!isViewingLocalServer && selectedServerUrl && (
          <RemoteServerControl
            serverUrl={selectedServerUrl}
            serverName={
              discoveredServers.find((s) => s.apiUrl === selectedServerUrl)?.serverName ??
              'Remote Server'
            }
            connectionStatus={serverStatuses.get(selectedServerUrl) ?? 'disconnected'}
            getStatus={getRemoteServerStatus}
            startServer={startRemoteServer}
            stopServer={stopRemoteServer}
          />
        )}

        {/* Main content tabs */}
        <MainTabs>
          {(activeTab) => {
            // Ports tab
            if (activeTab === 'ports') {
              // No connection state
              if (isViewingLocalServer && !status.connected && !status.error) {
                return (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      {platform.canManageServer
                        ? 'Start the server or connect to see available MIDI ports'
                        : 'Connect to a MIDI HTTP Server to see available ports'}
                    </p>
                  </div>
                )
              }

              // Port lists and details
              if (
                ((isViewingLocalServer && status.connected) ||
                  (!isViewingLocalServer && remotePorts)) &&
                displayPorts
              ) {
                return (
                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 grid md:grid-cols-2 gap-6">
                      <PortList
                        title="MIDI Inputs"
                        ports={displayPorts.inputs}
                        openPortIds={isViewingLocalServer ? openPortIds : new Set()}
                        selectedPortId={isViewingLocalServer ? selectedPortId : null}
                        onPortClick={isViewingLocalServer ? handlePortClick : () => {}}
                      />
                      <PortList
                        title="MIDI Outputs"
                        ports={displayPorts.outputs}
                        openPortIds={isViewingLocalServer ? openPortIds : new Set()}
                        selectedPortId={isViewingLocalServer ? selectedPortId : null}
                        onPortClick={isViewingLocalServer ? handlePortClick : () => {}}
                      />
                    </div>

                    <div>
                      {isViewingLocalServer && selectedPort ? (
                        <PortDetail
                          port={selectedPort}
                          onClose={handleClosePort}
                          onMessagesReceived={handleMessagesReceived}
                        />
                      ) : (
                        <div className="bg-gray-800 rounded-lg p-4 h-full flex items-center justify-center">
                          <p className="text-gray-500 text-center">
                            {isViewingLocalServer
                              ? 'Click a port to open it and view details'
                              : 'Port interaction available on local server'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return null
            }

            // Routes tab
            if (activeTab === 'routes') {
              return (
                <RoutingPanel
                  routes={routes}
                  servers={discoveredServers}
                  onToggleRoute={handleToggleRoute}
                  onDeleteRoute={handleDeleteRoute}
                  onAddRoute={() => setIsAddRouteModalOpen(true)}
                />
              )
            }

            // Graph tab
            if (activeTab === 'graph') {
              return (
                <RouteGraph
                  routes={routes}
                  servers={discoveredServers}
                  serverStatuses={serverStatuses}
                  fetchServerPorts={fetchServerPorts}
                  onCreateRoute={handleAddRoute}
                  onDeleteRoute={handleDeleteRoute}
                  onToggleRoute={handleToggleRoute}
                />
              )
            }

            return null
          }}
        </MainTabs>

        {/* Add Route Modal */}
        <AddRouteModal
          isOpen={isAddRouteModalOpen}
          servers={discoveredServers}
          onClose={() => setIsAddRouteModalOpen(false)}
          onSave={handleAddRoute}
          fetchServerPorts={fetchServerPorts}
        />
      </div>
    </div>
  )
}
