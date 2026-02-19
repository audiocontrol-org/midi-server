import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Route, DiscoveredServer } from '@/api/client'
import type { PortsResponse } from '@/types/api'

const SERVER_SPACING_X = 350
const PORT_SPACING_Y = 45
const SERVER_START_Y = 50
const PORT_START_Y = 120

export interface ServerNodeData extends Record<string, unknown> {
  label: string
  apiUrl: string
  isLocal: boolean
  connectionStatus: 'connected' | 'disconnected' | 'checking'
}

export interface PortNodeData extends Record<string, unknown> {
  label: string
  serverUrl: string
  serverName: string
  // Port IDs - null if port doesn't exist in that direction
  inputPortId: string | null
  outputPortId: string | null
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

      // Combine input/output ports by name
      const ports = fetchState.ports.get(server.apiUrl)
      if (ports) {
        // Build a map of port name -> { inputId, outputId }
        const portsByName = new Map<string, { inputId: string | null; outputId: string | null }>()

        ports.inputs.forEach((port) => {
          const existing = portsByName.get(port.name) ?? { inputId: null, outputId: null }
          existing.inputId = String(port.id)
          portsByName.set(port.name, existing)
        })

        ports.outputs.forEach((port) => {
          const existing = portsByName.get(port.name) ?? { inputId: null, outputId: null }
          existing.outputId = String(port.id)
          portsByName.set(port.name, existing)
        })

        // Create unified port nodes
        let portIndex = 0
        portsByName.forEach((portIds, portName) => {
          const portNodeId = `port:${server.apiUrl}:${portName}`
          const defaultX = serverX
          const defaultY = PORT_START_Y + portIndex * PORT_SPACING_Y

          result.push({
            id: portNodeId,
            type: 'port',
            position: {
              x: savedPositions.get(portNodeId)?.x ?? defaultX,
              y: savedPositions.get(portNodeId)?.y ?? defaultY
            },
            data: {
              label: portName,
              serverUrl: server.apiUrl,
              serverName: server.isLocal ? 'Local' : server.serverName,
              inputPortId: portIds.inputId,
              outputPortId: portIds.outputId
            } satisfies PortNodeData
          })
          portIndex++
        })
      }
    })

    return result
  }, [servers, fetchState.ports, serverStatuses, savedPositions])

  // Helper to resolve serverUrl (handles "local" -> actual URL)
  const resolveServerUrl = useCallback(
    (serverUrl: string): string => {
      if (serverUrl === 'local') {
        const localServer = servers.find((s) => s.isLocal)
        return localServer?.apiUrl ?? serverUrl
      }
      return serverUrl
    },
    [servers]
  )

  // Helper to find port name by ID
  const findPortName = useCallback(
    (serverUrl: string, portId: string, type: 'input' | 'output'): string | null => {
      const ports = fetchState.ports.get(serverUrl)
      if (!ports) return null

      const portList = type === 'input' ? ports.inputs : ports.outputs
      const port = portList.find((p) => String(p.id) === portId)
      return port?.name ?? null
    },
    [fetchState.ports]
  )

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

      // Parse port IDs to get the numeric ID
      const sourceParsed = parsePortId(route.source.portId)
      const destParsed = parsePortId(route.destination.portId)

      const sourcePortId = sourceParsed?.id ?? route.source.portId
      const destPortId = destParsed?.id ?? route.destination.portId

      // Find port names to build unified node IDs
      // route.source is INPUT port (receives MIDI from external)
      // route.destination is OUTPUT port (sends MIDI to external)
      const sourcePortName =
        route.source.portName || findPortName(sourceServerUrl, sourcePortId, 'input')
      const destPortName =
        route.destination.portName || findPortName(destServerUrl, destPortId, 'output')

      // Build unified node IDs using port names
      const sourceNodeId = sourcePortName
        ? `port:${sourceServerUrl}:${sourcePortName}`
        : `port:${sourceServerUrl}:unknown-${sourcePortId}`
      const destNodeId = destPortName
        ? `port:${destServerUrl}:${destPortName}`
        : `port:${destServerUrl}:unknown-${destPortId}`

      // Edge goes from source (INPUT) node to destination (OUTPUT) node
      // Route: source INPUT port receives MIDI -> destination OUTPUT port sends MIDI
      // Visual: source node outlet (right) -> destination node inlet (left) = left-to-right flow
      return {
        id: `route:${route.id}`,
        source: sourceNodeId,
        sourceHandle: 'outlet',
        target: destNodeId,
        targetHandle: 'inlet',
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
  }, [routes, animatingEdges, resolveServerUrl, findPortName])

  return { nodes, edges, loading: fetchState.loading }
}

// Helper to extract port info from node ID (updated for unified nodes)
export function getPortFromNodeId(
  nodeId: string | null,
  handleId: string | null
): { serverUrl: string; portName: string; handleType: 'inlet' | 'outlet' } | null {
  if (!nodeId || !handleId) return null
  const parts = nodeId.split(':')
  if (parts[0] !== 'port' || parts.length < 3) return null

  // Handle URLs with colons by taking the last part as port name
  const portName = parts[parts.length - 1]
  const serverUrl = parts.slice(1, -1).join(':')

  const handleType = handleId === 'inlet' ? 'inlet' : handleId === 'outlet' ? 'outlet' : null
  if (!handleType) return null

  return { serverUrl, portName, handleType }
}
