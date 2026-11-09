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
