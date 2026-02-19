import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

interface MidiRequest {
  method: string
  path: string
  body: unknown
}

interface BuildInfo {
  version: string
  commit: string
  buildTime: string
  serial: string
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createNetServer()
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

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return {
    status: response.status,
    body: (await response.json()) as T
  }
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const response = await fetch(url)
  return {
    status: response.status,
    body: (await response.json()) as T
  }
}

function makeBuildInfo(): BuildInfo {
  return {
    version: '0.1.0',
    commit: 'test',
    buildTime: new Date().toISOString(),
    serial: 'v0.1.0-test'
  }
}

async function configureIsolatedRoutesStorage(): Promise<() => void> {
  const previous = process.env.MIDI_SERVER_CONFIG_DIR
  const dir = await mkdtemp(join(tmpdir(), 'midi-server-local-routing-test-'))
  await writeFile(join(dir, 'routes.json'), JSON.stringify({ routes: [] }), 'utf8')
  process.env.MIDI_SERVER_CONFIG_DIR = dir

  return () => {
    if (previous === undefined) {
      delete process.env.MIDI_SERVER_CONFIG_DIR
      return
    }
    process.env.MIDI_SERVER_CONFIG_DIR = previous
  }
}

async function waitFor<T>(
  predicate: () => T | undefined,
  timeoutMs: number,
  label: string
): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = predicate()
    if (value !== undefined) {
      return value
    }
    await sleep(50)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function testLocalRoutingApi(): Promise<void> {
  const midiRequests: MidiRequest[] = []
  let sourceMessageDelivered = false
  const midiPort = await getFreePort()
  const apiPort = await getFreePort()

  const midiServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? '/'
    const method = req.method ?? 'GET'
    const body = await readJsonBody(req)
    midiRequests.push({ method, path, body })

    if (path === '/ports' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ inputs: ['Local In'], outputs: ['Local Out'] }))
      return
    }

    if (path === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (path === '/port/1/messages' && method === 'GET') {
      const messages = sourceMessageDelivered ? [] : [[0x90, 60, 100]]
      sourceMessageDelivered = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ messages }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  })

  const restoreConfigDir = await configureIsolatedRoutesStorage()
  const { createApiServer } = await import('../../src/api-server')
  const apiServer = createApiServer({
    apiPort,
    midiServerPort: midiPort,
    midiServerBinaryPath: '/tmp/midi-http-server-test',
    buildInfo: makeBuildInfo()
  })

  await new Promise<void>((resolve) => midiServer.listen(midiPort, resolve))
  await apiServer.start()

  try {
    const localPorts = await getJson<{
      inputs: { id: number; name: string; type: 'input' }[]
      outputs: { id: number; name: string; type: 'output' }[]
    }>(`http://localhost:${apiPort}/api/local/ports`)

    assert.equal(localPorts.status, 200)
    assert.deepEqual(localPorts.body, {
      inputs: [{ id: 0, name: 'Local In', type: 'input' }],
      outputs: [{ id: 0, name: 'Local Out', type: 'output' }]
    })

    const routeCreated = await postJson<{ route: { id: string } }>(`http://localhost:${apiPort}/api/routes`, {
      enabled: true,
      source: {
        serverUrl: 'local',
        portId: 'input-1',
        portName: 'Local In'
      },
      destination: {
        serverUrl: 'local',
        portId: 'output-2',
        portName: 'Local Out'
      }
    })
    assert.equal(routeCreated.status, 201)
    assert.ok(routeCreated.body.route.id.length > 0)

    await waitFor(
      () => midiRequests.find((req) => req.method === 'POST' && req.path === '/port/2/send'),
      5000,
      'local message forwarding'
    )

    const sendRequest = midiRequests.find((req) => req.method === 'POST' && req.path === '/port/2/send')
    assert.ok(sendRequest)
    assert.deepEqual(sendRequest.body, { message: [0x90, 60, 100] })

    const openedPorts = midiRequests
      .filter((req) => req.method === 'POST' && (req.path === '/port/1' || req.path === '/port/2'))
      .map((req) => req.path)
    assert.deepEqual(openedPorts.sort(), ['/port/1', '/port/2'])
  } finally {
    await apiServer.stop()
    await sleep(250)
    restoreConfigDir()
    await new Promise<void>((resolve, reject) => {
      midiServer.close((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}

async function main(): Promise<void> {
  await testLocalRoutingApi()
  console.log('local-routing-api integration test passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
