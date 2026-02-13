import type { LogEntry, LogSeverity } from '@shared/types/log-entry'

const MAX_ENTRIES = 1000

export class LogBuffer {
  private entries: LogEntry[] = []
  private idCounter = 0

  add(message: string, severity: LogSeverity, source: LogEntry['source'] = 'system'): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${++this.idCounter}`,
      timestamp: Date.now(),
      severity,
      message: message.trim(),
      source
    }

    this.entries.push(entry)

    // Trim to max size
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES)
    }

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
