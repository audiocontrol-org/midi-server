# Feature: Ubuntu Linux Installer

**Status:** Planning
**Milestone:** [Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)
**Branch:** `feature/linux-installer`
**Parent Issue:** [#64](https://github.com/audiocontrol-org/midi-server/issues/64)

## Overview

Create Ubuntu-flavored Linux installers (DEB package and AppImage) for the MIDI HTTP Server that users can download and install without needing to build from source.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases with issue links |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [x] Feature documentation created
- [x] GitHub milestone assigned
- [x] GitHub issues created
- [ ] Directory structure created
- [ ] electron-builder configured
- [ ] Install scripts created
- [ ] Desktop entry and icons added
- [ ] Build script created
- [ ] CI workflow added
- [ ] Installation tested

## GitHub Issues

| # | Title | Status |
|---|-------|--------|
| [#64](https://github.com/audiocontrol-org/midi-server/issues/64) | [packaging] Ubuntu Linux Installer | Open |
| [#65](https://github.com/audiocontrol-org/midi-server/issues/65) | Create packaging/linux directory structure | Open |
| [#66](https://github.com/audiocontrol-org/midi-server/issues/66) | Configure electron-builder for DEB packages | Open |
| [#67](https://github.com/audiocontrol-org/midi-server/issues/67) | Create postinst/postrm scripts | Open |
| [#68](https://github.com/audiocontrol-org/midi-server/issues/68) | Create desktop entry and icons | Open |
| [#69](https://github.com/audiocontrol-org/midi-server/issues/69) | Create build-installer.sh script | Open |
| [#70](https://github.com/audiocontrol-org/midi-server/issues/70) | Add Linux build to CI workflow | Open |
| [#71](https://github.com/audiocontrol-org/midi-server/issues/71) | Test installation on Ubuntu 22.04/24.04 | Open |

## Package Formats

| Format | Purpose | Target |
|--------|---------|--------|
| DEB | Native Ubuntu/Debian installation | Primary |
| AppImage | Portable, cross-distro | Secondary |

## Installation Paths

| Component | Path |
|-----------|------|
| App bundle | `/opt/MidiServer/` |
| CLI symlink | `/usr/local/bin/midi-http-server` |
| Desktop entry | `/usr/share/applications/midi-server.desktop` |
| Icons | `/usr/share/icons/hicolor/*/apps/midi-server.png` |
| Config | `~/.config/audiocontrol.org/midi-server/` |

## Prerequisites

Before implementation:

1. electron-builder already configured (done)
2. macOS installer pattern established (done)
3. GitHub Actions runner with Ubuntu available

## Future Considerations

After this feature is complete, potential enhancements:

- Snap package for Ubuntu Software Center
- Flatpak for cross-distro sandboxed installation
- APT repository for automatic updates
- GPG signing for package verification
