/**
 * MIDI message formatting utilities.
 * Converts raw MIDI byte arrays into human-readable strings.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function formatMidiMessage(data: number[]): string {
  if (data.length === 0) return '(empty)'

  const status = data[0]
  const channel = (status & 0x0f) + 1
  const type = status & 0xf0

  if (status === 0xf0) {
    return `SysEx [${data.length} bytes]`
  }

  switch (type) {
    case 0x80: {
      const note = data[1]
      const velocity = data[2]
      const noteName = NOTE_NAMES[note % 12] + Math.floor(note / 12 - 1)
      return `Note Off ch${channel} ${noteName} vel=${velocity}`
    }
    case 0x90: {
      const note = data[1]
      const velocity = data[2]
      const noteName = NOTE_NAMES[note % 12] + Math.floor(note / 12 - 1)
      return velocity > 0
        ? `Note On ch${channel} ${noteName} vel=${velocity}`
        : `Note Off ch${channel} ${noteName}`
    }
    case 0xa0:
      return `Aftertouch ch${channel} note=${data[1]} pressure=${data[2]}`
    case 0xb0:
      return `CC ch${channel} cc${data[1]}=${data[2]}`
    case 0xc0:
      return `Program ch${channel} prog=${data[1]}`
    case 0xd0:
      return `Ch Pressure ch${channel} pressure=${data[1]}`
    case 0xe0: {
      const bend = data[1] | (data[2] << 7)
      return `Pitch Bend ch${channel} value=${bend - 8192}`
    }
    default:
      return `[${data.map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`
  }
}

export type MidiMessageType = 'all' | 'note' | 'cc' | 'sysex' | 'system' | 'other'

/**
 * Classify a MIDI message by its type for filtering purposes.
 */
export function classifyMidiMessage(data: number[]): MidiMessageType {
  if (data.length === 0) return 'other'

  const status = data[0]
  const type = status & 0xf0

  if (status === 0xf0) return 'sysex'
  if (status >= 0xf1) return 'system'

  switch (type) {
    case 0x80:
    case 0x90:
      return 'note'
    case 0xb0:
      return 'cc'
    default:
      return 'other'
  }
}

/**
 * Format a timestamp as HH:MM:SS.mmm
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const millis = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}
