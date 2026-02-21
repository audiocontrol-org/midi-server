import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useNodesState,
  useEdgesState
} from '@xyflow/react'
import type { Connection, NodeChange, OnNodesChange, Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { ServerNode } from '@/components/graph/ServerNode'
import { PortNode } from '@/components/graph/PortNode'
import { RouteEdge } from '@/components/graph/RouteEdge'
import { useRouteGraph, getPortFromNodeId } from '@/hooks/useRouteGraph'
import type { PortNodeData } from '@/hooks/useRouteGraph'
import { useNodePositions } from '@/hooks/useNodePositions'
import { useGraphGestures } from '@/hooks/useGraphGestures'
import type { Route, DiscoveredServer, RouteEndpoint, VirtualPortConfig } from '@/api/client'
import type { PortsResponse } from '@/types/api'

interface RouteGraphProps {
  routes: Route[]
  servers: DiscoveredServer[]
  virtualPorts: VirtualPortConfig[]
  serverStatuses: Map<string, 'connected' | 'disconnected' | 'checking'>
  fetchServerPorts: (serverUrl: string) => Promise<PortsResponse>
  onCreateRoute: (
    source: RouteEndpoint,
    destination: RouteEndpoint,
    sourceServerApiUrl: string
  ) => Promise<void>
  onDeleteRoute: (routeId: string) => Promise<void>
  onToggleRoute: (routeId: string, enabled: boolean) => Promise<void>
}

const nodeTypes = {
  server: ServerNode,
  port: PortNode
}

const edgeTypes = {
  route: RouteEdge
}

export function RouteGraph({
  routes,
  servers,
  virtualPorts,
  serverStatuses,
  fetchServerPorts,
  onCreateRoute,
  onDeleteRoute
}: RouteGraphProps): React.JSX.Element {
  const { positions, updatePosition } = useNodePositions()
  const gestures = useGraphGestures()

  // Get computed nodes/edges from hook (stable arrays - only change when data changes)
  const {
    nodes: stableNodes,
    edges: stableEdges,
    loading
  } = useRouteGraph({
    routes,
    servers,
    virtualPorts,
    serverStatuses,
    fetchServerPorts,
    savedPositions: positions
  })

  // React Flow's internal state
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Track previous stable arrays to detect actual changes
  const prevNodesRef = useRef<Node[]>([])
  const prevEdgesRef = useRef<Edge[]>([])

  // Sync nodes only when the stable array reference changes
  useEffect(() => {
    if (loading) return
    if (stableNodes === prevNodesRef.current) return

    prevNodesRef.current = stableNodes

    setNodes((currentNodes) => {
      if (currentNodes.length === 0) {
        return stableNodes
      }

      // Merge: preserve user-dragged positions
      const currentPosMap = new Map(currentNodes.map((n) => [n.id, n.position]))
      return stableNodes.map((node) => {
        const currentPos = currentPosMap.get(node.id)
        if (currentPos && (currentPos.x !== node.position.x || currentPos.y !== node.position.y)) {
          return { ...node, position: currentPos }
        }
        return node
      })
    })
  }, [stableNodes, loading, setNodes])

  // Sync edges only when the stable array reference changes
  useEffect(() => {
    if (loading) return
    if (stableEdges === prevEdgesRef.current) return

    prevEdgesRef.current = stableEdges
    setEdges(stableEdges)
  }, [stableEdges, loading, setEdges])

  // Track position changes and persist them
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeBase(changes)

      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          updatePosition(change.id, change.position)
        }
      })
    },
    [onNodesChangeBase, updatePosition]
  )

  // Validate connections
  const isValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      if (!connection.sourceHandle || !connection.targetHandle) return false
      if (connection.sourceHandle !== 'outlet') return false
      if (connection.targetHandle !== 'inlet') return false
      if (connection.source === connection.target) return false

      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)

      if (!sourceNode || !targetNode) return false

      const sourceData = sourceNode.data as PortNodeData
      const targetData = targetNode.data as PortNodeData

      if (!sourceData.inputPortId) return false
      if (!targetData.outputPortId) return false

      return true
    },
    [nodes]
  )

  // Convert API URL to MIDI server URL for routing
  const getMidiServerUrl = useCallback(
    (apiUrl: string): string => {
      const server = servers.find((s) => s.apiUrl === apiUrl)
      if (!server || server.isLocal) return 'local'
      try {
        const url = new URL(server.apiUrl)
        return `http://${url.hostname}:${server.midiServerPort}`
      } catch {
        return apiUrl
      }
    },
    [servers]
  )

  // Handle new connections
  const onConnect = useCallback(
    async (connection: Connection) => {
      const sourceInfo = getPortFromNodeId(connection.source, connection.sourceHandle ?? null)
      const targetInfo = getPortFromNodeId(connection.target, connection.targetHandle ?? null)

      if (!sourceInfo || !targetInfo) return

      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)

      if (!sourceNode || !targetNode) return

      const sourceData = sourceNode.data as PortNodeData
      const targetData = targetNode.data as PortNodeData

      // Source API URL (from node ID) - used to determine which server owns the route
      const sourceServerApiUrl = sourceInfo.serverUrl

      const routeSource: RouteEndpoint = {
        serverUrl: getMidiServerUrl(sourceInfo.serverUrl),
        portId: sourceData.inputPortId ?? '',
        portName: sourceData.label
      }

      const routeDestination: RouteEndpoint = {
        serverUrl: getMidiServerUrl(targetInfo.serverUrl),
        portId: targetData.outputPortId ?? '',
        portName: targetData.label
      }

      try {
        await onCreateRoute(routeSource, routeDestination, sourceServerApiUrl)
      } catch (err) {
        console.error('Failed to create route:', err)
      }
    },
    [nodes, onCreateRoute, getMidiServerUrl]
  )

  // Handle edge deletion
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedEdge = edges.find((e) => e.selected)
        const routeId = (selectedEdge?.data as { routeId?: string } | undefined)?.routeId
        if (routeId) {
          onDeleteRoute(routeId)
        }
      }
    },
    [edges, onDeleteRoute]
  )

  // Calculate available height for the graph container
  const graphHeight = 'calc(100vh - var(--site-header-height) - var(--page-header-height) - var(--page-section-gap) * 2)'

  if (loading) {
    return (
      <div
        className="bg-gray-800 rounded-lg p-4 min-h-[400px] flex items-center justify-center"
        style={{ height: graphHeight }}
      >
        <div className="text-gray-400">Loading graph...</div>
      </div>
    )
  }

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden min-h-[400px]"
      style={{ height: graphHeight }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        panOnDrag={gestures.panOnDrag}
        panOnScroll={gestures.panOnScroll}
        panOnScrollMode={gestures.panOnScrollMode}
        zoomOnScroll={gestures.zoomOnScroll}
        zoomOnPinch={gestures.zoomOnPinch}
        minZoom={0.25}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'route'
        }}
      >
        <Background color="#374151" gap={20} />
        <Controls className="!bg-gray-700 !border-gray-600" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'server') return '#6366f1'
            if (node.type === 'port') return '#6b7280'
            return '#6b7280'
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-gray-700"
        />
      </ReactFlow>
    </div>
  )
}
