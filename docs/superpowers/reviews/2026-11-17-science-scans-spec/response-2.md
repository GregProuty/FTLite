# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject. 3 accepted (R1-F6 reopened, R2-F1, R2-F2), 0 rejected. 11 prior IDs resolved.

## R1-F6 [P1]: The SIM_VERSION two-step (reopened)
Confirmed: src/renderer/src/sim/tuning.ts:7 is 44 after the start-aboard merge 69f34c27. Spec 6.3 now says 44 -> 45 with MIGRATIONS[44]; step 2 blesses at 45; section 8 names MIGRATIONS[44].

## R2-F1 [P1]: Step-1 neutral derelict fails validation
Confirmed: orbitR 0 is outside the 6.2 bands. Step 1 now uses orbitR 700, phase 0, loot 0, trapped 0, salvage 0, salvaged 1; a step-1 snapshot round-trip test is added.

## R2-F2 [P2]: scanner versus contactScan admission
Confirmed. Spec 4.6: scanner is computed after the contactScan admission loop, from the scan after admission; a same-tick takeover test is added.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-science-scans-design.md

<!-- end -->
