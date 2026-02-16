import { useEffect } from 'react'
import { UpdateNotification } from '@/components/UpdateNotification'
import { UpdateProgress } from '@/components/UpdateProgress'
import { UpdateSettings } from '@/components/UpdateSettings'
import type { UpdateSettings as UpdateSettingsType, UpdateStatus } from '@shared/types/update'

interface UpdateSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  status: UpdateStatus
  settings: UpdateSettingsType
  onCheck: () => Promise<void>
  onDownload: () => Promise<void>
  onInstall: () => Promise<void>
  onSave: (patch: Partial<UpdateSettingsType>) => Promise<void>
}

export function UpdateSettingsModal({
  isOpen,
  onClose,
  status,
  settings,
  onCheck,
  onDownload,
  onInstall,
  onSave
}: UpdateSettingsModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-gray-900 rounded-lg shadow-xl border border-gray-700 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Update Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <UpdateNotification
            status={status}
            onCheck={() => void onCheck()}
            onDownload={() => void onDownload()}
            onInstall={() => void onInstall()}
          />
          <UpdateProgress status={status} />
          <UpdateSettings settings={settings} onSave={onSave} onCheck={onCheck} />
        </div>
      </div>
    </div>
  )
}
