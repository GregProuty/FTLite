# Increment gates

## Increment 0: headless harness
- [x] `npm test` passes: golden replay, same-seed hash property, snapshot round trip.
- [x] `npm run bless` twice in a row leaves `tests/golden/basic.json` unchanged (verified with `cmp`).

## Increment 1: move and survive
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 (two bots, 5 minutes). Tuning changes made: `FIRE_DAMAGE` 4 -> 3.
  - Reason: with `FIRE_DAMAGE = 4`, seed 3 ended at 268 s (reason 2, both crew dead); health traces showed fires were the drain (100 -> 88 -> 64 -> 52 -> 28 -> 3, in steps of 12-25 per fire; breaches cost nothing). Lowered by 1 per the tuning procedure (floor 2). Golden re-blessed. No other constants changed; `SPAWN_CAP` stays 3, no healing added.
  - Final results (both bots conscious at 300 s): seed 1: health 46/46, max simultaneous hazards 1, 1 repair episode; seed 2: 55/55, max 2, 2 episodes; seed 3: 19/19, max 2, 2 episodes. Seed 3 has a thin margin.
  - The gate also asserts that every fire-repair attempt has the repairer inside the burning room (`roomAt(crew) === target.index`): 0 violations on all seeds.
- [x] Mass-balance and branching-graph oxygen tests pass (part of `npm test`, 141 tests).
- [ ] Manual playtest (`npm run dev`): two keyboard players (WASD+E/F/Q, arrows+Enter/RShift/Backspace) survive 5 minutes; both repaired at least one fire and one breach; one revive happened (let a player stand in a fire until Downed). Date and notes: pending human playtest.
- [ ] Pause on alt-tab and on minimise confirmed; sim clock does not advance while paused. (pending human playtest)
- [ ] Gamepad spike (spec §11): with `npm run dev`, then with `npm run dist` installed build:
  - [ ] Xbox-style pad joins with A, moves, interacts; unplug mid-run shows RECONNECT, replug + any button reclaims.
  - [ ] PlayStation-style pad: same.
  - [ ] A third pad model: same (name it).
  - [ ] Two keyboard clusters plus two pads: four players join.
  - Result and any device restrictions: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Art pass
- [x] `tests/assets.test.ts`: manifest valid, every raw/art file manifested, required files present, grids divide, names bound once, licences on the allow-list.
- [x] `tests/credits.test.ts`: `THIRD_PARTY_NOTICES.txt` and `credits.generated.ts` match the manifest (`npm run credits` regenerates them).
- [x] `tests/build-output.test.ts` after `npm run build`: `out/renderer/assets/manifest.json` and `out/renderer/THIRD_PARTY_NOTICES.txt` exist.
- [x] Pure render tests: door state pairs, wall tall/flat rule, fire subsets, breach geometry, facing, render memory reset, credits sub-state.
- [ ] Manual (`npm run dev`): Cozy Space ship with animated doors and tinted Puny crew; doors open on approach and show the sealed frame when sealed, including after a seal/unseal while another door is mid-animation; a fire shows animated flames whose count grows; a breach shows the decal (or the placeholder square until the decal is drawn) and the vent puff points outward; a restart shows no scorch marks from the previous run; the HUD uses the bitmap font and panels with the right glyph per device (kb1: E/F; kb2: Enter/Shift; pad: A/X); the credits screen opens from the lobby with Cancel and Confirm closes it without starting. Date and notes: pending human playtest.
- [x] Packaged build (`npm run dist`, installed): loading and `resources/THIRD_PARTY_NOTICES.txt` presence verified on the `win-unpacked` output (see 2026-11-10 note); visual checks remain pending.
- [ ] Increment 1 manual items above still pass. (pending)
- 2026-11-10: the controller verified by `--enable-logging` runs that the dev build and the packaged `win-unpacked` build over `file://` load all 16 required files with exactly the 7 optional-missing warnings, and that renaming `wall.png` triggers the fatal path.
- Optional in-house art not yet present at the time of this gate (placeholders in use): `art/tiles/breach.png`, `art/tiles/floor_damaged.png`, `art/crew/body_base.png`, `art/crew/sit.png`, `art/fx/vent.png`, `art/fx/arc.png`, `art/icons/hazards.png`.

## Increment 2a-i: power and consoles
- [x] `npm test` passes: console (sit/stand, Engineering, Doors, inert stations, power repair, determinism with console use), power, stick edges, Life Support, Medbay, spawner, snapshot round trip of seating/power/stick, ship validation (unknown id, missing kind, fractional/over-max allocation, Engineering floor, budget), HUD model (power strip, panels, power threat, No doors).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with Life Support unmanned at level 2 and power failures in the mix (2026-11-10: min health 51.8 / 81.2 / 75.1; 3 / 3 / 2 power failures spawned).
- [ ] Manual, two players (`npm run dev`): each of the seven consoles can be sat at (Confirm in its room) and left (Cancel or Interact); a bar is moved in Engineering and the strip reflects it; a power failure appears, is repaired by holding Interact at the console, and Engineering comes back at level 1 (others at 0, reallocated); a door is sealed from the Doors console and the blue outline matches the sealed door; a hurt crew member heals in the Medbay. Date and notes: pending human playtest.
  - Console tiles on the starter ship: Navigation A(2,2), Doors A(3,1), Weapons B(7,2), Science D(12,2), Medbay F(17,2), Life Support E(10,9), Engineering C(18,9). The first spawn comes at 15 s and then every ~30 s, one in four being a power failure, so expect to wait a minute or two for one.
- [ ] Manual, solo: five minutes survived against the spawner with Life Support manned at level 2. Date and notes: pending.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 2a-ii: debris loop (closes the foundation's Increment 2a)
- [x] `npm test` passes: debris (slots, target order, detection leads, warned-on-spawn boundary, impact effects and fallbacks, crew damage and immediate down, evasion), weapons (charge, targeting, firing, thresholds), spawner (fourth interval, debris in the cap), scripted-intent gate tests for Science, Weapons and Navigation, snapshot round trip of debris/weapons/impact ticks, HUD model (debris threats, three panels).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with Science, Weapons and Navigation unmanned (2026-11-10; no tuning changed; min hull 68, 84, 68 for seeds 1, 2, 3 with 4, 2, 4 impacts, recorded 2026-11-10).
- [ ] Manual, two players (`npm run dev`): a `Debris` threat appears only after Science is seated (D(12,2)) or in the last 4 s unmanned; from Weapons (B(7,2)) the panel lists targets, the beam bar fills in about 12 s, Confirm removes a target or resets the bar on a miss; an unstopped impact flashes the hit room, lowers `HULL` by 8 and leaves a breach or fire; the Navigation panel (A(2,2)) shows `Evade 35%` while seated. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 2b-i: overdrive, heat and coolant
- [x] `npm test` passes: heat (overdrive ceiling, output past 1, rise/cool rates, hold with two units, idle decay, overheat with one hazards draw and the fire chance, two-station order, spawner cap on the overheat tick, failed Engineering, same-tick Navigation/Life Support/Medbay cases), power (max + 1), console (coolant cycle, pool wrap, Engineering row, same-tick Left/Confirm/shot cases, fast-check invariants over 60 s, scripted overdrive gate), snapshot round trip of heat and coolant with version-3 rejection and continuation through an overheat, HUD model (row and strip thermal fields, free coolant).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 unchanged (no spawner or tuning change outside the new constants).
- [ ] Manual, two players (`npm run dev`): from Engineering (C(18,9)) take a bar from Life Support (Left) and push Weapons (B(7,2)) to a fourth cell drawn in the warning tint; its heat bar climbs; two Confirms show `C2` and the bar stops; Confirm again to `C0` and within about 10 s `Power: Weapons` appears in the threats with the Weapons operator stood up. Whether the overheat also starts a fire is a 50% roll and not a gate condition; note it if seen. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
