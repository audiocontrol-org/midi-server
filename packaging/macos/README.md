# macOS Installer Build

This directory contains scripts for building signed and notarized macOS installers. **All signing and notarization is done locally** - CI only performs unsigned builds and validation.

## Quick Start

```bash
cd dashboard
export RELEASE_SECRETS_PASSWORD="your-password"
npm run build:mac:installer
```

## Prerequisites

1. **Apple Developer ID certificates** in your keychain:
   - Developer ID Application (for code signing)
   - Developer ID Installer (for package signing)

2. **Encrypted secrets file** at `~/.config/audiocontrol.org/midi-server/release.secrets.enc` containing:
   - `APPLE_ID` - Apple ID email for notarization
   - `APPLE_TEAM_ID` - Team ID
   - `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password for notarization
   - `DEVELOPER_ID_APP` - Full name of app signing identity
   - `DEVELOPER_ID_INSTALLER` - Full name of installer signing identity

3. **Environment variable** `RELEASE_SECRETS_PASSWORD` set to decrypt the secrets file.

## Setting Up Secrets

### First-time setup

Run the interactive setup script:

```bash
./packaging/macos/release-secrets-init.sh
```

This prompts for your credentials and creates the encrypted secrets file.

### Manual setup

Create the secrets file manually:

```bash
mkdir -p ~/.config/audiocontrol.org/midi-server

# Create plaintext secrets (temporarily)
cat > /tmp/secrets.txt << 'EOF'
APPLE_ID=your-apple-id@example.com
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
DEVELOPER_ID_APP=Developer ID Application: Your Name (XXXXXXXXXX)
DEVELOPER_ID_INSTALLER=Developer ID Installer: Your Name (XXXXXXXXXX)
EOF

# Encrypt with your password
openssl enc -aes-256-cbc -pbkdf2 -md sha256 -a \
  -in /tmp/secrets.txt \
  -out ~/.config/audiocontrol.org/midi-server/release.secrets.enc

# Clean up
rm /tmp/secrets.txt
```

## Build Options

The `build-installer.sh` script accepts several flags:

| Flag | Description |
|------|-------------|
| `--version VERSION` | Override version (default: reads from VERSION file) |
| `--skip-build` | Skip CMake and Electron build steps |
| `--skip-sign` | Skip code signing (for testing) |
| `--skip-notarize` | Skip notarization step |
| `--app-identity ID` | Override Developer ID Application identity |
| `--installer-identity ID` | Override Developer ID Installer identity |

### Examples

```bash
# Full signed and notarized build
npm run build:mac:installer

# Skip notarization (faster for testing)
npm run build:mac:installer -- --skip-notarize

# Use existing build artifacts
npm run build:mac:installer -- --skip-build

# Specific version
npm run build:mac:installer -- --version 1.0.0
```

## Output

The build produces:

| Artifact | Location |
|----------|----------|
| Signed installer | `build/pkg/MidiServer-X.Y.Z.pkg` |
| DMG (for auto-update) | `dashboard/dist/dashboard-X.Y.Z.dmg` |
| Update manifest | `dashboard/dist/latest-mac.yml` |
| Update zip | `dashboard/dist/MidiServer-X.Y.Z-mac.zip` |

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `build-installer.sh` | Main build script - builds, signs, and notarizes |
| `release-build.sh` | Wrapper for build-installer.sh with version handling |
| `release-preflight.sh` | Validates configuration and scripts |
| `release-secrets.sh` | Loads encrypted secrets into environment |
| `release-secrets-init.sh` | Interactive setup for secrets file |
| `release-common.sh` | Shared utilities |
| `release.config.sh` | Default configuration values |
| `release-prepare.sh` | Prepares a release (bumps version, etc.) |
| `release-cut.sh` | Cuts a release (creates git tag) |
| `release-publish.sh` | Publishes release artifacts |

## Why Local-Only Signing?

macOS code signing in CI environments (GitHub Actions) has proven unreliable due to:

- Keychain access issues in ephemeral runners
- productsign hanging on large packages
- securityd IPC timeouts
- Partition list and access control complexities

Local signing with persistent keychain access is reliable and fast.
