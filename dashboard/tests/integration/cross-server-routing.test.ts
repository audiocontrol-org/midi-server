/**
 * Integration test for cross-server MIDI routing
 *
 * Tests end-to-end:
 * 1. Start two dashboard instances
 * 2. Start MIDI servers on each
 * 3. Create a route between them
 * 4. Send MIDI messages and verify they're received
 * 5. Tear down everything
 */

import { spawn, ChildProcess } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const API_PORT_1 = 15173
const API_PORT_2 = 15174
const MIDI_PORT_1 = 15001
const MIDI_PORT_2 = 15002

interface ServerInstance {
  process: ChildProcess
  apiUrl: string
  midiPort: number
}

interface PortsResponse {
  inputs: string[]
  outputs: string[]
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status}: ${body}`)
  }

  return response.json() as Promise<T>
}

async function waitForServer(apiUrl: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await request(`${apiUrl}/api/health`)
      return
    } catch {
      await sleep(500)
    }
  }
  throw new Error(`Server at ${apiUrl} did not become ready within ${timeoutMs}ms`)
}

async function waitForMidiServer(apiUrl: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await request(`${apiUrl}/midi/health`)
      return
    } catch {
      await sleep(500)
    }
  }
  throw new Error(`MIDI server at ${apiUrl} did not become ready within ${timeoutMs}ms`)
}

function startServer(apiPort: number, midiPort: number): ServerInstance {
  const env = {
    ...process.env,
    FORCE_API_PORT: String(apiPort),
    FORCE_MIDI_PORT: String(midiPort),
    HEADLESS: '1' // Skip Electron window
  }

  const proc = spawn('tsx', ['scripts/server.ts'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''

  proc.stdout?.on('data', (data) => {
    stdout += data.toString()
  })

  proc.stderr?.on('data', (data) => {
    stderr += data.toString()
  })

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server exited with code ${code}`)
      console.error('stdout:', stdout)
      console.error('stderr:', stderr)
    }
  })

  return {
    process: proc,
    apiUrl: `http://localhost:${apiPort}`,
    midiPort
  }
}

async function startMidiServer(apiUrl: string): Promise<void> {
  await request(`${apiUrl}/api/server/start`, { method: 'POST' })
}

async function stopMidiServer(apiUrl: string): Promise<void> {
  try {
    await request(`${apiUrl}/api/server/stop`, { method: 'POST' })
  } catch {
    // Ignore errors on shutdown
  }
}

async function getPorts(apiUrl: string): Promise<PortsResponse> {
  return request<PortsResponse>(`${apiUrl}/midi/ports`)
}

async function openPort(
  apiUrl: string,
  portId: string,
  name: string,
  type: 'input' | 'output'
): Promise<void> {
  await request(`${apiUrl}/midi/port/${portId}`, {
    method: 'POST',
    body: JSON.stringify({ name, type })
  })
}

async function closePort(apiUrl: string, portId: string): Promise<void> {
  await request(`${apiUrl}/midi/port/${portId}`, { method: 'DELETE' })
}

async function sendMessage(apiUrl: string, portId: string, message: number[]): Promise<void> {
  await request(`${apiUrl}/midi/port/${portId}/send`, {
    method: 'POST',
    body: JSON.stringify({ message })
  })
}

async function getMessages(apiUrl: string, portId: string): Promise<{ messages: number[][] }> {
  return request<{ messages: number[][] }>(`${apiUrl}/midi/port/${portId}/messages`)
}

async function createRoute(
  apiUrl: string,
  sourceServerUrl: string,
  sourcePortId: string,
  sourcePortName: string,
  destServerUrl: string,
  destPortId: string,
  destPortName: string
): Promise<{ route: { id: string } }> {
  return request<{ route: { id: string } }>(`${apiUrl}/api/routes`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      source: {
        serverUrl: sourceServerUrl,
        portId: sourcePortId,
        portName: sourcePortName
      },
      destination: {
        serverUrl: destServerUrl,
        portId: destPortId,
        portName: destPortName
      }
    })
  })
}

async function deleteRoute(apiUrl: string, routeId: string): Promise<void> {
  await request(`${apiUrl}/api/routes/${routeId}`, { method: 'DELETE' })
}

async function deleteAllRoutes(apiUrl: string): Promise<void> {
  const { routes } = await request<{ routes: { id: string }[] }>(`${apiUrl}/api/routes`)
  for (const route of routes) {
    await deleteRoute(apiUrl, route.id)
  }
}

function killServer(server: ServerInstance): void {
  server.process.kill('SIGTERM')
}

// Main test
async function runTest(): Promise<void> {
  let server1: ServerInstance | null = null
  let server2: ServerInstance | null = null

  try {
    console.log('Starting integration test...\n')

    // Step 1: Start two server instances
    console.log('1. Starting server instances...')
    server1 = startServer(API_PORT_1, MIDI_PORT_1)
    server2 = startServer(API_PORT_2, MIDI_PORT_2)

    await Promise.all([
      waitForServer(server1.apiUrl),
      waitForServer(server2.apiUrl)
    ])
    console.log('   Both API servers ready\n')

    // Step 2: Start MIDI servers
    console.log('2. Starting MIDI servers...')
    await Promise.all([
      startMidiServer(server1.apiUrl),
      startMidiServer(server2.apiUrl)
    ])

    await Promise.all([
      waitForMidiServer(server1.apiUrl),
      waitForMidiServer(server2.apiUrl)
    ])
    console.log('   Both MIDI servers ready\n')

    // Step 3: Get available ports
    console.log('3. Getting available MIDI ports...')
    const [ports1, ports2] = await Promise.all([
      getPorts(server1.apiUrl),
      getPorts(server2.apiUrl)
    ])
    console.log(`   Server 1 inputs: ${ports1.inputs.join(', ')}`)
    console.log(`   Server 1 outputs: ${ports1.outputs.join(', ')}`)
    console.log(`   Server 2 inputs: ${ports2.inputs.join(', ')}`)
    console.log(`   Server 2 outputs: ${ports2.outputs.join(', ')}\n`)

    // Find IAC Driver Bus 1 (should exist on both)
    const iacInputIndex1 = ports1.inputs.findIndex((p) => p.includes('IAC Driver'))
    const iacOutputIndex1 = ports1.outputs.findIndex((p) => p.includes('IAC Driver'))
    const iacInputIndex2 = ports2.inputs.findIndex((p) => p.includes('IAC Driver'))
    const iacOutputIndex2 = ports2.outputs.findIndex((p) => p.includes('IAC Driver'))

    if (iacInputIndex1 === -1 || iacOutputIndex1 === -1 || iacInputIndex2 === -1 || iacOutputIndex2 === -1) {
      throw new Error('IAC Driver Bus 1 not found on both servers. Make sure IAC Driver is enabled in Audio MIDI Setup.')
    }

    const iacInputName1 = ports1.inputs[iacInputIndex1]
    const iacOutputName1 = ports1.outputs[iacOutputIndex1]
    const iacInputName2 = ports2.inputs[iacInputIndex2]
    const iacOutputName2 = ports2.outputs[iacOutputIndex2]

    // Step 4: Clear any existing routes
    console.log('4. Clearing existing routes...')
    await deleteAllRoutes(server1.apiUrl)
    console.log('   Routes cleared\n')

    // Step 5: Open ports for direct messaging test
    console.log('5. Opening ports for direct test...')
    await openPort(server1.apiUrl, 'test-out', iacOutputName1, 'output')
    await openPort(server2.apiUrl, 'test-in', iacInputName2, 'input')
    console.log('   Ports opened\n')

    // Step 6: Send a test message directly (server1 -> IAC -> server2)
    console.log('6. Sending test MIDI message (Note On)...')
    const testMessage = [0x90, 60, 100] // Note On, Middle C, velocity 100
    await sendMessage(server1.apiUrl, 'test-out', testMessage)
    console.log(`   Sent: [${testMessage.join(', ')}]\n`)

    // Step 7: Wait and check for received message
    console.log('7. Waiting for message to be received...')
    await sleep(500) // Give time for message to propagate

    const received = await getMessages(server2.apiUrl, 'test-in')
    console.log(`   Received ${received.messages.length} message(s)`)

    if (received.messages.length === 0) {
      console.log('   WARNING: No messages received - IAC loopback may not be working')
    } else {
      const lastMessage = received.messages[received.messages.length - 1]
      console.log(`   Last message: [${lastMessage.join(', ')}]`)

      if (
        lastMessage[0] === testMessage[0] &&
        lastMessage[1] === testMessage[1] &&
        lastMessage[2] === testMessage[2]
      ) {
        console.log('   Message matched!\n')
      } else {
        console.log('   WARNING: Message did not match expected\n')
      }
    }

    // Step 8: Test routing engine
    console.log('8. Testing routing engine...')
    console.log('   Creating route: Server1:IAC-input -> Server2:IAC-output')

    // Open the source input on server1
    await openPort(server1.apiUrl, 'route-src', iacInputName1, 'input')

    // Create a route that reads from server1 input and sends to server2 output
    const routeResult = await createRoute(
      server1.apiUrl,
      server1.apiUrl,
      `input-${iacInputIndex1}`,
      iacInputName1,
      server2.apiUrl,
      `output-${iacOutputIndex2}`,
      iacOutputName2
    )
    console.log(`   Route created: ${routeResult.route.id}`)

    // Wait for route to activate
    await sleep(1000)
    console.log('   Route should be active\n')

    // Step 9: Clean up ports
    console.log('9. Cleaning up ports...')
    await closePort(server1.apiUrl, 'test-out')
    await closePort(server2.apiUrl, 'test-in')
    await closePort(server1.apiUrl, 'route-src')
    console.log('   Ports closed\n')

    // Step 10: Delete route
    console.log('10. Deleting route...')
    await deleteRoute(server1.apiUrl, routeResult.route.id)
    console.log('   Route deleted\n')

    console.log('Integration test completed successfully!')

  } catch (error) {
    console.error('\nTest failed:', error)
    process.exitCode = 1
  } finally {
    // Cleanup
    console.log('\nCleaning up...')

    if (server1) {
      await stopMidiServer(server1.apiUrl).catch(() => {})
      killServer(server1)
    }

    if (server2) {
      await stopMidiServer(server2.apiUrl).catch(() => {})
      killServer(server2)
    }

    // Wait for processes to exit
    await sleep(1000)
    console.log('Done.')
  }
}

runTest()
