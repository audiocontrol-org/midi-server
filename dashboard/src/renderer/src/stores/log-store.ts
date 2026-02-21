/**
 * Local-first log store.
 * Logs are stored in memory in the renderer process.
 * This ensures logging ALWAYS works, even if the API is unreachable.
 */

import type { LogEntry, LogSeverity } from '@/platform'

type LogListener = (entry: LogEntry) => void

class LogStore {
  private logs: LogEntry[] = []
  private listeners: Set<LogListener> = new Set()
  private idCounter = 0

  /**
   * Add a log entry. This is synchronous and always succeeds.
   */
  add(message: string, severity: LogSeverity, source: 'server' | 'dashboard' | 'system' = 'dashboard'): LogEntry {
    const entry: LogEntry = {
      id: `local-${++this.idCounter}`,
      timestamp: Date.now(),
      severity,
      message,
      source
    }

    this.logs.push(entry)

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(entry)
      } catch (err) {
        console.error('[LogStore] Listener error:', err)
      }
    }

    return entry
  }

  /**
   * Get all logs.
   */
  getAll(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.logs = []
  }

  /**
   * Merge logs from external source (e.g., API).
   * Deduplicates by id and sorts by timestamp.
   */
  merge(entries: LogEntry[]): void {
    const existingIds = new Set(this.logs.map((l) => l.id))
    const newEntries = entries.filter((e) => !existingIds.has(e.id))
    this.logs = [...this.logs, ...newEntries].sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Subscribe to new log entries.
   */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

// Singleton instance
export const logStore = new LogStore()

// Convenience function for adding logs
export function addLog(message: string, severity: LogSeverity = 'info'): LogEntry {
  return logStore.add(message, severity, 'dashboard')
}
