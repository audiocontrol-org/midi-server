interface BuildInfoButtonProps {
  serial?: string
  onClick: () => void
}

export function BuildInfoButton({ serial, onClick }: BuildInfoButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs font-mono
                 bg-gray-800/80 hover:bg-gray-700/80
                 border border-gray-600 hover:border-gray-500
                 rounded-full text-gray-400 hover:text-gray-300
                 transition-colors cursor-pointer"
      title="View build info and console logs"
    >
      {serial ?? 'Logs'}
    </button>
  )
}
