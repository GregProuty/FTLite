# Ledger: 2026-11-19-w4b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Decision 4 makes the AUTO pew fire a three-round burst when every hold ends, which spec §4.3 rules out | resolved | 0 | Decision 4 rewritten: pewAutoReady (full, or a third just completed) in pew.ts; AUTO fires one round per charged third, no burst; Task 6 tests rewritten; confirmed R2 |
| R1-F2 | P1 | Task 4 expects the pew's solution at bearing 40 to be 40×256, but the lead from the muzzle is heading 42 | resolved | 0 | Task 4 asserts turretOffset(0, pewLead(...)) (42x256, muzzle parallax); confirmed R2 |
| R1-F3 | P1 | Task 6 turns every AUTO-trigger test red, including Task 4's own, with no rewrite named | resolved | 0 | Task 6 names the kind (a) rewrites: w4PewFire (MAN), w4Autocannon (tickGun auto=true; heat case MAN with MAN row), w4Turret round test; files in Task 6; confirmed R2 |
| R1-F4 | P1 | Task 5 gates LMB and gunHeld on MAN and so turns W-4a's runtime and online tests red; Step 9 says they pass | resolved | 0 | Task 5: W-4a's w4Runtime and onlineDuelSession Hound cases press Z first (kind a); files in the run list and commit; confirmed R2 |
| R1-F5 | P1 | Task 7 adds `turret` to createDuelRuntime's returned literal but not to the `DuelRuntime` interface, so tsc fails | resolved | 0 | Task 7 declares turret(slot) in interface DuelRuntime; W-4a plan also fixed for weaponSel (7285fc65); confirmed R2 |
| R1-F6 | P2 | The W-4b/W-4c seam: W-4c anchors on `turret()`, a void-returning MAN branch and a trigger text that W-4b does not leave | resolved | 0 | new Seam for W-4c section; W-4c plan amended to match (c8ef8826); confirmed R2 |
| R1-F7 | P2 | Task 10: a kept rung turns pinned tests red with no rule, and the `1 ¦ 2` knob may not compile | resolved | 0 | Task 10 kept-rung test updates named; knob declared 1 as 1 ¦ 2; confirmed R2 |
| R1-F8 | P2 | Outline test bodies and 'check at execution' notes are left for the executor | resolved | 0 | Task 8 w4Map written in full; Task 5, 7 and 9 cases written in full; Task 3 noop hedge and Task 8 enemyShown hedge resolved; confirmed R2 |
| R1-F9 | P3 | The self-review's note on W-4a's trigger closure is stale, and Task 5 quotes a placeholder instead of W-4a's text | resolved | 0 | Task 5 quotes W-4a's triggerNow() line; stale self-review bullet removed; confirmed R2 |
| R2-F1 | P1 | Task 7's new online prediction case assumes the replica's Hound faces heading 0, but the spawn heading depends on the seed | fixed:R2 | 0 | Task 7 online case aims 2000 steps right of the replica's spawn heading; asserts 0 < p <= 2000 in 455 steps |
| R2-F2 | P2 | Task 10's commit names tests/w4Auto.test.ts for rung 4, but the first-seated-tick test lives in tests/duelScripted.test.ts | fixed:R2 | 0 | commit placeholder names duelScripted.test.ts; w4Loadout note |
| R2-F3 | P3 | The w4Autocannon rewrite names the wrong lines: the interval case drives TRIGGER through gaps(), and the heat-lock case pins no interval | fixed:R2 | 0 | w4Autocannon rewrite names gaps() and the direct TRIGGER calls; heat case needs no re-pin |
| R2-F4 | P3 | The self-review's Placeholders bullet is stale after R1-F8 | fixed:R2 | 0 | self-review Placeholders bullet rewritten |
