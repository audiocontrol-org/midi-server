import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ServerNodeData } from '@/hooks/useRouteGraph'

type ServerNode = Node<ServerNodeData, 'server'>

// Custom comparison to prevent re-renders when data hasn't changed
function arePropsEqual(
  prev: NodeProps<ServerNode>,
  next: NodeProps<ServerNode>
): boolean {
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

function ServerNodeComponent({ data }: NodeProps<ServerNode>): React.JSX.Element {
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

  return (
    <div
      className={`
        w-full h-full rounded-lg border-2 ${borderColors[data.connectionStatus]}
        bg-gray-800/60 backdrop-blur-sm
      `}
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
  )
}

export const ServerNode = memo(ServerNodeComponent, arePropsEqual)
