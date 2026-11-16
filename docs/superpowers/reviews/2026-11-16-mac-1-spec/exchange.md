# Codex review exchange: mac-1-spec

Subject: `docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 031b2fa, effort high, 237 s, 459747 in / 397867 cached / 21377 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The shared logical identity is undefined, and raw-byte hashes cannot match between a CRLF Windows checkout and an LF Mac checkout
Spec L61 and L65 put a 'lockfile hash' and 'lockfile/content identity' into the one logical compatibility identity, but never define how they are computed. The existing tooling hashes raw working-tree bytes. The Windows checkout uses CRLF and a Mac checkout will use LF, so the lockfile hash, sourceFiles, workerConfigSha256 and some out/ artifact hashes will differ between the two sides even at the same revision. The existing twoMachineGameplay gate requires both reports' full identity (artifacts, package and worker hashes included) to equal the base identity. · spec L61, L65; package-lock.json has 7252 CRLF lines, and public/THIRD_PARTY_NOTICES.txt and src/main/index.ts are CRLF in the Windows worktree; there is no root .gitattributes and no autocrlf in .git/config, so this comes from global or system git config. candidate-manifest.ts:L24 hashes sourceFiles as raw bytes; L27 identity.artifacts, workerConfigSha256 = hash('services/signalling/wrangler.jsonc'); internet-app-report.ts:L76 same(a.identity,base.identity) && same(b.identity,base.identity); L87 deployment.configSha256 !== base.identity.workerConfigSha256. Only build/contentDigest.ts:L17 normalizes line endings. electron.vite.config.ts:L22 copies public/ verbatim into out/renderer. · Implementers will either fail every honest Windows-Mac pair or quietly weaken the join. The deployed-service check would also reject a Mac-built identity, because the Windows-hashed CRLF config differs from the Mac LF config. · Define the logical identity field by field. Use the revision, git blob or tree ids (e.g. `git rev-parse <rev>:package-lock.json`) or LF-normalized hashes for the lockfile and worker config, the contentDigest, and the protocol/sim/checkpoint/replay values. State that out/ artifact hashes, sourceFiles and package hashes are per-side audited fields. Alternatively, require a committed .gitattributes (eol=lf) and fresh checkouts on both machines, and state that this changes the Windows bytes.

### [P1] R1-F2 No gate proves that the packaged FTLite.app networks with Windows; cross-platform wire evidence comes only from dev Electron
Gates D and E rely on machine reports. The existing machine-report harness launches node_modules Electron with scripts/network/online-app-smoke.cjs against the source out/ tree, not the packaged, ad-hoc-signed FTLite.app. Spec L67 bars the instrumented run from substituting for the packaged check, but Gate C only covers 'online menu' and local usability. No gate requires the packaged Mac app to host or join a Windows peer. Spec L9 promises a native app that either platform can host or join. · spec L9, L67, L75-L77; internet-app-smoke.ts:L50-L54 spawn(electron,[resolve('scripts/network/online-app-smoke.cjs'),...]) with NODE_PATH=node_modules; L63 status requires electron==='37.10.3' via the driver IPC, which a packaged build excludes (spec L67). · Signed-helper, entitlement, asar and utility-process failures that only show up in the packaged bundle would go undetected, and every D/E PASS could still describe an app the owner cannot run. · Split Gates D and E (at minimum D) into (i) an instrumented capture that produces joined wire evidence and (ii) a required packaged-app × packaged-app session in both host directions. Part (ii) is human-attested with a defined checklist: Finder launch, host/join by code, both seats issue commands, pause/resume agreement, Cmd+Q/close, start and end timestamps, screenshots, and the packaged hashes of both artifacts.

### [P1] R1-F3 The ten-minute play requirement conflicts with the existing harness bounds and report schema
Gate D requires at least ten minutes of play in each direction with recorded acknowledgements and matching publications. The single-device harness caps capture at 540 s and the run budget at 600 s. Its schema also caps inputs at 512 and publications at 256 and requires a paused capture. The spec neither changes these bounds nor says the ten minutes is a separate human-timed session. · spec L76; internet-app-smoke.ts:L26-L27 captureAfter ≤ 540000; L30 budgetMs = captureAfter+30000; internet-app-report.ts:L21 budgetMs max 600000; L18 inputs max 512; L20 publications max 256; internet-app-smoke.ts:L100 phase(app,'paused') before capture. · An implementer either can't produce schema-valid evidence for Gate D or changes validator bounds ad hoc. Either way the evidence is not trustworthy. · State that the ten-minute soak is the packaged human session (see the finding above), with start/end timestamps and a final instrumented or checkpoint capture. Otherwise specify the new versioned schema bounds (budget, array windowing, e.g. retain the last N plus counts) for a cross-platform soak report. Do not reuse the v1 limits implicitly.

### [P1] R1-F4 Physical recovery gate F has no evidence contract
Gate F requires validating generation fencing, the recovery rollback boundary and 'no duplicate authority' on physical machines across guest restart, host loss with rehost, and Mac sleep as host and guest. The only two-machine harness takes one paused snapshot at captureAfter. The only recovery validator is the local loopback report. The spec doesn't say which observations prove each property or how the two sides are joined for a rehost, where the host generation changes and the host machine may change. · spec L78, L88; internet-app-smoke.ts:L97-L100, a single capture per run; internet-app-report.ts:L88-L96, where localRecovery accepts only validateOnlineRecoveryReport for a local run; L80-L81 actualOsSuspend needs only a human attestation plus one parseRun identity match. · Two implementers would collect different and possibly insufficient evidence, and Gate F could be marked PASS from screenshots alone. · For each F scenario, list the required observations: pre- and post-hostGeneration; the committed checkpointSequence/capturedTick/payloadSha256 used for rehost; the first post-rehost publication tick relative to capturedTick; the old host's lease-loss/fenced status, with no later publications at the old generation; and seat generation increments for guest rejoin. Say which harness mode records them on each machine and how reports are joined across generations. Label which items are human-attested only.

### [P2] R1-F5 Archive is optional, yet identity and existing tools require an archive hash; Mac bundle identity and symlinks are unspecified
Spec L19 and L92 make the archive optional, while L63 requires hashing 'the final packaged executable and archive after signing'. The existing manifest and harness require packagePath and packageSha256. On Mac, Contents/MacOS/FTLite plus app.asar does not cover the Frameworks and helper bundles that ad-hoc signing modifies, and archivers that dereference framework symlinks break the signature. · spec L19, L63, L92; candidate-manifest.ts:L13-L14 requires --package-path; L27 packageSha256:hash(packagePath); L28 hashes only asar and FTLite.exe; internet-app-smoke.ts:L93 hash(manifest.packagePath)!==identity.packageSha256 fails. · Without a defined Mac package artifact, the audit either cannot run or attests only part of the signed bundle. A broken-symlink archive gives a non-launching app with a valid-looking hash. · Make one Mac package artifact mandatory, e.g. `ditto -c -k --sequesterRsrc --keepParent FTLite.app` or a symlink-preserving `zip -y`. Alternatively define a deterministic whole-bundle tree hash covering file modes and symlink targets. Require `codesign --verify --deep --strict` on the extracted copy.

### [P2] R1-F6 Ad-hoc signing configuration and its observable checks are left to interpretation
Spec L47 says to use electron-builder 26 ad-hoc behavior 'deliberately', with 'the entitlements needed', and to 'validate signatures locally'. It doesn't fix the identity value: explicit '-' versus auto-discovery, which picks any Apple Development certificate in the owner's keychain. It also doesn't fix hardenedRuntime on or off, the entitlement keys, or which commands constitute validation. spctl assessment will reject an ad-hoc app, so an implementer could pick a check that always fails or one that is meaningless. · spec L47, L49; electron-builder.yml:L1-L23 has no mac section; package.json:L20 currently uses -c.win.signAndEditExecutable=false only for Windows. · Different choices produce different runtime behavior (library validation, JIT in helpers) and non-comparable 'signing state' fields in the manifest (spec L61). · Pin mac.identity '-' (or explicitly forbid keychain discovery), state the hardenedRuntime value and the entitlement plist keys, and define the checks: `codesign --verify --deep --strict --verbose=2` passes; `codesign -dv` reports Signature=adhoc for the app and every helper; `lipo -archs`/`file` reports arm64 for every Mach-O under Contents; spctl rejection is expected and recorded, not a failure.

### [P2] R1-F7 The spec cites 'canonical exports' for checkpoint and replay versions that the codebase does not have
Spec L61 requires protocol, sim, checkpoint and replay values 'from their canonical exports'. Only SESSION_PROTOCOL_VERSION and SIM_VERSION are exported. The checkpoint version exists only as a z.literal(2) and a type, and replay versions only as a 2|3|4 union inside core.ts. The spec phrases this as existing interfaces rather than as a requirement to add them. SIM_VERSION is already 37, while the tooling hard-codes 35. · spec L37, L61; src/shared/netSession.ts:L2 SESSION_PROTOCOL_VERSION = 2; src/renderer/src/sim/tuning.ts:L7 SIM_VERSION = 37; src/renderer/src/authority/checkpoint.ts:L34 checkpointVersion: z.literal(2); src/renderer/src/authority/core.ts:L27 replayVersion: 2|3|4; candidate-manifest.ts:L27 sim:35; internet-app-report.ts:L12 z.literal(35). · Without a named source, implementers will re-hard-code literals, which reproduces the staleness the spec is trying to remove. · Require adding exported CHECKPOINT_VERSION and SUPPORTED_REPLAY_VERSIONS constants, with type-level ties to the schema literals. Name the four sources explicitly, and add a test that the manifest values equal them.

### [P2] R1-F8 Mac prerequisites omit the signalling workspace, which the audit and Gate B smokes need
The quickstart lists only root npm ci, build, package, audit and launch, and Gate A says no local Worker is needed. But the candidate audit reads services/signalling/package-lock.json and dist/index.js, and the online-app and recovery smokes required by Gate B start a local workerd runtime. A Mac following the quickstart cannot run the audit or Gate B. · spec L45, L73-L74; candidate-manifest.ts:L25 reads services/signalling/package-lock.json; L27 and L30 hash services/signalling/dist/index.js; online-app-smoke.ts:L170 startOnlineAppRuntime(directory, source.digest, ...); package.json:L21-L23 signalling scripts. · Implementers will either drop worker fields from the Mac audit or discover the dependency during physical testing. · Add `npm --prefix services/signalling ci` and the build step (plus darwin-arm64 workerd availability) to the Mac quickstart and the Gate A/B prerequisites. State that the local Worker is a test-harness dependency, not a runtime dependency of the packaged client. Say whether the Mac manifest's worker hashes must equal the deployed record (see the line-ending finding).

### [P2] R1-F9 The POSIX helper-cleanup check has no observable definition
Spec L39 and Gate B require proof that helper processes are retired on success, failure and timeout, but don't say how helpers are enumerated on macOS. The existing POSIX path SIGKILLs only the direct Electron child. After that, orphaned helpers reparent to launchd, so a post-hoc parent-pid search cannot find them. The app-reported counters in the report come from the main process and are absent after a forced kill. · spec L39, L74; lease-smoke-lifecycle.ts:L29-L31 (POSIX: child.kill('SIGKILL') only); online-app-smoke.ts:L71-L72; internet-app-report.ts:L16 cleanup counters are self-reported by the app. · A Gate B PASS could coexist with leaked GPU, renderer or utility helpers holding ports or the user-data lock. · Require the harness to spawn Electron in its own process group (detached) and stop it with a group signal. It should snapshot the descendant pid set (`ps -o pid,ppid,pgid`) before stopping and assert that none of those pids or the group remain after the deadline. Record the snapshot in the report and cover the success, failure-injection and timeout paths.

## Verified
- Spec L33 is accurate: package.json:L20 and L29 package Windows only; electron-builder.yml:L19-L23 defines only nsis; src/main/index.ts:L53 Menu.setApplicationMenu(null); L56-L61 binds only F11; L41 stores data under app.getPath('userData'); L30 sandbox true.
- onlineExit.ts:L5-L21 routes both window close and before-quit through prepareExit→dispose. Combined with index.ts:L74 (window-all-closed → quit), closing the sole window quits, which matches the spec's Mac lifecycle choice at L53.
- contentDigest.ts:L17 normalizes CRLF/CR to LF before hashing, so the compiled admission digest can agree across platforms at the same revision (spec L37).
- resolveOnlineConfig (onlineConfig.ts:L4-L6) rejects any runtime override when packaged, so the packaged origin is build-time only, as spec L43 states.
- candidate-manifest.ts:L15-L16 and L28 hard-code the service origin, resources/app.asar and FTLite.exe; L27 hard-codes versions including sim:35, matching spec L37's description.
- internet-app-report.ts:L12 pins historical literals; L76 requires identical identities for twoMachineGameplay and both reports forceRelay; L100 derives internetReady from the first four gates. The spec correctly says new cross-platform proof needs a new versioned validation (L65, L82).
- checkAgreement (internet-app-report.ts:L26-L34) already joins on runId, hostGeneration, checkpoint and common publications covering applied commands. That is the join spec L65 asks for, so either platform can host if peers are ordered by role.
- internet-app-smoke.ts:L89-L92 verifies the candidate revision as an ancestor and checks exact source and out/ bytes per machine. A per-machine checkout plus manifest is therefore required, consistent with spec L19 and L26.

## Not verified
- Whether vite/rollup output for out/main and out/renderer JS is byte-identical across CRLF and LF checkouts. Only the verbatim public/ copy is certain to differ; the JS output was not built or inspected.
- The electron-builder 26 defaults for mac.identity auto-discovery, hardenedRuntime and ad-hoc fallback on arm64, and whether hardened runtime plus library validation blocks ad-hoc frameworks under Electron 37. This is vendor behavior I did not check against installed types.
- Whether app observations are ring-buffered below the 512-input and 256-publication schema caps over a ten-minute session. The observation source is outside the reading manifest.
- The behavior of scripts/network/internet-observer-worker.ts and online-app-runtime on darwin, including workerd darwin-arm64 binaries. Outside the manifest.
- The Gatekeeper per-app approval flow on the owner's macOS version (e.g. Sequoia removed Control-click Open), cited at spec L49. Not checked against Apple's current documentation.
- I went beyond the manifest for one finding: I grepped .git/config, package-lock.json, public/THIRD_PARTY_NOTICES.txt and src/main/index.ts for CR characters and globbed for .gitattributes to confirm the CRLF worktree, and I grepped src/ for version exports to check the 'canonical exports' claim.

---

# Round 1 response (spec revised)

Reviewed round-1.json against 031b2fa. All nine findings independently checked and accepted; no rejections or deferrals.

## R1-F1

Confirmed. Defined committed blob logical identities, per-side byte hashes and separate deployed Worker provenance.

## R1-F2

Confirmed. Required packaged-versus-packaged sessions alongside instrumented capture in both host directions.

## R1-F3

Confirmed. Separated ten-minute manual soak from bounded 540-second instrumented capture.

## R1-F4

Confirmed. Defined paired recovery recorder, scenario boundaries, generation/checkpoint/lease observations and manual versus instrumented proof.

## R1-F5

Confirmed. Made symlink-preserving whole-app archive mandatory with extracted inventory/signature verification.

## R1-F6

Confirmed. Pinned private ad-hoc identity, hardened runtime and explicit Electron entitlements and checks.

## R1-F7

Confirmed. Named existing constants and required new shared checkpoint/replay format constants.

## R1-F8

Confirmed. Required signalling workspace install/build and native workerd preflight for local tests.

## R1-F9

Confirmed. Required owned process-group cleanup, tracked descendant identities and independent OS evidence.

## Verification

Re-read the amended identity, packaging, lifecycle, gate and deliverable requirements together. The original optional-archive wording and canonical-export claim were corrected in place; detailed amendments now supply the contracts. No product implementation or runtime test is claimed.

Evidence checked: candidate-manifest raw source/package hashes; internet-app-report same-identity checks and array/budget limits; internet-app-smoke dev Electron launch and capture deadline; lease-smoke-lifecycle direct-child POSIX kill; checkpoint literal(2), replay union and existing SIM_VERSION/SESSION_PROTOCOL_VERSION. The installed electron-builder entitlement template contains the three selected entitlement keys. Native signing and actual Mac behavior remain acceptance tests, not assumptions that have passed here. Historical report validation remains explicitly versioned.

## Also changed

No product code changes. The detailed contracts preserve the user's private-MacBook approach. All physical gates remain pending until real device execution; the spec remains a design draft awaiting approval.

## Files changed

- docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 0eda217, effort medium, 74 s, 99683 in / 66226 cached / 6094 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Mac-sleep-as-host recorder coverage rule makes the scenario unpassable if read literally
The new recorder contract says complete observer coverage must span the fencing and attempted-resume interval, and any gap makes the fencing claim NOT_RUN or FAIL. During real sleep, the observer on the sleeping Mac also stops, so its record always has a gap across the very interval in which lease loss happens. Per-machine monotonic ordering is mandated, but on macOS the common monotonic sources (mach_absolute_time / process.hrtime) do not advance during sleep. The spec does not say which side's observations cover the asleep interval, or how the sleeping machine shows that its coverage resumed before any old-authority publication or command acceptance. · spec L134 (monotonic ordering per machine, UTC only an annotation); L136 ('A complete observer-coverage record spans the fencing and attempted-resume interval; gaps make the fencing claim NOT_RUN or FAIL'); L143 (Mac sleep as host: 'record lease loss or service generation change while asleep, and old authority fencing on wake before it can publish or accept commands'). · Read one way, Mac sleep as host can never PASS. Read another way, an implementer quietly waives coverage. Either way the Gate F sleep evidence is not comparable between implementers. · State that the asleep interval is covered by the Windows peer's recorder and the service snapshots: lease expiry, generation change and rejection of old-generation traffic. The sleeping Mac's coverage obligation starts at its first wake/resume event (powerMonitor resume or an equivalent main-process lifecycle event), and that event must be recorded before any old-authority gate-open, publication or command-application event. Make it a recorded sleep-boundary event pair (suspend seen or last pre-sleep event, then resume) rather than a gap that fails the claim. Add wall-clock or continuous-clock deltas around the boundary as annotations only.

## Prior findings
- R1-F1: resolved — L117 defines the logical identity field by field: commit, committed blob IDs for both lockfiles, LF-normalized contentDigest, mode, protocol/sim/checkpoint/replay, and origin. L119 makes raw sourceFiles, outputs, binaries and archives per-side, and requires CRLF/LF pairing fixtures. L121 separates deployed-Worker provenance from locally rebuilt bundle/config bytes. The docs-commit allowance at L117 matches the existing ancestor check at internet-app-smoke.ts:L88-L89 and the provenance join at internet-app-report.ts:L93-L94.
- R1-F2: resolved — L125-L128 require a Finder-launched packaged-app session in each host direction for both D and E. The checklist covers hashes, timestamps, screenshots, room-code join, both seats acting, pause/resume and graceful exit. It is kept separate from the instrumented dev-Electron capture, and L130 says instrumentation alone never proves packaged networking.
- R1-F3: resolved — L130 keeps the 540 s capture, the 600 s total and the existing array caps (matching internet-app-smoke.ts:L26-L30 and internet-app-report.ts:L18-L21). It assigns the ten-minute soak only to the manual packaged session (L127), and makes overflow a failed capture. Gate D at L76 is updated to match.
- R1-F4: resolved — L134-L149 add a versioned two-machine recorder with bounds and a shared starting tuple: run ID, seat/connection generations, host generation, checkpoint sequence/capturedTick/payload SHA, and a publication. Per-scenario observations cover rehost tick at or after capturedTick under the new generation, old-authority fencing and stale rejection, and OS evidence for killed hosts. Manual and instrumented proof are labelled separately, and actualOsSuspend is declared insufficient. One new P2 about sleep-interval coverage is raised separately.
- R1-F5: resolved — L19 and L92 no longer call the archive optional. L153 mandates a ditto ZIP keeping the parent bundle, with symlinks preserved and the whole-archive SHA as the package identity. The executable and app.asar hashes are retained separately. The extracted copy must pass an inventory comparison (paths, hashes, modes, symlink targets), a signature check and a launch.
- R1-F6: resolved — L155 pins identity '-', disables auto-discovery, and sets notarize false and hardenedRuntime true. It names the three cs.* entitlements for the app and inherited helpers and excludes sandbox/camera/mic. L157 defines the codesign --verify --deep --strict, ad-hoc display and lipo/file ARM64 checks, and records spctl rejection separately.
- R1-F7: resolved — L61 now says 'shared constants (including constants to be introduced below)'. L161 correctly states that SESSION_PROTOCOL_VERSION and SIM_VERSION exist and that CHECKPOINT_VERSION and SUPPORTED_REPLAY_VERSIONS must be added. It ties the schema literals and types to them, requires manifest-equality tests, and keeps historical validators (e.g. sim literal 35 at internet-app-report.ts:L12) unchanged.
- R1-F8: resolved — L163 adds npm --prefix services/signalling ci and the build step, plus a native darwin-arm64 workerd preflight before Gate B. It records local Worker hashes apart from the deployed record, states that these are test-only prerequisites, and makes install failures explicit prerequisite failures.
- R1-F9: resolved — L167-L169 require an owned POSIX process group and PID/PPID/PGID plus start-identity tracking with continuous sampling, so reparented helpers stay attributable. Escalation is bounded and group-scoped. Absence is verified by the deadline even when the root exits first, reused PIDs are guarded against, and inventories are retained. Success, failure, timeout and parent-exits-first cases are covered. This addresses the direct-child-only kill in lease-smoke-lifecycle.ts:L29-L31.

## Verified
- The diff only touches L1 (BOM removed), L19, L61, L63, L76, L92, L110 and the new L113-L169 amendments. L110 states that the amendments supersede less-specific text above, which settles the remaining loose wording at L47 and L65.
- Gate A (L73: 'no need to run a local Worker to play a packaged client') is consistent with L163 (local workerd is a test prerequisite only).
- L117's docs-commit/ancestor allowance matches the existing tooling: internet-app-smoke.ts:L88-L89 (merge-base --is-ancestor plus exact source bytes) and internet-app-report.ts:L85-L94 (runtimeProvenance reportRevision/candidateRevision).
- L130's bounds match the existing v1 limits in internet-app-smoke.ts:L26-L30 and internet-app-report.ts:L18-L21; the existing version literals (sim 35, checkpoint 2, replay 2/3/4) are at internet-app-report.ts:L12.
- The instrumented session still uses dev Electron against out/ (L128), which is compatible with the electron==='37.10.3' status check the existing harness performs. The packaged session is kept strictly separate.
- No amendment conflicts with the fixed decisions: no Developer account, notarize false (L155), the existing architecture is kept, and no wire-protocol fields are added (L117 'evidence-level comparisons, not new wire admission fields').

## Not verified
- Whether the lockfile-resolved electron-builder 26 accepts mac.identity '-' as ad-hoc signing and applies entitlementsInherit to all helper bundles. Checking this means reading node_modules, which this review is not allowed to do; the responder says it checked the entitlement template.
- Whether ditto -c -k --sequesterRsrc output keeps extended attributes needed by codesign after extraction. This needs native macOS execution.
- Whether Electron helpers on macOS ever leave the parent's process group (affects L167's 'descendant leaves the group' path). This needs native observation.
- Whether the existing `git status --porcelain` dirty flag (online-recovery-smoke.ts:L129, rtc-config-smoke.ts:L37) treats untracked non-source files as dirty in a way that conflicts with L117's 'uncommitted candidate source changes are forbidden'. This is outside the touched regions.

---

# Round 2 response (spec revised)

Claude Code Opus confirmed all nine round-1 findings resolved. One new P2 accepted and fixed; no rejected or deferred findings.

## R2-F1: sleep-boundary coverage

Confirmed the textual contradiction: the sleeping recorder cannot continuously report while the operating system suspends its process. The no-gaps rule now explicitly exempts a recorded sleep boundary, requires the awake peer/service to observe the asleep interval, and requires the Mac observer to resume before dispatching any old-authority work. Clock deltas are annotations; identity and causal ordering join the reports. This does not assume or require that a particular monotonic implementation advances across sleep.

## Verification

Re-read the recovery contract, scenario table and new exception together. Required observations remain mandatory: unexplained gaps cannot pass, actual sleep remains operator-attested, and internal fencing requires instrumented evidence. No product code was changed or Mac execution claimed. The one-shot gameplay capture bounds and the separate physical recovery recorder remain distinct.

## Also changed

No other changes. Per refine policy, this nonblocking P2 correction does not require another round. It is controller-verified and is not claimed independently confirmed by Claude. All P1 findings were confirmed resolved by round 2. No separate confirm pass ran.

## Files changed

- docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md

<!-- end -->

---

