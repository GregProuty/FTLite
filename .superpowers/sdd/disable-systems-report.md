# Disable systems at level 2: report (2026-11-17)

Branch `disable-systems`, worktree `.worktrees/disable-systems`.

## Commits
- `702146bd` chore: SIM_VERSION 41 -> 42 alone, blessed. Baselines recorded at 41 first (`npx tsx scripts/golden/canonical-trace.ts baseline`, `npx tsx scripts/golden/duel-oracle.ts baseline`); the guarded bless proved every sector and duel run unchanged per tick.
- `5044177f` feat: the gameplay change, with a same-version `npm run bless`. Duel golden: same 16268 ticks and outcome, new hashes (final 308f6d70). Rematch round 2 is now 20903 ticks (was 22073), same outcome. Sector golden and determinism fixture: content digest only.

## What changed
- `sim/tactical/tuning.ts`: `ENGINE_FACTOR = [1, 0.6, 0]`; `LASER_CHARGE_RATE = [40, 25, 0]`.
- `sim/tactical/weapons.ts`: new `laserOffline(state, i)` (Weapons >= 2). `tickWeapons` zeroes the charge and hold every tick while offline, frozen or not. `applyWeaponsInput` zeroes them too before the release check. This covers a hit that lands after the ship's own clock ran: ship 0's laser fires inside `applyWeaponsInput`, so ship 1's Weapons can reach 2 earlier in the same tick, and a missile hit lands after `tickWeapons`. `canLaunch` already refuses missiles at 2. A missile already in flight carries on.
- Engines 2: factor 0, so held axes add no thrust and no turn. Gravity, the edge spring and drag still act, and the idle stabilise still runs when both axes are zero. While axes are held, stabilise is off, as it always was. `predictPath` uses the same `flyShip`, so the predicted path is correct with no change.
- Command contract unchanged. `canCharge` still admits `laserCharge` at Weapons 2: it is applied but has no effect (Fire is held, nothing charges). I added no reject reason, for three reasons. A "press while broken, it charges once repaired" press is the FTL feel. The runtime and the online client gate sends on `canCharge`, and a reject would make them re-send every tick. A new reason would also widen the network contract.
- Readout (`render/duel/readoutModel.ts`): WEAPONS and ENGINES at 2 read `OFFLINE`. SHIELDS at 2 stays `DMG 2`, because it keeps its layers and only stops recharging. The laser CHARGE row reads `OFFLINE` with an empty bar and `warn` emphasis. The React Weapons station shows this same row. The existing column-width test already renders rooms [2,2,2], and it passes.
- Hunter AI and scripted bots: no change needed. The hunter already repairs any room at 2 first. The scripted pair assigns repairs for any room >= 1. With a dead laser, both just hold Fire with charge 0. There is no loop or crash, and a new test steps a hunter with Weapons and Engines at 2 for 1200 ticks.

## Tests
- New `tests/disabledSystems.test.ts` (10 tests): Weapons 2 held fire gives charge 0 and no laser event; a full charge drops to 0 at 2; a mid-tick hit then a release does not fire; missile refused at 2 while one in flight carries on; repair to 1 restores the level-1 charge time (384 ticks); engine factor 1/0.6/0; Engines 2 held axes give the same heading and motion as a pure drift; idle stabilise still works at 2; level 1 is 0.6 and repair restores it; hunter smoke.
- Updated by their rule: `tacticalFlight` (factor table 0.25 -> 0), `tacticalWeapons` ("10 s at level 2" is now "6.4 s at level 1, level 2 never charges"), `duelReadout` (new OFFLINE test).

## Verification (from the worktree)
- `npx tsc -b`: clean.
- `npx electron-vite build`: built.
- `npx vitest run`: two full runs, both 323 files / 4397 tests passed. No flakes.
- `npm run test:determinism`: PASS on Node, Electron and Firefox. It rewrote the task-5 logs, which I restored with `git checkout --`.
- `npm run test:duel-app-runtime`: PASS on the first attempt (47 s).

## Concerns
- Engines 2 now means a ship can be left drifting into the planet or asteroids until it is repaired. That is intended, but it may shift duel tempo and the survival tuning. Gate tests still pass.
- The Helm station block has no explicit "ENGINES OFFLINE" text. The status table row shows it. The manual look gate is the owner's.
