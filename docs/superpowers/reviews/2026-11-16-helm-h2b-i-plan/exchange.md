# Codex review exchange: helm-h2b-i-plan

Subject: `docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 9c6d1e1, effort high, 591 s, 7142994 in / 6943144 cached / 46222 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 A LAN peer seen as peer-reflexive is likely labelled 'internet', the case Decision 1 was added for
rtcRoute labels a remote prflx candidate 'lan' only when its address (or ip) is readable and private. With no address it returns 'internet', and the test pins that. The hidden window sets no WebRTC IP policy, so Chromium's default mDNS obfuscation of host candidates applies. Chromium omits the address of a remote peer-reflexive candidate from getStats, so remote addresses are not exposed. When mDNS resolution fails between two LAN PCs (Windows firewall, blocked multicast), the pair is host/prflx with no address, and the guest's records read 'internet'. The reverse also slips through: a local prflx candidate with a host remote is labelled 'lan' without any address check. · plan L61 (Decision 1: 'Chromium reports a LAN peer as peer-reflexive when its connectivity check beats the candidate signal'), plan L299 (`localAddress(remote.address ?? remote.ip) ? 'lan' : 'internet'`), plan L178 (`rtcRoute(c('host'), c('prflx'))` expected 'internet'); grep of src for webRTCIPHandlingPolicy/mdns finds nothing; spec L432 (LAN checklist step 10: 'B's records read transport: lan'); plan L92-L94 (the room's network picks the 150 vs 250 ms limit, and fallback 3 runs on LAN rooms only) · A mislabelled LAN session fails the owner's LAN checklist step 10, judges the Helm p95 against the 250 ms internet limit instead of 150 ms, and drops the session from fallback check 3. The smoke cannot catch it: on one PC, mDNS resolves and the pair is host/host. · When the remote is prflx with no readable address, decide from the local side: a local host candidate with a private address means the far side reached a private address, so 'lan'. Otherwise return null (unknown) rather than 'internet'. Apply the same address check to a local prflx candidate. Add test cases for prflx without an address and for local prflx.

### [P2] R1-F2 The live targets count every online round in the files, including the LAN and internet checklist runs, not just the §16 sessions
formatReport evaluates the live targets over every room in the records, and Decision 8 says to 'pass only the session files'. Records go into one file per day, and the owner runs the LAN and internet checklists before the §16 sessions on the same PCs and app. A checklist day and a session day can coincide, and the files cannot be split. Checklist rounds (a cable unplugged for 10 s, a forced guest-Helm round, a round ended early to test Leave) would then shift the median length, the outcome counts and the 'both weapons in every round' check. The checklist JSON already lists each session's rooms, but the targets never use it. · plan L88 (Decision 8), plan L1755 (`evaluateTargets(roomRounds(rooms))` over every room), src/main/network/duelRecords.ts:L8-L10 (one file per local date), spec L321-L324 ('both outcomes occur across the sessions'), spec L441 (the checklists, then the §16 sessions) · The demo verdict can come out wrong, either way, because of rounds that were never §16 sessions. Separating the files by hand is error-prone and not always possible. · When a checklist is given, evaluate the live targets and the planet extra over the rounds of the rooms its sessions list, and say so in the report line. Report rooms that no session claims, and any room a session lists that is missing from the records. With no checklist, keep the current behaviour and print a warning.

### [P2] R1-F3 The RTT test cannot tell the median from the latest sample, and silently drops its first sample
rig.attach() pumps twice with no microtask flush, so the attach-time poll is still in flight (polling = true) when the loop's first pump(1000) runs. The 40 ms sample is never taken, and roundRtt is [60, 50]. Nearest-rank gives 50. The intended [40, 60, 50] also gives 50, and 50 is the last sample in both cases. An implementation that recorded the newest RTT, or dropped samples, would still pass. · plan L893-L900 (the samples 40, 60, 50 and the expected 50), plan L1138-L1146 and L1206 (pollLink is called after observe() on every pump), tests/onlineDuelSession.test.ts:L103-L110 (attach pumps twice synchronously), src/renderer/src/net/duelRecord.ts:L55 (nearest-rank) · Decision 3 says rttMs is the median of the round's samples, and that is the risky path the test exists to pin. · `await flush()` once after `r.attach()`, before the sample loop. Use samples whose median differs from the first and last, e.g. [90, 60, 40, 50, 70] (median 60, last 70), and expect 60.

### [P3] R1-F4 groupRooms orders rounds by wall-clock times from two machines before chaining them
The rounds are sorted by `(host ?? guest).startedAtIso` before chaining. A round with only a guest record is placed by the guest PC's clock, and startedAtIso is the time of that machine's previous record, not the round's start. With enough clock skew, a guest-only round sorts before its predecessor and the room splits into `seed-<n>-r<k>`. Rooms are already identified by the seed chain, so the time sort is not needed. · plan L1666-L1671 (sort by startedAtIso, then `follows` on the room's last round only), plan L1647 (`follows`); onlineDuel.ts:L113 (startedAtIso is reset at each record) · A split room shows its later rounds under a key the owner's checklist does not list. The risk is low with NTP-synced clocks. · Sort by round index first (then by startedAtIso), so every round k-1 is placed before round k whichever clock wrote it.

### [P3] R1-F5 The smoke's record copy runs unguarded in `finally`, before the workerd and temp-root cleanup
rmSync, mkdirSync and copyFileSync run in `finally` without a try. If any of them throws, `runtime.dispose()` and the exact temp-root removal are skipped, and the JSON report is never written. · plan L1951-L1960; scripts/network/duel-app-smoke.ts:L152-L161 (existing cleanup steps each catch their own errors) · The smokes promise to clean their exact temporary roots and never leave workerd running. · Wrap the copy loop in try/catch with `failure ??= 'record copy failed'`, keeping its place before the temp-root removal.

### [P3] R1-F6 Fallback check 3 only covers LAN rooms; the plan should say why
Decision 9(3) evaluates the guest-Helm question 1 check only for sessions with a LAN room. Spec §9 says both the LAN and internet checklists schedule a guest-Helm round 'so this can be evaluated', which suggests internet sessions count too. The guest-Helm penalty is also largest on the internet. · plan L94, plan L1744-L1745; spec L357 · The criterion's scope is ambiguous, and the narrower reading is marked '(rec.)' without a stated reason. · Either evaluate it for any session whose rooms share one known network (lan or internet), or state the LAN-only reading as a deviation in Decision 9.

### [P3] R1-F7 A missing currentRoundTripTime is reported as a real 0 ms RTT
The peer's sampler maps a missing or invalid `currentRoundTripTime` to 0, and the controller sends it whenever a route exists. Those 0 ms values go into the round median and the F3 RTT line. · src/network/rtc/peer.ts:L183,L186 (`finite(...)` returns 0); plan L439-L440 · It biases rttMs low in the record and the report's latency table. · Have the peer keep `rtt: number | null` alongside the route, and send `stats` only when the sample had a real RTT.

## Verified
- Task 1: every replace block occurs once in the current source. peer.ts L2-3, L36, L63-65, L186-190; rtcSession.ts L46-48, L73-74; controller.ts L18, L89-90; rtcTransport.ts L6-7, L12-13, L26-27, L57-58, L107-108, L116-117; onlineSession.ts L4-5, L40-42, L63-65, L181-182, L573-574; onlineIpc.ts L1-3, L39-40, L55-57; preload/index.ts L1-4, L53-54.
- Interfaces Task 1 consumes exist with the assumed shapes: rtcRecord/rtcKeys (rtcSession.ts L82-83), already imported in shared/onlineSession.ts L2; OwnedOnlineTransport.controller is a TransportController (onlineSession.ts L22); OnlinePeer.attemptId and peers.ready() (onlinePeers.ts L9, L184); current(c) and clock (onlineSession.ts L50, L66).
- rtcTransport only forwards stats when `entry.generation === value.requestId` (L51-52), so the test's other-generation response is dropped. The controller's stats timer is cancelled through `subscribe` on close (controller.ts L54-63).
- Privacy: the route is computed inside the hidden window (peer.ts sampleStats). The stats response, the IPC answer and the preload all re-validate to exactly {route, rttMs} (`rtcKeys` exact key sets), and the tests reject an extra address field.
- The new IPC channel reuses `trusted()`: no ports, a visible window, the exact sender and main frame (onlineIpc.ts L21-26). It also rejects any argument and is removed with the other handlers.
- The renderer reaches linkStats: main.ts L71 passes `bridge`, and createOnlineBridge spreads `...api` (onlineBridge.ts L20).
- Task 2: every replace block occurs once in onlineDuel.ts, runtime.ts, duelRecord.ts, duelMode.ts, main.ts L63-65, tests/onlineDuelSession.test.ts L86-88, L92-94, L227-228 and tests/duelRuntime.test.ts L12-13, L37-39, L45-47, L312-313.
- The solo accumulator mirrors duelRules.ts L39-43 (a fresh telemetry on rematch, recordTick, then the summary on decision). recordTick only reads the duel state (telemetry.ts L91-129), so Single player's play does not change. DuelState.helmPlayer is 0|1 (state.ts L37). The DUEL_RECORD handler validates the solo record (duelRecords.ts L15-30, index.ts L82-85).
- The F3 module's imports exist: FONT_NATIVE and TEXT in theme (used by interiorView.ts L15), Renderer.assets.fontFamily (renderer.ts L33, assets.ts L14). Nothing else binds F3 in src. The expected overlay strings match latencyFigure's nearest-rank output (duelRecord.ts L52-58).
- Task 3: DEMO_RULE matches Helm spec L320 verbatim once the ** markers are stripped. Outcome is {Running 0, CrewWins 1, EnemyWins 2, Draw 3} (state.ts L73); TICK_HZ is 60; followingSeed, roundSeed and nextValidSeed are exported (seeds.ts L10-26). The room seed comes from the runId (main onlineDuel.ts L27-29), so two rooms merging needs a seed collision. The gates.md replace block is the file's last line (L747). The fixture arithmetic checks out: 8 valid records, 1 invalid line, median 240 s, B's guest-Helm p95 300 > 250.
- evaluateRule reads §16 as the spec says: three sessions with at least 4 of 5 yes, one of them a non-owner pair (spec L321). The weapons, length and both-outcome targets and the planet extra follow spec L322-L326, with the crew-only weapons reading stated in Decision 8.
- Task 4: the smoke's replace blocks occur once (duel-app-smoke.ts L10-13, L113-115, L131-132, L154-155). The driver supports `key` with an Electron keyCode and `screenshot` (online-app-smoke.cjs L202, L205-210). `press`, `delay`, `assert`, `reportPath` and `directory` exist.

## Not verified
- That Chromium in Electron 37 leaves the address of a remote peer-reflexive candidate out of getStats, and how often mDNS resolution fails between two Windows PCs. Both are from my knowledge of Chromium and the mDNS ICE draft; no real two-machine run was possible.
- The per-task test counts (229, 55, 7, and 3,861 for the full suite). I ran no tests, as instructed.
- That the overlay's BitmapText really draws over the duel scene: whether scene.ts later re-adds or reorders stage children. Not read; the smoke's F3 screenshots would show it.
- Whether `npm run typecheck` includes scripts/ and tests/, and whether the report test's tuple casts compile under strict mode.
- That the prototype reproduces byte for byte from master ca06a62, as the role states. I did not diff a worktree.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against `f81d9b1`. 7 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: A LAN peer seen as peer-reflexive is likely labelled 'internet'

Confirmed (no WebRTC IP policy is set, so mDNS applies and a remote prflx has no address in getStats). A prflx candidate on either side is judged by its address; a remote prflx with no readable address is `lan` only when the local candidate is host at a private address, otherwise null (unknown; the schema admits it and the report shows unknown). Decision 1, the gates text and the route tests are updated.

## R1-F2 [P2]: The live targets count every online round in the files

Confirmed. With a checklist, the live targets and the planet extra cover only the rooms its sessions list, the report line says so, and unclaimed and listed-but-missing rooms are reported; without a checklist every room counts and a warning is printed. Decision 8 and two report tests are updated.

## R1-F3 [P2]: The RTT test cannot tell the median from the latest sample

Confirmed. `await flush()` after attach, samples [90, 60, 40, 50, 70], expected 60. Also: two `pump(1000)` steps can land 999.9999999999998 ms apart, under the poll interval, which skipped a sample; the loop steps 1001 ms, with a comment.

## R1-F4 [P3]: groupRooms orders rounds by wall-clock times from two machines

Confirmed. Rounds sort by round index first, then `startedAtIso`; Decision 7 notes it.

## R1-F5 [P3]: The smoke's record copy runs unguarded in finally

Confirmed. Wrapped in try/catch with `failure ??= 'record copy failed'`, before the workerd and temp-root cleanup.

## R1-F6 [P3]: Fallback check 3 only covers LAN rooms

Confirmed. It now covers any session whose rooms share one known network (lan or internet); Decision 9 and its test are updated.

## R1-F7 [P3]: A missing currentRoundTripTime is reported as a real 0 ms RTT

Confirmed against `src/network/rtc/peer.ts`. `linkFigures()` returns `{ route, rttMs: number | null }`; stats are sent only with a route and a real RTT; `diagnostics()` keeps its 0 for existing callers. Interfaces, Decision 2 and the controller test are updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md

<!-- end -->

---

