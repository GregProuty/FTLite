# Codex review: 4-i plan Tasks 2 to 4 (2026-11-10)

1. **Medium — [plan line 627](/C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-director.md:627): Missing-console routing fixture throws before its assertion.** After Doors is removed, `parseShip(noDoors)` throws `Invalid ship: stations: expected exactly 7 stations, one per kind`. **Fix:** create a normal state, set `s.derived.stationOfKind[StationKind.Doors] = -1`, then assign the stale idle counter and assert the weights. This exercises Task 1’s missing-console routing branch without failing schema validation.

No other findings in scope. In-memory execution of the proposed Task 1 changes confirmed the snapshot assertions, continuation transitions at ticks **4652 and 5252**, and the **72000-tick soak**. Neither bot became Downed; the soak took approximately **0.18 seconds** excluding Vitest overhead. The timeout option syntax is supported by installed Vitest 3.2.7.
