# Two Seats That Play (Demo-xi) Design

Status: 2026-11-13. From Claude's playtest (`docs/playtest-report-2026-11-13.md`), findings B1, B2, B3, P1, P2. The user: "great lets start". Goal: two players seated at the Skiff's Helm and Ops can play the loop, and have reasons to get up.

## 1. B1: any other player agrees to a jump

- Today (`interact.ts:107`, `run.ts:331`) only a **standing** Confirm agrees to a pending jump. On the Skiff both players sit, so every jump cancels.
- New rule: while a jump is pending, a Confirm from **any conscious player who is not the Navigation station's occupant** agrees, seated or standing. A seated player's agreeing Confirm is consumed: it does not also act on their card that tick.
- The notice's second line becomes `Other crew: press Confirm to agree  Ns`.
- One conscious crew member still jumps at once (unchanged).

## 2. B3: every player votes in an event

- Today a standing Confirm cycles that player's vote, and the Navigation officer picks with the rows. A seated non-Navigation player cannot vote.
- New rule: while an event is open and unresolved, a Confirm from a seated player who is not the Navigation occupant is a vote press (`scratch.votePress`), exactly like a standing one (cycles 1, 2, 3...), and is consumed (does not act on the card).
- The event card's help line: `Confirm to vote   Navigation officer: pick a row`.

## 3. B2: the Navigation cursor never lands on a jump row by itself

- Today, when rows above the cursor disappear (a bought shop item, a resolved event's choices), the cursor keeps its row number and can land on a jump or sector row; the next Confirm leaves.
- New rule: when the Navigation row list changes between ticks, the cursor stays on the row with the same `select` and `index` if it still exists; otherwise it moves to row 0. Implement where the list is rebuilt or with a remembered (select, index) of the cursor row; if remembering needs state, it must be flattened (SIM version bump covers it).

## 4. P1: leave the first beacon at once

- At a sector's calm arrival beacon (`run.calm` set to 1: the run's start and each sector jump), the drive is full: `jumpCharge = 1`.

## 5. P2: fire burns systems

- Today fire on our ship only drains oxygen and hurts crew in the room.
- New rule: every hazard tick, each station in a burning room gains `FIRE_HEAT_MAX × min(1, fire / FIRE_HEAT_FULL)` heat (rounded to an integer), on top of today's heat rules (rise while overdriven, idle cooling, coolant). Tuning: `FIRE_HEAT_MAX = 6`, `FIRE_HEAT_FULL = 8`. A station reaching `HEAT_MAX` overheats through the existing path (`overheat()`: it fails, its occupant stands, repair is the usual loop). With idle cooling 4 per tick, an untended fire fails its room's stations roughly 20 to 30 s after it starts; a fire put out early does nothing.
- On the Skiff the Ops room holds three stations: an Ops fire threatens Science, Engineering and Doors at once. That is intended.

## 6. Tests and gates

- B1: a seated non-Navigation Confirm agrees and is consumed (its card did not act); the Navigation occupant's own Confirm does not agree; a standing Confirm still agrees.
- B3: a seated non-Navigation Confirm cycles that player's vote and is consumed; the Navigation officer still picks with rows.
- B2: buying a shop item above the cursor leaves the cursor on the same row; a resolved event puts the cursor on row 0, not a jump row.
- P1: the start and every sector arrival have `jumpCharge` 1.
- P2: heat rises in a burning room's stations by the formula; an untended fire fails the station (test the tick it overheats); no heat without fire; existing heat tests unchanged.
- Bots: the captain bot's jump agreement still works (`bot.ts:178`).
- SIM version bumped once, golden re-blessed once, every gate re-recorded with causes. **No floor lowered**: if a gate floor fails, stop and report the figures.

## 7. Gate

- [x] Tests and gates above (2026-11-13, branch `two-seats`: 1165 tests, every gate figure unchanged, `gate-jump` re-pinned; `docs/gates.md`).
- [x] Claude's second playtest (2026-11-13, master 361ca40): two seated players jumped 10 s into the run without standing; a fire set in Ops (fixture) failed Science, Engineering and Doors about 22 s later and downed the seated officer, who needed rescuing. Seated voting is covered by tests, not re-played.
- [ ] Manual, the user: the couch checklist `docs/playtest.md` sections 1 to 4.

## 8. Amendments (Claude's review; Codex timed out)

1. **Who is "the Navigation occupant".** On a group console the Helm officer occupies Navigation on every tab (Demo-x-a amendment 2 seats the active tab, but `stations.occupant` holds the officer at every member). So the Helm officer's Confirm on the Weapons tab during a pending jump fires the weapon, not an agreement. Use `stations.occupant[navigation station]`, not `Seated.station`.
2. **Order.** An open, unresolved event takes the press before a pending jump (as today for standing presses). Only conscious players count.
3. **Fire heat only on online stations.** A failed or unpowered station gains no fire heat, so `overheat()` never re-fails a failed station. Heat from fire is applied in the same hazard tick and order as today's heat, deterministic, no new rng draws beyond `overheat()`'s existing one.
4. **Bots.** Bots that sit may now agree from their seats; check `bot.ts` still produces the same agreement behaviour and record any gate movement with its cause.
5. **Notice spacing.** The jump notice's second line uses the spec's two spaces before the countdown (`Other crew: press Confirm to agree  Ns`); the old line had three.
6. **How a seated press is consumed.** Step 1 marks a seated agreement or vote in a tick scratch (`scratch.confirmUsed`, not snapshotted); the console step passes no Confirm to the card for that player. A seated player on a group's tab bar agrees or votes the same way.
7. **Seated bots.** A seated bot that is not the Navigation occupant does what a standing bot does: while an event is open it presses Confirm only until its vote is the safe choice (its card gets no Confirm meanwhile), and it presses Confirm while a jump is pending. The Navigation occupant bot is unchanged.
8. **The cursor's memory (B2).** `run.navSig` (a 32-bit signature of the rows' (select, index) sequence, -1 for none), `run.navSelect` and `run.navIndex` (the cursor row's key) are flattened. The check runs at the end of every tick and before the officer's input; the officer's own move updates the key before a buy or a vote in the same tick. A jump sets the signature to -1: row 0, no relocation. "Row 0" is then made selectable by the existing clamp (the shop header is not selectable, so the cursor goes to the first item). At an event beacon without a shop, row 0 is the first destination row: the cursor goes there, not to the row its old number pointed at, but it is a jump row (with two crew the jump still needs the other player's agreement).
9. **P1 blocked a gate.** With the drive full at the calm start, the captain bot jumps at once and every five-minute bot gate meets its fights about 60 s earlier. `gate-skiff` seed 2 fell to min health 10.7 (floor 14). Resolved by amendment 10 (the controller's decision): P1 stays.
10. **The captain bot keeps the old wait at a calm beacon.** P1 is for humans. The captain bot does not go to the Helm or request a jump at a calm beacon until `JUMP_CHARGE_TIME` seconds (times the ship's charge quirk, as the old charge) after the arrival tick, `run.arrivalTick` (new, flattened; 0 at the start, set by every jump). The gates measure crew survival under the same scenario as before; the bots' departure time is a test convention, not human difficulty. No gate setup or floor changed for it. The test helper `chargeJump` (the drive ready) also puts `arrivalTick` far enough back that the wait is spent.
11. **An awake start beacon starts with an empty drive.** The test helper `wake` (an awake, not calm, start beacon, used by `hazardStart` and the hazard gates) now also sets `jumpCharge = 0`: P1 fills the drive only at a calm beacon, and with a full drive the bots left the awake start at once (the boarding gate then saw 0 boardings on every seed even with amendment 10, since `wake` clears `calm`). This keeps `gate-boarding` on its old scenario without touching its setup (`gate-survival` and `gate-cutter` already hold the drive below ready every tick).
12. **B2 at an event beacon (accepted).** After an event resolves at a beacon without a shop, row 0 is the first destination row, so the cursor sits on a jump row (the first one, not whatever row its old number pointed at). Accepted by the controller; with two crew the jump still needs the other player's agreement.
13. **Fire heat's arithmetic.** The fire heat is added after today's rule for the tick (overdrive rise or idle cooling, coolant, each clamped at 0) and the sum is capped at `HEAT_MAX`; the room's fire is read live in ascending station order, so an overheat that ignites the room in the same loop heats a later station there by the new fire. From cold a full fire gives 6, then 2 a tick net of idle cooling: the overheat comes on the 118th hazard tick (about 10 s at full fire; about 20 s from a fresh fire that has to grow). Fires at 5 or less hold their station's heat at 4 or less.
