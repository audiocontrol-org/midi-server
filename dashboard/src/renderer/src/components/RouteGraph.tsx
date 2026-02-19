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

  // Validate connections - in the graph UI, users drag from output handles to input handles
  // But in MIDI routing terms: source=input port (receives MIDI), destination=output port (sends MIDI)
  // The connection will be swapped in onConnect to match MIDI semantics
  const isValidConnection = useCallback((connection: Edge | Connection): boolean => {
    const sourcePort = getPortFromNodeId(connection.source)
    const targetPort = getPortFromNodeId(connection.target)

    if (!sourcePort || !targetPort) return false
    if (sourcePort.portType !== 'output') return false
    if (targetPort.portType !== 'input') return false

    return true
  }, [])

  // Handle new connections - create routes
  // In the graph: user drags from OUTPUT port (connection.source) to INPUT port (connection.target)
  // In MIDI routing: source=INPUT port (receives MIDI), destination=OUTPUT port (sends MIDI)
  // So we swap: route source = connection.target (INPUT), route destination = connection.source (OUTPUT)
  const onConnect = useCallback(
    async (connection: Connection) => {
      const graphSourcePort = getPortFromNodeId(connection.source) // OUTPUT port in graph
      const graphTargetPort = getPortFromNodeId(connection.target) // INPUT port in graph

      if (!graphSourcePort || !graphTargetPort) return

      // Find port names from the nodes
      const graphSourceNode = nodes.find((n) => n.id === connection.source)
      const graphTargetNode = nodes.find((n) => n.id === connection.target)

      if (!graphSourceNode || !graphTargetNode) return

      // Swap for MIDI routing semantics: INPUT port is route source, OUTPUT port is route destination
      const sourceEndpoint: RouteEndpoint = {
        serverUrl: graphTargetPort.serverUrl,
        portId: graphTargetPort.portId,
        portName: (graphTargetNode.data as { label: string }).label
      }

      const destinationEndpoint: RouteEndpoint = {
        serverUrl: graphSourcePort.serverUrl,
        portId: graphSourcePort.portId,
        portName: (graphSourceNode.data as { label: string }).label
      }

      try {
        await onCreateRoute(sourceEndpoint, destinationEndpoint)
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
            if (node.type === 'port') {
              const data = node.data as { portType: string }
              return data.portType === 'input' ? '#3b82f6' : '#22c55e'
            }
            return '#6b7280'
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-gray-700"
        />
      </ReactFlow>
    </div>
  )
}
