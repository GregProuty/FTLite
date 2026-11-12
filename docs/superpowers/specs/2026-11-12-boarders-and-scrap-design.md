# Boarders Suffer Vacuum and Fire; Scrap Scales by Column (Demo-ix) Design

Status: 2026-11-12. From the FTL postmortem review, which the user approved: FTL's founding fantasy was "half the ship is on fire and aliens are in the ducts, so we vent the rooms", where every problem has several ways out. Late-game scrap also climbs, so a run that is going badly can still recover. Parents: Increment 3 / Combat (boarders), Run-ii (scrap, shop), Demo-vii (airlocks), Demo-viii (field reward).

## 1. Boarders feel the ship

Today `boarders.ts` never reads oxygen or fire: venting a room or letting it burn does nothing to boarders in it.

- In `boarderSystem`, for each active boarder in room `r`, per tick: if the room's oxygen fraction is below `SUFFOCATE_FRAC` (0.1) it takes `BOARDER_O2_DPS` (6, the crew's `O2_DAMAGE`) per second; if the room burns it takes `BOARDER_FIRE_DPS` (3, the crew's `FIRE_DAMAGE`) per second. The two add up.
- This damage goes through a variant of `damageBoarder` with no killer (`pid = −1`). A boarder killed this way still pays `SCRAP_BOARDER` and counts in `telemetry.boardersKilled`; no XP is awarded. A new telemetry counter `boardersVented` counts these deaths (flattened after the last telemetry scalar).
- Boarders do not flee vacuum or fire. Their movement rules are unchanged, which is what makes venting a trap worth setting.
- Order: hazard damage is applied in `boarderSystem` before boarder movement and melee, ascending slot. There are no new random draws.
- `SIM_VERSION` 21 (after Demo-viii's 20, amendment B5); the golden re-blessed once.

## 2. Scrap scales with the column

Every scrap reward becomes a base plus a per-column step, with column = `run.column` at the moment of the reward:

| Reward | Today | New |
|---|---|---|
| Per jump (on arrival) | 15 | 10 + 4 × column |
| Enemy destroyed | 30 | 20 + 6 × column |
| Surrender | 20 | 15 + 4 × column |
| Boarder killed | 10 | 8 + 2 × column |
| Asteroid field cleared (Demo-viii) | 20 | 15 + 5 × column |

Helpers live in `tuning.ts`, for example `scrapPerJump(column)`. Shop prices are unchanged. The shop and run notices that quote reward amounts (the Demo-viii field notice) print the computed value.

## 3. Tests

- Boarders: one in a room below 10% oxygen loses 6 per second; in a burning room 3 per second; both add; at 0 it is removed with scrap, `boardersKilled` and `boardersVented`, and no XP; boarders in a normal room take nothing; there are no extra rng draws (the hash over a run with no boarders is unchanged apart from the version).
- An integration test on the cutter: boarders in the Engines, the Engines airlock opened from the Doors console, every boarder there dead within 10 s.
- Scrap: each reward at columns 0, 3 and 7; the field notice text.
- Snapshot round trip with `boardersVented`.
- Gates re-recorded: boarding most of all (it may rise, because boarders now burn), plus survival, duo, cutter, jump, run and acceptance; no floor lowered.

## 4. Gate

- [ ] Section 3 tests; golden re-blessed once; gate figures recorded with the cause.
- [ ] Manual, the user: venting a room full of boarders feels like a deliberate trick, and late-game scrap lets a struggling run recover.

## 5. Amendments

### Codex review (research/codex-review-demo-viii-interior-and-ix.md), 2026-11-12: findings 5-9 resolved; these rules override sections 1 and 2.

- **B5. Version.** Demo-ix is built on Demo-viii (SIM_VERSION 20) and sets 21.
- **B6. Hazard deaths.** A separate killBoarderByHazard(state, slot) handles them. It returns if the slot is not active, then pays scrap, counts boardersKilled and boardersVented, deactivates the slot and awards no XP. damageBoarder is unchanged for melee. A slot killed by hazard is skipped by the rest of boarderSystem that tick.
- **B7. Sampling.** Hazard damage reads each active boarder's room b.room[k] (boarders live in rooms, not tiles) at the start of boarderSystem. That is after crew movement and the hazard step in step.ts, and before boarder movement and melee, in ascending slot.
- **B8. Displayed amounts.** Every notice that prints a reward uses the same column helper as the code that pays it: the surrender line in hudModel.ts (today SCRAP_SURRENDER directly), the field-cleared notice and any shop or run text that quotes a reward. Each payout reads run.column at the moment it is paid. The per-jump scrap is paid in arrive after the jump has advanced the column, so it uses the new column.
- **B9. Telemetry.** boardersVented is both flattened and exposed in the telemetry record next to boardersKilled.

(Implementation amendments follow.)

### Implementation, 2026-11-12

- **B10. Cutter integration timing.** "Every boarder dead within 10 s" cannot hold with the spec's values: a boarder has `BOARDER_HEALTH` 60 and loses 6 per second, so it needs exactly 10 s once its room is below 10 %, and the vented Engines (doors sealed) falls below 10 % about 1.75 s (105 ticks) after the airlock opens. The test asserts both boarders die more than 10 s and at most 12 s after the Confirm. No value changed. The fixture seals the Engines doors directly (boarders pass Closed doors) and opens the airlock through the Doors console.
- **B11. The fire-immunity assertion.** The Boarders-i Medbay-ordering test pinned "boarders are immune to fire"; it now expects 120 ticks in a burning room to cost `BOARDER_FIRE_DPS` per second.
- **B12. Plumbing.** `TELEMETRY_SCALARS` 25 -> 26 for `boardersVented`; the version-rejection snapshot test now uses 20. The telemetry record's `boarders` block is `{ parties, killed, vented }`; the acceptance and progression fixtures carry `vented: 0`; the acceptance table's boarders column stays `parties/killed`. In `damageBoarder` the kill XP is now awarded before the shared bookkeeping (`killBoarder`); neither touches an rng stream, so the result is the same.
- **B13. Arrival order.** The hazard pass runs before the arrival check in `boarderSystem`, so a party never takes damage on the tick it arrives, and a hazard kill of the last boarder re-arms the cooldown before arrival is checked.
