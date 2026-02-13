export interface MidiPort {
  id: number
  name: string
  type: 'input' | 'output'
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
