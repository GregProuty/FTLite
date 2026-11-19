# Ledger: web-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The DEBUG refusal misses DEBUG=* and DEBUG=pw*, which turn on Playwright's protocol logs | resolved | 0 | debugCouldLogPasscode refuses non-negated * or pw* patterns, DEBUG_FILE, PWDEBUG; tests *, pw*, foo,*, vite:*; confirmed R2 |
| R1-F2 | P2 | Error text is cut short before redaction, and JSON-escaped forms of a secret are never redacted | resolved | 0 | clip() redacts before cutting (entry, request failures, page errors); JSON-escaped variant; quote + 700-cut tests; confirmed R2 |
| R1-F3 | P2 | A round that ends on one side only is accepted as a finished duel | resolved | 0 | pure playStep in relay.ts; early end needs both ended within 5 s and >=20 s played; report re-checks; tested; confirmed R2 |
| R1-F4 | P2 | The live version.json is never compared with the build that was just deployed | resolved | 0 | compareDeployedVersion vs .vercel/output/static/version.json; versionCompared in report; tested; confirmed R2 |
| R1-F5 | P2 | Step 7's dry run hits a real *.vercel.app host, against the plan's own rule | resolved | 0 | dry run uses https://ftlite-dry-run.invalid; confirmed R2 |
| R1-F6 | P2 | The rollback advice leads with `vercel rollback`, which has nothing to roll back to on the first deploy | resolved | 0 | TAKE_DOWN: first deploy → vercel rm / Dashboard delete; later → vercel rollback; message + gates step 6; confirmed R2 |
| R1-F7 | P3 | The Firefox fallback catches every launch error and reports it as 'not installed' | resolved | 0 | Firefox fallback only on missing-executable error; other launch errors fail; confirmed R2 |
| R1-F8 | P3 | Error screens with a known message read as 'other', so a failed wait runs to its full timeout | resolved | 0 | sessionHome in UI read; uiPhase returns error; tested; confirmed R2 |
