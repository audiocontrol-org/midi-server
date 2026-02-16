/**
 * Integration test for route message forwarding using virtual MIDI ports
 *
 * Architecture:
 * 1. Server1 creates virtual OUTPUT "TestSource" (appears as MIDI source)
 * 2. Server1 opens regular INPUT listening to "TestSource"
 * 3. We send messages through the virtual OUTPUT → arrives at regular INPUT
 * 4. Routing engine forwards to Server2
 * 5. Server2 creates virtual INPUT "TestDest" (appears as MIDI destination)
 * 6. Server2 opens regular OUTPUT sending to "TestDest"
 * 7. Messages arrive at virtual INPUT, we verify from its queue
 *
 * Test isolation:
 * - Each server uses its own temp config directory (MIDI_SERVER_CONFIG_DIR)
 * - Config directories are cleaned up after test
 */

import { spawn, ChildProcess } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const API_PORT_1 = 17173
const API_PORT_2 = 17174
const MIDI_PORT_1 = 17001
const MIDI_PORT_2 = 17002

// Create isolated temp config directories for each server
function createTempConfigDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `midi-test-${label}-`))
  return dir
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

interface ServerInstance {
  process: ChildProcess
  apiUrl: string
  midiPort: number
  configDir: string
  stdout: string
  stderr: string
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

function startServer(apiPort: number, midiPort: number, label: string): ServerInstance {
  // Create isolated config directory for this server instance
  const configDir = createTempConfigDir(label)

  const env = {
    ...process.env,
    FORCE_API_PORT: String(apiPort),
    FORCE_MIDI_PORT: String(midiPort),
    MIDI_SERVER_CONFIG_DIR: configDir,
    HEADLESS: '1'
  }

  const proc = spawn('tsx', ['scripts/server.ts'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const instance: ServerInstance = {
    process: proc,
    apiUrl: `http://localhost:${apiPort}`,
    midiPort,
    configDir,
    stdout: '',
    stderr: ''
  }

  proc.stdout?.on('data', (data) => {
    instance.stdout += data.toString()
  })

  proc.stderr?.on('data', (data) => {
    instance.stderr += data.toString()
  })

  return instance
}

async function startMidiServer(apiUrl: string): Promise<void> {
  await request(`${apiUrl}/api/server/start`, { method: 'POST' })
}

// Virtual port operations
async function createVirtualPort(
  apiUrl: string,
  portId: string,
  name: string,
  type: 'input' | 'output'
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${apiUrl}/midi/virtual/${portId}`, {
    method: 'POST',
    body: JSON.stringify({ name, type })
  })
}

async function sendVirtualMessage(
  apiUrl: string,
  portId: string,
  message: number[]
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${apiUrl}/midi/virtual/${portId}/send`, {
    method: 'POST',
    body: JSON.stringify({ message })
  })
}

async function getVirtualMessages(
  apiUrl: string,
  portId: string
): Promise<{ messages: number[][] }> {
  return request<{ messages: number[][] }>(`${apiUrl}/midi/virtual/${portId}/messages`)
}

// Regular port operations
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

async function getMessages(apiUrl: string, portId: string): Promise<{ messages: number[][] }> {
  return request<{ messages: number[][] }>(`${apiUrl}/midi/port/${portId}/messages`)
}

// Route operations
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

async function getRouteStatus(
  apiUrl: string,
  routeId: string
): Promise<{
  status: string
  error?: string
  messagesRouted: number
}> {
  const { routes } = await request<{
    routes: { id: string; status: { status: string; error?: string; messagesRouted: number } }[]
  }>(`${apiUrl}/api/routes`)
  const route = routes.find((r) => r.id === routeId)
  if (!route) throw new Error(`Route ${routeId} not found`)
  return route.status
}

async function deleteAllRoutes(apiUrl: string): Promise<void> {
  const { routes } = await request<{ routes: { id: string }[] }>(`${apiUrl}/api/routes`)
  for (const route of routes) {
    await request(`${apiUrl}/api/routes/${route.id}`, { method: 'DELETE' })
  }
}

function killServer(server: ServerInstance): void {
  server.process.kill('SIGTERM')
}

// Main test
async function runTest(): Promise<void> {
  let server1: ServerInstance | null = null
  let server2: ServerInstance | null = null
  const testId = Date.now()
  const sourcePortName = `TestSource-${testId}`
  const destPortName = `TestDest-${testId}`

  try {
    console.log('=== Route Forwarding Integration Test (Virtual Ports) ===\n')

    // Step 1: Start servers with isolated config directories
    console.log('1. Starting server instances...')
    server1 = startServer(API_PORT_1, MIDI_PORT_1, 'server1')
    server2 = startServer(API_PORT_2, MIDI_PORT_2, 'server2')
    console.log(`   Server1 config: ${server1.configDir}`)
    console.log(`   Server2 config: ${server2.configDir}`)

    await Promise.all([waitForServer(server1.apiUrl), waitForServer(server2.apiUrl)])
    console.log('   API servers ready\n')

    // Step 2: Start MIDI servers
    console.log('2. Starting MIDI servers...')
    await Promise.all([startMidiServer(server1.apiUrl), startMidiServer(server2.apiUrl)])

    await Promise.all([waitForMidiServer(server1.apiUrl), waitForMidiServer(server2.apiUrl)])
    console.log('   MIDI servers ready\n')

    // Step 3: Clear existing routes from both servers
    console.log('3. Clearing existing routes...')
    await deleteAllRoutes(server1.apiUrl)
    await deleteAllRoutes(server2.apiUrl)
    console.log('   Routes cleared\n')

    // Step 4: Create virtual ports with correct types
    console.log('4. Creating virtual MIDI ports...')

    // Server 1: Virtual OUTPUT (creates a MIDI source that inputs can listen to)
    console.log(`   Server1: Creating virtual OUTPUT "${sourcePortName}"`)
    const vp1 = await createVirtualPort(server1.apiUrl, 'vsrc', sourcePortName, 'output')
    console.log(`   Result: ${JSON.stringify(vp1)}`)

    // Server 2: Virtual INPUT (creates a MIDI destination that outputs can send to)
    console.log(`   Server2: Creating virtual INPUT "${destPortName}"`)
    const vp2 = await createVirtualPort(server2.apiUrl, 'vdst', destPortName, 'input')
    console.log(`   Result: ${JSON.stringify(vp2)}`)
    console.log('')

    // Give CoreMIDI time to register the virtual ports
    console.log('   Waiting for CoreMIDI to register virtual ports...')
    await sleep(1000)

    // Step 5: PREREQUISITE CHECK - Verify virtual ports work independently
    console.log('5. PREREQUISITE: Verifying virtual ports work independently...')

    // Test Server 1's virtual OUTPUT
    console.log('   Testing Server 1 virtual OUTPUT...')
    await openPort(server1.apiUrl, 'prereq-in', sourcePortName, 'input')
    await sendVirtualMessage(server1.apiUrl, 'vsrc', [0x90, 48, 100])
    await sleep(200)
    const prereqMsgs1 = await getMessages(server1.apiUrl, 'prereq-in')
    if (prereqMsgs1.messages.length === 0) {
      console.log('   ❌ FAILED: Server 1 virtual OUTPUT is not working!')
      console.log('      Messages sent through virtual OUTPUT are not being received.')
      process.exitCode = 1
      return
    }
    console.log('   ✓ Server 1 virtual OUTPUT works')

    // Close prereq port so it doesn't interfere with routing
    await request<{ success: boolean }>(`${server1.apiUrl}/midi/port/prereq-in`, { method: 'DELETE' })

    // Test Server 2's virtual INPUT
    console.log('   Testing Server 2 virtual INPUT...')
    await openPort(server2.apiUrl, 'prereq-out', destPortName, 'output')
    await request<{ success: boolean }>(`${server2.apiUrl}/midi/port/prereq-out/send`, {
      method: 'POST',
      body: JSON.stringify({ message: [0x90, 48, 100] })
    })
    await sleep(200)
    const prereqMsgs2 = await getVirtualMessages(server2.apiUrl, 'vdst')
    if (prereqMsgs2.messages.length === 0) {
      console.log('   ❌ FAILED: Server 2 virtual INPUT is not working!')
      console.log('      Messages sent to virtual INPUT are not being received.')
      process.exitCode = 1
      return
    }
    console.log('   ✓ Server 2 virtual INPUT works')

    // Close prereq port so it doesn't interfere with routing
    await request<{ success: boolean }>(`${server2.apiUrl}/midi/port/prereq-out`, { method: 'DELETE' })

    console.log('   ✓ Both virtual ports verified working\n')

    // Extra wait to ensure CoreMIDI fully registers virtual ports
    console.log('   Waiting extra 2 seconds for CoreMIDI stabilization...')
    await sleep(2000)

    // DIAGNOSTIC: Test if route-src works when opened and used immediately
    console.log('   Testing immediate port usage...')
    await openPort(server1.apiUrl, 'immediate-test', sourcePortName, 'input')
    await sendVirtualMessage(server1.apiUrl, 'vsrc', [0x90, 36, 80])
    await sleep(100)
    const immediateMsgs = await getMessages(server1.apiUrl, 'immediate-test')
    console.log(`   immediate-test port has ${immediateMsgs.messages.length} messages`)
    // Close it so it doesn't interfere
    await request<{ success: boolean }>(`${server1.apiUrl}/midi/port/immediate-test`, { method: 'DELETE' })

    // Step 6: Create route (routing engine will open the ports)
    console.log('6. Creating route: Server1:src -> Server2:dst...')
    console.log(`   Source: ${sourcePortName} on ${server1.apiUrl}`)
    console.log(`   Dest: ${destPortName} on ${server2.apiUrl}`)
    const routeResult = await createRoute(
      server1.apiUrl,
      server1.apiUrl,
      'route-src', // unique port ID for this test
      sourcePortName,
      server2.apiUrl,
      'route-dst', // unique port ID for this test
      destPortName
    )
    console.log(`   Route created: ${routeResult.route.id}\n`)

    // Step 7: Wait for route to initialize (routing engine opens ports)
    console.log('7. Waiting for route to initialize (5 seconds)...')
    await sleep(5000)  // Increased from 2 seconds to ensure ports are fully opened

    let status = await getRouteStatus(server1.apiUrl, routeResult.route.id)
    console.log(`   Initial status: ${status.status}`)
    if (status.error) {
      console.log(`   Error: ${status.error}`)
    }
    console.log('')

    // Step 8: Check what ports are available
    console.log('8. Checking available MIDI ports...')
    const portsResp = await request<{ inputs: string[]; outputs: string[] }>(
      `${server1.apiUrl}/midi/ports`
    )
    console.log('   Available inputs:', portsResp.inputs)
    console.log('   Available outputs:', portsResp.outputs)

    // Check if the routing engine successfully opened the source port
    console.log('\n   Verifying source port was opened by routing engine...')
    try {
      const testMsg = await getMessages(server1.apiUrl, 'route-src')
      console.log(`   Source port route-src exists, queue has ${testMsg.messages.length} messages`)
    } catch (err: unknown) {
      console.log(`   ERROR: Source port not found: ${(err as Error).message}`)
    }
    console.log('')

    // DIAGNOSTIC: Delete route-src and re-open it right before sending
    console.log('   Re-opening route-src port...')
    try {
      await request<{ success: boolean }>(`${server1.apiUrl}/midi/port/route-src`, { method: 'DELETE' })
    } catch { /* ignore if not found */ }
    await openPort(server1.apiUrl, 'route-src', sourcePortName, 'input')

    // DIAGNOSTIC: Open a test port BEFORE sending, to see if it receives
    console.log('   Opening test port BEFORE sending messages...')
    await openPort(server1.apiUrl, 'before-send-port', sourcePortName, 'input')

    // Step 9: Send messages through the virtual OUTPUT
    console.log('9. Sending test MIDI messages through virtual OUTPUT...')
    const testMessages = [
      [0x90, 60, 100], // Note On C4
      [0x80, 60, 0], // Note Off C4
      [0x90, 64, 80], // Note On E4
      [0x80, 64, 0] // Note Off E4
    ]

    for (const msg of testMessages) {
      console.log(`   Sending: [${msg.join(', ')}]`)
      await sendVirtualMessage(server1.apiUrl, 'vsrc', msg)
      await sleep(100)
    }

    // Check immediately if the source port received any messages
    await sleep(200)
    console.log('   Checking source port immediately...')
    try {
      const immediateMessages = await getMessages(server1.apiUrl, 'route-src')
      console.log(`   Source port route-src has ${immediateMessages.messages.length} messages immediately`)
    } catch (err: unknown) {
      console.log(`   Source port error: ${(err as Error).message}`)
    }

    // Check if prereq-in port is stealing messages
    console.log('   Checking if prereq-in port stole messages...')
    try {
      const prereqStolen = await getMessages(server1.apiUrl, 'prereq-in')
      console.log(`   prereq-in has ${prereqStolen.messages.length} messages`)
    } catch {
      console.log('   prereq-in not found (closed)')
    }

    // Check if before-send-port received messages
    console.log('   Checking before-send-port (opened right before sending)...')
    const beforeSendMsgs = await getMessages(server1.apiUrl, 'before-send-port')
    console.log(`   before-send-port has ${beforeSendMsgs.messages.length} messages`)

    // DIAGNOSTIC: Open another port with the same name to see if IT receives messages
    console.log('\n   DIAGNOSTIC: Opening extra port with same name...')
    await openPort(server1.apiUrl, 'diag-port', sourcePortName, 'input')
    await sleep(100)
    await sendVirtualMessage(server1.apiUrl, 'vsrc', [0x90, 72, 90])
    await sleep(200)
    const diagMessages = await getMessages(server1.apiUrl, 'diag-port')
    console.log(`   Diag port has ${diagMessages.messages.length} messages`)
    if (diagMessages.messages.length > 0) {
      console.log('   Virtual output IS working - diag port received messages!')
      console.log('   Problem is specific to route-src port')
    } else {
      console.log('   Virtual output NOT working - diag port also received nothing')
    }
    console.log('')

    // Step 10: Wait for routing engine to poll and forward
    console.log('10. Waiting for messages to be routed...')
    await sleep(3000)

    // Step 11: Check route status
    console.log('11. Checking route status...')
    status = await getRouteStatus(server1.apiUrl, routeResult.route.id)
    console.log(`    Status: ${status.status}`)
    console.log(`    Messages routed: ${status.messagesRouted}`)
    if (status.error) {
      console.log(`    Error: ${status.error}`)
    }
    console.log('')

    // Step 12: Check messages at Server 2's virtual INPUT
    console.log('12. Checking messages received at destination virtual INPUT...')
    const destMessages = await getVirtualMessages(server2.apiUrl, 'vdst')
    console.log(`    Destination virtual port has ${destMessages.messages.length} messages`)
    if (destMessages.messages.length > 0) {
      console.log('    Messages received:')
      for (const msg of destMessages.messages) {
        console.log(`      [${msg.join(', ')}]`)
      }
    }
    console.log('')

    // Step 13: Print server logs for debugging
    console.log('13. Server logs (routing-related):')
    console.log('--- Server 1 ---')
    const s1Lines = server1.stdout
      .split('\n')
      .filter((l) => l.includes('Routing') || l.includes('Forward') || l.includes('Got'))
    console.log(s1Lines.slice(-15).join('\n') || '(no routing logs)')
    console.log('')
    console.log('--- Server 2 ---')
    const s2Lines = server2.stdout
      .split('\n')
      .filter((l) => l.includes('Routing') || l.includes('Forward') || l.includes('Got'))
    console.log(s2Lines.slice(-15).join('\n') || '(no routing logs)')
    console.log('')

    // Determine test result
    if (status.messagesRouted > 0 && destMessages.messages.length > 0) {
      console.log(
        `\n✅ Test PASSED: ${status.messagesRouted} messages routed, ${destMessages.messages.length} received at destination`
      )
    } else if (status.messagesRouted > 0) {
      console.log(`\n⚠️ Test PARTIAL: ${status.messagesRouted} messages routed but none received at destination`)
      console.log('   The virtual INPUT might not be capturing sent messages.')
      process.exitCode = 1
    } else if (status.error) {
      console.log(`\n❌ Test FAILED: Route error - ${status.error}`)
      process.exitCode = 1
    } else {
      console.log('\n⚠️ Test INCONCLUSIVE: No messages routed')
      console.log('   Checking if source port received any messages...')
      const srcMessages = await getMessages(server1.apiUrl, 'route-src')
      console.log(`   Source port queue: ${srcMessages.messages.length} messages`)
      process.exitCode = 1
    }
  } catch (error) {
    console.error('\n❌ Test FAILED with exception:', error)
    process.exitCode = 1
  } finally {
    console.log('\nCleaning up...')

    if (server1) {
      killServer(server1)
      cleanupTempDir(server1.configDir)
    }
    if (server2) {
      killServer(server2)
      cleanupTempDir(server2.configDir)
    }

    await sleep(1000)
    console.log('Done.')
  }
}

runTest()
