# Releasing MIDI Server

This document describes how to cut and publish releases for MIDI Server.

## A Note on the Release Process

This release process depends on a specific macOS build machine with signing credentials. This is admittedly not ideal—releases should ideally be fully automated via CI/CD with no local machine dependencies.

However, getting macOS code signing and notarization to work reliably in GitHub Actions is an herculean task involving encrypted certificates, provisioning profiles, keychain management, and Apple's notarization service quirks. After significant effort, we chose pragmatism over perfection: a working release process that runs locally is better than no releases at all while waiting for a "proper" CI/CD setup.

If you're interested in improving this, contributions to automate the release process in GitHub Actions are welcome.

## Prerequisites

- macOS (required for signing and notarization)
- Docker (for Linux builds)
- `RELEASE_SECRETS_PASSWORD` environment variable (decrypts signing credentials)
- GitHub CLI (`gh`) authenticated with push access

## Quick Release

```bash
# 1. Update the version
echo "1.2.3" > VERSION

# 2. Build all platforms and create release commit/tag
RELEASE_SECRETS_PASSWORD=<password> make release

# 3. Push and publish to GitHub
RELEASE_SECRETS_PASSWORD=<password> make publish
```

## Step-by-Step Process

### 1. Update Version

Edit the `VERSION` file with the new version number:

```bash
echo "1.2.3" > VERSION
```

The version is the single source of truth and propagates to:
- `dashboard/package.json`
- All build artifacts
- Git tags

### 2. Build Release Artifacts

Run the full release build:

```bash
RELEASE_SECRETS_PASSWORD=<password> make release
```

This executes:
- `dist-macos` — Builds signed macOS `.pkg` installer and update artifacts
- `dist-debian` — Builds Linux `.deb` package via Docker
- `dist-source` — Creates source tarball
- `release-commit` — Creates release commit and `v{VERSION}` tag

### 3. Publish to GitHub

```bash
RELEASE_SECRETS_PASSWORD=<password> make publish
```

This:
- Pushes commits and tags to GitHub
- Creates a GitHub Release with all artifacts
- Generates SHA256 checksums

## Individual Build Targets

Build specific platforms independently:

```bash
# macOS only (requires RELEASE_SECRETS_PASSWORD)
RELEASE_SECRETS_PASSWORD=<password> make dist-macos

# Linux only (requires Docker)
make dist-debian

# Source tarball only
make dist-source
```

## Build Artifacts

After a successful build:

| Platform | Location | Contents |
|----------|----------|----------|
| macOS | `build/pkg/` | `.pkg` installer |
| macOS | `dashboard/dist/` | `.dmg`, `.zip`, update manifests |
| Linux | `build/dist-linux/` | `.deb` package |
| Source | `build/release/` | `.tar.gz` source archive |

## Docker Setup (Linux Builds)

Linux packages are built inside a Docker container to ensure compatibility. The container image is built automatically if needed.

To manually rebuild the Docker image:

```bash
make docker-build
```

## Troubleshooting

### "RELEASE_SECRETS_PASSWORD must be set"

The macOS build requires signing credentials. Set the environment variable:

```bash
export RELEASE_SECRETS_PASSWORD=<password>
```

### "Unexpected uncommitted changes"

The release-commit step requires a clean working tree. Commit or stash changes first:

```bash
git status
git add -A && git commit -m "your changes"
```

### Docker build fails on ARM Mac

Ensure Docker is configured for x86_64 emulation. The build scripts use `--platform linux/amd64`.

### Release already exists

If the GitHub release already exists, delete it first:

```bash
gh release delete v1.2.3 --yes
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3
```

Then re-run the release process.
