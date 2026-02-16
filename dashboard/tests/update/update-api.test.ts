import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { UpdateEvent, UpdateService, UpdateSettings, UpdateStatus } from '../../src/shared/types/update'

function makeBuildInfo() {
  return {
    version: '0.1.0',
    commit: 'test',
    buildTime: new Date().toISOString(),
    serial: 'v0.1.0-test'
  }
}

function makeDefaultStatus(): UpdateStatus {
  return {
    phase: 'idle',
    channel: 'production',
    currentVersion: '0.1.0',
    availableVersion: null,
    downloadProgress: null,
    downloaded: false,
    message: null,
    lastCheckedAt: null,
    lastError: null
  }
}

function makeDefaultSettings(): UpdateSettings {
  return {
    autoCheck: true,
    autoDownload: false,
    autoInstallOnQuit: false,
    devMode: false,
    devBuildPath: null,
    checkIntervalMinutes: 60
  }
}

class FakeUpdateService implements UpdateService {
  private status: UpdateStatus = makeDefaultStatus()
  private settings: UpdateSettings = makeDefaultSettings()
  private listeners = new Set<(event: UpdateEvent) => void>()

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  getSettings(): UpdateSettings {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<UpdateSettings>): UpdateSettings {
    this.settings = { ...this.settings, ...patch }
    this.emit()
    return this.getSettings()
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    this.status = { ...this.status, phase: 'checking', message: 'Checking...' }
    this.emit()
    return this.getStatus()
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    this.status = {
      ...this.status,
      phase: 'downloaded',
      downloaded: true,
      downloadProgress: 100,
      message: 'Downloaded'
    }
    this.emit()
    return this.getStatus()
  }

  async installUpdate(): Promise<void> {
    this.status = { ...this.status, phase: 'installing', message: 'Installing...' }
    this.emit()
  }

  onStatusChange(listener: (event: UpdateEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async shutdown(): Promise<void> {
    this.listeners.clear()
  }

  private emit(): void {
    const event: UpdateEvent = { type: 'status', status: this.getStatus() }
    for (const listener of this.listeners) {
      listener(event)
    }
  }
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

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const response = await fetch(url)
  return {
    status: response.status,
    body: (await response.json()) as T
  }
}

async function postJson<T>(
  url: string,
  body?: unknown,
  method: 'POST' | 'PUT' = 'POST'
): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  return {
    status: response.status,
    body: (await response.json()) as T
  }
}

async function testUpdateEndpointsConfigured(): Promise<void> {
  const restoreConfigDir = await configureIsolatedRoutesStorage()
  const { createApiServer } = await import('../../src/api-server')
  const port = await getFreePort()
  const updateService = new FakeUpdateService()
  const server = createApiServer({
    apiPort: port,
    midiServerPort: 0,
    midiServerBinaryPath: '/tmp/midi-http-server-test',
    updateService,
    buildInfo: makeBuildInfo()
  })

  await server.start()

  try {
    const status = await getJson<UpdateStatus>(`http://localhost:${port}/api/update/status`)
    assert.equal(status.status, 200)
    assert.equal(status.body.phase, 'idle')

    const settings = await getJson<UpdateSettings>(`http://localhost:${port}/api/update/settings`)
    assert.equal(settings.status, 200)
    assert.equal(settings.body.autoCheck, true)

    const updatedSettings = await postJson<UpdateSettings>(
      `http://localhost:${port}/api/update/settings`,
      { autoDownload: true, checkIntervalMinutes: 15 },
      'PUT'
    )
    assert.equal(updatedSettings.status, 200)
    assert.equal(updatedSettings.body.autoDownload, true)
    assert.equal(updatedSettings.body.checkIntervalMinutes, 15)

    const check = await postJson<UpdateStatus>(`http://localhost:${port}/api/update/check`)
    assert.equal(check.status, 200)
    assert.equal(check.body.phase, 'checking')

    const download = await postJson<UpdateStatus>(`http://localhost:${port}/api/update/download`)
    assert.equal(download.status, 200)
    assert.equal(download.body.phase, 'downloaded')
    assert.equal(download.body.downloaded, true)

    const install = await postJson<{ success: boolean }>(`http://localhost:${port}/api/update/install`)
    assert.equal(install.status, 200)
    assert.equal(install.body.success, true)
  } finally {
    await server.stop()
    await updateService.shutdown()
    restoreConfigDir()
  }
}

async function testUpdateEndpointsUnconfigured(): Promise<void> {
  const restoreConfigDir = await configureIsolatedRoutesStorage()
  const { createApiServer } = await import('../../src/api-server')
  const port = await getFreePort()
  const server = createApiServer({
    apiPort: port,
    midiServerPort: 0,
    midiServerBinaryPath: '/tmp/midi-http-server-test',
    buildInfo: makeBuildInfo()
  })

  await server.start()

  try {
    const response = await getJson<{ error: string }>(`http://localhost:${port}/api/update/status`)
    assert.equal(response.status, 501)
    assert.match(response.body.error, /not available/i)
  } finally {
    await server.stop()
    restoreConfigDir()
  }
}

async function main(): Promise<void> {
  await testUpdateEndpointsConfigured()
  await testUpdateEndpointsUnconfigured()
  console.log('update-api tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function configureIsolatedRoutesStorage(): Promise<() => void> {
  const previous = process.env.MIDI_SERVER_CONFIG_DIR
  const dir = await mkdtemp(join(tmpdir(), 'midi-server-update-test-'))
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
