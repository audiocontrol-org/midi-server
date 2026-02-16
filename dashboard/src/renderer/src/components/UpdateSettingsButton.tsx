interface UpdateSettingsButtonProps {
  onClick: () => void
  hasUpdateAvailable: boolean
}

export function UpdateSettingsButton({
  onClick,
  hasUpdateAvailable
}: UpdateSettingsButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="fixed top-4 right-4 z-50 px-3 py-1.5 text-xs font-medium
                 bg-gray-800/80 hover:bg-gray-700/80
                 border border-gray-600 hover:border-gray-500
                 rounded-full text-gray-300 hover:text-white
                 transition-colors cursor-pointer backdrop-blur-sm
                 flex items-center gap-2"
      title="View update settings and status"
    >
      <span>Updates</span>
      {hasUpdateAvailable && (
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      )}
    </button>
  )
}
