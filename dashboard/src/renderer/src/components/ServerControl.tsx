import type { ConnectionStatus } from '@/types/api'
import type { ServerProcess } from '@/platform'
import { StatusIndicator } from '@/components/StatusIndicator'

interface ServerControlProps {
  connectionStatus: ConnectionStatus
  serverProcess: ServerProcess | null
  serverError?: string | null
  canManageServer: boolean
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
  onStartServer?: (port: number) => void
  onStopServer?: () => void
}

export function ServerControl({
  connectionStatus,
  serverProcess,
  serverError,
  canManageServer,
  onConnect,
  onDisconnect,
  onRefresh,
  onStartServer,
  onStopServer
}: ServerControlProps): React.JSX.Element {
  const handleServerToggle = (): void => {
    if (serverProcess?.running) {
      onStopServer?.()
    } else {
      // Use port 0 to let OS assign an available port
      onStartServer?.(0)
    }
  }

  const handleConnectionToggle = (): void => {
    if (connectionStatus.connected) {
      onDisconnect()
    } else {
      onConnect()
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">MIDI HTTP Server</h2>
        <StatusIndicator connected={connectionStatus.connected} />
      </div>

      {/* Server Process Control */}
      {canManageServer && (
        <div className="border-b border-gray-700 pb-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Server Process</h3>
          <div className="flex items-center gap-3">
            {serverProcess?.running && serverProcess.port && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Port:</span>
                <span className="text-sm text-white font-mono">
                  {serverProcess.port}
                </span>
              </div>
            )}
            <button
              onClick={handleServerToggle}
              className={`px-4 py-1 rounded-md font-medium text-sm transition-colors ${
                serverProcess?.running
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {serverProcess?.running ? 'Stop Server' : 'Start Server'}
            </button>
            {serverProcess?.running && (
              <span className="text-xs text-gray-500">PID: {serverProcess.pid}</span>
            )}
          </div>
        </div>
      )}

      {/* Connection Status - only show when server is running */}
      {serverError && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-md">
          <p className="text-red-300 text-sm">{serverError}</p>
        </div>
      )}

      {serverProcess?.running && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={handleConnectionToggle}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                connectionStatus.connected
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {connectionStatus.connected ? 'Disconnect' : 'Connect'}
            </button>

            {connectionStatus.connected && (
              <button
                type="button"
                onClick={onRefresh}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                Refresh
              </button>
            )}
          </div>

          {connectionStatus.error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-md">
              <p className="text-red-300 text-sm">{connectionStatus.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
