1. **Medium — `fireBeam` allows a seated operator to fire with Weapons failed or unpowered, consuming stored charge and rolling the 55% base hit chance.** Task 3, Step 3: [plan:873](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-debris-loop.md:873) checks charge and target only; [console.ts:48](C:/Users/djuar/FTLite/src/renderer/src/sim/console.ts:48) has no online guard, and [stations.ts:13](C:/Users/djuar/FTLite/src/renderer/src/sim/stations.ts:13) merely returns zero output. **Fix:** reject missing, offline, or unoccupied Weapons before reading the cursor or consuming RNG/charge.

Compile compatibility: no mismatches found in the scoped files by static inspection.
Import cycles: none newly introduced after applying Task 3’s explicit `dir.ts` extraction; `step ↔ console` already exists.
Debris logic: no additional defects established in detection, removal retargeting, impact fallback, or immediate `downCrew` ordering.
Charge: accumulation, clamping, and retention appear consistent.
Flatten/unflatten: added sizes and field order match.
