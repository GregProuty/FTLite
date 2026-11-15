# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at the brief commit. 3 accepted (2 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). Checked by applying the plan task by task to a fresh worktree of master: each task typechecks and passes (188, then 209 tests).

## R1-F1 [P1]: Resolve the contradiction between envelope order and weapon execution order

Confirmed. `stepDuelTick` folded the commands into one `ShipInput`, and `applyWeaponsInput` (`tactical/weapons.ts:L64-L74`) applies lock, then charge or release, then launch. So "launch, then release" was admitted against the old state and reported both applied, yet the laser fired before the launch. The tick now admits weapon commands in that same fixed order: it walks `WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch']`, with envelope order kept within a kind and the last accepted command winning. Each result therefore matches what happens. Decision 3 states this as a deliberate exception to "commands apply in envelope order": a launch and a release in the same tick both apply, the release firing first. New duel test `weapon commands take effect lock, then charge, then launch, whatever their envelope order`. For both envelope orders of launch and release, both are applied and the result is one shot and one launch. For both orders of lock and release, with the enemy dead ahead and its shields down, the shot damages the newly locked Engines room. Mutation check: reverting to plain envelope order makes the test fail.

## R1-F2 [P1]: Make the Missile key guard inspect a production-created missile

Confirmed: it compared a hand-written literal with itself. The guard now creates the missile with `launchMissile(launched, 0)` and checks that missile's keys against the list `MISSILE_SLOT` flattens.

## R1-F3 [P2]: Dispose the interior when duel construction fails

Confirmed. `disposeSimState` exists (`sim/state.ts:L93`), and `createDuel` could throw after `createSimState` without calling it. It now builds and validates the tactical map before allocating the interior. The rest of construction runs in `try`, and a failure calls `disposeSimState(interior)` and rethrows. The interface text says so. A test for the missing-role-console throw was tried and dropped: `parseShip` rejects any layout without exactly one station per kind ("expected exactly 7 stations, one per kind"), so that path is defensive only. The interface text says so too.

## Also changed

- Task 2 expected count: 16 duel tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md

<!-- end -->
