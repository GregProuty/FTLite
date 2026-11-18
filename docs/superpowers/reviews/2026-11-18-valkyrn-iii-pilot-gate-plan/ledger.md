# Ledger: valkyrn-iii-pilot-gate-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The throttle sent on the stand tick is always rejected 'invalid-seat', so requireApplied throws and the repair test fails | fixed:R1 | 0 | Decision 7: stand takes two ticks (throttle-down while seated, then stand alone), stateless on d.throttle; pilot code and repair test rewritten; swap-order fallback deleted |
| R1-F2 | P1 | Part i freezes GUN, the class and its slots, so the in-process sweep throws and Task 1 Step 3's expected 'frozen false false' is wrong | fixed:R1 | 0 | Decision 10 rewritten: sweep rewrites the four tuning.ts lines and runs --json in a child (node tsx cli), restores in finally/SIGINT; frozen pre-flight and setKnobs removed; Task 4 Step 3 git diff --quiet check |
| R1-F3 | P1 | The lead agreement test calls Part ii's leadPip as (state, 0), but Part ii's signature is nine numbers | fixed:R1 | 0 | viewOffset calls leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed); 'if the signature differs' text removed (Task 1 Step 5, self-review) |
| R1-F4 | P1 | Tuning the counters breaks Part i's tests/valkyrnRounds.test.ts, which Step 6's grep does not find and Task 4 never runs | fixed:R1 | 0 | Task 4 Step 6 names valkyrnClasses/valkyrnGun/valkyrnRounds literal pins and how to rewrite them; Step 8 runs tests/valkyrn*.test.ts; Step 10 adds them by name |
| R1-F5 | P2 | Stage B's 'best Stage A pair' is undefined when Stage A has no PASS line | fixed:R1 | 0 | Task 4 Step 3 defines the Stage A pick for PASS, no-PASS-with-hunter, and no-hunter cases with tie-breaks |
