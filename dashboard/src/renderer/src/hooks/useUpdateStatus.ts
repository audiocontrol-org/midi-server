import { useCallback, useEffect, useState } from 'react'
import { usePlatform } from './usePlatform'
import type { UpdateSettings, UpdateStatus } from '@shared/types/update'

interface UseUpdateStatusResult {
  supported: boolean
  loading: boolean
  status: UpdateStatus | null
  settings: UpdateSettings | null
  checkNow: () => Promise<void>
  downloadNow: () => Promise<void>
  installNow: () => Promise<void>
  saveSettings: (patch: Partial<UpdateSettings>) => Promise<void>
}

export function useUpdateStatus(): UseUpdateStatusResult {
  const platform = usePlatform()
  const [supported, setSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [settings, setSettings] = useState<UpdateSettings | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const [nextStatus, nextSettings] = await Promise.all([
          platform.getUpdateStatus(),
          platform.getUpdateSettings()
        ])
        if (!cancelled) {
          setStatus(nextStatus)
          setSettings(nextSettings)
          setSupported(true)
        }
      } catch (err) {
        if (!cancelled && isUnsupportedError(err)) {
          setSupported(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [platform])

  useEffect(() => {
    if (!supported) {
      return
    }

    return platform.onUpdateStatus((nextStatus) => {
      setStatus(nextStatus)
    })
  }, [platform, supported])

  const checkNow = useCallback(async () => {
    const nextStatus = await platform.checkForUpdates()
    setStatus(nextStatus)
  }, [platform])

  const downloadNow = useCallback(async () => {
    const nextStatus = await platform.downloadUpdate()
    setStatus(nextStatus)
  }, [platform])

  const installNow = useCallback(async () => {
    await platform.installUpdate()
  }, [platform])

  const saveSettings = useCallback(
    async (patch: Partial<UpdateSettings>) => {
      const nextSettings = await platform.setUpdateSettings(patch)
      setSettings(nextSettings)
    },
    [platform]
  )

  return {
    supported,
    loading,
    status,
    settings,
    checkNow,
    downloadNow,
    installNow,
    saveSettings
  }
}

function isUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('501') || message.includes('not available in this runtime')
}
