import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Route, DiscoveredServer, VirtualPortConfig } from '@/api/client'
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

// Layout constants
const SERVER_SPACING_X = 280
const SERVER_HEADER_HEIGHT = 44
const SERVER_PADDING_X = 16
const SERVER_PADDING_Y = 12
const PORT_NODE_WIDTH = 180
const PORT_NODE_HEIGHT = 36
const PORT_SPACING_Y = 8
const SERVER_WIDTH = PORT_NODE_WIDTH + SERVER_PADDING_X * 2

export interface ServerNodeData extends Record<string, unknown> {
  label: string
  apiUrl: string
  isLocal: boolean
  connectionStatus: 'connected' | 'disconnected' | 'checking'
  portCount: number
}

export interface PortNodeData extends Record<string, unknown> {
  label: string
  serverUrl: string
  serverName: string
  inputPortId: string | null
  outputPortId: string | null
  isVirtual?: boolean
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
  virtualPorts: VirtualPortConfig[]
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
  virtualPorts,
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
      const serverY = savedPositions.get(serverNodeId)?.y ?? 50

      const ports = fetchState.ports.get(server.apiUrl)
      const portsByName = new Map<string, { inputId: string | null; outputId: string | null; isVirtual: boolean }>()

      if (ports) {
        ports.inputs.forEach((port) => {
          const existing = portsByName.get(port.name) ?? { inputId: null, outputId: null, isVirtual: false }
          existing.inputId = String(port.id)
          portsByName.set(port.name, existing)
        })

        ports.outputs.forEach((port) => {
          const existing = portsByName.get(port.name) ?? { inputId: null, outputId: null, isVirtual: false }
          existing.outputId = String(port.id)
          portsByName.set(port.name, existing)
        })
      }

      // Add virtual ports for local server
      if (server.isLocal) {
        virtualPorts.forEach((vp) => {
          // Use the virtual port name as the key
          const existing = portsByName.get(vp.name) ?? { inputId: null, outputId: null, isVirtual: true }
          existing.isVirtual = true
          if (vp.type === 'input') {
            existing.inputId = `virtual:${vp.id}`
          } else {
            existing.outputId = `virtual:${vp.id}`
          }
          portsByName.set(vp.name, existing)
        })
      }

      const portCount = portsByName.size
      const serverHeight =
        SERVER_HEADER_HEIGHT +
        SERVER_PADDING_Y * 2 +
        portCount * PORT_NODE_HEIGHT +
        Math.max(0, portCount - 1) * PORT_SPACING_Y

      // Server node (container for ports)
      result.push({
        id: serverNodeId,
        type: 'server',
        position: { x: serverX, y: serverY },
        style: {
          width: SERVER_WIDTH,
          height: Math.max(serverHeight, SERVER_HEADER_HEIGHT + SERVER_PADDING_Y * 2)
        },
        data: {
          label: server.isLocal ? 'Local' : server.serverName,
          apiUrl: server.apiUrl,
          isLocal: server.isLocal,
          connectionStatus: serverStatuses.get(server.apiUrl) ?? 'disconnected',
          portCount
        } satisfies ServerNodeData
      })

      // Port nodes (children of server)
      let portIndex = 0
      portsByName.forEach((portIds, portName) => {
        const portNodeId = `port:${server.apiUrl}:${portName}`
        // Position relative to server node (parent)
        const relativeX = SERVER_PADDING_X
        const relativeY =
          SERVER_HEADER_HEIGHT + SERVER_PADDING_Y + portIndex * (PORT_NODE_HEIGHT + PORT_SPACING_Y)

        result.push({
          id: portNodeId,
          type: 'port',
          position: { x: relativeX, y: relativeY },
          parentId: serverNodeId,
          extent: 'parent',
          data: {
            label: portName,
            serverUrl: server.apiUrl,
            serverName: server.isLocal ? 'Local' : server.serverName,
            inputPortId: portIds.inputId,
            outputPortId: portIds.outputId,
            isVirtual: portIds.isVirtual
          } satisfies PortNodeData
        })
        portIndex++
      })
    })

    return result
  }, [servers, fetchState.ports, serverStatuses, savedPositions, virtualPorts])

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
