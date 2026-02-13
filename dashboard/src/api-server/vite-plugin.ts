import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { ApiServer, getBuildInfo } from './server'
import type { ApiServerConfig } from './types'

interface ApiServerPluginOptions {
  apiPort?: number
  midiServerPort?: number
  midiServerBinaryPath: string
  version: string
}

export function apiServerPlugin(options: ApiServerPluginOptions): Plugin {
  let apiServer: ApiServer | null = null

  return {
    name: 'api-server',

    configureServer(server: ViteDevServer) {
      const config: ApiServerConfig = {
        apiPort: options.apiPort ?? 3001,
        midiServerPort: options.midiServerPort ?? 8080,
        midiServerBinaryPath: options.midiServerBinaryPath
      }

      const buildInfo = getBuildInfo(options.version)
      apiServer = new ApiServer(config, buildInfo)

      // Add middleware to handle API routes (runs before Vite's middleware)
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || ''

        // Only handle /api/* and /midi/* routes
        if (url.startsWith('/api') || url.startsWith('/midi')) {
          // Forward to our API server's request handler and wait for it to complete
          await apiServer!.handleRequest(req, res)
        } else {
          next()
        }
      })

      // Log that the API is available
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (address && typeof address === 'object') {
          console.log(`  ➜  API:     http://localhost:${address.port}/api/health`)
        }
      })
    },

    closeBundle() {
      // Clean up when Vite closes
      if (apiServer) {
        apiServer.stop()
      }
    }
  }
}
