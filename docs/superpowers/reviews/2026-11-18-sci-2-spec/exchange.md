# Codex review exchange: sci-2-spec

Subject: `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing ba6ec840, effort high, 327 s, 3419765 in / 3288359 cached / 27968 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The network and client layers are fixed at two players, and the spec names none of them
The spec's rule for finding two-player code (L20) covers only `sim/duel`, and L24 lists only the snapshot, init, checkpoint arrays, `duelRules` and 'the duel client reads n from the snapshot'. The online duel goes through several module-level two-player constants that none of that covers. Most are built before n is known, so 'duelCodec(n)' cannot simply replace them. · src/network/modes/duelProducers.ts:27-28 (`PLAYERS = 2`, `duelCodec(PLAYERS)`), :33 (`desired` is two long), :101 (stewards only for players 0 and 1), :112 (`attachHuman` throws for any player >= 2, so a third human cannot attach); src/network/modes/duelStream.ts:56,63 (`duelCodec(2)` encodes and decodes publications); src/network/modes/duel.ts:15 (`decode = duelCodec(2)`); src/renderer/src/net/codec.ts:239 (`duelPublicationSchema = messageSchemaFor(2, duelWire)`; with playerLimit 2, a playerCount of 3 and three-long watermarks fail at :29 and :190-192); src/renderer/src/clientControl/duelClient.ts:17,30,47,48 (`held=[0,0]`, `next=[1,1]`, `has: p===0||p===1`, `for (const p of [0, 1])`); src/renderer/src/authority/duelCheckpoint.ts:99 (`createLedger([0, 1], ...)`). · With crew 3, the host's producer manager rejects the third player's attach. Any publication with playerCount 3 also fails the publication schema and the stream codec. The core goal fails, and an implementer following L20 and L24 would not find these places. · List each site in §3. State one rule: the codec, the publication schema, the producer codec and `latestStreamKey` are built with playerLimit 4 (ROOM_MAX_PLAYERS). The real n is enforced by the snapshot header, the init and the checkpoint. `duelProducers` takes n from `init.playerCount` and sizes `desired` and its steward loop to n. `duelClient` sizes `held`, `next` and `heldSequences` from the first publication's `header.playerCount`. The ledger gets `[0..n-1]`. Add an online test that attaches a human to seat 2.

### [P1] R1-F2 An empty seat's away state: the spec contradicts itself and the real mechanism
L20 says `DuelState.present` is 'all true at creation'. L32 says an unclaimed seat's character 'is created present = false'. Both cannot hold. `DuelInit` also has no field saying which seats are claimed, so `createDuel` cannot know. Today an unattached seat becomes away through the away steward, which sends a ledgered `presence false` once the run is running. The spec never mentions the steward. · spec L20 vs L32; src/renderer/src/authority/duelCheckpoint.ts:21 (DuelInit fields: no seat-claim data); src/renderer/src/sim/duel/state.ts:90 (`present: [true, true]`); src/network/modes/duelProducers.ts:1-8, 53-72, 101-105 (a steward per unattached seat sends `presence {present:false}`); src/renderer/src/app/duel/onlineDuel.ts:171 (a joiner's client sends `presence true` first). · Two implementers would build this differently: one adds a claimed-seats field to the init, one uses the steward. Under the steward the character is present for the first ticks, which matters for revivers and the crew list. Also, with `PLAYERS = 2` in duelProducers, seats 2 and 3 get no steward, so an empty seat 2 would stay present forever. · Fix L32: 'every character is created present (L20); the away steward for each seat with no human (duelProducers, widened to n) sends presence false through the ledger at the first running boundary, so the away state is deterministic and carried in every snapshot'. Say the character is present for those first ticks and that this is acceptable. Test that seat 2 of a crew-3 start has an applied presence-false result and that `present[2]` is false in the next publication.

### [P1] R1-F3 The crew-down loss and the health loops are fixed at two players, and the rule for n is not given
`healthPhase` loses the round when both characters are down (`down === PLAYERS`, with `PLAYERS = 2`). The spec never says what 'all down' means for n characters or whether away characters count. Away characters are hurt and downed today (hits and fire do not check presence) but cannot revive anyone. · src/renderer/src/sim/duel/health.ts:15 (`const PLAYERS = 2`, which the L20 grep patterns do not match), :50,62,96,103,110,120 (every loop runs to PLAYERS), :121-123 (both down loses); :51 and :97 (damage ignores presence); :63 (revivers must be present); src/renderer/src/app/duel/runtime.ts:273 (single player sets player 1 away, and that character counts toward 'both down' today). · With n = 3 and an empty seat, 'all n down' needs the idle character at its spawn to go down too, so the crew-down loss almost never happens. 'All present down' instead changes the single-player rule and so two-player behaviour. Implementers will pick differently, and the outcome rule is gameplay. · State the rule in §3. Recommended: the round is lost when every one of the n characters is downed, away ones included. That is byte-identical for n = 2. Say plainly that an empty seat's idle character counts and can be hurt. Otherwise choose 'every present character, and at least one' and accept the change to single player and the goldens. Widen every health.ts loop to `d.interior.playerCount` and add a crew-3 test for the loss.

### [P1] R1-F4 Snapshot offsets, the layout cache and the restore are fixed at two players; the grep rule misses them
Snapshot validation and `duelRoundOf` place the round module at a fixed `1 + space + 2 + 3`, which hard-codes two presence values. The layout cache computes the interior length with `DUEL_PLAYERS` and is keyed by the layout alone. `loadDuelSnapshot` creates a two-player duel whatever the header says. Several other spots in `sim/duel` are also two-player and the L20 patterns do not match them. · src/renderer/src/sim/duel/snapshot.ts:95 (`at = 1 + e.spaceLength + 2 + 3`), :129 (`roundAt = 1 + space + 2 + 3`), :140 (`presence = k < 1 + space + 2`), :77 (`canonicalFields(layout, DUEL_PLAYERS)` cached per layout), :160,164 (the interior is validated at DUEL_PLAYERS), :183 (`createDuel(layout, snap.header.seed)` with no crew); duelCheckpoint.ts:94-96 (reads the round values through `duelRoundOf`); step.ts:107 (`next.present = [d.present[0], d.present[1]]`), :127 (`presentBefore`); spec L20, L24 ('validated against the interior's own player count': the interior can only be found after the length check, which already needs n). · For n = 3 the checkpoint validator would read `helmPlayer` and `baseTick` from the wrong offsets. A cached layout entry would give the wrong interior length. A restore would build a two-crew duel and fail. The rematch would drop presence for players 2 and 3. · Add to §3: validate `header.playerCount` in 2..4 (and no more than the layout's spawns) first. Derive `roundAt` and the presence span from it, in both `validateDuelSnapshot` and `duelRoundOf`. Key the layout cache by layout and n. Validate the interior at n and check that interior[5] and [9] equal n. `loadDuelSnapshot` calls `createDuel(layout, seed, 0, n)`. `startRound` copies all n presence values (`d.present.slice()`), and so does `stepDecided`'s `presentBefore`. Replace L20's grep list with 'every literal 2, `[0, 1]`, `d.present[0]`, and every two-tuple indexed by player'.

### [P1] R1-F5 Telemetry, the round record and the playtest record are two players wide, and the spec does not decide them
The per-player telemetry, the checkpoint's mode memory, the wire summary and round event, and the playtest record are all two-wide. Under L20, 'anything else in sim/duel ... is widened to n' would widen telemetry, but L24 does not list the matching schema changes. The playtest record refuses seat 2 or 3 outright. · src/renderer/src/sim/duel/telemetry.ts:75,135,141 (players, work and seats for pid < 2); src/renderer/src/authority/duelCheckpoint.ts:52,55 (`players: two(...)`, `work/seat/lastConsole: two(int)`); src/renderer/src/net/codec.ts:98-106 (`pair` for repairsStarted, repairsFinished, walkingTicks, repairingTicks in the summary and round event); src/renderer/src/net/duelRecord.ts:15,37 (`seat: z.union([z.literal(0), z.literal(1)])`); spec L44 (the playtest depends on per-seat evidence). · Either the third and fourth players are missing from every round record (and the console-swap telemetry), or widening breaks the memory schema, the wire schema and the oracle telemetry digest unless they widen too. A seat-2 player's playtest record fails validation, which defeats the three-player playtest. · Decide in §3. Recommended: the per-player telemetry fields (players, prev.work, prev.seat, prev.lastConsole) are n long; the mode-memory schema and the per-player summary tuples are length n (ship tuples stay two); the round event's schema follows; `DuelPlaytestRecord.seat` and `helmPlayer` become 0..3. n = 2 stays identical, so the oracle's telemetry digest is unchanged. Add wire and checkpoint tests at n = 3.

### [P1] R1-F6 The host's crew choice has no path to the main process
L29-30 name only `onlineDuel.ts`'s capacity check. Today the duel host action has no capacity field: the action shape is strict, the renderer's `host()` takes no argument, and the main session hard-codes a duel room's capacity to 2. `duelInit` also hard-codes `playerCount: 2`. · src/shared/onlineSession.ts:20 (`{ type: 'host'; mode: 'duel' }`), :78 (strict key check), :150 (`host(sector?)`); src/renderer/src/ui/actions.ts:93-94 (`host()` → `api().host()`); src/main/network/onlineSession.ts:421 (`action.mode === 'sector' ? action.capacity : 2  // a duel room is always capacity 2`); src/main/network/onlineDuel.ts:35 (`playerCount: 2`); spec L29-30. · Without these changes the host form's choice never reaches the service, and every duel room is still created with two seats. · Add to §4: the duel host action becomes `{ type:'host'; mode:'duel'; capacity: 2|3|4 }`, validated in onlineSession.ts:78. `OnlineApi.host` takes the crew size, and `actions.host(crew)` passes it from the menu store (default 3). onlineSession.ts:421 uses `action.capacity` for the duel. `duelInit` uses `playerCount: snapshot.capacity`. `validateDuelMirror` checks that `init.playerCount` equals the room's capacity, as `validateSectorMirror` does at onlineSector.ts:24.

### [P2] R1-F7 The app's seat code assumes seats 0 and 1, and L59 only says 'do not index past n'
Several renderer paths keep a player as `0 | 1` or a two-tuple. One is a real runtime bug: `trackSit` only records players 0 and 1, so the player in seat 2 or 3 never gets the sit-down card or the auto-frame zoom at the Helm or Weapons. · src/renderer/src/render/duel/sitModel.ts:27-33 (`seats: [SitSeat|null, SitSeat|null]`; `tr.seats[active]` is undefined for active = 2, so `sat` is always false); src/renderer/src/app/duel/scene.ts:221-222 (`trackSit(sits, me, [sitOf(0), sitOf(1)])`); src/renderer/src/app/duel/onlineSource.ts:91,146 (`seat: 0 | 1`, `other = seat === 0 ? 1 : 0`); src/renderer/src/app/duel/onlineDuel.ts:157,313 (`seatId as 0 | 1`); src/renderer/src/render/duel/consoleModel.ts:41,68 (`me: 0 | 1`); spec L59. · The third player is the Science or on-foot player the playtest is for. Losing their sit feedback, or having casts hide wrong indexing, would skew the playtest. · List these in §5. Widen the types to `PlayerId` and size the sit tracker to n (`seats: (SitSeat|null)[]`, filled from `d.interior.playerCount`). Add a UI test that seat 2 sitting at Weapons shows the sit card.

### [P2] R1-F8 The crew list's states, their precedence and the row count are not pinned
L36 replaces today's seven `OtherStatus` values with HELM / WEAPONS / SCIENCE / ON FOOT / AWAY / DOWNED. That silently drops REPAIRING and WALKING and gives no precedence. Today a seated away character reads 'AT HELM' and a standing away one 'STANDING BY'. The row budget is also left to the plan, although it can be worked out now. · src/renderer/src/render/duel/readoutModel.ts:19 (OtherStatus), :114-115 (two rows today: OTHER and the status line), :141 (`READOUT_ROWS = 22`, 'the longest list ... is 22'); src/renderer/src/app/duel/onlineSource.ts:147-151 (DOWNED first, then the seat, then away); runtime.ts:432 (the single-player status); spec L36, L56. · Implementers will order DOWNED, AWAY and seated differently and will disagree on keeping REPAIRING. With four crew, three rows replace two, giving 23 rows, which exceeds `READOUT_ROWS` in the standing, Helm-empty, missile-inbound case. · Specify the precedence: DOWNED, then AWAY, then the console (HELM/WEAPONS/SCIENCE), then ON FOOT. Say whether REPAIRING stays; recommend yes, since it is cheap and useful. Say that a seated away character reads AWAY. Set `READOUT_ROWS = 23` (n−1 = 3 rows replace 2) and say which layout constants move. Name `OtherStatus`, `otherStatus()` on both sources and `ReadoutInput.other` as removed in favour of the readout deriving the list from `d`.

### [P2] R1-F9 The lobby row text does not cover a disconnected seat, and `seatLabel` is shared with the sector
L31's 'joined / ready / empty' has no state for an occupied but disconnected seat, and does not say whether 'joined' means today's 'Not ready'. `seatLabel` is also used by the sector, where 'Bot' is correct. Start with empty seats already works today on both client and service, so the spec's change is only labels. · src/renderer/src/ui/menuState.ts:81-84 (`P1: Bot / Bot (human disconnected) / Ready / Not ready`), :93 (`startAllowed` already skips unoccupied seats); services/signalling/src/room/lifecycle.ts:36 (only occupied seats must be connected and ready); src/main/network/onlineSession.ts:495; SessionPage.tsx:33 (one row per capacity already); spec L31. · There is an untestable gap for the disconnected state, and a risk of changing the sector's lobby text. · Specify the duel-only labels with `isDuel`, for example `P3: EMPTY / JOINED / READY / DISCONNECTED`. State that the Start rule and the service are unchanged, and point at menuState.ts:93 and lifecycle.ts:36.

### [P3] R1-F10 The SCIENCE badge clauses do not match the code
The 'if drawIcon has one' fallback is moot because a 'science' icon kind exists. 'Red when the Science console is failed if the duel models that' is open-ended; the duel has no Science room in its tactical Room set, so nothing can fail it. The `StationBadge.kind` union lacks 'science', and badge order and the case of a layout without a Science console are not given. · src/renderer/src/render/roomIconModel.ts:6 (ICON_KINDS includes 'science'); src/renderer/src/render/roomIcons.ts:27; src/renderer/src/render/duel/interiorModel.ts:72 (`kind: 'navigation' | 'weapons' | 'medbay'`), :74-84 (order Helm, Weapons, Medbay); readoutModel.ts:26 via ROOM_NAMES (Weapons, Shields, Engines only); state.ts:46 (`science` is −1 when absent); spec L39. · A UI test needs a fixed order and tint. · Say: kind 'science' (added to the union), label SCIENCE, always tint 'normal', placed after WEAPONS and before MEDBAY, and omitted when `d.science < 0` (the Cutter).

### [P3] R1-F11 'The app always passes 0' for helmPlayer is not what the code does
L21 says the app always passes 0, but Start sends the host's own seat. · spec L21; src/renderer/src/ui/actions.ts:105 (`helmPlayerOf(status)`); src/renderer/src/ui/menuState.ts:89-91 (returns `status.ownSeat` cast to `0 | 1`); src/main/network/onlineDuel.ts:33 (rejects anything but 0 or 1). · With up to four seats, a host could in principle be seat 2 or 3, and the 0..n−1 range and the `0 | 1` cast then matter. The spec's statement is wrong either way. · Either make Start pass 0 (and say so), or say 'the host's seat, 0..n−1' and widen `helmPlayerOf` and `DuelChoice` to 0..3.

### [P3] R1-F12 The Part C presence wording is loose
L50 says 'the host's authority marks that character present on the joiner's attach'. In fact the joiner's own client sends `presence true` as its first command, and the producer manager retires the seat's steward when the human binds. The authority does not set presence itself. · spec L50; src/renderer/src/app/duel/onlineDuel.ts:171; src/network/modes/duelProducers.ts:91,117-119. · Minor, but a plan worker might add an authority-side presence write and create a second, unledgered path. · Reword: 'on attach the seat's away steward is retired and the joiner's client sends presence true (the existing path, onlineDuel.ts:171)'.

## Verified
- Two-player byte identity holds if the presence fields stay `present.0`, `present.1` for n = 2: the presence module sits after science and before repair (modules.ts:92-101) and the interior fields come from `d.interior.playerCount` (modules.ts:66). Field names, counts and order are unchanged at n = 2, so a version-only 47 → 48 bump with no MIGRATIONS entry matches the oracle rule ('A version with no entry maps every field to itself', duelOracle.ts:86-113), and `duelSchema` reads the state's own fields (duelOracle.ts:117-128).
- The snapshot header already has `playerCount` (snapshot.ts:30-33, HEADER_KEYS :42) and the wire header already validates it with the codec's `playerCount` primitive (codec.ts:29,132), so the header layout does not change and no oracle entry is needed for it.
- The Hound has four spawns starting at 13,7 (hound.json:215-218) and the layout schema requires at least four (schema.ts:24).
- The service already accepts capacity 1..4 (roomSession.ts:103 `capacity <= ROOM_MAX_PLAYERS`) and already lets the host start with unclaimed seats (lifecycle.ts:36 checks only seats with a token; signals.ts:52-55 checks only occupied guests), as do the client checks (menuState.ts:93, onlineSession.ts:495). Part A's 'start with empty seats' needs no service change.
- auth.ts:17 refuses a new join unless the room is in the lobby (`!existingHash && m.phase !== 'lobby'` → invalid-state); a seat-token reconnect works in a live phase (:15-18), as spec L49 says.
- The sim's presence admission is the explicit two-player check at step.ts:138 and :181; spec L23 covers it.
- The checkpoint's per-player arrays at duelCheckpoint.ts:72-77 and the init's literal playerCount at :38-39 match spec L24's list.
- Scripted bots and gates stay two-player: scripted.ts loops to 2 (:226, 278, 321) and the oracle and gates call `createDuel` without a crew argument (duelOracle.ts:30), so the default crew of 2 keeps them unchanged.
- `duelRules.playerCount` returns the constant 2 (duelRules.ts:34) and `create` ignores `init.playerCount` (:31); spec L24 covers the first, and the second follows from L19 as long as `create` passes `init.playerCount`.

## Not verified
- Part C end to end: whether the host's peer setup (onlinePeers.ts:159 loops over capacity) offers a link to a seat first occupied after start, whether a late joiner with no mirror or committed start works through onlineSession.ts:449/456, and whether `store.seats()` returns seats in seat_id order (auth.ts:18's 'lowest unclaimed'). Not read beyond the grep.
- Whether leaving a room clears a seat's token_hash during the active phase. If it does, Part C could hand a departed player's seat to a newcomer, which bears on L32's 'the same player can rejoin'.
- Whether the room's checkpoint metadata or the mirror store depends on the duel player count. mirrorStore.ts and hostProcess.ts were not read.
- How the peer-lost pause and its resume behave with three remote guests. The spec says 'as today'; duelProducers.ts:76 pauses on any lost remote seat.
- The rest of the telemetry.ts and summary.ts internals beyond the lines cited (whether consoleSwaps and the empty-tick counters assume two seats).

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the spec at `2fededc0`. 12 accepted, 0 rejected, 0 deferred. The spec was rewritten around one rule (§3: every per-player value is n long; ship values stay two) with every cited site listed.

## R1-F1 [P1]: Network and client layers fixed at two
Confirmed at the cited lines (duelProducers.ts:27-28,112; duelStream.ts:56,63; codec.ts:239; duelClient.ts:17-48; duelCheckpoint.ts:99). Spec 4.3/4.4: codecs built once at playerLimit 4 with each site named; producers, client and ledger sized to n; online test attaches seat 2.

## R1-F2 [P1]: Empty seat away contradiction
Confirmed. Spec 4.4: every character created present; the away steward sends presence false at the first running boundary; test added.

## R1-F3 [P1]: Crew-down loss and health loops
Confirmed health.ts:15 PLAYERS = 2. Spec 4.1: all n downed (away included) loses, byte-identical at n = 2; loops to playerCount; tests.

## R1-F4 [P1]: Snapshot offsets and restore
Confirmed snapshot.ts:77,95,129,140,160-183 and step.ts:107,127. Spec 4.2 and 4.1 cover each.

## R1-F5 [P1]: Telemetry and records
Confirmed. Spec 4.1/4.3: per-player telemetry, mode memory and summary tuples n long; record seat 0..3.

## R1-F6 [P1]: Host crew path
Confirmed onlineSession.ts:20,78,421 and onlineDuel.ts:35. Spec 4.5.

## R1-F7 [P2]: App seat types
Confirmed sitModel.ts:27-33 bug for seat 2+. Spec 5.1.

## R1-F8 [P2]: Crew list
Spec 5.2: precedence DOWNED, AWAY, console, REPAIRING, ON FOOT; READOUT_ROWS 23; OtherStatus removed.

## R1-F9 [P2]: Lobby labels
Confirmed menuState.ts:81-84,93 and lifecycle.ts:36. Spec 5.3.

## R1-F10 [P3]: Science badge
Confirmed roomIconModel.ts:6 has 'science'. Spec 5.4.

## R1-F11 [P3]: helmPlayer
Confirmed actions.ts:105. Spec 4.1: Start keeps the host seat, widened.

## R1-F12 [P3]: Part C presence wording
Spec 8 reworded per onlineDuel.ts:171 and duelProducers.ts.

## Also changed

- Whole spec reorganised (§3 rule, §4 Part A by layer, §5 Part B, §8 Part C).

## Files changed

- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 3060a671, effort medium, 58 s, 264754 in / 217051 cached / 5201 out)

Verdict: ready

## Findings

### [P3] R2-F1 The helmPlayer widening and the snapshot save header miss the snapshot and init sites
Spec L33 widens helmPlayer to 0..n−1 but names only DuelChoice, menuState.ts:89-91 and onlineDuel.ts:33. The snapshot still checks `helm !== 0 && helm !== 1` and types `DuelRoundValues.helmPlayer` as `0 | 1`, and `DuelInit.helmPlayer` is `0 | 1`. In §4.2, `saveDuelSnapshot` and the copy that `validateDuelSnapshot` returns both write `playerCount: DUEL_PLAYERS`, and the spec does not say what they should write instead. The §3 grep patterns would not find the literal `helm !== 0 && helm !== 1` check. · spec L33, L37-39; src/renderer/src/sim/duel/snapshot.ts:L93 (`helmPlayer: 0 | 1`), :L101 and :L168 (`playerCount: DUEL_PLAYERS` in the header), :L149 (`helm !== 0 && helm !== 1`); src/renderer/src/authority/duelCheckpoint.ts:L21 (`helmPlayer: 0 | 1`) · These are small and a round-trip test at n = 3 would catch them. Without them, though, a plan worker could miss the snapshot's helm range, and the header n that save writes has to be stated for the round trip at n = 3 to pass. · In §4.2, add: `saveDuelSnapshot` and `validateDuelSnapshot`'s returned header write `playerCount: d.interior.playerCount` (or the validated n). The helm check becomes 0..n−1, and `DuelRoundValues.helmPlayer` becomes a player id. In §4.1/§4.3, add `DuelInit.helmPlayer` (duelCheckpoint.ts:21) to the 0..3 widening.

## Prior findings
- R1-F1: resolved — Spec L47 names codec.ts:239, duelStream.ts:56,63, duel.ts:15, duelProducers.ts:27-28 and duelClient.ts:17 at playerLimit 4. L51 covers desired, the steward loop and attachHuman (duelProducers.ts:33,101,112). L53 covers duelClient. L43 covers the ledger. L113 adds the test for a human attaching at seat 2.
- R1-F2: resolved — Spec L28 (all present at creation) and L52 (the steward sends presence false at the first running boundary) no longer contradict each other. They match duelProducers.ts:L65-71 (the steward waits for phase running). The test is at L113.
- R1-F3: resolved — Spec L31: every health loop runs to playerCount, and the round is lost when all n are downed, away ones included. That is byte-identical at n = 2 and states that an idle character can be hurt. Tests are at L110.
- R1-F4: resolved — Spec L37-39 covers playerCount being checked first, roundAt = 1+space+n+3 in both validateDuelSnapshot and duelRoundOf, the cache keyed by layout and n, interior[5]/[9] equal to n, and createDuel(layout, seed, 0, n). These match snapshot.ts:L77,95,118,129,140,160,164,183. Spec L29 covers the presence copies. The save header is raised separately as a P3.
- R1-F5: resolved — Spec L32 widens telemetry's per-player fields. This matches telemetry.ts:L75,77,135,141, where counters, grace and terminal are per ship and rightly stay two. Spec L44 covers mode memory (duelCheckpoint.ts:52,55), L45 the summary tuples and L46 the record seat.
- R1-F6: resolved — Spec L57-58 covers the host action with capacity, the strict key check, OnlineApi.host(crew), onlineSession.ts:421, the duelInit playerCount, the capacity check and validateDuelMirror. The test is at L113.
- R1-F7: resolved — Spec L69 names each site and sizes the sit tracker to n. The test is at L114.
- R1-F8: resolved — Spec L73-75 gives the precedence (including REPAIRING), says a seated away character reads AWAY, sets READOUT_ROWS to 23, and removes OtherStatus, otherStatus() and ReadoutInput.other.
- R1-F9: resolved — Spec L80 gives duel-only labels EMPTY/JOINED/READY/DISCONNECTED and leaves the sector's labels alone. L59 says the Start rule is unchanged and cites menuState.ts:93 and lifecycle.ts:36.
- R1-F10: resolved — Spec L84 gives kind 'science' added to the union, normal tint, the order after WEAPONS and before MEDBAY, and the badge omitted when d.science < 0.
- R1-F11: resolved — Spec L33 says Start keeps the host's seat, widened to 0..3. A leftover helm range at snapshot.ts:149 and duelCheckpoint.ts:21 is raised as a separate P3.
- R1-F12: resolved — Spec L105 now says the steward is retired and the joiner sends presence true, which matches duelProducers.ts:L91,117-119 and the existing onlineDuel.ts path.

## Verified
- duelProducers.ts:L27-28,33,101,112 are two-player and L65-71 sends presence false only while running, which matches spec L51-52
- snapshot.ts:L77,95,118,129,140,160,164,183 are the two-player sites spec L37-39 widens
- duelCheckpoint.ts:L38,52,55,72-77,99 are the per-player schema sites spec L43-44 covers (pauseOwner and recentResults included)
- telemetry.ts: counters, grace and terminal are per ship (L68,77,115-119,163-174), so spec L32's 'ships stay two' is correct; players, work, seat and lastConsole are per player (L75,77,135-146)
- codec.ts:L21-29,190-192: with playerLimit 4 the publication watermark check is tied to header.playerCount, so 'the real n is enforced by the header' (spec L47) holds

## Not verified
- I did not re-open onlineSession.ts, menuState.ts, readoutModel.ts, sitModel.ts or interiorModel.ts in this round. The round-1 citations were taken as given, and only the spec text was checked against them.
- Whether READOUT_ROWS 23 is the true worst case across every readout state; I did not recount the rows.

---

# Round 2 response (spec revised)

Reviewed `round-2.json`. 1 accepted; all 12 round-1 findings resolved.

## R2-F1 [P3]: helmPlayer and the save header
Confirmed snapshot.ts:93,101,149,168 and duelCheckpoint.ts:21. Spec 4.2 and 4.1 updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md

<!-- end -->

---

