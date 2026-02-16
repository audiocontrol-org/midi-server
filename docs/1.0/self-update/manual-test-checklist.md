# Self-Update Manual Test Checklist

## Environment

- macOS 12+ machine
- Dashboard built and installed
- GitHub release artifacts available for production test
- Local dev build output available for dev-mode test

## Production Flow

1. Launch app with update service enabled.
2. Verify `GET /api/update/status` returns current version and `channel=production`.
3. Trigger `POST /api/update/check`.
4. Confirm status transitions to `checking`, then `available` (or `not-available`).
5. If available, trigger `POST /api/update/download`.
6. Confirm status transitions through `downloading` to `downloaded`.
7. Trigger `POST /api/update/install`.
8. Confirm app exits and restarts on the new version.
9. Re-open app and verify new build/version in UI build info.

## Development Flow

1. Open Update Settings and enable dev mode.
2. Set `devBuildPath` to local build directory containing `MidiServer.app`.
3. Save settings and trigger manual check.
4. Confirm status channel is `development`.
5. Update local build to a higher `CFBundleVersion`.
6. Confirm watcher/check reports `available` within ~5 seconds.
7. Trigger download (marks dev build ready).
8. Trigger install.
9. Confirm app relaunches into local build executable.

## Settings Persistence

1. Change `autoCheck`, `autoDownload`, interval, and dev settings.
2. Restart app.
3. Verify `GET /api/update/settings` returns saved values.

## Error Handling

1. Use invalid `devBuildPath`.
2. Trigger check and verify `phase=error` or `not-available` with meaningful message.
3. Disconnect network and trigger production check.
4. Verify API returns error status and UI error banner appears.

## SSE Stream

1. Connect to `GET /api/update/stream`.
2. Trigger check/download/install actions.
3. Verify stream emits status events for each transition.
