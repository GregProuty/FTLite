# Ledger: helm-h2b-ii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The two-machine procedure still pins the Net-3e SIM 35 candidate and revision, so its new guest command cannot run as written | fixed:R1 | 0 | two-machine procedure rewritten for the H-2b candidate (candidate.json, revision, h2b-candidate.zip, dist/h2b-source.zip operator archive), duel-then-sector row, status line to H-2b-ii gates (d26606b) |
| R1-F2 | P2 | The owner-only steps in gates.md refer to 'the same command' but never give one | fixed:R1 | 0 | gates subsection lists the exact build/package, manifest, source-archive, local verification, report, recovery and both deployed commands with distinct report paths; smoke records kept out of the real report |
| R1-F3 | P2 | A join-code file saved with PowerShell 5.1's `>` or Out-File is UTF-16 and is never accepted | fixed:R1 | 0 | scripts/network/join-code-file.ts accepts UTF-16LE BOM, maps O->0 and I/L->1 against the app alphabet; Set-Content -Encoding ASCII documented; tests |
| R1-F4 | P2 | The documented steps never produce the SIM 39 localRecovery evidence that internetReady needs | fixed:R1 | 0 | recovery smoke on the candidate documented (npx tsx, keeps the origin build); run locally: ACTUAL APPLICATION RECOVERY PASS skiff, digest matches the manifest |
| R1-F5 | P2 | Several new reject cases do not reach the check they are named for, and the rise checks are untested | fixed:R1 | 0 | reject cases reach their checks (beam before=1 host=2 guest=1; thrust rise; device peak; device beam; extra key); each fails with its check removed |
| R1-F6 | P3 | Triage (a) and (b): the seed comparison relies on parseRun; the manifest message and the plan's artifact count are out of date | fixed:R1 | 0 | seed guard requires both deviceDuels; manifest message names the three folders; plan count 50 |
| R1-F7 | P3 | Triage (c): a join-code file left behind by a failed run blocks the next run with only a generic message | fixed:R1 | 0 | finally removes codeFile; procedure says so |
| R1-F8 | P3 | Triage (e): the `until` predicates dereference the latest publication without null guards | fixed:R1 | 0 | optional chaining in the until predicates |
