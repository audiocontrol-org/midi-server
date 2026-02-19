import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { LocalClient, clearLocalClientCache, getLocalClient } from '../../src/api-server/local-client'

interface CapturedRequest {
  method: string
  path: string
  body: unknown
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')))
        return
      }
      const port = address.port
      server.close((err) => {
        if (err) return reject(err)
        resolve(port)
      })
    })
  })
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
  })
}

async function testLocalClientRequestMapping(): Promise<void> {
  const requests: CapturedRequest[] = []
  const midiPort = await getFreePort()

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? '/'
    const method = req.method ?? 'GET'
    const body = await readJsonBody(req)
    requests.push({ method, path, body })

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (path === '/ports') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ inputs: ['Input A'], outputs: ['Output A'] }))
      return
    }

    if (path === '/port/2/messages') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ messages: [[0x90, 60, 100]] }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  })

  await new Promise<void>((resolve) => server.listen(midiPort, resolve))

  try {
    const client = new LocalClient(midiPort)

    const health = await client.health()
    assert.equal(health.status, 'ok')

    const ports = await client.getPorts()
    assert.deepEqual(ports, {
      inputs: [{ id: 0, name: 'Input A', type: 'input' }],
      outputs: [{ id: 0, name: 'Output A', type: 'output' }]
    })

    const opened = await client.openPort('input-2', 'Input A', 'input')
    assert.equal(opened.success, true)

    const messages = await client.getMessages('input-2')
    assert.deepEqual(messages.messages, [[0x90, 60, 100]])

    const sent = await client.sendMessage('output-2', [0x80, 60, 0])
    assert.equal(sent.success, true)

    const closed = await client.closePort('custom-port-id')
    assert.equal(closed.success, true)

    assert.deepEqual(
      requests.map((r) => ({ method: r.method, path: r.path })),
      [
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/ports' },
        { method: 'POST', path: '/port/2' },
        { method: 'GET', path: '/port/2/messages' },
        { method: 'POST', path: '/port/2/send' },
        { method: 'DELETE', path: '/port/custom-port-id' }
      ]
    )

    assert.deepEqual(requests[2].body, { name: 'Input A', type: 'input' })
    assert.deepEqual(requests[4].body, { message: [0x80, 60, 0] })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}

function testLocalClientCaching(): void {
  clearLocalClientCache()
  const clientA = getLocalClient(18001)
  const clientB = getLocalClient(18001)
  const clientC = getLocalClient(18002)

  assert.equal(clientA, clientB)
  assert.notEqual(clientA, clientC)
}

async function main(): Promise<void> {
  await testLocalClientRequestMapping()
  testLocalClientCaching()
  console.log('local-client tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

