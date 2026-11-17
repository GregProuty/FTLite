# Ledger: science-scans-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Tactical ticks do not restart at 0 on a rematch, so the hostility clock and the derelict orbit break from round 2 | resolved | 0 | startTick (science module), rt = tick - startTick; startRound sets it; rematch test (spec 4.1, 10); confirmed R2 |
| R1-F2 | P1 | A new duel command named `scan` collides with the sector's `scan` in the shared Command union | resolved | 0 | renamed to contactScan (spec 5); confirmed R2 |
| R1-F3 | P1 | Scan progress and 'cancel by leaving' are placed in stepDuel, which can't see seats or presence | resolved | 0 | ShipInput.scanner set by step.ts from attendant(scan.by); science steps in stepDuel (spec 4.6); confirmed R2 |
| R1-F4 | P1 | The hash/snapshot work for the new state is under-specified: validation rejects Patrol and Shield loot, clone would share the new objects, and module placement is unstated | resolved | 0 | spec 6.2: science module field list and order, freq after lock, clone containers, widened validation, DUEL_NOT_SNAPSHOTTED; confirmed R2 |
| R1-F5 | P1 | The derelict's closed-form position has no defined angle units or trig, and the placement draws are ambiguous | resolved | 0 | spec 4.5: heading-unit angle via dirBetween, exact draw order, orbitR bands clear of the belt; confirmed R2 |
| R1-F6 | P1 | The SIM_VERSION two-step is misdescribed and leaves out the migration entry | resolved | 1 | 44 -> 45 and MIGRATIONS[44] (master at 44 after start-aboard 69f34c27); spec 6.3, 8; confirmed R3 |
| R1-F7 | P1 | Contact ids clash with ship slots in the view layer, and pickShip can't return the derelict | resolved | 0 | spec 4 and 7.2: contact ids separate from slots, ContactState.contact, pickContact; confirmed R2 |
| R1-F8 | P1 | Patrol isn't mapped onto ShipInput or tickWeapons; the shield 'no recharge' rule has no named home | resolved | 0 | spec 4.2: Patrol ShipInput, trail kept, repair skipped, tickWeapons holds shield clock; class layers - 1; confirmed R2 |
| R1-F9 | P2 | Rejection reasons and wire shapes are left to the plan; `not-seated` doesn't exist | resolved | 0 | spec 5: invalid-seat, int wire with sim malformed, designate noop, science module lists; confirmed R2 |
| R1-F10 | P2 | Same-tick ordering, scan hand-over and exact tick counts are unstated | resolved | 0 | spec 5 admission phase order, same-tick freq, rate take-over, exact completion tick, hostility at rt 1199; confirmed R2 |
| R1-F11 | P2 | View rules conflict with the enemy window spec and existing keys, and the console types have no 'science' | resolved | 0 | spec 7.2-7.3: T supersedes enemy-window rule, S on Science only, science in ConsoleStation/reach/layout/shown, no aim on Science; confirmed R2 |
| R1-F12 | P2 | The gates have fixed bands, so 'regenerated' and 're-checked' give no rule when the Patrol opening moves them | resolved | 0 | spec 10: bands unchanged; a failure is reported to the owner, no band edits or retune; confirmed R2 |
| R2-F1 | P1 | Step-1 neutral derelict (orbitR 0) fails the new §6.2 validation, so step-1 snapshots cannot restore | resolved | 0 | step-1 neutral derelict orbitR 700 salvaged 1; step-1 snapshot test; confirmed R3 |
| R2-F2 | P2 | The spec doesn't say whether `scanner` is computed before or after contactScan admission, and a takeover in the same tick depends on it | resolved | 0 | scanner computed after contactScan admission; same-tick takeover test; confirmed R3 |
