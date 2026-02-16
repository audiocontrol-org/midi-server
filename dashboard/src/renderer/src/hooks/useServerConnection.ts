import { useState, useCallback, useEffect, useRef } from 'react'
import { MidiServerClient, createClient } from '@/api/client'
import { platform } from '@/platform'
import type { ConnectionStatus, PortsResponse, HealthResponse } from '@/types/api'

interface UseServerConnectionOptions {
  pollInterval?: number
  autoConnect?: boolean
}

interface UseServerConnectionReturn {
  status: ConnectionStatus
  health: HealthResponse | null
  ports: PortsResponse | null
  client: MidiServerClient | null
  connect: () => void
  disconnect: () => void
  refresh: () => Promise<void>
}

export function useServerConnection(
  options: UseServerConnectionOptions = {}
): UseServerConnectionReturn {
  const { pollInterval = 5000, autoConnect = true } = options

  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    url: null,
    error: null
  })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [ports, setPorts] = useState<PortsResponse | null>(null)

  const clientRef = useRef<MidiServerClient | null>(null)
  const pollIntervalRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!clientRef.current) return

    try {
      const [healthData, portsData] = await Promise.all([
        clientRef.current.health(),
        clientRef.current.getPorts()
      ])

      setHealth(healthData)
      setPorts(portsData)
      setStatus((prev) => ({
        ...prev,
        connected: true,
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      platform.addLog(`Connection error: ${message}`, 'error')
      setStatus((prev) => ({
        ...prev,
        connected: false,
        error: message
      }))
      setHealth(null)
      setPorts(null)
    }
  }, [])

  const connect = useCallback(() => {
    // Create client connected to API server's MIDI proxy
    clientRef.current = createClient()
    const apiUrl = platform.apiBaseUrl

    setStatus({
      connected: false,
      url: apiUrl,
      error: null
    })

    refresh()

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    pollIntervalRef.current = window.setInterval(refresh, pollInterval)
  }, [refresh, pollInterval])

  const disconnect = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    clientRef.current = null
    setStatus({
      connected: false,
      url: null,
      error: null
    })
    setHealth(null)
    setPorts(null)
  }, [])

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return (): void => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [autoConnect, connect])

  return {
    status,
    health,
    ports,
    client: clientRef.current,
    connect,
    disconnect,
    refresh
  }
}
