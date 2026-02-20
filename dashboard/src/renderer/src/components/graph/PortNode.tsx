import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { PortNodeData } from '@/hooks/useRouteGraph'

type PortNode = Node<PortNodeData, 'port'>

// Custom comparison to prevent re-renders when data hasn't changed
function arePropsEqual(
  prev: NodeProps<PortNode>,
  next: NodeProps<PortNode>
): boolean {
  const prevData = prev.data
  const nextData = next.data
  return (
    prevData.label === nextData.label &&
    prevData.serverUrl === nextData.serverUrl &&
    prevData.serverName === nextData.serverName &&
    prevData.inputPortId === nextData.inputPortId &&
    prevData.outputPortId === nextData.outputPortId
  )
}

function PortNodeComponent({ data }: NodeProps<PortNode>): React.JSX.Element {
  const hasInput = data.inputPortId !== null
  const hasOutput = data.outputPortId !== null

  return (
    <div
      className="
        bg-gray-600 rounded px-3 py-1.5 text-sm border border-gray-500 shadow
        hover:bg-gray-550 hover:border-gray-400 transition-colors
        flex items-center gap-2
      "
      style={{ width: 180, height: 36 }}
    >
      {/* Inlet handle (LEFT) - receives MIDI from routes */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="inlet"
          className="!w-3 !h-3 !border-2 !border-gray-400 !bg-blue-500 !-left-1.5"
        />
      )}

      {/* Port name */}
      <span className="text-white truncate flex-1 text-center text-xs" title={data.label}>
        {data.label}
      </span>

      {/* Outlet handle (RIGHT) - sends MIDI to routes */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="outlet"
          className="!w-3 !h-3 !border-2 !border-gray-400 !bg-green-500 !-right-1.5"
        />
      )}
    </div>
  )
}

export const PortNode = memo(PortNodeComponent, arePropsEqual)
