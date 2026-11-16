# Net-3e release candidate and proposed Task 9 action

This is a local unsigned Windows x64 candidate. **Deployment, live TURN, forced-relay gameplay, two physical devices and actual OS suspend are NOT RUN.** No internet-readiness claim is made. Final hashes and verification are retained under `.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/` and summarized in `final-fix-report.md`. The whole-slice findings received one combined fix wave and a clean [scoped re-review](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-rereview.md). This candidate is ready for the concrete external-action approval below.

Current candidate manifest/driver source is `65b92a3d29fdf87bc719658cd071395224182546`; use `final-fix-evidence/candidate.json`. This rebuild changes `out/main/index.js` to fence obsolete host-follow continuations. The other 46 runtime files and gameplay digest match the historical candidate. The six recovery gates and actual-app checks are freshly executed against these bytes; historical results are preserved separately. Archive size is 142,823,174 bytes, with 2,253 audited ASAR entries. Both rebuilt ZIPs have exact unique paths and independently verified EXE/ASAR members in `zip-member-audit.json`. The reusable manifest tool's automatic ZIP-member binding remains a deferred minor; preserve this independent check on future packaging. These ignored distribution artifacts have committed hashes:

| Artifact | SHA-256 |
| --- | --- |
| `dist/net-3e-final-candidate.zip` | `882476a79956a4525aab1d15f115722fab940ebcacc48f7869b4c7aa76e0e5d4` |
| Candidate `FTLite.exe` | `6de18f4b10d1e4aec3d904e6c2e049688d43d981dbc164c54bc9e0a7da275277` |
| Candidate `resources/app.asar` | `481400b796b40041774d9aa0eb11cffc90b458bd66d43a348dda8f73dab7dd8d` |
| `dist/net-3e-final-rollback-disabled.zip` | `9af99a9c451c280132c7312b52e81c3a452d9bffd03b5b29783aca1b09ea5962` |
| Prepared Worker `index.js` | `fda351cb27f57961b61616324012f1d33969226b5356d51d8ad2749dc657eb33` |
| Source/deployment `wrangler.jsonc` | `b9faa6b032720827399ddac179f1fe4021f33a6ee9c0a21d5420cac93a3212bc` |

The final audit executes the resolver extracted from each actual packaged main bundle in an isolated VM. It observes disabled default, enabled explicit candidate origin, and rejected ambient development overrides in both packaged configurations. It also checks absence of the release origin in renderer/preload output. This is compiled-package configuration proof, not a claim that the unsigned installed UI was manually playtested.

The intended canonical origin is now part of candidate identity. Every external report and the deployment attestation must match it. Manifest generation and launcher preparation also compare both manifest origin fields and the requested origin with compiled main; changing metadata cannot redirect the driver. Historical recovery reuse requires complete executable-set/hash equality plus explicit report/candidate revision provenance. The original manifests/reports remain unchanged as historical evidence; current admission uses the final-fix metadata/readiness files. The historical main bundle cannot attest to this changed runtime. Unchanged service, simulation and engine evidence retains explicit historical provenance in `unchanged-runtime-provenance.json`.

## Build and package

Root lockfile pins Electron 37.10.3, electron-vite 5.0.0, root Vitest 3.2.7; the manifest records all relevant resolved tool versions. Protocol 2, SIM_VERSION 35, checkpoint 2, and supported replay 2/3/4 are unchanged. Replay 4 is only the previously approved interrupted-control extension.

```powershell
$env:FTLITE_PACKAGED_SERVICE_ORIGIN='https://ftlite-signalling-dev.gprout009.workers.dev'
npm run build
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --publish never '--config.win.signAndEditExecutable=false' '--config.directories.output=dist/net-3e-final-candidate'
$env:WRANGLER_SEND_METRICS='false'
npm run build:signalling
```

The environment variable above is a nonsecret build origin embedded only in main. Vite env-file loading is disabled, including electron-vite's renderer default override. An unset origin produces disabled packaged online; development loopback/HTTPS variables cannot override packaged configuration, and the strict renderer public contract admits no origin/ICE/credential override. No `.env` is needed. Package only runtime `out`, required production dependencies and notices, excluding env files, tests/source-only dependency content, profiles, scripts and evidence. Audit all packaged runtime bytes against `out` before distributing. Large binaries, ZIPs and Worker bundles remain under ignored `dist`; committed metadata supplies their hashes.

## Exact external action proposed for Task 9

Only after reviews and explicit authorization, reconfirm the intended account/project using the historical owner handoff without exposing credentials. Historical Worker name is **`ftlite-signalling-dev`**, intended origin **`https://ftlite-signalling-dev.gprout009.workers.dev`**. These names have not been reconfirmed online during Task 8. If the authorized target differs, stop and prepare a new origin-bound candidate; do not silently redirect this one.

Deploy the recorded Worker bundle/config with compatibility date `2026-10-23`, binding `ROOMS` to class `Room` and `DIRECTORY` to class `Directory`. Migration `v1` creates both as SQLite Durable Objects; persisted schema version remains 1. Local service tests and Wrangler dry-run validate the configuration. Cloud migration/deployment is unperformed.

The retained `dist/net-3e-worker.zip` contains the prepared `index.js` and a byte-identical copy of the source `wrangler.jsonc`. For the exact external deployment, use the pinned Wrangler from `services/signalling`: `node node_modules/wrangler/bin/wrangler.js deploy ../../dist/net-3e-worker/index.js --no-bundle --config ../../dist/net-3e-worker/wrangler.jsonc`. This exact command has been checked with `--dry-run`; removing that flag is the proposed authorized action, not work already performed. Explicit entry selection overrides the config's source entry. `--no-bundle` preserves the prepared Worker bytes.

Readiness also requires a deployed version identifier and operator confirmation that the observed deployment matches the recorded Worker bundle/config hashes and origin. Record those under `deployedService.deployment` with `workerName`, `serviceOrigin`, `versionId`, `bundleSha256`, `configSha256`, and `operatorConfirmedArtifact:true`. Worker hashes and pinned Wrangler/workerd versions are part of the candidate identity. Successful app requests alone cannot establish which server artifact was deployed.

Provision or verify only server-side secrets named **`IP_HASH_SALT`**, **`ALLOWED_ORIGINS`**, **`TURN_KEY_ID`**, **`TURN_KEY_API_TOKEN`** using the authorized provider secret mechanism. Never pass values on the app CLI, put tokens in URLs, echo them into chat, include them in the package, or read root `.env`. For Electron, main fetch has no web page Origin and native socket admission retains the existing absent/`null` handling. Explicitly review the deployed allowlist: use `null` for the packaged file-origin case if needed; do not add `*`, unrelated websites or weaken main sender checks. Authorization remains reserved-seat bearer authentication and authenticated connection identity, not Origin alone. Existing Origin/sender checks remain unchanged.

Keep current quotas: 5 creates/IP/minute, 20 joins/IP/minute, 20 socket upgrades/IP/minute; 100 charged active rooms, 1,000 stored rooms, 10,000 HMAC-IP keys. TURN: one charged attempt/minute/reserved seat and 1,000 attempts/UTC day, including failed/uncertain attempts. Credentials last 3,600 seconds. Host lease is 15 seconds; utility maximum grant is 12 seconds, renewal every 5 seconds. No quota, budget, billing or DNS change is included.

After deployment, run ordinary real-app and force-relay local-pair gates against the authorized HTTPS origin, then the [two-machine procedure](../prompts/2026-11-15-net-3e-two-machine-playtest.md). Actual selected relay pairs plus command/state agreement and cleanup are mandatory. A provider 201 or health response cannot mark any gameplay gate PASS. Owner involvement is needed only for account authorization, physically separate hardware/networks and human attestations.

## Rollback

The retained default-disabled Windows archive is the application rollback. Its executable/app.asar/archive hashes are recorded separately from the candidate. Redeploy the recorded Worker bundle/config only if it is the authorized known-good target; before a first live change, record the existing deployed version identifier and its retrievable rollback artifact/hash as additional Task 9 evidence. Task 8 cannot invent a previous cloud deployment or guarantee rollback to an unknown version. Do not delete Durable Object storage or reverse SQLite migrations. If the target has no known-good deployed version, disable candidate distribution and restore the disabled application artifact while the service issue is diagnosed. No automatic rollback, deployment or cloud change has been executed.
