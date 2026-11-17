# Codex review exchange: artemis-ii-plan

Subject: `docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 6e2e481e, effort high, 945 s, 23063983 in / 22743075 cached / 66963 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 1 breaks the DuelState shape test in tests/duel.test.ts, and the plan neither updates nor commits it
Task 1 adds `throttle` to DuelState and to createDuel's return (plan L302-313). tests/duel.test.ts pins the exact sorted key list of createDuel(...), and that list has no 'throttle'. The plan only touches tests/duel.test.ts in Task 2 (L77-87). Task 1 Step 8 lists every test it edits, the commit at L485 leaves duel.test.ts out, and Step 9 (L446) runs tests/duel.test.ts and expects PASS. · tests/duel.test.ts:L40-42 `expect(Object.keys(createDuel(layout, 5)).sort()).toEqual(['baseTick', 'decidedTick', 'events', 'helmPlayer', 'interior', 'nav', 'points', 'present', 'repair', 'round', 'tactical', 'weapons'])`; plan L84 (Task 1 test updates: duelModules, duelCheckpoint, duelSnapshot only), L446 (Step 9 runs tests/duel.test.ts, Expected: PASS), L485 (git add list). · A subagent running Task 1 verbatim hits a red Step 9 before the bless. It has been told only to edit the listed lines, so it either stalls or improvises an edit to a file outside its commit list. · Add to Task 1 Step 8: in tests/duel.test.ts L41, insert 'throttle' into the sorted list, between 'tactical' and 'weapons'. Add tests/duel.test.ts to Task 1's Files ('Test updates') and to the Step 13 `git add` line.

### [P2] R1-F2 Task 2 misses one seed-7 pin: duelSnapshot's base-tick case 5157 is SPLIT + 1
Step 11 re-measures seed 7's split tick and re-pins tests/duelSnapshot.test.ts L68 and L74. But the round-module case at L117 uses `[2, 5157, /base tick/]`, which is the old split tick 5156 plus 1. It throws only because 5157 > header.tick. If the new split S is 5157 or more, that snapshot validates, and the case fails. Step 12 says the only test edits allowed are Step 11's pins and that any other failure is a defect in the task's code, which sends the executor hunting for a bug that isn't there. Whether S moves is likely: in seed 7 the Helm bot stands to repair (repairsFinished [6, 14]), and its sit tick now flies the kept level. · tests/duelSnapshot.test.ts:L68 `scriptedDuel(7, 5156)`, L117 `[2, 5157, /base tick/]`; src/renderer/src/sim/duel/snapshot.ts:L149 `base > h.tick` throws; plan L806-809 (re-pins list), L817 ('The only test edits allowed here are the pins from Step 11'). · The pin procedure is meant to be complete and mechanical (brief item 6). One missing pin makes Step 12 fail whenever S ≥ 5157, with instructions that forbid the right fix. · In Step 11, add: `tests/duelSnapshot.test.ts` L117: replace `5157` with `<S + 1>`. Better, derive it in the test, e.g. `[2, d.interior.tick + 1, /base tick/]`, so it never needs re-pinning again.

### [P3] R1-F3 A few edit anchors are off by a line and could produce a syntax error or a duplicated doc comment
(1) duelOracle.ts: the plan says to replace 'the `38:` entry line and the closing `};` (L105-106)'. In fact L105 is the H-2 doc comment, L106 the 38 entry and L107 the `};`. Replacing L105-106 by number leaves a second `};` and drops the H-2 comment. (2) scripted.ts: 'Replace the first two lines of helmAxes (L95-97)' with a block that brings its own doc comment, but the old doc comment is at L94, so it would survive as a duplicate. (3) telemetry.ts: the Files line cites L11 for the comment that Step 7 edits at L14. · scripts/golden/duelOracle.ts:L105-107; plan L412-419. src/renderer/src/sim/duel/scripted.ts:L94-97; plan L717-725. src/renderer/src/sim/duel/telemetry.ts:L14; plan L496 vs L744. · Fresh subagents follow the numbers literally. · Cite duelOracle L105-107 (the comment, the entry and `};`) and keep the H-2 comment in the replacement. Cite scripted L94-97 (the doc comment included). Change telemetry `:11` to `:14`.

### [P3] R1-F4 Online: the console shows the new level one pump late
pump() hands the base to the source (`source?.throttleBase(...)`) right after reading the state, before play() runs. A press that sets throttleSent in that pump is not handed to the source until the next pump, so frame() draws the old notch for up to one pump interval. · plan L1255-1260 (throttleBase set after L201) vs L1249-1250 (throttleSent set later in play()); src/renderer/src/app/duel/onlineDuel.ts:L198-212 (the order within pump()). · A cosmetic lag of about 16 ms. It is not a correctness issue. · Also call `source?.throttleBase(throttleSent ? throttleSent.level : null)` at the end of pump(), after play(), or only there.

## Verified
- Step-1 oracle soundness: in Task 1 nothing reads d.throttle (step.ts L181 still flies held moveY; scripted.ts and telemetry.ts are unchanged), no oracle run sends throttle (ORACLE_RUNS = scripted, passive and rematch; passiveInput sends only presence at tick 0, tests/helpers/scriptedDuel.ts:L33-36), and recordRun compares fields, results, events and telemetry per tick through aliasPlan. MIGRATIONS[42].added /^helm\.throttle$/ covers the one new name (duelOracle.ts:L136-178, L205-266, L328-352).
- The bless guard: bumping from 42 to 43 runs verifyVersionOnly and verifyDuelOracle and needs baselines from the same cwd, tied to the stored duel-1 and rematch goldens (blessGuard.ts:L22-34, duelOracle.ts:L287-337). Task 1 Step 1 records both baselines at 42 before any edit. Task 2's same-version bless needs no proof.
- Module order, flatten and offsets: DUEL_MODULES gains helm after round (modules.ts:L77-84). The snapshot's roundAt and helmAt arithmetic and the L129 length check, L145 slice and L152 interior slice all follow the new interiorAt (snapshot.ts:L128-152). duelRoundOf's offset is unchanged (L94). duelCheckpoint.ts reads only duelRoundOf. The duel stream image is generic over values (duelStream.ts:L32-51).
- The duelModules contract edits in Task 1 (L9, L40, L90, L133, L143) match the test file. The duelCheckpoint examples Record at L138-141 needs the throttle entry, and the plan adds it. The duelSnapshot L104 offset +1 is correct.
- CommandResult status already includes 'noop' (contracts.ts:L94), and the codec's result enum has it (codec.ts:L147). 'invalid-seat', 'malformed' and 'stale-tick' are in COMMAND_REASONS (contracts.ts:L85-89).
- Admission placement: `helm` is computed at step.ts:L167, before the plan's insertion after L178. stepDecided answers duel-decided for any kind in DUEL_KINDS (L120). startRound builds through createDuel, so the throttle resets (L86-95).
- flyShip's quarter quantisation leaves whole axes bit-identical: q=±1 and 0 give the same branches, and `h0 * push * f` with push = 1·cls.thrust equals `h0 * cls.thrust * f` (physics.ts:L29-58). The hunter sends only −1, 0, 1 (hunter.ts:L69-79). The flight dev view passes helmAxes (sign-quantised, input.ts:L43-45) to stepSoloFlight (runtime.ts:L138, L126).
- The scripted pair: helmAxes thrust is always −1, 0 or 1 (scripted.ts:L98-116), so the level mapping is exact. Throttle is sent only from the nav-seated, conscious, present pid 0 and only when it differs, so the 'every result applied' assertions in duelScripted.test.ts:L60 and L78 still hold.
- The online client API: client.command returns CommandId | null (duelClient.ts:L53-61). takeResults releases a result only once the publication that carries it is held (streamClient.ts:L170-179), so clearing throttleSent on the result never exposes a stale replica level. The attach reset point (onlineDuel.ts:L240) and the pump ordering (L195-212) are as the plan cites.
- W/S as press edges: PRESS_CODES feeds presses[action] while keys.add still records the held key (input.ts:L63-68). The interior (runtime/online standing branch) and the flight view ignore the new actions, so walking and flight thrust keep working. DUEL_ACTION and emptyPresses are the only Record<KeyAction> sites (controlsList.ts:L19, input.ts:L38). The settings controls test needs W and S in the rows, and the move row already has them.
- DuelViewSource has exactly two implementers: the runtime, passed to scene.draw in duelMode.ts:L74, and the online source (onlineSource.ts:L113). ConsoleInput is implemented in input.ts:L80 and actions.ts:L44, plus the uiConsole test fixture at L32, which Task 3 updates.
- The Task 2-4 test harnesses exist with the assumed shapes: the duelRuntime rig (press/hold/tick, tests/duelRuntime.test.ts:L41-57), the onlineDuelSession stubClient/rig/nextRound (L24-133), duelOnlineView confirmed() (L23-34), duelTelemetry step/cmd/imports (L1-25), tacticalFlight ship/FLIGHT_NO_FIELD (L7-12), duel.test.ts hx/hy/cmd/step (L14-20), and uiConsole btn/texts/find (L16-18). Button acts only on button 0 (Button.tsx:L43), and PixelText's data-x is the x prop (PixelText.tsx:L37).
- The .tsout/ folder is git-ignored (.gitignore:L4). canonical-trace.ts and duel-oracle.ts support baseline/check/same/golden (scripts/golden/*.ts).

## Not verified
- `git show --stat 702146bd 5044177f`: no shell was available (Read/Grep/Glob only), so I did not compare the plan's commit file lists with the last two-step bless.
- Whether seed 7's split tick, the duel golden's length and the checkpoint summary actually change after Task 2, and whether duelGates still passes. This needs running the sim.
- Whether the Task 2 test 'levels 4, 2 and −1 fly the held-thrust path tick for tick' stays exact for 60 ticks at seed 5. It assumes no Engines hit and no ship contact in that window.
- The Task 5 Electron script against the running app (E after standing could repair instead of sit if a damaged point is in reach). I did not run it.
- tests/duelOnline.test.ts at Task 2: the replica-driven scripted pair now sends repeated throttle commands that are answered noop. I believe it still passes (it forbids only stale-tick), but I did not run it.
- I did not read the ledger's per-tick command-capacity rules to confirm that rapid W presses online never hit over-capacity in normal play.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `38f9d57c`. 4 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 1 breaks the DuelState shape test

Confirmed. tests/duel.test.ts L40-42 pins the sorted key list of createDuel. Task 1 Step 8 now adds 'throttle' to that list, and its Files line and git add include tests/duel.test.ts.

## R1-F2 [P2]: duelSnapshot L117 5157 is SPLIT + 1

Confirmed. tests/duelSnapshot.test.ts L117 uses that value, and snapshot.ts L149 is the check it trips. Task 2 Step 11 now re-pins it to `<S + 1>`.

## R1-F3 [P3]: Edit anchors off by a line

Confirmed. Checked duelOracle.ts L105-107, scripted.ts L94-97 and telemetry.ts L14. The anchors now name the right lines, and the oracle replacement keeps the H-2 comment.

## R1-F4 [P3]: Online console shows the new level one pump late

Confirmed. Checked the order inside pump(). The base is now also handed to the source at the end of pump(), after play().

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md

<!-- end -->

---

