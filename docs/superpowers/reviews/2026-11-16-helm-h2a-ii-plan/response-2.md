# Round 2 response (plan revised)

Reviewed `round-2.json`. 1 accepted, 0 rejected, 0 deferred; R1-F1 to R1-F5 confirmed resolved.

## R2-F1 [P2]: The no-watchdog assertion sees only the journal since the last 300-tick baseline, not the whole round

Confirmed against `src/renderer/src/authority/core.ts` (the baseline resets every 300 ticks and clears `frames`). The ten-seed loop now counts watchdog frames from `rig.authority.replay()` every 250 ticks, adds the final window's count, and expects 0; Decision 8 says "during the round".

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md

<!-- end -->
