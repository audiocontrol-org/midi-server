import type {
  PortsResponse,
  HealthResponse,
  MessagesResponse
} from '@/types/api'
import { platform } from '@/platform'

export interface OpenPortRequest {
  name: string
  type: 'input' | 'output'
}

export interface SendMessageResponse {
  success: boolean
  error?: string
}

export class MidiServerClient {
  private baseUrl: string

  constructor(baseUrl?: string) {
    // Use platform's API base URL + /midi path for MIDI server proxy
    this.baseUrl = baseUrl ?? `${platform.apiBaseUrl}/midi`
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const body = await response.text()
      let errorMsg = `HTTP ${response.status}: ${response.statusText}`
      try {
        const json = JSON.parse(body)
        if (json.error) errorMsg = json.error
      } catch {
        // Use default error message
      }
      throw new Error(errorMsg)
    }

    return response.json()
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health')
  }

  async getPorts(): Promise<PortsResponse> {
    // Server returns { inputs: string[], outputs: string[] }
    // Transform to { inputs: MidiPort[], outputs: MidiPort[] }
    const raw = await this.request<{ inputs: string[]; outputs: string[] }>('/ports')
    return {
      inputs: raw.inputs.map((name, index) => ({ id: index, name, type: 'input' as const })),
      outputs: raw.outputs.map((name, index) => ({ id: index, name, type: 'output' as const }))
    }
  }

  async openPort(portId: string, name: string, type: 'input' | 'output'): Promise<{ success: boolean }> {
    // Server expects JSON body with name and type
    // Use compact JSON (no spaces) for the body since server's parser is basic
    const body = JSON.stringify({ name, type })
    return this.request<{ success: boolean }>(`/port/${portId}`, {
      method: 'POST',
      body
    })
  }

  async closePort(portId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/port/${portId}`, {
      method: 'DELETE'
    })
  }

  async getMessages(portId: string): Promise<MessagesResponse> {
    // Server returns { messages: number[][] }
    const raw = await this.request<{ messages: number[][] }>(`/port/${portId}/messages`)
    return {
      messages: raw.messages.map((data, index) => ({
        timestamp: Date.now() - (raw.messages.length - index) * 10, // Approximate timestamps
        data
      }))
    }
  }

  async sendMessage(portId: string, message: number[]): Promise<SendMessageResponse> {
    // Server expects {"message":[...]} with no spaces (basic JSON parser)
    const body = JSON.stringify({ message })
    return this.request<SendMessageResponse>(`/port/${portId}/send`, {
      method: 'POST',
      body
    })
  }
}

export const createClient = (baseUrl?: string): MidiServerClient => new MidiServerClient(baseUrl)
