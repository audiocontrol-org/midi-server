import type { IncomingMessage, ServerResponse } from 'http'

export interface ProxyConfig {
  targetHost: string
  targetPort: number
}

export async function proxyToMidiServer(
  req: IncomingMessage,
  res: ServerResponse,
  config: ProxyConfig,
  pathWithoutPrefix: string
): Promise<void> {
  const targetUrl = `http://${config.targetHost}:${config.targetPort}${pathWithoutPrefix}`

  try {
    // Read request body if present
    const body = await readRequestBody(req)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Forward content-length if we have a body
    if (body) {
      headers['Content-Length'] = String(Buffer.byteLength(body))
    }

    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers,
      body: body || undefined
    })

    // Forward response status and headers
    res.statusCode = response.status

    const contentType = response.headers.get('content-type')
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    // Stream response body
    const responseBody = await response.text()
    res.end(responseBody)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Bad Gateway', message: `Failed to proxy to MIDI server: ${message}` }))
  }
}

function readRequestBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const contentLength = req.headers['content-length']
    if (!contentLength || contentLength === '0') {
      resolve(null)
      return
    }

    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}
