import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { PortNodeData } from '@/hooks/useRouteGraph'

type PortNode = Node<PortNodeData, 'port'>

function PortNodeComponent({ data }: NodeProps<PortNode>): React.JSX.Element {
  const hasInput = data.inputPortId !== null
  const hasOutput = data.outputPortId !== null

  return (
    <div
      className="
        bg-gray-600 rounded px-3 py-1.5 text-sm border border-gray-500 shadow
        hover:bg-gray-550 hover:border-gray-400 transition-colors
        flex items-center gap-2 min-w-[140px]
      "
    >
      {/* Inlet handle (LEFT) - receives MIDI from routes */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="inlet"
          className="!w-2.5 !h-2.5 !border-2 !border-gray-400 !bg-blue-500 !-left-1"
        />
      )}

      {/* Port name */}
      <span className="text-white truncate flex-1 text-center" title={data.label}>
        {data.label}
      </span>

      {/* Outlet handle (RIGHT) - sends MIDI to routes */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="outlet"
          className="!w-2.5 !h-2.5 !border-2 !border-gray-400 !bg-green-500 !-right-1"
        />
      )}
    </div>
  )
}

export const PortNode = memo(PortNodeComponent)
