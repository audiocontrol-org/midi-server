import * as http from 'http'
import * as https from 'https'

export interface RemotePort {
  id: number
  name: string
  type: 'input' | 'output'
}

export interface RemotePortsResponse {
  inputs: RemotePort[]
  outputs: RemotePort[]
}

export interface RemoteHealthResponse {
  status: 'ok' | 'error'
  uptime?: number
}

export interface RemoteMessagesResponse {
  messages: number[][]
}

export interface RemoteSendResponse {
  success: boolean
  error?: string
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: string
  timeout?: number
}

/**
 * Extract the numeric port index from a portId like "input-2" or "output-1"
 */
function extractPortIndex(portId: string): string {
  const match = portId.match(/^(?:input|output)-(\d+)$/)
  return match ? match[1] : portId
}

export class RemoteClient {
  private baseUrl: string
  private defaultTimeout: number

  constructor(serverUrl: string, timeout = 5000) {
    // Ensure URL ends without trailing slash
    this.baseUrl = serverUrl.replace(/\/$/, '')
    this.defaultTimeout = timeout
  }

  private request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl)
      const isHttps = url.protocol === 'https:'
      const httpModule = isHttps ? https : http

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }

      // Explicitly set Content-Length when there's a body
      if (options.body) {
        headers['Content-Length'] = String(Buffer.byteLength(options.body))
      }

      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers,
        timeout: options.timeout ?? this.defaultTimeout
      }

      const req = httpModule.request(reqOptions, (res) => {
        const chunks: Buffer[] = []

        res.on('data', (chunk: Buffer) => chunks.push(chunk))

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString()

          if (res.statusCode && res.statusCode >= 400) {
            let errorMsg = `HTTP ${res.statusCode}`
            try {
              const json = JSON.parse(body)
              if (json.error) errorMsg = json.error
            } catch {
              // Use default error message
            }
            reject(new Error(errorMsg))
            return
          }

          try {
            const json = JSON.parse(body)
            resolve(json)
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      })

      req.on('error', (err) => {
        reject(new Error(`Request failed: ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })

      if (options.body) {
        req.write(options.body)
      }

      req.end()
    })
  }

  async health(): Promise<RemoteHealthResponse> {
    // Check the API server health, not the MIDI server
    return this.request<RemoteHealthResponse>('/api/health')
  }

  async midiHealth(): Promise<RemoteHealthResponse> {
    return this.request<RemoteHealthResponse>('/midi/health')
  }

  async getPorts(): Promise<RemotePortsResponse> {
    const raw = await this.request<{ inputs: string[]; outputs: string[] }>('/midi/ports')
    return {
      inputs: raw.inputs.map((name, index) => ({ id: index, name, type: 'input' as const })),
      outputs: raw.outputs.map((name, index) => ({ id: index, name, type: 'output' as const }))
    }
  }

  async openPort(portId: string, name: string, type: 'input' | 'output'): Promise<{ success: boolean }> {
    const index = extractPortIndex(portId)
    return this.request<{ success: boolean }>(`/midi/port/${index}`, {
      method: 'POST',
      body: JSON.stringify({ name, type })
    })
  }

  async closePort(portId: string): Promise<{ success: boolean }> {
    const index = extractPortIndex(portId)
    return this.request<{ success: boolean }>(`/midi/port/${index}`, {
      method: 'DELETE'
    })
  }

  async getMessages(portId: string): Promise<RemoteMessagesResponse> {
    const index = extractPortIndex(portId)
    return this.request<RemoteMessagesResponse>(`/midi/port/${index}/messages`)
  }

  async sendMessage(portId: string, message: number[]): Promise<RemoteSendResponse> {
    const index = extractPortIndex(portId)
    return this.request<RemoteSendResponse>(`/midi/port/${index}/send`, {
      method: 'POST',
      body: JSON.stringify({ message })
    })
  }
}

// Client cache to reuse connections
const clientCache = new Map<string, RemoteClient>()

export function getRemoteClient(serverUrl: string): RemoteClient {
  let client = clientCache.get(serverUrl)
  if (!client) {
    client = new RemoteClient(serverUrl)
    clientCache.set(serverUrl, client)
  }
  return client
}

export function clearClientCache(): void {
  clientCache.clear()
}
