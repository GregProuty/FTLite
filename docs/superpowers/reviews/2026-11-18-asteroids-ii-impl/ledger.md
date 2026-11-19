# Ledger: asteroids-ii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The born mask outlives its tick, and the scripted pair reads it before the next tick clears it, so a restored run can diverge from the uninterrupted run | fixed:R1 | 0 | 8156d631: masks cleared at the end of stepDuel too; tests/rockMaskBetweenTicks.test.ts (live vs clone lineOfSight, masks zero after step) |
| R1-F2 | P2 | Tests for three spec rules (pair once per tick, ship-rock inverse masses, static ram damage) would not catch a regression | fixed:R1 | 0 | 45f74556: three-body once-per-pair test, r15 unequal-mass impulse test, static ram hp assert; each mutation-proven |
| R1-F3 | P3 | A missileLaunch admitted against a rock target can do something else when a laser shot earlier in the same tick breaks that rock | fixed:R1 | 0 | 670e8421: launch skipped when the rock target broke earlier in the same applyWeaponsInput; plan deviation 11 |
