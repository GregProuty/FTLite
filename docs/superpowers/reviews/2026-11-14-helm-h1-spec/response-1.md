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
