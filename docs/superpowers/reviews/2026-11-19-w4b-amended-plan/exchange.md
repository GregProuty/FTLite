# Codex review exchange: w4b-amended-plan

Subject: `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing b7ec9d22, effort high, 878 s, 24134299 in / 23742931 cached / 61688 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 8 breaks tests/valkyrnRounds.test.ts:58, which Step 10 runs and expects to PASS
Task 8 gives `emptyRound()` a `room: 0` member, and `stepRounds` empties an ended entry with `Object.assign(r, emptyRound())`. `tests/valkyrnRounds.test.ts:58` pins the emptied entry with an exact `toEqual({ x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false })`. Vitest's `toEqual` ignores only undefined properties, so the received `room: 0` makes the check fail. Task 8 does not list this file among its kind (a) edits (Files: w4PewFire, w4Autocannon, engineeringFog, pewUi, pewViews, pewRounds), yet Step 10 runs it and expects all PASS. It is also the only exact round-entry pin in `tests/`: I grepped for round literals and `toEqual({ x:` and found no other. · plan L2428 (`emptyRound` gains `room: 0`); plan L2128 (kind (a) list without valkyrnRounds); plan L2722-L2723 (Step 10 runs `tests/valkyrnRounds.test.ts`, expects all PASS); .worktrees/w4/tests/valkyrnRounds.test.ts:L57-L58; .worktrees/w4/src/renderer/src/sim/tactical/gun.ts:L176 (`Object.assign(r, emptyRound())`) · A test the plan says will pass cannot pass. It is a Valkyrn test sitting next to the fence list, so one implementer would treat it as untouchable and stop, and another would rewrite it without a citation. · In Task 8 Step 8, add `tests/valkyrnRounds.test.ts` as a kind (a) edit citing W-4 amendment §3.3: change L58's expectation to `{ x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false, room: 0 }` (a free entry holds zeros, its room included). Add the file to Files and to Step 12's `git add`, and state in Global Constraints that it is not a fence.

### [P2] R1-F2 Task 9 writes two tests into tests/onlineDuelSession.test.ts but never stages that file
Task 9 Step 1 adds two cases to `tests/onlineDuelSession.test.ts`'s Hound block (the source's `turret(0)` and `turret(1)` predictions), and Step 5 runs that file. But neither Task 9's Files list nor its Step 6 `git add` names it. Under the plan's stage-by-name rule, the edit stays uncommitted until Task 12, which stages the same file for its own reasons, so Task 9's tests would land in Task 12's commit. · plan L2745 (Files: only `tests/w4Online.test.ts`); plan L2791-L2825 (cases added to onlineDuelSession.test.ts); plan L2882 (Step 5 runs it); plan L2888 (`git add` without it); plan L3702 (Task 12 stages it) · Every task is meant to end committed and clean. As written, Task 9's commit is missing its own tests and Task 12's commit misattributes them, which breaks bisecting and the per-task review. · Add `tests/onlineDuelSession.test.ts` to Task 9's Files (Modify) and to its Step 6 `git add`.

### [P2] R1-F3 Task 11 does not say where the PEW PEW tag goes in the JSX, and placed early it sits under the card's click overlay
The PEW PEW row's select target is a `console-card-pew` div whose Box has `pointerEvents: 'auto'` and spans x0 to right and top+6 to top+22. The new `gun-mode-pew` Button covers top+4 to top+22 on the same row. `Button` sets no z-index, so DOM order decides which one takes a click. The plan says to put the tag 'on the PEW PEW row, between its PEW PEW label and the charge pips'. Read literally, that is right after the label at L128, before the overlay at L133, which leaves almost all of the tag under the overlay. A real click would then select pew pew instead of flipping its switch. The jsdom test fires `pointerDown` on the tag element directly, so it passes either way. · plan L3267 (the tag's position, nothing on DOM order); .worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx:L128 (the label), L133-L135 (the overlay div with its pointer-events Box); .worktrees/w4/src/renderer/src/ui/stage/Button.tsx:L56-L61 (absolute position, no z-index); plan L3175-L3184 (the test fires on the tag itself) · Two implementers would place it differently, and one placement ships a tag that cannot be clicked in the real UI while the tests stay green. · State that the `gun-mode-pew` Button is rendered after the `console-card-pew` div, as the TORPEDO tag follows its Card. Add an assertion that the tag comes later in the DOM than the overlay: `q('[data-testid="console-card-pew"]')!.compareDocumentPosition(tags()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING`.

### [P3] R1-F4 Task 5 tolerates a failing duelGates seed, but the known-red window opens duelGates only at Task 7
Task 5 Step 7 says a failing `duelGates` per-seed test should be recorded for Task 13 and the task should go on. The Global Constraints open `duelGates`' per-seed tests in the known-red window only 'from Task 7 … until Task 13', and every other test must pass at the end of each task. · plan L1192 (Task 5 Step 7); plan L52 (the window from Task 7); plan L53 ('Every other test passes at the end of each task') · The two rules contradict each other. An implementer cannot tell whether a red seed after Task 5 is a stop or a note. · Either extend the duelGates entry to 'from Task 5 (turrets move rounds)', or change Task 5 Step 7 to 'a failing per-seed test here is a defect: stop and report'.

## Verified
- Task 3 names every `gunsManual` site on the branch: state.ts L96, L237, L245; hash.ts L26, L27, L258, L330-L333; tests/w4Turret.test.ts L1, L48, L52, L55, L58, L68-L70; tests/tacticalDeterminism.test.ts L116, L129-L131; tests/valkyrnIdentity.test.ts L8, L25, L27, L43. There are none in scripts/. No later task reads `gunsManual`. Removing `hasTurret` from hash.ts's imports is safe: L332 is its only use.
- Task 3's bound message: `bad()` includes `f.name` (`systems.<i>.pewManual`), so `toMatch(/pewManual/)` holds (hash.ts L311). `c?.slots.pew?.turret` is null for the Valkyrn, the laser fit and the Hunter (defs.ts L113-L157).
- Task 4's anchors match the branch: step.ts L44, L46, L325, L328-L339 (WEAPON_ORDER, DUEL_KINDS, the kind filter, the torpMode branch, `sys0`); gun.ts L27-L31, L39-L52, L68-L70 (gunInterval, fireRound, tickGun); pew.ts L31-L37, L91-L94; weapons.ts L371 (tickPew). The duelModules kinds list is alphabetical with 'designate' then 'heading' (duelModules.test.ts L153).
- The `gunMode` codec: the duel wire's command list is a plain zod array with no type equality to DuelCommand. `weaponPower` already uses `z.number().int()` for its slot (codec.ts L137). `authority/duelRules.ts` only references `duelCodec` (L8, L74), so Decision 17's 'no edit' holds.
- Task 6's input anchors: KeyAction (input.ts L13), PRESS_CODES (L16), emptyPresses (L92), KeyEventLike (L131), the Shift+W branch and the final else in `down` (L163-L164), ConsoleInput.select (L49), clearUi and clear (L175-L176). WEAPON_COUNT and the `KeyAction` import exist in weaponsSeat.ts (L5, L8). GUARDED_CODES takes every PRESS_CODES key and the guard skips Ctrl/Meta/Alt (pageGuards.ts L11, L26).
- Task 6's runtime anchors: `torpModeBase` (runtime.ts L398), the Hound branch's V pair (L529-L530; the laser branch's identical pair is L582-L583), the pew and trigger gates (L533, L538), the closing comment (L541), `weaponsSeatHeld` in `frame` (L657). Online: `sessionHeld` (onlineDuel.ts L71-L75), `heldChanged` (L78-L80), `triggerNow` and `laserAimNow` (L130, L133), the torpModeSent resets (L248, L251, L417, L475), the Hound branch's V pair with `sys0` (L317-L318), the pump's held line (L446).
- Both runtimes apply the same mode rule: `modeRequests` is built from the latest queued (Single player) or in-flight (online) mode per slot, else the sim's or replica's flag. The Hound branches stop reading `p.torpMode` and `p.laserMode`, and the laser-class branch is untouched, so R does nothing there.
- The smokes' anchors exist: duel-app-smoke.ts L156-L160, L168; internet-app-smoke.ts L121, L158. No other script presses V. The Electron driver passes the key name to `sendInputEvent` as `keyCode` (online-app-smoke.cjs L179), the same path as 'V' and 'F' today.
- Task 8's hash work: the round branch's back-offset `2 + ROUND_KEYS.length` reaches `active` from `room` (at − 7), and `at − 1 − ROUND_KEYS.length` reaches `owner` (hash.ts L73-L85, L351-L356). ROUND_SLOT is read only by hash.ts and tacticalDeterminism's length line. MissingRoundKeys excludes `room`, so the `flight` vector and the Valkyrn's left-out pattern by name stay valid.
- Task 8's `laserLock` path: step.ts L328 is the no-laser line that today catches laserLock on the Hound. The plan narrows it with `hasTurret` (already imported, L317), and the lock-only branch in applyWeaponsInput is needed because `armed` is false on the Hound (weapons.ts L305-L310). The scripted Hound gunner sends no laserLock (scripted.ts L339-L356), so admitting it changes no scripted run.
- `pewHit` literals: exactly onlineSource.ts L93 in src, and in tests engineeringFog L277-L278, pewUi L80-L81, pewViews L61 (two in one call) and the exact `toEqual` at pewRounds L67. duelTelemetry L200 only filters. There are none in scripts/.
- Fences: w4HunterIdentity hashes only events with `ship === 1`. Its crew is a parked Valkyrn on UNCREWED_INPUT, so no pewHit or gunHit on the Hunter occurs and the new event members never reach the digest (w4HunterIdentity.test.ts L16-L28). pewHunter and torpedoGuidance read events by kind only. valkyrnRoundsRocks calls placeRound without `room`, which compiles under Decision 19.
- A torpedo with no torpedo lock lands on `owner.lock` (missiles.ts L120: `owner.torpRoom >= 0 ? owner.torpRoom : owner.lock`), and launchMissile copies torpLock into torpRoom (L32), as Task 8's torpedo test assumes.
- Task 11's measure: from theme.ts's ADVANCE table (the middle dot defaults to 6), 'R AUTO/MAN · Q/E ROOM: WEAPONS' is 173 px and 'Q/E ROOM: WEAPONS · RMB TORPEDO: CLEAR' is 218 px. SHIELDS and ENGINES are 42 px against WEAPONS' 44, and 'ROCKS 99' is 47 px.
- Task 11's anchors: WeaponsStation.tsx L149 (the Hound's TORPEDO tag pressing torpMode), L162 (the RIGHT-CLICK TORPEDO: CLEAR row), L122 (`who` maps laser to BEAM, which Task 12 changes to ROOM); consoleModel.ts L164-L173 (`sys`, `lock`, `torpTarget`, the autocannon spread, `selected: i.weaponSel ?? 0`).
- Task 12's anchors: the copied E/Q block in both Hound branches (runtime.ts L517-L524, onlineDuel.ts L306-L312); contactController.ts L20-L24, L81, L116, L143-L144; contactModel.ts L135 and the two `lockRoom: crewSys.laserTargeted ? crewSys.lock : null,` returns (L159, L191); ContactWindow.tsx L61-L63; hitModel.ts L40 (`roomCallout(state, room, prefix)`), L57, L76, ENEMY_SLOT and CALLOUT_COLOUR; controlsList.ts `codesFor` and `keyLabel` (L14, L41); scene.ts contact.sync (L331) with `hasTurret` imported (L57).
- The author's open items: `nextRound` keeps the seat (onlineDuelSession.test.ts L218-L224 reads weaponSel after nextRound, and weaponSel is present only at the Hound's seat); duelScripted.test.ts does not import runDuel today, so Task 13's 'import it if the file does not already' applies; the hint widths are 173 and 218 px.
- w4Runtime's rig calls `holdInSight` on every tick (w4Runtime.test.ts L31), so 'the rig holds the enemy 700 u off' and the Sensors-0 NO CONTACT case are consistent with helpers/sensorSight.ts L9-L13. The rig already creates a contact controller (L20) and `rt.epoch()` exists (runtime.ts L214).
- Renumbering: the Decisions, the known-red window, the Seam for W-4c (`gunModeShown[slot] ?? …`, matching Task 9 L2872), Task 13's 'Task 7 / Task 8' references and the self-review use the new numbers, a mode per gun, R and Shift+R, and a switch per tag. The W-4c plan anchors on these same shapes (w4c plan L11, L37-L39, L658, L668).

## Not verified
- Whether `holdInSight`'s 700 u places the Hunter within its own pew range in Task 8's 'an admitted pewFire carries the room' case, which would add a Hunter round to `t.pew` in the same tick. Seed 5's spawn and the Hunter's fire rule during the hold were not traced.
- Whether `weaponCard('autocannon').x` equals `STATION.x + 8`, as Task 11's tag-clearance assertion assumes. consoleLayout.ts was not read.
- Task 10's scene.ts scoping: whether `reticlePointer` (Task 6) is in scope at the combat input object (scene.ts L408), so that hoisting `reticleOnMap` works. Only the line numbers were read.
- The exact `unackedFrames` value in Task 9's onlineDuelSession prediction cases. It depends on the stub's `heldHighWater`, which was not read. The assertions are written as ranges.
- Whether Electron's `sendInputEvent({ keyCode: '3' })` produces `code: 'Digit3'` in the renderer. The driver path matches 'V' and 'F', but Electron's mapping was not checked in its source.
- The amendment spec beyond §2.5, §2.6 and §3.6, and the W-4 spec's §3 to §14, were spot-checked by grep, not read in full.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `b7ec9d22`. 4 accepted, 0 rejected, 0 deferred. Each was checked against the plan and the W-4 branch's code in `.worktrees/w4` (3b2a90c5).

## R1-F1 [P1]: Task 8 breaks tests/valkyrnRounds.test.ts:58, which Step 10 runs and expects to PASS

Confirmed. `tests/valkyrnRounds.test.ts` L58 pins the freed entry with an exact `toEqual` of seven members, and `gun.ts` L176 frees an entry with `Object.assign(r, emptyRound())`, so `emptyRound`'s new `room: 0` fails it. The file is not one of the plan's fence files. Task 8 now lists it as a kind (a) edit in Files, Step 9 gives the one-line replacement (the pin gains `room: 0`), Step 10's expectation names it, Step 12's `git add` stages it, and the Global Constraints' fences bullet says it is not a fence.

## R1-F2 [P2]: Task 9 writes two tests into tests/onlineDuelSession.test.ts but never stages that file

Confirmed (Task 9's Files and Step 6 `git add` named only `tests/w4Online.test.ts`, while Step 1 adds two cases to `tests/onlineDuelSession.test.ts` and Step 5 runs it). The file is now in Task 9's Files and in its `git add`.

## R1-F3 [P2]: Task 11 does not say where the PEW PEW tag goes in the JSX, and placed early it sits under the card's click overlay

Confirmed against `WeaponsStation.tsx` L128-L135: the `console-card-pew` div's Box takes pointer events over the row, and it comes after the label in the DOM. Task 11's Step 3 now says to render `gun-mode-pew` after that div, with the reason, and the tag click test asserts the DOM order with `compareDocumentPosition`.

## R1-F4 [P3]: Task 5 tolerates a failing duelGates seed, but the known-red window opens duelGates only at Task 7

Confirmed. The known-red window's `duelGates` entry now opens at Task 5 (the stand-in pew flies along the slewed turret), which matches Task 5 Step 7's "record it for Task 13 and go on".

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md

<!-- end -->

---

