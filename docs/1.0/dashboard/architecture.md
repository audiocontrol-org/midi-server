# Architecture: MIDI Server Dashboard

## Overview

Build a cross-platform application that runs both as a standard web app (deployed to a browser) and as a native desktop app via Electron — from a single codebase. The renderer is a React + TypeScript app built with Vite.

---

## Tooling Decision: `electron-vite`

Use **[electron-vite](https://electron-vite.org/)** as the build toolchain. It provides a unified Vite-based build pipeline for all three Electron processes (main, preload, renderer) with HMR in development.

**Scaffold with:**

```bash
npm create @quick-start/electron@latest dashboard -- --template react-ts
```

For packaging and distribution, use **electron-builder** (configured via `electron-builder.yml` at the project root).

---

## Project Structure

```
dashboard/
├── electron-builder.yml          # Packaging config
├── electron.vite.config.ts       # Unified Vite config for all processes
├── src/
│   ├── main/                     # Electron main process
│   │   └── index.ts              # Window creation, app lifecycle, IPC handlers
│   ├── preload/                  # Preload scripts (contextBridge)
│   │   └── index.ts              # Exposes typed API to renderer via window
│   └── renderer/                 # React app (standard Vite + React)
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── platform/         # Platform abstraction layer
│       │   │   ├── types.ts      # PlatformServices interface
│       │   │   ├── electron.ts   # Electron implementation (uses window.electronAPI)
│       │   │   ├── web.ts        # Browser implementation (Web APIs, fetch, etc.)
│       │   │   └── index.ts      # Runtime detection + service factory
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── pages/
│       │   └── ...
│       └── ...
├── package.json
└── tsconfig.*.json               # Separate tsconfig for main, preload, renderer
```

---

## Key Architectural Decisions

### 1. Security-first Electron config

All Electron windows must use:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

The renderer has **zero direct access** to Node.js or Electron APIs. All native capabilities are exposed through the preload script via `contextBridge.exposeInMainWorld()`.

### 2. Renderer must be 100% browser-compatible

The `src/renderer/` directory must never import from `electron`, `fs`, `path`, or any Node.js module. It is a standard React SPA. This is what makes the dual-target (web + Electron) build possible.

### 3. Platform abstraction layer

Define a `PlatformServices` interface in `src/renderer/src/platform/types.ts` that declares all capabilities that differ between web and Electron (file I/O, native dialogs, system notifications, etc.).

Provide two implementations:

- **`web.ts`** — uses browser APIs (File System Access API, Notifications API, `fetch`, download links, etc.)
- **`electron.ts`** — delegates to `window.electronAPI` (the typed bridge exposed by the preload script)

A factory function detects the runtime environment and returns the appropriate implementation:

```typescript
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && window.electronAPI !== undefined;

export const platform: PlatformServices = isElectron()
  ? new ElectronPlatform()
  : new WebPlatform();
```

All application code consumes `PlatformServices` — never calls Electron or browser-specific APIs directly.

### 4. IPC communication pattern

Communication between renderer ↔ main process flows through a strict typed channel:

```
Renderer  →  window.electronAPI.doSomething(args)
              ↓ (contextBridge)
Preload   →  ipcRenderer.invoke('channel-name', args)
              ↓ (IPC)
Main      →  ipcMain.handle('channel-name', handler)
```

Define shared channel names and payload types in a common types file that both main and preload can reference. The preload script is the **only** boundary between the web world and Node.js.

### 5. Routing

Use **`HashRouter`** (not `BrowserRouter`) from `react-router-dom`. Electron loads the renderer from a file or dev server URL, and hash-based routing works reliably in both contexts without server-side route handling.

### 6. Dual build targets

| Target   | Command                | Output               | Notes                                      |
| -------- | ---------------------- | --------------------- | ------------------------------------------ |
| Web      | `vite build`           | `dist/` (static SPA)  | Standard Vite build of `src/renderer/`     |
| Electron | `electron-vite build`  | `out/`                | Bundles main + preload + renderer          |
| Package  | `electron-builder`     | Platform installers    | Wraps the Electron build into .dmg/.exe/etc |

The web build should use a separate `vite.config.ts` (or the renderer section of the electron-vite config) and can be deployed to any static hosting.

### 7. Environment & configuration

Use Vite's `import.meta.env` for environment variables. Define any Electron-specific vs. web-specific config via `.env` files or build-time flags:

```
VITE_PLATFORM=electron  # or "web" — set per build target
```

Prefer runtime detection (`isElectron()`) over build-time flags where possible, to keep a single renderer bundle.

---

## Development Workflow

| Action             | Command                    | What happens                                           |
| ------------------ | -------------------------- | ------------------------------------------------------ |
| Dev (Electron)     | `electron-vite dev`        | Starts Vite dev server + launches Electron with HMR    |
| Dev (Web only)     | `vite dev` (in renderer)   | Standard browser dev — no Electron                     |
| Build (Electron)   | `electron-vite build`      | Production bundles for all processes                    |
| Build (Web)        | `vite build`               | Production SPA bundle                                  |
| Package            | `electron-builder`         | Creates platform-specific installers                   |

---

## Platform Services Interface

```typescript
// src/renderer/src/platform/types.ts

export interface ServerProcess {
  pid: number | null
  running: boolean
  port: number
}

export interface PlatformServices {
  /** Whether this platform can manage the server process */
  readonly canManageServer: boolean

  /** Start the MIDI HTTP Server (Electron only) */
  startServer(port: number): Promise<ServerProcess>

  /** Stop the MIDI HTTP Server (Electron only) */
  stopServer(): Promise<void>

  /** Get current server process status (Electron only) */
  getServerStatus(): Promise<ServerProcess>

  /** Get platform name for display */
  getPlatformName(): string

  /** Store a value persistently */
  setStorageItem(key: string, value: string): Promise<void>

  /** Retrieve a stored value */
  getStorageItem(key: string): Promise<string | null>
}
```

---

## IPC Channels

```typescript
// src/shared/ipc-channels.ts

export const IPC_CHANNELS = {
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_STATUS: 'server:status',
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
```

---

## Non-Goals / Out of Scope

- Auto-update mechanism (can be added later via `electron-updater`)
- Native menu bar customization
- Multi-window support
- Offline-first / service worker caching (can be layered on)

---

## Summary of Constraints

1. Renderer code must work in a browser with no Electron present.
2. All Node.js / Electron access goes through the preload bridge — no exceptions.
3. Platform-specific behavior is behind the `PlatformServices` abstraction.
4. Use `HashRouter` for routing.
5. Type safety across the IPC boundary (shared types for channel names and payloads).
