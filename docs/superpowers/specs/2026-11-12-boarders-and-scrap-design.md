# Boarders Suffer Vacuum and Fire; Scrap Scales by Column (Demo-ix) Design

Status: 2026-11-12. From the FTL postmortem review, which the user approved: FTL's founding fantasy was "half the ship is on fire and aliens are in the ducts, so we vent the rooms", where every problem has several ways out. Late-game scrap also climbs, so a run that is going badly can still recover. Parents: Increment 3 / Combat (boarders), Run-ii (scrap, shop), Demo-vii (airlocks), Demo-viii (field reward).

## 1. Boarders feel the ship

Today `boarders.ts` never reads oxygen or fire: venting a room or letting it burn does nothing to boarders in it.

- In `boarderSystem`, for each active boarder in room `r`, per tick: if the room's oxygen fraction is below `SUFFOCATE_FRAC` (0.1) it takes `BOARDER_O2_DPS` (6, the crew's `O2_DAMAGE`) per second; if the room burns it takes `BOARDER_FIRE_DPS` (3, the crew's `FIRE_DAMAGE`) per second. The two add up.
- This damage goes through a variant of `damageBoarder` with no killer (`pid = −1`). A boarder killed this way still pays `SCRAP_BOARDER` and counts in `telemetry.boardersKilled`; no XP is awarded. A new telemetry counter `boardersVented` counts these deaths (flattened after the last telemetry scalar).
- Boarders do not flee vacuum or fire. Their movement rules are unchanged, which is what makes venting a trap worth setting.
- Order: hazard damage is applied in `boarderSystem` before boarder movement and melee, ascending slot. There are no new random draws.
- `SIM_VERSION` +1 (whatever follows Demo-viii); the golden re-blessed once.

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

(Filled during review and implementation.)
