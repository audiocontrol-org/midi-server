import { useEffect, useState } from 'react'
import type { UpdateSettings as UpdateSettingsType } from '@shared/types/update'

interface UpdateSettingsProps {
  settings: UpdateSettingsType
  onSave: (patch: Partial<UpdateSettingsType>) => Promise<void>
  onCheck: () => Promise<void>
}

export function UpdateSettings(props: UpdateSettingsProps): React.JSX.Element {
  const { settings, onSave, onCheck } = props
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await onCheck()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Update Settings</h3>
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-100 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      <label className="flex items-center gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={draft.autoCheck}
          onChange={(event) => setDraft((prev) => ({ ...prev, autoCheck: event.target.checked }))}
        />
        Check for updates on startup
      </label>

      <label className="flex items-center gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={draft.autoDownload}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, autoDownload: event.target.checked }))
          }
        />
        Automatically download updates
      </label>

      <label className="flex items-center gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={draft.autoInstallOnQuit}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, autoInstallOnQuit: event.target.checked }))
          }
        />
        Automatically install updates on quit
      </label>

      <div className="grid gap-2">
        <label className="text-sm text-gray-400">Check interval (minutes)</label>
        <input
          type="number"
          min={1}
          value={draft.checkIntervalMinutes}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              checkIntervalMinutes: Number.parseInt(event.target.value, 10) || 1
            }))
          }
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="border-t border-gray-700 pt-4 space-y-3">
        <label className="flex items-center gap-3 text-sm text-yellow-300">
          <input
            type="checkbox"
            checked={draft.devMode}
            onChange={(event) => setDraft((prev) => ({ ...prev, devMode: event.target.checked }))}
          />
          Enable development mode (local build watcher)
        </label>

        <div className="grid gap-2">
          <label className="text-sm text-gray-400">Development build path</label>
          <input
            type="text"
            value={draft.devBuildPath ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, devBuildPath: event.target.value || null }))
            }
            placeholder="~/work/midi-server-work/midi-server/dashboard/dist"
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
