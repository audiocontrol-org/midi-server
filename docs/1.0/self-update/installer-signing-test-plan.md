# Installer Signing Diagnosis Plan

## Goal

Find the root cause of installer-signing hangs in CI and converge on a reliable release path with fast feedback loops.

## Scope

- In scope: `pkgbuild`, `productsign`, cert import/keychain setup, timestamp behavior, final package signature verification.
- Out of scope: app compile errors, updater runtime behavior, notarization policy decisions.

## Success Criteria

1. A sign-only CI loop consistently completes in less than 3 minutes.
2. We can reproduce/avoid the hang by toggling one variable at a time.
3. The production release workflow signs and publishes `MidiServer-<version>.pkg` without hanging.

## Fast Loop Baseline

Use the dedicated workflow:

- `.github/workflows/installer-sign-smoke.yml`

This workflow only:

1. Imports installer cert.
2. Builds a tiny dummy unsigned pkg.
3. Runs `productsign`.
4. Verifies signature via `pkgutil --check-signature`.

Target duration: under 2 minutes.

## Test Matrix (Ordered)

Run each row as an independent workflow dispatch and record outcome.

| Test ID | Workflow | `use_timestamp` | Timeout (s) | Expected Signal |
|---|---|---:|---:|---|
| S1 | Installer Sign Smoke | false | 180 | Baseline signing path without TSA calls |
| S2 | Installer Sign Smoke | true | 180 | Isolate timestamp/TSA dependency |
| S3 | Installer Sign Smoke | true | 60 | Quick-fail if timestamp path stalls |

Interpretation:

- S1 pass + S2 fail/stall => timestamp/TSA path is primary suspect.
- S1 fail => certificate/keychain/sign tool path is unstable independent of app payload.

## Real-Pipeline Isolation Steps

After smoke results are stable, test production packaging in controlled layers:

1. **R1: Package-path probe (no app build)**
   - Use `.github/workflows/installer-package-probe.yml`.
   - Creates a dummy `.app` at the real install path (`/Applications/AudioControl/MidiServer.app`).
   - Runs the same packaging chain shape:
     - `pkgbuild` (component pkg)
     - `productbuild` (unsigned distribution pkg)
     - `productsign` (final signed pkg)
   - This isolates packaging/signing behavior from C++/Electron build time.
2. **R2: Toggle final-pkg timestamp**
   - Run once with timestamp off.
   - Run once with timestamp on.
3. **R3: Notarization gate**
   - If signing is stable, re-enable notarization checks and validate timeout behavior.

## Required Telemetry Per Run

Record these fields for every run:

1. Workflow run URL
2. Commit/tag
3. Test ID (S1/S2/S3/R1/R2/R3)
4. `productsign` mode (timestamp on/off)
5. `productsign` timeout value
6. Last emitted log line before success/failure
7. Total run duration
8. Conclusion (`success`/`failure`/`timeout`)

## Decision Rules

1. If timestamped signing fails in smoke but non-timestamped succeeds, keep production `productsign` timestamp disabled and rely on notarization for release trust.
2. If both smoke modes pass but real pipeline hangs, focus on payload/package construction differences (not cert import/signing infra).
3. If smoke intermittently fails, address keychain/certificate import stability before further release workflow changes.

## Operational Loop

1. Run one test case.
2. Capture telemetry table row.
3. Change only one variable.
4. Re-run.
5. Stop when root cause branch is proven by two consecutive reproducible outcomes.

This prevents long release runs from being used as the primary debugging loop.

## Automated Delta Sweep

Use `.github/workflows/installer-sign-mutation-sweep.yml` to run ordered signing mutations in one job.
It executes baseline-to-release-like cases and reports the first failing case.

## Initial Results (2026-02-17)

Smoke-test matrix executed on `main`:

| Test ID | Result | Notes |
|---|---|---|
| S1 | Pass | `use_timestamp=false`, `productsign_timeout_seconds=180`, run `22113408322` |
| S2 | Pass | `use_timestamp=true`, `productsign_timeout_seconds=180`, run `22113428763` |
| S3 | Pass | `use_timestamp=true`, `productsign_timeout_seconds=60`, run `22113442776` |

Preliminary inference:

- Raw cert import + `productsign` path works reliably in lightweight conditions.
- Remaining failures are likely in packaging-path specifics (payload/package construction flow), not basic signer availability.

Package-path probe results:

| Test ID | Result | Notes |
|---|---|---|
| R1-a | Fail | `sign_target=distribution`, `use_timestamp=false`, `use_component_plist=true`, run `22113629699` |
| R2-a | Fail | `sign_target=distribution`, `use_timestamp=true`, `use_component_plist=true`, run `22113774503` |
| R1-b | Fail | `sign_target=component`, `use_timestamp=false`, `use_component_plist=true`, run `22113925789` |
| R1-c | Fail | `sign_target=component`, `use_timestamp=false`, `use_component_plist=false`, run `22114548298` |

Observed failure boundary:

- `pkgbuild` completes quickly.
- `productbuild` completes quickly.
- `productsign` hangs until probe timeout, even with:
  - timestamp off
  - timestamp on
  - component plist enabled/disabled
  - component-vs-distribution sign target

Current strongest hypothesis:

- The trigger is signing pkgs whose payload includes an `.app` bundle (not signer/certificate import itself).
