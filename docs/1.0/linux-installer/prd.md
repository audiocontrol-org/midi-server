# Product Requirements: Ubuntu Linux Installer

## Problem Statement

Users who want to run the MIDI HTTP Server on Ubuntu Linux must currently build from source. This requires installing development dependencies (CMake, ALSA dev libraries, etc.) and running build commands. This creates friction for non-developer users and prevents easy distribution to the broader Linux audio community.

## Solution

Create native Linux installers (DEB package and AppImage) that users can download and install without needing to compile from source. The installers will:

1. Provide native Ubuntu/Debian integration via DEB package
2. Offer portable cross-distro option via AppImage
3. Install the server and CLI for system-wide access
4. Include proper desktop integration (application menu, icons)

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | DEB package that installs cleanly via `dpkg -i` | Must |
| F2 | AppImage that runs without installation | Must |
| F3 | CLI available via `midi-http-server` command after install | Must |
| F4 | Application appears in desktop menu | Must |
| F5 | Clean uninstall removes all components | Must |
| F6 | Both x64 and arm64 architectures supported | Must |
| F7 | CI/CD workflow for automated release builds | Must |
| F8 | Desktop entry with proper icon | Should |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | Build completes in CI within 15 minutes | Should |
| N2 | DEB package under 50MB | Should |
| N3 | Works on Ubuntu 22.04 LTS and 24.04 LTS | Must |
| N4 | Works on Debian 11+ | Should |

## Technical Approach

### Package Format Selection

| Format | Decision | Rationale |
|--------|----------|-----------|
| **DEB** | Primary | Native Ubuntu integration, apt support, fastest performance |
| **AppImage** | Secondary | Portable, cross-distro, no installation required |
| Snap | Future | Auto-updates, but slower startup and larger size |
| Flatpak | Future | Cross-distro, but not default on Ubuntu |

### electron-builder Configuration

The dashboard already uses electron-builder. Configuration will be extended:

```yaml
linux:
  target:
    - target: deb
      arch: [x64, arm64]
    - target: AppImage
      arch: [x64, arm64]
  category: Audio
  icon: packaging/linux/resources/icons
  desktop:
    Name: MIDI Server
    Comment: HTTP-to-MIDI bridge server
    Categories: Audio;AudioVideo;

deb:
  depends:
    - libasound2
    - libgtk-3-0
    - libnotify4
    - libnss3
    - libxss1
    - libxtst6
    - xdg-utils
  recommends:
    - libappindicator3-1
  afterInstall: packaging/linux/scripts/postinst
  afterRemove: packaging/linux/scripts/postrm
```

### Installation Paths

| Component | Path |
|-----------|------|
| App bundle | `/opt/MidiServer/` |
| CLI symlink | `/usr/local/bin/midi-http-server` |
| Desktop entry | `/usr/share/applications/midi-server.desktop` |
| Icons | `/usr/share/icons/hicolor/*/apps/midi-server.png` |
| Config | `~/.config/audiocontrol.org/midi-server/` |

### Install Script Responsibilities

**postinst (after install):**
- Verify installation at `/opt/MidiServer/`
- Ensure CLI binary is executable
- Create symlink: `/usr/local/bin/midi-http-server`
- Update desktop database

**postrm (after remove):**
- Remove symlink on uninstall
- Clean up config directory (optional, on purge)
- Update desktop database

## Success Criteria

1. DEB package installs cleanly via `sudo dpkg -i midi-server_*.deb`
2. App appears in application menu with correct icon
3. CLI available via `midi-http-server` command
4. Server starts and accepts HTTP connections
5. MIDI port listing works correctly
6. Uninstall removes all components cleanly
7. AppImage runs without installation
8. Both x64 and arm64 architectures work
9. CI workflow completes successfully on tagged releases

## Out of Scope

- Snap package (future consideration)
- Flatpak package (future consideration)
- Auto-update mechanism (separate feature)
- Package signing with GPG (future consideration)
- APT repository setup (future consideration)
- systemd service for auto-start (separate feature)

## Prerequisites

Before implementation can proceed:

1. **Linux build environment** - Ubuntu runner available in GitHub Actions
2. **ALSA development libraries** - Required for MIDI support
3. **electron-builder** - Already configured in dashboard

## References

- [electron-builder Linux docs](https://www.electron.build/linux.html)
- [Debian Policy Manual - Maintainer Scripts](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html)
- [FreeDesktop Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry-spec/latest/)
- [AppImage Documentation](https://docs.appimage.org/)
