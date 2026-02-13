import type {
  PortsResponse,
  HealthResponse,
  OpenPortResponse,
  MessagesResponse,
  SendMessageRequest,
  SendMessageResponse
} from '@/types/api'

export class MidiServerClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health')
  }

  async getPorts(): Promise<PortsResponse> {
    return this.request<PortsResponse>('/ports')
  }

  async openPort(id: number): Promise<OpenPortResponse> {
    return this.request<OpenPortResponse>(`/port/${id}`, {
      method: 'POST'
    })
  }

  async closePort(id: number): Promise<void> {
    await this.request(`/port/${id}`, {
      method: 'DELETE'
    })
  }

  async getMessages(portId: number): Promise<MessagesResponse> {
    return this.request<MessagesResponse>(`/port/${portId}/messages`)
  }

  async sendMessage(portId: number, data: SendMessageRequest): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>(`/port/${portId}/send`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
}

export const createClient = (baseUrl: string): MidiServerClient => new MidiServerClient(baseUrl)
