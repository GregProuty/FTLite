# Ledger: art-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P3 | The 'deterministic' check only reads propSlots' own cache, so it proves nothing | fixed:R1 | 0 | determinism test clones slots and evicts the cache with another ship before recomputing |
| R1-F2 | P3 | Decision 5 says the starter slots are pinned in the test, but the test only counts them | fixed:R1 | 0 | Decision 5 reworded: Cutter and Skiff pinned exactly, starter as computed (counts tested) |
| R1-F3 | P3 | The packs countColours test decodes every real pack twice under the default 5 s timeout | fixed:R1 | 0 | packs countColours test memoises the reader and has a 30 s timeout |
| R1-F4 | P3 | The sector view rebuilds the propKey string every frame | fixed:R1 | 0 | propLayer.draw returns early on the same layout object before building propKey |
