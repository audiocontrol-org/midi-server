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

## Committed Release Config

Non-secret release defaults are committed in:

- `packaging/macos/release.config.sh`

This includes certificate names and repo metadata:

- `DEVELOPER_ID_APP_DEFAULT`
- `DEVELOPER_ID_INSTALLER_DEFAULT`
- `CSC_NAME_DEFAULT`
- `APPLE_TEAM_ID_DEFAULT`
- `RELEASE_GH_REPO`

## Encrypted Local Secret Store (Recommended)

Store notarization secrets locally in:

- `~/.config/audiocontrol.org/midi-server/release.secrets.enc`

Initialize/update encrypted secrets:

```bash
./packaging/macos/release-secrets-init.sh
```

Set one runtime password in your shell:

```bash
export RELEASE_SECRETS_PASSWORD="<your-encryption-password>"
```

Release scripts will decrypt and load:

- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

## Environment Variables (Direct, Optional)

```bash
export APPLE_ID="<apple-id-email>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="ES3R29MZ5A"
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

## CI Release Secrets

The GitHub Actions workflow `.github/workflows/release-macos.yml` requires:

- `MACOS_KEYCHAIN_PASSWORD`
- `MACOS_APP_CERT_P12_BASE64`
- `MACOS_APP_CERT_P12_PASSWORD`
- `MACOS_INSTALLER_CERT_P12_BASE64`
- `MACOS_INSTALLER_CERT_P12_PASSWORD`
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

Optional overrides (otherwise defaults from `release.config.sh` are used):

- `DEVELOPER_ID_APP`
- `DEVELOPER_ID_INSTALLER`
- `CSC_NAME`
