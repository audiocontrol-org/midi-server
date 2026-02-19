import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { ApiServer } from './server'
import type { ApiServerConfig, BuildInfo } from './types'

interface ApiServerPluginOptions {
  apiPort?: number
  midiServerPort?: number
  midiServerBinaryPath: string
  buildInfo: BuildInfo
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

      apiServer = new ApiServer(config, options.buildInfo)

      // Add middleware to handle API routes (runs before Vite's middleware)
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url || ''

          // Only handle /api/* and /midi/* routes
          if (url.startsWith('/api') || url.startsWith('/midi')) {
            // Forward to our API server's request handler and wait for it to complete
            await apiServer!.handleRequest(req, res)
          } else {
            next()
          }
        }
      )

      // Initialize routing services after Vite's HTTP server starts listening
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (address && typeof address === 'object') {
          const actualPort = address.port
          console.log(`  API:     http://localhost:${actualPort}/api/health`)

          // Initialize routing services with the actual port
          apiServer!.initializeRoutingServicesForMiddleware(actualPort)
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
