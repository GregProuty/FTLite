# Codex review: Run-ii plan 1a-ii, state/flatten/power code (2026-11-11)

1. **High — `state.ts` —** The `run` type and literal omit `nodeType`, `scrap`, `event`, `eventChoice`, and `upgrades`; telemetry omits the four new counters. `generateMap` still returns only `colNodes` and `edgeMask`. **Fix:** add the planned fields and defaults, and extend `generateMap`’s return shape with `nodeType`.

2. **High — `flatten.ts` —** `RUN_FIELDS` is still `4 + 4 * RUN_COLUMNS`, and the run put/get order omits the new fields. `TELEMETRY_SCALARS` is 16, and telemetry put/get omits the four counters. **Fix:** use `4 + 7 * RUN_COLUMNS + 3 + STATION_COUNT` and 20; append the specified fields after `edgeMask` and `jumps` in matching put/get order.

3. **High — `power.ts` and `heat.ts` —** `maxLevel` still takes only `kind`, and `shiftBar` calls that old signature; `isOverdriven` still compares against `STATION_MAX`. Thus upgrades cannot raise the base limit or the overdrive threshold. **Fix:** add `baseMax(state, kind)`, update `maxLevel(state, kind)` and its caller, and compare heat against `baseMax` while retaining the station index argument.

4. **Medium — `src/` `maxLevel` callers —** The grep finds the remaining `maxLevel(kind)` call in `power.ts`; the plan also requires updating the test helper and assertions in `tests/{console,heat,power}.test.ts`. These callers are not covered by the Step 3 changes. **Fix:** update all callers to pass state and kind.

5. **High — `enemy.ts`, `boarders.ts`, and scrap imports —** `leave(state, destroyed)` increments `enemiesDestroyed` without awarding scrap, and `damageBoarder` increments `boardersKilled` without awarding scrap. **Fix:** award the respective tuned amounts through the shared `scrap.ts` helpers; keep `enemy.ts` and `boarders.ts` importing from `scrap.ts` to avoid a cycle through `run.ts`.

6. **Low — `stations.ts` / import cycles —** `stationOutput` correctly retains `STATION_MAX[kind]` as its denominator. The proposed imports also avoid the named cycles: `heat.ts → power.ts` is safe because `power.ts` imports `stations.ts`; enemy and boarder scrap goes through `scrap.ts`, while `run.ts → enemy.ts` remains one-way.