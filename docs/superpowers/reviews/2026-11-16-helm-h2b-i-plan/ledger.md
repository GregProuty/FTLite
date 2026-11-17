# Ledger: helm-h2b-i-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | A LAN peer seen as peer-reflexive is likely labelled 'internet', the case Decision 1 was added for | fixed:R1 | 0 | prflx on either side judged by address; hidden remote address -> lan only with a private local host candidate, else null; Decision 1 and tests |
| R1-F2 | P2 | The live targets count every online round in the files, including the LAN and internet checklist runs, not just the §16 sessions | fixed:R1 | 0 | with a checklist the live targets and planet extra cover only its sessions' rooms; unclaimed and missing rooms listed; warning without a checklist; Decision 8 and tests |
| R1-F3 | P2 | The RTT test cannot tell the median from the latest sample, and silently drops its first sample | fixed:R1 | 0 | flush after attach; samples [90,60,40,50,70] expect 60; loop steps 1001 ms (two 1000 ms pumps can land 999.99... apart) |
| R1-F4 | P3 | groupRooms orders rounds by wall-clock times from two machines before chaining them | fixed:R1 | 0 | groupRooms sorts by round index, then startedAtIso |
| R1-F5 | P3 | The smoke's record copy runs unguarded in `finally`, before the workerd and temp-root cleanup | fixed:R1 | 0 | record copy in try/catch with failure ??= 'record copy failed', before cleanup |
| R1-F6 | P3 | Fallback check 3 only covers LAN rooms; the plan should say why | fixed:R1 | 0 | fallback 3 for any session whose rooms share one known network; Decision 9 and test |
| R1-F7 | P3 | A missing currentRoundTripTime is reported as a real 0 ms RTT | fixed:R1 | 0 | linkFigures returns {route, rttMs¦null}; stats sent only with a real RTT; Interfaces, Decision 2, controller test |
