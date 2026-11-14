# Ledger: helm-h0a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Stabilise cancels gravity applied during the same tick | fixed:R1 | 0 | Task 3 flyShip: stabilise removes only the skid captured at release (released/skidBudget/skidSign on Ship, flattened); runs before forces; 3 new tests (falls at rest, orbit kept, budget only); spec §6 row amended |
| R1-F2 | P1 | Mixed contacts resolve in a different body order from the spec | fixed:R1 | 0 | Task 4 resolveContacts: ship 0 statics, pair, ship 1 statics (spec §4 per-body order); new test: pushed ship cannot end inside the planet; decision 7 |
| R1-F3 | P2 | The Engines-factor test never checks damaged turn rate | fixed:R1 | 0 | Task 3 Engines test asserts heading+headingAcc after 60 ticks = TURN_STEPS_PER_TICK*60*factor for levels 0-2 |
