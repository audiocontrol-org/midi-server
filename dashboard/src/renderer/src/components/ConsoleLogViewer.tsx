import { useRef, useEffect, useState } from 'react'
import type { LogEntry, LogSeverity, BuildInfo } from '@/platform'
import type { LogFilters } from '@/hooks/useConsoleLogs'

interface ConsoleLogViewerProps {
  logs: LogEntry[]
  filters: LogFilters
  buildInfo: BuildInfo
  onToggleFilter: (severity: LogSeverity) => void
  onClear: () => void
}

const SEVERITY_COLORS: Record<LogSeverity, string> = {
  debug: 'text-gray-500',
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-red-400'
}

const SEVERITY_BG: Record<LogSeverity, string> = {
  debug: 'bg-gray-500/20',
  info: 'bg-blue-500/20',
  warning: 'bg-yellow-500/20',
  error: 'bg-red-500/20'
}

type LogSource = 'server' | 'dashboard' | 'system'

const SOURCE_COLORS: Record<LogSource, string> = {
  server: 'text-green-400',
  dashboard: 'text-purple-400',
  system: 'text-gray-400'
}

const SOURCE_LABELS: Record<LogSource, string> = {
  server: 'SVR',
  dashboard: 'APP',
  system: 'SYS'
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function ConsoleLogViewer({
  logs,
  filters,
  buildInfo,
  onToggleFilter,
  onClear
}: ConsoleLogViewerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = (): void => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isNearBottom)
  }

  const copyToClipboard = async (): Promise<void> => {
    const header = [
      '=== MIDI Server Dashboard Logs ===',
      `Version: ${buildInfo.version}`,
      `Commit: ${buildInfo.commit}`,
      `Build Time: ${buildInfo.buildTime}`,
      `Serial: ${buildInfo.serial}`,
      `Copied: ${new Date().toISOString()}`,
      '================================',
      ''
    ].join('\n')

    const logText = logs
      .map(
        (log) =>
          `[${formatTimestamp(log.timestamp)}] [${SOURCE_LABELS[log.source]}] [${log.severity.toUpperCase()}] ${log.message}`
      )
      .join('\n')

    await navigator.clipboard.writeText(header + logText)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {(['debug', 'info', 'warning', 'error'] as LogSeverity[]).map((severity) => (
            <button
              key={severity}
              onClick={() => onToggleFilter(severity)}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors cursor-pointer
                ${filters[severity] ? SEVERITY_BG[severity] + ' ' + SEVERITY_COLORS[severity] : 'bg-gray-800 text-gray-600'}`}
            >
              {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={copyToClipboard}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors cursor-pointer"
          >
            Copy
          </button>
          <button
            onClick={onClear}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 mt-3 overflow-y-auto font-mono text-xs space-y-1 min-h-0"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No logs yet</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`flex gap-2 py-0.5 px-2 rounded ${SEVERITY_BG[log.severity]}`}
            >
              <span className="text-gray-500 shrink-0">{formatTimestamp(log.timestamp)}</span>
              <span className={`shrink-0 w-10 ${SOURCE_COLORS[log.source]}`}>
                [{SOURCE_LABELS[log.source]}]
              </span>
              <span className={`shrink-0 w-14 ${SEVERITY_COLORS[log.severity]}`}>
                [{log.severity.toUpperCase().slice(0, 5)}]
              </span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
