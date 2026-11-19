# Round 1 response (implementation revised, commit 22d23bdb)

Reviewed `round-1.json` against the subject at the brief commit. 3 accepted, 0 rejected, 0 deferred.

## R1-F1 [P3]: The snapshot validator lets a non-crew slot hold a MANUAL burst aim, which would make the Hunter fire a MANUAL beam

Confirmed: hash.ts checked `laserAim` only against `laserBurst`. validateTacticalValues now rejects `laserAim` != -1 on any slot but CREW_SLOT ("only the crew laser has a manual aim"). New case in tests/manualLaserMode.test.ts: a Hunter slot with `laserBurst` 1 and `laserAim` 7. It was RED before the fix ("expected [Function] to throw"). A crew-slot case keeps the "no burst pending" bound covered.

## R1-F2 [P3]: Online gap events read the laser mode once, at the end of the gap, for every shot in it

Accepted as Decision 13's approximation, with no behaviour change. It affects only how a replica labels a hit; the sim is unaffected. The limitation is now written in gapEvents' doc comment in app/duel/onlineSource.ts: the mode is read once per gap, and a MANUAL hit on a room already at level 2 draws with no room callout.

## R1-F3 [P3]: No test for a mode change mid-burst or for the per-round reset of the aim

Confirmed. tests/manualLaserBeam.test.ts now has two mid-burst toggle tests:
- a MANUAL burst toggled to AUTO follows the stored aim;
- an AUTO burst toggled to MANUAL hits the lock room.

tests/manualLaserScene.test.ts bumps the scene epoch and expects the laser aim cleared. All three pass; no bug found.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/sim/tactical/hash.ts
- src/renderer/src/app/duel/onlineSource.ts
- tests/manualLaserMode.test.ts
- tests/manualLaserBeam.test.ts
- tests/manualLaserScene.test.ts

<!-- end -->
