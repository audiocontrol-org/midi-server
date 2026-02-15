import { useState, useEffect, useCallback } from 'react'
import { StatusIndicator } from '@/components/StatusIndicator'

interface RemoteServerStatus {
  running: boolean
  pid: number | null
  port: number | null
}

interface RemoteServerControlProps {
  serverUrl: string
  serverName: string
  connectionStatus: 'connected' | 'disconnected' | 'checking'
  getStatus: (serverUrl: string) => Promise<RemoteServerStatus>
  startServer: (serverUrl: string) => Promise<RemoteServerStatus>
  stopServer: (serverUrl: string) => Promise<{ success: boolean }>
}

export function RemoteServerControl({
  serverUrl,
  serverName,
  connectionStatus,
  getStatus,
  startServer,
  stopServer
}: RemoteServerControlProps): React.JSX.Element {
  const [serverStatus, setServerStatus] = useState<RemoteServerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch server status periodically
  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      try {
        const status = await getStatus(serverUrl)
        setServerStatus(status)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get status')
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [serverUrl, getStatus])

  const handleStart = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await startServer(serverUrl)
      setServerStatus(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server')
    } finally {
      setLoading(false)
    }
  }, [serverUrl, startServer])

  const handleStop = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await stopServer(serverUrl)
      setServerStatus({ running: false, pid: null, port: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop server')
    } finally {
      setLoading(false)
    }
  }, [serverUrl, stopServer])

  const isConnected = connectionStatus === 'connected'

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{serverName}</h2>
        <StatusIndicator connected={isConnected} />
      </div>

      <div className="text-sm text-gray-400">{serverUrl}</div>

      {/* Server Process Control */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">MIDI Server Process</h3>
        <div className="flex items-center gap-3">
          {serverStatus && (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${serverStatus.running ? 'bg-green-500' : 'bg-gray-500'}`}
              />
              <span className="text-sm text-gray-400">
                {serverStatus.running ? `Running on port ${serverStatus.port}` : 'Stopped'}
              </span>
            </div>
          )}
          <button
            onClick={serverStatus?.running ? handleStop : handleStart}
            disabled={loading || !isConnected}
            className={`px-4 py-1 rounded-md font-medium text-sm transition-colors ${
              serverStatus?.running
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? '...' : serverStatus?.running ? 'Stop Server' : 'Start Server'}
          </button>
          {serverStatus?.running && serverStatus.pid && (
            <span className="text-xs text-gray-500">PID: {serverStatus.pid}</span>
          )}
        </div>
        {error && (
          <div className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
