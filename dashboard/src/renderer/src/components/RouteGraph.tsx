import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useNodesState,
  useEdgesState
} from '@xyflow/react'
import type { Connection, NodeChange, OnNodesChange, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { ServerNode } from '@/components/graph/ServerNode'
import { PortNode } from '@/components/graph/PortNode'
import { RouteEdge } from '@/components/graph/RouteEdge'
import { useRouteGraph, getPortFromNodeId } from '@/hooks/useRouteGraph'
import type { PortNodeData } from '@/hooks/useRouteGraph'
import { useNodePositions } from '@/hooks/useNodePositions'
import type { Route, DiscoveredServer, RouteEndpoint } from '@/api/client'
import type { PortsResponse } from '@/types/api'

interface RouteGraphProps {
  routes: Route[]
  servers: DiscoveredServer[]
  serverStatuses: Map<string, 'connected' | 'disconnected' | 'checking'>
  fetchServerPorts: (serverUrl: string) => Promise<PortsResponse>
  onCreateRoute: (source: RouteEndpoint, destination: RouteEndpoint) => Promise<void>
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
  serverStatuses,
  fetchServerPorts,
  onCreateRoute,
  onDeleteRoute
}: RouteGraphProps): React.JSX.Element {
  const { positions, updatePosition } = useNodePositions()

  const {
    nodes: graphNodes,
    edges: graphEdges,
    loading
  } = useRouteGraph({
    routes,
    servers,
    serverStatuses,
    fetchServerPorts,
    savedPositions: positions
  })

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(graphNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges)

  // Update nodes/edges when graph data changes
  useMemo(() => {
    setNodes(graphNodes)
    setEdges(graphEdges)
  }, [graphNodes, graphEdges, setNodes, setEdges])

  // Track position changes and persist them
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeBase(changes)

      // Find position changes and persist them
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          updatePosition(change.id, change.position)
        }
      })
    },
    [onNodesChangeBase, updatePosition]
  )

  // Validate connections
  // User drags from outlet (source handle) to inlet (target handle)
  // This creates a route: inlet's port receives MIDI, outlet's port sends MIDI
  const isValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      // Must have handle IDs
      if (!connection.sourceHandle || !connection.targetHandle) return false

      // Must be outlet -> inlet
      if (connection.sourceHandle !== 'outlet') return false
      if (connection.targetHandle !== 'inlet') return false

      // Source and target must be different nodes
      if (connection.source === connection.target) return false

      // Validate nodes exist and have appropriate handles
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)

      if (!sourceNode || !targetNode) return false

      const sourceData = sourceNode.data as PortNodeData
      const targetData = targetNode.data as PortNodeData

      // Source must have an input port (route receives MIDI from source's input)
      // Target must have an output port (route sends MIDI to target's output)
      if (!sourceData.inputPortId) return false
      if (!targetData.outputPortId) return false

      return true
    },
    [nodes]
  )

  // Handle new connections - create routes
  // Graph: user drags from OUTLET (source node) to INLET (target node)
  // User intent: send MIDI from source node to target node
  // MIDI routing: route.source = INPUT port (receives MIDI), route.destination = OUTPUT port (sends MIDI)
  // So: route.source = source node's INPUT, route.destination = target node's OUTPUT
  const onConnect = useCallback(
    async (connection: Connection) => {
      const sourceInfo = getPortFromNodeId(connection.source, connection.sourceHandle ?? null)
      const targetInfo = getPortFromNodeId(connection.target, connection.targetHandle ?? null)

      if (!sourceInfo || !targetInfo) return

      // Get node data for port IDs
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)

      if (!sourceNode || !targetNode) return

      const sourceData = sourceNode.data as PortNodeData
      const targetData = targetNode.data as PortNodeData

      // Route source = source node's INPUT port (receives MIDI from external device)
      // Route destination = target node's OUTPUT port (sends MIDI to external device)
      const routeSource: RouteEndpoint = {
        serverUrl: sourceInfo.serverUrl,
        portId: sourceData.inputPortId ?? '',
        portName: sourceData.label
      }

      const routeDestination: RouteEndpoint = {
        serverUrl: targetInfo.serverUrl,
        portId: targetData.outputPortId ?? '',
        portName: targetData.label
      }

      try {
        await onCreateRoute(routeSource, routeDestination)
      } catch (err) {
        console.error('Failed to create route:', err)
      }
    },
    [nodes, onCreateRoute]
  )

  // Handle edge deletion via keyboard
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

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 h-[500px] flex items-center justify-center">
        <div className="text-gray-400">Loading graph...</div>
      </div>
    )
  }

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden h-[500px]"
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
        panOnDrag
        zoomOnScroll
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
