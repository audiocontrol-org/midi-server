import * as http from 'http'
import type { MidiClient, PortInfo } from './midi-client'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: string
  timeout?: number
}

interface RawPortsResponse {
  inputs: string[]
  outputs: string[]
}

function extractPortIndex(portId: string): string {
  const match = portId.match(/^(?:input|output)-(\d+)$/)
  return match ? match[1] : portId
}

export class LocalClient implements MidiClient {
  private baseUrl: string
  private defaultTimeout: number

  constructor(midiServerPort: number, timeout = 5000) {
    if (!midiServerPort || isNaN(midiServerPort) || midiServerPort < 0) {
      throw new Error(`Invalid MIDI server port: ${midiServerPort}`)
    }
    this.baseUrl = `http://localhost:${midiServerPort}`
    this.defaultTimeout = timeout
  }

  private request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }

      if (options.body) {
        headers['Content-Length'] = String(Buffer.byteLength(options.body))
      }

      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers,
        timeout: options.timeout ?? this.defaultTimeout
      }

      const req = http.request(reqOptions, (res) => {
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

  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health')
  }

  async getPorts(): Promise<{ inputs: PortInfo[]; outputs: PortInfo[] }> {
    const raw = await this.request<RawPortsResponse>('/ports')
    return {
      inputs: raw.inputs.map((name, index) => ({ id: index, name, type: 'input' as const })),
      outputs: raw.outputs.map((name, index) => ({ id: index, name, type: 'output' as const }))
    }
  }

  async openPort(portId: string, name: string, type: 'input' | 'output'): Promise<{ success: boolean }> {
    const index = extractPortIndex(portId)
    return this.request<{ success: boolean }>(`/port/${index}`, {
      method: 'POST',
      body: JSON.stringify({ name, type })
    })
  }

  async closePort(portId: string): Promise<{ success: boolean }> {
    const index = extractPortIndex(portId)
    return this.request<{ success: boolean }>(`/port/${index}`, {
      method: 'DELETE'
    })
  }

  async getMessages(portId: string): Promise<{ messages: number[][] }> {
    const index = extractPortIndex(portId)
    return this.request<{ messages: number[][] }>(`/port/${index}/messages`)
  }

  async sendMessage(portId: string, message: number[]): Promise<{ success: boolean; error?: string }> {
    const index = extractPortIndex(portId)
    return this.request<{ success: boolean; error?: string }>(`/port/${index}/send`, {
      method: 'POST',
      body: JSON.stringify({ message })
    })
  }
}

const localClientCache = new Map<number, LocalClient>()

export function getLocalClient(midiServerPort: number): LocalClient {
  let client = localClientCache.get(midiServerPort)
  if (!client) {
    client = new LocalClient(midiServerPort)
    localClientCache.set(midiServerPort, client)
  }
  return client
}

export function clearLocalClientCache(): void {
  localClientCache.clear()
}

