# Ledger: engine-r0-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | A valid basic.json can bypass the version guard | fixed:R1 | 0 | basicVersion/duelVersion read the whole parsed file; an existing file without a readable version throws; tests for a version beyond 4096 bytes and a missing version |
| R1-F2 | P1 | The retired baseline still has an overwrite command | fixed:R1 | 0 | capture-net1a-baseline.ts refuses (retired; points to npm run bless -- --baseline) and exits 1 before any work |
| R1-F3 | P2 | The same-mode proof has no automated failure test | fixed:R1 | 0 | versionOnly comparison testable with injected traces; tests: identical pass, changed tick named, missing/extra/short run, moved version, missing baseline, canonical() sensitive to one field |
