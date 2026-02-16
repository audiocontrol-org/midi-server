import { HttpPlatform } from './http-platform'

/**
 * Web platform implementation.
 * Uses HTTP to communicate with the API server (served by Vite middleware in dev).
 */
export class WebPlatform extends HttpPlatform {
  constructor() {
    // In web mode, API is served on the same origin (Vite middleware)
    super('web', '')
  }
}
