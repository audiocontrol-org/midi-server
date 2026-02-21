import { useState, useEffect } from 'react'

interface AddVirtualPortModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, type: 'input' | 'output') => void
}

export function AddVirtualPortModal({
  isOpen,
  onClose,
  onSave
}: AddVirtualPortModalProps): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [type, setType] = useState<'input' | 'output'>('input')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('')
      setType('input')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = (): void => {
    if (!name.trim()) return
    onSave(name.trim(), type)
  }

  const isValid = name.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold text-white mb-4">Create Virtual Port</h2>

        {/* Port name */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Port Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., DAW Output"
            className="w-full bg-gray-700 text-white rounded px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>

        {/* Port type */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Port Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="portType"
                checked={type === 'input'}
                onChange={() => setType('input')}
                className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
              />
              <span className="text-white">Input</span>
              <span className="text-xs text-gray-500">(receives MIDI from software)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="portType"
                checked={type === 'output'}
                onChange={() => setType('output')}
                className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
              />
              <span className="text-white">Output</span>
              <span className="text-xs text-gray-500">(sends MIDI to software)</span>
            </label>
          </div>
        </div>

        {/* Info text */}
        <div className="mb-6 p-3 bg-gray-700/50 rounded text-sm text-gray-400">
          <p>
            Virtual ports appear as MIDI devices in your DAW or other software. Use them to route
            MIDI between software applications and physical MIDI devices on remote machines.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Create Port
          </button>
        </div>
      </div>
    </div>
  )
}
