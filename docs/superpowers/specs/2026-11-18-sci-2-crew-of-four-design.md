# Sci-2: a crew of two, three or four online, and the three-player playtest (design)

Date: 2026-11-18. Status: design, owner-approved in brainstorming. Builds on Sci-1 (`2026-11-17-science-scans-design.md`, merged bf6b7e32; master is now at SIM_VERSION 51 after Feel-ii), start aboard (`2026-11-17-start-aboard-design.md`) and the networked duel (`2026-11-16-helm-h2-networked-duel-design.md`).

## 1. Goal

Let a duel be played online by two, three or four people, so the owner can run a three-player playtest (Helm, Weapons, Science). Write the checklist for that playtest.

## 2. Owner decisions (fixed)

1. A duel room holds **2, 3 or 4** players; the host picks the crew size.
2. A fourth player gets an **Engineering console** in a separate feature (**Eng-1**, designed next). Until then the fourth player works on foot: repairs, fires, revives, and may take any free console.
3. The host may **start with empty seats**; an empty seat's character stands idle aboard. Late join (Part C, §8) is out of scope: the owner chose on 2026-11-18 to build Sci-2 without it, so a seat empty at Start stays empty for that session.
4. **Single player keeps two characters** (Tab switches), unchanged.
5. The scripted bots and the headless gates stay two-player.

## 3. The rule for n

The duel has a **crew size** `n` ∈ {2, 3, 4}, fixed for the run. **Every value indexed by player is n long**; values about the two *ships* stay two long. Every site that is two-player today is widened by this rule; the known sites are listed in §4 and §5, and the plan must also grep for any literal `2` used as a player count, `[0, 1]` used as the players, `0 | 1` used as a player id, `d.present[0]`/`[1]` pairs and two-tuples indexed by player, across `src/renderer/src`, `src/network`, `src/main` and `src/shared`.

**Two-player runs are byte-identical**: at n = 2 every widened value has today's length, names and order.

## 4. Part A: the sim, the wire and the network (SIM_VERSION 51 → 52)

### 4.1 Sim (`src/renderer/src/sim/duel/`)

- `createDuel(layout, seed, helmPlayer = 0, crew = 2)` builds the interior with `crew` Recruits (`createSimState(layout, crew, seed, Array(crew).fill(RECRUIT))`); characters stand at the layout's spawns in player order (the Hound has four: room Q, tiles 13..16,7). It throws if `crew` is outside 2..4 or exceeds the layout's spawn count.
- `DuelState.present` is `boolean[]` of length n, **all true at creation**. The presence module's fields are `present.0` .. `present.(n−1)`.
- `startRound` copies all n presence values (`d.present.slice()`) and passes `crew` to `createDuel`; `stepDecided`'s `presentBefore` covers all n.
- `presence` commands are admitted for players `0..n−1` (`malformed` beyond); every other per-player admission check uses n.
- **Health** (`health.ts`, `const PLAYERS = 2` today): every loop runs to `d.interior.playerCount`. The round is **lost when every one of the n characters is downed, away ones included** (byte-identical at n = 2). An empty seat's idle character can be hurt and downed like any other; only present characters can revive, as today.
- **Telemetry** (`telemetry.ts`): the per-player fields (`players`, `prev.work`, `prev.seat`, `prev.lastConsole`, and every `pid < 2` loop) are n long.
- `helmPlayer` seats nobody since start aboard; its range becomes `0..n−1`. Start keeps sending the host's own seat (`helmPlayerOf`), widened to `0..3` (`DuelChoice`, `menuState.ts:89-91`, `onlineDuel.ts:33`, `DuelInit.helmPlayer` at `duelCheckpoint.ts:21` and its schema at `:39`).

### 4.2 Snapshot (`sim/duel/snapshot.ts`)

- `DUEL_PLAYERS` stops being the sim's player count. `validateDuelSnapshot` first checks `header.playerCount` is an integer in 2..4 and no more than the layout's spawns, then derives from it the presence span and the round module's offset (`roundAt = 1 + space + n + 3`, was `+ 2 + 3`), in both `validateDuelSnapshot` and `duelRoundOf`.
- The interior layout cache is keyed by layout **and** n (`canonicalFields(layout, n)`); the interior is validated at n, and `interior[5]` and `interior[9]` must equal n.
- `loadDuelSnapshot` calls `createDuel(layout, seed, 0, n)` with n from the header.
- `saveDuelSnapshot` and the header `validateDuelSnapshot` returns write `playerCount: n` (`d.interior.playerCount`, or the validated header value; today `DUEL_PLAYERS`, snapshot.ts:101,168). The round module's helm check (snapshot.ts:149, today `helm !== 0 && helm !== 1`) becomes `0..n−1`, and `DuelRoundValues.helmPlayer` (snapshot.ts:93) is a player id.

### 4.3 Checkpoint, codec and records

- `DuelInit.playerCount` is `2 | 3 | 4` (was `z.literal(2)`); the checkpoint's per-player arrays (`commandHighWater`, `recentResults` bound, `admissionCounts`, `heldHighWater`, `held`, `pauseOwner` max) are length/bounded by `init.playerCount`; the ledger is `createLedger([0..n−1], n, …)`; `duelRules.playerCount` returns the state's `interior.playerCount`.
- Mode memory (`duelCheckpoint.ts:52,55`): `players` and `work/seat/lastConsole` are n long.
- The per-player summary tuples in the wire summary and the `round` event (`codec.ts:98-106`: `repairsStarted`, `repairsFinished`, `walkingTicks`, `repairingTicks`) are n long; ship tuples stay two.
- `DuelPlaytestRecord.seat` and `helmPlayer` (`net/duelRecord.ts:15,37`) become `0..3`.
- **Codecs are built once with `playerLimit` 4** (`ROOM_MAX_PLAYERS`): `duelCodec`, `duelPublicationSchema` (`codec.ts:239`, today `messageSchemaFor(2, …)`), the stream producer's codec and `latestStreamKey` (`src/network/modes/duelStream.ts:56,63`), `src/network/modes/duel.ts:15`, `src/network/modes/duelProducers.ts:27-28`, `clientControl/duelClient.ts:17`. The real n is enforced by the snapshot header, the init and the checkpoint, not the codec.

### 4.4 Producers and client (`src/network/modes/`, `clientControl/`)

- `duelProducers.ts`: n comes from `init.playerCount`; `desired` and the steward loop are n long; `attachHuman` accepts players `0..n−1` (today it throws for ≥ 2).
- **Empty seats become away through the existing away steward**: every character is created present; for each seat with no human, the steward sends a ledgered `presence false` at the first running boundary (as it does today for an unattached seat), so the away state is deterministic and in every snapshot. The character is present for those first ticks; that is acceptable (it stands at its spawn).
- `duelClient.ts`: `held`, `next`, `has` and `heldSequences` are sized from the first publication's `header.playerCount` (today `[0, 0]`, `[1, 1]`, `p === 0 || p === 1`, `[0, 1]`).

### 4.5 Host path (`src/shared`, `src/main`, renderer actions)

- The duel host action becomes `{ type: 'host'; mode: 'duel'; capacity: 2 | 3 | 4 }`, validated by the strict key check (`src/shared/onlineSession.ts:20,78`). `OnlineApi.host` takes the crew size; `actions.host(crew)` passes it from the menu store (default 3).
- `src/main/network/onlineSession.ts:421` uses `action.capacity` for a duel room (today hard-coded 2); `src/main/network/onlineDuel.ts`: `duelInit` uses `playerCount: snapshot.capacity` (today `2`), the capacity check accepts 2..4 (today `!== 2`), and `validateDuelMirror` checks `init.playerCount === capacity` as `validateSectorMirror` does (`onlineSector.ts:24`).
- The service already reserves rooms of capacity 1..4, and the Start rule already ignores unoccupied seats on both the client (`menuState.ts:93` `startAllowed`) and the service (`room/lifecycle.ts:36`); neither changes.

### 4.6 Version

`SIM_VERSION` 51 → 52 as a version-only step (the snapshot header, checkpoint and wire schemas widen, so old and new builds must not pair). At n = 2 the field list is unchanged, so no MIGRATIONS entry is needed unless the duel oracle reports a renamed or added field, in which case the plan adds `MIGRATIONS[51]` as the oracle requires. Record baselines at 51, bump, prove with the duel oracle and canonical trace that every recorded run is unchanged, bless at 52.

## 5. Part B: what each player sees

### 5.1 Seat types in the app

`seat: 0 | 1`, `me: 0 | 1`, `seatId as 0 | 1` and `other = seat === 0 ? 1 : 0` become a player id `0..n−1`: `app/duel/onlineSource.ts:91,146`, `app/duel/onlineDuel.ts:157,313`, `render/duel/consoleModel.ts:41,68`. The sit tracker (`render/duel/sitModel.ts:27-33`, `seats: [SitSeat|null, SitSeat|null]`; `scene.ts:221-222` `[sitOf(0), sitOf(1)]`) is sized to n, so a player in seat 2 or 3 gets the sit card and the auto-frame zoom.

### 5.2 The crew list

- The readout's `OTHER` and status rows (readoutModel.ts ~114-115) become one row per other player: `P<k>  <status>` (k is 1-based), status by precedence **DOWNED, AWAY, HELM / WEAPONS / SCIENCE (the console sat at), REPAIRING, ON FOOT**. A seated away character reads AWAY.
- `READOUT_ROWS` goes 22 → **23** (three crew rows replace two at n = 4); the plan moves the layout constants that depend on it.
- `OtherStatus`, the sources' `otherStatus()` (runtime and onlineSource) and `ReadoutInput.other` are removed; the readout derives the list from the duel state and `me`.
- Single player: the list shows the one other character (n = 2).

### 5.3 Lobby

Duel-only seat labels (`isDuel`, `menuState.ts:81-84`; the sector keeps its `Bot` labels): `P<k>: EMPTY` (no one has claimed it), `JOINED` (connected, not ready), `READY`, `DISCONNECTED` (claimed, not connected). One row per seat, as today. The host form gets a `CREW` choice: three buttons `2 3 4` in the existing CRT menu style, default 3.

### 5.4 Science badge

The interior gains a badge for the Science console: kind `'science'` (an existing icon kind; added to `StationBadge.kind`), label `SCIENCE`, tint always normal, ordered after WEAPONS and before MEDBAY, omitted when `d.science < 0`.

### 5.5 Online seat notice

Unchanged: `YOU: HELM / WEAPONS / SCIENCE` or `TAKE A CONSOLE: E TO SIT`.

## 6. The three-player playtest checklist

New `docs/playtest-duel.md`. Sections: setup (three computers, the build, Host with crew 3, join codes); roles (who sat where, time to sit); the opening (did Science scan before the 30 s ran out, did anyone ambush); scans (Level 1, Level 2, the weak frequency called out and tuned); the derelict (scanned, salvaged, trapped); the fight (who left their seat and why, hull lost, fight length); a rematch with seats swapped; after the game, the questions of `docs/playtest.md` §6 plus "Science: was there always something to do?" and "Helm/Weapons: did Science's information change what you did?"; a short four-player variant (crew 4, the fourth on foot). `docs/playtest.md` gets a one-line pointer to it for the duel.

## 7. Errors and edge cases

- Crew size outside 2..4 anywhere (host action, init, snapshot header, checkpoint): rejected by the existing validation.
- An away character never sits, walks or repairs; it can still be hurt and downed.
- Two players race to one console: today's rule (first admitted wins).
- Rematch with an empty seat: still away in the next round (the presence copy); a rejoined player is present.
- No view or notice indexes past n.

## 8. Part C: late join (needs the owner: a service redeploy)

- Today a **new** join is refused once the room is active (`services/signalling/src/room/auth.ts:17`, `invalid-state` unless `phase === 'lobby'`); a reconnect with a seat token works in any live phase.
- Part C lets a new join take an **unclaimed** seat while the room is `active`: the service assigns the lowest unclaimed seat and refuses when every seat is claimed; on attach, the seat's away steward is retired and the joiner's client sends `presence true` (the existing path, `onlineDuel.ts:171`; `duelProducers.ts:91,117-119`); the joiner syncs from a snapshot as a reconnecting player does.
- It changes the deployed signalling service, so it is built only after the owner approves a redeploy. Parts A and B do not depend on it.
- **Owner, 2026-11-18: not built in Sci-2.** The plan covers Parts A and B only.

## 9. Tests

- **Sim**: `createDuel` with crew 3 and 4 (spawns 13..16,7, all standing, `present` length n; crew 5 and crew above the spawn count throw); presence for players 2 and 3; a third player sits at Science, a fourth at a free console; the crew-down loss at n = 3 (all three downed, one of them away) and not with one standing; health loops reach player 3.
- **Snapshot/checkpoint/wire**: round trip and validation at n = 3, 4; a header whose playerCount disagrees with the interior refused; `duelRoundOf` at n = 3; checkpoint schema at n = 3; the codec admits players 0..3 and the summary/round tuples are n long.
- **Two-player proof**: duel oracle and canonical trace identical 51 → 52; goldens re-blessed with no behaviour change; gates untouched.
- **Online**: a three-seat session (the existing two-seat harness widened): a human attaches at seat 2; each replica agrees with the authority over a run where the third player scans; a crew-3 start with seat 2 empty has an applied `presence false` and `present[2]` false in the next publication; a dropped seat rejoins; `validateDuelMirror` refuses a capacity/init mismatch.
- **UI**: host form crew choice reaches `host(crew)`; lobby labels EMPTY/JOINED/READY/DISCONNECTED and Start enabled with an empty seat; the readout crew list (n = 2, 3, 4; precedence cases); seat 2 sitting at Weapons shows the sit card; the SCIENCE badge (and none on the Cutter).
- **Part C** (only if built): service unit test for an active-room new join taking the lowest unclaimed seat and refusing when full; app test for a late joiner becoming present.

## 10. Out of scope

- The Engineering console (Eng-1).
- Bots filling empty seats; more than four players.
- Single-player crew sizes other than two.
