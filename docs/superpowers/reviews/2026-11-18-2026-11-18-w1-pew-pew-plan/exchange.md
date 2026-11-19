# Codex review exchange: 2026-11-18-w1-pew-pew-plan

Subject: `docs/superpowers/plans/2026-11-18-w1-pew-pew.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing f52b8386, effort high, 1034 s, 22862800 in / 22521365 cached / 76879 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 4 changes shipModule.commands, but tests/ftlTargeting.test.ts pins the old list and no task updates it
Task 4 Step 3(c) appends 'pewFire' to shipModule.commands. tests/ftlTargeting.test.ts:169 asserts the exact old list, ['laserLock', 'torpLock', 'laserCharge', 'missileLaunch']. Task 4 neither edits that test nor runs it. Task 5 Step 6 then runs the `ftlTargeting` filter, which fails, and that failure is neither of the two kinds its triage allows: (a) a trajectory pin, or (b) another weapon's numbers moved by the Hunter's pew. · plan L1234 (shipModule.commands gains 'pewFire'); plan L1292 (Task 4's test list has no ftlTargeting); plan L1552-1557 (Task 5's run includes ftlTargeting and its triage has only kinds (a) and (b)); tests/ftlTargeting.test.ts:L169 `expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'laserCharge', 'missileLaunch'])` · Task 4 commits with a red test it never ran. The Task 5 subagent then hits a failure its instructions give no way to resolve. · In Task 4 Step 5, add (c): tests/ftlTargeting.test.ts line 169 becomes `expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'laserCharge', 'missileLaunch', 'pewFire']);   // W-1`. Add tests/ftlTargeting.test.ts to Task 4 Step 6's run and to Step 7's `git add`.

### [P1] R1-F2 Clicks on the console blocks reach the canvas, so clicking the Weapons panel or the new PEW row fires a round
Decision 8 says the cards and the contact window take their own pointer events. That is true only of the elements styled `pointerEvents: 'auto'`: Buttons, the card hit boxes, HelmStation's throttle box and the contact window. The Stage root is `pointerEvents: 'none'`, and that is inherited by the Panel backgrounds, every PixelText, the status table, the tab strip gaps, the side column and the new PEW row and pips (Task 9 adds no pointer capture to them). The pointer source listens on the canvas and records any button-0 press as a click. Task 8's pewClick only checks `onMap && station === 'weapons'`, so a press anywhere on the Weapons block that is not a button fires a pew toward the bottom-left, clamped into the cone. That includes clicking the PEW card itself. The Flight seat already filters these blocks for exactly this reason (flightPointer's BLOCKS). · plan L35 (Decision 8's claim); plan L2207-2211 (pewClick has no over-a-block check); plan L2545-2550 (PEW row: Box/PixelText only); src/renderer/src/ui/stage/Stage.tsx:L7 (`pointerEvents: 'none'`); src/renderer/src/ui/duel/WeaponsStation.tsx:L52 and src/renderer/src/ui/stage/Button.tsx:L60 (only these are 'auto'); src/renderer/src/app/duel/duelMode.ts:L58 (pointer source on the canvas); src/renderer/src/app/duel/input.ts:L227 (any button-0 pointerdown becomes `click`); src/renderer/src/app/duel/flightPointer.ts:L9-23 (`inside`/BLOCKS filter for the Flight map) · This is hit in ordinary play: a gunner who clicks the PEW card, its pips, or just misses the FIRE/LAUNCH buttons spends a third and fires a stray round. Every such round is also a crew shot that turns the holding Hunter hostile. · In Task 8 Step 5, add `&& overOpenWeaponsMap(click, shown)` to pewClick. Write that helper beside flightPointer's BLOCKS (or export a shared one) covering TABS, STATUS (its height from the readout rows), SIDE/SIDE_H, the Weapons STATION rect from stationTop('weapons') and, while shown, CONTACT. A click over a block falls through to today's contact.click path. Add a pewInput or contactScene test: a click at weaponCard('laser').y - 10 (on the PEW row) queues no pew.

### [P1] R1-F3 Moving a Task 6 tuning knob breaks constants pinned in tests/pewHunter.test.ts, and Task 6 never updates that file
Task 6 Step 4 may change HUNTER_PEW_ERROR (4 → 6 → 8), HUNTER_PEW_GAP (12 → 20) and HUNTER_PD_CHANCE (0.5 → 0.3/0.8). Task 5's test pins the derived values: HUNTER_PEW_ERROR_STEPS 728, HUNTER_PD_ODDS 120 and HUNTER_PEW_GAP 12. Its pinned PD_SEED and the 0.02..0.6 rate band also depend on those knobs. Task 6 Step 6 runs tests/pewHunter.test.ts and expects PASS, but has no step to re-pin it, and the file is not in Task 6's `git add`. · plan L1361 (`toBe(728)`, `toBe(120)`, `toBe(12)`); plan L1357, L1409 (PD_SEED pinned from the console line); plan L1663-1666 (the knobs Task 6 may move); plan L1740 (pewHunter.test.ts in Task 6's PASS run); plan L1749 (git add lacks tests/pewHunter.test.ts) · In every tuning branch that moves a knob, Task 6's own verification cannot pass as written, and the subagent has no rule for what to change. · Make the first assertion derive from the knobs: `expect(HUNTER_PEW_ERROR_STEPS).toBe(Math.floor((HUNTER_PEW_ERROR / 360) * AIM_STEPS)); expect(HUNTER_PD_ODDS).toBe(Math.round(1 / (HUNTER_PD_CHANCE * DT)));` and drop the literal HUNTER_PEW_GAP pin. Alternatively, add a Task 6 Step 6 bullet: 'if any knob moved, update tests/pewHunter.test.ts's pinned numbers and re-pin PD_SEED from its printed line (Task 5 Step 5's rule)', and add the file to Step 7's git add.

### [P2] R1-F4 Task 5's 'The imports become' block drops hunter.ts's existing ./science and ./weapons imports
hunter.ts imports `enemyHostile` from './science' and `canLaunch, laserEligible, laserFull, type ShipInput` from './weapons', on lines 14-15, after the tuning import. Task 5 Step 4(a) gives the complete new import block and neither line is in it. A subagent that replaces the import block verbatim removes them, and tsc fails on enemyHostile, canLaunch, laserEligible, laserFull and ShipInput. · plan L1458-1471 (the replacement import block ends at the tuning import); src/renderer/src/sim/tactical/hunter.ts:L14-15 (the two imports it omits) · The plan is executed verbatim, and as written this step does not compile. · Append the two lines to the block in plan L1460-1471: `import { enemyHostile } from './science';` and `import { canLaunch, laserEligible, laserFull, type ShipInput } from './weapons';`. Or reword (a) as 'replace lines 5-13 (through the tuning import); lines 14-15 stay'.

### [P2] R1-F5 Task 9's duelSounds insertion only compiles if placed before gunHit's closing brace, and the step does not say so
The inserted text starts with `} else if (e.kind === 'pewFire') {` and ends without a closing brace, so it relies on gunHit's existing `}` on duelSounds.ts:37 to close pewHit. The step says to insert it 'after the gunHit branch (before `if (hitsCrew(e))`)'. Read literally, that is after line 37's `}`, which gives `}\n} else if`, a syntax error. · plan L2574-2585; src/renderer/src/audio/duelSounds.ts:L34-38 · Two implementers would place this differently, and one placement does not parse. · Give the replacement whole: lines 34-37 (`} else if (e.kind === 'gunHit') { ... }`) become the gunHit branch followed by the pewFire and pewHit branches, ending in `}`. Or say 'insert between line 36 and the `}` on line 37'.

### [P2] R1-F6 Task 6's tuning ladder has no stop rule for the Hound, misstates which knobs act on the Valkyrn, and re-pins only five named tests
(1) After knob 5, a Hound that still fails has no instruction; only the Valkyrn branch says 'stop and report'. (2) Item 6 says HUNTER_PEW_ERROR is 'the only knob both share'. But HUNTER_PEW_GAP and HUNTER_PD_CHANCE also act on the Valkyrn duel: the Hunter's attack and point defence run against any crew class, including the Valkyrn's torpedo. (3) Step 6 re-pins only the five named files. A different trajectory pin that Task 5 Step 6 lists as kind (a) (it asks for 'the kind (a) list' in the commit body) has no re-pin step anywhere. (4) There is no fallback if no seed 1..10 sends exactly the six kinds that duelScripted needs. · plan L1662-1667; plan L1554, L1557, L1564 (Task 5's kind (a) list); plan L1731-1736 (only five files re-pinned); src/renderer/src/sim/tactical/hunter.ts:L84-121 (hunterThink is class-agnostic, so the Hunter's pew fires at the Valkyrn) · The brief requires concrete knobs and a concrete stop rule. As written, a failing Hound gate, or an unlisted pinned test, leaves the subagent guessing. · Add: 'if the Hound still fails after knob 5, stop and report the recorded lines'. Correct item 6 to name every knob that acts on the Valkyrn (HUNTER_PEW_ERROR, HUNTER_PEW_GAP, HUNTER_PD_CHANCE). Add to Step 6: 're-pin every kind (a) test listed in Task 5's commit body by the same rule (keep the assertion, update the value, add the history note)'. For duelScripted: 'if no seed qualifies, assert that the kinds include pewFire and stop and report'.

### [P2] R1-F7 Task 10's `npm run test:determinism` never runs a duel, so it does not prove the pew deterministic across runtimes
The determinism harness replays only the sector fixture (variants hound-2 and hound-3); nothing under scripts/determinism mentions the duel. The new pew math (dirBetween's sqrt, segmentEntry, interceptTime, the Hunter's rng draws) therefore gets no Node/Electron/Firefox comparison. Task 10 Step 3 and the self-review present this run as the spec's cross-runtime check. · plan L2649-2652, L2691 ('Determinism on Node, Electron, Firefox (Task 10)'); tests/determinismHarness.test.ts:L44-45 (variants hound-2/hound-3 only); Grep 'duel|Duel' in scripts/determinism/ finds no files; spec L128 · The brief requires bit-determinism across the three runtimes, and the plan reports it as verified when the step cannot fail on a pew desync. · Either state in Task 10 that test:determinism covers only the sector, so the duel's cross-runtime guarantee rests on the guard rules (only + − × ÷ and sqrt), and report it as not verified. Or add a step that runs the scripted duel golden (runDuel at DUEL_GOLDEN_SEED) in the Electron and Firefox pages and compares its hashes with Node's.

### [P3] R1-F8 The Weapons help text and sit card never mention the left-click pew
Task 8 adds the Settings row, but the in-game help for the Weapons seat stays '1/2 PICK WEAPON, CLICK ROOM', and the sit card still reads 'WEAPONS: CLICK A WEAPON, THEN A ROOM'. The primary weapon is then discoverable only from the PEW row's 'L-CLICK MAP' hint. · src/renderer/src/render/duel/readoutModel.ts:L168; src/renderer/src/render/duel/sitModel.ts:L17; plan L2550 · A new primary weapon whose control is listed only in Settings and in a small hint is easy to miss in the owner's playtest. · Add 'L-CLICK MAP PEW' to the weapons help list and the sit card's keys in Task 8 or Task 9, and update their tests.

## Verified
- Task 2's quoted edit sites exist as quoted: state.ts systemsFor/emptySystems/hunterFor/createTacticalState (state.ts:L172-233), the hash.ts SYSTEMS_TAIL/HUNTER_HEAD/roundFields/spaceFields/clone/systemsRules/topRules/validator round branch (hash.ts:L21-37, L68-82, L104, L194-196, L221-242, L258, L277-282), the placeRound and private segmentEntry in gun.ts (L15-21, L57), IDLE_INPUT/UNCREWED_INPUT and the applyWeaponsInput/tickWeapons anchors (weapons.ts:L34-36, L140, L156, L172), the hunter.ts input literal (L90) and the step.ts crew literal (L208-209)
- Task 2's test arithmetic checks out: clampAim's five expected values (e.g. 250/100·256 → 9386), the charge sequences (fires at 0, 1, 2 then 60·n), and part=90 → 31 given that applyWeaponsInput runs before tickWeapons (duel.ts:L30, L37). The validator messages match the regexes ('active is not 0 or 1', 'its owner is not an active ship slot', 'a free entry holds values', 'age out of range')
- The tacticalDeterminism length formula moves from 7→9 hunter scalars and 37→40 per-slot systems scalars, and the sorted key lists put 'pew' after 'outcome' and the pew counters after 'missilesLost' (tests/tacticalDeterminism.test.ts:L115-123). valkyrnClasses.test.ts:L44/46 are the only slots literals
- Determinism guard: allowed Math is abs/ceil/floor/round/min/max/sign/imul/sqrt (tests/helpers/determinismGuard.ts:L3). The new sim code uses only floor, round, abs, sqrt (via dirBetween/interceptTime/segmentEntry), the heading tables and nextInt
- missiles.ts `end` takes an EndCause derived from DuelEvent, counts missilesLost for non-'ship' causes and clears torpRoom (missiles.ts:L13, L28-33), so shootDown with 'shot' gives the event and loss the Task 3 test expects. The planet is at (0,0) with r 70 (map.ts:L104, tuning.ts:L13). The telemetry edit's narrowing to MissileLoss type-checks
- hostilityStep's lines match Task 3's replacement (science.ts:L38-40). TERMINAL_CAUSES feeds zod enums in codec.ts:L99, duelRecord.ts:L27 and duelCheckpoint.ts:L45, so appending 'pew' keeps old records parsing
- Task 4: the WEAPON_ORDER/DUEL_KINDS lines and the admission loop match step.ts:L30-32, L210-221. The duelWire commands list and the `.strict()` style match codec.ts:L111-128, and encodeMessage parses, so bad commands throw. DuelCommand lives in contracts.ts:L74-98 and is re-exported by sim/duel/commands.ts:L5. duelCheckpoint.test.ts:L141-147 needs the pewFire example, as planned. The authority enumerates no command kinds
- Task 4 test helpers exist: CUTTER (tests/helpers/scriptedDuel.ts:L16), createSeatedValkyrn seating the pilot at the shared Flight seat (tests/helpers/valkyrnDuel.ts:L28-34), sitDown (sim/stations.ts:L31)
- Task 5: hunterThink's early returns (hostility hold at L91, unattended Weapons at L109) and the final return (L120) are where the plan places hunterPew. interceptTime/nearestHeading have the assumed signatures (lead.ts:L10, L35). hunterThink is called only from stepDuel (duel.ts:L28), so the new rng draws happen once per tick in a fixed order. The tactical rng is otherwise used only by the laser jitter (hunter.ts:L115) and creation-time draws. MISSILE_RANGE 360 and LASER_RANGE 450 mean the defence scenario's crew at 500 draws no Hunter torpedo or laser. HUNTER_PD_ODDS=120 and HUNTER_PEW_ERROR_STEPS=728 as computed
- Bless sequence: blessRefusal allows a one-step bump only after both proofs, and a same-version bless with no proofs (scripts/golden/blessGuard.ts:L22-36). bless-golden stages all four artifacts (scripts/bless-golden.ts:L38-64). The determinism fixture's same-version message is 're-executed' and it stores no content digest (scripts/determinism/bless.ts:L33-56). The goldenRefusal ties baseline to stored golden (duelOracle.ts:L315-325). Task 1 then Task 10 is consistent
- Known-red window: only golden.test/duelGolden/duelRematchGolden read the pinned goldens, and determinismHarness reads only the sector fixture. Per-task targeted lists exclude them, and scienceState/duelThrottle alias-plan tests stay green with new fields (they subtract only their own fields)
- Task 7 anchors exist: weaponsModel's ARC_HALF, ArcDraw shape, CombatDraw rounds member, CombatModelInput flight, the ownS/z/toS/cls locals and the final return (weaponsModel.ts:L26-29, L71, L105, L136-139, L257). The tacticalLayer rounds line (tacticalLayer.ts:L337), fxModel's SPARK_S/POP_S/float/startShake/pushGunHits (fxModel.ts:L16-22, L62-110), and onlineSource's Counters/duelCounters/gapEvents gunHit loop (onlineSource.ts:L31-37, L80) are all present. fineHeadingOf's expected values check out
- Task 8 anchors exist: scene.ts click block (L180-182) with screenToWorld/interpolatedShip/Outcome/classOf/CREW_SLOT/overlay.layerPaused/options.pointer in scope; runtime.ts play/refuse/queue/launchWhy/frame lines (L264, L335, L362, L461-463, L489-498) and isWeaponsCommand (L236); onlineDuel.ts requests0/play/pump/send (L101, L191, L242-250, L268); situationModel RefusedControl/refusal (L174-193); the controlsList mouse rows (controlsList.ts:L53-55). contactController.click only toggles the window, and TargetingLine cancels only on the right button, so leaving the click to contact.click while a weapon is picked up keeps room targeting
- Helm, Science and Flight are untouched by pewClick (it requires station==='weapons' && view==='weapons'). The Science map click (scienceInput.test.ts:L141-150) still routes to contact.click
- Task 9: SFX has 50 effect files before and after (laserSmall 5 → 3 + pew 2). audio-manifest.ts regenerates from the SFX table in table order (scripts/audio-manifest.ts:L18-30). `npm run credits` is scripts/gen-credits.ts. audioEngine's 'decoded 47/50' stays valid. CRT.faint exists (crtTheme.ts:L6). Box takes attrs (WeaponsStation.tsx:L49). The status table (13 rows in console weapons mode, 42+16+24·13=370) still ends above the new top of 464
- Every test file named in the plan's run lists exists (Glob)

## Not verified
- Whether tests outside the plan's targeted lists (e.g. duelRounds.test.ts, duelTelemetry.test.ts, duel.test.ts, onlineDuel*/authority* duel tests) pin whole-duel numbers that the Hunter's pew moves. They would surface only in Task 10's full suite, which has no triage step. I did not read them
- That the Task 5 defence scenario's shot rate actually lands in 0.02..0.6 (estimated about 0.1, from 1/120 per tick over about 40 ticks and the ±4° error against a 4 u torpedo). It cannot be confirmed without running it
- That the Task 5 burst test's crew survives 260 ticks of Hunter fire (if the round ends early, at[3] is undefined)
- The exact output strings that Task 1 Step 2/4 and Task 10 expect from canonical-trace.ts and duel-oracle.ts (not read)
- pewUi.test.tsx's DuelUiView/ConsoleView literal shape against ui/views.ts and the UiRoot render path (not read in detail)
- Whether tacticalLayer.test.ts or crtColours.test.ts count strokes or colours in a way that the new cone, aim and streak draws change
- duelMode.ts:L60-66, where Task 8 adds takePew to the runtime deps (not opened)

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `a3538f12`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 4 changes shipModule.commands, but tests/ftlTargeting.test.ts pins the old list and no task updates it

Confirmed: tests/ftlTargeting.test.ts:169 pins the four-command list. Task 4 Step 5(c) now appends 'pewFire' there, and the file is in Step 6's run and Step 7's git add.

## R1-F2 [P1]: Clicks on the console blocks reach the canvas, so clicking the Weapons panel or the new PEW row fires a round

Confirmed: Stage.tsx:7 is `pointerEvents: 'none'`, and flightPointer.ts:9-23 already filters the blocks for the Flight seat. Task 8 adds an exported `onWeaponsMap(p, contactShown, statusRows)` beside `onFlightMap`, covering the tab strip, side column, status table (its height from the readout rows), the Weapons block, and CONTACT while it is shown. pewClick requires it, a click over a block falls through to today's path, and a test checks that a click on the PEW row queues no pew.

## R1-F3 [P1]: Moving a Task 6 tuning knob breaks constants pinned in tests/pewHunter.test.ts, and Task 6 never updates that file

Confirmed. Task 5's assertions now derive from HUNTER_PEW_ERROR and HUNTER_PD_CHANCE, and the literal gap pin is dropped. Task 6 Step 6 re-pins PD_SEED by Task 5's rule, and the file is in its git add.

## R1-F4 [P2]: Task 5's 'The imports become' block drops hunter.ts's existing ./science and ./weapons imports

Confirmed: hunter.ts:14-15. Both imports are now in the replacement block.

## R1-F5 [P2]: Task 9's duelSounds insertion only compiles if placed before gunHit's closing brace, and the step does not say so

Confirmed: duelSounds.ts:34-37. Task 9 now gives the whole replacement for those lines.

## R1-F6 [P2]: Task 6's tuning ladder has no stop rule for the Hound, misstates which knobs act on the Valkyrn, and re-pins only five named tests

Confirmed: hunterThink is class-agnostic (hunter.ts:84-121). Task 6 now has:
- a stop-and-report rule for the Hound;
- every knob that acts on the Valkyrn named;
- a re-pin of every kind (a) test from Task 5's commit body;
- a duelScripted fallback for when no seed qualifies.

## R1-F7 [P2]: Task 10's `npm run test:determinism` never runs a duel, so it does not prove the pew deterministic across runtimes

Confirmed: there is no duel in scripts/determinism. Task 10 and the self-review now state that the run covers the sector only. The duel's cross-runtime determinism rests on the guard rules and the Node goldens, and the final report lists it as not verified across runtimes. A new cross-runtime duel harness is out of this part's scope.

## R1-F8 [P3]: The Weapons help text and sit card never mention the left-click pew

Confirmed: readoutModel.ts:168 and sitModel.ts:17. Task 8 Step 8(b) adds the L-CLICK MAP PEW wording to both and updates duelReadout.test.ts and feelPresentation.test.ts.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-w1-pew-pew.md

<!-- end -->

---

