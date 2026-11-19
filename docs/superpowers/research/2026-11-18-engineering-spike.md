# Engineering spike report (2026-11-18)

Spec: docs/superpowers/specs/2026-11-18-engineering-spike-design.md. Branch `spike/engineering`.

## Sim measurements (Part i)

| Measure | Before (SIM 54) | After (SIM 55) |
|---|---|---|
| Hound duel flattened values | 2915 | 2946 (+31) |
| ms per tick, 3600-tick scripted Cutter duel, best of 3 | 0.0978 | 0.0385 |

The tick cost is wall-clock time on a shared, heavily loaded machine. The Before run (Task 1) and the After run in
Task 12 saw different background load, so the drop most likely reflects load, not a speed-up. The numbers do show that the
spike adds no visible tick cost.

## Gates and bands after the spike (Part i, Task 12)

One test is skipped under the fallout rule's kind (c). Every other gate and band passes at SIM 55, including the
per-seed duel gates, the passive record and the Valkyrn pilot gate.

| File | Test | Band | Measured (SIM 55) |
|---|---|---|---|
| tests/duelGates.test.ts | the median duel lasts 3 to 5 minutes, and the crew both wins and loses | median length 180 to 300 s; at least one crew win and one crew loss | median 166.6 s (out of band); crew wins 2, losses 8, draws 0, at the cap 0 (in band) |

Pins moved under kind (b). Each cause was found by running the seed-2 summary at each task's commit:

| File | Pin | Was | Now | Cause |
|---|---|---|---|---|
| tests/duelCheckpoint.test.ts | continuation proof summary, seed 2 | releases [13, 24], hits [22, 24], launched [6, 7], missile hits [3, 3], repairs [3, 9], 14424 ticks (Tasks 1 and 2) | releases [2, 20], hits [3, 20], launched [1, 3], missile hits [0, 2], repairs [10, 9], 7713 ticks | Task 3 (e3eef4c5): the shield layer cap and recharge by Shields bars. Task 2 (33b55a48) alone left the summary unchanged, so the move came from the 1-layer cap, not from the start value alone. Task 4 re-pinned it. |
| tests/duelCheckpoint.test.ts | continuation proof summary, seed 2 | terminal [laser], hits [3, 20], missile hits [0, 2], repairs [5, 8], 8094 ticks (Task 7) | terminal [missile], hits [2, 20], missile hits [0, 3], repairs [2, 5], 7963 ticks | Task 8 (708d2188): the throttle cap. Tasks 9a to 11 left it unchanged. |
| tests/duelSnapshot.test.ts | the fixture tick (seed 4: one missile in flight, a damaged crew room, a repair in progress, the first such tick from 5000) | 6146 | 6276 | the spike's later rules |
| tests/tacticalSlots.test.ts | the length of seed 1's scripted Cutter duel | 19199 | 7207 | the spike's rules |

### Per-seed telemetry (SIM 55, `npx tsx scripts/duel-telemetry.ts`)

```
seed 1: 164.3 s, crew loss, terminal crew [missile] enemy []
  crew  laser 3 released, 3 hit (3 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 0
  enemy laser 22 released, 22 hit (4 stripped), 0 missed; missiles 5 launched, hits W/S/E 1/1/0, lost expired 3; contacts planet 0, asteroid 4; baits 0
  repairs started/finished P0 1/1, P1 7/12; away walking/repairing P0 31.6/4.0 s, P1 53.0/51.9 s
  helm empty 35.6 s, weapons empty 104.8 s, enemy in arc 17.3 s, weapons idle 38.8 s, console swaps 0
seed 2: 143.2 s, crew loss, terminal crew [laser] enemy []
  crew  laser 3 released, 3 hit (3 stripped), 0 missed; missiles 2 launched, hits W/S/E 0/2/0, lost none; contacts planet 0, asteroid 1
  enemy laser 19 released, 19 hit (4 stripped), 0 missed; missiles 4 launched, hits W/S/E 1/2/0, lost expired 1; contacts planet 0, asteroid 3; baits 2
  repairs started/finished P0 2/4, P1 7/6; away walking/repairing P0 36.8/19.3 s, P1 52.3/25.8 s
  helm empty 56.1 s, weapons empty 78.1 s, enemy in arc 43.0 s, weapons idle 39.5 s, console swaps 0
seed 3: 275.4 s, crew loss, terminal crew [missile] enemy []
  crew  laser 24 released, 24 hit (14 stripped), 0 missed; missiles 8 launched, hits W/S/E 1/3/0, lost asteroid 2, edge 1, own 1; contacts planet 0, asteroid 2
  enemy laser 22 released, 22 hit (9 stripped), 0 missed; missiles 8 launched, hits W/S/E 1/2/0, lost asteroid 1, edge 1, expired 3; contacts planet 0, asteroid 6; baits 1
  repairs started/finished P0 0/0, P1 5/9; away walking/repairing P0 30.2/0.0 s, P1 46.4/36.0 s
  helm empty 30.2 s, weapons empty 82.4 s, enemy in arc 45.9 s, weapons idle 46.4 s, console swaps 0
seed 4: 154.2 s, crew loss, terminal crew [laser] enemy []
  crew  laser 3 released, 3 hit (3 stripped), 0 missed; missiles 3 launched, hits W/S/E 0/1/0, lost edge 1, expired 1; contacts planet 0, asteroid 0
  enemy laser 24 released, 24 hit (7 stripped), 0 missed; missiles 4 launched, hits W/S/E 0/2/0, lost edge 2; contacts planet 0, asteroid 3; baits 0
  repairs started/finished P0 1/2, P1 8/9; away walking/repairing P0 39.5/8.0 s, P1 43.7/38.8 s
  helm empty 47.5 s, weapons empty 82.5 s, enemy in arc 31.6 s, weapons idle 44.7 s, console swaps 0
seed 5: 168.9 s, crew loss, terminal crew [planet] enemy [], PLANET END
  crew  laser 14 released, 14 hit (7 stripped), 0 missed; missiles 5 launched, hits W/S/E 0/4/0, lost expired 1; contacts planet 8, asteroid 0
  enemy laser 6 released, 6 hit (3 stripped), 0 missed; missiles 4 launched, hits W/S/E 0/1/0, lost asteroid 1, edge 1, expired 1; contacts planet 0, asteroid 1; baits 1
  repairs started/finished P0 0/0, P1 2/5; away walking/repairing P0 4.4/0.0 s, P1 11.2/20.0 s
  helm empty 4.4 s, weapons empty 31.2 s, enemy in arc 29.5 s, weapons idle 42.3 s, console swaps 0
seed 6: 180.8 s, crew loss, terminal crew [laser] enemy []
  crew  laser 7 released, 7 hit (6 stripped), 0 missed; missiles 3 launched, hits W/S/E 0/3/0, lost none; contacts planet 0, asteroid 3
  enemy laser 19 released, 19 hit (3 stripped), 0 missed; missiles 5 launched, hits W/S/E 0/1/0, lost asteroid 2, edge 1, expired 1; contacts planet 0, asteroid 4; baits 1
  repairs started/finished P0 0/0, P1 8/14; away walking/repairing P0 8.6/0.0 s, P1 42.5/57.4 s
  helm empty 8.6 s, weapons empty 99.9 s, enemy in arc 13.4 s, weapons idle 36.0 s, console swaps 0
seed 7: 235.4 s, crew win, terminal crew [] enemy [planet], PLANET END
  crew  laser 25 released, 25 hit (12 stripped), 0 missed; missiles 8 launched, hits W/S/E 2/4/0, lost planet 1, expired 1; contacts planet 0, asteroid 2
  enemy laser 5 released, 5 hit (5 stripped), 0 missed; missiles 6 launched, hits W/S/E 0/2/0, lost asteroid 1, edge 1, expired 2; contacts planet 6, asteroid 1; baits 5
  repairs started/finished P0 0/0, P1 2/2; away walking/repairing P0 4.4/0.0 s, P1 14.2/8.0 s
  helm empty 4.4 s, weapons empty 22.2 s, enemy in arc 31.6 s, weapons idle 51.9 s, console swaps 0
seed 8: 130.8 s, crew loss, terminal crew [planet] enemy [], PLANET END
  crew  laser 13 released, 13 hit (8 stripped), 0 missed; missiles 4 launched, hits W/S/E 2/1/0, lost planet 1; contacts planet 10, asteroid 0
  enemy laser 2 released, 2 hit (2 stripped), 0 missed; missiles 3 launched, hits W/S/E 0/0/0, lost asteroid 1, edge 2; contacts planet 9, asteroid 2; baits 5
  repairs started/finished P0 0/0, P1 0/0; away walking/repairing P0 4.4/0.0 s, P1 0.9/0.0 s
  helm empty 4.4 s, weapons empty 0.9 s, enemy in arc 14.1 s, weapons idle 44.1 s, console swaps 0
seed 9: 133.2 s, crew loss, terminal crew [missile] enemy []
  crew  laser 1 released, 1 hit (1 stripped), 0 missed; missiles 1 launched, hits W/S/E 1/0/0, lost none; contacts planet 0, asteroid 1
  enemy laser 16 released, 16 hit (1 stripped), 0 missed; missiles 4 launched, hits W/S/E 1/2/0, lost expired 1; contacts planet 0, asteroid 1; baits 0
  repairs started/finished P0 2/2, P1 4/11; away walking/repairing P0 39.6/8.0 s, P1 45.8/45.1 s
  helm empty 47.6 s, weapons empty 91.0 s, enemy in arc 14.6 s, weapons idle 36.5 s, console swaps 0
seed 10: 364.2 s, crew win, terminal crew [] enemy [missile]
  crew  laser 52 released, 52 hit (32 stripped), 0 missed; missiles 11 launched, hits W/S/E 4/2/0, lost asteroid 1, edge 1, expired 3; contacts planet 0, asteroid 1
  enemy laser 16 released, 16 hit (15 stripped), 0 missed; missiles 10 launched, hits W/S/E 0/1/0, lost asteroid 4, edge 3, expired 2; contacts planet 0, asteroid 7; baits 2
  repairs started/finished P0 0/0, P1 2/2; away walking/repairing P0 4.4/0.0 s, P1 11.2/8.0 s
  helm empty 4.4 s, weapons empty 19.2 s, enemy in arc 65.9 s, weapons idle 67.2 s, console swaps 0

median length 166.6 s (gate 180 to 300)
crew wins 2, crew losses 8, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
every duel with a crew laser release and missile launch: true
planet-contact ends under 30 s: 0 (gate 0)

passive crew (nobody at either console), not gated: seed 1 121.9 s crew loss; seed 2 123.5 s crew loss; seed 3 103.5 s crew loss; seed 4 121.3 s crew loss; seed 5 123.7 s crew loss; seed 6 101.3 s crew loss; seed 7 105.0 s crew loss; seed 8 129.1 s crew loss; seed 9 132.8 s crew loss; seed 10 121.0 s crew loss
passive median 121.6 s, shortest 101.3 s
```

## Known limits (Part i)

- **The Shield loot does nothing.** The derelict's Shield loot adds a layer over the class layers, but the crew's
  shield cap (`SHIELD_LAYERS_BY_BARS[bars]`) drops any layer above it the same tick (Decision 21). The cap is not
  changed for it.
- **Pew pew is not playable in the spike.** Its slot holds Weapons bars that count in the allocation and the trim but
  have no effect until W-1's plug-in at merge (spec §11, Decision 22).
- **The scripted gunner's first-tick bar move.** On its first seated tick the scripted gunner moves pew pew's bar to
  the beam (`weaponPower` slot 0 −1, then slot 1 +1), because the beam starts dark (Decision 20).
- **The bots never move bars otherwise.** Neither the scripted pair nor the Valkyrn pilot sends `shipPower`,
  `shipCoolant` or any other `weaponPower`, so the gates measure the start bars only.
- **Far-enemy clicks are refused silently.** Until Part ii draws the fog, a lock or scan click on an enemy outside
  sensor range is refused with no feedback (Decision 18). Part ii must show the refusal.
- **A human crew cannot fire the beam in the app until Part ii.** The beam starts at 0 bars and Part i has no UI for
  `weaponPower`. The duel app smoke's step 5 now proves that Space fires nothing on either screen while the beam is
  unpowered. Part ii's Weapons power action should restore a beam-on-both step.

## Determinism (Part i, Tasks 11 and 12)

`tests/engDeterminism.test.ts`: hash agreement over seeds 1-5 (1800 ticks, every 60) and a snapshot reload at tick 950: PASS. Goldens re-blessed at SIM 55 (same-version bless).

The duel golden (`tests/golden/duel-1.json`, seed 1) is now outcome 2 (the enemy wins) at 9859 ticks, final hash
d6b574eb. It was outcome 1 (the crew wins) at 15403 ticks. The rematch golden's rounds are now 9859 ticks with outcome 2,
then 8592 ticks with outcome 2 (final c2704648). They were 15403 ticks with outcome 1, then 5842 ticks with outcome 1.
`tests/golden/basic.json` is re-blessed (120 checkpoints, final 9f41241a). The bless re-executed
`tests/fixtures/determinism-v2.json` (1800 samples and 330 boundaries), and the file did not change.

## What was built (Parts i and ii)

- FTL reactor bars (10) over five systems (Shields 4, Weapons 9, Engines 4, Sensors 3, Oxygen 2). Every system except
  Oxygen has an overdrive slot. There is heat and a pool of 8 shared coolant. Damage knocks out slots, and an overheated
  system fails until it cools.
- Each station spends its own bars (spec §10):
  - 1 Engines bar is 25 % throttle.
  - The Weapons officer spreads the Weapons bars over pew pew (W-1's weapon; its bars do nothing yet), the beam and the
    torpedo.
  - Sensors sets the sensor range, and every crew map has a fog of war with fading ghosts.
- Oxygen is tracked per room. Hits make breaches, airlocks vent, fire needs air and spreads through open doors, and low
  air hurts.
- The ship view is the Engineering station. It has an amber CRT panel (left click adds a bar, right click removes one, a
  pip click cycles coolant), and anyone can click doors and airlocks on the interior from anywhere.

## Summary numbers

From Part i's sections above:
- The Hound duel's flattened values went 2915 → 2946.
- ms per tick went 0.0978 → 0.0385. The drop is machine-load noise, not a speed-up.

After Part ii:
- `duel-oracle same` and `canonical-trace same`: 21 runs, 206472 ticks, 581 fields. Part ii changed no sim.
- `npm run test:duel-app-runtime` exit 0, in 164 s. Its step 5 now gives the beam a bar through the Weapons pips and
  fires it on both screens.
- Full suite: 5326 tests passing, 1 skipped (the duelGates median, kind c).

## App smoke and screenshots (Part ii)

`node smoke.mjs` printed nine ok lines, then `smoke passed`:
- the round starts on the ship view;
- round-start bars 2/2/3/1/1;
- right clicks took Sensors and Oxygen to 0;
- two left clicks overdrive Engines to 5;
- a pip click gives Engines one coolant;
- a door click holds the Ops-Quarters door open;
- an airlock click opens the Hold to space;
- the Hold is below a quarter air;
- seated at Weapons.

The script needed two fixes along the way:
- The walk to Weapons failed on the plan's route. I took the online smoke's route instead (D 3000 ms, W 1500 ms,
  A 300 ms, then E).
- In the fog shot, the Hunter charged inside the 300 ring before the picture. I pinned it 1200 ahead every 50 ms for
  that shot.

Neither fix touched the game. The screenshots:
- `C:\Users\djuar\FTLite-shots\engineering\1-hud-round-start.png`: the panel at round start.
- `C:\Users\djuar\FTLite-shots\engineering\2-overdriven-heating.png`: Engines overdriven and heating, with a door held open.
- `C:\Users\djuar\FTLite-shots\engineering\3-hold-venting.png`: the Hold venting through its airlock.
- `C:\Users\djuar\FTLite-shots\engineering\4-weapons-three-weapons.png`: the Weapons console's pew pew, beam and torpedo.
- `C:\Users\djuar\FTLite-shots\engineering\5-fog-ghost-fading.png`: the fog, showing the sensor ring and a ghost fading.

## Tests Part ii updated (Tasks 7 to 10)

- Task 7: no pre-existing test changed.
- tests/feelIiModels.test.ts (Task 8): WEAPONS OFFLINE comes from zeroing the weapon bars instead of Weapons Room
  level 2. The restore uses todaysCrewWeapons' [0,2,1].
- tests/feelIiUi.test.tsx :47 and :52, tests/feelUi.test.tsx :40 and :45, tests/uiConsole.test.tsx :51 (Task 8): the
  card is now named BEAM instead of LASER.
- tests/flightConsole.test.tsx:39 (Task 8): the Valkyrn laser fit's burst is 0 at the start. The test then powers the
  beam and checks it is above 0.
- tests/contactScene.test.ts and tests/feelIiModels.test.ts (Task 9): the enemy is moved 600 from the crew ship, inside
  the 900 start range, before the first draw.
- tests/duelWeaponsView.test.ts (Task 9): adds a 600 case. Beyond the sensor range, now derived from `sensorRange`,
  there is no status sentence.
- tests/feelIiInput.test.ts, tests/duelReadout.test.ts and tests/crtReadout.test.ts (Task 9's fix): the enemy is moved
  to 600, because the readout hides an unseen enemy's range and bearing.
- scripts/network/duel-app-smoke.ts and scripts/network/online-app-smoke.cjs (Task 10): step 5 powers the beam
  through the pips, then fires it on both screens. The driver gained a right-click and a fallback for zero-height test
  ids.

## Feel (owner to fill after playing)

- Does Engineering feel like a full-time job for the 4th seat, or for whoever is on foot?
- Does it change how Helm and Weapons fight? Shields start at 1 layer, the throttle at 75 %, and the beam is dark until
  Engineering moves bars.
- Is spreading the Weapons bars over the beam and the torpedo a real choice? (Pew pew comes with W-1.) Is the fog's
  900 start range right?
- Can you read power, heat, air, fire and breaches at a glance?
- Is the 1-layer shield start right? The 25 % air line? The 20 s cool-down after an overheat?

## Known limits and candidates

- The panel may cover the Hound's lower-left rooms at the zoom-0 fit. Zoom or pan to reach a covered door.
- The Helm's locked notches and the Science strip's range are covered by jsdom tests, not screenshots. The owner sees
  them on a console.
- Pew pew is not playable in this spike (spec §11). It is the W-1 skill-shot weapon from branch `w1-pew-pew`. Its slot
  takes bars that do nothing until the merge wires them into W-1's recharge.
- Sensors and Oxygen take no weapon damage, because they have no tactical Room.
- Fire spread, overheat ignitions and breaches push no events, so there is no sound cue or callout yet.
- Look check: the Hold's low-air tint reads amber rather than clearly red in screenshot 3.
- Small fog leaks still open:
  - the TORPEDO card's OUT OF RANGE / IN RANGE line shows for an unseen enemy, which only matters between 300 and 360
    at 0 Sensors bars;
  - the Weapons hint still says `1 LASER`;
  - distant rock sounds are centred.
- An overheated, failed Weapons system shows `WEAPONS OFFLINE: POWER A WEAPON`, not an overheat message.
- The balance has moved a long way from the old numbers. The crew wins 2 of 10 gate seeds and the median duel is
  166.6 s, but the bots never move bars, so these numbers say little about a human crew.
- Candidates: Artemis presets (SHIFT+number), sealed doors, a refusal flash on a full reactor, keys for the panel.
- Part i's two "until Part ii" limits are now closed:
  - far-enemy clicks are refused, and the fog shows the enemy as a ghost or CONTACT LOST;
  - the beam can be powered from the Weapons pips, and the app smoke fires it on both screens.

## Recommendation

**Provisional call: ship a simpler version, after the owner plays it.**

Mechanically the spike works end to end. Every gate passes, determinism holds over a seed sweep and a snapshot reload,
and the panel, the door clicks and venting, the console strips, the three-weapon console and the fog all behave in the
real app.

The open question is load. Engineering now gates all three other roles at once: shields at 1 layer, a 75 % throttle,
a dark beam and a 900 sensor range. The old game balance has collapsed, because the bots never move bars, but a human
Engineer would.

Before shipping, the owner's playtest should decide whether to:
- keep all three station budgets, or start with fewer of them (for example the throttle cap and the Weapons split, with
  shields and fog left lighter);
- fold the panel down for crews without a dedicated Engineer.

Merging with W-1 (pew pew's recharge) and the Helm spike's ENGINE/COMPRESSOR split is the next integration step either
way.

## What was built (Parts i and ii)

- **Reactor:** FTL-style reactor bars (10) over five systems: Shields 4, Weapons 9, Engines 4, Sensors 3, Oxygen 2.
  - Every system except Oxygen has an overdrive slot.
  - Overdrive builds heat, and 8 coolant units are shared between the systems.
  - Damage knocks out slots, and an overheated system fails until it cools.
- **Station budgets (spec §10):** each station spends its own bars.
  - Each Engines bar is 25 % throttle.
  - The Weapons officer spreads the Weapons bars over pew pew (W-1's weapon, whose bars do nothing yet), the beam and the torpedo.
  - Sensors sets the sensor range, and every crew map has a fog of war with fading ghosts.
- **Interior:** oxygen per room, breaches from hits, airlocks that vent, fire that needs air and spreads through open doors, and damage from low air.
- **Ship view:** it is the Engineering station. Anyone can use it, from anywhere:
  - an amber CRT panel: left click adds a bar, right click removes one, and a pip click cycles coolant;
  - door and airlock clicks on the interior.

## Summary numbers

From Part i's sections above:
- The Hound duel's flattened values went from 2915 to 2946.
- Milliseconds per tick went from 0.0978 to 0.0385. That drop is machine-load noise, not a speed-up.

After Part ii:
- `duel-oracle same` and `canonical-trace same` both passed on 21 runs, 206472 ticks and 581 fields. Part ii changed no sim.
- `npm run test:duel-app-runtime` exited 0 in 164 s. Its step 5 now gives the beam a bar through the Weapons pips and fires it on both screens.
- The full suite has 5326 tests passing and 1 skipped (the duelGates median, kind c).

## App smoke and screenshots (Part ii)

`node smoke.mjs` printed nine ok lines, then `smoke passed`:
1. The round starts on the ship view.
2. Round-start bars are 2/2/3/1/1.
3. Right clicks took Sensors and Oxygen to 0.
4. Two left clicks overdrive Engines to 5.
5. A pip click gives Engines one coolant.
6. A door click holds the Ops-Quarters door open.
7. An airlock click opens the Hold to space.
8. The Hold is below a quarter air.
9. Seated at Weapons.

The script needed two fixes, neither touching the game:
- The walk to Weapons failed on the plan's route, so I used the online smoke's route instead (D 3000 ms, W 1500 ms, A 300 ms, then E).
- In the fog shot the Hunter charged inside the 300 ring before the picture, so I pinned it 1200 ahead every 50 ms for that shot.

The screenshots:
- `C:\Users\djuar\FTLite-shots\engineering\1-hud-round-start.png`: the panel at round start.
- `C:\Users\djuar\FTLite-shots\engineering\2-overdriven-heating.png`: Engines overdriven and heating, with a door held open.
- `C:\Users\djuar\FTLite-shots\engineering\3-hold-venting.png`: the Hold venting through its airlock.
- `C:\Users\djuar\FTLite-shots\engineering\4-weapons-three-weapons.png`: the Weapons console's pew pew, beam and torpedo.
- `C:\Users\djuar\FTLite-shots\engineering\5-fog-ghost-fading.png`: the fog, with the sensor ring and a ghost fading.

## Tests Part ii updated (Tasks 7 to 10)

- **Task 7:** no pre-existing test changed.
- **Task 8:**
  - tests/feelIiModels.test.ts: WEAPONS OFFLINE now comes from zeroing the weapon bars instead of Weapons Room level 2. The restore uses todaysCrewWeapons' [0,2,1].
  - tests/feelIiUi.test.tsx :47 and :52, tests/feelUi.test.tsx :40 and :45, and tests/uiConsole.test.tsx :51: the card is now named BEAM instead of LASER.
  - tests/flightConsole.test.tsx:39: the Valkyrn laser fit's burst is 0 at the start. The test now powers the beam and checks the burst is above 0.
- **Task 9:**
  - tests/contactScene.test.ts and tests/feelIiModels.test.ts: the enemy is moved to 600 from the crew ship, inside the 900 start range, before the first draw.
  - tests/duelWeaponsView.test.ts: adds a 600 case. Beyond the sensor range, now taken from `sensorRange`, there is no status sentence.
- **Task 9's fix:** tests/feelIiInput.test.ts, tests/duelReadout.test.ts and tests/crtReadout.test.ts move the enemy to 600, because the readout hides an unseen enemy's range and bearing.
- **Task 10:** scripts/network/duel-app-smoke.ts and scripts/network/online-app-smoke.cjs. Step 5 powers the beam through the pips, then fires it on both screens. The driver gained a right click and a fallback for zero-height test ids.

## Feel (owner to fill after playing)

- Does Engineering feel like a full-time job for the 4th seat, or for whoever is on foot?
- Does it change how Helm and Weapons fight? Shields start at 1 layer, the throttle at 75 %, and the beam stays dark until Engineering moves bars.
- Is spreading the Weapons bars over the beam and the torpedo a real choice? (Pew pew comes with W-1.)
- Is the fog's 900 start range right?
- Can you read power, heat, air, fire and breaches at a glance?
- Is the 1-layer shield start right? The 25 % air line? The 20 s cool-down after an overheat?

## Known limits and candidates

- At the zoom-0 fit, the panel may cover the Hound's lower-left rooms. Zoom or pan to reach a covered door.
- The Helm's locked notches and the Science strip's range are covered by jsdom tests, not by screenshots. The owner sees them on a console.
- Pew pew isn't playable in this spike (spec §11). It's the W-1 skill-shot weapon from branch `w1-pew-pew`. Its slot takes bars that do nothing until the merge wires them into W-1's recharge.
- Sensors and Oxygen take no weapon damage, because they have no tactical Room.
- Fire spread, overheat ignitions and breaches push no events, so there's no sound cue or callout for them yet.
- Look check: in screenshot 3 the Hold's low-air tint reads amber rather than clearly red.
- Small fog leaks still open:
  - The TORPEDO card's OUT OF RANGE or IN RANGE line still shows for an unseen enemy. This only matters between 300 and 360 with Sensors at 0 bars.
  - The Weapons hint still says `1 LASER`.
  - Distant rock sounds are centred.
- An overheated, failed Weapons system shows `WEAPONS OFFLINE: POWER A WEAPON`, not an overheat message.
- The balance has moved a long way. The crew wins 2 of 10 gate seeds, and the median duel is 166.6 s. The bots never move bars, so these numbers say little about a human crew.
- Candidates: Artemis presets (SHIFT+number), sealed doors, a refusal flash on a full reactor, and keys for the panel.
- Part i's two "until Part ii" limits are now closed:
  - Far-enemy clicks are refused, and the fog shows the enemy as a ghost or as CONTACT LOST.
  - The beam can be powered from the Weapons pips, and the app smoke fires it on both screens.

## Recommendation

**Provisional call: ship a simpler version, after the owner plays it.**

Mechanically the spike works end to end:
- Every gate passes.
- Determinism holds over a seed sweep and a snapshot reload.
- The panel, door clicks and venting, console strips, three-weapon console and fog all behave in the real app.

The open question is load. Engineering now gates all three other roles at once: shields at 1 layer, a 75 % throttle, a dark beam and a 900 sensor range. The old balance has collapsed, but only because the bots never move bars, and a human Engineer would.

The owner's playtest should decide two things:
- Keep all three station budgets, or start with fewer. One option is the throttle cap and the Weapons split, with lighter shields and fog.
- Whether to fold the panel down for crews without a dedicated Engineer.

The next integration step either way is merging with W-1 (pew pew's recharge) and with the Helm spike's ENGINE/COMPRESSOR split.
