import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { PortNodeData } from '@/hooks/useRouteGraph'

type PortNode = Node<PortNodeData, 'port'>

// Input icon (arrow pointing in)
function InputIcon(): React.JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 12H5m7-7l-7 7 7 7"
      />
    </svg>
  )
}

// Output icon (arrow pointing out)
function OutputIcon(): React.JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14m-7-7l7 7-7 7"
      />
    </svg>
  )
}

function PortNodeComponent({ data }: NodeProps<PortNode>): React.JSX.Element {
  const isInput = data.portType === 'input'

  return (
    <div
      className={`
        bg-gray-600 rounded px-2 py-1 text-sm border border-gray-500 shadow
        hover:bg-gray-550 hover:border-gray-400 transition-colors
        flex items-center gap-1.5 min-w-[120px]
        ${isInput ? 'flex-row' : 'flex-row-reverse'}
      `}
    >
      {/* Handle for connections */}
      <Handle
        type={isInput ? 'target' : 'source'}
        position={isInput ? Position.Left : Position.Right}
        className={`
          !w-3 !h-3 !border-2 !border-gray-400
          ${isInput ? '!bg-blue-500' : '!bg-green-500'}
        `}
      />

      {/* Icon */}
      <span className={isInput ? 'text-blue-400' : 'text-green-400'}>
        {isInput ? <InputIcon /> : <OutputIcon />}
      </span>

      {/* Port name */}
      <span className="text-white truncate flex-1" title={data.label}>
        {data.label}
      </span>
    </div>
  )
}

export const PortNode = memo(PortNodeComponent)
