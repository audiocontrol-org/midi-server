import type { MidiPort } from '@/types/api'

interface PortListProps {
  title: string
  ports: MidiPort[]
  openPortIds: Set<string>
  onPortClick?: (port: MidiPort) => void
  selectedPortId?: string | null
}

function generatePortId(port: MidiPort): string {
  // For virtual ports, the id is already a string like "virtual:xyz"
  if (port.isVirtual && typeof port.id === 'string') {
    return port.id
  }
  // Create a URL-safe port ID from name and type
  return `${port.type}-${port.id}`
}

export function PortList({
  title,
  ports,
  openPortIds,
  onPortClick,
  selectedPortId
}: PortListProps): React.JSX.Element {
  if (ports.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        <p className="text-gray-500 text-sm">No ports available</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <ul className="space-y-2">
        {ports.map((port) => {
          const portId = generatePortId(port)
          const isOpen = openPortIds.has(portId)
          const isSelected = selectedPortId === portId

          return (
            <li key={port.id}>
              <button
                onClick={() => onPortClick?.(port)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isOpen
                      ? 'bg-green-700 hover:bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-400' : port.isVirtual ? 'bg-purple-400' : 'bg-gray-500'}`}
                />
                <span className="font-mono text-sm text-gray-400">
                  {port.isVirtual ? '[V]' : `[${port.id}]`}
                </span>
                <span className="flex-1 truncate" title={port.name}>{port.name}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${isOpen ? 'bg-green-800' : 'invisible'}`}
                >
                  Open
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export { generatePortId }
