import type { Route, DiscoveredServer } from '@/api/client'

interface RoutingPanelProps {
  routes: Route[]
  servers: DiscoveredServer[]
  onToggleRoute: (routeId: string, enabled: boolean) => void
  onDeleteRoute: (routeId: string) => void
  onAddRoute: () => void
}

export function RoutingPanel({
  routes,
  servers,
  onToggleRoute,
  onDeleteRoute,
  onAddRoute
}: RoutingPanelProps): React.JSX.Element {
  const getServerName = (serverUrl: string): string => {
    const server = servers.find((s) => s.apiUrl === serverUrl)
    if (server?.isLocal) return 'Local'
    return server?.serverName ?? serverUrl
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      case 'disabled':
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active':
        return 'Active'
      case 'error':
        return 'Error'
      case 'disabled':
      default:
        return 'Disabled'
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">MIDI Routes</h2>
        <button
          onClick={onAddRoute}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
        >
          Add Route
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          No routes configured. Add a route to forward MIDI between servers.
        </p>
      ) : (
        <div className="space-y-2">
          {routes.map((route) => (
            <div
              key={route.id}
              className="bg-gray-700 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Status indicator */}
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusColor(route.status?.status ?? 'disabled')}`}
                  title={route.status?.error ?? getStatusLabel(route.status?.status ?? 'disabled')}
                />

                {/* Route description */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Source */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-gray-400 text-sm truncate">
                      {getServerName(route.source.serverUrl)}
                    </span>
                    <span className="text-gray-500">:</span>
                    <span className="text-white text-sm truncate" title={route.source.portName}>
                      {route.source.portName}
                    </span>
                  </div>

                  {/* Arrow */}
                  <span className="text-gray-500 flex-shrink-0">→</span>

                  {/* Destination */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-gray-400 text-sm truncate">
                      {getServerName(route.destination.serverUrl)}
                    </span>
                    <span className="text-gray-500">:</span>
                    <span className="text-white text-sm truncate" title={route.destination.portName}>
                      {route.destination.portName}
                    </span>
                  </div>
                </div>

                {/* Message count */}
                {route.status && route.status.messagesRouted > 0 && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {route.status.messagesRouted} msgs
                  </span>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 ml-3">
                {/* Enable/Disable toggle */}
                <button
                  onClick={() => onToggleRoute(route.id, !route.enabled)}
                  className={`
                    w-10 h-5 rounded-full transition-colors relative
                    ${route.enabled ? 'bg-blue-600' : 'bg-gray-600'}
                  `}
                  title={route.enabled ? 'Disable route' : 'Enable route'}
                >
                  <span
                    className={`
                      absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
                      ${route.enabled ? 'left-5' : 'left-0.5'}
                    `}
                  />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => onDeleteRoute(route.id)}
                  className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                  title="Delete route"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
