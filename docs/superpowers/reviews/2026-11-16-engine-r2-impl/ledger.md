# Ledger: engine-r2-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The bump proof never ties the duel oracle baseline to the pinned duel golden | fixed:R1 | 0 | blessRefusal refuses a bump unless every stale artifact is at SIM_VERSION-1; duel baseline records hashDuel every 600 ticks of scripted-1 and a bump requires hashes, ticks, outcome, seed, cadence and version to equal duel-1.json (sector baseline tied to basic.json the same way); old baselines refused; unit tests for every case; proven end to end against the v37 golden from a scratch worktree at bc3d94e |
| R1-F2 | P3 | Bless with every pinned artifact deleted runs neither proof | fixed:R1 | 0 | a missing pinned artifact is refused by name unless npm run bless -- --fresh; documented in docs/gates.md; tested |
| R1-F3 | P3 | The oracle never checks that its schema covers the whole flattened duel | fixed:R1 | 0 | recordRun throws if the schema count differs from flattenDuel length - 1; tested with a short schema |
| R1-F4 | P3 | Two H-1 view spots still hard-code slot 1 as 'the other ship' | fixed:R1 | 0 | enemy arrow uses targetOf(state, CREW_SLOT); hitsCrew uses e.ship !== CREW_SLOT with an R-3/R-5 comment; view tests unchanged |
