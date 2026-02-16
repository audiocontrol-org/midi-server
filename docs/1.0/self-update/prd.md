# Product Requirements: Self-Updating Shell

## Problem Statement

Once users install the MIDI Server application, they have no mechanism to receive updates other than manually downloading and reinstalling newer versions. This creates friction for users and makes it difficult to roll out bug fixes and new features.

## Solution

Create a self-updating launcher that, once installed, can automatically detect, download, and apply updates from:

1. **GitHub Releases** - Signed .app bundles for production users
2. **Local Build Directory** - Watch a configured path for development builds

The shell is installed once and continuously updates to new versions without re-running the installer.

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Check for updates from GitHub releases on startup | Must |
| F2 | Download and apply updates atomically | Must |
| F3 | Verify code signatures before applying updates | Must |
| F4 | Show update notification in dashboard UI | Must |
| F5 | Allow user to trigger update check manually | Must |
| F6 | Support development mode with local build watching | Must |
| F7 | Show download progress during update | Should |
| F8 | Auto-update option (no user interaction required) | Should |
| F9 | Rollback capability if update fails | Nice |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | Update check completes within 5 seconds | Should |
| N2 | Update download shows accurate progress | Should |
| N3 | Atomic update prevents corruption mid-install | Must |
| N4 | Works on macOS 12+ (Monterey and later) | Must |
| N5 | Dev mode clearly indicated in UI | Must |

## Technical Approach

### Production Updates: electron-updater

Use `electron-updater` from electron-builder (already our build tool):

- **Update Source**: GitHub Releases with `latest-mac.yml` manifest
- **Signing**: Verifies code signature before applying
- **Atomic**: Downloads to temp, swaps atomically, restarts
- **Rollback**: Keeps previous version for recovery

### Development Updates: Local Build Watcher

Custom module using `chokidar` that watches a local directory for new builds:

- **Watch Path**: Configurable via Settings UI or `MIDI_DEV_BUILD_PATH` env
- **Detection**: Monitor for `MidiServer.app/Contents/Info.plist` changes
- **Comparison**: Parse `CFBundleVersion` to detect newer builds
- **Restart**: Same restart flow as production updates

### GitHub Release Structure

For electron-updater to work, releases must include:

```
v0.2.0/
  MidiServer-0.2.0-arm64.dmg        # ARM installer
  MidiServer-0.2.0-arm64.dmg.blockmap
  MidiServer-0.2.0-x64.dmg          # Intel installer
  MidiServer-0.2.0-x64.dmg.blockmap
  MidiServer-0.2.0-arm64-mac.zip    # ARM update payload
  MidiServer-0.2.0-x64-mac.zip      # Intel update payload
  latest-mac.yml                    # Update manifest
```

## Success Criteria

1. App detects new version available on GitHub within 5 seconds of check
2. Update downloads and applies without user needing to reinstall
3. App restarts with new version after update
4. Dev mode: local build changes trigger update notification within 5 seconds
5. Failed updates do not corrupt the installation

## Out of Scope

- Windows/Linux auto-update (separate feature)
- Delta updates (full app download each time)
- Silent background updates without any notification
- Downgrade capability

## Security Considerations

### Production
- electron-updater verifies code signatures
- Only accepts updates from configured GitHub repo
- Uses HTTPS for all downloads

### Development
- Dev mode requires explicit opt-in
- Local builds skip signature verification (intentional)
- Dev mode indicator shown in UI (prevent confusion)

## Dependencies

- electron-updater ^6.x (npm package)
- chokidar ^4.x (npm package for file watching)
- Existing electron-builder setup
- GitHub repository configured for releases
