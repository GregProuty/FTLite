# Ledger: web-ii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The Web-ii gate was recorded before the master merge and was not re-run at the subject head | fixed:R1 | 0 | full Web-ii gate re-run at 4732902d (SIM 54): all pass; plan ledger + docs/gates.md updated (16907f10) |
| R1-F2 | P2 | Uncaught errors from the Electron guest are found only by parsing a debug-only log line, with no check that the parser ever matched | fixed:R1 | 0 | players.ts requires a 'DBG loaded' line else fails 'electron console not watched'; online-app-smoke.cjs comment documents the contract |
| R1-F3 | P3 | The transport regression test covers only closeAttempt, not the peer-loss path the fix was for | fixed:R1 | 0 | rtcTransportOwner.test: closed/failed replies and rtc-replaced each send exactly one close frame; no second frame after re-retire |
| R1-F4 | P3 | The output check of the bundled middleware asks only about static file paths | fixed:R1 | 0 | checkWebOutput also asks /, /no-such-file, /index.html?x=1 and HEAD Worker, with and without cookie |
| R1-F5 | P3 | Nothing in the repo makes a non-prebuilt `vercel` deploy fail | fixed:R1 | 0 | root vercel.json buildCommand fails with 'use npm run deploy:web'; CLI 65.10.0 read: --prebuilt uploads only .vercel/output, no build runs; gates.md step 4 line; tests/vercelGuard.test.ts |
