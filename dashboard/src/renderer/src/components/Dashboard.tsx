import { useState, useEffect, useCallback, useRef } from 'react'
import { useServerConnection } from '@/hooks/useServerConnection'
import { usePlatform } from '@/hooks/usePlatform'
import { useUpdateStatus } from '@/hooks/useUpdateStatus'
import { PortList, generatePortId } from '@/components/PortList'
import { PortDetail } from '@/components/PortDetail'
import { UpdateSettingsButton } from '@/components/UpdateSettingsButton'
import { UpdateSettingsModal } from '@/components/UpdateSettingsModal'
import { BuildInfoButton } from '@/components/BuildInfoButton'
import { BuildInfoModal } from '@/components/BuildInfoModal'
import { RoutingPanel } from '@/components/RoutingPanel'
import { RouteGraph } from '@/components/RouteGraph'
import { AddRouteModal } from '@/components/AddRouteModal'
import { AddVirtualPortModal } from '@/components/AddVirtualPortModal'
import { AppShell, PageHeader, ServerStatus, ServerActions, type TabId } from '@/components/layout'
import '@/styles/layout.css'
import {
  createClient,
  createApiClient,
  type DiscoveredServer,
  type Route,
  type RouteEndpoint,
  type VirtualPortConfig
} from '@/api/client'
import type { MidiPort, MidiMessage, OpenPort } from '@/types/api'
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

  // Active tab state
  const [activeTab, setActiveTab] = useState<TabId>('ports')

  // Open ports state
  const [openPorts, setOpenPorts] = useState<Map<string, OpenPort>>(new Map())
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const clientRef = useRef(createClient())
  const apiClientRef = useRef(createApiClient())

  // Multi-server state
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([])
  const [localServerUrl, setLocalServerUrl] = useState<string | null>(null)
  const [serverStatuses, setServerStatuses] = useState<
    Map<string, 'connected' | 'disconnected' | 'checking'>
  >(new Map())

  // Routing state
  const [routes, setRoutes] = useState<Route[]>([])
  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false)

  // Virtual port state
  const [virtualPorts, setVirtualPorts] = useState<VirtualPortConfig[]>([])
  const [isAddVirtualPortModalOpen, setIsAddVirtualPortModalOpen] = useState(false)

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

        const localServer = response.servers.find((s) => s.isLocal)
        if (localServer && !localServerUrl) {
          setLocalServerUrl(localServer.apiUrl)
        }
      } catch (err) {
        console.error('Failed to fetch discovered servers:', err)
      }
    }

    fetchServers()
    const interval = setInterval(fetchServers, DISCOVERY_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [localServerUrl])

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

    for (const server of discoveredServers) {
      if (!server.isLocal) {
        checkServerHealth(server.apiUrl)
      }
    }

    if (localServerUrl) {
      setServerStatuses((prev) => {
        const next = new Map(prev)
        next.set(localServerUrl, status.connected ? 'connected' : 'disconnected')
        return next
      })
    }

    const interval = setInterval(() => {
      for (const server of discoveredServers) {
        if (!server.isLocal) {
          checkServerHealth(server.apiUrl)
        }
      }
    }, SERVER_STATUS_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [discoveredServers, status.connected, localServerUrl])

  // Fetch routes from all discovered servers
  useEffect(() => {
    const fetchAllRoutes = async (): Promise<void> => {
      try {
        const allRoutes: Route[] = []

        // Fetch local routes
        try {
          const localResponse = await apiClientRef.current.getRoutes()
          const localRoutes = localResponse.routes.map((r) => ({
            ...r,
            ownerServer: 'local'
          }))
          allRoutes.push(...localRoutes)
        } catch (err) {
          console.error('Failed to fetch local routes:', err)
        }

        // Fetch routes from each discovered remote server
        for (const server of discoveredServers) {
          if (server.isLocal) continue
          try {
            const remoteResponse = await apiClientRef.current.getRemoteServerRoutes(server.apiUrl)
            const remoteRoutes = remoteResponse.routes.map((r) => ({
              ...r,
              ownerServer: server.apiUrl
            }))
            allRoutes.push(...remoteRoutes)
          } catch (err) {
            // Remote server may be offline, just skip
            console.debug(`Failed to fetch routes from ${server.serverName}:`, err)
          }
        }

        setRoutes(allRoutes)
      } catch (err) {
        console.error('Failed to fetch routes:', err)
      }
    }

    fetchAllRoutes()
    const interval = setInterval(fetchAllRoutes, 5000)
    return () => clearInterval(interval)
  }, [discoveredServers])

  // Fetch virtual ports
  useEffect(() => {
    const fetchVirtualPorts = async (): Promise<void> => {
      try {
        const response = await apiClientRef.current.getVirtualPorts()
        setVirtualPorts(response.virtualPorts)
      } catch (err) {
        console.error('Failed to fetch virtual ports:', err)
      }
    }

    fetchVirtualPorts()
    const interval = setInterval(fetchVirtualPorts, 5000)
    return () => clearInterval(interval)
  }, [])

  // Poll server process status
  useEffect(() => {
    if (!platform.canManageServer) return

    const checkStatus = async (): Promise<void> => {
      try {
        const processStatus = await platform.getServerStatus()
        setServerProcess(processStatus)

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

  const handleStartServer = useCallback(async () => {
    try {
      const process = await platform.startServer()
      setServerProcess(process)
      connect()
    } catch (err) {
      console.error('Failed to start server:', err)
    }
  }, [platform, connect])

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
        // Virtual ports are already "open" - they exist in the C++ server
        // We just need to track them in our UI state
        if (port.isVirtual) {
          const newPort: OpenPort = {
            portId,
            name: port.name,
            type: port.type,
            messages: []
          }
          setOpenPorts((prev) => new Map(prev).set(portId, newPort))
          setSelectedPortId(portId)
          return
        }

        // Physical ports need to be opened via the API
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
      // Virtual ports don't need to be closed via API - just deselect
      const isVirtual = selectedPortId.startsWith('virtual:')
      if (!isVirtual) {
        await clientRef.current.closePort(selectedPortId)
      }
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

  const handleToggleRoute = useCallback(async (routeId: string, enabled: boolean) => {
    try {
      // Find the route to determine its owner
      const route = routes.find((r) => r.id === routeId)
      if (!route) return

      if (route.ownerServer && route.ownerServer !== 'local') {
        // Route is on a remote server
        await apiClientRef.current.updateRemoteServerRoute(route.ownerServer, routeId, { enabled })
      } else {
        // Route is on local server
        await apiClientRef.current.updateRoute(routeId, { enabled })
      }

      setRoutes((prev) =>
        prev.map((r) => (r.id === routeId ? { ...r, enabled } : r))
      )
    } catch (err) {
      console.error('Failed to toggle route:', err)
    }
  }, [routes])

  const handleDeleteRoute = useCallback(async (routeId: string) => {
    try {
      // Find the route to determine its owner
      const route = routes.find((r) => r.id === routeId)
      if (!route) return

      if (route.ownerServer && route.ownerServer !== 'local') {
        // Route is on a remote server
        await apiClientRef.current.deleteRemoteServerRoute(route.ownerServer, routeId)
      } else {
        // Route is on local server
        await apiClientRef.current.deleteRoute(routeId)
      }

      setRoutes((prev) => prev.filter((r) => r.id !== routeId))
    } catch (err) {
      console.error('Failed to delete route:', err)
    }
  }, [routes])

  const handleAddRoute = useCallback(
    async (source: RouteEndpoint, destination: RouteEndpoint, sourceServerApiUrl: string) => {
      try {
        // Determine if the source is on a remote server
        const sourceServer = discoveredServers.find((s) => s.apiUrl === sourceServerApiUrl)
        const isRemoteSource = sourceServer && !sourceServer.isLocal

        const routeData = {
          enabled: true,
          source,
          destination
        }

        let response: { route: Route }
        if (isRemoteSource) {
          // Create route on the remote server where the source port lives
          response = await apiClientRef.current.createRemoteServerRoute(sourceServerApiUrl, routeData)
          // Tag with owner server for UI
          response.route.ownerServer = sourceServerApiUrl
        } else {
          // Create route on local server
          response = await apiClientRef.current.createRoute(routeData)
          response.route.ownerServer = 'local'
        }

        setRoutes((prev) => [...prev, response.route])
        setIsAddRouteModalOpen(false)
      } catch (err) {
        console.error('Failed to create route:', err)
      }
    },
    [discoveredServers]
  )

  const handleAddVirtualPort = useCallback(async (name: string, type: 'input' | 'output') => {
    try {
      const response = await apiClientRef.current.createVirtualPort({ name, type })
      setVirtualPorts((prev) => [...prev, response.virtualPort])
      setIsAddVirtualPortModalOpen(false)
    } catch (err) {
      console.error('Failed to create virtual port:', err)
    }
  }, [])

  const handleDeleteVirtualPort = useCallback(async (portId: string) => {
    try {
      await apiClientRef.current.deleteVirtualPort(portId)
      setVirtualPorts((prev) => prev.filter((port) => port.id !== portId))
    } catch (err) {
      console.error('Failed to delete virtual port:', err)
    }
  }, [])

  // Stable callback refs
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

  const selectedPort = selectedPortId ? openPorts.get(selectedPortId) : null
  const openPortIds = new Set(openPorts.keys())
  const hasUpdateAvailable =
    update.status?.phase === 'available' || update.status?.phase === 'downloaded'
  const remoteServerCount = discoveredServers.filter((s) => !s.isLocal).length

  // Merge virtual ports into the ports lists for the Ports tab
  const allPorts = {
    inputs: [
      ...(ports?.inputs ?? []),
      ...virtualPorts
        .filter((vp) => vp.type === 'input')
        .map((vp) => ({
          id: `virtual:${vp.id}`,
          name: `🔌 ${vp.name}`,
          type: 'input' as const,
          isVirtual: true
        }))
    ],
    outputs: [
      ...(ports?.outputs ?? []),
      ...virtualPorts
        .filter((vp) => vp.type === 'output')
        .map((vp) => ({
          id: `virtual:${vp.id}`,
          name: `🔌 ${vp.name}`,
          type: 'output' as const,
          isVirtual: true
        }))
    ]
  }

  // Header status content
  const headerStatus = (
    <>
      <ServerStatus
        isServerRunning={serverProcess?.running ?? false}
        isConnected={status.connected}
        serverUrl={serverProcess?.url}
        remoteServerCount={remoteServerCount}
      />
      <ServerActions
        isServerRunning={serverProcess?.running ?? false}
        isConnected={status.connected}
        canManageServer={platform.canManageServer}
        onStartServer={handleStartServer}
        onStopServer={handleStopServer}
        onConnect={connect}
        onDisconnect={disconnect}
      />
      {buildInfo && (
        <BuildInfoButton serial={buildInfo.serial} onClick={() => setIsModalOpen(true)} />
      )}
    </>
  )

  // Render page content based on active tab
  const renderPageContent = (): React.JSX.Element => {
    switch (activeTab) {
      case 'ports':
        return (
          <>
            <PageHeader
              title="MIDI Ports"
              subtitle={
                status.connected
                  ? `${allPorts.inputs.length} inputs, ${allPorts.outputs.length} outputs`
                  : undefined
              }
              actions={
                status.connected && (
                  <button onClick={refresh} className="btn btn-sm">
                    Refresh
                  </button>
                )
              }
            />
            <div className="page-content">
              {!status.connected ? (
                <div className="card text-center" style={{ padding: '3rem' }}>
                  <p className="text-muted">
                    {platform.canManageServer
                      ? 'Start the server to see available MIDI ports'
                      : 'Connect to a MIDI server to see available ports'}
                  </p>
                </div>
              ) : ports ? (
                <div className="list-detail-grid">
                  <div className="grid-2">
                    <PortList
                      title="MIDI Inputs"
                      ports={allPorts.inputs}
                      openPortIds={openPortIds}
                      selectedPortId={selectedPortId}
                      onPortClick={handlePortClick}
                    />
                    <PortList
                      title="MIDI Outputs"
                      ports={allPorts.outputs}
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
                      <div className="card text-center" style={{ padding: '3rem' }}>
                        <p className="text-muted">Click a port to open it and view details</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )

      case 'routes':
        return (
          <>
            <PageHeader
              title="MIDI Routes"
              subtitle={`${routes.length} route${routes.length !== 1 ? 's' : ''}`}
              actions={
                <button
                  onClick={() => setIsAddRouteModalOpen(true)}
                  className="btn btn-sm btn-primary"
                >
                  Add Route
                </button>
              }
            />
            <div className="page-content">
              <RoutingPanel
                routes={routes}
                servers={discoveredServers}
                virtualPorts={virtualPorts}
                onToggleRoute={handleToggleRoute}
                onDeleteRoute={handleDeleteRoute}
                onAddRoute={() => setIsAddRouteModalOpen(true)}
                onAddVirtualPort={() => setIsAddVirtualPortModalOpen(true)}
                onDeleteVirtualPort={handleDeleteVirtualPort}
              />
            </div>
          </>
        )

      case 'graph':
        return (
          <>
            <PageHeader
              title="Route Graph"
              subtitle="Drag to connect ports"
              actions={
                <button
                  onClick={() => setIsAddRouteModalOpen(true)}
                  className="btn btn-sm btn-primary"
                >
                  Add Route
                </button>
              }
            />
            <div className="page-content-fill">
              <RouteGraph
                routes={routes}
                servers={discoveredServers}
                virtualPorts={virtualPorts}
                serverStatuses={serverStatuses}
                fetchServerPorts={fetchServerPorts}
                onCreateRoute={handleAddRoute}
                onDeleteRoute={handleDeleteRoute}
                onToggleRoute={handleToggleRoute}
              />
            </div>
          </>
        )
    }
  }

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab} headerStatus={headerStatus}>
      <div className="page">{renderPageContent()}</div>

      {/* Modals */}
      {buildInfo && (
        <BuildInfoModal
          buildInfo={buildInfo}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
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
      <AddRouteModal
        isOpen={isAddRouteModalOpen}
        servers={discoveredServers}
        virtualPorts={virtualPorts}
        onClose={() => setIsAddRouteModalOpen(false)}
        onSave={handleAddRoute}
        fetchServerPorts={fetchServerPorts}
      />
      <AddVirtualPortModal
        isOpen={isAddVirtualPortModalOpen}
        onClose={() => setIsAddVirtualPortModalOpen(false)}
        onSave={handleAddVirtualPort}
      />
    </AppShell>
  )
}
