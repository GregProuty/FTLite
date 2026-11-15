# Ledger: helm-h0c-ii-a-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | Sector goldens cannot change only in version fields | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F2 | P0 | The runtime fallback drops the binding ten-seed gate | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F3 | P1 | The scripted flight and firing policy needs exact rules | resolved | 3 | orbit thrust is an ordered first-match list: off-nose 0, too fast -1, slow or >10° off +1, else 0; confirmed R5 |
| R1-F4 | P1 | Repair assignment contradicts the nearest-character rule | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F5 | P1 | A planet-contact ending has no defined attribution | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F6 | P1 | The bait proxy contradicts its telemetry definition | resolved | 2 | bait obstacles from per-body graceUntil set to tick+CONTACT_GRACE_TICKS during the tick (body 0 planet, k+1 asteroid k); all struck bodies found; no sim change; confirmed R4 |
| R1-F7 | P1 | Weapons can have work while its missile is in flight | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F8 | P1 | The duel hash does not include SIM_VERSION | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F9 | P1 | Per-player repair start and finish events need semantics | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F10 | P2 | Missile-to-missile losses are omitted | resolved | 0 | see response-1.md; confirmed R2 |
