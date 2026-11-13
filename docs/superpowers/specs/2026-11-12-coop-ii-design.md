# Working Together, Part Two (Coop-ii) Design

Status: 2026-11-12. The second half of the user's "make this fun for multiplayer and encourage the players to work together" ("ok lets do it"). Coop-i (Science lock, team speed, callouts, teamwork counts) comes first. These three are new mechanics and are best judged in the first playtest. Same principle: together is clearly better, and alone still works.

## 1. Evasive manoeuvre: the pilot dodges on the Science officer's call (sim)

- The Navigation officer can press Confirm on the evade row to start an **evasive manoeuvre**: a window of `EVADE_WINDOW` (1.0) seconds, then a cooldown of `EVADE_COOLDOWN` (6) seconds. New run fields `evadeUntilTick` and `evadeReadyTick`.
- An impact (debris, rock or enemy shot) that resolves inside the window rolls its evade check against twice the usual evade chance, capped at `EVADE_CAP` (0.8). Outside the window it uses the usual chance. It is the same single draw either way.
- The pilot cannot see impact times. The Navigation card does not show them, though Science's target rows and the threats panel do. Science (or anyone reading the threats) calls "incoming in 3, 2, 1, now!". A lone pilot can still time a manoeuvre by watching the threats panel.
- **Telemetry:** `timedEvades` (evades won inside a window).
- **Bots:** the captain bot never triggers a manoeuvre. Gates should be unchanged; check and record.

## 2. Carried torpedoes (sim)

- Torpedoes no longer appear in the Weapons tube from stock by themselves. Loading needs a crew member to fetch a torpedo from the **magazine** and carry it to the Weapons console.
- The magazine is a tile in a cargo room, a new optional layout field (`magazine: [x, y]`; the cutter's goes in the Lower Hold, the starter's in a hold room). Interact at the magazine with stock above 0 picks up one torpedo: stock −1, and the crew member is now **carrying**.
- A carrying crew member moves at `CARRY_SPEED_MULT` (0.8) speed and cannot fight fires or repair. Interact at the Weapons console while the tube is empty loads it (the tube's existing load time then runs). Being downed drops the torpedo back into the magazine stock.
- New crew field `carrying` (0/1), flattened.
- A seated gunner cannot fetch a torpedo, so someone else runs them. Alone, you fetch, load, sit and fire.
- **Ships without a magazine** (old layouts and tests) keep today's automatic loading, so tests and gates that don't involve the magazine are unchanged.

## 3. Crew decisions (sim plus HUD)

- **Event votes.** Each conscious player chooses an event option at any console or with their own Confirm while the event is open: their choice is shown beside their name. The event resolves when every conscious player has chosen, or after `VOTE_SECONDS` (15). The majority wins; ties go to the Navigation officer's choice, or else to the lowest option index. One player votes alone. Bots vote `EVENTS.safeChoice`.
- **Route confirmation.** A jump needs the Navigation officer's Confirm plus one more conscious crew member's Confirm (any player, anywhere) within `CONFIRM_SECONDS` (5): "Helm: jump to 3B? (2/2)". A crew of one, or a crew whose others are all downed, needs only the pilot.
- New run fields hold the votes and the pending confirmation, flattened.
- **Telemetry:** `votesUnanimous`, `votesSplit`.

## 4. Tests

Each rule above, with solo and bot paths; snapshot round trips; gates re-recorded (the magazine changes the cutter and starter if they get one: record the cause); no floor lowered; the golden re-blessed once. `SIM_VERSION` takes the next free number after Coop-i.

## 5. Gate

- [ ] Tests, gates and golden as above.
- [ ] Visual check by Claude: a timed manoeuvre, a torpedo run from the magazine, an event vote with two players.
- [ ] Manual, the user: does the magazine make someone a runner, and is it fun? Do votes spark talk or just slow things down?

## 6. Amendments

(Filled during review and implementation.)

### Codex spec review (research/codex-review-coop-ii-spec.md), 2026-11-12: all eight findings resolved; these rules override sections 1–3.

- **D1. The window's chance.** Inside a window the evade check uses `min(EVADE_CAP, 2 × evadeChance(output))`, where `evadeChance` is today's whole formula (`EVADE_BASE + EVADE_SCALE × output`, debris.ts:79–81); the cap applies after doubling. Same single draw.
- **D2. Eligibility.** A manoeuvre can be started only by a seated Navigation officer at an online station, and not during its cooldown. An impact is inside the window when it resolves on a tick with `state.tick < evadeUntilTick`; the window covers ticks `[start, start + 60)`. Evade rolls still need Navigation online and occupied, as today. A window that sees no impact is simply spent: the cooldown is its cost.
- **D3. Counters.** `timedEvades` counts successful evades inside a window; `timedRolls` counts every roll inside one.
- **D4. Magazine ships.** Stock still regenerates as today (`regenTorpedo` unchanged; the stock lives in the magazine). Automatic loading into the tube is off. Delivering a carried torpedo to an empty tube that is not loading starts the existing load timer. Starting stock is unchanged.
- **D5. Pickup and drops.** Interact on the magazine tile picks one up when stock > 0 and the crew member is not already carrying: stock − 1, `carrying = 1`. Interact on the Weapons console tile delivers when the tube is empty and not loading. A carrier who is downed returns the torpedo to stock, capped at `TORP_CAP` (a return at the cap is lost; the HUD notes `Torpedo dropped`). A jump does not drop it.
- **D6. Electorate and resolution.** The electorate is every Conscious player, bots included (bots are players driven by bot intents). Votes are stored per player (`run.vote[pid]`, −1 none). Bots vote `EVENTS.safeChoice` on the first tick the event is open. An event resolves at a single point in the run step: when every Conscious player has a vote for an enabled option, or `VOTE_SECONDS` (15) after it opened. This replaces the immediate resolution in events.ts:28–42.
- **D7. Input.** While an event is open, a player who is not seated votes with their own Confirm: the first press votes option 1, each later press switches to the other option. The seated Navigation officer votes with the existing rows and cursor. While an event is open, a non-seated player's Confirm is a vote, never a door seal. Route confirmation: after the pilot confirms a jump, a non-seated player's Confirm within `CONFIRM_SECONDS` (5) is the second confirmation; during those seconds it is never a door seal either. Votes and confirmations carry the player id from the intent index.
- **D8. Timeouts and ties.** At the deadline, missing votes are ignored; a player downed before resolution leaves the electorate and their vote is discarded; votes for an option that has become disabled are discarded. A tie goes to the Navigation officer's vote if one is seated, conscious and voted for a tied option; otherwise to the lowest tied index. With no valid votes at all, `EVENTS.safeChoice` applies.

### Implementation, 2026-11-12

- **D9. The evade row.** `navRows` always ends with one `evade` row (also under a pending event and in the last column), so every other row keeps its index; Up from the first selectable row reaches it in one press. Its text is `EVADE: Confirm` (enabled: Navigation online and `tick >= evadeReadyTick`), `EVADING` during the manoeuvre, `EVADE Ns` on the cooldown (whole seconds, rounded up); the disabled states draw dimmed. The cooldown runs after the window: `evadeReadyTick = evadeUntilTick + EVADE_COOLDOWN x 60`, so starts are 7 s apart. Both ticks are -1 until the first manoeuvre. Tests that listed the rows exactly gained the evade row (events, hud, run). The captain bot never selects it.
