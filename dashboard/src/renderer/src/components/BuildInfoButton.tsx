interface BuildInfoButtonProps {
  serial?: string
  onClick: () => void
}

const MAX_DISPLAY_LENGTH = 16

function truncateSerial(serial: string): string {
  if (serial.length <= MAX_DISPLAY_LENGTH) return serial
  return serial.slice(0, MAX_DISPLAY_LENGTH - 1) + '…'
}

export function BuildInfoButton({ serial, onClick }: BuildInfoButtonProps): React.JSX.Element {
  const displayText = serial ? truncateSerial(serial) : 'Logs'

  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs font-mono
                 bg-gray-800/80 hover:bg-gray-700/80
                 border border-gray-600 hover:border-gray-500
                 rounded-full text-gray-400 hover:text-gray-300
                 transition-colors cursor-pointer whitespace-nowrap"
      title={serial ? `${serial} - Click to view build info and logs` : 'View console logs'}
    >
      {displayText}
    </button>
  )
}
