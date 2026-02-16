import type { DiscoveredServer } from '@/api/client'

interface ServerTabsProps {
  servers: DiscoveredServer[]
  selectedServerUrl: string | null
  localServerUrl: string | null
  onSelectServer: (serverUrl: string) => void
  serverStatuses: Map<string, 'connected' | 'disconnected' | 'checking'>
}

export function ServerTabs({
  servers,
  selectedServerUrl,
  localServerUrl,
  onSelectServer,
  serverStatuses
}: ServerTabsProps): React.JSX.Element {
  // Sort servers: local first, then alphabetically by name
  const sortedServers = [...servers].sort((a, b) => {
    if (a.isLocal !== b.isLocal) {
      return a.isLocal ? -1 : 1
    }
    return a.serverName.localeCompare(b.serverName)
  })

  const getStatusColor = (serverUrl: string): string => {
    const status = serverStatuses.get(serverUrl)
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'checking':
        return 'bg-yellow-500'
      case 'disconnected':
      default:
        return 'bg-red-500'
    }
  }

  const getStatusLabel = (serverUrl: string): string => {
    const status = serverStatuses.get(serverUrl)
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'checking':
        return 'Checking...'
      case 'disconnected':
      default:
        return 'Disconnected'
    }
  }

  if (sortedServers.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 mb-4">
        <p className="text-gray-500 text-sm text-center">No servers discovered</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-2 mb-4">
      <div className="flex flex-wrap gap-2">
        {sortedServers.map((server) => {
          const isSelected = server.apiUrl === selectedServerUrl
          const isLocal = server.apiUrl === localServerUrl

          return (
            <button
              key={server.apiUrl}
              onClick={() => onSelectServer(server.apiUrl)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
              `}
              title={`${server.apiUrl}\n${getStatusLabel(server.apiUrl)}`}
            >
              {/* Status indicator */}
              <span
                className={`w-2 h-2 rounded-full ${getStatusColor(server.apiUrl)}`}
                title={getStatusLabel(server.apiUrl)}
              />

              {/* Server name */}
              <span className="font-medium">
                {isLocal ? 'Local' : server.serverName}
              </span>

              {/* Local badge */}
              {isLocal && (
                <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-gray-300">
                  This machine
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
