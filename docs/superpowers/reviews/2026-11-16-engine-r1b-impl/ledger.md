# Ledger: engine-r1b-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Missile members are outside the completeness guard, so a new Missile field would be silently dropped by clone and restore | fixed:R1 | 0 | MISSILE_KEYS satisfies keyof Missile + compile-time exhaustiveness const; completeness test walks seed 7 tick 5156 missile against MISSILE_KEYS with a planted-extra assertion |
| R1-F2 | P2 | Nothing checks duelEndSummary's field mapping; the continuation proof uses expect.any for every pair | fixed:R1 | 0 | continuation proof asserts the plan's exact seed-7 summary; new tests/duelSummary.test.ts maps distinct per-ship numbers through every field and checks frozen arrays; bites on a swapped ship index |
| R1-F3 | P3 | The duel EndRecord is narrowed to never-null against the spec and plan, and the cause enum is duplicated | fixed:R1 | 0 | never-null duel record kept and recorded in plan Decision 7 and the spec change log; codec imports TERMINAL_CAUSES from sim/duel/summary.ts |
| R1-F4 | P3 | Stale test reference in the ModeWire doc comment | fixed:R1 | 0 | doc comment names tests/codecModeWire.test.ts |
| R1-F5 | P3 | Each duel publication rebuilds the map and grid, and the interior field list is rebuilt on every flatten | deferred | 0 | P3 performance only: cache the regenerated tactical shape/mapHash per seed and the interior field list per layout; before H-2 streams duels at scale |
