# Work Plan: MIDI Server Dashboard

## Phases

### Phase 1: Project Scaffolding

**Objective:** Set up the electron-vite project structure with React + TypeScript

**Tasks:**
- [ ] Scaffold project with `npm create @quick-start/electron@latest dashboard -- --template react-ts`
- [ ] Configure Tailwind CSS
- [ ] Set up path aliases (`@/`)
- [ ] Configure TypeScript strict mode
- [ ] Add HashRouter from react-router-dom
- [ ] Verify `electron-vite dev` launches successfully

**Verification:**
- Dev server starts with HMR
- Electron window opens with React app
- Tailwind classes work

---

### Phase 2: Platform Abstraction Layer

**Objective:** Create the abstraction that enables dual web/Electron deployment

**Tasks:**
- [ ] Create `src/renderer/src/platform/types.ts` with `PlatformServices` interface
- [ ] Implement `src/renderer/src/platform/web.ts` (browser-only version)
- [ ] Implement `src/renderer/src/platform/electron.ts` (uses window.electronAPI)
- [ ] Create `src/renderer/src/platform/index.ts` with runtime detection
- [ ] Add TypeScript types for `window.electronAPI`

**Verification:**
- `isElectron()` returns correct value in each environment
- Web implementation doesn't reference any Electron/Node APIs
- TypeScript compilation succeeds with strict mode

---

### Phase 3: IPC Bridge Setup

**Objective:** Establish typed communication between renderer and main process

**Tasks:**
- [ ] Create `src/shared/ipc-channels.ts` with channel definitions
- [ ] Update `src/preload/index.ts` to expose typed API via contextBridge
- [ ] Add IPC handlers in `src/main/index.ts` for server management
- [ ] Type the `window.electronAPI` in renderer

**Verification:**
- IPC calls work from renderer to main
- TypeScript catches channel name typos
- Preload script properly bridges the contexts

---

### Phase 4: Server Process Management (Electron)

**Objective:** Implement start/stop control of the midi-http-server binary

**Tasks:**
- [ ] Add child_process spawn logic in main process
- [ ] Implement `server:start` handler (spawn binary with port arg)
- [ ] Implement `server:stop` handler (graceful kill)
- [ ] Implement `server:status` handler (check if process alive)
- [ ] Handle process crashes and cleanup on app quit
- [ ] Configure binary path (bundled vs development)

**Verification:**
- Server starts when requested
- Server stops cleanly
- Status reflects actual process state
- No orphan processes on app quit

---

### Phase 5: Dashboard UI Components

**Objective:** Build the React UI for server control and port display

**Tasks:**
- [ ] Create `ServerControl` component (start/stop buttons, URL input)
- [ ] Create `StatusIndicator` component (connection state)
- [ ] Create `PortList` component (display MIDI inputs/outputs)
- [ ] Create `Dashboard` layout component
- [ ] Add `useServerConnection` hook (HTTP API client)
- [ ] Add `usePlatform` hook (access PlatformServices)
- [ ] Style all components with Tailwind (dark theme)

**Verification:**
- UI renders correctly in both web and Electron
- Start/stop works in Electron mode
- Connect/disconnect works in web mode
- Ports display when server is running

---

### Phase 6: Web Build Configuration

**Objective:** Configure standalone web build for browser deployment

**Tasks:**
- [ ] Create `vite.config.web.ts` for web-only build
- [ ] Add `build:web` script to package.json
- [ ] Ensure web build excludes Electron dependencies
- [ ] Test web build serves correctly from static hosting
- [ ] Add environment-based API URL configuration

**Verification:**
- `npm run build:web` produces working static build
- Build runs in browser without errors
- Platform detection correctly identifies web mode
- Can connect to remote MIDI server

---

### Phase 7: Electron Packaging

**Objective:** Configure electron-builder for distribution

**Tasks:**
- [ ] Configure `electron-builder.yml` for macOS
- [ ] Bundle the `midi-http-server` binary with the app
- [ ] Configure app signing (use existing Developer ID certificates)
- [ ] Add app icons
- [ ] Test packaged app launches and manages server

**Verification:**
- `npm run build` produces packaged .app
- App launches without Gatekeeper warnings (when signed)
- Bundled server binary works correctly
- App icon appears correctly

---

## Dependencies

```
Phase 1 (Scaffold)
    ↓
Phase 2 (Platform Layer) → Phase 3 (IPC Bridge)
    ↓                           ↓
Phase 5 (UI)  ←←←←←←←←←←← Phase 4 (Server Mgmt)
    ↓
Phase 6 (Web Build)
    ↓
Phase 7 (Packaging)
```

---

## Files to Create

```
dashboard/
├── src/
│   ├── main/
│   │   └── index.ts                    # Updated with IPC handlers
│   ├── preload/
│   │   └── index.ts                    # Updated with typed API
│   ├── shared/
│   │   └── ipc-channels.ts             # Channel definitions
│   └── renderer/
│       └── src/
│           ├── platform/
│           │   ├── types.ts
│           │   ├── web.ts
│           │   ├── electron.ts
│           │   └── index.ts
│           ├── components/
│           │   ├── Dashboard.tsx
│           │   ├── ServerControl.tsx
│           │   ├── StatusIndicator.tsx
│           │   └── PortList.tsx
│           ├── hooks/
│           │   ├── useServerConnection.ts
│           │   └── usePlatform.ts
│           ├── api/
│           │   └── client.ts
│           └── types/
│               └── api.ts
├── vite.config.web.ts                  # Web-only build config
└── electron-builder.yml                # Packaging config
```
