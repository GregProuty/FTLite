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

# Round 2 (delta, reviewing 28c7a75, effort medium, 83 s, 160981 in / 122727 cached / 7409 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 The hidden-remote-prflx fallback labels internet sessions 'lan' whenever this machine has a private host address
The R1-F1 fix (which follows my round-1 suggestion) labels a remote prflx candidate with no readable address 'lan' whenever the local selected candidate is host at a private address. That inference does not hold. Almost every home or office PC's host candidate is private (192.168.x or 10.x), and a NAT translates it on the way out. So a private local host address says nothing about where the far side is. On the internet path (plan ii adds STUN/TURN through `iceServers`), Chromium reports the remote as peer-reflexive whenever its connectivity check arrives before its srflx candidate is signalled, or when it sits behind a symmetric NAT. It also hides that remote address. The pair is then host(private)/prflx(hidden), and the new rule calls it 'lan'. My round-1 fix traded one wrong label for its mirror image. · plan L61 (Decision 1: 'a local host candidate at a private address means the far side reached a private address, so lan'); plan L315 (`far = ... judged(remote) ?? (local.candidateType === 'host' && localAddress(at(local)) ? 'lan' : null)`); plan L181 (the test pins `rtcRoute(c('host', '192.168.1.5'), c('prflx'))` as 'lan'); src/network/rtc/peer.ts:L31,L195 (the peer takes `iceServers`, empty in plan i's tests at plan L168, filled by plan ii) · An internet session labelled 'lan' fails the internet checklist's transport check. It also judges the Helm's held p95 against the 150 ms LAN limit instead of 250 ms, which can trip H-2c falsely (fallback check 1, plan L94). The one-PC smoke cannot show this, because there the pair is host/host. · Only trust the local-side inference when it is sound. Pass `rtcRoute` whether the attempt was configured with no ICE servers (`servers.length === 0` in peer.ts). With no STUN/TURN, neither side gathers srflx or relay candidates, so a hidden remote prflx means a direct LAN check, and 'lan' is fair. With ICE servers configured, return null (unknown). Reword Decision 1 to match. Update the L181 test, and add a case where a private local host plus a hidden remote prflx with ICE servers configured gives null.

## Prior findings
- R1-F1: still open — A readable prflx address on either side is now judged correctly (plan L310-L316, tests L178-L188), and a hidden remote with no private local host gives null rather than 'internet'. But the new fallback, a private local host means 'lan', mislabels internet sessions whose remote appears as prflx: see the new finding. The fix was the one I suggested in round 1, and it is unsound on the internet path.
- R1-F2: resolved — formatReport (plan L1789-L1801) evaluates the targets over the claimed rooms only, labels the line, and lists unclaimed and missing rooms. With no checklist it prints a warning. The tests at plan L1551-L1554 and L1615-L1617 match the fixture: room A has 3 rounds, A plus B have 4.
- R1-F3: resolved — The test awaits flush() after attach (plan L912). The samples are [90,60,40,50,70] with an expected median of 60 (L916-L921). Each step is 1001 ms, at least LINK_POLL_MS (L1139, L1161), so every sample is polled.
- R1-F4: resolved — The sort is now by round index, then startedAtIso (plan L1696-L1698), so every round k-1 is placed before round k whichever clock wrote it.
- R1-F5: resolved — The copy loop is in try/catch with `failure ??= 'record copy failed'`, before runtime.dispose() and the temp-root removal (plan L1993-L2003).
- R1-F6: resolved — oneNetwork (plan L1775-L1779) judges sessions on one known network. The test (L1586-L1590) covers lan s1, internet s2 (the fixture has room B as internet, L1541), mixed s3 and unknown s4. Decision 9 states the reason.
- R1-F7: resolved — The peer keeps `rtt` as null for a missing or out-of-range currentRoundTripTime (plan L383-L384), and linkFigures returns it (L388). The controller sends stats only with a route and a non-null RTT (L457-L458). The test pins the no-RTT case (L222). diagnostics() still returns 0 for its existing callers.

## Verified
- The rtcRoute truth table matches every new test case at plan L178-L190. localAddress(undefined) returns false (plan L295), so `c('host')` with a hidden prflx remote gives null.
- The controller rig's `set('lan', null)` type-checks: rttMs is declared `number | null` (plan L205), and the default parameter only applies to undefined.
- evaluateFallbacks still covers all rooms for check 1 while the live targets cover only claimed rooms. The CLI test's 'H-2c starts: yes' (plan L1618) follows from room B's 300 ms guest-Helm p95 against the internet limit.
- Task 4 Step 2's expected output now includes the no-checklist warning (plan L2019), consistent with formatReport L1800-L1801.
- The gates text (plan L1879, L1883) matches the revised Decisions 1 and 8.

## Not verified
- Whether Chromium exposes the real address of local host candidates in getStats when mDNS obfuscation is on. If it hides them too, the local-side inference rarely fires. I did not check this against Chromium sources.
- Which candidate type Chromium reports for the selected pair's local candidate behind a NAT (host vs srflx). This decides how often the new finding's mislabel occurs in practice, and I could not check it read-only.

---

# Round 2 response (plan revised)

Reviewed `round-2.json`. 1 new accepted (R2-F1), R1-F1 re-opened and fixed with it; R1-F2 to R1-F7 confirmed resolved.

## R1-F1 [P2] / R2-F1 [P2]: The hidden-remote-prflx fallback labels internet sessions 'lan'

Confirmed: a private local host address says nothing about the far side behind a NAT, and with STUN/TURN configured a NATed internet peer can appear as a hidden-address prflx. `rtcRoute(local, remote, direct = false)` applies the local-side inference only when `direct`, which `src/network/rtc/peer.ts` passes as `iceServers.length === 0` (`iceServers` is in scope in `createRtcPeer`): with no servers neither side can have a server-reflexive or relay path, so a hidden prflx is a direct LAN check. Otherwise the route is null (unknown). Decision 1, the Interfaces line and the route tests are updated (private host + hidden prflx: `lan` when direct, null with servers).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md

<!-- end -->

---

