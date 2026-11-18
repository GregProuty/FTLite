# Ledger: web-i-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 1: the tick Worker posts its result on the Worker global, but the page waits for it on the relay port, so result() never resolves | fixed:R1 | 0 | Task 1 tickWorker posts result on relay; run.ts 30 s timeout on result() |
| R1-F2 | P1 | Task 1: the catch-up tick driver plus send-time relay stamps let a throttled Worker pass | fixed:R1 | 0 | Task 1 ticks carry dueAt; delay from deadline; tick counts only within 2 periods; report test for 1 s lateness |
| R1-F3 | P1 | Task 5: spawnHostWorker.kill() is not idempotent, so its own test fails | fixed:R1 | 0 | Task 5 spawnHostWorker killed flag |
| R1-F4 | P1 | Task 10: changing createProbe's parameter type is not enough, because it calls the MessagePortMain `.on/.off` API | fixed:R1 | 0 | Task 10 createProbe on browserPortEndpoint, no electron import |
| R1-F5 | P1 | Task 11: the page probe counts every page MessageChannel, including React's never-closed one, so cleanup `ports === 0` can never hold | fixed:R1 | 0 | Task 11 page probe counts ports only after driver arms countPorts |
| R1-F6 | P1 | Tasks 9-11: the large gate rewrites are mapping tables, not code, and the tables contain concrete defects | fixed:R1 | 0 | Tasks 9-11 full replacement host-smoke.cjs, rtc-page.ts, rtc-smoke.cjs, room-service-smoke.cjs, online-app-smoke.cjs; early abort/crash in spawn task; dispose awaits start; gen-2 intercept; absorb() per Worker |
| R1-F7 | P1 | Task 8: setting CORS headers on Durable Object stub responses will probably throw, because fetched responses have immutable headers | fixed:R1 | 0 | Task 8 copy response (101 webSocket special case) before CORS headers |
| R1-F8 | P2 | Task 11: the internet-app report validator and its fixtures keep the old cleanup field names | fixed:R1 | 0 | Task 11 internet-app-report schema/checkCleanup + test fixtures renamed |
| R1-F9 | P2 | The classic-Worker fallback covers only the product Worker, not the gate harnesses that hard-code module Workers | fixed:R1 | 0 | D-6 fallback covers harnesses; L28 reconciled; Task 7 Step 7 |
| R1-F10 | P2 | Task 5: the duelMode.test edit points at the wrong line, so the old source read survives until Task 7 deletes the file | fixed:R1 | 0 | Task 5 duelMode edit quotes line-143 assertion, comment 141-142 |
| R1-F11 | P3 | Task 1 adds pass and validity rules beyond spec §3.5 without recording them as deviations | fixed:R1 | 0 | D-7 lists Task 1 extra rules |
| R1-F12 | P3 | The digest note names only onlineSession.ts, but Task 7 also edits rtcSession.ts and hostProcessProtocol.ts, which are in the same manifest | fixed:R1 | 0 | L16 digest note names all three files |
