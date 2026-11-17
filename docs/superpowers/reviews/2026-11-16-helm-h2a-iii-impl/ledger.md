# Ledger: helm-h2a-iii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Reconnect and retry from a saved sector seat skip the sector test-only gate (minor a) | resolved | 0 | reconnect/retry/resume refuse a sector mode without sectorTestEntry; reconnect/retry not listed for a saved sector seat when the gate is off; gate test (07d7fa4); confirmed R2 |
| R1-F2 | P2 | A Space release during a pause is lost and is never re-sent, so the charge stays held after resume | resolved | 0 | release re-sent whenever Space is up and the replica shows the charge held >250 ms; session test; confirmed R2 |
| R1-F3 | P2 | A link close with no matching status push freezes the view without 'CONNECTION LOST — RECONNECTING' (minor c) | resolved | 0 | linkClosed flag: CONNECTION LOST shows at once on close; frozen copy preferred; cleared on attach; session test; confirmed R2 |
| R1-F4 | P2 | The record's jitter is not per round, and it includes the reconnect gap | resolved | 0 | takeArrivals drained per record; no gap across an attach; session test; confirmed R2 |
| R1-F5 | P2 | The online duel session (Decisions 7–9) has no unit tests; only the pure leave-prompt function is tested | resolved | 0 | tests/onlineDuelSession.test.ts (7 tests) plus pure duelRecordCallAllowed tested; each fails without its fix; confirmed R2 |
| R1-F6 | P3 | `duel:record` appends without a rate or file-size bound (minor b) | resolved | 0 | appendDuelRecord refuses past 16 MiB per day; test; confirmed R2 |
| R1-F7 | P3 | Single player sends live held axes on the end card, while online sends neutral (minor e) | resolved | 0 | Single player sends neutral held on the end card; duelRuntime test; confirmed R2 |
