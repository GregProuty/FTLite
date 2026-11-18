# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `3f4bf7b6`. 2 accepted, 0 rejected, 0 deferred. Every prior ID is confirmed resolved.

## R3-F1 [P2]: Missile hits raise Room damage inside stepDuel before the clamp

Confirmed (tactical/duel.ts:L34-L35 runs resolveMissiles then tickWeapons; missiles.ts:L93). I took option (b). §2 adds a tactical helper `effectiveBars = min(bars, max(0, slots − rooms × knock))`, which every ship-0 reader uses, so a Room hit inside stepDuel gates at once as today. Failure needs no tactical check because overheat zeroes the bars inline. The §7 clamp wording now says the step-8 clamp is bookkeeping.

## R3-F2 [P3]: scan.rate role

Confirmed (science.ts:L15). §2 says scan.rate keeps today's base rate for the takeover comparison and is no longer added to progress, which comes from the table row chosen by `by`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-engineering-spike-design.md

<!-- end -->
