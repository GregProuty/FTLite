# Events as Data, and Two Dozen of Them (Loop-v) Design

Status: 2026-11-12. FTL-loop item 4 of the user's direction ("match their game loop as closely as possible before play testing", and "I do want this to feel like you're a crew member in star trek or firefly"). FTL's events carry its Star Trek feeling; its creators found that 15,000 words was not enough variety. FTLite has six hard-coded events. The crew already votes on them (Coop-ii).

## 1. Events become data

- `sim/eventDefs.ts` holds every event as data: `{ id, title, text, choices: Choice[], safeChoice, weight, minDepth? }`, 2 or 3 choices each.
- A **Choice** has `label`, an optional **requirement**, and an **outcome**: either a list of effects, or `{ chance, success: Effect[], failure: Effect[] }` resolved with one `rng.loot` draw.
- **Requirements** (a choice is disabled, and shown dim, when unmet): `scrap ≥ n`, `fuel ≥ n`, `hull > n`, `torpedoes ≥ n`, `stationLevel(kind) ≥ n` (FTL's blue options: shown with the station's name, e.g. `[Science 2] Scan the anomaly`), `crewSkill(skill) ≥ n` for any conscious crew member.
- **Effects** (applied in list order): `scrap ±n`, `fuel ±n`, `hull ±n` (capped at `HULL_MAX`, never below 1 from an event), `torpedoes ±n` (capped), `heal` (conscious crew to full), `crewDamage n` (each conscious crew member), `fire` (a random room), `breach` (a random free site), `failStation` (a random station), `weapon` (a random loot weapon, through the Loop-iii grant rules), `fight` (`normal` or `elite`: an enemy arrives `ENCOUNTER_START` later at this beacon), `pursuit ±x` (moves the Pursuit), `driveReset` (the drive starts charging again), `nothing`. Every random pick uses `rng.loot`, in list order.
- **Scaling.** Scrap amounts in events are written for depth 0 and multiplied by `1 + 0.15 × depth`, rounded, so later events stay worth it.
- `resolveEvent` becomes a small interpreter over this data; the vote flow (Coop-ii) is unchanged. The text the Navigation card and the vote show reads from the data, and choice labels state their effect honestly (no hidden odds, the FTL lesson): `Board her (60%: +40 scrap, else a fight)`.

## 2. The events

- The six existing events become data with their current effects and draws (their tests keep passing).
- At least 18 new ones, for **24 or more** in total, original text, two sentences at most, in the voice of a ship's crew in a lived-in sci-fi universe (Star Trek's and Firefly's tone, none of their names). The mix:
  - at least 6 with a blue option (a station level or a crew skill);
  - at least 4 that can start a fight (a pirate ambush, a bounty hunter, an elite hunter that comes with a big reward);
  - at least 4 with a chance outcome stated in the label;
  - at least 3 that give fuel, 2 that give a weapon, 2 that touch the Pursuit (a shortcut that slows it, a beacon that summons it);
  - some quiet ones with an honest trade-off (pay hull for scrap, scrap for fuel, risk a breach for torpedoes).
- Event selection on arrival: weighted by `weight`, one `rng.loot` draw as today, excluding events above their `minDepth` gate. The same event may not appear twice in one sector.

## 3. State and tests

- New run field: a per-sector bitmask of events already seen. Flattened. `SIM_VERSION` 28; the golden re-blessed once.
- Tests: the interpreter (each effect, each requirement, chance outcomes with their draw, scaling, the hull floor of 1, caps); every event's text within `NAV_TEXT_MAX` and the notice widths; every label of a chance outcome shows its percentage; selection by weight and depth gate; no repeat within a sector; the six old events unchanged in effect; the bots' safe choices still never start a fight; gates re-recorded with causes; no floor lowered.

## 4. Gate

- [ ] Section 3 tests; golden re-blessed once; gates recorded.
- [ ] Visual check by Claude: an event with a blue option, a chance label, a vote, and an event-started fight.
- [ ] Manual, the user: do the events feel like an episode of a crew's life?

## 5. Amendments

(Filled during implementation.)
