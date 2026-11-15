# Round 1 response (code fixed)

Reviewed `round-1.json` against the branch. 2 accepted (1 P1, 1 P2), 0 rejected, 0 deferred. Both were confirmed in `runtime.ts`.

## R1-F1 [P1]: Escape can advance due ticks before pausing

Confirmed: `frame()` called `driver.pump()` before applying the Escape edges, so a late frame ran every due tick before pausing. `frame()` now applies the pause presses and calls `sync()` first, then `driver.pump()`, which does nothing while paused, then computes alpha. New test: with 30 ticks due and an Escape in the same frame, the runtime is paused and the tick stays at 0.

## R1-F2 [P2]: Wheel remainder survives an idle gap without render frames

Confirmed: `lastWheelAt` was updated before the idle check, so a frame with wheel input after a gap never cleared the old remainder. The idle gap is now checked, and the accumulator cleared, before the new timestamp is recorded. New test: 60 px, then 300 ms with no frames, then 60 px: no notch.

## Also changed

- Verified with `npm run typecheck` (clean) and `npm test` (1,877 passed).

## Files changed

- src/renderer/src/app/duel/runtime.ts
- tests/flightRuntime.test.ts

<!-- end -->
