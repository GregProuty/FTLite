# Ledger: helm-h2a-ii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The ten-seed watchdog check reads only about half of each round's journal | resolved | 0 | watchdog frames read when authority tick % 300 === 299 (each window before its reset) plus the final window; windows count asserted (7d7fd1d); confirmed R2 |
| R1-F2 | P2 | The ten-seed proof never asserts that each seat produced input | resolved | 0 | heldHighWater[seat] > 0 for each seat and an applied command; per-seat applied command dropped: the Helm can fly on held input alone; confirmed R2 |
| R1-F3 | P3 | A presence still pending when another player pauses re-pauses with peer-lost after the resume (minor c) | resolved | 0 | steward clears lost whenever the publication is paused, before the pending return; new test fails without it; confirmed R2 |
| R1-F4 | P3 | validateDuelPublication's doc promises a tick check it does not make | resolved | 0 | validateDuelPublication checks tick and hash against the snapshot; doc updated; confirmed R2 |
| R1-F5 | P3 | A replica replacement validates the publication twice | deferred | 0 | P3 cost only: a replica replacement (first publication, new round) validates twice; per-publication restores validate once |
