# Art-iv-b report: the Hound in the sector fleet

Branch `art-iv-b` (worktree `.worktrees/art-iv-b`). Commits:
- `3bd4361` feat(art-iv-b): the Hound flies the multiplayer sector at every crew size
- `e3dd30b` feat(art-iv-b): re-author the determinism fixture for the Hound at 2 and 3 crew
- (this report and the smoke evidence in a third commit)

## Files changed

Production:
- `src/renderer/src/sim/ship/fleet.ts`: `shipForCrew` returns `'hound'` for every count. `shipLine` reads "Ship: Hound (4 crew)".
- `src/renderer/src/render/hudModel.ts`: comment only. `lobbyLines` stays keyed to the Skiff (spec), so the Skiff helm line no longer shows.
- `src/main/network/onlineSector.ts`: `sectorJoinCompatibilities()` now returns one compatibility per distinct layout across capacities 1-4. That is one today (the Hound), so a join no longer probes the same compatibility twice. Init and validation already resolve through `shipForCrew`. `network/modes/sector.ts` and `main.ts` already map `hound`, so they are unchanged.

Scripts:
- `scripts/network/online-app-report.ts`: the per-capacity layout comes from `shipForCrew(capacity)` (both are `hound`).
- `scripts/network/online-app-observer.ts`, `online-recovery-utility.ts`: these now resolve the Hound.
- `scripts/network/online-recovery-smoke.ts` / `online-recovery-report.ts`: the scenarios `skiff` and `cutter` are renamed `hound-2` and `hound-4`. The report validator still accepts `skiff` and `cutter` as archived names, because `tests/internetAppReport.test.ts` validates the archived evidence `recovery-skiff.json`.
- `scripts/network/online-app-smoke.ts`: renamed a variable (`cutterLobby` -> `fourSeatLobby`).
- `scripts/determinism/fixture.ts`: `layouts = { hound }`, plus `VARIANTS` (hound at 2 and at 3 players), `variantName` and `variantOf`. Samples and boundaries carry `variant`. `executeFixture` counts 54 000 ticks and 900 samples per variant, and its two-live-worlds interleave runs on the first run of each variant.
- `scripts/determinism/protocol.ts`: `Sample.variant?` is optional, and error messages name the variant.
- `scripts/determinism/capture.ts`: the new schedules (below).

Tests:
- `tests/skiff.test.ts`, `tests/hound.test.ts`: the fleet is `['hound' x4]` and the lobby line is "Ship: Hound (4 crew)".
- `tests/hud.test.ts`: the lobby card is the standard CARD at 1, 2 and 4 players.
- `tests/onlineSector.test.ts`: `layoutId: 'hound'` at capacity 4 and 2. The join compatibilities equal `[sectorCompatibility(2)]`. The mismatch cases now use a Skiff layoutHash and a simVersion+1 instead of the capacity-2 compatibility, which now equals capacity 4.
- `tests/onlineCoordinator.test.ts`: a join probes one layout. An `incompatible` reply is now final, with one probe. The started init is `layoutId: 'hound'`.
- `tests/onlineRecovery.test.ts`, `tests/helpers/onlineCheckpoint.ts`: these now resolve the Hound (the helper resolves by id).
- `tests/onlineAppReport.test.ts`: the scenario layouts are `hound`.
- `tests/determinismHarness.test.ts`: see below.
- `tests/fixtures/determinism-v2.json`: re-authored.

Unchanged, and confirmed not to depend on `shipForCrew`: `tests/helpers/gameplayTrace.ts`, `tests/fixtures/net1a-*.json` (fixed skiff/cutter scenarios and gates), and the golden (starter).

## How the schedules map to the Hound

Seats come from `deriveLayout(hound).stationOfKind`: nav 0, weapons 1, science 2, engineering 3. The Ops group is `stationGroup[science]` = group 0. The capture asserts that Navigation and Weapons are ungrouped and that Science and Engineering share Ops. The mover is player `playerCount-1`, and it starts seated at Ops in both variants.

| Coverage | Old Skiff (2p) | Old Cutter (3p) | hound-2 | hound-3 |
|---|---|---|---|---|
| buy t0 / t300 | p0 nav | p0 nav | p0 nav | p0 nav |
| votes t1 | all | all | all (2 applied) | all (3 applied) |
| t2 | p1 scan (Ops) | p1 selectTarget (weapons) | p1 scan (Ops) | p1 selectTarget (weapons, noop) + p2 scan (Ops) |
| Ops tabs | group 1 t11/t13 + buyReactor t12 | none | group 0 (Ops) t11 -> Eng, t12 buyReactor, t13 -> Sci | same, by p2 |
| group-0 tabs (nav/weapons) | t10, t299, t301 | none | replaced: p0 stand t20, held walk up t24-30, sit weapons t40; stand t290, walk down t291-297, sit nav t298; stand t302, walk up t303-309, sit weapons t311 | none (p1 is the gunner) |
| stand | p1 t22 | none | mover t22 | mover t22 |
| fire t61 (stale-target) | p0 | p1 | p0 | p1 |
| selectTarget t600 | p0 | p1 | p0 | p1 |
| moveTo t700 (unsupported) | mover | mover | mover | mover |
| held moves | mover t0/23 (full diagonal)/80/144/450/510 | same | same + p0 commute | same |
| pauses | 60, 901 | same | same | same |

Every applied, stale-target and unsupported outcome above was checked in a dry run before authoring, and the harness now pins them.

Harness test changes (no assertion weakened):
- The fleet check stays: `{runs.ship} == {1..4}.map(shipForCrew)`, and each `run.ship == shipForCrew(playerCount)`. New checks: the variant set is exactly `{hound-2, hound-3}`, run ids are `det-<variant>-*`, and every sample's `variant` matches its run.
- The full-diagonal check runs on `hound-2` against the mover (crew `playerCount-1`). A new `checked` flag fails the test if tick 23 is never reached.
- Per variant: 54 000 ticks, 900 samples (completed 60..54000), terminal chains, unique run ids, more than one seed.
- Per variant, the production replay still covers everything it covered before: buy t300 applied, purchases > 0, all votes applied, event resolved, stale-target at t61, debris StableId reuse, 4 pause events, and the mover moves.
- New exact checks on both variants: the mover's scan at t2 applies; t11, t12, t13 and t22 each apply exactly once for the mover; t700 is `unsupported`. hound-2 also checks that t20, t40, t290, t298, t300, t302 and t311 each apply for p0, and that t61 is p0 `stale-target`. hound-3 checks that t61 is p1 `stale-target`. These are stronger than the old `toContainEqual` checks.

## New fixture

`tests/fixtures/determinism-v2.json` is 1 580 696 bytes (the old one was 1 766 872), delta-v1 encoded. It has 13 runs:
- hound-2: 6 runs, seeds 20261114-19. 5 end; the last is 4840 ticks, not ended.
- hound-3: 7 runs, seeds 20261114-20. 6 end; the last is 171 ticks, not ended.
- 1800 samples (900 per variant) and 330 result/event boundaries.

Process: I deleted the old file by hand and ran `npx tsx scripts/determinism/capture.ts` once. Before that I ran a dry run of the same script, redirected to a scratch path, to inspect results; its output was byte-identical to the authored file. A later re-check after a typing-only refactor matched too, except for the content-digest provenance, which the harness rebinds anyway.

## Commands run

- `npx tsx scripts/determinism/capture.ts`: 13 runs, "Saved tests/fixtures/determinism-v2.json, 1800 samples".
- `npm run typecheck`: clean (run twice, the second on the final tree).
- `npm test`: 277/277 files pass. The first full run ran alongside the determinism gate and showed real failures, which I fixed (onlineSector, onlineCoordinator, onlineRecovery, internetAppReport). It also showed load timeouts (eventList, snapshot, authorityBoundary, onlineAppRuntime) that pass alone, and an instrumentation test that needs `out/` from a build. The final full run is clean (121 s).
- `npm run test:determinism -- --output-dir=.superpowers/sdd/art-iv-b-determinism`, run on the final tree: Node v24.18.0 gave 1800 samples and 330 boundaries, PASS (62.7 s). Electron 37.10.3 / Chromium 138 gave 1800 PASS (17.6 s). Firefox 160 gave 1800 PASS (22.8 s).
- `npm run build`: OK.
- `npm run test:online-app-runtime` (capacities 2 and 4): "ACTUAL APP 2-seat hound ... proved", "ACTUAL APP 4-seat hound ... proved", "ACTUAL TWO-PROCESS ONLINE APPLICATION PASS". Evidence is in `.superpowers/sdd/art-iv-b-online-app/`. I moved it there from the smoke's default net-3d folder.
- `npx tsx scripts/network/online-recovery-smoke.ts --scenario=hound-2|hound-4`: both gave "ACTUAL APPLICATION RECOVERY PASS". Evidence is in `.superpowers/sdd/art-iv-b-recovery/`.

## Concerns

- The lobby helm line: the spec keeps the Skiff-only branch, so the Hound shows the standard line "Torpedoes are carried from the hold". The Hound has no magazine (its tube loads itself) and does have Ops tabs, so the Skiff line is actually the accurate one for the Hound. This is for the owner to decide; I followed the spec.
- This is pre-existing and out of scope: `scripts/network/duel-app-observer.ts` and `scripts/profile-duel-publication.ts` still parse the Cutter as the duel layout, but the duel flies the Hound since Art-iv. I did not run the duel smoke.
- I did not take sector screenshots of the Hound (spec look item) in this part.

## Fix: the (.6, .8) segment now moves someone (review finding, Important)

- Finding: the tick-0 `(.6, .8)` held segment landed while the mover was seated at Science (ticks 0-22), and
  `movementSystem` skips seated crew, so it walked nobody. The Cutter's old mover had really walked under it.
- Leaving the hound-3 mover unseated at tick 0 was not possible: the scan (tick 2), Ops tabs (11, 13), reactor buy (12)
  and stand (22) all need it seated, and the coverage test requires them applied on both crew sizes.
- Fallback taken (scripts/determinism/capture.ts): the tick-144 still segment becomes `(.6, .8)` for ticks 144-149, then
  still at 150, on both variants. The mover is unseated after the tick-22 stand and in open floor there. The tick-0 copy
  is kept and commented: it now only covers "seated crew ignore held input".
- New test (tests/determinismHarness.test.ts, both variants): over the window each tick moves the mover by exactly
  `CREW_SPEED * TRAIT_SLOW_SPEED * DT * (.6, .8)` (toBeCloseTo 12), and the check count equals the window length.
  No other assertion changed.
- Re-authored: fixture deleted by hand, `npx tsx scripts/determinism/capture.ts` -> 1800 samples.
- `npx vitest run tests/determinismHarness.test.ts`: 16 passed. `npm run test:determinism`: Node 1800 samples and 330
  boundaries PASS, Electron 37.10.3 PASS, Firefox 160 PASS. `npm run typecheck`: clean.
