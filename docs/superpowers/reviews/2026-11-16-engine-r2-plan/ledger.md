# Ledger: engine-r2-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The duel continuation proof's 'missile in flight at the split' precondition becomes always true after Task 3 | fixed:R1 | 0 | Task 3 changes tests/duelCheckpoint.test.ts:39 to m.active (Modify list + git add); grep found no other null/?. checks on the pool |
| R1-F2 | P2 | No targeted test pins owner-order missile resolution when pool entries are out of owner order | fixed:R1 | 0 | two tacticalSlots tests with pool entries out of owner order (same-tick expiry; touching missiles), both fail under entry-order resolution |
| R1-F3 | P2 | The duel snapshot validator does not pin the duel's slot identity (active, cls, target) | fixed:R1 | 0 | validateDuelSnapshot pins ships.length 2, both active, cls = DUEL_CLASSES[i], target = 1-i; 5 rehashed rejection cases |
| R1-F4 | P2 | Spec §5's 'present: [b, b]' and two-ship telemetry stay pairs without a stated deviation | fixed:R1 | 0 | Decision 15: presence per player and DuelTelemetry crew/enemy pair until R-5, sites listed, deviation from spec §5 noted |
| R1-F5 | P3 | Body-only comparisons in tacticalSoloFlight silently stop covering the systems record | fixed:R1 | 0 | tacticalSoloFlight body-only comparisons also compare the systems record |
| R1-F6 | P3 | The oracle never checks the values of the declared-added fields | fixed:R1 | 0 | test asserts ships.length/active/cls/target at every tick of the duel golden (15,772 ticks) |
| R1-F7 | P3 | The codemod's import sort depends on the locale | fixed:R1 | 0 | codemod uses localeCompare(..., 'en'); output unchanged |
