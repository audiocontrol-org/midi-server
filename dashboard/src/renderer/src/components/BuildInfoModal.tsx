import { useEffect } from 'react'
import type { BuildInfo } from '@/platform'
import { useConsoleLogs } from '@/hooks/useConsoleLogs'
import { ConsoleLogViewer } from '@/components/ConsoleLogViewer'
import { GitHubIssueButton } from '@/components/GitHubIssueButton'

interface BuildInfoModalProps {
  buildInfo?: BuildInfo | null
  isOpen: boolean
  onClose: () => void
}

export function BuildInfoModal({
  buildInfo,
  isOpen,
  onClose
}: BuildInfoModalProps): React.JSX.Element | null {
  const { filteredLogs, logs, filters, toggleFilter, clearLogs } = useConsoleLogs()

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl h-[80vh] bg-gray-900 rounded-lg shadow-xl border border-gray-700 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Build Info & Console</h2>
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

        {buildInfo && (
          <div className="p-4 border-b border-gray-700 bg-gray-800/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block">Version</span>
                <span className="text-white font-mono">{buildInfo.version}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Commit</span>
                <span className="text-white font-mono">{buildInfo.commit}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Build Time</span>
                <span className="text-white font-mono text-xs">
                  {new Date(buildInfo.buildTime).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Serial</span>
                <span className="text-white font-mono text-xs">{buildInfo.serial}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-4 min-h-0 overflow-hidden">
          <ConsoleLogViewer
            logs={filteredLogs}
            filters={filters}
            buildInfo={buildInfo}
            onToggleFilter={toggleFilter}
            onClear={clearLogs}
          />
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
          <GitHubIssueButton buildInfo={buildInfo} logs={logs} />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
