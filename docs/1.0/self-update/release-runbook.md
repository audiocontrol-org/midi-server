# Self-Update Release Runbook (Scripted)

This runbook is fully scripted and supports:

- discrete steps (`prepare`, `build`, `publish`)
- one-click release cut (`release-cut`)
- installer-only builds (`build-installer`)

## Prerequisites

- macOS with Xcode command-line tools
- `npm`, `cmake`, `gh`, `codesign`, `productsign`
- GitHub CLI authenticated: `gh auth status`
- Signing identities installed in keychain:
  - `Developer ID Application: <Name> (<TEAM_ID>)`
  - `Developer ID Installer: <Name> (<TEAM_ID>)`

## Required Environment Variables

```bash
export DEVELOPER_ID_APP="Developer ID Application: Orion Letizi (ES3R29MZ5A)"
export DEVELOPER_ID_INSTALLER="Developer ID Installer: Orion Letizi (ES3R29MZ5A)"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_NAME="Orion Letizi (ES3R29MZ5A)"
```

Optional notarization:

```bash
export APPLE_ID="<apple-id-email>"
export APPLE_TEAM_ID="ES3R29MZ5A"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
```

## Discrete Commands

1. Prepare version/commit/tag:
```bash
./packaging/macos/release-prepare.sh --version 0.1.9 --commit --tag
```

2. Build release artifacts (updater + installer):
```bash
./packaging/macos/release-build.sh --version 0.1.9 -- --skip-notarize
```

3. Publish GitHub release with built assets:
```bash
./packaging/macos/release-publish.sh --version 0.1.9
```

## One-Click Command

This runs prepare -> build -> push -> publish:

```bash
./packaging/macos/release-cut.sh --version 0.1.9 -- --skip-notarize
```

## Installer-Only Build

If you only need a `.pkg` installer and no release publication:

```bash
./packaging/macos/build-installer.sh --version 0.1.9 --skip-notarize
```

## Artifacts Produced

- Updater artifacts in `dashboard/dist/`
  - `latest-mac*.yml`
  - `*.zip`
  - `*.blockmap`
  - `*.dmg` (if generated)
- Installer in `build/pkg/`
  - `MidiServer-<version>.pkg`
