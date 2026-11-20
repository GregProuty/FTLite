<!-- Ryan's playtest notes, round 2, as the owner pasted them on 2026-11-19 (verbatim). Round 1 had the same title and is quoted in the W-4 spec. The owner's calls on this round are in docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md. -->

# Next demo version: Helm and Weapons controls and power

Changes for the next Helm and Weapons duel build (current build: sim 52). Items marked DEFER are for the agent and the developer to decide. Numbers marked (start) are starting values to tune.

## Summary: what changes and how it affects the game
- Overall: one control scheme everywhere (WASD moves or manages, mouse aims, left click acts) plus power that ties the stations together. The duel gets easier to pick up and gives each player more to do.
- Interface: WASD and mouse on every station, with every clickable HUD control kept. Easy to learn, and switching seats or characters needs no relearning.
- Auto/manual: R / Shift+R plus a HUD switch flips weapons between auto and manual. Solo play and missile flights stay manageable without taking the gunner out of the game.
- Power: Engineering hands power bars to each station, and each station splits its own. Every seat gets trade-offs, and it sets up the Engineer role. How this works in the 2-player demo is deferred.
- Helm: mouse turning at a fixed rate, with auto-stabilise holding the heading, makes pointing the ship precise and forgiving. The throttle ramps and stays set, so you can cruise without holding a key, and a tap of S stops thrust instantly. A/D side bursts give the pilot an active dodge. Engine power caps max throttle, so Engineering matters. Reverse (suggested 50%) and drag (probably kept) are deferred to tuning.
- Weapons: turrets follow a mouse reticle within their arc, so aiming becomes real skill, and because arcs depend on the ship's heading, Helm and Weapons have to talk. The laser recharges itself and you click to fire, which is simpler than hold-to-charge. A new autocannon and per-weapon power (1-3) add choices to juggle mid-fight. Auto mode doesn't lead its shots and only hits the hull, so manual stays better and the gunner keeps a job. Missiles can be hand-flown again, with homing as the default, giving the gunner a high-skill play. Guns keep working while a torpedo flies on auto, so there's less dead time. Q/E cycle enemy rooms with clicking as a backup, so targeting is faster.
- Sensors: sensor range comes from power and damage, and enemies beyond range show as a rough blip. Adds tension without turning the duel into a search.
- On foot: Hotline Miami-style movement and an aim-and-spray fire extinguisher make fighting fires an action task instead of holding a key.
- Later, not in this build: cold gas tank and compressor, hypergolic thrusters, click-to-fly autopilot, weapon heat and overcharge, sensors extending weapon range, and more items to carry on foot.

## 1. Control philosophy
- The interface must be EASY AND INTUITIVE: WASD and mouse first on every station.
- Every station uses the same pattern as walking on foot: the mouse aims, WASD moves or manages.
- Every station should be mostly controllable from the keyboard. The mouse is also a second way to select items on the HUD. Keep every clickable HUD control that exists today.
- Left click is the station's main action (Helm: turn toward the cursor; Weapons: fire; on foot: use the item in hand).
- Universal AUTO/MANUAL switch: any system with an auto mode shows a clickable AUTO/MANUAL switch on the HUD. R flips the selected system and Shift+R flips all of them. For now this applies to Weapons only; the Helm stays fully manual.
- Keep: repairs (hold E at the repair point) and single-player Tab switching between the Helm and Weapons characters. On-foot movement and firefighting change (see section 6).

## 2. Power model (two tiers)
- Tier 1, Engineering: moves power bars between Helm/engines, Weapons, Shields and Sensors.
- Tier 2, each station: splits the bars it receives among its own systems.
- Every station's HUD always shows how many bars that station currently has.
- What Engineering's bars set:
  - Weapons: recharge speed
  - Engines: the Helm's max throttle
  - Shields: max shield level
  - Sensors: sensor range (see section 5)
- Damage levels still apply on top of power (today: 100%, reduced, off).
- The Engineer should be a mostly mobile role (moving around the ship, not seated).
- DEFER: how power is set in this demo (2 players, no Engineer seat yet), e.g. a walk-up power panel or a fixed split.

## 3. Helm (fully manual)

### Flight model
- Momentum plus planet gravity. Velocity holds unless gravity, thrust, cold gas, drag or a collision changes it.
- Keep auto-stabilise. When input drops, it holds the last commanded heading and damps sideways drift.
- DEFER: drag. Probably keep it for playability; the developer makes the final call.
- Faster speed = wider turns, slower = tighter. Under momentum physics this should fall out on its own; confirm in play.
- The HUD shows a velocity marker (where the ship is actually moving), separate from where the nose points. Build it by extending today's predicted-path display.
- Braking is done by tapping S or by turning the nose around and burning. The first-play hints should teach both.
- DEFER: exact tuning, with the developer.

### Controls
- Hold left click: the nose turns toward the mouse cursor at a fixed turn rate. On release, auto-stabilise holds the last commanded heading.
- Hold W/S: ramp throttle continuously, from reverse up to +100%. From 0 to full takes about 1 s (start).
- Release W/S: the throttle stays where you left it, so you can cruise (for example, ramp to 65% and hold it there).
- Tap S: a momentary press cuts throttle straight back to 0. Count a press under about 200 ms as a tap (start, adjustable in settings), judged on release. Holding S ramps down as normal. Suggested: a tap of W while in reverse also returns to 0.
  - Basis for 200 ms: a typical key stays down about 100 ms when typing; ordinary taps rarely last longer than about 133 ms; 250 ms is a common tap/hold split; phone long presses are slower (Android 400 ms, was 500 ms; iOS 0.5 s).
  - Sources:
    - https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/22505698/what-is-a-typical-keypress-duration
    - https://gist-githubusercontent-com.hhj520.top/SalviaSage/ba321be907f036bf4bb165837ab72659
    - https://gitlab.e.foundation/e/os/android_frameworks_base/-/commit/7e0769b219257a5053ad79160574892c5aca9ca2
    - https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/60801092/long-press-duration-on-xamarin-forms
- Reverse: down to -50% of forward thrust (suggested). DEFER: final value; today it is 40%, and the Hunter AI brakes with it.
- A/D: short cold gas bursts that push the ship sideways.
- Replaces: stepped throttle notches (-1 to 4), Shift+W full throttle, A/D turning, right click heading hold, and the hold-fire auto-face assist.

### Power
- Engine bars set max forward throttle: 1 bar = 25%, 2 = 50%, 3 = 75%, 4 = 100%.
- At 1 bar, thrust must still beat the planet's pull on the inner orbits, so low power is never a death spiral.

### Turning and side thrusters, phased
- Now (lore-friendly): a gyro handles turning for free at a fixed rate, and the cold gas side thrusters run on a basic recharge.
- Later: a cold gas tank with a pressure gauge. Side bursts, and turns tighter than the gyro allows, spend gas. A powered air compressor refills the tank; more power = faster refill.
- Much later: hypergolic side thrusters that burn the same fuel as the main engines.

### Later
- Semi-autopilot: click a point on the map and the ship flies there, including routes through multiple nodes.
- Autopilot stays worse than hand flying (no gravity slingshots, no dodging), so the Helm seat keeps a job.

## 4. Weapons

### Loadout
- Three weapons: laser, autocannon (new), missiles (the current torpedoes).
- Each weapon takes 1 to 3 power. Power one or more weapons within the bars the station receives.
- More power on a weapon = faster recharge, more rounds, or more damage per shot. DEFER: which effect for which weapon.

### Controls (WASD first)
- Mouse: aiming reticle. The selected weapon's heading slowly follows the reticle, limited to that weapon's firing arc.
- Left click: fire the laser or autocannon when it's ready.
- A/D: select a weapon. Number keys 1-3 (number row and number pad) are an optional shortcut.
- W/S: add or remove power on the selected weapon.
- Q/E: cycle the target room on the enemy ship (Weapons, Shields, Engines). Clicking a room in the enemy window is the backup way to pick one.
- Manual/auto toggle: each weapon shows a clear MANUAL / AUTO switch on the HUD. R flips the selected weapon and Shift+R flips all weapons, so the gunner can set guns to auto in one motion before launching a missile and back to manual after.
- Replaces: Space to fire the laser and F to launch a torpedo.

### Laser
- The laser recharges on its own, FTL-style, at the speed its power allows. Left click fires when it's ready.
- Replaces: hold to charge, release to fire, and the 3 s vent on a held charge.

### Manual vs auto
- Laser and autocannon, manual: aim with the mouse, left click to fire. Manual can target the selected enemy room and gets a small bonus to traverse speed and fire rate.
- Laser and autocannon, auto: aims and fires on its own whenever an enemy is inside the weapon's range and arc, but:
  - it doesn't lead its shots, so it misses fast or turning targets more often;
  - it only hits the hull, never a chosen room.
- Missiles, auto: fire and home on their own as long as there's ammo (today's homing torpedoes).
- Missiles, manual (the developer wants this back; manual steering was removed on Nov 17): after launch, the gunner flies the missile with the Helm's mouse steering, locked at 100% throttle. It is faster than the ship but turns wider.
- While flying a missile manually, the gunner can't aim or fire the guns by hand. Guns left on auto keep firing.
- While a missile is flying on auto, all guns work normally. Replaces today's rule that the laser can't charge or fire while your own torpedo is in flight.

### Later
- Weapon heat and overcharge, with coolant managed by Engineering and Weapons the same way as power. Reuse the heat and coolant code from the earlier sector-run work.

## 5. Sensors and fog of war
- Sensor range depends on sensor power and on damage to the sensors.
- Beyond sensor range, the enemy shows as a rough, inexact blip rather than vanishing, so a 1v1 duel doesn't become a search.
- Later: higher sensor level and power extend weapon range and the aiming reticle's reach.
- DEFER: tying weapon range to sensors means a sensor hit hurts twice; watch this in tuning.

## 6. On foot (your crew character)
- Hotline Miami-style top-down control: WASD moves the character relative to the screen, the character always faces the mouse cursor, and left click uses the item in hand.
- First item: a point-and-aim fire extinguisher. Aim at a fire and hold left click to spray; the fire shrinks while it's being sprayed.
- Replaces: holding E at the repair point to put out a fire (today 3 s alone, 1.2 s with two crew).
- Repairs: unchanged for now (hold E at the repair point).
- DEFER, tune later:
  - spray range and cone width
  - how fast a fire shrinks
  - extinguisher capacity and refill (or unlimited for the demo)
  - whether two crew spraying the same fire stack
- Later: more items in hand, built on the same aim-and-click pattern.
