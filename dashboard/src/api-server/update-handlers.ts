import type { IncomingMessage, ServerResponse } from 'http'
import type { UpdateService, UpdateSettings } from '@shared/types/update'

export class UpdateHandlers {
  private updateService: UpdateService | null
  private sseClients: Set<ServerResponse> = new Set()
  private unsubscribe: (() => void) | null = null

  constructor(updateService?: UpdateService) {
    this.updateService = updateService ?? null

    if (this.updateService) {
      this.unsubscribe = this.updateService.onStatusChange((event) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`
        for (const client of this.sseClients) {
          client.write(payload)
        }
      })
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    for (const client of this.sseClients) {
      client.end()
    }
    this.sseClients.clear()
  }

  handleStatus(res: ServerResponse): void {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    this.sendJson(res, this.updateService.getStatus())
  }

  async handleCheck(res: ServerResponse): Promise<void> {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    const status = await this.updateService.checkForUpdates()
    this.sendJson(res, status)
  }

  async handleDownload(res: ServerResponse): Promise<void> {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    const status = await this.updateService.downloadUpdate()
    this.sendJson(res, status)
  }

  async handleInstall(res: ServerResponse): Promise<void> {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    await this.updateService.installUpdate()
    this.sendJson(res, { success: true })
  }

  handleGetSettings(res: ServerResponse): void {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    this.sendJson(res, this.updateService.getSettings())
  }

  async handlePutSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    const body = await this.readJsonBody<Partial<UpdateSettings>>(req)
    if (!body) {
      return this.sendJson(res, { error: 'Invalid request body' }, 400)
    }

    const settings = this.updateService.updateSettings(body)
    this.sendJson(res, settings)
  }

  handleStream(res: ServerResponse): void {
    if (!this.updateService) {
      return this.sendNotConfigured(res)
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    this.sseClients.add(res)
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
    res.write(
      `data: ${JSON.stringify({ type: 'status', status: this.updateService.getStatus() })}\n\n`
    )

    res.on('close', () => {
      this.sseClients.delete(res)
    })
  }

  private sendNotConfigured(res: ServerResponse): void {
    this.sendJson(res, { error: 'Update service not available in this runtime' }, 501)
  }

  private sendJson(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }

  private readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const contentLength = req.headers['content-length']
      if (!contentLength || contentLength === '0') {
        resolve(null)
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString())
          resolve(body)
        } catch {
          resolve(null)
        }
      })
      req.on('error', reject)
    })
  }
}
