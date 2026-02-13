import type { MidiPort } from '@/types/api'

interface PortListProps {
  title: string
  ports: MidiPort[]
  onPortClick?: (port: MidiPort) => void
  selectedPortId?: number | null
}

export function PortList({
  title,
  ports,
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
        {ports.map((port) => (
          <li key={port.id}>
            <button
              onClick={() => onPortClick?.(port)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                selectedPortId === port.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              <span className="font-mono text-sm">[{port.id}]</span> <span>{port.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
