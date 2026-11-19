# Codex review exchange: 2026-11-18-w2-manual-laser-plan

Subject: `docs/superpowers/plans/2026-11-18-w2-manual-laser.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing f35a4149, effort high, 1193 s, 25084165 in / 24739899 cached / 79105 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 4 leaves tests/rockLock.test.ts's shipModule.commands pin unchanged, so its own test run fails
Task 4 Step 3(c) changes `shipModule.commands` to start with 'laserMode' and to include 'laserFire'. Step 5 updates only the pins in duelModules, duelCheckpoint and ftlTargeting. A second exact pin, in tests/rockLock.test.ts, is not touched, and Task 4 Step 6 runs that file explicitly. · plan L1013-1017 (new commands list); plan L1091-1105 (Step 5 updates only duelModules:152, duelCheckpoint:149, ftlTargeting:169); plan L1112 (Step 6 runs `tests/rockLock.test.ts`); tests/rockLock.test.ts:L90 `expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch', 'pewFire'])`. · The subagent runs Task 4 Step 6 and gets a red test it was never told about. It would then have to improvise outside the task text, or stop. · Add a Step 5(d): `tests/rockLock.test.ts` line 90 becomes `expect(shipModule.commands).toEqual(['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1 merge: the pew last; W-2: the laser mode first`. Add that file to Step 7's `git add`.

### [P1] R1-F2 The new online test calls requests!.aimLaser on a mock typed { pew } only, so `npx tsc -b` fails
In onlineDuelSession.test.ts, the hoisted `h.sceneOpts` array and the scene mock's `opts` parameter both type `requests` as `{ pew(aim: number): void }`. Task 6's new describe calls `h.sceneOpts[0]!.requests!.aimLaser(1234)`. That property does not exist on the declared type. tests/**/* is part of the `tsc -b` project, so this is a compile error. · plan L1832 `h.sceneOpts[0]!.requests!.aimLaser(1234);`; tests/onlineDuelSession.test.ts:L53 `sceneOpts: [] as { ui: …; requests?: { pew(aim: number): void } }[]` and :L66 (the same type on the mock's opts); tsconfig.web.json:L10 includes "tests/**/*"; plan L1848-1849 (Task 6 Step 8 expects `npx tsc -b` with no errors), and Task 8 Step 4 expects the same. · Vitest would still run the test, but Task 6 Step 8 and Task 8 Step 4 both require a clean typecheck, so the task fails as written. · In Task 6 Step 7(c), also widen both annotations in tests/onlineDuelSession.test.ts (L53 and L66) to `requests?: { pew(aim: number): void; aimLaser(aim: number): void }`, quoting the old text. Alternatively, cast at the call site: `(h.sceneOpts[0]!.requests as unknown as { aimLaser(a: number): void }).aimLaser(1234)`.

### [P2] R1-F3 Task 3's shield expectations depend on seed 5's weak frequency not being 0
The `open()` rig in manualLaserBeam.test.ts leaves the crew laser at `freq` 0, the round-start value. Several tests then expect a single layer stripped: the non-weak shield case expects shields 1, the torpedo test expects `shields - 1`, and the burst test expects shields 1 after the first shot. If createTacticalState(5) draws weakFreq 0, every one of those shots strips 2 layers and the tests fail. The codebase's own helper exists to avoid exactly this. · plan L526-536 (open() never sets freq); plan L564-573 (`weak ? 0 : 1`, the non-weak case not moved off weakFreq); plan L610 (`shields - 1`); plan L619 (`[1, 1, NORTH]`); state.ts:L207 (`freq: 0`); weapons.ts:L145 (two layers when `as.freq === state.weakFreq`); tests/helpers/hostile.ts:L9 `st.systems[0].freq = (st.weakFreq + 1) % 3` (used by tacticalWeapons.test.ts:L11 and weaponsUpdate.test.ts:L15 for this reason). · Whether these tests can pass depends on an unchecked seed draw; one value in three breaks them. · In manualLaserBeam.test.ts `open()`, add `st.systems[0].freq = (st.weakFreq + 1) % 3;   // off the weak frequency: one layer a hit`. Keep the weak case's explicit `st.systems[0].freq = st.weakFreq`.

### [P2] R1-F4 Task 2 Step 7(a) targets the wrong line by number and quotes no old text
Step 7(a) says 'tests/tacticalDeterminism.test.ts line 115 becomes:' the systems-keys assertion. Line 115 is the ships-keys assertion; the systems keys are on line 116. The plan's own rule is to match every edit by quoted text, but this step gives no old text to match. · plan L446-450; plan L141 (`tests/tacticalDeterminism.test.ts:115,122-128`); tests/tacticalDeterminism.test.ts:L115 (`Object.keys(st.ships[0])`), :L116 (`Object.keys(st.systems[0])`); plan L27 (match by the quoted text). · A literal executor could overwrite the ships-keys guard and duplicate the systems assertion. The test would still pass, but the body-field completeness check would be silently lost. · Quote the old line: "the line starting `    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', …` (line 116) becomes:", and correct the Files entry to `:116,122-128`.

### [P3] R1-F5 onlineDuel.ts has two state imports; Step 6(a) says 'the state import line'
onlineDuel.ts imports from '../../sim/tactical/state' twice: `{ Outcome }` at L19 and `{ CONTACT_MAX_LEVEL, missileOf }` at L27. Step 6(a) does not say which one to rewrite. Only the replacement's content shows it means L27. · plan L1717-1721; src/renderer/src/app/duel/onlineDuel.ts:L19 and :L27. · Replacing L19 instead would drop the `Outcome` import and break the compile at L273. · Quote the old line: "the line `import { CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';` becomes …".

## Verified
- Task 3's shared `laserStrike` keeps AUTO byte-identical. It does the same laserHits++, the same strip rule (weak frequency 2, shieldClock 0, gunWear 0, layersStripped) and the same room and hull update on `as.lock`, and the event's fields come out the same (weapons.ts:L135-163 vs plan L703-735). `stepBurst` takes `shootAlong` only when laserAim ≥ 0, and AUTO keeps laserAim −1 (state.ts:L207 plus plan L297).
- The AUTO gates are additive only: `!s.laserManual` on the crew press and on auto-fire (weapons.ts:L225, L234; plan L346, L360). The Hunter path is untouched: `crew` is false and its input sets laserFire −1 (hunter.ts:L129).
- Every interface Task 3 consumes exists with the assumed shape: rocks.ts `segmentEntry` (L80, entry t in [0,1], 0 when starting inside), `firstBlocker` (L93, rock −1 for the planet, born pieces skipped); geometry.ts `roomAtImpact(s, px, py)` (L35); rockWeapons.ts `laserStrikesRock(state, i, k, x, y)` (L28); pew.ts `aimDir` and `clampAim(heading, aim, arcSteps)` (L35-44); `laserFrozen`, `laserOffline` and `laserFull` in weapons.ts.
- Task 3's test numbers are right: clampAim(0, 16384, 10922) = 10922; rock r40 has hp 4 and takes 2 damage (rockTuning L5, L31); planet at the origin with r 70 (map.ts:L104); SHIP_RADIUS 20 for every class (defs.ts:L107); Cutter fires 2 shots 12 ticks apart (tuning.ts:L84-86); Hunter has 2 shield layers (tuning.ts:L87); the burst loop fires on the 12th call.
- hash.ts: an inactive slot must hold all zeros (L285), which matches emptySystems' laserAim 0. The new crew-only and burst checks run in the active branch after `clsOf.set` (L289). laserBurst comes before laserAim in SYSTEMS_TAIL, so burstOf is set first. The error text format `${f.name}: ${why}` matches the regexes in the new duelSnapshot cases.
- The flatten-length arithmetic is right: 38 + 6 = 44 values per systems record today, so 46 with the two new scalars (tacticalDeterminism.test.ts:L127-128).
- step.ts admission: the existing loop (L215-242), `WEAPON_ORDER` and `DUEL_KINDS` (L32, L34) and the imports (L15-19) match what Task 4 replaces. The narrowing through the else-if chain still leaves `pewFire` in the final else. `crew.laserFire` is −1 after Task 2. The admission checks and applyWeaponsInput's gates agree: canCharge vs laserFrozen, manualLaserReady before stepBurst (charge is 0 during any pending burst), and Weapons offline.
- codec.ts duelWire (L110-131) and contracts.ts DuelCommand (L74-100) take the new strict zod objects as written. authority/duelRules.ts decodes through the codec and steps with stepDuelTick (L38), so the plan's 'no edit' is justified.
- The duelOracle `ADDITIONS`/`frozen`/`added` mode exists. It is keyed by the current SIM_VERSION, requires the same version and checks frozen fields at every tick (duelOracle.ts L120-125, L256-292, L359-383, L396). duel-oracle.ts supports baseline, check and added (L15-24). The field names have the form `ship.systems.N.laserManual`, which the plan's regex matches.
- The bless sequence works against blessGuard.ts. A bump needs both proofs (L22-30), and a same-version bless is allowed. Task 1 records the 56 oracle baseline after the bump bless, so Task 8's `added` judge finds a 56 baseline (judgeDuelOracle L364-366). determinism-v2.json's contentDigest (f82dad3f…) differs from basic.json's (45904efb…), consistent with W-1's 'fixture does not move' expectation (W-1 plan L2739).
- Input: KeyZ is unbound in PRESS_CODES (input.ts:L11-15) and in the contact controller's intercept (contactController.ts:L136-144). KeyX stays 'stand'. DUEL_ACTION is a Record over KeyAction, so it must gain laserMode, and the plan adds it (controlsList.ts:L19). settingsAndControls.test.ts:L37 needs a 'Z' row, which the plan provides. No other `Record<KeyAction>` and no exact presses pins exist in tests.
- The left click and the contact window stay as W-1 left them. The pewClick and contact.click block (scene.ts:L192-206) is untouched. The laser aim insert uses the same `onWeaponsMap` gate after it, and every identifier it uses is already imported or in scope (scene.ts L29, L31, L39, L44-45, L177-183).
- weaponsModel.ts: `ownS`, `z`, `cls` and the pew block (L148-151, L273-288) match Task 5's insert. tacticalLayer.ts has `line`, `seg`, `segments`, `dashLine`, `DASH` and `GAP` in scope at the pew aim line (L12-13, L95, L122, L369).
- onlineSource.ts gapEvents (L56, L60, L65) matches Task 5 Step 6's quoted lines. `rose` is computed before the shot loop.
- runtime.ts: `freqBase`, `pending`, `active`, `queue`, `refuse`, `hasLaser`, `deps`, `HEADING_COUNT` and `refusal` exist (L22, L31, L260-268, L348, L362). The Weapons part replaced (L476-481) matches. duelMode.ts:L69 matches Step 5(e). onlineDuel.ts: `send` returns a CommandId (L132-137), `sys` is in scope (L231), and the observe, attach, pump and play lines quoted in Step 6 exist (L181-184, L198, L201, L244-250, L269-270, L312-313). `laserAimNow` is defined outside `play`, whose `requests` parameter shadows the MapRequests.
- refusal() (situationModel.ts:L196-213) checks NO GUNNER, then the laser class, then TORPEDO FLYING, then WEAPONS OFFLINE. Adding NO CHARGE after these in MANUAL only keeps AUTO's words, and CREW_SLOT is already imported (L8).
- Task 7: consoleModel weaponsPanel (L122-126) and its imports (L11-12) match. Button gives data-testid `console-<name>`, data-ui-button 'lit', and onPress on a button-0 pointerdown (Button.tsx L40-61). WeaponsStation has the `lx`, `L`, `actions` and "1" PixelText anchors (L71, L89). laserSituation does not depend on hostility (situationModel.ts L39-66).
- MapRequests has no other implementers, so widening the interface compiles (only createMapRequests is used: duelMode.ts:L50, onlineDuel.ts:L84). ShipInput literals exist only at IDLE_INPUT, UNCREWED_INPUT, hunter.ts:L129 and step.ts:L210; everything else spreads IDLE_INPUT.
- The beam's rock behaviour applies master's laser-on-rock effect (push, then LASER_ROCK_DAMAGE, which can break the rock) and says so in Decision 2 (plan L33), as the brief requires.
- The new sim code uses only + − × ÷, %, sqrt (through segmentEntry and dirBetween), Number.isInteger and the heading tables. There is no trig or Math.PI in sim files; Math.sin and Math.PI appear only in render code (weaponsModel).

## Not verified
- Seed 5's weakFreq draw: I did not run the sim, so whether the Task 3 shield expectations fail (finding 3) is unconfirmed. Existing seed-5 tests all use makeHostile.
- Whether feelPresentation's `place()` at (3000, 0) has a clear line of sight for createSeatedDuel(CUTTER, 5) in Task 7's FIRING expectation. `place` clears map.asteroids but not the asteroids-ii rock pool (st.rocks). The same helper passes in feelPresentation.test.ts, but I did not check that file's seed.
- Exact console text formats of canonical-trace.ts and bless-golden.ts, and the full duel-telemetry/valkyrn-telemetry output. I took them as matching W-1's executed plan.
- Task 7's tag geometry claims ("x2 to 66", the "1" hint from 126, AUTO 24 px wide): I did not read weaponCard('laser')'s width or the font metrics.
- Whether the tick of each Single player runtime test's `rig` (two frames plus scheduled tasks) steps exactly once. I relied on the identical contactScene.test.ts rig.
- Whether the onlineDuelSession stub's `publish` copies the replica through the snapshot. Either way laserManual and laserCharge carry over, since both are hashed fields.
- I did not run the test suite, tsc or any script (read-only review).

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `f35a4149`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 4 leaves tests/rockLock.test.ts's shipModule.commands pin unchanged, so its own test run fails

Confirmed: tests/rockLock.test.ts:90 pins the six-command list. Task 4 Step 5(d) now rewrites it to the eight-command list, matched by the quoted old line, and the file is in Step 7's git add.

## R1-F2 [P1]: The new online test calls requests!.aimLaser on a mock typed { pew } only, so `npx tsc -b` fails

Confirmed: tests/onlineDuelSession.test.ts:53 and :66 type `requests` as `{ pew }`. Task 6 Step 7(c) now widens both annotations to `{ pew; aimLaser }` before inserting the new describe.

## R1-F3 [P2]: Task 3's shield expectations depend on seed 5's weak frequency not being 0

Confirmed: state.ts:207 starts freq at 0, and weapons.ts:145 strips two layers on the weak frequency. `open()` now sets `freq = (weakFreq + 1) % 3`, as tests/helpers/hostile.ts does. The weak case keeps its explicit `freq = weakFreq`.

## R1-F4 [P2]: Task 2 Step 7(a) targets the wrong line by number and quotes no old text

Confirmed: the systems-keys assertion is line 116. Step 7(a) now quotes the old line's start, and the Files entry reads `:116,122-128`.

## R1-F5 [P3]: onlineDuel.ts has two state imports; Step 6(a) says 'the state import line'

Confirmed: onlineDuel.ts:19 and :27. Step 6(a) now quotes the `{ CONTACT_MAX_LEVEL, missileOf }` line and says the `{ Outcome }` import stays.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-w2-manual-laser.md

<!-- end -->

---

# Round 2 (delta, reviewing ea2ca809, effort medium, 31 s, 69648 in / 50491 cached / 1944 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Task 4 Step 5(d) quotes tests/rockLock.test.ts:L90 exactly as it stands, and replaces it with the same eight-command list that Step 5's other pins use. tests/rockLock.test.ts is now in Step 7's git add.
- R1-F2: resolved — Task 6 Step 7(c) (plan L1819) widens both `requests?: { pew(aim: number): void }` annotations. Both exist verbatim at tests/onlineDuelSession.test.ts:L53 and :L66, so `requests!.aimLaser` now typechecks. The file is in the commit's git add (plan L1864).
- R1-F3: resolved — open() now sets `st.systems[0].freq = (st.weakFreq + 1) % 3` (plan L534), as tests/helpers/hostile.ts does. The weak case still sets `freq = st.weakFreq` explicitly after open() (plan L569), so both branches are deterministic whatever seed 5 draws.
- R1-F4: resolved — Step 7(a) now quotes the start of the systems-keys line and names line 116, which matches tests/tacticalDeterminism.test.ts:L116. The ships-keys assertion at L115 is left alone. The Files entry reads `:116,122-128`.
- R1-F5: resolved — Step 6(a) quotes `import { CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';`, which matches onlineDuel.ts:L27, and says explicitly that the `{ Outcome }` import (L19) stays.

## Verified
- tests/rockLock.test.ts:L90 matches the old text quoted in plan Task 4 Step 5(d), character for character up to the comment
- tests/onlineDuelSession.test.ts:L53 and :L66 both contain `requests?: { pew(aim: number): void }`, which plan L1819 quotes
- tests/tacticalDeterminism.test.ts:L115 is the ships-keys assertion and L116 is the systems-keys assertion, which matches the revised plan L446 and the Files entry at L141
- src/renderer/src/app/duel/onlineDuel.ts:L19 `{ Outcome }` and :L27 `{ CONTACT_MAX_LEVEL, missileOf }` match the revised Step 6(a)
- The open() rig at plan L526-537 sets freq off the weak frequency; the weak-case override at plan L569 comes after open(), so it takes effect
- Task 4 Step 7 (plan ~L1125) and Task 6's commit (plan L1864) add every file that the revised steps touch

## Not verified
- I did not re-check the other shield expectations in Task 3 (the torpedo test's `shields - 1` and the burst test's `[1, 1, NORTH]`) beyond confirming they now inherit the off-weak freq from open(). Those sections of the diff were not changed.

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the subject at `ea2ca809`. 0 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F5 resolved and raised no new findings.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

