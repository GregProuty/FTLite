# Duel health, downed and Medbay (one-page spec)

Owner, 2026-11-17: "lets add player health and working medical bay. when a player runs out of health they go into a
downed state, where they can be picked up by another player ... the other player just stands next to them for 5
seconds and then they go back to 1 health. if the medical bay is powered on then they tick back to full health."

Tier: content (grill Q31). The interior SimState's existing `Health.cur`, `Life.state` and `Life.reviveProgress` are used,
and the duel hash (the interior's canonical flatten) and snapshot already carry them. There is no new command or wire
field. One-page spec, build, one review, owner playtest. Decisions marked (rec.) were taken without asking.

## 1. Rules

1. **Health.** Each character has `HEALTH_MAX` (100) health and starts the round full. It is shown, not hidden.
2. **What hurts** (rec.: the duel has no crew damage today, so health needs a source):
   - **Fire:** standing in a burning room costs `FIRE_DAMAGE` (3) health per second, per tick.
   - **Hits:** a hit on the crew ship costs `ENEMY_SHOT_CREW_DAMAGE` (12) health to every conscious character standing
     in the interior room of the hit tactical Room's repair point. The hits are the ones duel fire counts (spec
     2026-11-17-duel-fire §1.1): a laser costs 12, a missile `DEBRIS_CREW_DAMAGE` (20). The damage is applied in
     tactical event order, after stepDuel, before the fire rolls.
   - Seated characters are on the Bridge, which is not a tactical Room, so they are safe.
3. **Downed.** At 0 health a character becomes `Downed`. It stands up if seated, stops moving and acting (no movement,
   no Interact, no sit), and its held input is ignored. There is no bleed-out and no death (rec.): the duel has no
   death loop.
4. **Picked up.** A conscious, present, standing teammate whose centre is within `REACH` (1.5 tiles) of the downed
   character's centre adds one tick to `Life.reviveProgress`, with no key held (owner). At `DUEL_REVIVE_TICKS = 300`
   (5 s) the character is `Conscious` at 1 health. If the teammate leaves reach before then, progress resets to 0
   (rec.). Progress is stored as a fraction, ticks / 300, from whole ticks, so 300 ticks is exact.
5. **Both downed** (rec., so the game never soft-locks): while every character is downed, each one's
   `reviveProgress` advances on its own at a third of the speed (900 ticks, 15 s). Only the first character to wake
   reaches 1 health that way; the other then needs a teammate's help.
6. **Medbay.** A conscious character standing in the room of the layout's Medbay station heals `MEDBAY_HEAL` (4)
   health per second, up to `HEALTH_MAX`, while that station is online (`stationOnline`). A whole heal from 1 takes
   about 25 s. In the duel the Medbay is powered from the start, and nothing in the duel turns it off yet. Downed
   characters do not heal.
7. **Events** (derived, unhashed, appended to `d.events`): `crewHurt {player, amount, cause: 'fire'|'hit'}`,
   `downed {player}` and `revived {player, by: number[]}` (`by` is empty for a lone wake). These come after the
   repair and fire events of the tick.
8. **Rounds.** A new round starts everyone full and conscious. The end card changes nothing.
9. **Scripted bot** (tests and the away steward, if it walks): reviving a downed teammate outranks repair. A hurt bot,
   below 50, with nothing to repair, goes to the Medbay (rec.).
10. **SIM_VERSION** 40 → 41. Bless as for duel fire: bump alone and bless, then the gameplay change and a same-version
    bless. No `--fresh` and no hand edits.

## 2. Views

- **Readout:** a `HEALTH` row for the shown character (`72/100`, red under 30, `DOWNED` when downed), and `OTHER`
  status `DOWNED` for the teammate.
- **Interior:** a small health bar above each character below full health. A downed character already draws as the
  downed token. A ring of progress or a `DOWNED - STAY CLOSE` label shows near a downed character while being picked up.
- **Medbay:** while someone heals, soft green `+` particles rise from them, if cheap. Otherwise leave it at the health
  bar rising.
- **Help:** add `STAND BY DOWNED TO REVIVE` only if it fits the column. Otherwise none.

## 3. Tests

- Fire damage: 3/s exactly, for whoever stands in the room.
- Hit damage: 12 for a laser and 20 for a missile, to standing characters in the hit room only; seated characters
  take none.
- Downed at 0: stood up, no movement, no Interact, no sit.
- Revive: 300 ticks within reach gives 1 health; leaving reach resets progress.
- Both downed: a lone wake after 900 ticks.
- Medbay heals 4/s while online and none while offline (force it offline in the test).
- Round reset; snapshot mid-downed and mid-revive restores and continues identically; determinism and goldens after the
  bless.
