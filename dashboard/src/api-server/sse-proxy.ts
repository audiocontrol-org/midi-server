import * as http from 'http'
import type { ServerResponse } from 'http'

interface SseProxyConfig {
  targetHost: string
  targetPort: number
}

/**
 * Proxies an SSE connection from the C++ MIDI server to the browser client.
 * Opens a streaming GET request to the upstream server and forwards all
 * SSE frames (event lines, data lines, keepalive comments) verbatim.
 *
 * Cleans up the upstream connection when the client disconnects.
 */
export function proxySseStream(
  res: ServerResponse,
  config: SseProxyConfig,
  upstreamPath: string
): void {
  // Set SSE headers on the client response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const upstreamReq = http.get(
    {
      hostname: config.targetHost,
      port: config.targetPort,
      path: upstreamPath,
      headers: {
        Accept: 'text/event-stream'
      }
    },
    (upstreamRes) => {
      if (
        upstreamRes.statusCode !== undefined &&
        upstreamRes.statusCode !== 200
      ) {
        // Upstream returned an error. Write an SSE error event and close.
        const statusCode = upstreamRes.statusCode
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: `Upstream returned HTTP ${statusCode}` })}\n\n`
        )
        res.end()
        upstreamRes.destroy()
        return
      }

      // Pipe upstream SSE data directly to the client.
      // SSE is a text protocol so we forward raw bytes verbatim.
      upstreamRes.on('data', (chunk: Buffer) => {
        const ok = res.write(chunk)
        // If the client buffer is full, pause upstream until it drains
        if (!ok) {
          upstreamRes.pause()
          res.once('drain', () => {
            upstreamRes.resume()
          })
        }
      })

      upstreamRes.on('end', () => {
        res.end()
      })

      upstreamRes.on('error', (err) => {
        const message = err instanceof Error ? err.message : String(err)
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: `Upstream stream error: ${message}` })}\n\n`
        )
        res.end()
      })
    }
  )

  upstreamReq.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err)
    // Connection to upstream failed entirely
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Bad Gateway',
          message: `Failed to connect to MIDI server SSE stream: ${message}`
        })
      )
    } else {
      // Headers already sent as SSE, write an error event
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: `Upstream connection error: ${message}` })}\n\n`
      )
      res.end()
    }
  })

  // Clean up upstream connection when the client disconnects
  res.on('close', () => {
    upstreamReq.destroy()
  })
}
