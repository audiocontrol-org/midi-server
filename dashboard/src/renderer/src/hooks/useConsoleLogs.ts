import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePlatform } from '@/hooks/usePlatform'
import { logStore } from '@/stores/log-store'
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
  clearLogs: () => void
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
  const [logs, setLogs] = useState<LogEntry[]>(() => logStore.getAll())
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS)
  const [isLoading, setIsLoading] = useState(false)

  // Try to fetch logs from API and merge with local store
  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const entries = await platform.getLogs()
      logStore.merge(entries)
      setLogs(logStore.getAll())
    } catch (error) {
      // API unavailable - that's fine, we still have local logs
      console.warn('[useConsoleLogs] Could not fetch from API:', error)
      setLogs(logStore.getAll())
    } finally {
      setIsLoading(false)
    }
  }, [platform])

  // Clear logs locally (and try API)
  const clearLogs = useCallback(() => {
    logStore.clear()
    setLogs([])
    // Try to clear API logs too, but don't wait for it
    platform.clearLogs().catch(() => {
      // Ignore API errors
    })
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

  // Subscribe to local log store changes
  useEffect(() => {
    const unsubscribe = logStore.subscribe((entry) => {
      setLogs((prev) => [...prev, entry])
    })
    return unsubscribe
  }, [])

  // Try to fetch API logs on mount and subscribe to SSE
  useEffect(() => {
    refresh()

    // Also subscribe to API SSE for server-side logs
    const unsubscribe = platform.onLogEntry((entry) => {
      // Add to local store (which will notify us via the subscription above)
      // But check if it's already there to avoid duplicates
      const existing = logStore.getAll()
      if (!existing.some((e) => e.id === entry.id)) {
        logStore.merge([entry])
        setLogs(logStore.getAll())
      }
    })
    return unsubscribe
  }, [platform, refresh])

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
