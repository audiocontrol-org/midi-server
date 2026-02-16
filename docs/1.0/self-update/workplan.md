# Work Plan: Self-Updating Shell

## Milestone

[Week of Feb 17-21](https://github.com/audiocontrol-org/midi-server/milestone/2)

## Issues

| # | Title | Status |
|---|-------|--------|
| [#15](https://github.com/audiocontrol-org/midi-server/issues/15) | [self-update] Self-updating shell for MIDI Server | Open |
| [#16](https://github.com/audiocontrol-org/midi-server/issues/16) | Add electron-updater and configure electron-builder | Open |
| [#17](https://github.com/audiocontrol-org/midi-server/issues/17) | Implement UpdateManager for main process | Open |
| [#18](https://github.com/audiocontrol-org/midi-server/issues/18) | Add update API endpoints to API server | Open |
| [#19](https://github.com/audiocontrol-org/midi-server/issues/19) | Add update UI components | Open |
| [#20](https://github.com/audiocontrol-org/midi-server/issues/20) | Update build scripts for release artifacts | Open |
| [#21](https://github.com/audiocontrol-org/midi-server/issues/21) | Add update system documentation | Open |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MidiServer.app (Shell)                    │
├─────────────────────────────────────────────────────────────┤
│  Update Manager                                              │
│  ├── GitHub Release Checker (electron-updater)              │
│  ├── Local Build Watcher (chokidar)                         │
│  └── Update UI (download progress, restart prompt)          │
├─────────────────────────────────────────────────────────────┤
│  Existing App                                                │
│  ├── API Server + Process Manager                           │
│  ├── React Dashboard UI                                     │
│  └── C++ MidiHttpServer Binary                              │
└─────────────────────────────────────────────────────────────┘
```

## Phases

### Phase 1: Dependencies and Configuration

**Objective:** Add electron-updater and configure electron-builder for GitHub releases

**Tasks:**
- [ ] Add `electron-updater` and `chokidar` to package.json
- [ ] Update `electron-builder.yml` with publish configuration
- [ ] Configure mac target to produce dmg + zip artifacts
- [ ] Create update-related shared types

**Files:**
- `dashboard/package.json`
- `dashboard/electron-builder.yml`
- `dashboard/src/shared/types/update.ts`

**Verification:**
- Dependencies install without errors
- `npm run build:mac` produces both dmg and zip files

### Phase 2: UpdateManager Core

**Objective:** Create the UpdateManager class for main process

**Tasks:**
- [ ] Create `UpdateManager` class with electron-updater integration
- [ ] Add settings persistence (autoCheck, autoDownload, etc.)
- [ ] Add event emitter for update status changes
- [ ] Create local build watcher using chokidar
- [ ] Add version comparison logic

**Files:**
- `dashboard/src/main/update-manager.ts`

**Verification:**
- UpdateManager can check for updates via electron-updater
- Local build watcher detects Info.plist changes
- Settings persist across restarts

### Phase 3: API Integration

**Objective:** Expose update functionality via HTTP API

**Tasks:**
- [ ] Create update handlers module
- [ ] Add update status endpoint (GET /api/update/status)
- [ ] Add check endpoint (POST /api/update/check)
- [ ] Add download endpoint (POST /api/update/download)
- [ ] Add install endpoint (POST /api/update/install)
- [ ] Add settings endpoints (GET/PUT /api/update/settings)
- [ ] Add SSE stream for update progress (GET /api/update/stream)
- [ ] Register handlers in API server

**Files:**
- `dashboard/src/api-server/update-handlers.ts`
- `dashboard/src/api-server/server.ts`

**Verification:**
- All endpoints return expected responses
- SSE stream delivers progress events
- Settings changes persist

### Phase 4: Main Process Integration

**Objective:** Initialize UpdateManager and wire up to API server

**Tasks:**
- [ ] Initialize UpdateManager in main process
- [ ] Pass UpdateManager reference to API server
- [ ] Handle app restart on update install
- [ ] Add cleanup on app quit

**Files:**
- `dashboard/src/main/index.ts`
- `dashboard/src/api-server/index.ts`

**Verification:**
- UpdateManager initializes on app start
- Auto-check runs on startup (if enabled)
- App restarts correctly after update install

### Phase 5: Platform Services

**Objective:** Extend PlatformServices interface for update methods

**Tasks:**
- [ ] Add update methods to PlatformServices interface
- [ ] Implement methods in HttpPlatform base class
- [ ] Add SSE handling for update progress

**Files:**
- `dashboard/src/renderer/src/platform/types.ts`
- `dashboard/src/renderer/src/platform/http-platform.ts`

**Verification:**
- Platform methods call correct API endpoints
- Update progress streams correctly

### Phase 6: Update UI

**Objective:** Create React components for update UI

**Tasks:**
- [ ] Create `useUpdateStatus` hook for update state management
- [ ] Create `UpdateNotification` component (banner when update available)
- [ ] Create `UpdateProgress` component (download progress)
- [ ] Create `UpdateSettings` component (settings panel)
- [ ] Integrate into Dashboard component

**Files:**
- `dashboard/src/renderer/src/hooks/useUpdateStatus.ts`
- `dashboard/src/renderer/src/components/UpdateNotification.tsx`
- `dashboard/src/renderer/src/components/UpdateProgress.tsx`
- `dashboard/src/renderer/src/components/UpdateSettings.tsx`
- `dashboard/src/renderer/src/components/Dashboard.tsx`

**Verification:**
- Update notification appears when update available
- Download progress shows during download
- Settings panel allows configuring update behavior
- Dev mode indicator visible when enabled

### Phase 7: Build Script Updates

**Objective:** Update build scripts to generate release artifacts

**Tasks:**
- [ ] Update `packaging/macos/build-installer.sh` to build both architectures
- [ ] Generate `latest-mac.yml` manifest
- [ ] Create .zip payloads for updates
- [ ] Update CI workflow for release builds

**Files:**
- `packaging/macos/build-installer.sh`
- `.github/workflows/release-macos.yml`

**Verification:**
- Release build produces all required artifacts
- `latest-mac.yml` contains correct version and checksums
- Both arm64 and x64 builds available

## Dependencies

```
Phase 1 (Dependencies)
    ↓
Phase 2 (UpdateManager)
    ↓
Phase 3 (API) ──→ Phase 5 (Platform) ──→ Phase 6 (UI)
    ↓
Phase 4 (Main Process)
    ↓
Phase 7 (Build Scripts)
```

## Update Settings Schema

```typescript
interface UpdateSettings {
  autoCheck: boolean           // Check on startup (default: true)
  autoDownload: boolean        // Auto-download (default: false)
  autoInstallOnQuit: boolean   // Install on quit (default: false)
  devMode: boolean             // Enable local build watching
  devBuildPath: string | null  // Path to watch for dev builds
  checkIntervalMinutes: number // Minutes between checks (default: 60)
}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `dashboard/package.json` | Modify | Add dependencies |
| `dashboard/electron-builder.yml` | Modify | Add publish config |
| `dashboard/src/shared/types/update.ts` | Create | Update-related types |
| `dashboard/src/main/update-manager.ts` | Create | Core update logic |
| `dashboard/src/main/index.ts` | Modify | Initialize UpdateManager |
| `dashboard/src/api-server/update-handlers.ts` | Create | API handlers |
| `dashboard/src/api-server/server.ts` | Modify | Register handlers |
| `dashboard/src/renderer/src/platform/types.ts` | Modify | Add update methods |
| `dashboard/src/renderer/src/platform/http-platform.ts` | Modify | Implement methods |
| `dashboard/src/renderer/src/hooks/useUpdateStatus.ts` | Create | Update state hook |
| `dashboard/src/renderer/src/components/UpdateNotification.tsx` | Create | Update banner |
| `dashboard/src/renderer/src/components/UpdateProgress.tsx` | Create | Progress UI |
| `dashboard/src/renderer/src/components/UpdateSettings.tsx` | Create | Settings panel |
| `dashboard/src/renderer/src/components/Dashboard.tsx` | Modify | Integrate UI |
| `packaging/macos/build-installer.sh` | Modify | Generate artifacts |
