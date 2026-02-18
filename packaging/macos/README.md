# macOS Release Process

This directory contains scripts for building, signing, notarizing, and publishing macOS releases. **All signing and notarization is done locally** - CI only performs unsigned builds and validation.

## Release Workflow

### One-Command Release

The simplest way to cut a release:

```bash
export RELEASE_SECRETS_PASSWORD="your-password"
./packaging/macos/release-cut.sh --version 1.0.0
```

This single command:
1. Updates VERSION file and package.json
2. Creates release commit and tag
3. Builds C++ and Electron apps
4. Signs with Developer ID certificates
5. Notarizes with Apple
6. Pushes commit and tag to origin
7. Creates GitHub release with all artifacts

### Step-by-Step Release

For more control, run each step separately:

```bash
export RELEASE_SECRETS_PASSWORD="your-password"

# 1. Prepare version (updates files, commits, tags)
./packaging/macos/release-prepare.sh --version 1.0.0 --commit --tag

# 2. Build and sign
./packaging/macos/release-build.sh --version 1.0.0

# 3. Push to remote
git push origin main
git push origin v1.0.0

# 4. Publish GitHub release
./packaging/macos/release-publish.sh --version 1.0.0
```

### Build Only (No Release)

To build a signed installer without publishing:

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

## Release Options

### release-cut.sh

| Flag | Description |
|------|-------------|
| `--version VERSION` | Release version (required) |
| `--notes TEXT` | Release notes body |
| `--notes-file FILE` | Release notes from file |
| `--draft` | Create as draft release |
| `--prerelease` | Mark as prerelease |
| `--no-push` | Skip git push (build only) |
| `--` | Pass remaining args to build-installer.sh |

### Examples

```bash
# Standard release
./packaging/macos/release-cut.sh --version 1.0.0

# Prerelease with notes
./packaging/macos/release-cut.sh --version 1.0.0-beta.1 --prerelease --notes "Beta release"

# Draft release (review before publishing)
./packaging/macos/release-cut.sh --version 1.0.0 --draft

# Skip notarization (faster, for testing)
./packaging/macos/release-cut.sh --version 1.0.0 -- --skip-notarize
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `release-cut.sh` | **Full release flow** - prepare, build, sign, push, publish |
| `release-prepare.sh` | Updates version, creates commit and tag |
| `release-build.sh` | Builds signed and notarized artifacts |
| `release-publish.sh` | Creates GitHub release with artifacts |
| `build-installer.sh` | Low-level build script |
| `release-preflight.sh` | Validates configuration and scripts |
| `release-secrets.sh` | Loads encrypted secrets into environment |
| `release-secrets-init.sh` | Interactive setup for secrets file |
| `release-common.sh` | Shared utilities |
| `release.config.sh` | Default configuration values |

## Why Local-Only Signing?

macOS code signing in CI environments (GitHub Actions) has proven unreliable due to:

- Keychain access issues in ephemeral runners
- productsign hanging on large packages
- securityd IPC timeouts
- Partition list and access control complexities

Local signing with persistent keychain access is reliable and fast.
