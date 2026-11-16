# Ledger: engine-r1a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Tie the message codec’s snapshot type to its wire schema | deferred | 0 | P2; carried to R-1b, which adds the duel ModeWire: changing ModeWire/codecFor now would break the reviewed R-1b plan's interfaces; R-1b also needs per-mode endRecord/cue schemas on ModeWire (Opus final review) |
