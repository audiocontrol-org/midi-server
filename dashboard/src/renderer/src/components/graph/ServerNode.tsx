import { memo, useState } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ServerNodeData } from '@/hooks/useRouteGraph'

type ServerNode = Node<ServerNodeData, 'server'>

// Custom comparison to prevent re-renders when data hasn't changed
function arePropsEqual(
  prev: NodeProps<ServerNode>,
  next: NodeProps<ServerNode>
): boolean {
  if (prev.selected !== next.selected) return false
  const prevData = prev.data
  const nextData = next.data
  return (
    prevData.label === nextData.label &&
    prevData.apiUrl === nextData.apiUrl &&
    prevData.isLocal === nextData.isLocal &&
    prevData.connectionStatus === nextData.connectionStatus &&
    prevData.portCount === nextData.portCount
  )
}

function ServerNodeComponent({ data, selected }: NodeProps<ServerNode>): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false)
  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    checking: 'bg-yellow-500'
  }

  const borderColors = {
    connected: 'border-green-600/50',
    disconnected: 'border-red-600/50',
    checking: 'border-yellow-600/50'
  }

  const resizerColors = {
    connected: '#22c55e',
    disconnected: '#ef4444',
    checking: '#eab308'
  }

  const showResizer = isHovered || selected

  return (
    <>
      {/* Invisible hover zone extending beyond the node */}
      <div
        className="absolute"
        style={{ inset: -10, zIndex: -1 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <NodeResizer
        isVisible={showResizer}
        minWidth={180}
        minHeight={100}
        lineClassName="!border-gray-500"
        handleClassName="!w-2.5 !h-2.5 !bg-gray-300 !border-gray-500 !rounded-sm"
        color={resizerColors[data.connectionStatus]}
      />
      <div
        className={`
          w-full h-full rounded-lg border-2 ${borderColors[data.connectionStatus]}
          bg-gray-800/60 backdrop-blur-sm
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Server header */}
        <div className="px-3 py-2 border-b border-gray-700/50 bg-gray-700/40 rounded-t-md">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColors[data.connectionStatus]}`} />
            <span className="text-white font-medium text-sm">{data.label}</span>
            {data.isLocal && (
              <span className="text-[10px] text-gray-400 bg-gray-600 px-1.5 py-0.5 rounded">
                Local
              </span>
            )}
          </div>
        </div>
        {/* Port nodes will be rendered as children inside this area */}
      </div>
    </>
  )
}

export const ServerNode = memo(ServerNodeComponent, arePropsEqual)
