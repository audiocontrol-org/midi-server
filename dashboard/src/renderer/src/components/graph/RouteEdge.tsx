import { memo } from 'react'
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { RouteEdgeData } from '@/hooks/useRouteGraph'

type RouteEdge = Edge<RouteEdgeData, 'route'>

interface RouteEdgeProps extends EdgeProps<RouteEdge> {
  onDeleteRoute?: (routeId: string) => void
}

function RouteEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected
}: RouteEdgeProps): React.JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })

  const statusColors = {
    active: '#22c55e', // green-500
    error: '#ef4444', // red-500
    disabled: '#6b7280' // gray-500
  }

  const status = data?.status ?? 'disabled'
  const isEnabled = data?.enabled ?? false
  const isAnimating = data?.isAnimating ?? false
  const strokeColor = statusColors[status]
  const strokeWidth = selected ? 3 : 2
  const strokeDasharray = isEnabled ? undefined : '5 5'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray
        }}
        className={isAnimating ? 'midi-edge-animated' : ''}
      />

      {/* Label showing message count */}
      {data && data.messagesRouted > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all'
            }}
            className="bg-gray-800 text-xs text-gray-300 px-1.5 py-0.5 rounded border border-gray-600"
          >
            {data.messagesRouted} msgs
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const RouteEdge = memo(RouteEdgeComponent)
