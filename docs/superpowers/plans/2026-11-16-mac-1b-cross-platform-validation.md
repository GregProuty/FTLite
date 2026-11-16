# Mac-1b: Cross-Platform Network Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce trustworthy Windows–Mac gameplay and recovery evidence for matching private candidates, with both machines taking turns hosting.

**Architecture:** Build a v2 evidence path alongside immutable v1 validation. Join two independently audited candidates through canonical identity and observed run/checkpoint/command state. Keep ordinary packaged sessions, instrumented wire captures and physical recovery observations distinct, then combine their validated results into explicit readiness gates.

**Tech Stack:** Existing TypeScript/Vitest/Electron harness; Zod strict schemas; Mac-1a CandidateV2 and owned-process adapter; existing deployed signalling/ TURN service.

**Spec:** [Approved Mac-1 design](../specs/2026-11-16-mac-1-apple-silicon-design.md), including review amendments.

**Prerequisite:** [Mac-1a plan](2026-11-16-mac-1a-private-build.md) Tasks 1-5 for code dependencies. Mac-1a Task 6 native results are required before final hardware acceptance, but do not block writing/testing this tooling on Windows.

## Global Constraints

- Preserve v1 schemas and historical fixtures byte-for-byte. New candidate/run/recovery/aggregate reports use explicit version 2 and strict validation. Unknown versions fail.
- Native ARM64 Mac and Windows x64 use the same source revision, committed lockfile identities and game compatibility; package/output hashes are independently checked per platform, never equated across platforms.
- No new wire protocol, admission exemption, deployed service change, provider credentials or public distribution.
- One-shot wire captures: at most 540 seconds before capture and 600 seconds total; existing caps of 512 inputs and 256 publications remain. Overflow must be observable and fail proof, not silently discard necessary evidence.
- Physical recovery: each scenario at most 600 seconds, 2 MiB per machine, 1,024 events. Every loss of evidence, unsupported instrumentation source or uncertain cleanup fails the relevant claim.
- Ten-minute packaged soak is a separate manual session; instrumented runs never substitute for packaged-app behavior.
- Actual sleep requires actual hardware and human attestation. Monotonic ordering is per process/machine; cross-machine timestamps do not prove causality.
- All executable modifications for observation live in isolated test output, with original/instrumented hashes. Distributed package must contain none of them.
- No deployment/push or secret access is implied. Follow existing trusted exit/recovery behavior, even when a known deferred defect makes a gate fail.

## Review Focus

1. Mixed or swapped candidate reports: same room label is not proof of same run, generation or package (Tasks 1, 5).
2. Old-generation packets arriving after rehost: delayed delivery is distinguished from generation after fencing; stale input cannot count as applied (Tasks 3, 4).
3. Sleep suspends local clocks and event delivery: awake peer/service evidence bridges only the explicit sleep boundary (Tasks 3, 4).
4. Observer buffers overflow or a code substitution stops matching: reports fail closed rather than silently passing with partial evidence (Tasks 2, 3).
5. Manual reports assert success with no screenshots, hashes or duration: rejected, and unavailable hardware remains NOT_RUN (Tasks 5, 6).

## File structure and order

Create focused modules under scripts/network: `cross-platform-report.ts` (wire schemas/join), `cross-platform-smoke.ts` (v2 driver), `cross-platform-observer.ts` (bounded observations), `physical-recovery-report.ts` (event model/scenario validation), `physical-recovery-recorder.ts` (bounded persistence), `physical-recovery-instrument.cjs` (test-only compiled-code taps), `physical-recovery-smoke.ts` (scenario orchestration), and `mac-readiness.ts` (manual checklist and aggregate).

Keep `internet-app-report.ts` as the v1 authority; extract reusable semantic checks only with tests demonstrating unchanged v1 behavior. Existing online-app and recovery harnesses remain the native regression baseline. Tasks run 1 -> 2 -> 3 -> 4 -> 5 -> 6, with task-local tests and path-limited commits.

### Task 1: Versioned cross-platform gameplay join

**Files:** Create `scripts/network/cross-platform-report.ts`, `tests/crossPlatformReport.test.ts`, `tests/helpers/crossPlatformEvidence.ts`; reuse candidate-identity from Mac-1a. If extracting pure checks, modify `scripts/network/internet-app-report.ts` and run all existing `tests/internetAppReport.test.ts` unchanged.

**Interfaces:** Export `parseCrossPlatformRun(value: unknown): CrossPlatformRunV2` and `validateCrossPlatformPair(a: unknown, b: unknown, options: {topology:'lan'|'internet'; relay:boolean; deployment:DeploymentRef|null}): PairProof`.

`CrossPlatformRunV2` contains version 2, logical identity, candidate package hash/platform/architecture, sanitized machine/network labels, one peer record with existing v1 command/input/publication/checkpoint/selected-route semantics, source/instrumentation artifact hashes, actual runtime versions, elapsed/budget, overflow counters, and independent cleanup proof. Carry a candidate manifest reference/hash; validator loads and verifies referenced artifacts in the CLI before calling the pure join. `PairProof` contains runId, hostGeneration, host/guest platform and package hashes, common checkpoint/publication, applied command IDs for both seats, topology, relay and evidence references. Output is validated structure, not merely boolean true.

- [ ] Add fixture assertions: `expect(validateCrossPlatformPair(win, mac, lan).hostPlatform).toBe('win32')`; reverse roles also succeeds. Mutate revision, lock blob, digest, mode, origin, generation, checkpoint SHA, candidate reference, or command watermark and assert throw. Different platform package hashes must pass when independently bound to their manifests. CRLF/LF candidate fixture from Mac-1a must pair.
- [ ] Run `npx vitest run tests/crossPlatformReport.test.ts tests/internetAppReport.test.ts`; new join unavailable is the expected initial failure.
- [ ] Implement strict bounded parsing and reuse v1 semantic checks without enforcing equality of complete v1 identity. Require one Windows and one Mac machine with different machine labels; order peers by actual host/guest role, not input-array order. A common advancing publication must cover both applied-command watermarks; tick-zero bootstrap alone fails. Normal ICE needs selected connected route plus traffic; relay needs policy relay and selected relay candidates on both sides. Network labels are necessary but insufficient: internet options additionally require recorded physical topology attestation in Task 5.
- [ ] Deployment validation requires same DeploymentRef for both clients, verified retained evidence and live protocol compatibility from the actual service handshake. Compare declared deployment protocol to clients; a successful handshake does not prove deployment bytes, so both evidence sources are mandatory. No Mac locally built Worker hash is substituted. Preserve sensitive-key rejection for tokens, raw SDP, IP/address, credentials and raw errors recursively in shared reports.
- [ ] Run focused tests/typecheck; existing historical fixtures still validate. Commit: `feat: validate paired cross-platform gameplay evidence`.

### Task 2: V2 single-device gameplay driver

**Files:** Create `scripts/network/cross-platform-smoke.ts`, `scripts/network/cross-platform-observer.ts`, `tests/crossPlatformSmoke.test.ts`, `tests/crossPlatformObserver.test.ts`; modify test-only `scripts/network/online-app-smoke.cjs` and observer build entry selection as needed; add `test:cross-platform-runtime` to package.json. Do not change default v1 output.

**Interfaces:** CLI `--candidate-manifest=<v2.json> --role=host|guest --machine-label=<label> --network-label=<label> --service-origin=<origin> --capture-after-ms=<30000..540000> --report-path=<path> [--force-relay]`. `createCrossPlatformObserver(): {observe(event: unknown):void; captureBoundary():void; snapshot():WireObservation}`; WireObservation contains the existing decoded fields plus explicit input/publication/event overflow counts. Existing v1 observer remains separate.

- [ ] Test invalid/mismatched service, candidate tampering, unsupported runtime, missing output, overflow at retained boundary publication 257/input 513, deadline exhaustion and child failure. Verify no harness launches after failed provenance. All observed executable output must match candidate artifacts before instrumentation and record both hash sets afterward. Test that normal and relay flags reach actual native peer configuration, not only report labels.
- [ ] Run `npx vitest run tests/crossPlatformSmoke.test.ts tests/crossPlatformObserver.test.ts` before implementation.
- [ ] Adapt existing internet-app-smoke lifecycle through shared helpers or a v2 entry, preserving v1 CLI behavior. Use source candidate ancestor + exact per-side source/output verification; load independently audited CandidateV2. Launch dev Electron against isolated instrumented output, invoke ordinary Host/Join/Ready/Start/input controls, require paused final capture and correlate with peer later. Capture sooner when sufficient bounded evidence exists; never turn a ten-minute manual soak into this capture. Preserve first ACK/input order even when recording tick-zero bootstrap. Decode streamed publications into the existing bounded image cache and latest publication, counting all messages without retaining every tick. captureBoundary stores the latest publication at bootstrap, command-result checkpoints and the final paused capture; the final shared paused publication proves command watermarks. Count and fail any overflow of retained boundary records or input records. This intentional boundary sampling is distinct from silently evicting required evidence; report both total observed and retained counts. Do not depend on existing observer ring-buffer truncation.
- [ ] Use Mac-1a process-tree owner and absolute cleanup deadline, record sanitized failure category, remove owned temporary directory and keep report even after failed preparation. Run local driver rehearsal on Windows against a local service with explicit rehearsal classification; such reports cannot enter internet gates.
- [ ] Run focused tests/typecheck and one native Windows rehearsal. Commit: `feat: capture bounded per-device cross-platform wire evidence`.

### Task 3: Physical recovery event model and fail-closed instrumentation

**Files:** Create `scripts/network/physical-recovery-report.ts`, `physical-recovery-recorder.ts`, `physical-recovery-instrument.cjs`, `tests/physicalRecoveryReport.test.ts`, `tests/physicalRecoveryRecorder.test.ts`, `tests/physicalRecoveryInstrumentation.test.ts`; read existing `online-recovery-instrument.cjs` as a pattern, not reusable assumptions about current compiled spellings.

**Interfaces:** `Scenario = 'guest-disconnect'|'guest-restart'|'host-rehost'|'mac-guest-sleep'|'mac-host-sleep'|'idle-sleep'|'left-sleep'|'quit'|'close'`. `createRecoveryRecorder(options:{scenario:Scenario; candidate:CandidateV2; machineLabel:string; now:()=>number; epoch:()=>number}): {record(event:RecoveryEvent):void; finish():RecoveryReportV2}`. `validateRecoveryPair(a:unknown,b:unknown):RecoveryProof`. Inject clocks in tests only.

Each event has process incarnation, increasing sequence, local monotonic timestamp, optional UTC annotation, kind and a strict payload. Kinds/payloads:

- service: runId, own seatId/seatGeneration/connectionId, hostSeatId/hostGeneration, room phase; capture only public identifiers.
- checkpoint/restore: runId, hostGeneration, checkpointSequence, capturedTick, payloadSha256; restore additionally records initializedTick.
- publication: runId, hostGeneration, tick, sequence, canonical hash and command watermarks; distinguish generated event from received event.
- command: ID, hostGeneration, stage admitted/applied/rejected and sanitized reason.
- gate: hostGeneration, allowed, reason, publishedCount and appliedCount.
- lifecycle: suspend/resume/last-before-sleep/fence/exit plus phase; resource creation/join attempt counters for idle cases.
- coverage: start/end, last sequence, dropped count and source hash; process-exit includes independently observed OS process identity/proof.

Exact source event fields are mapped from existing service snapshot/seat and authority types, not invented new network fields. Seat generation comes from SeatSession/RoomSnapshot; connectionId comes from SocketTicket/RoomConnectionIdentity. There is no numeric connectionGeneration: record connectionId replacement and the protocol-defined seatGeneration transition separately. If a field is absent at a boundary, retain it from the instrumented join/connect result. Sequence resets only with a new process incarnation and an explicit link to the prior process.

- [ ] Write fixtures for guest restart spanning incarnations, host rehost from a committed tuple, late old-generation delivery versus forbidden post-fence generation, sleeping monotonic clock, missing remote service evidence, resume observation after an application event, unexplained gaps, and a killed host without a fabricated final gate event. Assert count/byte/time overflow fails. Idle/left-sleep report is a distinct no-active-run variant: it records persisted-seat presence as boolean, phase and zero new joins/resources, not a fictitious common checkpoint. Active scenarios require shared run and checkpoint at start.
- [ ] Run the three new test files and observe failures.
- [ ] Implement strict bounded recorder and validators with scenario-specific required events; use causal identity transitions across machines, never compare their monotonic clocks. Recovery scenarios are bounded at 600000 ms/2097152 bytes/1024 events per machine. Mark actual sleep boundary explicitly: awake peer/service observations cover the asleep interval; Mac records resume before dispatching work. Clock deltas are annotations. Require complete wake-to-fence-to-stale-attempt evidence; missing observations cannot pass.
- [ ] Implement test-only exact-match code taps using the existing single-site substitution approach. Instrument current compiled main/authority files to observe service identity, restore initialization, generated publications, permission/application and exit without changing decisions. Hook powerMonitor observation with prependListener before product registration/load; current onlineIpc calls owner.resume before renderer notification, so observing only `app:resume` is too late. Observe helper/utility resume fencing too. Every substitution requires exactly one match; zero/multiple matches fail preparation. Test transformed output parses and preserves the original permission result on allowed/denied branches. Record original and transformed hashes. Do not ship global observer callbacks in product output.
- [ ] Run recorder/validator/instrumentation tests and typecheck. Commit: `feat: define bounded physical recovery evidence`.

### Task 4: Operator-driven physical recovery runner

**Files:** Create `scripts/network/physical-recovery-smoke.ts`, `tests/physicalRecoverySmoke.test.ts`; extend test-only `scripts/network/online-app-smoke.cjs` for recorder commands, preserving existing driver command defaults; add `test:physical-recovery-runtime` script.

**Interfaces:** CLI accepts candidate, machine/network label, role, scenario, report-path and service-origin flags from Task 2; also `--session-label=<label>` (coordination only, never run identity). Stdin commands: `baseline`, `capture`, `restart-guest`, `kill-host`, `stale-probe`, `finish`; reject commands incompatible with scenario/role. Actual sleep is performed by the human, not synthesized. `stale-probe` replays a previously recorded bounded old-generation control message through the ordinary harness-owned link, never sends provider credentials or bypasses service validation.

- [ ] Fake driver tests enforce baseline before disruption, correlated incarnation after restart, deadline not reset by restart, malformed commands rejected, helper death produces retained failure report, and no actualOsSleep claim from injected powerMonitor events. Test that observational counts include idle/no-join and delayed-old-message cases. Test remote reports never pair merely by session-label.
- [ ] Run `npx vitest run tests/physicalRecoverySmoke.test.ts` before implementation.
- [ ] Launch each side with Task 3 taps and Task 5 Mac-1a ownership. Persist bounded recorder events incrementally to owned report storage so restart/kill evidence survives; never persist raw secrets. Keep the controller outside the tested Electron process. During Mac sleep the controller may also sleep: rely on Windows/service evidence and explicit resume ordering. If total real-world scenario exceeds ten minutes, fail even if local monotonic time stood still; use UTC duration plus awake-peer observations for elapsed-budget check, never for authority permission decisions.
- [ ] Implement each scenario's choreography from the spec table. Host loss requires the peer's ordinary explicit rehost UI, exact committed restore tuple, newer generation, and subsequent common state/command; never auto-promote based on renderer state. Kill scenario uses independent OS exit proof. Awake peer records lease loss/current service snapshot while Mac sleeps. Evidence for missing stale rejection/fencing stays incomplete rather than filled from screenshots. Packaged manual sessions are separate Task 6 operations.
- [ ] Run fake tests, typecheck and native local rehearsals of restart, rehost and teardown. Label simulated sleep rehearsal as synthetic and exclude it from physical acceptance. Commit: `feat: orchestrate paired physical recovery captures`.

### Task 5: Manual evidence, deployment provenance and readiness aggregation

**Files:** Create `scripts/network/mac-readiness.ts`, `tests/macReadiness.test.ts`, `docs/testing/mac-evidence-template.json`; read existing deployment evidence under `docs/superpowers/reviews/2026-11-15-net-3e-evidence/` without modifying it.

**Interfaces:** `validateManualSession(value:unknown):ManualSession`; `evaluateMacReadiness(value:unknown):MacReadinessV2`; CLI `--manifest=<collection.json> --output=<report.json>` verifies every referenced file hash before aggregation. ManualSession records scenario/topology/host platform, two candidate hashes, operator labels, start/end UTC, measured play duration, screenshot references from both devices and explicit checklist booleans. Manual duration is operator-attested, not fabricated from a wire capture.

Readiness contains gates A-F with PASS/FAIL/NOT_RUN and evidence references, and separately derived `buildComplete`, `macRuntimeVerified`, `crossPlatformLanVerified`, `crossPlatformInternetVerified`, `physicalRecoveryVerified`. Define dependencies: buildComplete=A; macRuntimeVerified=A+B+C; LAN=A+B+C+D; internet=A+B+C+D+E plus deployment provenance; recovery=A+B+C+F. Do not emit historical internetReady or reinterpret its old semantics.

- [ ] Tests reject a LAN soak below 600000 ms, missing screenshot/checklist/package hash, same physical machine, identical network topology presented as internet, mixed candidate artifacts, wrong deployed evidence hash, raw token/SDP/IP field, path traversal, missing host direction, and synthetic sleep. Missing input produces NOT_RUN, explicit failed evidence produces FAIL; caller-supplied summary booleans must match derived values or be rejected.
- [ ] Run `npx vitest run tests/macReadiness.test.ts` first.
- [ ] Implement strict safe evidence references resolved under declared evidence root. Verify DeploymentRef against retained uploaded artifact hashes and deployment/version identifiers; require new live candidate/service handshake evidence. If historical files cannot establish source tree/config blob, leave provenance NOT_RUN and document the missing proof; do not invent a service redeploy as part of this task. Deployed record may be recorded by the authorized operator using retained deployment materials.
- [ ] Derive D from packaged ten-minute sessions plus valid instrumented LAN pair for each host direction. Derive E from separate-network packaged sessions plus normal and forced-relay instrumented pairs for each direction, with actual topology attestation. Derive F from instrumented scenario set plus ordinary packaged recovery checklist. Idle and after-Leave are no-active-run proofs; all other scenario requirements follow Task 3. Missing physical hardware remains NOT_RUN.
- [ ] Run focused tests and all existing internet report tests; commit: `feat: aggregate honest Mac cross-platform readiness`.

### Task 6: Freeze candidates and execute the Windows–Mac test package

**Files:** Create `docs/testing/windows-mac-playtest.md`; evidence under `docs/superpowers/reviews/<execution-date>-mac-1b-evidence/`. Keep binaries outside Git and include checksums plus download/local filesystem instructions appropriate to the user's machines.

- [ ] Freeze one source commit after implementation merges, build Windows and Mac independently with the same lockfiles and service origin, audit v2 candidates, and record deployment compatibility/provenance. Do not use historical Windows artifacts. Record native architecture, actual OS, tool versions, synchronized baseline clock observation, source/artifact hashes and native Mac-1a results.
- [ ] Write a two-column runbook with exact commands for each side: role/labels, Host/Join/Ready/Start, actions by both seats, pause, capture, leave and peer report exchange. Use a shared nonsensitive session label for coordination; actual validation joins real run/generation/state. Define inventory of six instrumented pairs: LAN Win-host, LAN Mac-host, internet normal each direction, internet forced-relay each direction. Packaged runs: LAN ten-minute each direction; internet complete play session each direction. Include separate checksum verification before opening artifacts.
- [ ] Run root/service tests, typecheck and build on candidate source. Run native Mac host/RTC/app/recovery regression suite and Windows affected native suite, including Cutter automation. Existing golden/version baselines must not be re-blessed merely to make portability tests pass.
- [ ] Execute packaged and instrumented matrix on physical devices. Use a cellular hotspot or another actually independent network for internet tests. Record both devices' roles, topology and selected relay observations without exposing addresses. Run guest reconnect/restart, host loss/rehost in both host directions, Mac sleep as guest/host, idle/after-Leave sleep, Cmd+Q and window close. Record no guaranteed fresh suspend checkpoint claim.
- [ ] Validate each capture then aggregate using Task 5 CLI. Publish a concise local test summary with distinct verified states and exact failures/NOT_RUN. Preserve partial evidence if hardware/network access ends; software work can be complete while D-F remain pending. If a known deferred netcode issue prevents a gate, diagnose within its own change scope rather than weakening the validator.
- [ ] Run `git diff --check`; commit only runbook/sanitized evidence. No deployment, public release, secret copy or push without a separate instruction.

## Self-review and execution handoff

Spec coverage: logical/per-side/deployed identity (1,5); bounded gameplay and packaged proof (2,5,6); recovery and sleep contracts (3,4,5,6); separate gates and truthful partial completion (5,6). Mac-1a owns signing, native UI and process-tree mechanics; this plan consumes those interfaces. Recheck source after concurrent engine work, especially exact-match instrumentation, but do not silently change the evidence contract.

Suggested execution: subagent-driven, one task at a time with review, because package identity, native process ownership and recovery evidence each have independent failure modes. Start with Mac-1a; pause only hardware-dependent checks when no Mac is connected, preserving their NOT_RUN status. Plan creation does not authorize claiming or fabricating those physical results.
