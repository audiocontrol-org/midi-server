import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Route, DiscoveredServer } from '@/api/client'
import type { PortsResponse, MidiPort } from '@/types/api'

const SERVER_SPACING_X = 350
const PORT_SPACING_Y = 50
const SERVER_START_Y = 100
const PORT_START_Y = 200

export interface ServerNodeData extends Record<string, unknown> {
  label: string
  apiUrl: string
  isLocal: boolean
  connectionStatus: 'connected' | 'disconnected' | 'checking'
}

export interface PortNodeData extends Record<string, unknown> {
  label: string
  portId: string
  portType: 'input' | 'output'
  serverUrl: string
  serverName: string
}

export interface RouteEdgeData extends Record<string, unknown> {
  routeId: string
  enabled: boolean
  status: 'active' | 'error' | 'disabled'
  messagesRouted: number
  lastMessageTime: number | null
  isAnimating: boolean
}

interface UseRouteGraphOptions {
  routes: Route[]
  servers: DiscoveredServer[]
  serverStatuses: Map<string, 'connected' | 'disconnected' | 'checking'>
  fetchServerPorts: (serverUrl: string) => Promise<PortsResponse>
  savedPositions: Map<string, { x: number; y: number }>
}

interface UseRouteGraphReturn {
  nodes: Node[]
  edges: Edge[]
  loading: boolean
}

// Animation threshold - messages within this time are considered "recent"
const ANIMATION_THRESHOLD_MS = 2000

interface FetchState {
  ports: Map<string, PortsResponse>
  loading: boolean
}

export function useRouteGraph({
  routes,
  servers,
  serverStatuses,
  fetchServerPorts,
  savedPositions
}: UseRouteGraphOptions): UseRouteGraphReturn {
  const [fetchState, setFetchState] = useState<FetchState>({
    ports: new Map(),
    loading: servers.length > 0
  })
  const prevMessageCountsRef = useRef<Map<string, number>>(new Map())
  const animationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [animatingEdges, setAnimatingEdges] = useState<Set<string>>(new Set())

  // Async fetch function that updates state
  const fetchAllPorts = useCallback(async (): Promise<void> => {
    if (servers.length === 0) {
      setFetchState({ ports: new Map(), loading: false })
      return
    }

    setFetchState((prev) => ({ ...prev, loading: true }))

    const portsMap = new Map<string, PortsResponse>()

    await Promise.all(
      servers.map(async (server) => {
        try {
          const ports = await fetchServerPorts(server.apiUrl)
          portsMap.set(server.apiUrl, ports)
        } catch (err) {
          console.error(`Failed to fetch ports for ${server.apiUrl}:`, err)
        }
      })
    )

    setFetchState({ ports: portsMap, loading: false })
  }, [servers, fetchServerPorts])

  // Fetch ports when servers change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Data fetching requires setState in effect
    fetchAllPorts()
  }, [fetchAllPorts])

  // Process animation state changes
  const processAnimations = useCallback((routeList: Route[]): void => {
    const currentCounts = new Map<string, number>()
    const newAnimatingIds: string[] = []
    const timersRef = animationTimersRef.current

    routeList.forEach((route) => {
      const count = route.status?.messagesRouted ?? 0
      currentCounts.set(route.id, count)

      const prevCount = prevMessageCountsRef.current.get(route.id) ?? 0
      const lastMessageTime = route.status?.lastMessageTime ?? 0
      const isRecent = Date.now() - lastMessageTime < ANIMATION_THRESHOLD_MS

      if (count > prevCount || isRecent) {
        newAnimatingIds.push(route.id)

        // Clear any existing timer for this route
        const existingTimer = timersRef.get(route.id)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        // Set timer to clear animation after 1 second
        const timer = setTimeout(() => {
          setAnimatingEdges((prev) => {
            const next = new Set(prev)
            next.delete(route.id)
            return next
          })
          timersRef.delete(route.id)
        }, 1000)
        timersRef.set(route.id, timer)
      }
    })

    if (newAnimatingIds.length > 0) {
      setAnimatingEdges((prev) => new Set([...prev, ...newAnimatingIds]))
    }
    prevMessageCountsRef.current = currentCounts
  }, [])

  // Track message count changes for animation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Animation tracking requires setState in effect
    processAnimations(routes)

    // Cleanup timers on unmount
    const timers = animationTimersRef.current
    return (): void => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [routes, processAnimations])

  const nodes = useMemo((): Node[] => {
    const result: Node[] = []

    servers.forEach((server, serverIndex) => {
      const serverNodeId = `server:${server.apiUrl}`
      const serverX = savedPositions.get(serverNodeId)?.x ?? serverIndex * SERVER_SPACING_X
      const serverY = savedPositions.get(serverNodeId)?.y ?? SERVER_START_Y

      // Add server node
      result.push({
        id: serverNodeId,
        type: 'server',
        position: { x: serverX, y: serverY },
        data: {
          label: server.isLocal ? 'Local' : server.serverName,
          apiUrl: server.apiUrl,
          isLocal: server.isLocal,
          connectionStatus: serverStatuses.get(server.apiUrl) ?? 'disconnected'
        } satisfies ServerNodeData
      })

      // Add port nodes
      const ports = fetchState.ports.get(server.apiUrl)
      if (ports) {
        const addPortNodes = (portList: MidiPort[], portType: 'input' | 'output'): void => {
          portList.forEach((port, portIndex) => {
            const portNodeId = `port:${server.apiUrl}:${portType}:${port.id}`
            const offsetX = portType === 'input' ? -80 : 80
            const defaultX = serverX + offsetX
            const defaultY = PORT_START_Y + portIndex * PORT_SPACING_Y

            result.push({
              id: portNodeId,
              type: 'port',
              position: {
                x: savedPositions.get(portNodeId)?.x ?? defaultX,
                y: savedPositions.get(portNodeId)?.y ?? defaultY
              },
              data: {
                label: port.name,
                portId: String(port.id),
                portType,
                serverUrl: server.apiUrl,
                serverName: server.isLocal ? 'Local' : server.serverName
              } satisfies PortNodeData
            })
          })
        }

        addPortNodes(ports.inputs, 'input')
        addPortNodes(ports.outputs, 'output')
      }
    })

    return result
  }, [servers, fetchState.ports, serverStatuses, savedPositions])

  // Helper to resolve serverUrl (handles "local" -> actual URL)
  const resolveServerUrl = (serverUrl: string): string => {
    if (serverUrl === 'local') {
      const localServer = servers.find((s) => s.isLocal)
      return localServer?.apiUrl ?? serverUrl
    }
    return serverUrl
  }

  // Helper to parse portId which may be "input-4" or "output-5" format, or just "4"
  const parsePortId = (portId: string): { type: 'input' | 'output'; id: string } | null => {
    if (portId.startsWith('input-')) {
      return { type: 'input', id: portId.slice(6) }
    }
    if (portId.startsWith('output-')) {
      return { type: 'output', id: portId.slice(7) }
    }
    // Fallback: assume it's just the numeric ID
    return null
  }

  const edges = useMemo((): Edge[] => {
    return routes.map((route) => {
      // Resolve server URLs (handle "local" -> actual URL)
      const sourceServerUrl = resolveServerUrl(route.source.serverUrl)
      const destServerUrl = resolveServerUrl(route.destination.serverUrl)

      // Parse port IDs (handle "input-4" or "output-5" format)
      const sourceParsed = parsePortId(route.source.portId)
      const destParsed = parsePortId(route.destination.portId)

      // Build node IDs - use parsed type/id if available, otherwise use the raw portId
      // route.source is INPUT port (receives MIDI), route.destination is OUTPUT port (sends MIDI)
      const inputPortNodeId = sourceParsed
        ? `port:${sourceServerUrl}:${sourceParsed.type}:${sourceParsed.id}`
        : `port:${sourceServerUrl}:input:${route.source.portId}`
      const outputPortNodeId = destParsed
        ? `port:${destServerUrl}:${destParsed.type}:${destParsed.id}`
        : `port:${destServerUrl}:output:${route.destination.portId}`

      // React Flow edges go from SOURCE handle to TARGET handle
      // Output ports have SOURCE handles, Input ports have TARGET handles
      // So edge.source = output port node, edge.target = input port node
      // This visualizes data flow: output -> input
      return {
        id: `route:${route.id}`,
        source: outputPortNodeId,
        target: inputPortNodeId,
        type: 'route',
        data: {
          routeId: route.id,
          enabled: route.enabled,
          status: route.status?.status ?? 'disabled',
          messagesRouted: route.status?.messagesRouted ?? 0,
          lastMessageTime: route.status?.lastMessageTime ?? null,
          isAnimating: animatingEdges.has(route.id)
        } satisfies RouteEdgeData
      }
    })
  }, [routes, animatingEdges, servers])

  return { nodes, edges, loading: fetchState.loading }
}

// Helper to extract port info from node ID
export function getPortFromNodeId(
  nodeId: string | null
): { serverUrl: string; portType: 'input' | 'output'; portId: string } | null {
  if (!nodeId) return null
  const parts = nodeId.split(':')
  if (parts[0] !== 'port' || parts.length < 4) return null

  // Handle URLs with colons by rejoining server URL parts
  const portType = parts[parts.length - 2] as 'input' | 'output'
  const portId = parts[parts.length - 1]
  const serverUrl = parts.slice(1, -2).join(':')

  if (portType !== 'input' && portType !== 'output') return null

  return { serverUrl, portType, portId }
}
