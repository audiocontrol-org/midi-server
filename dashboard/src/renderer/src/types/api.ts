export interface MidiPort {
  id: number | string // number for physical ports, string for virtual ports
  name: string
  type: 'input' | 'output'
  isVirtual?: boolean // true for virtual ports
}

export interface PortsResponse {
  inputs: MidiPort[]
  outputs: MidiPort[]
}

export interface HealthResponse {
  status: 'ok' | 'error'
  uptime?: number
}

export interface MidiMessage {
  timestamp: number
  data: number[]
}

export interface MessagesResponse {
  messages: MidiMessage[]
}

export interface ConnectionStatus {
  connected: boolean
  url: string | null
  error: string | null
}

// Open port state tracking
export interface OpenPort {
  portId: string
  name: string
  type: 'input' | 'output'
  messages: MidiMessage[]
}
