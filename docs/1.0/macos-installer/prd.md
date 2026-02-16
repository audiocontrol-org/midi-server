# Product Requirements: macOS Installer

## Problem Statement

Users who want to run the MIDI HTTP Server on macOS must currently build from source. Without proper code signing and notarization, macOS Gatekeeper blocks execution, requiring users to manually approve the binary through System Preferences. This creates friction for non-developer users and prevents easy distribution.

## Solution

Create a signed and notarized macOS installer (.pkg) that users can download and install without Gatekeeper warnings. The installer will:

1. Contain a code-signed binary with hardened runtime
2. Be notarized by Apple for immediate trust
3. Install the server to `/usr/local/bin/` for system-wide access
4. Include network entitlements for HTTP server operation

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Code-signed binary that runs without Gatekeeper warnings | Must |
| F2 | .pkg installer for easy installation to `/usr/local/bin/` | Must |
| F3 | Apple notarization so macOS trusts the software | Must |
| F4 | Network server entitlement for HTTP listener | Must |
| F5 | CI/CD workflow for automated release builds | Must |
| F6 | LaunchDaemon/LaunchAgent for auto-start on login | Nice |
| F7 | Uninstaller script | Nice |
| F8 | DMG alternative for drag-and-drop installation | Nice |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | Build completes in CI within 15 minutes | Should |
| N2 | Notarization completes within 30 minutes | Should |
| N3 | Installer size under 10MB | Should |
| N4 | Works on macOS 12+ (Monterey and later) | Must |

## Technical Approach

### Code Signing Requirements

| Certificate | Purpose |
|-------------|---------|
| Developer ID Application | Signs the executable binary |
| Developer ID Installer | Signs the .pkg installer |

Both require an Apple Developer Program membership ($99/year).

### Entitlements

For a network server with hardened runtime:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

Note: CoreMIDI does NOT require special entitlements outside App Sandbox.

### Notarization Process

1. Sign binary with hardened runtime: `codesign --sign "Developer ID" --options runtime --entitlements entitlements.plist`
2. Create .pkg installer: `pkgbuild`
3. Sign installer: `productsign --sign "Developer ID Installer"`
4. Submit for notarization: `xcrun notarytool submit`
5. Staple ticket: `xcrun stapler staple`

## Success Criteria

1. Installer downloads and runs without Gatekeeper warnings
2. `pkgutil --check-signature` reports valid signature
3. `spctl --assess -vv --type install` reports acceptance
4. Binary executes and accepts HTTP connections after installation
5. MIDI port listing works correctly
6. CI workflow completes successfully on tagged releases

## Out of Scope

- GUI installer wizard (use standard macOS pkg UI)
- Electron wrapper/dashboard (future phase 2)
- Windows or Linux installers (separate feature)
- Automatic updates / update checking
- System preferences pane

## Prerequisites (User Action Required)

Before implementation can proceed:

1. **Apple Developer Program membership** - Required for Developer ID certificates
2. **Generate certificates** in Apple Developer portal:
   - Developer ID Application
   - Developer ID Installer
3. **Export certificates** as .p12 files
4. **Create App-Specific Password** at appleid.apple.com for notarization
5. **Add secrets** to GitHub repository settings

## References

- [Apple Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Configuring Hardened Runtime](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime)
- [pkgbuild man page](https://www.manpagez.com/man/1/pkgbuild/)
- [productbuild man page](https://www.manpagez.com/man/1/productbuild/)
