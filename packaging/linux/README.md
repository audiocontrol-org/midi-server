# Linux Release Process

This directory contains scripts for building Linux installers (DEB package and AppImage).

## Quick Start

Build the Linux installer:

```bash
cd dashboard
npm run build:linux:installer
```

Or run the script directly:

```bash
./packaging/linux/build-installer.sh
```

## Prerequisites

### Build Dependencies

On Ubuntu/Debian, install the required development packages:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  libasound2-dev \
  libgtk-3-dev \
  libnotify-dev \
  libnss3-dev \
  libxss-dev \
  libxtst-dev \
  libsecret-1-dev
```

### Node.js

Node.js 18+ is required for electron-builder:

```bash
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or via apt
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Build Options

The `build-installer.sh` script accepts several flags:

| Flag | Description |
|------|-------------|
| `--version VERSION` | Override version (default: reads from VERSION file) |
| `--skip-build` | Skip CMake and Electron build steps |
| `--deb-only` | Build only DEB package (skip AppImage) |
| `--appimage-only` | Build only AppImage (skip DEB) |

### Examples

```bash
# Full build (DEB + AppImage)
./packaging/linux/build-installer.sh

# Specific version
./packaging/linux/build-installer.sh --version 1.0.0

# DEB package only
./packaging/linux/build-installer.sh --deb-only

# Use existing build artifacts
./packaging/linux/build-installer.sh --skip-build
```

## Output

The build produces:

| Artifact | Location |
|----------|----------|
| DEB package | `dashboard/dist/midi-server_X.Y.Z_amd64.deb` |
| AppImage | `dashboard/dist/MidiServer-X.Y.Z.AppImage` |

## Installation

### DEB Package

```bash
# Install
sudo dpkg -i dashboard/dist/midi-server_*.deb

# Fix any missing dependencies
sudo apt-get install -f

# Or use apt directly (handles dependencies)
sudo apt install ./dashboard/dist/midi-server_*.deb
```

### AppImage

```bash
# Make executable and run
chmod +x MidiServer-*.AppImage
./MidiServer-*.AppImage
```

## Uninstall

### DEB Package

```bash
# Remove (keep config)
sudo dpkg -r midi-server

# Purge (remove config too)
sudo dpkg --purge midi-server
```

## Directory Structure

```
packaging/linux/
├── scripts/
│   ├── postinst          # Post-install script (DEB)
│   └── postrm            # Post-remove script (DEB)
├── resources/
│   ├── midi-server.desktop
│   └── icons/
│       ├── 16x16.png
│       ├── 32x32.png
│       ├── 48x48.png
│       ├── 128x128.png
│       ├── 256x256.png
│       └── 512x512.png
├── build-installer.sh    # Main build script
└── README.md             # This file
```

## Installation Paths

After installation via DEB package:

| Component | Path |
|-----------|------|
| App bundle | `/opt/MidiServer/` |
| CLI symlink | `/usr/local/bin/midi-http-server` |
| Desktop entry | `/usr/share/applications/midi-server.desktop` |
| Icons | `/usr/share/icons/hicolor/*/apps/midi-server.png` |
| User config | `~/.config/audiocontrol.org/midi-server/` |

## Tested Distributions

| Distribution | Version | Status |
|--------------|---------|--------|
| Ubuntu | 22.04 LTS | Planned |
| Ubuntu | 24.04 LTS | Planned |
| Debian | 11+ | Planned |

## Troubleshooting

### Missing ALSA libraries

If you see errors about missing ALSA/sound libraries:

```bash
sudo apt-get install libasound2
```

### AppImage won't start

Ensure FUSE is available:

```bash
sudo apt-get install libfuse2
```

### Desktop entry not appearing

Update the desktop database:

```bash
sudo update-desktop-database
```
