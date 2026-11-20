# Ledger: net-4a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | The trim drops every unacknowledged entry before an anchor exists, so P never builds its lead (lead stays 0-3 ticks at any RTT over one cadence gap) | resolved | 0 | Task 4: entries leave the log only by acknowledgement (anchor) or PREDICT_LOG_MAX; entries mapped <= T keep heldSequence, give commands forward; plan deviation 2 recorded; confirmed R2 |
| R1-F2 | P1 | Task 9 deletes `unackedFrames`, but `turret()` still reads it, and the turret/vent tests that read the source are neither rewritten nor deleted | resolved | 0 | Task 6 keeps every non-drawing member on replica() until Task 9; Task 9 removes gunModeSent/lockSent/gunModeBase, turret reads P, W-4 tests rewritten or deleted (blur case deleted); confirmed R2 |
| R1-F3 | P1 | Task 7's 'first tick takes the presses' test uses the Cutter's Weapons seat, where Space sends nothing | resolved | 0 | Task 7 test uses rig(1,...,ShipClass.ValkyrnLaser); confirmed R2 |
| R1-F4 | P1 | Task 10's record test validates a record whose summary is only `{ round, seed }`; the strict summary schema rejects it | resolved | 0 | Task 10 test validates only duelRecordSchema.shape.prediction; confirmed R2 |
| R1-F5 | P1 | The impaired link imports `createRng`/`nextFloat` from `src/renderer/src/sim/rng`, which does not exist | resolved | 0 | impairedLink imports from src/shared/rng; check-at-execution note removed; confirmed R2 |
| R1-F6 | P2 | The sector schema bump breaks fixtures not in Task 1's list (encounterMode, sessionCapture) | resolved | 0 | Task 1 step 4: encounterMode and sessionCapture literals read the definition; grep for others; sessionCapture added to the run; confirmed R2 |
| R1-F7 | P2 | `heldKey` omits `weaponSel` and `turretAim`, so 'verified' can pass with the partner's newer reticle or selection unused | resolved | 0 | HELD_KEYS lists all 12 W-4 fields with a compile-time completeness check; heldKey exported and unit-tested; confirmed R2 |
| R1-F8 | P2 | Task 9 has the session's 'decided', rematch and leave prompt read P, contrary to §3.6 (outcome from C) | resolved | 0 | Task 9: decided, leavePromptKeys and the guard read confirmed c; console decisions read P; confirmed R2 |
| R1-F9 | P2 | Task 1's first test waits too few ticks for a cadence publication that includes the latched frame | resolved | 0 | Task 1 tests wait w.tick(6); confirmed R2 |
| R1-F10 | P2 | The gate tests run thousands of full-stack ticks with no timeout, under vitest's default 5 s | resolved | 0 | Task 5 and 11 gate describes take timeouts and a setImmediate yield per case; confirmed R2 |
| R1-F11 | P3 | Plan deviation 1 lets a 1-2 tick mapping error persist indefinitely | deferred | 0 | P3: stats() exposes measured and standing; a lasting gap is visible to tests and the playtest; revisit if G1(c)/G4 show recurring corrections |
| R1-F12 | P3 | F3's RESIM figure is the p99 of all confirms, and a link close does not dispose the predictor | resolved | 0 | Task 7 close handler disposes the predictor; Task 10 F3 uses liveResim; confirmed R2 |
| R2-F1 | P3 | Task 9 deletes predictTurret 'and its test cases' without naming the file that holds them | fixed:R2 | 0 | Task 9 names tests/w4Online.test.ts's predicted-turret describe; file in Files, run and grep |
| R2-F2 | P3 | The rewritten lock test's stand part now passes trivially | fixed:R2 | 0 | stand part asserts no new lock is sent |
