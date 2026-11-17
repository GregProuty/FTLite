# Round 1 response (fixes in 5b3c1ff)

Reviewed `round-1.json` against the branch at `526ebb7`. 2 accepted, 0 rejected, 1 deferred. `npx tsc -b` is clean and the full suite passes (3463 tests, 244 files).

## R1-F1 [P1]: The white flash stays on when the sim tick stops

Confirmed: interiorFeel.ts bounded the flash only by `state.tick - flashTick`, and app/duel/runtime.ts stops stepping once the duel has ended. In 5b3c1ff, `interiorFeel.draw(frame, dt, realDt)` sets `flashLeft = FLASH_TICKS / TICK_HZ` on a hit and drains it by the real dt, and the flash shows only while both `ticksSince < FLASH_TICKS` and `flashLeft > 0`. The hitstop still does not extend it. renderer.ts and duel/interiorView.ts pass the real dt. New test: the tick is held for 10 frames after a hit and the flash is hidden. The existing advancing-tick flash test still passes.

## R1-F2 [P3]: A pause freezes the shake offset and any running hitstop

Confirmed against impactModel.ts stepShake and presentClock.advance(0). While paused (presentation dt 0, real dt > 0) the shake offset is now {0,0} and drains on real time. A new `PresentClock.drain(seconds)` ends a running hitstop on real time without advancing `t`, so AnimatedSprites resume as Decision 17 says. New test.

## R1-F3 [P3]: Per-frame rebuilds and allocations in interiorFeel

Deferred, as the reviewer suggested ("not needed before merge"). The sizes are small: about 68 stars, a handful of sources and a few room tiles. Caching the stars, reusing the source objects and keeping the seen buffers are a performance follow-up.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/render/interiorFeel.ts
- src/renderer/src/render/presentClock.ts
- src/renderer/src/render/renderer.ts
- src/renderer/src/render/duel/interiorView.ts
- tests/interiorFeel.test.ts

<!-- end -->
