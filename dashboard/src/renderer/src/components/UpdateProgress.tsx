import type { UpdateStatus } from '@shared/types/update'

interface UpdateProgressProps {
  status: UpdateStatus
}

export function UpdateProgress({ status }: UpdateProgressProps): React.JSX.Element | null {
  if (status.phase !== 'downloading' && status.phase !== 'checking') {
    return null
  }

  const progress = status.phase === 'downloading' ? Math.round(status.downloadProgress ?? 0) : 0

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-300">{status.message ?? 'Updating...'}</p>
        <p className="text-sm text-gray-400">{status.phase === 'downloading' ? `${progress}%` : ''}</p>
      </div>
      {status.phase === 'downloading' && (
        <div className="w-full bg-gray-700 rounded h-2 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
