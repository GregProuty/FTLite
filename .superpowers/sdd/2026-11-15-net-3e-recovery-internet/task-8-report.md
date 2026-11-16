# Task 8: deployable candidate, internet driver and runbook

Implementation and local verification are complete; independent Task 8 review and controller whole-slice review remain pending. Base `4672d50`, isolated `codex/net-3` worktree. Final candidate source/content pin: **`0e9d024db0189bbf918c9fc76a6276f51f7ef115`**. No deployment or internet-readiness claim. All external report gates are **NOT_RUN**.

Source commits: `9f79e57` (driver/validator/build tooling), `dab118a` (package exclusions, actual hash width, runbooks), `a1066cd` (tick-zero bootstrap admission with advancing gameplay), `f24149d` (unrelated bootstrap/command regressions), `1d613fc` (Worker deployment artifact attestation), `dc0a2a7` (embedded-origin audit and concrete deployment action), `0e9d024` (bind local recovery to candidate runtime hashes). The subsequent evidence commit contains this report, native evidence and metadata only. Controller `progress.md` is untouched by this implementer and remains unstaged.

## Delivered behavior

`validateInternetAppReport(value:unknown):void` validates exact app source/content/package/runtime identity, Worker bundle/config identity and pinned Wrangler/workerd versions. It requires distinct localRecovery, deployedService, forcedRelayGameplay, twoMachineGameplay and actualOsSuspend status/evidence fields. Final internetReady equals the conjunction of the first four PASS results. NOT_RUN/FAIL cannot carry hidden PASS proof. Failures expose only `internet-evidence-invalid`, never arbitrary input/parser exceptions. Nested private credential/address/SDP fields are rejected, including in historical recovery payloads.

PASS depends on actual observations: native selected candidate types, policy and sent/received traffic; initial full receipt/ACK before owned-seat input; applied command IDs matching observed inputs; positive-tick canonical publications matching run/sequence/tick/hash/phase/both watermark arrays; command watermarks in a common advancing publication; matching host generation and committed checkpoint receipt; exact process exit and balanced utility/window/native peer/port/listener cleanup. Tick-zero bootstrap is allowed alongside actual advancing gameplay but cannot supply the agreement. The deployment gate additionally requires a version identifier and explicit operator confirmation that deployed Worker bytes/config/origin match the candidate.

Two-machine admission requires two independent single-device local results, same exact artifact identity, distinct case-insensitive machine/network labels, matching run/generation/checkpoint/publication/commands, and explicit physical-separation/different-networks operator attestation. Labels/attestation are **not cryptographic proof** of physical location. Same-machine local-pair reports cannot be relabelled as two-machine evidence.

The launcher uses the production app entry, existing native input driver, passive port observer, Chromium RTC observer and local helper machinery. `--service-origin`, `--force-relay`, `--report-path`, `--candidate-manifest`, and optional single-device role/operator labels are test-only arguments. Unknown/duplicate flags and credential arguments reject before allocation. No renderer or player-facing relay/origin switch was introduced. Main/renderer sender and service Origin/authentication checks are unchanged. Native force-relay changes only the test wrapper's Chromium constructor configuration. Reports contain selected candidate **types**, not addresses/SDP/candidates or credentials.

Automatic local-pair mode drives ordinary Host/Join/Ready/Start, commands from each player, pause/resume, committed paused agreement, screenshots and shutdown. Single-device mode permits ordinary human input and timed capture on each physical computer. Preparation/build/native/cleanup consume one absolute budget: 90 seconds automatic, bounded operator capture duration plus 30 seconds in single-device mode; negative preparation probes use 20 seconds. Work reserves ten seconds for cleanup. Git/build children are owned and bounded; stop failures cannot skip other children or exact temporary removal. The safe `--local-verification` rehearsal uses actual workerd and cannot combine with force-relay; its HTTP loopback report is rejected by every internet gate.

Shared observer builds were extracted into `online-observer-build.ts`; the existing local runtime worker reuses that helper. `rtc-smoke-native.cjs` adds selected local/remote candidate types and actual policy, leaving ordinary native construction unchanged. Neither observer is packaged.

## RED / GREEN and investigation

Initial `npx vitest run tests/internetAppReport.test.ts`: **22 intended admission assertions failed / 3 passed** against the empty validator. They cover missing selected pair, direct route relabelled relay, handshake-only proof, missing/mismatched command/state, same-machine/network/relabelled pair, missing attestation, incompatible artifacts/generation/checkpoint, hidden failure, missing/unbalanced cleanup, temporary leak, decoder error, input before ACK, summary contradiction, missing evidence reference and raw route address. Implementation passed all 25.

`tests/internetAppSmoke.test.ts` initially failed three launcher cases because the new executable/report did not yet exist. The native observer fixture first had an invalid EventTarget fake; after correcting that fixture, the observed RED was undefined policy instead of relay. Implementation GREEN: **4 tests**, including actual owned Node process timeout and cleanup. No endpoint is contacted by these probes. They share the unchanged 20-second deadline and inspect actual exit, fixed failure, exact temporary absence and separate cleanup failure.

Additional RED/GREEN: retained bounded input history plus hidden credential field (2 failures); actual 8-hex canonical publication hash (1 failure); tick-zero bootstrap alongside positive gameplay (1 failure); deployed-service artifact attestation missing (1 failure). A final different-runtime recovery fixture was observed RED and rejected after cross-checking all required candidate runtime hashes. Final focused report suite: **37 tests PASS**. Two already-correct supplemental rejections explicitly cover a shared tick-zero sample with unrelated later states and command watermarks absent from common advancing state; these are not claimed as new production RED failures.

The initial package audit found Zod dependency tests under node_modules; packaging now excludes dependency source/test directories, scripts and source maps. Rebuilt candidate audit passes. The audit also exposed Windows ASAR path separators and the deliberately unshipped `.gitkeep`; path normalization and only that nonruntime placeholder exclusion were corrected. No runtime file exemption was added.

Two early native rehearsals successfully played and cleaned up but were rejected by overly strict fixture assumptions: the actual hash is 8 hex digits, and bootstrap includes tick zero. Their original failed JSON is retained unchanged. A later successful pre-Worker-identity report is also retained under its original source/schema; it is not relabelled as current admission. Final source-pinned rehearsal below passes the final schema.

The package manifest initially could label a disabled package with the intended origin. A direct negative artifact probe demonstrated exit 0 for that bad admission; after correction the same rollback artifact is rejected with `packaged-origin-invalid`. Final explicit-origin artifact audit passes. This was a real package admission probe, not a synthetic test. The final audit independently executes the actual compiled resolver extracted from both ASARs and validates enabled/disabled/override behavior.

## Verification commands/results

| Command | Result |
| --- | --- |
| `npx vitest run tests/internetAppReport.test.ts` | 37/37 PASS |
| Focused `internetAppSmoke`, `onlineAppRuntime`, `onlineConfig`, `onlineSessionContract` | PASS; initial combined 106/106, later 32/32 relevant driver/runtime subset; current report suite separately 37 |
| `npm test` | Final **2,784 tests /195 files PASS**, 61.86s; earlier 2,779/195 at earlier validator revision retained separately |
| `npm run test:signalling` | **222 tests /14 files PASS**, 24.90s |
| `npm run typecheck`, `npm run typecheck:signalling` | PASS, repeated after final native rehearsal |
| Direct scripts/tests strict tsc | PASS: `npx tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --strict --skipLibCheck --types node --allowSyntheticDefaultImports scripts/network/internet-app-smoke.ts scripts/network/internet-app-report.ts scripts/network/candidate-manifest.ts scripts/network/online-observer-build.ts scripts/network/internet-observer-worker.ts tests/internetAppReport.test.ts tests/internetAppSmoke.test.ts` |
| `npm run build` default and explicit intended origin | PASS; final explicit-origin rebuild matches all 47 candidate runtime artifact hashes |
| Unsigned `electron-builder --win --dir --publish never` with signAndEditExecutable=false | Candidate and final default-disabled rollback PASS |
| `npm run build:signalling` | Wrangler dry-run PASS; Room/Directory SQLite bindings and v1 migration retained |
| Prepared Worker deploy `--no-bundle --dry-run` with explicit entry and retained config | PASS; 110.09 KiB upload /22.80 KiB gzip; no deployment |
| `npm run acceptance` isolated timed run | **28,695.4863ms**, exit0, unchanged 30,000ms target; first successful untimed run is retained locally and not used for timing claim |
| `npx tsx scripts/determinism/run.ts --output-dir=.../task-8-evidence/engines` | Node24.18.0, Electron37.10.3/Chromium138 and Firefox160 each **1,800 canonical samples /404 boundaries PASS**; 18.11/17.95/23.14s |
| `npx tsx .../task-8-evidence/audit.ts` | PASS: source/package hashes, compiled config behavior, rollback equality, every recovery report, actual-app report, loopback-only driver, negative cleanup and final incomplete readiness |
| `git diff --check` | PASS |

Root/service raw test logs remain ignored local files; committed `verification.json` records their hashes/results. Existing optional-art warnings, service fault-injection SQL diagnostics/async event-handler warning, native fixed APP_NATIVE_STDERR categories, electron-builder missing author/description warnings and Git CRLF advisories are disclosed, not called pristine output. Wrangler displayed an update notice; no upgrade occurred. Builder fetched the existing pinned Electron distribution for local packaging only.

Later changes after full source regression coverage were confined to candidate-origin audit tooling/docs and one report-only runtime-artifact cross-check; they were checked with direct tsc and actual candidate/rollback audit. They did not change product, service, gameplay, native lifecycle or serialized state. Existing 30-second acceptance and native timeouts were not relaxed.

## Native retained evidence

All report paths below are under `task-8-evidence/`. Recovery commands use `npx tsx scripts/network/online-recovery-smoke.ts --scenario=NAME --report-path=...`; the six reports pin `f24149dfd7922662f3c0a68ee02153b7229b34eb`, before later report/manifest-only edits. Their stored source/build hashes still match current files, independently checked by audit. Supplementary candidate source hashes cover the extracted observer helper as well.

| Report | Result / elapsed |
| --- | --- |
| recovery-skiff.json | PASS /19,049ms |
| recovery-cutter.json | PASS /21,910ms |
| recovery-paused.json | PASS /19,226ms |
| recovery-upload.json | PASS /19,347ms |
| recovery-race.json | PASS /31,706ms |
| recovery-stale.json | PASS /42,851ms |
| online-app.json | PASS /51,387ms; Skiff/Cutter, native input, ACK, bot takeover, process restart, paused rejoin, original cancellation/Leave checks |
| native-config.json | PASS; actual all/relay native configuration only, no gathering or relay route |
| internet-driver-loopback.json | **PASS /13,645ms**, final candidate source `0e9d024`; both actual peers, selected host/host route, commands/state/checkpoint agreement and complete cleanup. Explicitly **rejected as internet evidence** |
| recovery-unresponsive-cleanup.json | Expected exit1 /13,117ms under20,000; both real apps unresponsive, exact forced app/utility exits, helper/workerd exits and temp removal observed |
| internet-preparation-read-failure.json | Expected exit1 /36ms; original fixed preparation failure, owned Git exit, exact temp removed |
| internet-preparation-timeout.json | Expected exit1 /10,103ms; actual owned child stopped at work cutoff, reserve retained, exact temp removed |
| internet-cleanup-stop-failure.json | Expected exit1 /35ms; preserves preparation-failed plus cleanupFailed:true after injected rejected stop; actual owned child exited and directory removed |

No historical Leave/cancellation flake recurred in these final gates; its historical cause remains unconfirmed. Every normal recovery/app gate validates its own graceful/forced resource accounting. Unresponsive negative apps have no graceful resource snapshot; proof is observed process-tree termination, not invented individual close events. The negative internet probe has no native allocation and is not claimed as a native timeout test.

## Candidate and rollback

See [release record](../../../docs/superpowers/reviews/2026-11-15-net-3e-release-candidate.md) and [two-machine procedure](../../../docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md). `candidate.json` records 264 source hashes, 47 runtime hashes, 2,253 ASAR entries, exact executable/ASAR/archive hashes and all resolved versions. `rollback.json`, `worker-artifact.json`, `audit.json`, `readiness.json` and report/image hashes are committed. Large binaries remain ignored under dist.

| Artifact | SHA-256 |
| --- | --- |
| Candidate ZIP (142,824,997 bytes) | `557c8dc18ef4225f4f8e538422d9df1067ca74230504a4f70da7b378e98dd202` |
| Candidate EXE | `7d3402a21c49ac3201ea899d80d161a2ee1eaaea9f143f57270c58c65228ca08` |
| Candidate ASAR | `4623e37d2d6b44748a450238ab03ceff3197f0216bcc7686e4f7221e26e31e47` |
| Disabled rollback ZIP | `51b0e93e51eb3da0b0f8c1dd41d9df86036caea4497a3cd8bfd09720ae4906d5` |
| Disabled rollback EXE | `c519b5177c0d46fa74078c8832b68b101e7530253f417bc2b61432a29c796fcb` |
| Disabled rollback ASAR | `9679bdd5c6ed6270b29f04a66b8c69d88b28087b0114d126b61f2fd92e6a6e04` |
| Worker bundle | `fda351cb27f57961b61616324012f1d33969226b5356d51d8ad2749dc657eb33` |
| Worker config | `b9faa6b032720827399ddac179f1fe4021f33a6ee9c0a21d5420cac93a3212bc` |

Resolved versions: Node24.18.0; Electron37.10.3; electron-builder26.18.0; electron-vite5.0.0; Vite7.3.8; root Vitest3.2.7; TypeScript5.8.3; tsx4.23.15; Pixi8.19.0; Zod3.25.76; bitecs0.4.0. Service Wrangler4.156.0, workerd1.20261023.1, Miniflare5.20261023.3-beta, Workers types5.20261029.1, Workers Vitest plugin1.4.11, service Vitest4.1.12. Locks were not changed. Protocol2, SIM35, checkpoint2 and supported replay2/3/4 remain unchanged.

The rollback's packaged origin is empty, compiled resolver execution returns disabled, and development overrides reject. Candidate's explicit intended origin enables HTTPS in compiled main only; both packages match on all other 46 runtime artifacts. The package audit excludes env/secrets/test profiles/scripts/unnecessary evidence and dependency tests. This is exact artifact/config proof, not a manual installed-binary gameplay claim.

An ignored `dist/net-3e-driver-source.zip` supplies the exact 264 audited source files as an overlay for the named Git revision, avoiding cross-machine Windows line-ending changes failing raw source-byte checks. Every ZIP entry was independently hashed against the candidate manifest. Its SHA-256 is `3024394c416601514070e0edefff55d80d97b563fd3d5310ffc341086e1cd098`; metadata is in `driver-source-artifact.json`. The player package contains no driver/source overlay.

## External limits and next action

`readiness.json`: localRecovery PASS; deployedService, forcedRelayGameplay, twoMachineGameplay, actualOsSuspend **NOT_RUN**; internetReady false. No live HTTPS game/service endpoint, provider/TURN, Cloudflare/account query, secret lookup/root.env, deploy, billing/DNS/quota change, upgrade, merge, push, owner checkout or unrelated cleanup occurred.

The exact proposed Task9 action is in the release record: reconfirm historical Worker `ftlite-signalling-dev` and `https://ftlite-signalling-dev.gprout009.workers.dev`; provision/verify only named server secrets IP_HASH_SALT, ALLOWED_ORIGINS, TURN_KEY_ID, TURN_KEY_API_TOKEN; deploy the prepared exact Worker artifact/config with existing Room/Directory SQLite v1 migration and unchanged quotas; then run real HTTPS/forced relay and the operator two-network procedure. Any deployed previous-version rollback artifact is unknown until authorized account inspection; no fictitious cloud rollback is claimed.

The runbook names supported CLI controls and separately identifies operator network shaping for50/150/300ms injected RTT, jitter/loss and5s stalls. It distinguishes injected impairment from measured native network loss/RTT. Hour-long credential expiry/refresh and hardware OS sleep are separate operator evidence, not inferred from the short driver. Owner hardware/network input is needed only at that external stage. Controller reviews and combined-fix/re-review precede asking for external authorization.

## Task 8 review fix round 1

Fix base **`80dfded`**. Source/test fix **`b125547cacb5f4c43b651931f5e6503d10e72694`** addresses both Important findings in [task-8-review.md](task-8-review.md). Scoped re-review remains pending; this is not a reviewer approval. The original review and evidence are preserved. Controller progress and final-review brief are not staged by this implementer.

**R1 — “Recovery evidence can belong to different runtime code.”** Admission now extracts and compares the complete executable output map, including all main/preload/renderer JavaScript/chunks/HTML and supported cjs/mjs/wasm/native-module output. Both key-set and hash equality are required, so missing, extra and changed executable entries reject in either direction. The current candidate has **22 executable files**, including hostProcess, transportWindow and the hashed renderer bundles, among47 total runtime assets. Minimum entry requirements also include hostProcess, transportWindow and networkTransport.html.

Historical recovery revisions require `localRecovery.runtimeProvenance` containing the exact report revision, candidate revision and complete executable hash map. Each field is checked against the underlying report and candidate; neither a summary boolean nor a six-file subset is sufficient. Map field ordering is not treated as byte inequality. Current-revision reports may omit the historical record but must still match every executable byte.

RED: after isolating the candidate mutations from unrelated external-identity comparisons by setting external gates NOT_RUN, **8 admission tests failed**: changed hostProcess, transportWindow and renderer bundle; missing and extra executable entries on each side; and absent historical provenance. The implementation brought all45 then-current report tests GREEN. Later supplemental controls reject altered provenance revisions/hashes and verify same-revision and reordered-map handling.

**R2 — “The final report can combine different service origins into internetReady.”** `identity.serviceOrigin` is now required and must be the canonical explicit HTTPS origin, without alternate case/default-port/trailing-slash representations. Every external run (deployed, forced relay, both physical-device reports and actual OS suspend) must match its own identity; exact identity equality binds each to the candidate. Deployment attestation additionally matches candidate identity directly. The local-only verifier still permits a labelled loopback service, and that result remains inadmissible as internet evidence.

The shared manifest guard compares requested origin, manifest top-level origin, identity origin and the unique compiled-main origin. The metadata generator uses it before emitting identity. The launcher uses it inside protected preparation, before ancestry/build/native work; changing both manifest origin labels is also rejected when compiled main still embeds the intended origin. The existing fixed preparation failure and cleanup behavior are retained. No production Origin, sender or authentication check changed.

RED: **5 report assertions failed** for each of the four external gates using a different valid HTTPS origin and the missing identity origin. The new manifest guard's stub produced **11 intended failing rejection assertions**. The real launcher test observed two preparation children where the required early rejection permits only its initial Git child; after wiring the guard it observes exactly one exited preparation child, no native allocation and exact temporary removal. This proves the mismatch is rejected before downstream work, not only by a later unrelated missing-file check.

### Covering commands and actual output

At source `b125547`:

```text
npx vitest run tests/internetAppReport.test.ts tests/internetAppManifest.test.ts tests/internetAppSmoke.test.ts tests/onlineRecoveryReport.test.ts
Test Files 4 passed (4)
Tests 120 passed (120)
Duration 11.78s
```

Per-file totals: report58, manifest12, launcher5, existing recovery validator45. Complete retained output: [fix-1/focused-green.txt](task-8-evidence/fix-1/focused-green.txt). Earlier final precommit run was also120/120 in11.77s; it is not counted as additional coverage.

```text
npx tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --strict --skipLibCheck --types node --allowSyntheticDefaultImports scripts/network/internet-app-smoke.ts scripts/network/internet-app-report.ts scripts/network/internet-app-manifest.ts scripts/network/candidate-manifest.ts tests/internetAppReport.test.ts tests/internetAppManifest.test.ts tests/internetAppSmoke.test.ts
exit 0
npm run typecheck
exit 0
```

Typecheck output/status: [root-typecheck.txt](task-8-evidence/fix-1/root-typecheck.txt), [verification.json](task-8-evidence/fix-1/verification.json). `git diff --check` PASS. Root/service regression suites, build, acceptance, engines and native gameplay gates were **not rerun**: no product, service, runtime bundle, transport lifecycle or simulation code changed.

### Metadata and historical byte-equality provenance

Current metadata is [fix-1/candidate.json](task-8-evidence/fix-1/candidate.json), pinned to `b125547`; original metadata remains unchanged. The reusable candidate tool was rerun against the existing candidate ZIP/unpacked package and confirmed all47 runtime hashes, canonical compiled origin and265 current source hashes. No runtime package was rebuilt or relabelled as a new native execution. The application archive/EXE/ASAR hashes remain exactly those recorded above.

`npx tsx .superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/fix-1/audit.ts` prints:

```text
Review-fix audit PASS: 22 executable hashes equal across candidate/historical reports; canonical compiled origin; two early-rejection cleanup probes; no native rerun.
```

[fix-1/audit.json](task-8-evidence/fix-1/audit.json) records all22 executable hashes for each of the six original recovery reports, their exact file SHA-256 and original `f24149d` revision, and current candidate `b125547`. New [fix-1/readiness.json](task-8-evidence/fix-1/readiness.json) references the unchanged Skiff report with explicit checked runtime provenance; localRecovery remains PASS and every external field remains NOT_RUN.

The existing native internet-driver result remains at its actual observed source `0e9d024`. The audit validates it only through a documented in-memory schema adapter adding `identity.serviceOrigin` from its original hashed manifest. It does not replace the report's source, fields or file bytes and explicitly records `nativeRerun:false`; the adapted loopback view is still rejected as internet evidence. This is compatibility revalidation of retained observations, not a new driver run.

Two standalone safe launcher probes use `--service-origin=https://other.example` with either mismatched manifest/identity origins or both labels changed while the compiled origin remains unchanged. Each exits1 with preparation-failed, one owned Git child exited, zero native allocations and exact temporary removal. Inputs/results are retained as `fix-1/manifest-origin-{mismatch,relabelled}{-input,}.json`; no endpoint is contacted. The audit independently checks their resource evidence.

Regenerated ignored operator overlay: `dist/net-3e-driver-source-fix-1.zip`, SHA-256 **`9fb5c24603dcdec0692c5d97dbaf67ed11d96b80b8049a3e67e11234d130bf81`**. All265 archive entries were independently read and hashed against the new candidate manifest; [driver-source-artifact.json](task-8-evidence/fix-1/driver-source-artifact.json) records that check. The runbook/release record point to the new source/manifest/overlay while retaining the unchanged player package.

The review's Minor archive-member check in the reusable candidate tool remains deferred to the controller's final review, as requested. The existing player archive was independently matched during review and has not changed. Previously disclosed diagnostic noise is likewise retained, not recast as pristine output. No account, endpoint, provider, deployment, secret/root.env, quota, billing/DNS, upgrade, merge/push or owner-worktree operation occurred in this fix.
