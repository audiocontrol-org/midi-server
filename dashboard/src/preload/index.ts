import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { LogEntry, BuildInfo } from '@shared/types/log-entry'

// Typed API for renderer process
const electronAPI = {
  startServer: (port: number) => ipcRenderer.invoke(IPC_CHANNELS.SERVER_START, { port }),

  stopServer: () => ipcRenderer.invoke(IPC_CHANNELS.SERVER_STOP),

  getServerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SERVER_STATUS),

  getStorageItem: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET, { key }),

  setStorageItem: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SET, { key, value }),

  getLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.LOGS_GET),

  clearLogs: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.LOGS_CLEAR),

  getBuildInfo: (): Promise<BuildInfo> => ipcRenderer.invoke(IPC_CHANNELS.BUILD_INFO_GET),

  onLogEntry: (callback: (entry: LogEntry) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, entry: LogEntry): void => {
      callback(entry)
    }
    ipcRenderer.on(IPC_CHANNELS.LOGS_NEW, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LOGS_NEW, handler)
    }
  },

  addLog: (message: string, severity: LogEntry['severity']): Promise<LogEntry> =>
    ipcRenderer.invoke(IPC_CHANNELS.LOGS_ADD, { message, severity })
}

// Expose API to renderer via contextBridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electronAPI:', error)
  }
} else {
  // Fallback for non-isolated context (not recommended)
  // @ts-expect-error define in global
  window.electronAPI = electronAPI
}
