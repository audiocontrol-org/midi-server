# Feature: Self-Updating Shell

**Status:** Planning
**Milestone:** [Week of Feb 17-21](https://github.com/audiocontrol-org/midi-server/milestone/2)
**Branch:** `feature/self-update`
**Parent Issue:** [#15](https://github.com/audiocontrol-org/midi-server/issues/15)

## Overview

Create a self-updating launcher that, once installed, can automatically detect, download, and apply updates from GitHub releases (production) or a local build directory (development). The shell is installed once and continuously updates to new versions without re-running the installer.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases with issue links |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [x] Feature documentation created
- [x] GitHub milestone created
- [x] GitHub issues created
- [ ] Dependencies added (electron-updater, chokidar)
- [ ] UpdateManager implemented
- [ ] API endpoints added
- [ ] UI components created
- [ ] Build scripts updated
- [ ] Documentation complete

## GitHub Issues

| # | Title | Status |
|---|-------|--------|
| [#15](https://github.com/audiocontrol-org/midi-server/issues/15) | [self-update] Self-updating shell for MIDI Server | Open |
| [#16](https://github.com/audiocontrol-org/midi-server/issues/16) | Add electron-updater and configure electron-builder | Open |
| [#17](https://github.com/audiocontrol-org/midi-server/issues/17) | Implement UpdateManager for main process | Open |
| [#18](https://github.com/audiocontrol-org/midi-server/issues/18) | Add update API endpoints to API server | Open |
| [#19](https://github.com/audiocontrol-org/midi-server/issues/19) | Add update UI components | Open |
| [#20](https://github.com/audiocontrol-org/midi-server/issues/20) | Update build scripts for release artifacts | Open |
| [#21](https://github.com/audiocontrol-org/midi-server/issues/21) | Add update system documentation | Open |

## Key Features

### Production Mode
- Checks GitHub releases for updates
- Verifies code signatures before applying
- Downloads updates with progress indication
- Atomic update application with restart

### Development Mode
- Watches local build directory for changes
- Detects new builds via Info.plist version
- Allows rapid iteration without GitHub releases
- Clear UI indication of dev mode

## Technical Stack

- **electron-updater**: GitHub release integration
- **chokidar**: Local file watching
- **electron-builder**: Generates update manifests

## Dev Mode Workflow

For developers testing updates locally:

1. Install shell app once (via .pkg or drag to Applications)
2. Open app > Settings > Enable Dev Mode
3. Set "Dev Build Path" to `~/work/midi-server-work/midi-server/dashboard/dist`
4. Build app locally: `cd dashboard && npm run build:mac`
5. Shell detects new build > "Update Available" notification
6. Click "Apply" > App restarts with new code
