# Ledger: 2026-11-19-w4b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Decision 4 makes the AUTO pew fire a three-round burst when every hold ends, which spec §4.3 rules out | fixed:R1 | 0 | Decision 4 rewritten: pewAutoReady (full, or a third just completed) in pew.ts; AUTO fires one round per charged third, no burst; Task 6 tests rewritten |
| R1-F2 | P1 | Task 4 expects the pew's solution at bearing 40 to be 40×256, but the lead from the muzzle is heading 42 | fixed:R1 | 0 | Task 4 asserts turretOffset(0, pewLead(...)) (42x256, muzzle parallax) |
| R1-F3 | P1 | Task 6 turns every AUTO-trigger test red, including Task 4's own, with no rewrite named | fixed:R1 | 0 | Task 6 names the kind (a) rewrites: w4PewFire (MAN), w4Autocannon (tickGun auto=true; heat case MAN with MAN row), w4Turret round test; files in Task 6 |
| R1-F4 | P1 | Task 5 gates LMB and gunHeld on MAN and so turns W-4a's runtime and online tests red; Step 9 says they pass | fixed:R1 | 0 | Task 5: W-4a's w4Runtime and onlineDuelSession Hound cases press Z first (kind a); files in the run list and commit |
| R1-F5 | P1 | Task 7 adds `turret` to createDuelRuntime's returned literal but not to the `DuelRuntime` interface, so tsc fails | fixed:R1 | 0 | Task 7 declares turret(slot) in interface DuelRuntime; W-4a plan also fixed for weaponSel (7285fc65) |
| R1-F6 | P2 | The W-4b/W-4c seam: W-4c anchors on `turret()`, a void-returning MAN branch and a trigger text that W-4b does not leave | fixed:R1 | 0 | new Seam for W-4c section; W-4c plan amended to match (c8ef8826) |
| R1-F7 | P2 | Task 10: a kept rung turns pinned tests red with no rule, and the `1 ¦ 2` knob may not compile | fixed:R1 | 0 | Task 10 kept-rung test updates named; knob declared 1 as 1 ¦ 2 |
| R1-F8 | P2 | Outline test bodies and 'check at execution' notes are left for the executor | fixed:R1 | 0 | Task 8 w4Map written in full; Task 5, 7 and 9 cases written in full; Task 3 noop hedge and Task 8 enemyShown hedge resolved |
| R1-F9 | P3 | The self-review's note on W-4a's trigger closure is stale, and Task 5 quotes a placeholder instead of W-4a's text | fixed:R1 | 0 | Task 5 quotes W-4a's triggerNow() line; stale self-review bullet removed |
