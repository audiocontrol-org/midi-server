# Work Plan: macOS Installer

## Milestone

[Week of Feb 17-21](https://github.com/audiocontrol-org/midi-server/milestone/2)

## Issues

| # | Title | Status |
|---|-------|--------|
| [#8](https://github.com/audiocontrol-org/midi-server/issues/8) | [macos-installer] Create signed macOS installer | Open |
| [#9](https://github.com/audiocontrol-org/midi-server/issues/9) | Add entitlements and packaging scripts | Open |
| [#10](https://github.com/audiocontrol-org/midi-server/issues/10) | Set up code signing in CI | Open |
| [#11](https://github.com/audiocontrol-org/midi-server/issues/11) | Add notarization to CI | Open |
| [#12](https://github.com/audiocontrol-org/midi-server/issues/12) | Create GitHub Release workflow | Open |
| [#13](https://github.com/audiocontrol-org/midi-server/issues/13) | Add installation documentation | Open |

## Phases

### Phase 1: Packaging Scripts ([#9](https://github.com/audiocontrol-org/midi-server/issues/9))

**Objective:** Create the entitlements file and packaging infrastructure

**Tasks:**
- [ ] Create `packaging/macos/` directory structure
- [ ] Create `entitlements.plist` with network server/client permissions
- [ ] Create `scripts/preinstall` for pre-install cleanup
- [ ] Create `scripts/postinstall` for symlinks and setup
- [ ] Create `distribution.xml` for installer UI configuration
- [ ] Create `build-installer.sh` main build script

**Verification:**
- Scripts pass shellcheck linting
- entitlements.plist is valid XML

### Phase 2: Code Signing ([#10](https://github.com/audiocontrol-org/midi-server/issues/10))

**Objective:** Configure code signing for the binary

**Tasks:**
- [ ] Add certificate import steps to build script
- [ ] Sign binary with `codesign --options runtime`
- [ ] Verify signature with `codesign --verify`
- [ ] Test locally with Developer ID Application certificate

**Verification:**
- `codesign -dv --verbose=4` shows correct identity
- Binary runs without Gatekeeper prompt (after notarization)

### Phase 3: Package Creation (Part of [#9](https://github.com/audiocontrol-org/midi-server/issues/9))

**Objective:** Create and sign the .pkg installer

**Tasks:**
- [ ] Create staging directory with binary and any supporting files
- [ ] Use `pkgbuild` to create component package
- [ ] Use `productbuild` to create product archive with distribution.xml
- [ ] Sign package with `productsign`

**Verification:**
- `pkgutil --check-signature` reports valid
- Package installs correctly to `/usr/local/bin/`

### Phase 4: Notarization ([#11](https://github.com/audiocontrol-org/midi-server/issues/11))

**Objective:** Submit to Apple for notarization and staple ticket

**Tasks:**
- [ ] Submit package with `xcrun notarytool submit`
- [ ] Wait for completion with `--wait` flag
- [ ] Staple notarization ticket with `xcrun stapler staple`
- [ ] Verify notarization with `spctl --assess`

**Verification:**
- `spctl --assess -vv --type install` shows "accepted"
- Package installs without any Gatekeeper warnings

### Phase 5: GitHub Release Workflow ([#12](https://github.com/audiocontrol-org/midi-server/issues/12))

**Objective:** Automate release builds with tag-triggered CI

**Tasks:**
- [ ] Create `.github/workflows/release-macos.yml`
- [ ] Configure trigger on `v*` tags
- [ ] Import certificates from GitHub secrets
- [ ] Run build-installer.sh
- [ ] Upload .pkg to GitHub Release

**Verification:**
- Tag push triggers workflow
- Release page contains downloadable .pkg
- Downloaded .pkg passes verification

### Phase 6: Documentation ([#13](https://github.com/audiocontrol-org/midi-server/issues/13))

**Objective:** Document installation process and troubleshooting

**Tasks:**
- [ ] Update README.md with installation instructions
- [ ] Document required GitHub secrets
- [ ] Add troubleshooting section for common issues
- [ ] Document manual build process for contributors

**Verification:**
- New user can download and install from README alone

## Dependencies

```
Phase 1 (Scripts)
    ↓
Phase 2 (Signing) → Phase 3 (Package)
                        ↓
                   Phase 4 (Notarize)
                        ↓
                   Phase 5 (CI) → Phase 6 (Docs) [parallel]
```

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `APPLE_DEVELOPER_ID_APP` | "Developer ID Application: Name (TEAM_ID)" |
| `APPLE_DEVELOPER_ID_INSTALLER` | "Developer ID Installer: Name (TEAM_ID)" |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_TEAM_ID` | 10-character team identifier |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `MACOS_CERTIFICATE_P12` | Base64-encoded .p12 certificate |
| `MACOS_CERTIFICATE_PASSWORD` | Password for .p12 |

## Files to Create

```
midi-server/
├── packaging/
│   └── macos/
│       ├── entitlements.plist       # Hardened runtime entitlements
│       ├── scripts/
│       │   ├── postinstall          # Post-install script (symlinks, etc.)
│       │   └── preinstall           # Pre-install cleanup
│       ├── distribution.xml         # Installer UI configuration
│       └── build-installer.sh       # Main build/sign/notarize script
└── .github/
    └── workflows/
        └── release-macos.yml        # CI workflow for releases
```
