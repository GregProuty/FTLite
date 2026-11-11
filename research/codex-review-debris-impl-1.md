1. **Low — Weapons tests do not verify the required single combat draw.** [console.test.ts:167](/C:/Users/djuar/FTLite/tests/console.test.ts:167) and [weapons.test.ts:68](/C:/Users/djuar/FTLite/tests/weapons.test.ts:68) only check that RNG state changed; an extra draw would pass despite violating [spec:125](/C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-10-debris-loop-design.md:125). **Fix:** advance a cloned combat stream once and compare its exact state after both hit and miss.

2. **Low — The double-impact test does not establish that the second impact leaves newly Downed crew untouched.** At [debris.test.ts:171](/C:/Users/djuar/FTLite/tests/debris.test.ts:171), health is already clamped to zero, so repeated damage or another `downCrew` call produces the same asserted result; this under-verifies [spec:72](/C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-10-debris-loop-design.md:72). **Fix:** use a lethal first impact on a seated Navigator, then assert the second impact draws no combat roll; add a lethal Medbay impact through `step()` to verify healing cannot rescue them.

Correctness: no concrete implementation bug found in ordering, retargeting, guards, fallback, downing, cap accounting, or slot reuse.  
State/hash: no omitted new authoritative fields found.  
HUD model: no section 8 mismatch found after section 12 amendments.  
Boundaries/RNG: no forbidden imports, calls, or stream use found.  
Tests: no assertion-free cases or problematic float-boundary probes found; forced RNG states select explicit outcomes.

Reviewed `28370a5..7173fce` by reading code; excluded bodies skipped as requested. Tests were not run.
