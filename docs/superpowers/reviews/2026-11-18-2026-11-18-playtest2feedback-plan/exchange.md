# Codex review exchange: 2026-11-18-playtest2feedback-plan

Subject: `docs/superpowers/plans/2026-11-18-playtest2feedback.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing e4c97987, effort high, 1139 s, 31773205 in / 31358294 cached / 98408 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 4 misses the replay's held schema, so its own replay test fails and duel replays with the new fields fail to parse
Task 4 adds throttleHeld, rcsX and rcsY to the codec and to both checkpoint schemas. It does not add them to the strict held schema in authority/replay.ts, which validates every recorded tick's input.held. Task 4's test records a held frame with rcsX 1, then expects parseEncounterReplay on that replay not to throw. It will throw on an unrecognized key. In production, any duel replay or recording that holds the new fields will fail to parse. · plan L1137 (Task 4 Files: codec, checkpoint, duelCheckpoint and core only); plan L1192-L1194 (`parseEncounterReplay(duelRules, replay, …)` expected not to throw, and the replay contains '"rcsX":1'); src/renderer/src/authority/replay.ts:L17 (`const held = z.object({ moveX, moveY, interactHeld, face, aim, gunHeld }).strict()`); replay.ts:L22 (tick actions use `z.array(held)`). The spec's list (spec L287-L291) omits it too. · Task 4 Step 6 runs tests/helmWire.test.ts with the 'checkpoints' filter, which matches this test, so the task fails as written. Duel replays from a session with the new held fields would also fail to parse. · Add `src/renderer/src/authority/replay.ts:17` to Task 4's Files and Step 4. Extend its held schema with `throttleHeld`, `rcsX` and `rcsY`, each `z.number().int().min(-1).max(1).optional()`, the same edit as duelCheckpoint.ts. Add it to the self-review's §7 list.

### [P1] R1-F2 Task 10 calls takeSteer() on the shadowed ContactRequests inside pump(), which fails tsc
Task 10 Step 4(e) inserts `const steerNow = requests.takeSteer()` into pump(). Inside pump, `requests` is the local `contact.takeRequests()` result, of type ContactRequests, which shadows the session-level MapRequests. ContactRequests has no takeSteer, so `npx tsc -b` fails with TS2339. · plan L3253 (`const steerNow = requests.takeSteer(), crewHelmSeat = …`); src/renderer/src/app/duel/onlineDuel.ts:L252 (`const k = keyboard.sample(), requests = contact.takeRequests(), heading = requests0();`); onlineDuel.ts:L83 (the outer `requests = createMapRequests()`); onlineDuel.ts:L101 (the existing workaround `requests0 = () => requests.takeHeading()`); src/renderer/src/app/duel/contactController.ts:L28 (ContactRequests: designate, scan, torpStep?, rockLock?, noLaser?); src/renderer/src/app/duel/mapRequests.ts:L10 (takeSteer lives on MapRequests). · Task 10 Step 5's `npx tsc -b` fails, and without this the online crew Helm never steers. · Mirror `requests0`. At session scope, beside `requests0`, add `const takeSteer0 = (): number | null => requests.takeSteer();`, and in pump use `const steerNow = takeSteer0()`. Better still, drain it right after `heading = requests0()` on L252, so a steer is never left stale across the early returns on L260 and L268.

### [P1] R1-F3 Task 3 breaks tests/duelSnapshot.test.ts, which hard-codes the helm module as two values, and does not edit it
Task 3 grows the helm module to six values (interiorAt = helmAt + 6). tests/duelSnapshot.test.ts computes the interior offset as `at + 5 + 4 + 2`, then writes bad values at fieldsAt + k and expects /interior sim version/, /interior layout/ and /crew count/. After Task 3, those writes land on thrMille and rcsGas, and the snapshot is refused with 'thrMille 1000000 is invalid' instead. Task 3 Step 8 edits only duelModules.test.ts and duel.test.ts, but Step 9 runs duelSnapshot.test.ts and expects PASS. This failure is not a trajectory pin, so it cannot go into K, and the plan's rule sends the implementer to 'fix the code'. · plan L1082 (`interiorAt = helmAt + 6`); plan L1111-L1115 (Step 8 edits two test files only); plan L1122 (Step 9 runs tests/duelSnapshot.test.ts); tests/duelSnapshot.test.ts:L109 (`const interiorAt = at + 5 + 4 + 2, fieldsAt = interiorAt;   // … the helm module (Artemis-ii's throttle, Feel-ii's held heading)`); tests/duelSnapshot.test.ts:L115-L117 (the specific regexes). tests/crewOfFourWire.test.ts:L63 hard-codes `+ 4 + 2` too, but its assertions are a bare `toThrow()`, so it still passes. · Task 3 cannot reach a green targeted run as written, and the K rule actively misdirects the fix. · Add to Task 3 Step 8: in tests/duelSnapshot.test.ts:109, replace `at + 5 + 4 + 2` with `at + 5 + 4 + 6`, and extend its comment with 'playtest2feedback §7: thrMille, rcsGas, rcsAcc, compressor'. Optionally fix crewOfFourWire.test.ts:63 the same way, so it keeps testing what it says it does. Add both files to the commit.

### [P2] R1-F4 Task 5 Step 8's file list is incomplete, and duelOnlineView's throttle test breaks in Task 10, which has no migration rule
Step 8 names eight files and says 'Apply these edits, and nothing else'. The same grep also matches tests/duelInputMerge.test.ts, tests/duelOnlineView.test.ts and tests/duelRuntime.test.ts. duelRuntime's throttle asserts (L614, L630) fail in Task 5, and Step 9's catch-all handles them. duelOnlineView.test.ts:L189-L199 ('the Helm seat flies the replica throttle') still passes in Task 5. Task 10 then changes onlineSource.axes() to crewAxes on the Cutter, and that test fails in Task 10 Step 5's run. Task 10 gives no rule to move it to the Valkyrn, and the global rule says to fix the code. · plan L1717-L1719 (the grep and its claimed eight-file listing); grep of tests for `kind: 'throttle'|throttle(`: duelInputMerge.test.ts (4), duelOnlineView.test.ts (4), duelRuntime.test.ts (3), all missing from L1719; tests/duelOnlineView.test.ts:L195 (`expect([source.axes(), source.throttle()]).toEqual([{ turn: 1, thrust: 0.5 }, 2])`); plan L3151 (online axes become crewAxes); plan L3276 (Task 10 runs duelOnlineView.test.ts and expects PASS). · Anything the implementer has to guess is a defect, and here the stated rule points the wrong way. · Correct the Step 8 listing to eleven files. State that duelInputMerge's keyboard-only tests need no edit. Move duelRuntime's throttle `it`s to `createDuelRuntime({ …, cls: ShipClass.Valkyrn })` and duelOnlineView's L189 `it` to a Valkyrn replica now. Or add to Task 10 Step 5 an explicit Decision 17 migration for any online-source test of the notched throttle.

### [P2] R1-F5 The known-red list K can miss crew-trajectory pins and can mask new failures
K is recorded only from the globs in Task 2 Step 10, Task 5 Step 9 and Task 7 Step 8. Task 8's closing run uses globs too, and the first full suite runs in Task 13, after K is closed. Several test files step a Cutter duel or the runtime and match none of these globs: ftlTargeting, ownShipScene, contactScene, shipHudScene, interiorZoomScene and commandUnion. A trajectory pin in one of them first fails in Task 13, which has no rule for it. Also, once a test is in K, later tasks never check that it still fails only on its pinned number. A new exception or a NaN in a K test stays hidden until Task 8. · plan L19 (the K rule); plan L651, L1740, L2331 (the recording globs: duel*, feel*, tactical*, online*, sci*, science*, hunter*, rock*, spike*, asteroid*); plan L2476 (Task 8's closing globs, adding valkyrn*, crew*, helm*); plan L3991 (the first full suite, Task 13); grep of tests for stepDuelTick, scriptedInput or createDuelRuntime: ftlTargeting.test.ts, ownShipScene.test.ts, contactScene.test.ts, shipHudScene.test.ts, interiorZoomScene.test.ts and commandUnion.test.ts are outside every glob. · A real regression from Tasks 2 to 7 could be re-pinned as a moved number, or surface only at the end with no defined handling. · Run `npx electron-vite build` and the full suite in Task 2 Step 10, and again at the end of Task 8 after the re-pin, with K's admission rule. In Tasks 5 and 7, re-run each K test and confirm it fails on the same assertion with only the pinned number moved. Anything else is a bug in that task.

### [P2] R1-F6 If the Task 8 gate cannot be tuned, the whole plan stops, though Tasks 9-13 do not depend on it
Task 8 says that if no knob setting holds the gate, the implementer stops and reports. Tasks 9 to 13 (client, UI, puffs, bless) do not need the gate, and the spike's acceptance is the owner's playtest. The scripted crew also never sends helmPower, so it flies the whole duel at cap 750 (3 + 1). With no drag and a 2.4 s ramp, that makes its bang-bang orbit harder to tune, and the knob list cannot change it. · plan L2447 ('If no setting inside these bounds holds, stop and report the closest summary'); plan L2438-L2446 (the knobs: orbit, slack, evade, avoid, missile gap, MAX_SPEED); plan L1690-L1696 (the scripted crew holds only throttleHeld); spec L232 (round start compressor min(1, HELM_BARS)); spec L390-L391 (the gates are tuned until they pass). · A tuning miss would block delivery of the playable branch for the owner's playtest. · Add a knob 0: the scripted crew sends one `helmPower +1` on its first seated tick, for cap 1000. That is a scripted-pair choice, not a rule change. And if the gate still fails, record the closest summary in the Task 8 commit, mark the scripted-pair gate as an owner-visible known failure, and continue with Tasks 9 to 13.

### [P3] R1-F7 The crew HelmStation's bottom rows sit lower than the existing block's and may clip the 200 px panel
With FONT_NATIVE at 16 px, the gauge's rate text sits at y = barTop + BAR_H + 16 = 698, and the last hint line at y0 + 182 = 696. The panel ends at 708. The existing block's lowest row is at y0 + 170 = 684. · plan L3501-L3502 and L3517; src/renderer/src/render/theme.ts:L22 (FONT_NATIVE = 16); src/renderer/src/render/duel/consoleLayout.ts:L10-L11 (STATION.h.helm 200, stationTop = 720 − 12 − 200); src/renderer/src/ui/duel/HelmStation.tsx:L70 (the lowest existing row at y0 + 170). · This is a cosmetic risk at the owner's look gate. · Move the three hint rows up 12 px (y0 + 138, 154, 170), and put `+rate%/S` beside the percentage rather than below it. Or check it in the Task 13 screenshot.

## Verified
- Drag ships fly bit-identically: today's ax is ((0 + g) + e) + t; the new drag path is ((0 + g) + e) + (0 + t), and 0 + t = t. Reverse r = 1 multiplies exactly, and gx + (0 − p) equals gx − p. turn × 1 × tsp × f is unchanged, and idle is unchanged with rcs absent. Whole levels (−1, ¼, ½, ¾, 1) round to thousandths exactly. The Hunter only sends −1, 0 and 1 (hunter.ts:L95-L105). Task 2's flyShipToday test covers every class, Engines level and Valkyrn level (physics.ts:L29-L59, plan L192-L247).
- Crew thrust loses nothing to the thousandths rounding: crewThrust(m) = m/1000 or 4m/1000 for integer m, so the rounding is exact. The cap follows spec §2's four steps (plan L503-L510).
- Integer gas: compress at 50, 100 and 150 sixtieths gives exactly 1200, 600 and 400 ticks. compress(990, 50, 3) is {993, 20}. The ramp and return pins hold: 994/1000 at 142/143 ticks, −245/−250 at 35/36, and 966, 14 then 0 on release (plan L780-L809).
- Boost far bands: a boosted step is at most floor(acc + 3.56) ≤ 4 whole indices. From |d| ≥ 5 it lands at |d| ≥ 1, and from beyond 4.27 indices (sin 6°) it stays outside AUTO_FACE_SIN (sin 2.5°). It never crosses. BOOST_FACE_SIN = 0.10452846326765347 is sin 6° (hunter.ts:L42-L48, tuning AUTO_FACE_SIN L127).
- Bless guard: Task 1's bump alone passes blessRefusal through both proofs (one version step). Task 13's same-version bless returns undefined without calling the proofs (scripts/golden/blessGuard.ts:L22-L36, scripts/bless-golden.ts:L41).
- Quoted anchors exist verbatim on master: physics.ts L3-L7, L29-L59, L67-L68, L75-L76; duel.ts L7, L13, L26, L34; predict.ts L5, L7, L23, L29-L30, L34; state.ts L168-L169; defs.ts L92, L96, L117; step.ts L33, L146, L240-L241, L253, L292-L294 and the startRound createDuel line L126; modules.ts L63-L69, L98; snapshot.ts L21, L25, L149, L177-L178, L219; duel/state.ts L11, L84, L110; contracts.ts L36, L91; codec.ts L123, L152; checkpoint.ts L40; duelCheckpoint.ts L73; core.ts L329, L435; runtime.ts L14, L31, L176, L231, L239, L255, L331, L431-L433, L518, L521, L548; onlineDuel.ts L26, L28, L100, L199-L201, L273-L275, L300, L307; onlineSource.ts L8, L96, L126, L143, L178; input.ts L5, L38, L105, L111, L124-L125, L140, L148-L149; scene.ts L45, L177, L186, L230, L253, L261, L265, L286, L297, L305; situationModel.ts L11, L120-L121, L187, L205; consoleModel.ts L12, L23-L24, L63, L96, L109; HelmStation.tsx L6, L27; telemetry.ts L13, L132-L135; scripted.ts L17, L24-L25, L105, L318-L321; hunter.ts L30-L33; duelMode.ts L55, L70; soundBank.ts L18; duelAudio.ts L9, L27, L33, L54, L66.
- Interfaces exist with the assumed shapes: createSeatedDuel forwards Parameters<typeof createDuel>, so opts reach it (tests/helpers/duelSeat.ts:L16). IDLE_INPUT has helm: true (weapons.ts:L41). createTacticalState(seed, slots, crewClass) (state.ts:L234). CREW_SLOT is exported. nearestHeading is in tactical/lead.ts. scriptedPilot already imports aimTurn from step. liveDuel exposes core, state.duel, held, command and tick. core.replay() and captureCheckpoint() exist. createMapRequests has takeSteer. Button emits data-ui-refused and fires onPress or onHold on pointerdown. PixelText exposes data-text. keyLabel maps Digit1 to '1'.
- Key conflicts at the crew Helm: E (interact) and Q (prevLock) presses are ignored by the runtime's and the session's helm branches, which return before the laser-lock path. The contact intercept takes Digit1 and Digit2 only at Weapons and Flight. The camera input reads no movement keys (runtime.ts:L95-L118, contactController.ts:L135-L149).
- The online prediction is consistent: duelClient.held sends a frame and returns a sequence on every call (clientControl/duelClient.ts:L70-L77). pump's `p` is the publication carrying heldHighWater (onlineDuel.ts:L256, L177). The authority stores held objects whole, so the new fields reach the sim (core.ts:L321, L329).
- Ordering: no task consumes a later task's product. Task 4's ramp-dependent test is excluded by the -t filter until Task 5. The other cross-task interfaces line up (Task 7 crewAxes feeds Tasks 9 and 10; Task 9 DuelViewSource.thrMille feeds Task 10; Task 9 crewHelmMap feeds Task 12).
- The HelmStation layout fits the block's width: the right column's longest line, 23 chars at a 6 px advance, ends at x 290 inside 312; the divider is at x 142; the power cells end by x 236 (theme.ts advance 6; consoleLayout.ts STATION).
- The parallel work is avoided: newtonianHelm is spread over shipClass(...) rather than added as a positional parameter, and Task 1 reads N at run time. Master is still at SIM_VERSION 54 (tuning.ts:L7), and shipClass's signature is unchanged (defs.ts:L88).

## Not verified
- Whether the scripted crew can actually be tuned to the 180-300 s gate. That needs running scripts/duel-telemetry.ts, which is outside read-only.
- Whether the long scripted or held sims in the new tests stay clear of the planet and rocks. These are crewThrottle's 143+30+120-tick unattended test, crewThrusters' 1200-tick refill on seed 5, and crewSteering's settle runs. Not run, because the Jest/Vitest suite is off-limits.
- Which existing tests will land in K, and by how much their numbers move. That can only be known by running them.
- Whether tests/fixtures/determinism-v2.json stays byte-identical after Task 13's same-version bless. It contains contentDigest fields, and I did not trace how its checkpoints' digests are validated.
- The exact ConsoleView and duelConsoleModel literals, and whether tests/settingsAndControls.test.ts's `sections[0]` excludes the Valkyrn Flight row (controlsList.ts:L71, 'Shift+W' inside a longer keys string).
- Whether tests/helpers/checkpointRig's `authority.checkpoint([])` and validateCheckpoint(LAYOUT, cp, DIGEST) match the call shapes Task 4's sector-checkpoint test uses.
- I read some files beyond the manifest to confirm findings: authority/replay.ts, contactController.ts, mapRequests.ts, flightPointer.ts, consoleLayout.ts, theme.ts, Button.tsx, tests/duelSnapshot.test.ts, tests/duelThrottle.test.ts, tests/duelOracle.test.ts, scripts/determinism/bless.ts and scripts/bless-golden.ts.
- I did not run `npx tsc --noEmit`: no shell tool was available in this session. The tsc findings come from reading the source.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `fd6f0e0b`. 7 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 4 misses the replay's held schema

Confirmed: `authority/replay.ts` L17 is a strict held object without the new keys. Task 4 now edits it (Files, a Step 4 edit, a grep check that every `gunHeld` schema carries `rcsY`, and git add).

## R1-F2 [P1]: Task 10 calls takeSteer() on the shadowed ContactRequests

Confirmed: `onlineDuel.ts` L252 shadows `requests` with `contact.takeRequests()`, and L101's `requests0` is the existing workaround. Task 10 (c2) adds `takeSteer0` beside `requests0` and drains it at the top of pump as `steerTaken`, before any early return. Step 4(e) uses `steerTaken`.

## R1-F3 [P1]: Task 3 breaks tests/duelSnapshot.test.ts

Confirmed: `tests/duelSnapshot.test.ts` L109 has `at + 5 + 4 + 2`, and `crewOfFourWire.test.ts` L63 has `+ 4 + 2`. Task 3 Step 8 (c) and (d) change both to `+ 6`. Both files are run in Step 9 and staged.

## R1-F4 [P2]: Task 5 Step 8's file list is incomplete

Confirmed: the grep also matches `duelInputMerge`, `duelOnlineView` and `duelRuntime`. Step 8 now lists eleven files:
- `duelInputMerge` needs no edit (notch keys only);
- `duelRuntime`'s throttle tests use `cls: ShipClass.Valkyrn` (the runtime takes `cls`, runtime.ts L170);
- `duelOnlineView`'s L189 test builds a Valkyrn replica now, so Task 10 doesn't break it.

## R1-F5 [P2]: The known-red list K can miss pins and mask failures

Confirmed: the six named files are outside every glob. Changes:
- Task 2 Step 10 and the end of Task 8 now run the full suite after `electron-vite build`.
- A new global rule: Tasks 5 and 7 re-run every K test and confirm it fails on the same assertion with only the pinned number moved. Anything else is a bug in that task.

## R1-F6 [P2]: If the Task 8 gate cannot be tuned, the whole plan stops

Confirmed: plan L2447 stopped the plan. Changes:
- Knob 0 has the scripted crew send one `helmPower +1` on its first seated tick, for cap 1000.
- If no setting holds, the scripted-pair gate becomes `describe.skip`, with an owner-visible comment and the closest summary in the commit, and Tasks 9 to 13 continue. The spike's acceptance is the owner's playtest.

## R1-F7 [P3]: The HelmStation's bottom rows may clip the 200 px panel

Confirmed by the y arithmetic. Changes:
- The refill rate moves into the power line (`ENGINE 3  COMPRESS 1  +5%/S`).
- AUTO-FACE moves to y0 + 118.
- The hints become two rows, at y0 + 150 and y0 + 170, which matches the existing block's lowest row. RMB HEADING stays in the controls list.
- The UI test's expected text is updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-playtest2feedback.md

<!-- end -->

---

# Round 2 (delta, reviewing 2a892825, effort medium, 104 s, 699828 in / 654063 cached / 9256 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Knob 0's trigger tick can fall while the scripted Helm is still standing, so the helmPower is refused and never re-sent
Knob 0 sends helmPower +1 only when `d.tactical.tick === d.baseTick + 1`. The scripted crew does not start a round seated. Its Helm walks to its console and sends `sit` when canSit holds. It also stands up to repair, then walks back and re-sits. If the Helm is not seated at baseTick + 1, the sim refuses that one command and the condition never comes true again, so knob 0 silently does nothing. The plan also hedges with 'match the existing "first seated tick" idiom in that function if one exists', but scripted.ts has no such idiom. · plan L2457 (the knob 0 text with `d.tactical.tick === d.baseTick + 1` and 'if one exists'); src/renderer/src/sim/duel/scripted.ts:L290-L311 (stand for repair, walk back, `cmds[pid]!.push({ kind: 'sit', station: own })`); scripted.ts:L315 (`if (seat === d.nav) {`, the only seated branch); grep of scripted.ts for baseTick/first seated: no match; tests/duelRuntime.test.ts:L59 ('createDuel now leaves both standing'). · The knob the plan says to try first may be a no-op, and the implementer has to guess the seated idiom. That is the kind of 'check at execution' the plan bans. · Drop the tick test and the 'if one exists' hedge. Inside the existing `if (seat === d.nav) {` branch of scriptedInput, push `{ kind: 'helmPower', delta: 1 }` whenever `d.compressor > 0`. This limits itself: once applied, compressor is 0. It also fires on the first seated tick of every round and after every re-sit.

### [P3] R2-F2 The new power line 'ENGINE n  COMPRESS n  +r%/S' reaches past the 300 px panel once the rate has two digits
With m5x7 advances at 16 px, 'ENGINE 3  COMPRESS 1  +5%/S' is 156 px wide. Drawn at rx = STATION.x + 140 = 152, it ends at x 308. The panel's right edge is at x 312. At compressor 3 the rate is 15, which the plan's own consoleModel test expects, and the text then ends at 314. A fractional COMPRESSOR_RATE/10 such as 12.5 would make it wider still. · plan L3539 (the merged power line); plan L3382 (`compressor: 3, rate: 15`); plan L3455 (`rate: COMPRESSOR_RATE[d.compressor]! / 10`); src/renderer/src/render/theme.ts:L31-L37 (advances: letters 6, M 8, space 5, % 6, / 4); src/renderer/src/render/duel/consoleLayout.ts:L10 (STATION x 12, w 300); src/renderer/src/ui/duel/HelmStation.tsx:L29 (rx = STATION.x + 140). · It overflows the panel's border by a few pixels at the owner's look gate. · Use single spaces ('ENGINE 3 COMPRESS 1 +15%/S', 151 px at a rate of 15), or abbreviate to 'COMP'. Also state that COMPRESSOR_RATE values are multiples of 10, so the rate is always an integer.

## Prior findings
- R1-F1: resolved — Task 4 now lists replay.ts:17 and gives the insert after `gunHeld: z.boolean().optional()` with a leading comma. That matches replay.ts:L17 exactly, and the object stays .strict(). It also adds a git grep check and the git add.
- R1-F2: resolved — (c2) quotes onlineDuel.ts:L101 and L252 verbatim. takeSteer0 closes over the session-level MapRequests, and steerTaken is drained before any early return. Step 4(e) uses steerTaken.
- R1-F3: resolved — (c) and (d) quote tests/duelSnapshot.test.ts:L109 and tests/crewOfFourWire.test.ts:L63 verbatim (both have `+ 4 + 2`). Both files are in Step 9's run and in git add.
- R1-F4: still open — duelInputMerge and duelOnlineView are handled. duelOnlineView.test.ts:L190 matches the quoted text, and the file has no ShipClass import, which the 'add if missing' rule covers. But 2c says to add `cls: ShipClass.Valkyrn` to 'that createDuelRuntime({ … }) call'. In tests/duelRuntime.test.ts the only call is inside the shared `rig()` helper (L48-L58), and every test in the file uses it. Taken literally, the whole file flies the Valkyrn. Otherwise the implementer has to invent a parameter. Fix: give rig a trailing `cls?: number` passed through as `cls`, and in the L101 test and the five `it`s of the L610 describe call `rig(5, undefined, true, ShipClass.Valkyrn)`.
- R1-F5: resolved — Task 2 Step 10 (L652) and the end of Task 8 (L2494) now run electron-vite build and the full suite. A new global rule at L20 has Tasks 5 and 7 re-run the K tests and check that each fails on the same assertion.
- R1-F6: resolved — Knob 0 was added. A failed gate now becomes describe.skip with an owner-visible comment and a 'Gate NOT met:' commit note, and Tasks 9-13 continue. The knob's trigger condition has its own new P2 above.
- R1-F7: resolved — The rate moved into the power line, AUTO-FACE is at y0 + 118, and the hints are at y0 + 150 and 170, matching the existing lowest row at HelmStation.tsx:L70. The local hint takes `readonly string[]` (plan L3509), so the array calls type-check, and the test at L3394 is updated. The new line's width is a separate P3.

## Verified
- replay.ts:L17's held object ends with `gunHeld: z.boolean().optional() }).strict()`, so the plan's insert lands inside the object.
- onlineDuel.ts:L101 and L252 match the plan's quoted replace anchors exactly.
- duelSnapshot.test.ts:L109 and crewOfFourWire.test.ts:L63 match the quoted anchors exactly.
- runtime.ts:L170 has `cls?: number`, and L252 passes deps.cls to createDuel.
- duelOnlineView.test.ts:L189-L190 match the quoted it name and its createSeatedDuel line.
- duelRuntime.test.ts:L102 and L610 hold the throttle tests the plan names.
- Plan L3509 defines a local hint over `readonly string[]`, so the array calls at L3543-L3544 type-check.
- Sign of helmPower: an engine cell click sends -1, so delta is the engine's change, and +1 gives 4 + 0 as knob 0 says.

## Not verified
- Whether the sim's helmPower handler refuses a command from a standing Helm. I inferred it from the spec's seat rules and did not read the Task 5 code for it.
- The value table of COMPRESSOR_RATE, beyond the plan's own test values 5 and 15.
- I did not run tsc or any tests (read-only review).

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `2a892825`. Verdict ready with P2s. 2 accepted, 0 rejected, 0 deferred, plus R1-F4 reopened and fixed again. The reviewer confirmed R1-F1 to R1-F3 and R1-F5 to R1-F7 as resolved.

## R1-F4 [P2]: Task 5 Step 8's file list (reopened)

Confirmed: `tests/duelRuntime.test.ts` L48-L58 has a single shared `rig()`. Step 8 2c now gives `rig` a trailing `cls?: number`, passed through to `createDuelRuntime`. Only the L101 test and the L610 describe's tests call `rig(5, undefined, true, ShipClass.Valkyrn)`.

## R2-F1 [P2]: Knob 0's trigger tick can fall while the scripted Helm is standing

Confirmed: scripted.ts has no baseTick idiom. The sit is sent at L290-L311, and L315 is the only seated branch. Knob 0 now pushes `helmPower +1` inside `if (seat === d.nav)` whenever `d.compressor > 0`. It limits itself, and it re-fires after a re-sit or a new round.

## R2-F2 [P3]: The power line can pass the panel's right edge

Confirmed by the advance arithmetic. The line is now `ENGINE n COMP n +r%/S`. Decision 16 states that `COMPRESSOR_RATE` values are multiples of 10, so the rate is an integer of at most 15. The UI test's expected text is updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-playtest2feedback.md

<!-- end -->

---

