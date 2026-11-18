# Codex review exchange: sci-2-plan

Subject: `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 8d2ce83b, effort high, 829 s, 27219319 in / 26861107 cached / 67284 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 2 breaks tsc -b in two test files it does not list
Task 2 changes `DuelTelemetry.players` from a tuple to `PlayerTelemetry[]`. Two test files index it with literal indices and no `!`. Under `noUncheckedIndexedAccess` those become 'possibly undefined' errors, and `tests/**` is inside `tsc -b`. Neither file is in Task 2's Files list or its `git add`. · plan L145-146 (Files), L500 (`players: PlayerTelemetry[]`), L604-605 (Step 12 tsc -b), L626 (commit list); tests/helpers/scriptedDuel.ts:78 (`t.players[0].repairsStarted`, `t.players[1]…` ×8 in telemetryLine); tests/duelTelemetry.test.ts:84 (`t.players[1].repairsStarted`); tsconfig.web.json:5 (noUncheckedIndexedAccess), :10 (include `tests/**/*`). · Step 12's `npx tsc -b` fails. Step 12's fallback only covers `0 | 1` casts in src. An executor who fixes these files by hand leaves them out of the commit, so the Task 2 commit is red on tsc. · Add a Task 2 step: in tests/helpers/scriptedDuel.ts:78 write `t.players[0]!.` / `t.players[1]!.` (the telemetryLine text is unchanged, so gate output is untouched), and in tests/duelTelemetry.test.ts:84 write `t.players[1]!.repairsStarted`. Add both files to Task 2's Files list and its `git add`.

### [P1] R1-F2 Task 3 makes a crew-3 duel init valid, so duelMode.test.ts:134 fails
Task 3 widens `duelInitSchema.playerCount` to 2|3|4. On the Hound (4 spawns), `{ ...modeDuelInit(1), playerCount: 3 }` therefore validates and the duel mode's start returns ok. tests/duelMode.test.ts:134 asserts `.ok` is false. Task 3 Step 8 runs tests/duelMode.test.ts and expects PASS, but no task edits that line. · plan L913 (`playerCount: z.union([2,3,4])`), L919-924 (only spawns/helm checks added), L965 (Step 8 runs tests/duelMode.test.ts), L986 (commit list lacks it); tests/duelMode.test.ts:26 (`modeDuelInit as duelInit`, the Hound), :134 (`encode({ ...duelInit(1), playerCount: 3 })).ok).toBe(false)`). · The Task 3 commit leaves the suite red: Step 8's targeted run and Step 10's full run both fail. · In Task 3 change tests/duelMode.test.ts:134 to `playerCount: 5` (still refused). Optionally add `expect(duel.command({ kind: 'start', initBytes: encode({ ...duelInit(1), playerCount: 3 }) }).ok).toBe(true)`. Add the file to Task 3's Files list and `git add`.

### [P1] R1-F3 Task 7 removes otherStatus and ReadoutInput.other but misses four test files
Task 7 deletes `DuelRuntime.otherStatus()` and `ReadoutInput.other`. Its sed and hand edits cover only crtReadout, duelConsoleModel, duelFireView, duelHealthView, duelReadout and duelOnlineView. Four other test files still use the removed API:
- tests/duelRuntime.test.ts and tests/scienceSeat.test.ts call `rt.otherStatus()`. That is a TypeError at runtime and a tsc error.
- tests/scienceConsole.test.ts and tests/scienceSeat.test.ts pass `other:` to `readoutRows`. That is an excess-property tsc error. · plan L1647-1648 (Files and test updates), L1841 (sed file list), L1884 (`git grep otherStatus` must print nothing, but there is no step to fix the hits), L1894 (commit list); tests/duelRuntime.test.ts:79,107,120,175 (`rt.otherStatus()`); tests/scienceSeat.test.ts:88 (`rt.otherStatus()`), :68 (`readoutRows({ …, other: 'AT SCIENCE' })`); tests/scienceConsole.test.ts:84,86,87,90,101 (`other: 'WALKING'`/`'AT HELM'`); src/renderer/src/app/duel/runtime.ts:187,432 (the members Task 7 deletes). · Task 7's targeted tests can pass while the full suite (Step 7) and `tsc -b` (Step 6) fail, so the commit is red. The executor has no stated replacement for these assertions. · 1. Add tests/scienceConsole.test.ts and tests/scienceSeat.test.ts to the sed command.
2. Rewrite the `otherStatus()` assertions with `crewStatus(rt.duel, 1)` (or the other pid): duelRuntime L79 and L120 'STANDING BY' become 'AWAY'; L107 and L175 'AT HELM' become 'HELM'; scienceSeat L88 'AT SCIENCE' becomes 'SCIENCE'. At L107 and L120, replace the array element.
3. List all three files in Task 7's Files and `git add`.

### [P2] R1-F4 Decision 5: REPAIRING shows for anyone standing near damage, even if not repairing
The new rule is `repairInReach(d, pid) >= 0`. It is true for any conscious, standing, present character who is in a damaged or burning room within reach of its repair tile, whether or not they hold E. Two examples:
- In Single player, the idle partner left in a damaged room reads REPAIRING.
- Online, a crewmate walking past a damaged point reads REPAIRING.
Both old rules needed real work: the partner's held E, or repair progress since the last publication. · plan L36 (Decision 5), L1776-1785 (`crewStatus`); src/renderer/src/app/duel/controls.ts:21-27 (repairInReach ignores input and progress); old rules at src/renderer/src/app/duel/runtime.ts:437 (`sentHeld[other].interactHeld && repairInReach`) and onlineSource.ts:151 (`workOf(d)[room] > prevRepair[room]`). · The crew list is how Helm and Weapons know what the others are doing in the three-player playtest (the checklist asks about it). A false REPAIRING misleads them, and Task 7 deletes the tests that pinned the stricter behaviour. · Keep it state-only but require evidence of work: REPAIRING when `repairInReach(d, pid) = r >= 0` and the room has progress (`d.repair[r] > 0`, or the point's extinguish progress > 0 while it burns), else ON FOOT. Alternatively, keep the rule but label it `AT REPAIR`, and state this in Decision 5 and the checklist.

### [P3] R1-F5 Small citation slips in Task 2 Step 7 and Task 5
Task 2 Step 7 says there are 'five loops in applyHitDamage and healthPhase'. There are six (one in applyHitDamage, five in healthPhase), plus one in revivers. Separately, Task 5 cites tests/menu.test.tsx L73 for `expect(host).toHaveBeenCalledWith()`, but that line is L74 (L73 is the host-note check). · plan L481; src/renderer/src/sim/duel/health.ts:50,96,103,110,120,122 (PLAYERS loops), :62 (revivers); plan L1209, L1296; tests/menu.test.tsx:73-74. · Both edits are written as text replacements, so neither blocks. A miscount can still make an executor stop after five loops. · Say 'every `pid < PLAYERS` (six in applyHitDamage and healthPhase, plus `o < PLAYERS` in revivers)', and cite menu.test.tsx L74.

## Verified
- Task 2 step.ts edits match the code: attendant L51, repairPhase L68-69, startRound L106-107, stepDecided presentBefore and presence L127-139, the seat-phase away and presence checks L166/L181, intents L261-264. `st` is in scope for `st.playerCount`.
- Task 2 health.ts: `PLAYERS = 2` at :15, the revivers cast at :63 and the loss line at :123 exist as quoted.
- Task 2 telemetry.ts: the repairs block L135-147, seats L69, createTelemetry L75-77 and `lastConsole: seat` sharing are as quoted. `d.interior.crew` is a plain `number[]` (sim/state.ts:27), so `.map` gives `number[]`.
- Task 2 summary.ts, modules.ts and duelRecord.ts lines match. `flag<S>` (sim/module.ts:32) and `fields(s)` (module.ts:18) accept the per-crew presence fields. `RECRUIT` is the number 4 (characters.ts:20).
- The crewOfFour test imports resolve: DuelEnvelope/DuelCommand (sim/duel/commands.ts), HeldInput, roomAt, SCAN_RATE_SCIENCE = 5 (tactical/tuning.ts:135), CUTTER. The initial `freq` is 0 (tactical/state.ts:156), so tuning to 2 is applied. `scanCommand` sets by/rate (tactical/science.ts:12-21).
- Decision 4 holds: schema.ts:24 requires `spawns.min(4)`. The Hound has spawns 13..16,7 (hound.json:215+).
- Decision 7 holds: the Cutter has a Science station at 20,7 (cutter.json:497-501), the Hound at 9,5 (hound.json:179-181), and the schema requires exactly seven stations (schema.ts:35). The Cutter has no console groups, so seat 2 can sit at Science there.
- Task 3 snapshot.ts edits match: DUEL_PLAYERS uses at :29,77,101,118,160,164,168; roundAt/helmAt/interiorAt at :129; presence range at :140; helm check at :149; restore check at :196. `canonicalFields(layout, players)` and `validateCanonicalValues(…, players, …)` take n.
- Task 3 test offsets are right: interiorAt = 1+space+n+3+4+2 and the helm index is 1+space+n+3+1.
- Task 3 duelCheckpoint.ts: every DUEL_PLAYERS site (:12,38,72,73,76,77,99) is replaced. The core sizes its ledger and arrays from `rules.playerCount(state)` (authority/core.ts:50,61), so changing duelRules.ts:34 sizes the checkpoint at n.
- `duelCodec()` defaults to MAX_PLAYERS (codec.ts:213). The publication schema already ties watermark lengths to `header.playerCount` (codec.ts:190-192), so building at limit 4 still enforces n.
- Every DUEL_PLAYERS use is in snapshot.ts, duelCheckpoint.ts or duelClient.ts, so Task 3's final grep can pass.
- Task 4: the duelProducers.ts body (L27-33, :101, :112), duel.ts:15,20 and duelStream.ts:56,63 match. The only `createDuelProducers` callers are duel.ts:20, tests/duelProducers.test.ts:88,114,141 and tests/helpers/onlineDuel.ts:32, and all are updated. encounterMode.ts:106 takes `count` from `init.playerCount`.
- Task 4 duelClient: streamClient calls `onAccepted` before it loops over `playerCount(replica)` (streamClient.ts:78-82), so bounding `has` by the latest crew is sound.
- Task 5: validateOnlineAction (shared/onlineSession.ts:77-82), the `seatId` helper (:65), the preload at L35, onlineSession.ts:421, onlineDuel.ts:18-58 and onlineModes.ts:18,33 match. onlineSession.ts:350 already passes the capacity to validateMirror. The guest's validateCommittedDuelStart works at any capacity.
- Task 5 test edits match onlineSessionContract.test.ts:38,41, onlineDuel.test.ts:18-19,32,39,68-71 and onlineBridge.test.ts:88. `{ ...init, helmPlayer: 2 }` on a capacity-2 room is still refused by the new `helmPlayer >= playerCount` check.
- MenuState is only ever built from INITIAL_MENU (store.ts:16, uiMenuState.test.ts:9), so the new `crew` field needs no other literal updated.
- Task 6: sitModel.ts:26-35, scene.ts:59,221-222, consoleModel.ts:41,68,80, onlineSource.ts:91, onlineDuel.ts:157,313, situationModel.ts:21,107, interiorView.ts:71,83 and interiorModel.ts:70-86 match. `crewLife`/CrewLife and duelAudio `me: number` are already n-generic.
- Task 7 readout math: at a crew of four with a torpedo inbound the interior list is 22 rows, and 21 at n=2 today. crtReadout slice(14)→13 and duelReadout length 14→13 are right. createDuel leaves characters standing, so the 'P2 ON FOOT' / 'P2 WEAPONS' expectations follow the setup.
- READOUT_ROWS is read only by ReadoutPanel.tsx:46, crtBezel.test.ts:59 and the ≤ checks in duelHealthView/duelReadout.
- Task 8: MenuButton, HostForm and styles.ts (CSSProperties, BUTTON) match. No test lists the Host page's button ids. The uiMenuState `view`/`idle` helpers exist (uiMenuState.test.ts:7-10).
- The golden scripts support the plan's modes: duel-oracle.ts has baseline, check and same; duelOracle.ts:340-344 makes 'bump' use `MIGRATIONS[51]`, which is absent and maps every field to itself (:86); canonical-trace.ts has baseline, check, same and golden.
- Two-player byte identity: no Task 2 or 3 edit changes values, field names or order at n=2 (the presence copy, the telemetry init, the summary key order and the codec arrays are unchanged).
- No task touches services/signalling or tests/duelGates.test.ts.

## Not verified
- Whether crtBezel.test.ts:59 still fits the readout panel at READOUT_ROWS 23: I did not compute LINE, PAD and the panel bounds.
- Runtime results of Task 4's online tests: that seat 2's scan reaches Level 1 within the 200 ticks, the steward's timing for the empty seat, and replica hash agreement after the pause. I did not run vitest (read-only review).
- Whether crew-4 Hound publications stay under MAX_IMAGE_BYTES and MAX_MESSAGE_BYTES (duelStream.ts:37, codec.ts:219). Per sender.ts:27, a delta over latestPayloadLimit falls back to a reliable full send, so that limit is not a blocker.
- That createSimState places characters at spawn tile centres (+0.5) and that Hound spawns 13..16,7 lie in room Q, as crewOfFour asserts. I relied on the spec.
- The exact console text the plan's expected outputs quote for the trace, oracle and bless scripts.
- That the menu's version line shows `sim 52`, as docs/playtest-duel.md assumes.
- Whether the run directory's ledger has awaited IDs for this round. None were given, so prior is empty.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `5e9be125`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 2 breaks tsc -b in two test files it does not list

Confirmed: tests/helpers/scriptedDuel.ts:78 and tests/duelTelemetry.test.ts:84 index `t.players[n].` with no `!`, and tsconfig.web.json includes tests under noUncheckedIndexedAccess. Task 2 gains Step 12b (add `!`, telemetry text unchanged), and both files are in its Files list and `git add`.

## R1-F2 [P1]: Task 3 makes a crew-3 duel init valid, so duelMode.test.ts:134 fails

Confirmed: tests/duelMode.test.ts:134 expects a playerCount 3 init to be refused. Task 3 Step 7b changes it to 5 and asserts a crew-3 start succeeds; the file is in `git add`.

## R1-F3 [P1]: Task 7 removes otherStatus and ReadoutInput.other but misses four test files

Confirmed: rt.otherStatus() at tests/duelRuntime.test.ts:79,107,120,175 and tests/scienceSeat.test.ts:88; `other:` in tests/scienceConsole.test.ts and scienceSeat.test.ts. Task 7 extends the sed, rewrites the otherStatus assertions as crewStatus(rt.duel, 1) with an explicit value map, and lists the three files in Files, the test run and `git add`.

## R1-F4 [P2]: Decision 5: REPAIRING shows for anyone standing near damage, even if not repairing

Confirmed: repairInReach (controls.ts:21-27) ignores input and progress. Decision 5 and crewStatus now require started work too (d.repair[r] > 0 or the point room's fireRepair > 0), the state-only form of the old online workOf rule (onlineSource.ts:43). crewList.test.ts checks ON FOOT at a damaged point, then REPAIRING once repair progress is set.

## R1-F5 [P3]: Small citation slips in Task 2 Step 7 and Task 5

Confirmed (health.ts:50,96,103,110,120,122 and :62; menu.test.tsx:74). Fixed both.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md

<!-- end -->

---

# Round 2 (delta, reviewing 29713c20, effort medium, 54 s, 257068 in / 221512 cached / 4969 out)

Verdict: ready

## Findings

### [P3] R2-F1 Task 7's otherStatus rewrite defaults to pid 1, but at duelRuntime L107 and L175 the other character is pid 0
The new hand-edit step says to replace `rt.otherStatus()` with `crewStatus(rt.duel, 1)` and to use a different pid only 'if it is not 1'. At tests/duelRuntime.test.ts L107 and L175 the active character is player 1 after a Tab, so the partner is player 0, seated at Helm. `crewStatus(rt.duel, 1)` would return 'WEAPONS' at L107, which fails against 'HELM'. At L175 player 1 is standing at the Weapons repair point, so it would read REPAIRING or ON FOOT. The escape clause covers this, but only if the executor works it out. · plan L1865 (hand edit: `crewStatus(rt.duel, 1)` … 'use the pid the test's other character has if it is not 1'); tests/duelRuntime.test.ts:103-107 (`press('switch')`, then `[rt.active(), …]` equals `[1, 'weapons', 'AT HELM']`); :168-175 (switch to the gunner, `put(rt, 1, 8, 6)`, then `otherStatus()` is 'AT HELM'); tests/duelRuntime.test.ts:79,120 and tests/scienceSeat.test.ts:83-88 (here the partner is pid 1, so the default is right). · A fresh executor that applies the default literally gets two red assertions. They then have to find out why from the test bodies. This does not block, because the clause allows it. · State the pids explicitly: L79, L120 and scienceSeat L88 use `crewStatus(rt.duel, 1)`; L107 and L175 use `crewStatus(rt.duel, 0)` (expected 'HELM').

## Prior findings
- R1-F1: resolved — Step 12b (plan L608-610) adds `!` to every `t.players[0].` and `t.players[1].` in tests/helpers/scriptedDuel.ts:78 and to tests/duelTelemetry.test.ts:84. Those are the only two bare member accesses: duelTelemetry L81, L87 and L88 pass the element to toMatchObject, which accepts undefined. Both files are in Files (L147) and in the git add (L631).
- R1-F2: resolved — Step 7b (plan L968-976) changes tests/duelMode.test.ts:134 to playerCount 5 and adds a crew-3 start asserted true. The `duel` harness and the `duel.command({ kind: 'start', initBytes: encode(...) })` form match L131-135. The file is in the git add (L1001).
- R1-F3: resolved — The sed (L1861) now covers scienceConsole.test.ts (L84, 86, 87, 90 and 101; every value matches `[A-Z ]+`) and scienceSeat.test.ts:68. The hand edit (L1865) covers duelRuntime L79, 107, 120 and 175 and scienceSeat L88, with a value map, the array-element note and the import. scienceSeat already imports readoutModel at L16; duelRuntime gets a new import. The three files are in Files, the Step 6 run and the git add. The pid default is wrong at two lines; see the new P3.
- R1-F4: resolved — Decision 5 (L36) and crewStatus (L1797-1805) now require `d.repair[r] > 0` or `fireRepair[p.room] > 0` on top of reach. The fields are real: state.ts:12 (RepairPoint.room/tacticalRoom), :40 (repair), :42 (points), fire.ts:18 (extinguishProgress reads fireRepair[p.room]). repairInReach returns p.tacticalRoom (controls.ts:26). The test adds ON FOOT when damaged, then REPAIRING once repair is 1 (L1727-1730).
- R1-F5: resolved — Task 2 Step 7 (L482) now reads one loop in applyHitDamage, five in healthPhase, plus revivers. Task 5 cites menu.test.tsx L74 (L1311).

## Verified
- tests/helpers/scriptedDuel.ts:78 and tests/duelTelemetry.test.ts:84 are the only bare `t.players[n].` member accesses in tests (grep of tests for `t\.players\[`).
- tests/duelMode.test.ts:131-135: a `duel` harness, the start command form, and L134's playerCount 3 assertion, all as Step 7b assumes.
- tests/scienceConsole.test.ts:84,86,87,90,101 and tests/scienceSeat.test.ts:68: every `other:` value is a single all-caps word or 'AT HELM', so the sed pattern `, other: '[A-Z ]+'` removes each.
- tests/duelRuntime.test.ts:79,107,120,175 and tests/scienceSeat.test.ts:88 are every `otherStatus()` call in the three files.
- src/renderer/src/app/duel/controls.ts:21-27: repairInReach returns tacticalRoom, or -1 when the character is seated or not conscious, so crewStatus's `d.points.find(q => q.tacticalRoom === r)` lookup and the fireRepair index (fire.ts:18) are consistent.

## Not verified
- I did not run `tsc -b` or vitest (read-only review), so I did not confirm that the duelMode crew-3 start validates against the harness's room and seat setup. It relies on the round-1 reading that modeDuelInit is the Hound with four spawns.
- I did not check whether `d.repair` keeps its tuple type after Task 2. Under noUncheckedIndexedAccess the `d.repair[r]!` in crewStatus is valid whether it is a tuple or number[].

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the plan at `29713c20`. 1 accepted, 0 rejected, 0 deferred; R1-F1..F5 confirmed resolved.

## R2-F1 [P3]: Task 7's otherStatus rewrite defaults to pid 1, but at duelRuntime L107 and L175 the other character is pid 0

Confirmed: tests/duelRuntime.test.ts:103-107 and :168-175 switch to player 1, so the partner is player 0. Task 7 now names the pid for each line.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md

<!-- end -->

---

