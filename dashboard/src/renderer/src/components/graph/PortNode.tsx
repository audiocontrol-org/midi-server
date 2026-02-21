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
    prevData.outputPortId === nextData.outputPortId &&
    prevData.isVirtual === nextData.isVirtual
  )
}

function PortNodeComponent({ data }: NodeProps<PortNode>): React.JSX.Element {
  const hasInput = data.inputPortId !== null
  const hasOutput = data.outputPortId !== null
  const isVirtual = data.isVirtual ?? false

  // Virtual ports have dashed border and purple accent
  const borderClass = isVirtual
    ? 'border-dashed border-purple-500'
    : 'border-solid border-gray-500'

  return (
    <div
      className={`
        bg-gray-600 rounded px-3 py-1.5 text-sm border shadow
        hover:bg-gray-550 hover:border-gray-400 transition-colors
        flex items-center gap-2
        ${borderClass}
      `}
      style={{ width: 180, height: 36 }}
      title={isVirtual ? `${data.label} (Virtual)` : data.label}
    >
      {/* Inlet handle (LEFT) - receives MIDI from routes */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="inlet"
          className={`!w-3 !h-3 !border-2 !border-gray-400 !-left-1.5 ${isVirtual ? '!bg-purple-500' : '!bg-blue-500'}`}
        />
      )}

      {/* Virtual indicator */}
      {isVirtual && (
        <span className="text-purple-400 text-[10px] flex-shrink-0">V</span>
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
          className={`!w-3 !h-3 !border-2 !border-gray-400 !-right-1.5 ${isVirtual ? '!bg-purple-500' : '!bg-green-500'}`}
        />
      )}
    </div>
  )
}

export const PortNode = memo(PortNodeComponent, arePropsEqual)
