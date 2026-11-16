# Codex review exchange: mac-1-plans

Subject: `docs/superpowers/plans/2026-11-16-mac-1a-private-build.md docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 9cc058d, effort high, 238 s, 695572 in / 606830 cached / 21578 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 CandidateV2 has nowhere to record native signing, architecture and extracted-archive audit results, and gates A-C are never derived
Mac-1a Task 4 asks auditCandidate to run codesign on the original and extracted bundle, ad-hoc display checks on helpers, lipo/file ARM64 checks on every Mach-O file, a separate spctl assessment and a bundle inventory comparison. The CandidateV2 it returns has no fields for any of these results: signing is only the label 'windows-private'|'adhoc', and there is no inventory digest. Task 6 hands off the candidate 'with required native checks attached' but defines no schema for the attachment. Mac-1b Task 5 says how gates D, E and F are derived but never says where the A, B and C inputs come from or how they are validated. · 1a plan L62-72 (CandidateV2 fields), L119 (native checks), L139 ('required native checks attached'); 1b plan L109 (buildComplete=A, macRuntimeVerified=A+B+C), L114 (only D/E/F derivations); spec L153 and L157 (required observations, recorded separately), spec L61 ('signing state'). · A manifest can claim 'adhoc' with no proof attached. Mac-1b's readiness aggregate then gates every outcome on A-C without a validated evidence contract, so buildComplete or macRuntimeVerified could be set from free-text README rows. That is false evidence. · Add a strict `nativeAudit` object to CandidateV2, with a darwin variant: codesignVerify {original, extracted}, adhocBundles [{path, ok}], machO [{path, arch}], spctl {outcome}, and inventorySha256 plus an extractedInventoryMatch flag. Give win32 its own variant. Have parseCandidateV2 reject a darwin candidate with a missing or failed audit. Define Gate A/B/C evidence schemas in Mac-1b Task 5 (test logs or summaries by hash, the native smoke reports, the Mac-1a manual checklist) and test their derivation.

### [P1] R1-F2 The Windows half of a paired v2 report has no defined independent cleanup proof
Mac-1b requires every CrossPlatformRunV2, including the Windows side, to carry independent cleanup proof from the Mac-1a owner. Mac-1a Task 5 defines CleanupProof through ProcessIdentity {pid, ppid, pgid, start} and ps sampling only. Windows has no pgid, and the plan says Windows 'retains taskkill /PID /T behavior' with no before/after inventory source. · 1a plan L128 (ProcessIdentity requires pgid; Windows keeps taskkill); 1b plan L47 ('independent cleanup proof'), L64 ('Use Mac-1a process-tree owner'); scripts/network/lease-smoke-lifecycle.ts:L29-32 (Windows taskkill, POSIX SIGKILL of the root only). · When the Windows driver runs, the implementer must either invent a proof (false evidence) or the pair validator rejects every Windows report, which blocks gates D and E. · Specify a Windows adapter in Task 5. For example, sample with a bounded PowerShell `Get-CimInstance Win32_Process` query giving ProcessId, ParentProcessId and CreationDate, called through an execFile argument array. Make pgid optional or platform-discriminated, with start = CreationDate, and make CleanupProof a platform-discriminated union. Add fake-table tests for Windows, and have Mac-1b Task 1 validate the per-platform variant.

### [P1] R1-F3 Failing on input overflow with a 512 cap will fail ordinary captures, because every outgoing held frame is recorded
Mac-1b Task 2 keeps the 512-input cap and says to 'count and fail any overflow of ... input records'. The existing observer records every outgoing input-class packet, including the unreliable held frames the client sends on each send() call. Today it only avoids failing by silently shifting the ring. The plan does not say which inputs must be retained. The schema only needs command inputs to match applied results. · 1b plan L20, L63; scripts/network/online-app-observer.ts:L40-46 (every outgoing input pushed; shift when over 512); src/renderer/src/clientControl/clientRun.ts:L190 (a held frame per send); scripts/network/internet-app-report.ts:L18, L43 (inputs max 512; results must match an input that has a command). · A 30-540 s capture of two players moving can easily send more than 512 held frames. The v2 driver would then fail ordinary sessions, or the implementer would quietly bring truncation back. · Define retention explicitly. Retain every command input and the first held input (order evidence) up to the cap, and count all other held frames in totals without retaining them. Fail only if retained command or required boundary records overflow. Test a long held stream that passes and more than 512 commands that fail.

### [P2] R1-F4 No source is defined for the modeId in logical identity
readLogicalIdentity requires a modeId, and pairing compares it. auditCandidate's options and the CLI flags in Task 4 include no mode, and the plan never says which registered mode the packaged online app uses or how that is checked against the compiled output. · 1a plan L48, L81 (readLogicalIdentity(root, revision, modeId, serviceOrigin)), L116 (auditCandidate options lack modeId; CLI adds platform/revision/service-origin/deployment only); src/network/modes/sector.ts:L19 (modeId 'sector'); src/network/modes/registry.ts:L11. · Without a defined source, each side may hard-code or pass its own value, so a mode-identity check means nothing, or the two sides disagree. · Add `modeId` to the auditCandidate options and an explicit `--mode-id` flag, validated against the registered mode definitions (sector today). Alternatively, derive it from the online mode registry in source and state that. Test an unknown mode being rejected.

### [P2] R1-F5 The new formatVersions.ts is not added to the explicit content-digest file list
Task 1 creates src/shared/formatVersions.ts and moves the checkpoint and replay format values into it, imported by the authority code. computeContentDigest hashes a fixed list of src/shared files plus walked directories, and src/shared/formatVersions.ts is not in that list. The plan says 'exclude no game source from digest' but never tells the implementer to add the file. · 1a plan L79-85; build/contentDigest.ts:L12-16 (fixed src/shared list); src/renderer/src/authority/checkpoint.ts:L34, L49 (literal 2 that moves to the constant). · After the change, editing the checkpoint or replay format constant no longer changes the runtime compatibility digest that peers compare. Only the evidence-level fields would still catch it, which weakens gameplay compatibility. · In Task 1, add 'src/shared/formatVersions.ts' to the computeContentDigest paths. Add a test that changing the file changes the digest. Note the digest change in the commit.

### [P2] R1-F6 The rejected-prepareExit test contradicts current onlineExit, and onlineExit.ts is not in Task 3's file list
Task 3 says to race close, quit and a rejected prepareExit and 'assert one prepareExit/dispose chain'. In registerOnlineExit, dispose is chained with .then after prepareExit, so a rejection skips dispose from that path. owner.dispose itself also chains on prepareExit, so it would reject too. Task 3 modifies only index.ts and appMenu.ts, and says registerOnlineExit stays the only exit owner. · 1a plan L103, L105, L107; src/main/network/onlineExit.ts:L12-15; src/main/network/onlineSession.ts:L531-537, L553. · The planned test either fails against code the task may not change, or gets weakened. Either way the failed-save retirement path (Review Focus 3) is left unproven. · State the expected behavior: dispose runs (or helpers are force-retired) even after prepareExit rejects. Either add onlineExit.ts to Task 3 with a `.finally`/catch-then-dispose change and a test, or change the assertion to the existing guarantee (quit still happens; helper retirement comes from the IPC remove path). Then rely on Task 6 native evidence.

### [P2] R1-F7 Detached POSIX groups no longer receive the terminal's Ctrl+C or SIGHUP; the controller has no signal-cleanup contract
Task 5 requires POSIX children to be spawned detached in their own process groups. Detached groups are outside the terminal's foreground group, so an operator's Ctrl+C or a closed terminal kills only the controller and leaves Electron trees orphaned. The Mac-1b Task 4 runner is operator-driven through stdin, which makes interrupting it likely. · 1a plan L128, L131; 1b plan L95, L99; scripts/network/internet-app-smoke.ts:L36 (current non-detached spawn). · This is a new leak path created by the ownership change, on the very machines where the test sessions run, and the stated cleanup guarantee does not cover it. · Have owned-process.ts install SIGINT, SIGTERM and SIGHUP handlers, plus a stdin-close handler, in the controller. These run stop() on every registered tree within the deadline, write the failure report, then exit. Add fake tests and a native probe case that interrupts the controller.

### [P2] R1-F8 Committed evidence references unsanitized candidate manifests by hash
CandidateV2 carries packagePath and os/tools, and Mac-1a allows local absolute paths in private candidate files. Both plans commit evidence. The Mac-1b readiness CLI verifies the hash of every referenced file, including candidate manifests, so a sanitized copy no longer matches, and committing the original leaks the user's absolute home path. · 1a plan L66, L75, L137, L145; 1b plan L47 (run carries the candidate manifest reference/hash), L107 (CLI verifies every referenced file hash); spec L90 (no private user data in the package). · Either the evidence chain breaks or private paths end up in git. · Store packagePath as a path relative to the evidence or output root, or as a sanitized label, and keep absolute paths only in an uncommitted sidecar. Have parseCandidateV2 reject absolute or home-directory paths in committed variants. Test that a manifest containing /Users/ or C:\Users\ is rejected.

### [P2] R1-F9 Several recovery scenarios have no driver mechanism
The stdin command set (baseline, capture, restart-guest, kill-host, stale-probe, finish) has nothing that causes or marks guest-disconnect, quit or close. stale-probe replays 'a previously recorded old-generation control message' without saying which link, message class or recording point, even though fencing tears down the old link. It also leaves unclear whether the recorded bytes could include a ticket or seat token. · 1b plan L71 (scenario list), L95 (commands), L99 (never persist raw secrets); src/shared/roomSession.ts:L23, L58 (auth frames carry ticket and connectionId). · An implementer has to invent the choreography for three gate-F scenarios. The stale probe could be built as an injection outside ordinary paths, or could keep a token-bearing frame. · Add an operator-marked `disconnect` (network drop, then rejoin) and `quit`/`close` markers, or a documented human action plus recorder event, for those scenarios. Specify that stale-probe re-sends only a recorded RTC data-channel input or state packet (never service auth frames) from the old-generation binding to the current host, and that the recorder rejects keys matching the existing sensitive-key regex.

### [P3] R1-F10 The Mac-1a candidate handoff conflicts with Mac-1b's rebuild and exact-source verification
Mac-1a Task 6 says to hand off its CandidateV2 and archive to Mac-1b. sourceFiles covers scripts/**, and Mac-1b modifies scripts, so the Mac-1a candidate cannot pass the ancestor plus exact-source check under the Mac-1b driver. Mac-1b Task 6 correctly freezes and rebuilds. · 1a plan L139; 1b plan L121; scripts/network/candidate-manifest.ts:L24 (sourceFiles includes scripts); scripts/network/internet-app-smoke.ts:L91. · This may mislead an executor into reusing a stale candidate. · Reword 1a L139: the Mac-1a candidate is Mac-1a evidence only, and Mac-1b Task 6 builds new candidates after its tooling merges.

## Verified
- The checkpoint literal sites Task 1 lists exist: src/renderer/src/authority/checkpoint.ts:L34, L49, core.ts:L178, L246, net/contracts.ts:L130.
- The replay 2/3/4 union and its version-specific branches exist at src/renderer/src/authority/replay.ts:L41-68, matching Task 1's preserve-branches instruction.
- The seat and connection identity fields Mac-1b Task 3 relies on exist: src/shared/roomSession.ts:L14 (seatGeneration), L19 (hostGeneration), L21 (SeatSession), L23 (SocketTicket.connectionId), L34 (RoomConnectionIdentity). There is no numeric connectionGeneration, as the plan says.
- onlineIpc calls owner.resume before sending app:resume to the renderer (src/main/network/onlineIpc.ts:L53), so the plan's claim that observing only the renderer resume is too late is correct.
- registerOnlineExit already funnels close and before-quit into one work promise and removes listeners on 'closed' (onlineExit.ts:L6-20). window-all-closed quits (src/main/index.ts:L74), and Menu.setApplicationMenu(null) plus F11 are at index.ts:L53-61.
- v1 candidate-manifest hard-codes resources/app.asar, FTLite.exe, the service origin and version literals (candidate-manifest.ts:L15-28); the v1 report pins electron/protocol/sim/checkpoint/replay literals (internet-app-report.ts:L12). This matches the plan's motivation for opt-in v2.
- The existing internet-app-smoke capture-after range of 30000-540000 and the manual budget of captureAfter+30000 (internet-app-smoke.ts:L26-30) are consistent with the plan's 540 s and 600 s caps.
- The existing tests and runners Tasks 1/3/4/5 extend exist: tests/checkpointV2, replayV3, onlineExit, onlineInput, internetAppManifest, leaseSmokeCleanup, internetAppReport; scripts/network host/rtc/room-service/online-app/online-recovery smokes, online-app-runtime.ts, online-app-smoke.cjs.
- The online-recovery-smoke scenario values skiff/cutter/paused/upload/race/stale exist via --scenario= (online-recovery-smoke.ts:L18, L140-186).
- The instrumentation pattern of single-site exact substitutions failing on mismatch exists (online-recovery-instrument.cjs:L4-7).
- The contentDigest list includes src/shared/roomSession.ts, netSession.ts and others but no formatVersions.ts (build/contentDigest.ts:L12-16).

## Not verified
- Whether electron-builder 26 treats mac.identity '-' as ad-hoc signing when CSC_IDENTITY_AUTO_DISCOVERY=false, or skips signing; the installed builder types and source under node_modules were not read (excluded).
- The exact held-frame send cadence in the renderer input loop, beyond clientRun.ts:L190. The overflow finding assumes held frames are sent often enough to exceed 512 during a capture.
- Whether existing golden or determinism baselines embed contentDigest, which would decide whether Task 1's digest change forces a re-bless.
- Read outside the manifest to confirm findings: src/main/network/onlineSession.ts:L529-553, src/renderer/src/clientControl/clientRun.ts:L170-194, grep of src/network/modes, tests/onlineExit.test.ts and online-recovery-smoke.ts.
- The contents of the retained net-3e deployment evidence, and so whether DeploymentRef serviceTree/configBlob can be established without a redeploy.
- No tests or builds were run (read-only review).

---

# Round 1 response (plans revised)

Verified all ten findings against the plan and source; ten accepted, no rejections or deferrals.

## R1-F1

Confirmed. Added strict NativeAudit and explicit A-C evidence schemas and derivation.

## R1-F2

Confirmed. Defined Windows CreationDate inventory adapter and discriminated cleanup proof.

## R1-F3

Confirmed. Defined retained command/first-held inputs, held totals and overflow tests.

## R1-F4

Confirmed. Explicit sector mode audit option and validation against existing mode.

## R1-F5

Confirmed. Added formatVersions to digest list and mutation/EOL tests.

## R1-F6

Confirmed. Included exit/session files and specified failure-safe retirement with real-owner tests.

## R1-F7

Confirmed. Specified controller interrupt cleanup handlers, deadline and native probes.

## R1-F8

Confirmed. Required sanitized portable manifests before hashing and private root sidecars.

## R1-F9

Confirmed. Defined disconnect/reconnect/quit/close controls and credential-free RTC binding probes with honest limits.

## R1-F10

Confirmed. Classified Mac-1a candidate as stage evidence only; Mac-1b must rebuild.

## Verification

Re-read both plans and their cross-task contracts against the approved spec. Verified existing observer records every held frame then shifts its ring; v2 now counts held traffic and retains only required ordering/command evidence. Verified onlineExit and owner.dispose skip retirement on a rejected preparation; the task now explicitly owns both files and tests the real failure path. Verified contentDigest's fixed shared-file list, sector registry, and current direct-child/native taskkill cleanup. No product code or tests were executed or changed.

The stale probe distinguishes closed-binding local retirement from remote rejection. Missing remote proof is not manufactured or substituted; gate acceptance remains strict. Platform audit results and A-C gate inputs now have explicit schemas. Candidate manifests are portable and sanitized before hashing. Follow-up review should check these contracts, especially native ownership and the recovery driver's evidence mechanics.

## Files changed

- docs/superpowers/plans/2026-11-16-mac-1a-private-build.md
- docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md

<!-- end -->

---

# Round 2 (delta, reviewing d8fb831, effort medium, 62 s, 225937 in / 189203 cached / 5124 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Stale-probe can only hold a guest input envelope, so it cannot probe stale old-host traffic in the Mac-sleep-as-host scenario
The R1-F9 fix narrows the stale probe to keeping one decoded RTC gameplay input envelope in memory. Input is guest-to-host traffic. In the Mac-sleep-as-host scenario the stale party is the old host waking up, and its stale traffic is publications or state sent to the guest. The probe has no allowed message class for that direction. So the spec's 'a new generation must reject traffic from the old one' falls back to the vague 'where observable' ingress observation, and ends up NOT_RUN or a later 'surface the missing test'. · 1b plan L157 (keep at most one decoded RTC gameplay input envelope); 1b plan L159 (host-rehost/sleep: 'where observable'; must add a still-open stale binding case 'or surface the missing test'); spec L143 (Mac sleep as host: a new generation must reject old traffic); spec L147 (current-host rejection of old-generation traffic); R1-F9's original fix allowed 'an input or state packet'. · Gate F needs remote stale rejection for the host-sleep case. As written, the only probe mechanism cannot exercise that direction. Gate F would end up NOT_RUN, or the implementer would invent an untested mechanism during execution. · Let the probe keep, by role, at most one envelope: the guest keeps an input envelope, and the old host keeps one publication/state envelope with its binding identity. Both follow the same secret-exclusion and no-retargeting rules. On wake, the old host attempts to send through its own still-owned binding. The guest's ingress records whether it rejected the packet or the binding was already closed. Add fake tests for both directions.

## Prior findings
- R1-F1: resolved — 1a L70 adds nativeAudit to CandidateV2. 1a L157-159 define strict darwin and win32 NativeAudit variants, require complete Mach-O and helper inventories, state that a label alone cannot pass, and add failure tests. 1b L139-143 define Gate A/B/C evidence schemas and their derivation, and reject caller-supplied booleans.
- R1-F2: resolved — 1a L129 makes ProcessIdentity and CleanupProof platform-discriminated with no pgid on Windows. 1a L163 defines a bounded PowerShell Win32_Process adapter using execFile args, a CreationDate identity check, orphan handling and native probes. 1b L47 and L149 validate each platform's variant and reject fake PGIDs.
- R1-F3: resolved — 1b L61-63 keep every command input plus the first held frame under a combined 512 cap and count other held frames without storing them. Results stay under the existing 128 cap, which matches internet-app-report.ts:L18-19. Tests cover 10,000 held frames passing and 513 commands failing (512 with a held boundary).
- R1-F4: resolved — 1a L117 adds modeId:'sector' to auditCandidate and a --mode-id flag, checked against the registered sector definition. Unknown modes are rejected, and the runtime mode must match the manifest.
- R1-F5: resolved — 1a L80 adds build/contentDigest.ts and its tests to Task 1's files. L86 adds formatVersions.ts to the digest's shared-file list explicitly, with mutation and CRLF/LF tests.
- R1-F6: resolved — 1a L104 adds onlineExit.ts, onlineSession.ts and onlineRecovery tests to Task 3. L109 requires dispose after either prepareExit outcome, with the real owner retiring through stop even when the save fails. This addresses onlineSession.ts:L536 and L553, where a rejected save skips stop and the disposed flag.
- R1-F7: resolved — 1a L165 defines registerControllerCleanup. It handles SIGINT, SIGTERM, SIGHUP and stdin close idempotently under a bounded deadline, adds fake and native interrupt probes, and states honestly that SIGKILL cannot be handled. 1b L161 registers it in the Task 4 runner.
- R1-F8: resolved — 1a L76 and L169 require portable relative paths, keep root mappings in an uncommitted sidecar, hash only after sanitizing, reject /Users/, C:\Users\ and traversal paths, and test relocation. 1b L151 resolves files under the operator-supplied root and never serializes the mapping.
- R1-F9: resolved — 1b L95 adds disconnect-guest, reconnect-guest, quit and close commands. L155 defines their mechanisms and marker ordering. L157-161 define a credential-free, in-memory, one-envelope bound probe that never retargets traffic, and are honest about closed bindings versus remote rejection. One gap remains for the host-sleep direction; it is raised as a new P2.
- R1-F10: resolved — 1a L140 now limits the Mac-1a artifacts to Mac-1a evidence and requires Mac-1b Task 6 to freeze and rebuild.

## Verified
- onlineSession.ts:L531-537 and L553: a rejected graceful save skips stop() and the disposed flag. The Task 3 fix at 1a L109 targets exactly this path.
- internet-app-report.ts:L18-19 caps inputs at 512 and results at 128. online-app-observer.ts:L46 and L49 shift both rings. 1b L63 matches these caps.
- The CandidateV2 shape (1a L62-73) includes nativeAudit. LogicalIdentity.modeId (L48) agrees with auditCandidate modeId:'sector' (L117).
- The spec's stale-traffic requirements (spec L140, L143, L147, L174) were checked against the 1b stale-probe text (L157-159).

## Not verified
- Whether the old RTC binding actually stays open after Mac sleep on real hardware. That decides whether the remote stale-rejection case is reachable at all; it needs a native run.
- Whether Windows PowerShell Get-CimInstance runs fast enough to sample often during teardown. That is a runtime property I did not measure.

---

# Round 2 response (plan revised)

Claude Code Opus confirmed all ten round-1 findings resolved. One new P2 accepted and fixed; no rejected or deferred findings.

## R2-F1: old-host stale traffic

Confirmed. Input envelopes only cover guest-to-host direction; an old host emits state/publication traffic. The plan now allows one role-appropriate envelope in memory, records receiver-side rejection in each direction, and requires tests for both directions and already-closed bindings. No service auth frames, secret persistence, retargeting or generation relabelling is allowed. Closed-binding local retirement remains distinct from remote rejection, and missing required native evidence cannot pass Gate F.

## Verification

Re-read the probe control, event model and recovery gates with the spec's old-generation rejection requirement. Original binding identity and generated-versus-received observations remain required. Product code was neither edited nor executed. This final P2 wording fix was controller-verified; no independent confirmation is claimed for it. Per refine rules, P2-only changes do not prolong the loop. No full confirm pass ran.

## Files changed

- docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md

<!-- end -->

---

