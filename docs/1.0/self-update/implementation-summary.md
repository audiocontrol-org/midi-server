# Implementation Summary: Self-Updating Shell

**Status:** In Progress
**Completed:** 2026-02-16 (partial)
**Author:** Codex + Orion

## Overview

Implemented the core self-update pipeline for production and development modes:

- Main-process update service (`UpdateManager`) with `electron-updater` integration
- Development mode local build watcher via `chokidar`
- Update API endpoints + SSE stream
- Dashboard update UI (notification, progress, settings)
- macOS release workflow and artifact checks (`dmg`, `zip`, `latest-mac.yml`)

## What Was Built

### Components Added

| Component | Description |
|-----------|-------------|
| UpdateManager | Added update state machine, persisted settings, production checks/download/install, dev build detection and relaunch |
| Update API endpoints | Added `/api/update/status`, `/check`, `/download`, `/install`, `/settings`, `/stream` |
| Update UI components | Added `useUpdateStatus`, `UpdateNotification`, `UpdateProgress`, `UpdateSettings`, and dashboard integration |
| Build script changes | Updated macOS installer/build flow to verify updater artifacts and added release workflow |

## Technical Decisions

- Exposed update functionality through existing API server instead of direct renderer-to-main IPC to keep web/electron parity.
- Added update event streaming via SSE (`/api/update/stream`) for incremental UI status updates.
- Kept dev mode explicitly opt-in with configurable local build path and clear channel status.
- Implemented dev build path fallback to `MIDI_DEV_BUILD_PATH` when settings value is unset.
- Added dev install relaunch fallback to current app when launching target dev executable fails.
- Debounced and serialized dev watcher-triggered update checks to avoid duplicate/overlapping checks.
- Restricted dev watcher triggers to relevant `Info.plist` paths under configured build path.

## Challenges and Solutions

- `RoutesStorage` reads config dir at module load time, which affected update API tests.
  - Solution: test harness now sets `MIDI_SERVER_CONFIG_DIR` before lazy-importing API modules.
- Sandbox blocks local IPC sockets for `tsx` during tests.
  - Solution: run update API tests with elevated permissions in this environment.

## Testing

### Manual Testing
- [ ] Production update flow tested
- [ ] Dev mode update flow tested
- [x] Settings persistence verified (API-level)
- [x] Error handling verified (service-not-configured API path)

### Verification
- [ ] App detects new version on GitHub
- [ ] Download progress shows correctly
- [ ] Update applies and app restarts
- [ ] Dev mode watcher detects local builds
- [x] Settings persist across restarts
- [x] Update API endpoints validated via automated test
- [x] Update SSE stream validated via automated test

## Files Changed

- `dashboard/src/main/update-manager.ts`
- `dashboard/src/main/index.ts`
- `dashboard/src/api-server/update-handlers.ts`
- `dashboard/src/api-server/server.ts`
- `dashboard/src/shared/types/update.ts`
- `dashboard/src/renderer/src/hooks/useUpdateStatus.ts`
- `dashboard/src/renderer/src/components/UpdateNotification.tsx`
- `dashboard/src/renderer/src/components/UpdateProgress.tsx`
- `dashboard/src/renderer/src/components/UpdateSettings.tsx`
- `dashboard/src/renderer/src/components/Dashboard.tsx`
- `dashboard/tests/update/update-api.test.ts`
- `dashboard/electron-builder.yml`
- `packaging/macos/build-installer.sh`
- `.github/workflows/release-macos.yml`

## Future Improvements

- Add rollback/fallback behavior for failed update apply.
- Add targeted unit tests for version parsing/comparison and dev build metadata extraction.
- Add release-signing/notarization validation in CI for production releases.

## References

- [electron-updater documentation](https://www.electron.build/auto-update)
- [chokidar documentation](https://github.com/paulmillr/chokidar)
