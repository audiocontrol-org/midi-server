/**
 * Server Status Components
 *
 * Compact status indicators for the site header showing:
 * - Local server status (running/stopped)
 * - MIDI connection status
 * - Remote server count
 */

interface ServerStatusProps {
  /** Whether the local server is running */
  isServerRunning: boolean
  /** Whether connected to the MIDI server API */
  isConnected: boolean
  /** Server URL when running */
  serverUrl?: string | null
  /** Number of discovered remote servers */
  remoteServerCount: number
}

export function ServerStatus({
  isServerRunning,
  isConnected,
  serverUrl,
  remoteServerCount
}: ServerStatusProps): React.JSX.Element {
  const serverStatus = isServerRunning ? 'running' : 'stopped'
  const connectionStatus = isConnected ? 'connected' : 'disconnected'

  return (
    <div className="server-status">
      {/* Local server status */}
      <div className="status-indicator" data-status={serverStatus}>
        <span className="status-dot" data-status={serverStatus} />
        <span className="status-label">
          {isServerRunning ? 'Server Running' : 'Server Stopped'}
        </span>
        {serverUrl && <span className="status-detail">{serverUrl}</span>}
      </div>

      {/* Connection status */}
      <div className="status-indicator" data-status={connectionStatus}>
        <span className="status-dot" data-status={connectionStatus} />
        <span className="status-label">{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Remote servers */}
      {remoteServerCount > 0 && (
        <div className="status-indicator">
          <span className="status-badge">{remoteServerCount}</span>
          <span className="status-label">Remote {remoteServerCount === 1 ? 'Server' : 'Servers'}</span>
        </div>
      )}
    </div>
  )
}

interface ServerActionsProps {
  /** Whether the local server is running */
  isServerRunning: boolean
  /** Whether connected to the MIDI server API */
  isConnected: boolean
  /** Whether the platform can manage the server */
  canManageServer: boolean
  /** Start the server */
  onStartServer: () => void
  /** Stop the server */
  onStopServer: () => void
  /** Connect to the server */
  onConnect: () => void
  /** Disconnect from the server */
  onDisconnect: () => void
}

export function ServerActions({
  isServerRunning,
  isConnected,
  canManageServer,
  onStartServer,
  onStopServer,
  onConnect,
  onDisconnect
}: ServerActionsProps): React.JSX.Element {
  return (
    <div className="server-actions">
      {canManageServer && (
        <>
          {isServerRunning ? (
            <button onClick={onStopServer} className="btn btn-sm btn-danger" title="Stop server">
              Stop
            </button>
          ) : (
            <button onClick={onStartServer} className="btn btn-sm btn-primary" title="Start server">
              Start
            </button>
          )}
        </>
      )}
      {isConnected ? (
        <button onClick={onDisconnect} className="btn btn-sm" title="Disconnect">
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="btn btn-sm btn-primary"
          disabled={canManageServer && !isServerRunning}
          title="Connect to server"
        >
          Connect
        </button>
      )}
    </div>
  )
}
