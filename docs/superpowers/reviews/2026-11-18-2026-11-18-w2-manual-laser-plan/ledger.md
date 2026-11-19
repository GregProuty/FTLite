# Ledger: 2026-11-18-w2-manual-laser-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 4 leaves tests/rockLock.test.ts's shipModule.commands pin unchanged, so its own test run fails | resolved | 0 | see response-1; confirmed R2 |
| R1-F2 | P1 | The new online test calls requests!.aimLaser on a mock typed { pew } only, so `npx tsc -b` fails | resolved | 0 | see response-1; confirmed R2 |
| R1-F3 | P2 | Task 3's shield expectations depend on seed 5's weak frequency not being 0 | resolved | 0 | see response-1; confirmed R2 |
| R1-F4 | P2 | Task 2 Step 7(a) targets the wrong line by number and quotes no old text | resolved | 0 | see response-1; confirmed R2 |
| R1-F5 | P3 | onlineDuel.ts has two state imports; Step 6(a) says 'the state import line' | resolved | 0 | see response-1; confirmed R2 |
