import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePlatform } from '@/hooks/usePlatform'
import type { LogEntry, LogSeverity } from '@/platform'

export interface LogFilters {
  debug: boolean
  info: boolean
  warning: boolean
  error: boolean
}

export interface UseConsoleLogsResult {
  logs: LogEntry[]
  filteredLogs: LogEntry[]
  filters: LogFilters
  setFilters: (filters: LogFilters) => void
  toggleFilter: (severity: LogSeverity) => void
  clearLogs: () => Promise<void>
  refresh: () => Promise<void>
  isLoading: boolean
}

const DEFAULT_FILTERS: LogFilters = {
  debug: true,
  info: true,
  warning: true,
  error: true
}

export function useConsoleLogs(): UseConsoleLogsResult {
  const platform = usePlatform()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS)
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const entries = await platform.getLogs()
      setLogs(entries)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [platform])

  const clearLogs = useCallback(async () => {
    try {
      await platform.clearLogs()
      setLogs([])
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }, [platform])

  const toggleFilter = useCallback((severity: LogSeverity) => {
    setFilters((prev) => ({
      ...prev,
      [severity]: !prev[severity]
    }))
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => filters[log.severity])
  }, [logs, filters])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to new log entries
  useEffect(() => {
    const unsubscribe = platform.onLogEntry((entry) => {
      setLogs((prev) => [...prev, entry])
    })
    return unsubscribe
  }, [platform])

  return {
    logs,
    filteredLogs,
    filters,
    setFilters,
    toggleFilter,
    clearLogs,
    refresh,
    isLoading
  }
}
