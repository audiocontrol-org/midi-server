#!/bin/bash

# Committed release defaults for non-secret configuration.
# Secrets (Apple ID email/password, notarization password) must stay in env vars.

# GitHub repository for release publication (owner/repo)
RELEASE_GH_REPO="audiocontrol-org/midi-server"

# Signing identity defaults
DEVELOPER_ID_APP_DEFAULT="Developer ID Application: Orion Letizi (ES3R29MZ5A)"
DEVELOPER_ID_INSTALLER_DEFAULT="Developer ID Installer: Orion Letizi (ES3R29MZ5A)"

# electron-builder signing defaults
CSC_NAME_DEFAULT="Orion Letizi (ES3R29MZ5A)"
CSC_IDENTITY_AUTO_DISCOVERY_DEFAULT="false"

# Notarization non-secret default
APPLE_TEAM_ID_DEFAULT="ES3R29MZ5A"
