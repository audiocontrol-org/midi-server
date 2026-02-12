# Feature: macOS Installer

**Status:** Planning
**Milestone:** Week of Feb 17-21
**Branch:** `feature/macos-installer`

## Overview

Create a signed and notarized macOS installer (.pkg) for the MIDI HTTP Server that users can download and install without Gatekeeper warnings.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases with issue links |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [x] Feature documentation created
- [ ] GitHub milestone created
- [ ] GitHub issues created
- [ ] Packaging scripts added
- [ ] Code signing configured
- [ ] Notarization working
- [ ] CI workflow complete
- [ ] Documentation updated

## Prerequisites

Before implementation can begin, the repository owner must:

1. Have an active Apple Developer Program membership
2. Generate Developer ID certificates (Application + Installer)
3. Export certificates as .p12 files
4. Create an App-Specific Password for notarization
5. Add the required secrets to GitHub repository settings

See [workplan.md](./workplan.md) for the full list of required GitHub secrets.

## Future: Electron Dashboard (Phase 2)

After the installer is complete, a follow-up feature will add:

- Electron wrapper app that launches/manages the C++ server
- Full dashboard with server configuration UI
- Visual MIDI port selection
- Real-time MIDI traffic visualization
- Single .dmg installer for the complete application
