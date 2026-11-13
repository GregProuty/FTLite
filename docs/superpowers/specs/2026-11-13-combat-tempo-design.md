# Combat Tempo (Demo-xiii) Design

Status: 2026-11-13. From Claude's playtest (`docs/playtest-report-2026-11-13.md`, finding P3); roadmap item 32. The user wants "fun and FTL level playability".

## 1. What the playtest measured

- The Pulse Laser recharges in about 12 s on the Skiff (Weapons level 2; `BEAM_CHARGE_TIME` 6 at output 1). The first enemy (110 hull, one shield layer that comes back in `SHIELD_RECHARGE_TIME` 6 s) was at 36 % after a minute of firing, torpedo included.
- The enemy cost us **8 hull in a minute**: one hit every 20 s (`ENEMY_FIRE_INTERVAL`), about 4 hull each. Ignoring it was safe.
- FTL's first fights take 30 to 90 s and an ignored enemy costs a third of the hull. Ours are slower and toothless.

## 2. The problem with tuning it straight away

The test bots never fire weapons. Every gate fight lasts until the enemy leaves (`ENCOUNTER_MAX` 120 s), so a harder enemy only means more damage to a crew that cannot fight back, and the gate floors would fail for a reason that says nothing about real play. So this feature comes in two steps.

## 3. Step 1: a bot gunner

- A bot seated at Weapons (including the Weapons tab of a group console: the bot switches to the tab) fires like a sensible player:
  - target: the enemy's Shields room while it has shield layers or its shields system is up, else its Weapons room;
  - the torpedo (and a loot Missile Pod) when loaded, at the Shields room;
  - the Pulse (and loot beams) when charged, at the frequency Science found if one is known (the lock if set), else its current selector;
  - it holds fire while the enemy offers surrender (take the scrap), and never fires at an asteroid field's rocks unless that is today's rule for the bots.
- A Science bot, when one is seated and idle, scans the enemy's shield (today's scan).
- The gunner uses only the inputs a player has (no reading of hidden state the card does not show), deterministic, no new rng draws.
- Re-record every gate with the gunner on. Fights now end by kills, flights and surrenders; record the kill counts. **Floors may only rise** (a floor that is now far below the minimum may be raised to just under it, recorded with the figures); none lowered.

## 4. Step 2: the tempo

Targets, measured with the gunner on the Skiff gate's seeds and a passive-crew test:

- **Our fire:** `BEAM_CHARGE_TIME` 6 → 4 (Pulse 8 s at level 2). The first enemy dies or flees in **40 to 80 s** with the starting loadout and a gunner.
- **Their fire:** an ignored first enemy costs **15 to 30 hull over 60 s** (a passive crew, nobody seated). Pick one lever, the fire interval (`ENEMY_FIRE_INTERVAL` 20 → around 12) or the damage per hit, record why, and keep `ENEMY_FIRE_MIN` sane.
- Later depths scale as today (column, sector); check that a sector-3 enemy with a gunner and no upgrades is hard but survivable on the gate seeds.
- If a gate floor fails after step 2 with the gunner on, stop and report the figures with the cause; do not lower it.

## 5. Tests

- Gunner: targets Shields then Weapons; fires a loaded torpedo; uses a known frequency; holds fire on a surrender; switches to the Weapons tab on a group console.
- A passive-crew test pinning hull lost in 60 s against the first enemy (the 15 to 30 band).
- A gunner test pinning the first fight's length (the 40 to 80 s band).
- SIM version bumped once for the whole feature, golden re-blessed once, gates re-recorded with causes in `docs/gates.md`.

## 6. Gate

- [ ] Tests and gates above.
- [ ] Claude's full-run playtest on the Skiff: the first fight feels urgent; a fire or a breach during it forces a choice.
- [ ] Manual, the user: the couch checklist.
