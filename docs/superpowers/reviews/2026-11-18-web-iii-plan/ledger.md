# Ledger: web-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The DEBUG refusal misses DEBUG=* and DEBUG=pw*, which turn on Playwright's protocol logs | fixed:R1 | 0 | debugCouldLogPasscode refuses non-negated * or pw* patterns, DEBUG_FILE, PWDEBUG; tests *, pw*, foo,*, vite:* |
| R1-F2 | P2 | Error text is cut short before redaction, and JSON-escaped forms of a secret are never redacted | fixed:R1 | 0 | clip() redacts before cutting (entry, request failures, page errors); JSON-escaped variant; quote + 700-cut tests |
| R1-F3 | P2 | A round that ends on one side only is accepted as a finished duel | fixed:R1 | 0 | pure playStep in relay.ts; early end needs both ended within 5 s and >=20 s played; report re-checks; tested |
| R1-F4 | P2 | The live version.json is never compared with the build that was just deployed | fixed:R1 | 0 | compareDeployedVersion vs .vercel/output/static/version.json; versionCompared in report; tested |
| R1-F5 | P2 | Step 7's dry run hits a real *.vercel.app host, against the plan's own rule | fixed:R1 | 0 | dry run uses https://ftlite-dry-run.invalid |
| R1-F6 | P2 | The rollback advice leads with `vercel rollback`, which has nothing to roll back to on the first deploy | fixed:R1 | 0 | TAKE_DOWN: first deploy → vercel rm / Dashboard delete; later → vercel rollback; message + gates step 6 |
| R1-F7 | P3 | The Firefox fallback catches every launch error and reports it as 'not installed' | fixed:R1 | 0 | Firefox fallback only on missing-executable error; other launch errors fail |
| R1-F8 | P3 | Error screens with a known message read as 'other', so a failed wait runs to its full timeout | fixed:R1 | 0 | sessionHome in UI read; uiPhase returns error; tested |
