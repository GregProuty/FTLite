# Net-3e release candidate and proposed Task 9 action

This is a local unsigned Windows x64 candidate. **Deployment, live TURN, forced-relay gameplay, two physical devices and actual OS suspend are NOT RUN.** No internet-readiness claim is made. Final hashes and verification are retained under `.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/` and summarized in `task-8-report.md`. The controller owns Task 8 independent review and the subsequent whole-slice review before external authorization.

## Build and package

Root lockfile pins Electron 37.10.3, electron-vite 5.0.0, root Vitest 3.2.7; the manifest records all relevant resolved tool versions. Protocol 2, SIM_VERSION 35, checkpoint 2, and supported replay 2/3/4 are unchanged. Replay 4 is only the previously approved interrupted-control extension.

```powershell
$env:FTLITE_PACKAGED_SERVICE_ORIGIN='https://ftlite-signalling-dev.gprout009.workers.dev'
npm run build
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --publish never '--config.win.signAndEditExecutable=false' '--config.directories.output=dist/net-3e-candidate'
$env:WRANGLER_SEND_METRICS='false'
npm run build:signalling
```

The environment variable above is a nonsecret build origin embedded only in main. Vite env-file loading is disabled, including electron-vite's renderer default override. An unset origin produces disabled packaged online; development loopback/HTTPS variables cannot override packaged configuration, and the strict renderer public contract admits no origin/ICE/credential override. No `.env` is needed. Package only runtime `out`, required production dependencies and notices, excluding env files, tests/source-only dependency content, profiles, scripts and evidence. Audit all packaged runtime bytes against `out` before distributing. Large binaries, ZIPs and Worker bundles remain under ignored `dist`; committed metadata supplies their hashes.

## Exact external action proposed for Task 9

Only after reviews and explicit authorization, reconfirm the intended account/project using the historical owner handoff without exposing credentials. Historical Worker name is **`ftlite-signalling-dev`**, intended origin **`https://ftlite-signalling-dev.gprout009.workers.dev`**. These names have not been reconfirmed online during Task 8. If the authorized target differs, stop and prepare a new origin-bound candidate; do not silently redirect this one.

Deploy the recorded Worker bundle/config with compatibility date `2026-10-23`, binding `ROOMS` to class `Room` and `DIRECTORY` to class `Directory`. Migration `v1` creates both as SQLite Durable Objects; persisted schema version remains 1. Local service tests and Wrangler dry-run validate the configuration. Cloud migration/deployment is unperformed.

Provision or verify only server-side secrets named **`IP_HASH_SALT`**, **`ALLOWED_ORIGINS`**, **`TURN_KEY_ID`**, **`TURN_KEY_API_TOKEN`** using the authorized provider secret mechanism. Never pass values on the app CLI, put tokens in URLs, echo them into chat, include them in the package, or read root `.env`. For Electron, main fetch has no web page Origin and native socket admission retains the existing absent/`null` handling. Explicitly review the deployed allowlist: use `null` for the packaged file-origin case if needed; do not add `*`, unrelated websites or weaken main sender checks. Authorization remains reserved-seat bearer authentication and authenticated connection identity, not Origin alone. Existing Origin/sender checks remain unchanged.

Keep current quotas: 5 creates/IP/minute, 20 joins/IP/minute, 20 socket upgrades/IP/minute; 100 charged active rooms, 1,000 stored rooms, 10,000 HMAC-IP keys. TURN: one charged attempt/minute/reserved seat and 1,000 attempts/UTC day, including failed/uncertain attempts. Credentials last 3,600 seconds. Host lease is 15 seconds; utility maximum grant is 12 seconds, renewal every 5 seconds. No quota, budget, billing or DNS change is included.

After deployment, run ordinary real-app and force-relay local-pair gates against the authorized HTTPS origin, then the [two-machine procedure](../prompts/2026-11-15-net-3e-two-machine-playtest.md). Actual selected relay pairs plus command/state agreement and cleanup are mandatory. A provider 201 or health response cannot mark any gameplay gate PASS. Owner involvement is needed only for account authorization, physically separate hardware/networks and human attestations.

## Rollback

The retained default-disabled Windows archive is the application rollback. Its executable/app.asar/archive hashes are recorded separately from the candidate. Redeploy the recorded Worker bundle/config only if it is the authorized known-good target; before a first live change, record the existing deployed version identifier and its retrievable rollback artifact/hash as additional Task 9 evidence. Task 8 cannot invent a previous cloud deployment or guarantee rollback to an unknown version. Do not delete Durable Object storage or reverse SQLite migrations. If the target has no known-good deployed version, disable candidate distribution and restore the disabled application artifact while the service issue is diagnosed. No automatic rollback, deployment or cloud change has been executed.
