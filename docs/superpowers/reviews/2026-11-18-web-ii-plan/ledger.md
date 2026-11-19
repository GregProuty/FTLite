# Ledger: web-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The Edge middleware's .vc-config.json does not declare envVarsInUse, so the passcode and secret will probably never reach process.env | resolved | 0 | VC_CONFIG envVarsInUse; Task 3 check requires it; L42 fact corrected; gates.md 503 line; confirmed R2 |
| R1-F2 | P2 | Web Lock: the menu waits on the lock with no time limit, the lock is never released on pagehide, and a busy lock is never retried, so a reload can lock online play out | resolved | 0 | acquireOnlineLock 2 s limit, one busy retry with AbortSignal.timeout(1500), late grant released; pagehide releases; Task 11 page.reload case; confirmed R2 |
| R1-F3 | P2 | The origin-refused injection passes on any failure to reach the lobby, not only on the refused origin | resolved | 0 | browser players log service responses; injection needs 403 on /v2/rooms with page Origin (or failed POST + 403 Node-sent preflight), no 2xx create; else exit 2; confirmed R2 |
| R1-F4 | P2 | The rehost step does not show that the mirror was written to, or read from, IndexedDB | fixed:R2 | 1 | browser guest reads records/mirror-v1 from IndexedDB before Reconnect, decodes header (magic 0-7, len u32le @8, JSON @12), asserts checkpointSequence+capturedTick = last; proof records actual read; Electron guest pairing records 'not read' (no page evaluate) — browser pairings carry the proof |
| R1-F5 | P2 | The Web-iii live checks never test the paid art or the game files, with or without the cookie | resolved | 0 | gates.md step 5 cookie/no-cookie checks on paid file, Worker, /, version.json; rollback; same for live-smoke.ts; confirmed R2 |
| R1-F6 | P3 | When the lock is 'unavailable' in a supported browser, the Multiplayer screen shows the wrong text | resolved | 0 | unavailable lock in configured browser → UNSUPPORTED_TEXT; confirmed R2 |
| R1-F7 | P3 | In the browser, Settings still says F11 toggles fullscreen, but F11 is the browser's own fullscreen and the API cannot see it | resolved | 0 | browser.web flag, Settings shows BROWSER_F11_TEXT, test; confirmed R2 |
