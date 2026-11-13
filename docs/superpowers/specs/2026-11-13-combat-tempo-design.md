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

- [x] Tests and gates above (2026-11-13: `tests/botGunner.test.ts`, `tests/combatTempo.test.ts`, every gate re-recorded in `docs/gates.md`, none lowered; SIM_VERSION 33, golden 85dc14ae -> 0661052e).
- [ ] Claude's full-run playtest on the Skiff: the first fight feels urgent; a fire or a breach during it forces a choice.
- [ ] Manual, the user: the couch checklist.

## 7. Amendments (2026-11-13, implementation)

1. **Who guns.** The gunner is the captain (pid 0) when Weapons shares a console group with Navigation (the Skiff's Helm); otherwise pid 1 with two or more crew, pid 0 alone (`gunnerPid` in `bot.ts`). While an enemy is present and Weapons is online it walks to the console, sits with Confirm, and on a group switches to the Weapons tab through the tab bar (Up, Left/Right, Down). It stands with Cancel when the enemy has gone. All of it through the stick and Confirm, one stick edge per two ticks, no rng draws (a test checks the streams).
2. **When the gunner leaves the guns.** It stands for any fire aboard (and when its own room burns), and for other work (a downed crew member, boarders, a breach, a failed console) when no other Conscious, standing crew member at or above `BOT_RETREAT_HEALTH` (and not healing in the Medbay) can take it. A standing gunner below `BOT_GUN_HEAL_HEALTH` 50 heals in an online Medbay (to `BOT_RECOVER_HEALTH` 60) before it sits. Why: the first form (leave only when nobody else can take the work, heal only below 30) failed `gate-duo` seed 3 at 11.2 (the captain fought three fires alone, then the gunner sat at 34 health in the Weapons room and took a shot); a heal threshold of 60 kept the Skiff's captain-gunner off the guns for 40 s at 54-59 health (a 94 s first fight on seed 2). Figures in `docs/gates.md`.
3. **The captain's jump comes first.** The captain-gunner yields to the existing run behaviour when the drive is ready or an event is open: at a group it switches back to the Helm tab and jumps as today (a fight in progress ends as our flight); at a lone Weapons console it stands first. The captain's jump rule itself is unchanged, so fights in the five-minute gates also end by our jump (recorded as "left by our jump").
4. **Aim and fire.** Target: the Shields room while the enemy has layers or its shields system is up, else its Weapons room. Order: a loaded torpedo (Shields room), then a charged extra slot (a Missile Pod with stock, or the Ion Cannon, at the Shields room; a loot beam as the Pulse), then the Pulse; with nothing ready the cursor and selector are lined up for the Pulse. The Pulse uses the scanned frequency (the card shows it once scanned; a lock implies a scan), else its current beam selector (F1 when the selector is on the torpedo or a slot). It holds fire while a surrender is offered, and only ever aims at the enemy's rooms (never debris or a field's rocks). At a group console Up never wraps past the first list entry (that would enter the tab bar); the way round is Down. A seated Science bot with nothing running moves to the ship row and scans it; bots still never sit at Science on their own, so no gate has one.
5. **The lever for their fire: damage per hit.** `ENEMY_SHOT_HULL_DAMAGE` 4 -> 10; `ENEMY_FIRE_INTERVAL` 20 and `ENEMY_FIRE_MIN` 6 unchanged. Why: an ignored first enemy lands two shots in its first minute on every gate seed (first shot at 5 s plus a 10 s flight, then 28 s apart with the two-crew multiplier 1.4), so 10 per hit gives 20, the middle of the 15-30 band, without more shots (each shot also rolls fires, breaches, console failures and 12 crew damage, which is what moves the health floors). The interval tried: 20 -> 12 gave 12 / 12 / 12 / 12 / 16 / 12 hull on seeds 1-6, under the band. 8 per hit gave 16 (inside but at the edge).
6. **Our fire.** `BEAM_CHARGE_TIME` 6 -> 4 as specified. The first fight (the Skiff, gate-skiff's crew and seeds, the drive pinned after the first jump so the enemy decides) ends in 45 s (kill), 66 s (surrender) and 56 s (surrender) from contact, measured to the enemy's departure (a surrender's 8 s flee included); seeds 4-6 (measured the same way, not in the test) 58, 72 and 80.2 s. The passive test pins 20 / 20 / 20 hull. Both bands are met with one lever each.
7. **Depth.** Enemy fire does not scale with depth today (hull and layers do), and that is kept. A sector-3 enemy (depth 13: 170 hull, two layers) against the Skiff's gunner and no upgrades: surrender at 68 s with 2 hull lost, withdrawn at `ENCOUNTER_MAX` 120 s with 50 lost, surrender at 88 s with 0 lost (seeds 1-3); the ship and both crew survive every seed (pinned in `combatTempo.test.ts`). Seed 2 is the hard one.
8. **Floors.** None lowered. `gate-skiff` raised 14 -> 25, just under its new minimum 25.3 (seed 2); `gate-duo` stays 25 (minimum 27.2). `gate-warden`'s pinned figures moved with the faster Pulse (36/25/420 -> 35/25/270; with a Heavy Laser 31/21/255 -> 31/21/183).
9. **Known gap: the starter's gunner.** On the starter the Weapons console runs at level 1 (a 16 s Pulse at the faster charge) and the bots never run torpedoes from the magazine, so against a two-layer enemy with an unscanned frequency the Pulse only strips a layer that returns in 6 s: `gate-duo` seed 1 met three such enemies and ended at 20 hull. No floor reads hull; it is recorded for the next tempo pass (a Science bot that sits, the bot torpedo runner, or the starter's Weapons bars).
