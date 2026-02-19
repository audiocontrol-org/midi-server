import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Route, DiscoveredServer } from '@/api/client'
import type { PortsResponse } from '@/types/api'

// Deep equality check for node data
function isNodeDataEqual(a: Node, b: Node): boolean {
  if (a.id !== b.id || a.type !== b.type) return false
  if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false

  const dataA = a.data as Record<string, unknown>
  const dataB = b.data as Record<string, unknown>
  const keysA = Object.keys(dataA)
  const keysB = Object.keys(dataB)

  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => dataA[key] === dataB[key])
}

// Deep equality check for edge data
function isEdgeDataEqual(a: Edge, b: Edge): boolean {
  if (a.id !== b.id) return false
  if (a.source !== b.source || a.target !== b.target) return false
  if (a.sourceHandle !== b.sourceHandle || a.targetHandle !== b.targetHandle) return false

  if (!a.data && !b.data) return true
  if (!a.data || !b.data) return false

  const dataA = a.data as Record<string, unknown>
  const dataB = b.data as Record<string, unknown>
  const keysA = Object.keys(dataA)
  const keysB = Object.keys(dataB)

  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => dataA[key] === dataB[key])
}

// Compare arrays and return previous if unchanged
function useStableArray<T>(
  computed: T[],
  isEqual: (a: T, b: T) => boolean
): T[] {
  const prevRef = useRef<T[]>(computed)

  const isSame =
    prevRef.current.length === computed.length &&
    computed.every((item, i) => isEqual(item, prevRef.current[i]))

  if (!isSame) {
    prevRef.current = computed
  }

  return prevRef.current
}

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

  // Fetch ports when servers change
  const serverUrls = servers.map((s) => s.apiUrl).join(',')
  useEffect(() => {
    if (servers.length === 0) {
      setFetchState({ ports: new Map(), loading: false })
      return
    }

    let cancelled = false
    setFetchState((prev) => ({ ...prev, loading: true }))

    const fetchAll = async (): Promise<void> => {
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
      if (!cancelled) {
        setFetchState({ ports: portsMap, loading: false })
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrls, fetchServerPorts])

  // Compute nodes
  const nodes = useMemo((): Node[] => {
    const result: Node[] = []

    servers.forEach((server, serverIndex) => {
      const serverNodeId = `server:${server.apiUrl}`
      const serverX = savedPositions.get(serverNodeId)?.x ?? serverIndex * SERVER_SPACING_X
      const serverY = savedPositions.get(serverNodeId)?.y ?? SERVER_START_Y

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

      const ports = fetchState.ports.get(server.apiUrl)
      if (ports) {
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

        let portIndex = 0
        portsByName.forEach((portIds, portName) => {
          const portNodeId = `port:${server.apiUrl}:${portName}`
          const x = savedPositions.get(portNodeId)?.x ?? serverX
          const y = savedPositions.get(portNodeId)?.y ?? PORT_START_Y + portIndex * PORT_SPACING_Y

          result.push({
            id: portNodeId,
            type: 'port',
            position: { x, y },
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

  // Helper to resolve serverUrl
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

  // Compute edges
  const computedEdges = useMemo((): Edge[] => {
    return routes.map((route) => {
      const sourceServerUrl = resolveServerUrl(route.source.serverUrl)
      const destServerUrl = resolveServerUrl(route.destination.serverUrl)

      const parsePortId = (portId: string): string => {
        if (portId.startsWith('input-')) return portId.slice(6)
        if (portId.startsWith('output-')) return portId.slice(7)
        return portId
      }

      const sourcePortId = parsePortId(route.source.portId)
      const destPortId = parsePortId(route.destination.portId)

      const sourcePortName =
        route.source.portName || findPortName(sourceServerUrl, sourcePortId, 'input')
      const destPortName =
        route.destination.portName || findPortName(destServerUrl, destPortId, 'output')

      const sourceNodeId = sourcePortName
        ? `port:${sourceServerUrl}:${sourcePortName}`
        : `port:${sourceServerUrl}:unknown-${sourcePortId}`
      const destNodeId = destPortName
        ? `port:${destServerUrl}:${destPortName}`
        : `port:${destServerUrl}:unknown-${destPortId}`

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
          isAnimating: false
        } satisfies RouteEdgeData
      }
    })
  }, [routes, resolveServerUrl, findPortName])

  // Stabilize arrays - only return new references when data actually changes
  const stableNodes = useStableArray(nodes, isNodeDataEqual)
  const stableEdges = useStableArray(computedEdges, isEdgeDataEqual)

  return { nodes: stableNodes, edges: stableEdges, loading: fetchState.loading }
}

export function getPortFromNodeId(
  nodeId: string | null,
  handleId: string | null
): { serverUrl: string; portName: string; handleType: 'inlet' | 'outlet' } | null {
  if (!nodeId || !handleId) return null
  const parts = nodeId.split(':')
  if (parts[0] !== 'port' || parts.length < 3) return null

  const portName = parts[parts.length - 1]
  const serverUrl = parts.slice(1, -1).join(':')

  const handleType = handleId === 'inlet' ? 'inlet' : handleId === 'outlet' ? 'outlet' : null
  if (!handleType) return null

  return { serverUrl, portName, handleType }
}
