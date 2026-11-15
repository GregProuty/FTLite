# Codex review exchange: helm-h1-spec

Subject: `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 44097ac, effort high, 212 s, 613335 in / 512512 cached / 10691 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 The inactive solo character starts present
The spec sends presence changes only on Tab, but the duel starts with both characters present. Before the first Tab, the unattended gunner still operates Weapons. · spec L48, L78; src/renderer/src/sim/duel/state.ts:L49; src/renderer/src/sim/duel/step.ts:L37, L102; parent spec L252-L253 · This violates the binding solo rule that the station left without a player is away and unattended. · Specify a replayable solo initialization that makes player 1 away before the first duel tick, and apply it again on restart.

### [P1] R1-F2 The tactical model has no current control axes
The declared model inputs omit the held Helm axes needed for its predicted path. TacticalState does not store those axes. · spec L93, L103; src/renderer/src/sim/tactical/state.ts:L11, L67; src/renderer/src/sim/duel/step.ts:L115 · An implementer must invent how the model receives the prediction input, including the neutral axes when the pilot is away. · Add effective current Helm axes to the model input and define when the runtime samples them.

### [P1] R1-F3 The flight view cannot park an inert second ship
The proposed flight mode uses stepFlight while parking ship 1 at the edge, but stepFlight advances both ships and resolves their contacts. Tactical ships have damage levels, not an unpowered or inactive flag. · spec L121-L123; src/renderer/src/sim/tactical/physics.ts:L57-L61; src/renderer/src/sim/tactical/contacts.ts:L47-L52; src/renderer/src/sim/tactical/state.ts:L11-L30 · Gravity and edge forces move the hidden ship, and it can eventually collide with the playable ship. · Specify a true single-ship flight step or an explicit inactive-ship rule in the tactical sim, including collision exclusion.

### [P1] R1-F4 Restart does not define a new tick epoch or view reset
Restart creates a new duel but does not say whether it recreates the tick driver. A retained driver keeps its increasing tick number while the new interior starts at tick 0; commands using the driver number would be rejected as stale. Camera, trails, queued effects and interpolation also lack reset rules. · spec L49, L72, L89, L101; src/renderer/src/authority/tickDriver.ts:L9, L40; src/renderer/src/sim/duel/state.ts:L37; src/renderer/src/sim/duel/step.ts:L73, L94 · The advertised Enter-to-restart path can lose its first commands and display state from the previous duel. · Require disposal and recreation of the tick driver on restart, use the new interior tick for command admission, and reset every view-owned cache and input edge.

### [P1] R1-F5 Focus can undo an Escape pause
The pause rules say focus resumes the driver and Escape toggles pause, without separating a user pause from blur, hidden-window and suspend pauses. · spec L43-L48; src/renderer/src/main.ts:L53-L57 · After an Escape pause, a blur and focus cycle could resume play without another Escape press. · Define separate pause reasons and resume only when all active reasons are cleared; focus must clear only the focus-related reason.

### [P1] R1-F6 The interior cannot meet the stated construction-only allocation test
The spec requires every view to create all display objects at layer construction, while its interior reuses layers that create icons and crew display objects on their first update or draw. · spec L110, L128; src/renderer/src/render/roomIcons.ts:L72-L81; src/renderer/src/render/crewSprites.ts:L55-L60, L69-L71 · The required 60-frame test fails on the first frame even if the existing layers are reused correctly. · Define an initial build or warm-up phase, then assert no new display objects during steady-state frames; specify how restart handles those caches.

### [P1] R1-F7 Missile-path prediction lacks a testable contract
The predictor is said to copy thrust and gravity, but its horizon, sample interval, assumed future steering, and behavior at impacts or expiry are unspecified. · spec L104; src/renderer/src/sim/tactical/missiles.ts:L32-L44, L60-L80 · Two implementations can draw different paths and both claim to match flyMissile, while contact and lifetime handling remain untested. · Specify predictor inputs, steering assumption, tick horizon and stride, and termination at each missile end condition; state exactly what the tick-for-tick comparison covers.

### [P1] R1-F8 The Helm view omits required combat information
The parent requires the locked enemy room on both screens and both hull values in the overlay. The H-1 Helm list does not include the lock marker, and its readout names only an unspecified hull. · spec L103-L106; parent spec L138, L241 · A plan following the H-1 list can omit information the parent says both stations must show. · Explicitly place the locked-room marker in both console models and name own and enemy hull values in the overlay.

### [P1] R1-F9 The required planet-contact spark has no view rule
The parent's look specification includes a planet-contact spark, but the H-1 effects list covers only lasers and missile endings. Tactical events contain neither ship contact nor planet contact. · spec L105; parent spec L265; src/renderer/src/sim/tactical/state.ts:L51-L56 · The effect will be missed unless the plan invents a way to detect the contact from published state. · Specify a render-side contact detector using successive planet-hit counters and positions, or add an explicit tactical event and its drawing rule.

## Verified
- Both console cameras are ship-centred with the parent's zoom limits, follow, pan and snap behavior: spec L85-L89; parent spec L210-L224.
- The key table covers the duel command kinds and the parent's Weapons keys: spec L56-L80; src/renderer/src/sim/duel/commands.ts:L5-L13; parent spec L165.
- The listed interior layers can be constructed separately from createRenderer and accept SimState for drawing: spec L110; src/renderer/src/render/renderer.ts:L44-L52; src/renderer/src/render/tiles.ts:L11-L16; src/renderer/src/render/effects.ts:L18-L20.
- Render, app and input are outside the determinism guard's roots; the boundary test also follows imports from guarded modules: spec L98, L127; tests/boundary.test.ts:L12-L27; tests/helpers/determinismGuard.ts:L16-L17.

## Not verified
- No build, runtime screenshot check or test suite was run; this was a read-only review of commit aff9bf3.
- To verify the flight collision, seating and interior-layer findings, I also read contacts.ts, stations.ts, commands.ts, state.ts, roomIconModel.ts and consoleModel.ts beyond the reading manifest. No other files were explored.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at the brief commit. 9 accepted (1 P0, 8 P1), 0 rejected, 0 deferred. Each claim was checked against the cited code; all held.

## R1-F1 [P0]: The inactive solo character starts present

Confirmed. `createDuel` starts with `present: [true, true]` (`sim/duel/state.ts:L49`), and the spec only sent presence on Tab, so before the first Tab the gunner's console counted as attended. §4 now has a **solo start** rule: on the first tick of every duel, including after a restart, the runtime adds `presence {present: false}` for player 1 ahead of any other command. Being an ordinary tick-0 command, it is replayable.

## R1-F2 [P1]: The tactical model has no current control axes

Confirmed: `TacticalState` stores no axes. The §7 model input now includes the *current axes*: the effective Helm `{turn, thrust}` and gunner steering the runtime last sent, zero for an empty console. The runtime records them each tick when it builds the input. The Helm's predicted path uses them.

## R1-F3 [P1]: The flight view cannot park an inert second ship

Confirmed. `stepFlight` flies both ships and `resolveContacts` includes ship-to-ship contact (`physics.ts:L57-L61`, `contacts.ts:L47-L52`). §9 now specifies `stepSoloFlight(state, axes, tuning?)` in the tactical sim. It runs `flyShip` on ship 0 and only ship 0's static contacts, through the existing `hitStatics` pass, which `contacts.ts` will export. Ship 1 is never stepped, never collides and is not drawn.

## R1-F4 [P1]: Restart does not define a new tick epoch or view reset

Confirmed. The driver's tick count keeps growing (`tickDriver.ts:L9`, L40) while a new duel starts at tick 0. §4 now states that commands carry `requestedTick = d.interior.tick`, and that the driver only paces steps. A restart disposes and recreates both the driver and the duel, applies the solo start rule, resets every view-owned cache (cameras, trails, effects, shakes, previous positions, `RenderMemory`, the rebuilt interior view), and clears held input, edge counters and command sequences.

## R1-F5 [P1]: Focus can undo an Escape pause

Confirmed. §4 now keeps a set of pause reasons (`user`, `blur`, `hidden`, `suspend`), and the driver runs only while it is empty. Escape toggles `user`; focus removes only `blur`; visible removes `hidden`; resume removes `suspend`.

## R1-F6 [P1]: The interior cannot meet the stated construction-only allocation test

Confirmed. Room icons and crew sprites are created on their first update or draw (`roomIcons.ts:L72-L81`, `crewSprites.ts:L55-L71`). §10's allocation test now counts display objects after a 2-frame warm-up, then runs 60 steady-state frames. The interior view counts as built after its warm-up and is rebuilt on restart.

## R1-F7 [P1]: Missile-path prediction lacks a testable contract

Confirmed. §7 now specifies `render/tactical/missilePath.ts`:
- Inputs: a missile copy, the map, and the current steering, assumed constant.
- Horizon: `min(MISSILE_LIFE_TICKS − age, 240)` ticks, with a point every 4 ticks.
- Rules: exactly `flyMissile`'s turn, thrust-while-fuelled, gravity and no drag.
- It stops with a final point at a planet or asteroid contact, the map edge or expiry, and ignores ships.

The test checks per-tick positions against `flyMissile` over 120 ticks of free flight with constant steering, and an end at the planet.

## R1-F8 [P1]: The Helm view omits required combat information

Confirmed against parent §7a and §10b. §7 now puts the lock marker on both consoles. The readout shows both hulls, plus the enemy's shields and room levels.

## R1-F9 [P1]: The required planet-contact spark has no view rule

Confirmed: `DuelEvent` has no contact kind (`tactical/state.ts:L51-L56`). §7's effects now include a render-side detector. Each tick it compares each ship's `planetHits`, `asteroidHits` and `shipHits` with the last tick's, and any increase draws a 0.3 s spark at the ship (orange, grey or white).

## Also changed

- Change log entry for round 1.

## Files changed

- docs/superpowers/specs/2026-11-14-helm-h1-views-design.md

<!-- end -->

---

# Round 2 (delta, reviewing f347115, effort medium, 86 s, 262041 in / 206208 cached / 3987 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Flight step contradicts the new-code boundary
The flight section requires new functions in the guarded tactical sim, while the architecture section says all new code goes outside guarded roots. · spec L137 requires `stepSoloFlight` in the tactical sim and an export from `contacts.ts`; spec L141 says new code goes in app and render directories and that none of it is under guarded roots; src/renderer/src/sim/tactical/contacts.ts:L38-L45 contains the currently private static-contact pass. · The H-1a plan cannot follow both placement rules as written. · Make §10 explicitly allow the two specified tactical-sim changes in §9, while keeping renderer and app code outside guarded roots.

## Prior findings
- R1-F1: resolved — Spec L43 sends player 1 away as a replayable tick-0 command on every duel, including restarts at L54.
- R1-F2: resolved — Spec L100 supplies effective current axes to the model and defines when the runtime records them.
- R1-F3: resolved — Spec L137 defines a ship-0-only step with static contacts and excludes ship 1 from stepping, collisions and drawing.
- R1-F4: resolved — Spec L42 uses the duel tick for commands; L53-L56 recreate the driver and duel and reset view and input state.
- R1-F5: resolved — Spec L45-L51 separates pause reasons and makes focus clear only `blur`.
- R1-F6: resolved — Spec L143 tests allocation after warm-up and rebuilds the interior view on restart.
- R1-F7: resolved — Spec L113-L118 defines predictor inputs, steering, horizon, sampling, termination and comparison tests.
- R1-F8: resolved — Spec L112 puts the lock marker on both consoles; L120 names both hull readouts.
- R1-F9: resolved — Spec L119 defines counter-based contact sparks and their placement, colour and duration.

## Verified
- The tick-0 presence command in spec L43 is processed before tactical attendance is determined in src/renderer/src/sim/duel/step.ts:L93-L103.
- The proposed single-ship step in spec L137 addresses the two-ship behavior in src/renderer/src/sim/tactical/physics.ts:L57-L61 and src/renderer/src/sim/tactical/contacts.ts:L47-L53.
- The predictor rules in spec L113-L118 match missile movement and contact order in src/renderer/src/sim/tactical/missiles.ts:L32-L44 and L60-L80.
- The warm-up rationale in spec L143 matches first-draw object creation in src/renderer/src/render/roomIcons.ts:L72-L81 and src/renderer/src/render/crewSprites.ts:L55-L71.

## Not verified
- The run-dir ledger could not be read because filesystem access was denied; the ledger supplied in the request was used.
- No tests were run for this read-only spec review.

---

# Round 2 response (spec revised)

Reviewed `round-2.json`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R1-F1 to R1-F9 resolved.

## R2-F1 [P1]: Flight step contradicts the new-code boundary

Confirmed. §9 adds `stepSoloFlight` and exports the static-contact pass (`contacts.ts:L38-L45`), both under the guarded `sim/` root, while §10 said all new code sits outside the guarded roots. §10 now names these two sim changes as the one exception. They follow the guarded roots' rules: deterministic arithmetic only, and no imports from render, app or input. All other new code stays in `app/` and `render/`.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-14-helm-h1-views-design.md

<!-- end -->

---

