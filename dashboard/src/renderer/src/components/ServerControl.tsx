import { useState } from 'react'
import type { ConnectionStatus } from '@/types/api'
import type { ServerProcess } from '@/platform'
import { StatusIndicator } from '@/components/StatusIndicator'

interface ServerControlProps {
  connectionStatus: ConnectionStatus
  serverProcess: ServerProcess | null
  canManageServer: boolean
  onConnect: (url: string) => void
  onDisconnect: () => void
  onRefresh: () => void
  onStartServer?: (port: number) => void
  onStopServer?: () => void
}

export function ServerControl({
  connectionStatus,
  serverProcess,
  canManageServer,
  onConnect,
  onDisconnect,
  onRefresh,
  onStartServer,
  onStopServer
}: ServerControlProps): React.JSX.Element {
  const [url, setUrl] = useState(connectionStatus.url || 'http://localhost:8080')
  const [serverPort, setServerPort] = useState(8080)

  const handleConnectSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (connectionStatus.connected) {
      onDisconnect()
    } else {
      onConnect(url)
    }
  }

  const handleServerToggle = (): void => {
    if (serverProcess?.running) {
      onStopServer?.()
    } else {
      onStartServer?.(serverPort)
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">MIDI HTTP Server</h2>
        <StatusIndicator connected={connectionStatus.connected} />
      </div>

      {/* Server Process Control (Electron only) */}
      {canManageServer && (
        <div className="border-b border-gray-700 pb-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Server Process</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="server-port" className="text-sm text-gray-400">
                Port:
              </label>
              <input
                id="server-port"
                type="number"
                value={serverPort}
                onChange={(e) => setServerPort(Number(e.target.value))}
                disabled={serverProcess?.running}
                className="w-20 px-2 py-1 bg-gray-700 rounded border border-gray-600
                           focus:border-blue-500 focus:outline-none disabled:opacity-50 text-sm"
              />
            </div>
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

      {/* Connection Control */}
      <form onSubmit={handleConnectSubmit} className="space-y-3">
        <div>
          <label htmlFor="server-url" className="block text-sm text-gray-400 mb-1">
            {canManageServer ? 'Server URL (auto-filled when running)' : 'Server URL'}
          </label>
          <input
            id="server-url"
            type="text"
            value={canManageServer && serverProcess?.url ? serverProcess.url : url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={connectionStatus.connected || (canManageServer && serverProcess?.running)}
            className="w-full px-3 py-2 bg-gray-700 rounded-md border border-gray-600
                       focus:border-blue-500 focus:outline-none disabled:opacity-50"
            placeholder="http://localhost:8080"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
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
      </form>

      {connectionStatus.error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-md">
          <p className="text-red-300 text-sm">{connectionStatus.error}</p>
        </div>
      )}
    </div>
  )
}
