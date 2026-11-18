# Ledger: asteroids-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 10's SPLIT finder crashes under tsx: duelInit reads the vitest-only __GAMEPLAY_CONTENT_DIGEST__ global | resolved | 0 | Task 10 Step 7 finder sets __GAMEPLAY_CONTENT_DIGEST__ via build/contentDigest computeContentDigest before duelInit; confirmed R2 |
| R1-F2 | P2 | lineOfSight (laserEligible) still sees born pieces while firstBlocker skips them | resolved | 0 | Task 4: lineOfSight skips born slots (geometry.ts), test added, deviation 5a; confirmed R2 |
| R1-F3 | P2 | Eviction dust is indistinguishable from break dust, which inflates §9.4 breaks, break shakes and the sound budget | resolved | 0 | dustRock evicted flag, event field evicted?: true, shakes/sounds/feelShot skip it, eviction test asserts it, deviation 2 updated; confirmed R2 |
| R1-F4 | P2 | Tasks 10-11 leave two loop exits open: p99 still failing after the grid, and a sim fix found after the bless | resolved | 0 | Task 11 p99 re-run once then BLOCKED; Task 10 Step 8 same-version re-bless + duelGates after any sim fix; confirmed R2 |
| R1-F5 | P3 | Stale line references for duel.ts and missiles.ts | resolved | 0 | duel.ts:26, missiles.ts:8, 15-26, 28-33, 46-61, 109-113; confirmed R2 |
