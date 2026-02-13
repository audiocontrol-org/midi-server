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

export interface OpenPortResponse {
  success: boolean
  port: MidiPort
}

export interface MidiMessage {
  timestamp: number
  data: number[]
}

export interface MessagesResponse {
  messages: MidiMessage[]
}

export interface SendMessageRequest {
  data: number[]
}

export interface SendMessageResponse {
  success: boolean
}

export interface ConnectionStatus {
  connected: boolean
  url: string | null
  error: string | null
}
