import type { PortsResponse, HealthResponse, MessagesResponse } from '@/types/api'
import { platform } from '@/platform'

export interface OpenPortRequest {
  name: string
  type: 'input' | 'output'
}

export interface SendMessageResponse {
  success: boolean
  error?: string
}

// Discovery types
export interface DiscoveredServer {
  serverName: string
  apiUrl: string
  midiServerPort: number
  lastSeen: number
  isLocal: boolean
}

export interface DiscoveryStatus {
  serverName: string
  localUrl: string
  discoveredCount: number
}

// Route types
export interface RouteEndpoint {
  serverUrl: string
  portId: string
  portName: string
}

export interface RouteStatus {
  routeId: string
  status: 'active' | 'error' | 'disabled'
  error?: string
  messagesRouted: number
  lastMessageTime: number | null
}

export interface Route {
  id: string
  enabled: boolean
  source: RouteEndpoint
  destination: RouteEndpoint
  status?: RouteStatus
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

export class ApiClient {
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? platform.apiBaseUrl
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

  // Discovery endpoints
  async getDiscoveredServers(): Promise<{ servers: DiscoveredServer[] }> {
    return this.request<{ servers: DiscoveredServer[] }>('/api/discovery/servers')
  }

  async getDiscoveryStatus(): Promise<DiscoveryStatus> {
    return this.request<DiscoveryStatus>('/api/discovery/status')
  }

  async setServerName(name: string): Promise<{ success: boolean; serverName: string }> {
    return this.request<{ success: boolean; serverName: string }>('/api/discovery/name', {
      method: 'POST',
      body: JSON.stringify({ name })
    })
  }

  // Route management endpoints
  async getRoutes(): Promise<{ routes: Route[] }> {
    return this.request<{ routes: Route[] }>('/api/routes')
  }

  async createRoute(route: {
    enabled: boolean
    source: RouteEndpoint
    destination: RouteEndpoint
  }): Promise<{ route: Route }> {
    return this.request<{ route: Route }>('/api/routes', {
      method: 'POST',
      body: JSON.stringify(route)
    })
  }

  async updateRoute(
    routeId: string,
    updates: Partial<{ enabled: boolean; source: RouteEndpoint; destination: RouteEndpoint }>
  ): Promise<{ route: Route }> {
    return this.request<{ route: Route }>(`/api/routes/${routeId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  }

  async deleteRoute(routeId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/routes/${routeId}`, {
      method: 'DELETE'
    })
  }

  // Remote server proxy endpoints
  async getRemoteServerPorts(serverUrl: string): Promise<PortsResponse> {
    const encodedUrl = encodeURIComponent(serverUrl)
    return this.request<PortsResponse>(`/api/servers/${encodedUrl}/ports`)
  }

  async getRemoteServerHealth(serverUrl: string): Promise<HealthResponse> {
    const encodedUrl = encodeURIComponent(serverUrl)
    return this.request<HealthResponse>(`/api/servers/${encodedUrl}/health`)
  }

  async sendToRemoteServer(
    serverUrl: string,
    portId: string,
    message: number[]
  ): Promise<SendMessageResponse> {
    const encodedUrl = encodeURIComponent(serverUrl)
    return this.request<SendMessageResponse>(`/api/servers/${encodedUrl}/port/${portId}/send`, {
      method: 'POST',
      body: JSON.stringify({ message })
    })
  }
}

export const createClient = (baseUrl?: string): MidiServerClient => new MidiServerClient(baseUrl)
export const createApiClient = (baseUrl?: string): ApiClient => new ApiClient(baseUrl)
