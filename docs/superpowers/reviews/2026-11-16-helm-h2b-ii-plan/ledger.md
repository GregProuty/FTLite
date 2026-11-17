# Ledger: helm-h2b-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Single-device (two-machine) mode still runs a sector capture from the ordinary menu, which now hosts only a duel | resolved | 0 | manual --role path plays a duel pair through the real menu then the sector pair via host-sector/join-sector (FTLITE_SECTOR_ONLINE_TEST=1); guest reads the code from --join-code-file (deleted after reading), never logged; deviceDuel report shape; tests; confirmed R2 |
| R1-F2 | P2 | The duel records handed to the report come from a round with no input, so they may carry no latency samples | resolved | 0 | X then E in round 1 on both machines; record wait and checkDuel require held+command > 0; no-latency rejection test; confirmed R2 |
| R1-F3 | P3 | The `online-observer-build.ts` replace anchor is a lone `}` | resolved | 0 | anchor on the file's last two lines; confirmed R2 |
| R1-F4 | P3 | The gates subsection states the smoke's pair order backwards | resolved | 0 | gates text: duel pair first, then sector; two-machine bullet; confirmed R2 |
| R2-F1 | P3 | The 'device duel record from the other seat' rejection passes even without the role check | fixed:R2 | 0 | mutation now installs a fully valid guest record, so only the seat mismatch can fail |
