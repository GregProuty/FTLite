# Ledger: helm-h0c-ii-a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | The sector re-bless check can hide a gameplay change between checkpoints | fixed:R1 | 0 | scripts/golden/canonical-trace.ts hashes flatten with the version zeroed at every tick (golden 7200 + determinism-v2 108000 ticks); baseline before the bump, check after refuses to bless on any difference; proven by a CREW_SPEED nudge failing at tick 1 |
| R1-F2 | P1 | The sector diff command is not executable in the supplied shell | fixed:R1 | 0 | every Run line is a plain npx/npm call working in PowerShell 5.1 and Git Bash; temp paths from os.tmpdir(); Global Constraints line added |
