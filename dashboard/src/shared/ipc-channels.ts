export const IPC_CHANNELS = {
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_STATUS: 'server:status',
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',
  LOGS_GET: 'logs:get',
  LOGS_CLEAR: 'logs:clear',
  LOGS_NEW: 'logs:new',
  LOGS_ADD: 'logs:add',
  BUILD_INFO_GET: 'build-info:get'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// Payload types for each channel
export interface ServerStartPayload {
  port: number
  binaryPath?: string
}

export interface ServerStatusResponse {
  running: boolean
  pid: number | null
  port: number | null
  url: string | null
}

export interface StorageGetPayload {
  key: string
}

export interface StorageSetPayload {
  key: string
  value: string
}

// Re-export types from shared types
export type { LogEntry, LogSeverity, BuildInfo } from './types/log-entry'
