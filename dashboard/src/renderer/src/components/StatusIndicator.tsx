interface StatusIndicatorProps {
  connected: boolean
  label?: string
}

export function StatusIndicator({ connected, label }: StatusIndicatorProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      {label && (
        <span className="text-sm text-gray-400">
          {label}: {connected ? 'Connected' : 'Disconnected'}
        </span>
      )}
    </div>
  )
}
