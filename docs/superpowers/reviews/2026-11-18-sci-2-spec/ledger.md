# Ledger: sci-2-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The network and client layers are fixed at two players, and the spec names none of them | resolved | 0 | spec 4.3-4.4: codecs at playerLimit 4 with every site named; producers/client/ledger sized to n; confirmed R2 |
| R1-F2 | P1 | An empty seat's away state: the spec contradicts itself and the real mechanism | resolved | 0 | spec 4.1/4.4: all present at creation; away steward sends presence false; test; confirmed R2 |
| R1-F3 | P1 | The crew-down loss and the health loops are fixed at two players, and the rule for n is not given | resolved | 0 | spec 4.1 health: all n downed (away included) loses; loops to playerCount; confirmed R2 |
| R1-F4 | P1 | Snapshot offsets, the layout cache and the restore are fixed at two players; the grep rule misses them | resolved | 0 | spec 4.2: header n first, roundAt from n, cache by layout+n, loadDuelSnapshot crew, presence copies; confirmed R2 |
| R1-F5 | P1 | Telemetry, the round record and the playtest record are two players wide, and the spec does not decide them | resolved | 0 | spec 4.1/4.3: telemetry, mode memory, summary tuples n long; record seat 0..3; confirmed R2 |
| R1-F6 | P1 | The host's crew choice has no path to the main process | resolved | 0 | spec 4.5: host action capacity, OnlineApi.host(crew), onlineSession.ts:421, duelInit, validateDuelMirror; confirmed R2 |
| R1-F7 | P2 | The app's seat code assumes seats 0 and 1, and L59 only says 'do not index past n' | resolved | 0 | spec 5.1: seat types and sit tracker sized to n; confirmed R2 |
| R1-F8 | P2 | The crew list's states, their precedence and the row count are not pinned | resolved | 0 | spec 5.2: precedence incl. REPAIRING, AWAY over seat, READOUT_ROWS 23, OtherStatus removed; confirmed R2 |
| R1-F9 | P2 | The lobby row text does not cover a disconnected seat, and `seatLabel` is shared with the sector | resolved | 0 | spec 5.3: duel-only labels EMPTY/JOINED/READY/DISCONNECTED; start rule unchanged with citations; confirmed R2 |
| R1-F10 | P3 | The SCIENCE badge clauses do not match the code | resolved | 0 | spec 5.4: kind science, normal tint, order, omitted without Science; confirmed R2 |
| R1-F11 | P3 | 'The app always passes 0' for helmPlayer is not what the code does | resolved | 0 | spec 4.1: Start keeps the host seat, widened to 0..3; confirmed R2 |
| R1-F12 | P3 | The Part C presence wording is loose | resolved | 0 | spec 8: presence via retired steward and the joiner's presence true; confirmed R2 |
| R2-F1 | P3 | The helmPlayer widening and the snapshot save header miss the snapshot and init sites | fixed:R2 | 0 | spec 4.2 save/validate header playerCount n, helm check 0..n-1, DuelRoundValues; 4.1 DuelInit.helmPlayer |
