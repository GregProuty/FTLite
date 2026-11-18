# Sci-2: a crew of two, three or four online, and the three-player playtest (design)

Date: 2026-11-18. Status: design, owner-approved in brainstorming. Builds on Sci-1 (`2026-11-17-science-scans-design.md`, merged bf6b7e32, SIM_VERSION 47), start aboard (`2026-11-17-start-aboard-design.md`) and the networked duel (`2026-11-16-helm-h2-networked-duel-design.md`).

## 1. Goal

Let a duel be played online by two, three or four people, so the owner can run a three-player playtest (Helm, Weapons, Science). Write the checklist for that playtest.

## 2. Owner decisions (fixed)

1. A duel room holds **2, 3 or 4** players; the host picks the crew size.
2. A fourth player gets an **Engineering console** in a separate feature (**Eng-1**, designed next). Until then the fourth player works on foot: repairs, fires, revives, and may take any free console.
3. The host may **start with empty seats**; an empty seat's character stands idle aboard. A late joiner takes over an empty seat (Part C, §7).
4. **Single player keeps two characters** (Tab switches), unchanged.
5. The scripted bots and the headless gates stay two-player.

## 3. Crew size in the sim (Part A)

- The duel gets a **crew size** `n` ∈ {2, 3, 4}. `createDuel(layout, seed, helmPlayer = 0, crew = 2)` builds the interior with `n` Recruits (`createSimState(layout, n, seed, Array(n).fill(RECRUIT))`); every character starts standing at the layout's spawns in player order (the Hound has four: room Q, tiles 13..16,7).
- Every per-player duel value is `n` long: `DuelState.present` (all true at creation), and the presence module's fields `present.0` .. `present.(n−1)`. Anything else in `sim/duel` sized for two players (grep `0 | 1`, `[0, 1]`, `pid < 2`, `1 - helmPlayer`) is widened to `n` or, where it is the scripted pair's own bookkeeping, left two-wide and only used when `n === 2`.
- `helmPlayer` seats nobody since start aboard. It stays in the round module and the wire; its range becomes `0..n−1`, and the app always passes 0.
- The rematch keeps `n` (`startRound` passes the crew size to `createDuel`).
- `presence` commands are admitted for players `0..n−1`; `malformed` beyond.
- Snapshot and wire: `DUEL_PLAYERS` (snapshot.ts) stops being a constant for the sim; the snapshot header's `playerCount` carries `n` (2..4), validated against the interior's own player count; `DuelInit.playerCount` is `2 | 3 | 4` (was `z.literal(2)`); the duel checkpoint's per-player arrays (`commandHighWater`, `admissionCounts`, `heldHighWater`, `held`, `pauseOwner`) are `n` long; the duel codec is built with `duelCodec(n)`; `duelRules.playerCount` returns the state's `n`; the duel client reads `n` from the snapshot.
- **Two-player runs are byte-identical.** `SIM_VERSION` 47 → 48 as a version-only step (the snapshot header and checkpoint schemas widen, so old and new builds must not pair). No MIGRATIONS entry is needed if the two-player field list is unchanged; the duel oracle and canonical trace prove every recorded run unchanged; bless at 48. No golden behaviour changes.

## 4. Online room (Part A continued)

- **Host form**: a `Crew` choice `2 / 3 / 4`, default **3**, shown as three buttons in the existing CRT menu style. Create room reserves a room with that capacity (the service already accepts 1..4).
- The main process stops requiring capacity 2 (`src/main/network/onlineDuel.ts` `snapshot.capacity !== 2`): it accepts 2..4 and builds the duel with `crew = capacity`.
- **Lobby**: one row per seat: `SEAT n: <joined / ready / empty>`; the host's Start is enabled when every **joined** player is Ready (at least the host). Empty seats are allowed.
- **An empty seat at start** (nobody claimed it): its character is created present = false (away), stands at its spawn, and never moves. A dropped player's character becomes away as today; the same player can rejoin with their seat token as today.

## 5. What each player sees (Part B, presentation)

- **Crew list**: the readout's single `OTHER  PRESENT / AWAY` row (readoutModel.ts ~line 114) becomes one row per other player: `P2  HELM` / `WEAPONS` / `SCIENCE` / `ON FOOT` / `AWAY` (player numbers 1-based as shown to people; `ON FOOT` for a present standing character; `DOWNED` when downed). The readout keeps `READOUT_ROWS` large enough for four crew; if it does not fit, the plan raises the row budget and moves the layout numbers it depends on.
- The partner status line (`OtherStatus`) is replaced by this list everywhere it was shown.
- The online seat notice already reads `YOU: HELM / WEAPONS / SCIENCE / TAKE A CONSOLE: E TO SIT`; unchanged.
- **Station badge**: the interior gains a `SCIENCE` badge on the Science console tile (glyph kind `science` if `drawIcon` has one, else the closest existing kind), red when the Science console is failed if the duel models that, never faint.
- Single player: unchanged (two characters; the list shows the one other).

## 6. The three-player playtest checklist (Part B)

- New `docs/playtest-duel.md`, replacing the Skiff checklist's role for the duel. Sections: setup (three computers, build, crew 3), roles (who sat where), the opening (did Science scan before the 30 s ran out; did anyone ambush), scans (Level 1, Level 2, the weak frequency called out and tuned), the derelict (scanned? salvaged? trapped?), the fight (who left their seat and why; hull lost; length), a rematch with seats swapped, the after-game questions (as in `docs/playtest.md` §6, plus "Science: was there always something to do?"), and a short four-player variant (the fourth on foot).
- `docs/playtest.md` gets a one-line pointer to the new file for the duel.

## 7. Late join (Part C, needs the owner: service redeploy)

- Today a **new** join is refused once the room is active (`services/signalling/src/room/auth.ts:17`, `invalid-state` unless `phase === 'lobby'`); a reconnect with a seat token works in any live phase.
- Part C lets a new join take an **unclaimed** seat while the room is `active`: the service assigns the lowest unclaimed seat; the host's authority marks that character present on the joiner's attach (the existing presence path); the joiner syncs from a snapshot as a reconnecting player does.
- This changes the deployed signalling service, so it ships only after the owner approves a redeploy. Parts A and B do not depend on it; without Part C, an empty seat stays empty for the round and the room for the run.

## 8. Errors and edge cases

- Crew size outside 2..4 anywhere (host form, snapshot, checkpoint, init): rejected with the existing validation errors.
- An away character never sits, walks or repairs; consoles it is not at stay free.
- Two players race to sit at one console: today's rule (first admitted wins, the other gets the existing rejection).
- Rematch with an empty seat: the seat stays empty (away) in the next round; a player who dropped and rejoined is present.
- The online notice and crew list must not index past `n`.

## 9. Tests

- **Sim**: `createDuel` with crew 3 and 4 (characters at spawns 13..16,7, all standing, `present` length n); presence for players 2 and 3; a third player sits at Science and a fourth at a free console; snapshot round trip and validation for n = 3, 4 (and a mismatched header refused); rematch keeps n.
- **Two-player proof**: duel oracle and canonical trace identical 47 → 48; goldens re-blessed at 48 with no behaviour change; gates untouched.
- **Wire**: the duel codec for n = 3, 4 admits players 0..n−1 and refuses n; checkpoint schema for n = 3, 4.
- **Online**: a three-seat session (the existing two-seat session harness widened): each seat's replica agrees with the authority over a run where the third player scans; start with an empty seat (that character is away); a dropped seat rejoins.
- **UI**: host form crew choice; lobby rows and Start enabled with an empty seat; the readout crew list (2, 3, 4; AWAY, ON FOOT, DOWNED); the SCIENCE badge.
- **Part C** (only if built): service unit test for an active-room new join taking the lowest unclaimed seat and refusing when full; app test for a late joiner becoming present.

## 10. Out of scope

- The Engineering console (Eng-1).
- Bots filling empty seats; more than four players.
- Single-player crew sizes other than two.
