
## Final whole-branch review fixes
- useNow(periodMs, phaseMs): phase-aligned re-render; Countdown phase retryAtMs%1000; MirrorLine phase from elapsed age. Spec "Timers" paragraph rewritten.
- MenuState.resetEpoch (returnHome bumps it); UiRoot key includes it. Menu-fallback test via a throwing object localError that deps.home clears.
- Thinned assertions restored (guest Ready enabled, forgetSeatNow, incompatible wording + Retry, second Single player). Plan deviation 6 documents the form improvements.
- RED: before the fixes the new countdown/mirror/fallback/resetEpoch tests failed (countdown showed 3s at +500; fallback stayed). GREEN after.
- `npx vitest run` on the six covering files: 6 files, 240 tests pass, no act warnings; `npm run typecheck` clean. No main.ts or data-testid change.
- Concern: the mirror phase is computed at render, so a status change re-arms the timer (intended).
