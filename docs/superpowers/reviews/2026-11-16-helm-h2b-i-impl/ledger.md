# Ledger: helm-h2b-i-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The session owner's linkStats (5 s age, ready-attempt filter, transport guard) has no test | fixed:R1 | 0 | onlineCoordinator test drives linkStats: fresh figure, null after 5001 ms, non-ready attempt null, replaced transport ignored (via host-changed) (2bc18e3) |
| R1-F2 | P2 | The duel smoke recursively deletes `<report dir>/records`, a path taken from the CLI argument | fixed:R1 | 0 | records delete refused unless the report dir is inside out/ |
| R1-F3 | P3 | A stale route/RTT in the peer defeats main's 5 s freshness check (minor a) | fixed:R1 | 0 | peer resets route/rtt each sample; assigned only with a pair; rtcPeer test |
| R1-F4 | P3 | The F3 overlay keeps showing the last RTT after main stops reporting one (minor c) | fixed:R1 | 0 | rttMs cleared on a null answer; overlay hidden on frame()'s early returns; session test |
| R1-F5 | P3 | A replayed round-0 seed merges two rooms' rounds and silently drops records (minor e) | fixed:R1 | 0 | duplicate records counted and printed in the header; report test |
| R1-F6 | P3 | Single player's record wiring (pause count, startedAtIso, seat) is untested (minor d) | fixed:R1 | 0 | soloRecorder.ts extracted, behaviour unchanged; duelRuntime test |
| R1-F7 | P3 | The F3 overlay overlaps the map's grid labels at the top left (minor g) | deferred | 0 | cosmetic; the F3 overlay moves to React (Decision 5, UI-ii), where it is placed clear of the grid labels |
