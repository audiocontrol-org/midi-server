import type { UpdateStatus } from '@shared/types/update'

interface UpdateNotificationProps {
  status: UpdateStatus
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
}

export function UpdateNotification(props: UpdateNotificationProps): React.JSX.Element | null {
  const { status, onCheck, onDownload, onInstall } = props
  const isWorking =
    status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'installing'

  if (status.phase === 'available') {
    return (
      <div className="bg-blue-900/40 border border-blue-700 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-blue-200 font-medium">Update available: {status.availableVersion}</p>
          <p className="text-blue-300 text-sm">{status.message ?? 'A new version is ready to download.'}</p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={isWorking}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50"
        >
          Download
        </button>
      </div>
    )
  }

  if (status.phase === 'downloaded') {
    return (
      <div className="bg-green-900/40 border border-green-700 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-green-200 font-medium">Update ready to install</p>
          <p className="text-green-300 text-sm">{status.message ?? 'Restart to apply the update.'}</p>
        </div>
        <button
          type="button"
          onClick={onInstall}
          disabled={isWorking}
          className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-white disabled:opacity-50"
        >
          Install & Restart
        </button>
      </div>
    )
  }

  if (status.phase === 'error') {
    return (
      <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-red-200 font-medium">Update error</p>
          <p className="text-red-300 text-sm">{status.lastError ?? status.message ?? 'Unknown error'}</p>
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={isWorking}
          className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-white disabled:opacity-50"
        >
          Retry Check
        </button>
      </div>
    )
  }

  return null
}
