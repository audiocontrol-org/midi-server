import type { LogEntry, LogSeverity } from './types'

const MAX_ENTRIES = 1000

export class LogBuffer {
  private entries: LogEntry[] = []
  private idCounter = 0
  private listeners: Set<(entry: LogEntry) => void> = new Set()

  add(message: string, severity: LogSeverity, source: LogEntry['source'] = 'system'): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${++this.idCounter}`,
      timestamp: Date.now(),
      severity,
      message: message.trim(),
      source
    }

    this.entries.push(entry)

    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES)
    }

    this.notifyListeners(entry)
    return entry
  }

  getAll(): LogEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }

  get length(): number {
    return this.entries.length
  }

  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  private notifyListeners(entry: LogEntry): void {
    for (const listener of this.listeners) {
      listener(entry)
    }
  }
}

export function parseSeverityFromMessage(message: string): LogSeverity {
  const lower = message.toLowerCase()
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('exception')) {
    return 'error'
  }
  if (lower.includes('warn')) {
    return 'warning'
  }
  if (lower.includes('debug') || lower.includes('trace')) {
    return 'debug'
  }
  return 'info'
}
