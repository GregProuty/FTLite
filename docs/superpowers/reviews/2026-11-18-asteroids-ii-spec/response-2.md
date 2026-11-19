# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at HEAD. 5 accepted, 0 rejected, 0 deferred; all 11 round-1 IDs confirmed resolved.

## R2-F1 [P2]: Ram damage still runs in the single-ship flight paths

Confirmed (physics.ts:L67-L79 call contacts but never stepRocks). §3.1 now says those paths keep today's hitStatic exactly: no wake, no ram damage, no break, no born mask.

## R2-F2 [P2]: missileLaunch admission vs a same-tick rockLock(torpedo)

Confirmed (step.ts:L187 admits before folding). §6.1 now has admission use the effective torpRock (the last accepted rockLock(torpedo) this tick, else the stored value).

## R2-F3 [P2]: rocksBroken can count one break twice

Confirmed. §8 counts +1 per break once, at the break; overflow-piece dust is not a break.

## R2-F4 [P3]: §9.4 piece floor is met by the direct hit alone

Confirmed (the largest belt rocks are above 35). The floor is now 8 pieces.

## R2-F5 [P3]: born-slot blocker and off-target manual shot

Confirmed. §6.2: firstBlocker skips born slots, and a manual shot with an off-target rock lock follows today's miss path.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-asteroids-ii-design.md

<!-- end -->
