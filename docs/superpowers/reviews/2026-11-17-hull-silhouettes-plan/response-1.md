# Round 1 response (plan revised)

Reviewed `round-1.json` against `18246c2`. 4 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: Blink phase not guaranteed

Confirmed: capture time depends on load time. The phase is now pinned in the page with &phase=a|b, as proposed.

## R1-F2 [P2]: Output folder

Confirmed (all.mjs takes the folder as argv; the CRT Step 4 copied refs into crt-map). Step 3 now has the commands in full, targeting hull-silhouettes, with no copy step.

## R1-F3 [P3]: interiorCamera

Confirmed (scene.ts L35, runtime.ts L227). The import and the field are now given verbatim.

## R1-F4 [P3]: Interfaces and RED

Confirmed and fixed.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-hull-silhouettes.md

<!-- end -->
