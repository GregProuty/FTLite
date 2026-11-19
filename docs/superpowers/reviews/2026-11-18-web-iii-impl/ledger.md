# Ledger: web-iii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Two older Web-ii lines in gates.md contradict the Web-iii owner steps | fixed:R1 | 0 | gates.md L935/L943 reworded (ALLOWED_ORIGINS before first deploy; take-down rule); no other contradiction |
| R1-F2 | P2 | The local pre-flight never runs the relay hook or the getStats read in a real browser | fixed:R1 | 0 | relayInitScript({force}); local mode installs non-forcing hook, localPairVerdict needs >=2 connected samples, non-null local type, >=1 KiB; candidates in report; local smoke PASS host/host |
| R1-F3 | P3 | playStep can accept an early end whose two sides read ended more than 5 s apart | fixed:R1 | 0 | playStep both-ended branch fails when sides ended >5 s apart; tests 36000 fail / 35000 pass |
| R1-F4 | P3 | checkServiceOrigin cuts its error text without redacting it first | fixed:R1 | 0 | checkServiceOrigin takes secrets, clip redacts before cut; entry passes them; test |
