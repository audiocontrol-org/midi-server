import { spawn, ChildProcess } from 'child_process'
import type { ServerStatus } from './types'
import { LogBuffer, parseSeverityFromMessage } from './log-buffer'

export class ProcessManager {
  private serverProcess: ChildProcess | null = null
  private serverPort: number | null = null
  private binaryPath: string
  private portResolve: ((port: number) => void) | null = null

  constructor(
    binaryPath: string,
    private logBuffer: LogBuffer
  ) {
    this.binaryPath = binaryPath
  }

  setBinaryPath(path: string): void {
    this.binaryPath = path
  }

  getStatus(): ServerStatus {
    const running = this.serverProcess !== null && this.serverProcess.exitCode === null
    return {
      running,
      pid: running ? (this.serverProcess!.pid ?? null) : null,
      port: running ? this.serverPort : null,
      url: running && this.serverPort ? `http://localhost:${this.serverPort}` : null
    }
  }

  async start(port: number = 0): Promise<ServerStatus> {
    if (this.serverProcess && this.serverProcess.exitCode === null) {
      throw new Error('Server is already running')
    }

    this.addLog(
      `Starting MIDI server: ${this.binaryPath} ${port === 0 ? '(auto-assign port)' : port}`,
      'system'
    )

    // Create a promise to wait for the actual port
    const portPromise = new Promise<number>((resolve) => {
      this.portResolve = resolve
    })

    this.serverProcess = spawn(this.binaryPath, [String(port)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.serverPort = port === 0 ? null : port

    this.serverProcess.stdout?.on('data', (data: Buffer) => {
      const message = data.toString()

      // Parse actual port from server output (e.g., "MIDI_SERVER_PORT=8080")
      const portMatch = message.match(/MIDI_SERVER_PORT=(\d+)/)
      if (portMatch) {
        const actualPort = parseInt(portMatch[1], 10)
        this.serverPort = actualPort
        if (this.portResolve) {
          this.portResolve(actualPort)
          this.portResolve = null
        }
      }

      this.addLog(message, 'server', false)
    })

    this.serverProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString()
      this.addLog(message, 'server', true)
    })

    this.serverProcess.on('exit', (code) => {
      const message = `Server process exited with code ${code}`
      this.addLog(message, 'system')
      this.serverProcess = null
      this.serverPort = null
    })

    this.serverProcess.on('error', (err) => {
      const message = `Failed to start server: ${err.message}`
      this.addLog(message, 'system', true)
      this.serverProcess = null
      this.serverPort = null
      if (this.portResolve) {
        this.portResolve(0) // Resolve with 0 to indicate failure
        this.portResolve = null
      }
    })

    // Wait for actual port to be reported by the server
    const actualPort = await Promise.race([
      portPromise,
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 5000))
    ])

    if (actualPort === 0) {
      throw new Error('Server failed to report port within timeout')
    }

    // Wait for server to respond to health checks
    await this.waitForHealth(actualPort, 5000)

    return this.getStatus()
  }

  async stop(): Promise<void> {
    if (!this.serverProcess || this.serverProcess.exitCode !== null) {
      return
    }

    this.addLog('Stopping MIDI server...', 'system')
    this.serverProcess.kill('SIGTERM')

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.serverProcess && this.serverProcess.exitCode === null) {
          this.serverProcess.kill('SIGKILL')
        }
        resolve()
      }, 5000)

      this.serverProcess!.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.serverProcess = null
    this.serverPort = null
  }

  private addLog(message: string, source: 'server' | 'system', isStderr = false): void {
    const severity = isStderr
      ? parseSeverityFromMessage(message) === 'info'
        ? 'error'
        : parseSeverityFromMessage(message)
      : parseSeverityFromMessage(message)

    this.logBuffer.add(message, severity, source)
  }

  private async waitForHealth(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now()
    const healthUrl = `http://localhost:${port}/health`

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(healthUrl)
        if (response.ok) {
          this.addLog(`MIDI server responding at ${healthUrl}`, 'system')
          return
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    this.addLog(`MIDI server health check timed out after ${timeoutMs}ms`, 'system', true)
  }
}
