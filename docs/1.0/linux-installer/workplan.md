# Work Plan: Ubuntu Linux Installer

## Milestone

[Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)

## Issues

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

## Phases

### Phase 1: Directory Structure ([#65](https://github.com/audiocontrol-org/midi-server/issues/65))

**Objective:** Create the packaging infrastructure directory

**Tasks:**
- [ ] Create `packaging/linux/` directory
- [ ] Create `packaging/linux/scripts/` for install scripts
- [ ] Create `packaging/linux/resources/` for desktop files and icons
- [ ] Create `packaging/linux/README.md` with build instructions

**Files to Create:**
```
packaging/linux/
├── scripts/
├── resources/
│   └── icons/
└── README.md
```

**Verification:**
- Directory structure exists
- README explains the build process

### Phase 2: electron-builder Configuration ([#66](https://github.com/audiocontrol-org/midi-server/issues/66))

**Objective:** Configure electron-builder for Linux DEB and AppImage builds

**Tasks:**
- [ ] Update `dashboard/electron-builder.yml` with Linux configuration
- [ ] Add `linux` section with target architectures
- [ ] Add `deb` section with dependencies
- [ ] Add package scripts to `dashboard/package.json`

**Configuration to Add:**
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

**Verification:**
- electron-builder validates configuration
- `npm run build:linux` runs without errors

### Phase 3: Install Scripts ([#67](https://github.com/audiocontrol-org/midi-server/issues/67))

**Objective:** Create DEB package install/remove scripts

**Tasks:**
- [ ] Create `packaging/linux/scripts/postinst`
  - Verify installation at `/opt/MidiServer/`
  - Ensure CLI binary is executable
  - Create symlink at `/usr/local/bin/midi-http-server`
  - Update desktop database
  - Log installation details
- [ ] Create `packaging/linux/scripts/postrm`
  - Remove symlink on uninstall
  - Clean up config directory on purge
  - Update desktop database

**Verification:**
- Scripts pass shellcheck linting
- Scripts are executable (chmod +x)

### Phase 4: Desktop Integration ([#68](https://github.com/audiocontrol-org/midi-server/issues/68))

**Objective:** Create desktop entry and icon files

**Tasks:**
- [ ] Create `packaging/linux/resources/midi-server.desktop`
- [ ] Create icons in multiple sizes (16x16, 32x32, 48x48, 128x128, 256x256, 512x512)
- [ ] Place icons in `packaging/linux/resources/icons/`

**Desktop Entry:**
```desktop
[Desktop Entry]
Name=MIDI Server
Comment=HTTP-to-MIDI bridge server
Exec=/opt/MidiServer/midi-server
Icon=midi-server
Type=Application
Categories=Audio;AudioVideo;
Terminal=false
```

**Verification:**
- Desktop entry validates with `desktop-file-validate`
- Icons are PNG format at correct sizes

### Phase 5: Build Script ([#69](https://github.com/audiocontrol-org/midi-server/issues/69))

**Objective:** Create the main build script (mirroring macOS pattern)

**Tasks:**
- [ ] Create `packaging/linux/build-installer.sh`
  - Step 1: Build C++ CLI binary for Linux
  - Step 2: Run electron-builder for DEB and AppImage
  - Step 3: Verify package contents
  - Step 4: Generate checksums
  - Step 5: Stage artifacts for release
- [ ] Create `packaging/linux/release-build.sh` for release automation

**Verification:**
- Script passes shellcheck linting
- Script produces DEB and AppImage files
- Checksums are generated

### Phase 6: CI Integration ([#70](https://github.com/audiocontrol-org/midi-server/issues/70))

**Objective:** Add Linux build to GitHub Actions workflow

**Tasks:**
- [ ] Update `.github/workflows/build.yml` or create `release-linux.yml`
- [ ] Add Ubuntu runner with required dependencies
- [ ] Install libasound2-dev and other build dependencies
- [ ] Build DEB and AppImage artifacts
- [ ] Upload artifacts to GitHub Release

**Dependencies to Install:**
```bash
sudo apt-get update
sudo apt-get install -y \
  libasound2-dev \
  libgtk-3-dev \
  libnotify-dev \
  libnss3-dev \
  libxss-dev \
  libxtst-dev
```

**Verification:**
- CI workflow runs on Ubuntu
- Artifacts are uploaded to release

### Phase 7: Testing ([#71](https://github.com/audiocontrol-org/midi-server/issues/71))

**Objective:** Verify installation on target Ubuntu versions

**Tasks:**
- [ ] Test DEB installation on Ubuntu 22.04 LTS
- [ ] Test DEB installation on Ubuntu 24.04 LTS
- [ ] Test AppImage on Ubuntu 22.04 and 24.04
- [ ] Verify CLI command availability
- [ ] Verify desktop entry appears in menu
- [ ] Verify MIDI functionality
- [ ] Test uninstall removes all components

**Verification:**
- All tests pass on both Ubuntu versions
- No Gatekeeper-equivalent warnings

## Dependencies

```
Phase 1 (Directory Structure)
    ↓
Phase 2 (electron-builder) → Phase 3 (Scripts) → Phase 4 (Desktop)
                                    ↓
                              Phase 5 (Build Script)
                                    ↓
                              Phase 6 (CI)
                                    ↓
                              Phase 7 (Testing)
```

## Files to Create

```
midi-server/
├── packaging/
│   └── linux/
│       ├── scripts/
│       │   ├── postinst          # Post-install script
│       │   └── postrm            # Post-remove script
│       ├── resources/
│       │   ├── midi-server.desktop
│       │   └── icons/
│       │       ├── 16x16.png
│       │       ├── 32x32.png
│       │       ├── 48x48.png
│       │       ├── 128x128.png
│       │       ├── 256x256.png
│       │       └── 512x512.png
│       ├── build-installer.sh    # Main build script
│       ├── release-build.sh      # Release automation
│       └── README.md             # Build documentation
├── dashboard/
│   ├── electron-builder.yml      # Modified for Linux
│   └── package.json              # Add build:linux scripts
└── .github/
    └── workflows/
        └── release-linux.yml     # CI workflow (or update existing)
```

## Files to Modify

| File | Changes |
|------|---------|
| `dashboard/electron-builder.yml` | Add Linux target configuration |
| `dashboard/package.json` | Add `build:linux` and `build:linux:installer` scripts |
| `.github/workflows/build.yml` | Add Linux installer build step |
