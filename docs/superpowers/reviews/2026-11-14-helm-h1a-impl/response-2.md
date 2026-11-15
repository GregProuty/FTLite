# Round 2 response (code fixed)

Reviewed `round-2.json`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R1-F1 and R1-F2 resolved.

## R2-F1 [P1]: Late Escape frame catches up all queued ticks on resume

Confirmed against `authority/tickDriver.ts`: `setPaused(true)` keeps the debt already accrued, and `setPaused(false)` resumes and pumps it. The driver has no call to drop that debt, and `authority/` must not change in H-1. The runtime now disposes its driver whenever a pause reason is set and creates a fresh one at the current wall time when the last reason clears, so nothing queued survives a pause. `frame()` pumps only when a driver exists, and `dispose()` sets a flag so a later resume cannot recreate one. The Escape test is extended: 30 ticks due, Escape, a 1.5 s pause, then resume runs no ticks, and stepping restarts one tick after the resume.

## Also changed

- Verified with `npm run typecheck` (clean) and `npm test` (all passing).

## Files changed

- src/renderer/src/app/duel/runtime.ts
- tests/flightRuntime.test.ts

<!-- end -->
