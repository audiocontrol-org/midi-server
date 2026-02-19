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
    prevData.connectionStatus === nextData.connectionStatus
  )
}

function ServerNodeComponent({ data }: NodeProps<ServerNode>): React.JSX.Element {
  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    checking: 'bg-yellow-500'
  }

  return (
    <div className="bg-gray-700 rounded-lg p-3 min-w-[200px] border border-gray-600 shadow-lg">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${statusColors[data.connectionStatus]}`} />
        <span className="text-white font-medium">{data.label}</span>
        {data.isLocal && (
          <span className="text-xs text-gray-400 bg-gray-600 px-1.5 py-0.5 rounded">Local</span>
        )}
      </div>
      <div className="text-xs text-gray-400 mt-1 truncate" title={data.apiUrl}>
        {data.apiUrl}
      </div>
    </div>
  )
}

export const ServerNode = memo(ServerNodeComponent, arePropsEqual)
