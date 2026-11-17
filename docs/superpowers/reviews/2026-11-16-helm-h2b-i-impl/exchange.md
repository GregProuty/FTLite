# Codex review exchange: helm-h2b-i-impl

Subject: `docs/gates.md scripts/duel-playtest-model.ts scripts/duel-playtest-report.ts scripts/network/duel-app-smoke.ts src/main/network/onlineIpc.ts src/main/network/onlineSession.ts src/main/network/rtcTransport.ts src/network/rtc/peer.ts src/network/rtc/route.ts src/network/transport/controller.ts src/preload/index.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/main.ts src/renderer/src/net/duelRecord.ts src/renderer/src/render/duel/latencyOverlay.ts src/shared/onlineSession.ts src/shared/rtcSession.ts tests/duelPlaytestReport.test.ts tests/duelRuntime.test.ts tests/latencyOverlay.test.ts tests/linkStats.test.ts tests/onlineDuelSession.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 8614b0e, effort high, 296 s, 2182960 in / 2063607 cached / 25092 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 The session owner's linkStats (5 s age, ready-attempt filter, transport guard) has no test
The main-process half of Decision 2 is never exercised. That half is the onStats subscription in setupPeers (guarded by `c.transport === transport`) and `linkStats()`, which returns null when the figure is older than LINK_STATS_MAX_AGE_MS or when its attempt is not among `c.peers.ready()`. The IPC test uses a fake owner whose linkStats returns a fixed object, and LINK_STATS_MAX_AGE_MS and `onStats` appear in no other test. · src/main/network/onlineSession.ts:L547 (diff L547) and L579-583 (diff L569-573); tests/linkStats.test.ts L1923-1938 use a fake `OnlineSessionOwner` with `linkStats: () => stats`; Grep over tests/ for LINK_STATS_MAX_AGE_MS, `linkStats()` and `onStats` finds only tests/linkStats.test.ts:103 (the rtcTransport test). Plan Decision 2 (plan L65): "drops figures older than 5 s". · Several regressions would pass the whole suite: dropping the age check (an old RTT keeps feeding records after a link goes quiet), dropping the ready-attempt check (a replaced attempt's label is reported), or keeping figures from a retired transport. The duel smoke covers only the happy path. · Add a test with a fake platform/controller in the existing onlineSession test rig. Emit onStats for a ready attempt and assert linkStats() returns `{route, rttMs}`. Advance the clock by 5001 ms and assert null. Emit for an attemptId not in `peers.ready()` and assert null. After the transport is replaced, assert the old controller's stats are ignored.

### [P2] R1-F2 The duel smoke recursively deletes `<report dir>/records`, a path taken from the CLI argument
In the finally block the smoke runs `rmSync(join(resolve(reportPath, '..'), 'records'), { recursive: true, force: true })`. `reportPath` comes from `--report-path=` with no check that it lies under `out/`. This breaks the plan's Global Constraint that the smokes clean only their own exact temporary roots. · scripts/network/duel-app-smoke.ts:L31 (`resolve(process.argv.find(a => a.startsWith('--report-path='))...)`), L167-168 (diff L388-389). Plan L42: "Evidence goes under the git-ignored `out/`; the smokes clean only their own exact temporary roots". The temporary-root cleanup at diff L398-400 is guarded by a prefix check; this delete is not. · Something like `--report-path=reports/h2b.json` would silently wipe an unrelated `reports/records/` folder. The repo's rules forbid discarding working-tree content, and other sessions share the main checkout. · Before deleting, refuse unless `resolve(reportPath,'..')` is inside `resolve('out') + sep`, as the temporary-root guard does. Alternatively, skip the recursive delete and overwrite only the exact `records/{host,guest}/duel-*.jsonl` files, removing stale ones by exact name.

### [P3] R1-F3 A stale route/RTT in the peer defeats main's 5 s freshness check (minor a)
The peer updates `route`/`rtt` only inside `if(pair)`. A later sample with no selected pair, or a getStats that throws, keeps the old values. The hidden window's once-a-second `report` keeps re-sending them, so main's `atMs` stays fresh and LINK_STATS_MAX_AGE_MS never trips. That age check exists for exactly this case: a link that has gone quiet. · src/network/rtc/peer.ts diff L762-769 (assignment only inside `if(pair)`; `catch{}` keeps values); src/network/transport/controller.ts:L94-98 (re-sends whatever linkFigures returns every STATS_MS); src/main/network/onlineSession.ts:L547 (`atMs: clock.nowMs()` on each arrival). · Usually ICE failure closes the attempt, which stops the reports. While the attempt lingers (ICE disconnected but not failed), though, the record's round-median RTT and the overlay keep repeating a figure that is no longer measured. · At the start of each sample in sampleStats, set `route = null; rtt = null`, and assign them only when a pair is found. The controller then stops sending and main's 5 s cut-off applies.

### [P3] R1-F4 The F3 overlay keeps showing the last RTT after main stops reporting one (minor c)
pollLink returns early on a null answer, so `rttMs` (used only by the overlay) keeps its last value forever. Decision 4 persists the label only. Separately, `frame()` returns before the overlay draw when `scene`, `source` or `state()` is null, which freezes the overlay rather than hiding it. · src/renderer/src/app/duel/onlineDuel.ts:L87-89 (diff L1084-1087: `if (disposed || !s) return; route = s.route; rttMs = s.rttMs`), L1183-1186 (overlay drawn with `rttMs`); L1176-1178 early returns. Plan Decision 4 (plan L70) covers the label, not the live RTT. · After CONNECTION LOST or a link replacement, the overlay still shows a confident `RTT n MS`, which is misleading in a latency-debugging view. The frozen-overlay path is rare in practice, because `state()` falls back to `frozen`. · In the poll callback, set `rttMs = null` when `s` is null (keep `route` per Decision 4). Optionally call `overlay?.draw(null)` on the early-return paths of `frame()`.

### [P3] R1-F5 A replayed round-0 seed merges two rooms' rounds and silently drops records (minor e)
The problem is wider than the two rooms sharing a key. `roundKey` is `round:seed:baseTick`, so two rooms started from the same seed collapse into one RoomRound per round. The second room's host and guest records are discarded as duplicates ("keep the first"), and the latency table and record counts lose them with no warning. Later rounds collide too, because they chain by `followingSeed`. · scripts/duel-playtest-model.ts:L115 (roundKey), L130-133 (first record per role kept), L142 (key `seed-<n>`); L209 `rooms.find((r) => r.key === row.room)` would also pick the first of two same-key rooms. · This only happens with FTLITE_DUEL_TEST_SEED (unpackaged builds), for example when two smoke runs' records are merged into one report. Real rooms take their seed from the runId, so the owner's §16 sessions are not affected. · Count records dropped as duplicates (same key and role but a different startedAtIso) and print them in the header line. Alternatively, include `startedAtIso`'s day plus the host's record order in the key when a duplicate role is seen. A one-line warning is enough.

### [P3] R1-F6 Single player's record wiring (pause count, startedAtIso, seat) is untested (minor d)
`duelMode.ts` counts user-pause edges per Pixi frame after `runtime.frame()` and resets the count inside `record()`. No test drives startDuelMode, so the pause count, the startedAtIso reset and `seat: runtime.active()` are unverified. One ordering effect: a pause taken on the end card (after the round's record) counts toward the next round, as does the end-card time in startedAtIso. · src/renderer/src/app/duel/duelMode.ts diff L973-978 (record resets pauses and startedAtIso), L993-994 (edge counted after `runtime.frame(dt)`); tests/duelRuntime.test.ts diff L1740-1756 tests `onRound` and `soloDuelRecord`, not duelMode. · `pauses` is a §8 record field. A regression here, such as counting blur pauses or never resetting, would go unseen. The impact is small because solo records are reported apart and are not part of the §16 rule. · Extract the counter, e.g. `soloRecorder({ now, active, helmPlayer })` returning `{ framePaused(userPaused), record(summary) }`, and unit-test it: two Escape pauses then a decision gives pauses 2; the next round starts at 0; blur is not counted.

### [P3] R1-F7 The F3 overlay overlaps the map's grid labels at the top left (minor g)
`createLatencyOverlay` places its BitmapText at stage (12,12). That position draws over the Helm/Weapons map's grid labels. · src/renderer/src/render/duel/latencyOverlay.ts:L39 (diff L1404 `text.position.set(12, 12)`). · Cosmetic only, and only in a debug view. It is covered by the owner's look check and the UI-ii React move (Decision 5). · Anchor the overlay at the top right (`INTERNAL_W - 12 - text.width`) or below the grid label row. Alternatively, defer the fix to the React `<LatencyOverlay>` called for in Decision 5.

## Verified
- Decision 1 (route label): rtcRoute gives 'internet' for any relay or srflx and 'lan' for two host candidates. A prflx candidate is judged by its address. A hidden remote prflx is 'lan' only when `direct` (iceServers.length===0), the local candidate is host and its address is private; otherwise null. route.ts L812-821; peer.ts diff L767-768 passes `iceServers.length===0`; tests linkStats.test.ts L1840-1861 cover each branch. route.ts imports only src/shared/rtcSession (diff L793).
- Decision 2 (figures' path): the controller sends `stats` every STATS_MS only when both a route and a finite RTT in 0-60000 ms exist, with the start request's stamp (controller.ts:L92-101). rtcTransport forwards it only for ready entries of the matching generation (diff L640-644). isRtcResponse admits exactly the stamp keys plus rttMs and route (rtcSession diff L1535-1536). The stats timer is cancelled on close (subscribe at L101; test L1896-1897).
- Privacy: only `{route, rttMs}` crosses each boundary. The hidden-window response and the IPC answer rebuild the object (onlineIpc diff L438), as does the preload (diff L909). validateOnlineLinkStats uses exact keys (onlineSession diff L1435-1438). The overlay prints only the label and numbers (latencyOverlay L1380-1381). The report prints no startedAtIso, address or code. The smoke's copied records (out/h2b-duel-app/records/{host,guest}) contain no address, token or candidate.
- Channel security: `online:link-stats` uses the same `trusted()` as the other handlers (sender === win.webContents, senderFrame === mainFrame, visible, not removed, ports closed; onlineIpc.ts:L21-25). It rejects any argument and is removed with the rest (diff L457; test L1937). The preload adds exactly one method, `online.linkStats` (diff L908-911).
- Decision 3: the host's records carry its own link RTT while staying loopback. Host and guest controllers both come from createRtcTransport (transportWindow.ts:40). The smoke's host record shows `transport: loopback, rttMs: 1` and the guest's shows `lan, rttMs: 1`.
- Decision 4: the label persists across null polls (onlineDuel diff L1084-1087). The round RTT is the median of that round's samples and is drained on record (`roundRtt.splice(0)`, diff L1116). The test at diff L1990-2007 checks median 60 against first 90 and last 70, then null on the next round, for both roles.
- Decision 5: F3 lives in its own module and is created lazily on first F3, drawn after scene.draw and destroyed on dispose (onlineDuel diff L1183-1191). The scene's root is added to the stage once (scene.ts:59-60, created once at onlineDuel.ts:226), so the overlay stays on top. LIVE_SAMPLES 300 rolling (diff L1078). It is not wired in Single player.
- Decision 6 and Single player unchanged: the runtime's accumulator mirrors duelRules exactly. A fresh telemetry is created on a round change, recordTick runs otherwise, and the record is emitted once on the Running-to-decided edge (runtime diff L1284-1290 vs duelRules.ts:L39-43, L61-64). recordTick only reads DuelState (telemetry.ts:L91-117). soloDuelRecord gives role 'host', transport null, empty latency, no jitter and no disconnects (duelRecord diff L1345-1348). main.ts passes recordDuel only for the in-app Single player.
- Decision 7 (rooms): rounds are sorted by index then time and chained by index+1, `followingSeed` and baseTick ≥ prev end. Keys are `seed-<n>` or `seed-<n>-r<k>`. Summaries come from the host (the guest's when the host's is missing). The room transport is the mode of the guest labels (model L126-146; tests L1601-1610).
- Decision 8 (§16 arithmetic): the rule needs at least 3 sessions with 4 or more yes and one non-owner pair among them (L171-175). The targets are median ticks/60 in 180-300 s, at least one CrewWins and one EnemyWins (draws count for neither), and crew `laserReleases[0]`>0 and `missilesLaunched[0]`>0 in every round. The planet extra is EnemyWins with 'planet' in terminal[0] under 1800 ticks (L185-194). With a checklist, the targets and the planet extra use only claimed rooms, and unclaimed and missing rooms are listed (L230-240). 'Done' is the rule plus the three targets, without the extra (L241). DEMO_RULE is checked against the Helm spec line (test L1594-1595).
- Decision 9 fallbacks: (1) seat===helmPlayer rows with held p95 over 150 (lan or unknown) or 250 (internet); (2) at least 2 helmLaggy sessions; (3) a one-known-network session with Q1 true and guestHelmQ1 false (L207-220; test L1631-1637). Triage (f): leaving check 1 over every room is correct. Spec §9 criterion 1 (spec L355) triggers on any LAN or internet session, and the LAN and internet checklist runs, which the targets exclude, are exactly the latency evidence. Check 3 is already session-scoped by construction. No change needed.
- Decision 10 script: a directory contributes its duel-*.jsonl files and checklist.json. `--checklist=` is the only flag. It exits 1 on bad arguments, a non-record file or no valid records, and invalid lines are counted (report.ts L276-295; test L1645-1668 checks the 2 files, 8 records and 1 invalid line, and exit 1 on checklist.json).
- Decision 11 smoke: it asserts every host record is loopback and every guest record is lan with a non-null RTT (smoke diff L341). It saves f3-host.png and f3-guest.png and copies records to `<report dir>/records/{host,guest}`.
- Triage (b): one `c.link` slot, last report wins (onlineSession diff L525, L547), matches the plan's own code (plan L702-704). A duel host has a single guest, so no action until a multi-peer mode reads linkStats.

## Not verified
- I did not run the test suite, the typecheck or the smokes (read-only review). The pass counts are the brief's.
- The F3 screenshots (f3-host.png, f3-guest.png) were not viewed, so whether the overlay actually renders in Electron is unconfirmed. The smoke does not assert on its pixels.
- Whether Chromium in production LAN play (STUN configured) reports host/host pairs often enough for the guest's label not to be null is a runtime property that needs the owner's LAN checklist.
- Beyond the manifest I read onlineBridge.ts (to confirm linkStats reaches the session through `...api`), onlinePeers.ts `ready()`, duelRules.ts, telemetry.ts recordTick, scene.ts addChild calls, transportWindow.ts (createRtcTransport use) and the smoke's out/h2b-duel-app record copies. I did not read the rest of transportWindow.ts or the main process's recordDuel handler.
- Whether a rehost (LAN checklist step 9) continues a room's round and seed chain or starts a new room-0 seed was not traced. Both cases are handled by the checklist merging rooms into a session.

---

# Round 1 response (implementation revised, 2bc18e3)

Reviewed `round-1.json`. 6 accepted, 0 rejected, 1 deferred. The prepared diff is regenerated for cf3eb60..HEAD. Full suite 265 files, 3867 tests pass; the duel smoke passes (45834 ms) and the report runs clean on its records. Each new test was checked to fail with its fix reverted.

## R1-F1 [P2]: The session owner's linkStats has no test

Confirmed. A `tests/onlineCoordinator.test.ts` case drives the owner: a fresh figure for a ready attempt is returned, null after 5001 ms, null for an attempt not ready, and a replaced transport's stats are ignored (reached through `host-changed`; the harness's `issue()` gained an optional `hostGeneration`, default 1).

## R1-F2 [P2]: The duel smoke recursively deletes <report dir>/records

Confirmed. The delete is refused (the run fails) unless the report directory is inside `out/`, mirroring the temp-root guard.

## R1-F3 [P3]: A stale route/RTT in the peer defeats main's 5 s freshness check

Confirmed. `sampleStats` resets `route`/`rtt` to null each sample and assigns them only with a selected pair (the catch path leaves them null). rtcPeer test.

## R1-F4 [P3]: The F3 overlay keeps showing the last RTT

Confirmed. A null answer clears `rttMs` (the label persists per Decision 4); `frame()`'s early returns hide the overlay. Session test.

## R1-F5 [P3]: A replayed round-0 seed merges two rooms' rounds and silently drops records

Confirmed. Records dropped as duplicates are counted and printed in the header line. Report test.

## R1-F6 [P3]: Single player's record wiring is untested

Confirmed. The counter moved to `src/renderer/src/app/duel/soloRecorder.ts` without behaviour change and is unit-tested (two pauses then a decision gives 2; the next round starts at 0).

## R1-F7 [P3]: The F3 overlay overlaps the map's grid labels

Deferred: cosmetic; Decision 5 moves the overlay to React (UI-ii), where it is placed clear of the labels.

## Also changed

- (nothing)

## Files changed

- scripts/duel-playtest-model.ts
- scripts/network/duel-app-smoke.ts
- src/network/rtc/peer.ts
- src/renderer/src/app/duel/duelMode.ts
- src/renderer/src/app/duel/onlineDuel.ts
- src/renderer/src/app/duel/soloRecorder.ts
- tests/duelPlaytestReport.test.ts
- tests/duelRuntime.test.ts
- tests/onlineCoordinator.test.ts
- tests/onlineDuelSession.test.ts
- tests/rtcPeer.test.ts

<!-- end -->

---

