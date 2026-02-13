import { spawn, ChildProcess } from 'child_process'
import type { ServerStatus } from './types'
import { LogBuffer, parseSeverityFromMessage } from './log-buffer'

export class ProcessManager {
  private serverProcess: ChildProcess | null = null
  private serverPort: number | null = null
  private binaryPath: string

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

  async start(port: number): Promise<ServerStatus> {
    if (this.serverProcess && this.serverProcess.exitCode === null) {
      throw new Error('Server is already running')
    }

    this.addLog(`Starting MIDI server: ${this.binaryPath} ${port}`, 'system')

    this.serverProcess = spawn(this.binaryPath, [String(port)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.serverPort = port

    this.serverProcess.stdout?.on('data', (data: Buffer) => {
      const message = data.toString()
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
    })

    // Wait for server to start
    await this.waitForHealth(port, 5000)

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
