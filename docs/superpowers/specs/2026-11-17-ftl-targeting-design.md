# FTL-style weapon targeting (2026-11-17)

Owner, 2026-11-17: "make the weapons work similar to the way that FTL works, you click the weapon and then it gets
dragged over to its target, the room you are targeting on the enemy ship".

Builds on the weapons update (`2026-11-17-weapons-update-design.md`, SIM 48, merged f00d5fda) and is built after it merges. A sim change:
SIM_VERSION 48 → 49. Decisions taken under the standing order (take the recommendation).

Today: the Weapons console has a hold-to-charge, release-to-fire laser (Space / FIRE), one lock room shared by laser
and torpedo, set by the keyboard, the console room buttons or the enemy window's LASER → reticle → room; F launches.

## 1. The interaction (UI, Weapons console)

- **Weapon cards.** The Weapons console shows one card per weapon, FTL-style: LASER (charge bar, `x2` burst mark,
  its target room) and TORPEDO (`MAG n/4`, IN RANGE / OUT OF RANGE, its target room).
- **Click a card** to pick that weapon up: the card lights, the enemy window opens if it is closed, and a targeting
  line is drawn from the card to the mouse, ending in a reticle (CRT amber ramp, `CRT.hot` over a valid room,
  `CRT.mid` otherwise).
- **Click an enemy room** (in the enemy window) to drop it there: that weapon now targets that room. The room shows a
  per-weapon target marker (laser: a reticle; torpedo: a diamond), like FTL's numbered target marks.
- **Cancel:** right-click, Esc or clicking the card again drops the pick-up without a change. **Clear a target:**
  right-click the card.
- **Keyboard stays:** 1 / 2 pick up laser / torpedo (then the room keys or a click choose the room); Space and F keep
  working as manual fire.

## 2. Auto-fire and per-weapon targets (sim)

- **Per-weapon target room.** `systems.lock` stays the laser's target; a new `torpLock` is the torpedo's. A landed
  torpedo strikes `torpLock`. Both are −1 for "no target" (lock keeps its current default for the Hunter).
- **Always charging (owner, 2026-11-17: "the lasers/ torpedos should automatically charge, and be ready to fire
  without charging first"):** the laser charges by itself whenever it can (Weapons below level 2, console manned),
  with or without a target and with no hold; once full it stays full (no vent, `LASER_HOLD_TICKS` retired for the
  crew) until it fires. Every round starts with the laser full and the magazine full, so the first shot is ready
  immediately. Space / FIRE becomes a single press that fires a full laser (no hold-to-charge).
- **Laser auto-fire (FTL):** while the laser has a target, it fires its burst as soon as it is full and
  `laserEligible`; while full and not eligible it waits and fires the moment the enemy comes into arc and range. It keeps its target and re-fires every charge until cleared, as FTL's laser on
  autofire does.
- **Torpedo auto-launch:** with a target it launches once the enemy is in range (360) and a torpedo is in the
  magazine and none is in flight, then clears `torpLock` (a torpedo shot is single, as FTL's missiles stop after one
  volley), so torpedoes are never spent by accident.
- **Commands:** `laserLock {room}` gains room −1 (clear); new `torpLock {room}` (−1 clears). Manual `laserCharge` and
  `missileLaunch` stay and still work with no target. The Hunter's AI is unchanged.
- **Online:** the new command goes through the authority like the others; wire format gains `torpLock`.

## 3. Tests and gates

- Unit: laser with a target charges without a hold and fires on full + eligible; holds without venting out of arc and
  fires on entry; clearing stops it. Torpedo with a target launches on entering range and clears; strikes `torpLock`.
- UI: card click → line + reticle state; room click sends `laserLock`/`torpLock`; Esc / right-click cancels; right-click
  card clears; keyboard 1 / 2.
- Render: the line and markers stay on the CRT amber ramp (`crtColours`).
- duelGates and the scripted crew: the scripted gunner uses targets (auto-fire); report the round-length gate.
- Bless procedure 48 → 49 as usual; gates `tsc -b`, full vitest, `test:duel-app-runtime`.

## 4. As built (2026-11-17)

- **No target for the laser:** `lock` stays the Room 0..2 a manual shot strikes; a new flag `laserTargeted` says whether the
  laser has a target (`laserLock −1` clears the flag, keeping `lock`). It is set only on the crew's slot, so the Hunter's
  lock commands leave it false. `torpLock` is −1..2 as specified.
- **The torpedo's room:** a launch copies `torpLock` into a new `torpRoom` (the room the torpedo in flight strikes) and
  clears `torpLock`; a manual F with no target leaves `torpRoom` −1, and that torpedo strikes the laser's lock room as it
  lands (the old rule, so the Hunter is unchanged). The missile's end resets `torpRoom`. An inactive slot holds zeros.
- **Order in a tick:** laserLock, torpLock, the charge press, the laser's auto-fire, the manual launch, then the torpedo's
  auto-launch. Both auto weapons need the Weapons console attended; the laser still freezes while a torpedo flies.
- **Keys:** 1 and 2 pick up the laser and the torpedo, so the laser frequencies moved from 1 / 2 / 3 to 3 / 4 / 5. While
  the torpedo is picked up, E / Q step its target room; with the laser picked up they drop the pick-up and step the
  laser's target as before. A full laser reads `READY` (no vent countdown).
- **The scripted crew:** the gunner sets the laser's target (Shields while the enemy's are up, else Weapons) and targets
  the torpedo where it used to launch; the Helm lines up on a full, targeted laser. `MISSILE_GAP` 900 → 1500 for the
  round-length gate: at 900 the crew won all ten gate seeds (median 252.5 s); at 1500 the median is 218.3 s with 8 wins
  and 2 losses.

