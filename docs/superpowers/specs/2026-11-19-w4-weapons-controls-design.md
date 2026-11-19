# W-4: Weapons controls and the autocannon (design, 2026-11-19)

Ryan's playtest notes, section 4 (Weapons), as the owner approved them on 2026-11-19. This spec **amends** the pew pew
spec (`2026-11-18-pew-pew-weapons-design.md`: §1's aim and keys, §2 for the Hound, §3's steering) and Engineering spike
§10.3 and §11 (slot 1 is no longer the beam on the Hound). Where they differ, this spec wins.

The notes:

> - Mouse: aiming reticle; the selected weapon's heading slowly follows the reticle, limited to its firing arc.
> - Left click fires laser/autocannon. A/D or number pad select a weapon. W/S add/remove power on the selected weapon.
> - One quick input toggles guns between manual and auto, so the gunner can set auto before and after launching a missile.
> - Manual: aim + left click; small bonus to traverse speed and fire rate over auto.
> - Auto: aims and fires on its own whenever an enemy is inside the weapon's range and arc.
> - Missiles auto: fires and homes as long as there's ammo.
> - Missiles manual: after launch, the gunner flies it with the Helm's mouse steering, locked at 100% throttle, faster
>   than the ship, wider turns.
> - While flying a missile manually, the gunner can't aim or fire guns by hand; guns left on auto keep firing.

Ryan's "laser" is pew pew. "Missile" is the torpedo (`Missile` in code). "The Hound" is the crew's ship, the `cutter`
class (`CUTTER_CLASS`, `defs.ts` L122, the one `newtonianHelm` class).

Starting point: master 58e61a6d, SIM_VERSION 59. Paths are under `src/renderer/src/` unless they start with `tests/`,
`docs/` or `scripts/`. Every number is a starting value, kept in `sim/tactical/tuning.ts` or `sim/tactical/bars.ts` and
tuned in playtest.

## 1. Scope and which ships

- **The Hound** gets everything here: the new loadout, the turrets, AUTO/MAN, the new keys and the mouse-flown torpedo.
- **The Hunter** is unchanged: its laser (`HUNTER_LASER`), its pew (`HUNTER_PEW`, no turret), its torpedo and
  `hunter.ts` keep their code paths. Its fights change only because the crew's weapons do.
- **The Valkyrn** (`VALKYRN_CLASS`) keeps its fixed-forward gun, its Flight seat and its flight, bit for bit
  (`tests/valkyrnIdentity.test.ts`, §13.4).
- **The Valkyrn laser fit** (`VALKYRN_LASER_CLASS`, a developer fit) keeps the beam and W-2's manual laser. It is the
  only crew class that still has the beam, so W-2's code stays in the tree.
- Only the duel. The sector mode is untouched.

## 2. The Hound's loadout

| Slot (`WeaponSlot`) | Weapon | Bars (1 / 2 / 3 / overdrive 4th) | Arc | Damage |
|---|---|---|---|---|
| 0 `Pew` | **Pew pew** (W-1), a main weapon | ticks per third 60 / 45 / 30 / 24 (`PEW_TICKS_BY_BARS`, as now) | ±60° turret | as W-1: a layer, else 1 hull; never a room |
| 1 `Autocannon` | **The autocannon**: the Valkyrn's gun (`gun.ts`) moved onto the Hound | fire interval 10 / 8 / 6 / 5 ticks | ±30° turret (new) | as the Valkyrn's gun: 8 hits a layer, 12 a hull point, 6 a room level |
| 2 `Torpedo` | **The torpedo**, a main weapon | reload 4 / 6 / 8 / 10 (`TORPEDO_RELOAD_BY_BARS`, as now); 3 bars hit for 2 levels | launch forward, as now | as now |

- **Start power** stays `START_WEAPON_POWER = [1, 0, 1]` (`bars.ts` L70): pew 1, autocannon 0, torpedo 1. The trim order
  (torpedo, then slot 1, then pew, `trimmedWeaponPower` L76) and the 9-bar budget are unchanged.
- **`defs.ts`:**
  - `GunDef` gains `turret: TurretDef | null` and `intervalByBars: readonly (readonly number[])[] | null` (indexed
    `[manual ? 1 : 0][bars]`). `PewDef` gains `turret: TurretDef | null`.
  - `TurretDef = { arcSteps: number; traverse: readonly [number, number] }`: the arc in fine heading steps
    (`AIM_STEPS` 65536 to the turn) and the traverse per tick for AUTO and for MAN.
  - `GUN` (the Valkyrn's) gets `turret: null, intervalByBars: null`. `PEW` and `HUNTER_PEW` get `turret: null`.
  - New `AUTOCANNON: GunDef = { ...GUN, turret: AUTOCANNON_TURRET, intervalByBars: [AUTOCANNON_INTERVAL_BY_BARS,
    AUTOCANNON_MAN_INTERVAL_BY_BARS] }` and `HOUND_PEW: PewDef = { ...PEW, turret: PEW_TURRET }`.
  - `CUTTER_CLASS` becomes `shipClass('cutter', 'crew', SHIP_HULL, null, AUTOCANNON, STANDARD, HOUND_PEW)` with
    `newtonianHelm: true`. **Its laser slot is null.** Class indices do not move.
- **`bars.ts`:** `WeaponSlot` becomes `{ Pew: 0, Autocannon: 1, Torpedo: 2 }`, with `Beam: 1` kept as an alias that
  only the laser fit's readers use (`beamShots`, `tickWeapons`). New tables in the Weapons effects section (L86-L97):
  - `AUTOCANNON_INTERVAL_BY_BARS = [0, 10, 8, 6, 5]` (0 bars: off). 6 at 3 bars is the Valkyrn's `GUN_INTERVAL_TICKS`.
  - `AUTOCANNON_MAN_INTERVAL_BY_BARS = [0, 8, 7, 5, 4]` (§4.4).
  - `PEW_MAN_GAIN_BY_BARS = [0, 7, 10, 14, 18]` (§4.4).
- **A slot-1 bar means the class's second weapon:** the autocannon on the Hound, the beam on the laser fit (unchanged),
  nothing on the Valkyrn (its gun ignores bars, as today). The Valkyrn's gun has `intervalByBars: null`, so its
  interval stays `GUN_INTERVAL_TICKS`.

### 2.1 What the beam's leaving means for the Hound

The Hound now takes the laser-less path the Valkyrn built (Valkyrn spec §6.1). Every `slots.laser` reader already guards
null.

- **Sim state:** `laserCharge` stays 0 and `laserTargeted` false (`systemsFor`, `state.ts`), and `laserManual` stays
  false. `lock` stays `Room.Shields`: an AUTO torpedo still strikes `torpRoom`, which `launchMissile` sets from
  `torpLock` (`missiles.ts`), else `lock`.
- **Commands:** `laserLock`, `laserCharge`, `laserMode`, `laserFire`, `laserFrequency` and `rockLock {weapon: 'laser'}`
  are answered `unavailable` by today's no-laser rules (`step.ts` L313, L387). The app no longer sends them from the
  Hound (§9).
- **Engineering's beam tables** (`BEAM_SHOTS_BY_BARS`, `BEAM_RATE_BY_BARS`) stay, read only by the laser fit.
  `laserOffline` for the crew (`beamShots === 0`) is always true on the Hound. It gates only the laser.
- **UI:** the BEAM card, its FIRE (Space) button, the FTL opener's goal glow, the `x2` burst mark and the W-2 dashed aim
  line go from the Hound's Weapons station (§10). The contact window no longer offers a laser pick-up on the Hound.
- **Two things the Hound loses** (owner check, §17):
  - **Science's weak shield frequency** (Sci-1 Level 2) affects only the laser, so it has no effect on the Hound.
  - **Rock digging.** The laser's rock target is gone. Pew and autocannon rounds stop on rocks with no effect, as today.
    Only the torpedo's rock target breaks rocks.
- **Telemetry:** `laserReleases` (`sim/duel/telemetry.ts` L26) reads 0 for the Hound. The gates read `pewShots` and
  `gunShots` instead (§14).

## 3. Turrets (sim, W-4b)

### 3.1 State

- New `ShipSystems` fields, appended to the ship module's `SYSTEMS_TAIL` (`hash.ts` L24) after `torpManual`:
  - `pewTurret`: the pew turret's angle from the nose, a signed integer in fine steps, within ±its `arcSteps`;
  - `gunTurret`: the same for the autocannon;
  - `gunsManual`: both guns' mode (§4), a flag.
- All three are 0 / false at every round's start (`systemsFor`, `emptySystems`), and stay 0 on a class without the turret.

### 3.2 The slew law

- One pure function, `slewTurret(turret, heading, aim, rate, arcSteps)`, in a new `sim/tactical/turret.ts`. The step and
  the app's prediction (§11) both call it.
  - The wanted offset is `d = ((aim − heading·256 + 1.5·AIM_STEPS) mod AIM_STEPS) − AIM_STEPS/2`, which is
    `clampAim`'s signed difference (`pew.ts` L55), clamped to ±`arcSteps`.
  - The turret moves toward `d` by at most `rate`: `turret + clamp(d − turret, −rate, rate)`.
  - Integers in, an integer out. Only + − and the integer modulo.
- The turret's world aim is `(heading·256 + turret + AIM_STEPS) mod AIM_STEPS`, a fine aim. A round's direction is
  `aimDir` of it (`pew.ts` L62).
- **The turret is fixed to the hull.** When the ship turns, the turret turns with it until the slew catches up. This is
  the "slowly follows" feel: the reticle leads and the muzzle line trails.

### 3.3 Numbers

| | Arc | AUTO traverse | MAN traverse (+25 %) |
|---|---|---|---|
| Pew pew (`PEW_TURRET`) | ±60°: `PEW_ARC_STEPS` 10922, as now | 364 steps a tick (120.0°/s) | 455 (150.0°/s) |
| Autocannon (`AUTOCANNON_TURRET`) | ±30°: `AUTOCANNON_ARC_STEPS = floor(30/360 · AIM_STEPS)` = 5461 | 273 (90.0°/s) | 341 (112.4°/s) |

Why these numbers:
- **Visibly slower than the ship.** The Hound turns at 150°/s (`TURN_DEG_PER_S`), 300°/s when boosted. So the muzzle
  line visibly trails a flicked reticle, and the Helm's nose still matters: a fast Helm turn outruns either turret.
- **Fast enough to track a fight.** A Hunter crossing at 300 u/s at 200 u sweeps about 86°/s, inside both rates. In MAN
  both keep up with the ship's unboosted turn.
- **Full sweep times.** The pew crosses its 120° cone in 1.0 s (0.8 s MAN). The autocannon crosses its 60° cone in
  0.67 s (0.53 s MAN). The autocannon's arc is narrower, so it gets a slower turret.
- **Integer and exact.** Each rate is a whole number of fine steps. 455 is round(364 × 1.25) and 341 is
  round(273 × 1.25).

### 3.4 When a turret slews

All of these hold only while the Weapons console is attended (`input.weapons`), as every crew weapon does today:
- **No power, no slew.** A gun with 0 bars holds still.
- **MAN:** the **selected** gun (§8 `weaponSel`) slews toward the held reticle (`turretAim`) at its MAN traverse. The
  other gun holds its angle. If there's no reticle, or the torpedo is selected, nothing slews.
- **While the crew's MANUAL torpedo flies** (`manualTorpedoFlying`), MAN guns hold. The reticle is ignored.
- **AUTO:** each powered AUTO gun slews toward its own solution (§4.2) at its AUTO traverse. With no solution it slews
  back to 0, the nose.
- **Unattended:** both turrets hold.

The slew runs in `applyWeaponsInput` (`weapons.ts` L297) right after `stepBurst`, before `tickGun` (L313) and before
`firePew` (L338). It uses the pre-move heading, "before anything moves", as the laser and gun do today.

## 4. AUTO and MAN (sim, W-4b)

### 4.1 The mode

- **One flag for both guns:** `gunsManual` (false AUTO, true MAN). Every round starts AUTO, as W-2 and W-3 do. Only the
  crew slot of a turret class ever changes it.
- **The command:** `gunMode {manual: boolean}`, Weapons seat only.
- **Admission, in order:**
  - stale-tick;
  - `not-at-weapons`;
  - `unavailable` on a class with neither turret (the Valkyrn, the laser fit);
  - `malformed` for a non-boolean;
  - `noop` when the mode is unchanged.
  - It is set at once, first in `WEAPON_ORDER` beside `laserMode` and `torpMode`, so a same-tick `pewFire` is judged in
    the new mode.
- **The torpedo keeps its own mode,** `torpManual` (V), unchanged.

### 4.2 AUTO targets and solutions

**The target.** The crew's target ship (`systems[0].target`) when all of these hold:
- it is seen (`shipSeen`, the fog rules of Engineering §10.4);
- its centre is within the gun's AUTO range: pew `PEW_RANGE` (450, as the Hunter uses), autocannon
  `AUTOCANNON_AUTO_RANGE` 600 (a round reaches about 607 u at rest);
- the line from the muzzle to it is clear (`geometry.ts` `lineOfSight`: planet and rocks), since rounds stop on rocks.

**Pew point defence first.** The AUTO pew first takes the target ship's torpedo in flight when it lies within
`AUTO_PD_RANGE` 300 (the Hunter's `HUNTER_PD_RANGE`) and is seen (`pointSeen`). This is the scripted gunner's existing
priority (`scripted.ts` `gunnerPew` L309). Autocannon rounds never hit torpedoes (`stepRounds`), so the autocannon only
takes the ship.

**The solution** is the lead aim's offset from the nose, when it lies inside the arc:
- Pew: `pewLead` (`pew.ts` L150). It uses the target's own velocity, since a pew round does not inherit the ship's.
- Autocannon: a new `gunLead` in `gun.ts`. It works like `pewLead` but uses the velocity relative to the Hound, since a
  gun round does inherit the ship's velocity (`fireRound`). Its muzzle point is the nose point between the two muzzles,
  and its speed is `GUN_SPEED`.
- Both return a whole heading × 256, as `pewLead` does. The half-step error is 0.7°, 5.5 u at 450 u, well inside the
  Hunter's 20 u radius.
- **No solution** when there is no intercept, or the offset lies outside ±`arcSteps`.

**When it fires.** A gun is on solution on a tick when the slew (§3.4) leaves the turret exactly on the solution's offset.
The solutions are whole-heading multiples and the rates exceed one step's drift, so a tracked target settles.

### 4.3 AUTO firing

Every AUTO rule needs the Weapons console attended and the gun powered (bars ≥ 1).
- **AUTO pew:** it fires one round along its turret's world aim whenever it is on solution and a third is stored
  (`pewReady`). So it fires each time a third has charged, and it never bursts.
- **AUTO autocannon:** it fires along its turret whenever it is on solution, `gunHeat < GUN_AUTO_HEAT_STOP`, and
  `tickGun`'s own rules allow it:
  - not locked;
  - Weapons below level 2;
  - the cooldown at 0.
  - `GUN_AUTO_HEAT_STOP = 800`, 80 % of `GUN_HEAT_MAX`. A shot from just under 800 reaches at most 850, so AUTO never
    locks.
  - At the stop it settles at the rate cooling allows: one round every 12.5 ticks at `GUN_COOL` 4. It has no hysteresis.
- **AUTO with an AUTO gun selected:** W/S still change its bars. LMB does nothing: no command, no refusal. The card
  reads AUTO.
- **AUTO ignores hostility.** It fires at a seen enemy in range and arc during the 30 s hold too, as the AUTO beam does
  today (the FTL opener). Its first round turns the enemy hostile (`hostilityStep`, cause `pew` or `gun`). Owner check,
  §17.

### 4.4 MAN

The player aims (the reticle, §3.4) and fires (LMB, §9). MAN gets a bonus:
- **Traverse +25 %:** the MAN column of §3.3.
- **Fire rate about +20 %.** Integer tables, because charge and cooldowns are integers:
  - **Pew:** charge units a tick, `PEW_MAN_GAIN_BY_BARS = [0, 7, 10, 14, 18]`, against AUTO's 6 / 8 / 12 / 15 (360
    units a third). That is a third in about 51 / 36 / 26 / 20 ticks, +17 / +25 / +17 / +20 %. AUTO keeps
    `PEW_TICKS_BY_BARS`, so its gains stay whole as now.
    - `PEW_CHARGE_SCALE` is not changed, so the Hunter's charge units stay the same.
    - `pewGain` (`pew.ts` L31) reads the MAN table only for the crew slot of a turret pew in MAN.
  - **Autocannon:** interval `AUTOCANNON_MAN_INTERVAL_BY_BARS = [0, 8, 7, 5, 4]` against AUTO's 10 / 8 / 6 / 5. That is
    +25 / +14 / +20 / +25 %.
  - **The interval is read when a round fires:** `gunCooldown` is set from the mode and bars at that moment.
- **MAN heat:** the lock rules are the Valkyrn's (Decision 7 of the Valkyrn spec). Holding LMB can lock the gun: from
  cold, about 2 s at the 4-tick interval and about 3.8 s at 6. That is the skill cost of MAN.

## 5. The autocannon (sim, W-4a)

- **`tickGun`** (`gun.ts` L44) runs as today for a gun whose `turret` is null: the Valkyrn's code, byte for byte. For a
  turret gun:
  - **cooling and cooldown** as today;
  - **the interval** is `intervalByBars[mode][trimmed slot-1 bars]`, and 0 bars means no round;
  - **MAN:** a round fires when `input.gunHeld` (§8: LMB held, the autocannon selected, no MANUAL torpedo flying) and
    the Valkyrn's rules hold (attended, not locked, Weapons below level 2, cooldown 0);
  - **AUTO:** §4.3.
- **`fireRound`** (L26):
  - The two muzzle points stay on the hull, the nose frame, as now.
  - The round's direction is the turret's world aim for a turret gun, else the nose, as today.
  - The velocity is the ship's plus `speed` along that direction.
  - The Valkyrn has no turret, so it keeps `hx/hy(heading)` and its numbers can't move.
- **Unchanged:** heat, the lock, the halved cooling under Weapons damage, the round pool (`GUN_POOL` 64), `stepRounds`,
  `gunHit`, the room under the closest approach (`gunRoomOf`), rocks absorbing rounds, the `gunFire` / `gunHit` events
  and the hostility cause `gun`.
- **Its hit numbers are the Valkyrn's** (`GUN_HITS_PER_LAYER` 8, `GUN_HITS_PER_HULL` 12, `GUN_HITS_PER_LEVEL` 6), copied
  into `AUTOCANNON`. Gate tuning (§12) may move `AUTOCANNON`'s own copies only, never `GUN`'s.
- **Its roles:** the autocannon is the Hound's room damage now. Six unshielded hits raise a room a level, which takes
  over the beam's "take out systems" role (pew pew spec §6 decision 2). Pew pew strips shields, does hull damage and
  shoots down torpedoes.

## 6. Pew pew on a turret (sim, W-4a and W-4b)

- **The round flies along the pew turret's world aim,** not along a clicked point. The muzzle stays at the nose point
  (`pewMuzzle`). Rounds, damage, pool and point defence are W-1's.
- **`pewFire` loses its aim:** it becomes `{ kind: 'pewFire' }`.
- **Admission** (`step.ts` L350-L355), in order:
  - stale-tick;
  - `not-at-weapons`;
  - `unavailable` without a pew (the Valkyrn);
  - `unavailable` in AUTO;
  - `missile-in-flight` while the crew's MANUAL torpedo flies;
  - `noop` for a second one in a tick;
  - `unavailable` without a third or without a bar (`pewReady`).
  - An admitted one sets `ShipInput.pewTrigger`.
- **Firing:** `applyWeaponsInput` fires the trigger along the post-slew turret, at the end, where `firePew` runs today.
  The Hunter's `ShipInput.pewAim` and `firePew(state, i, aim)` are unchanged.
- **Before W-4b lands** (W-4a on its own on the branch): the pew turret is 0, so pew pew fires straight ahead.

## 7. The manual torpedo (W-4c)

- **Launch:** unchanged (W-3). F or LMB with the torpedo selected sends `missileLaunch`. In MAN it needs no lock and no
  range.
- **Steering:** while the crew's MANUAL torpedo flies, LMB held on the open Weapons map steers it.
  - Every frame, the client sends the bearing (a heading index) from the torpedo's drawn marker to the pointer in the
    existing held `torpHeading`.
  - This is the Helm's left-button steer path (`scene.ts` L339 `helmSteer`, `runtime.ts` L597-L600), aimed from the
    torpedo instead of the ship.
  - **On release,** the last bearing keeps being sent (`torpHold`, as W-3 re-sends it every frame), so the torpedo holds
    that heading.
- **The sim law is W-3's, unchanged:** `manualTorpTurn` turns it by `holdTurn` toward `torpHeading`.
  - The torpedo runs at full thrust while fuelled, then coasts. It turns only after its boost.
  - Its numbers stay W-3's: `MISSILE_THRUST` 160, no drag, `MISSILE_TURN_STEPS_PER_TICK` 120°/s against the ship's
    150°/s, so its turns are wider; `MISSILE_FUEL_TICKS` 360, `MISSILE_LIFE_TICKS` 480.
  - Owner check (§17): the Helm's nose uses `aimTurn` (a ±1 index band). The torpedo keeps W-3's `holdTurn` band
    (sin 2.5°), so its feel and its tests stay.
- **Removed:**
  - A/D steering: `HeldInput.torpTurn`, `ShipInput.torpTurn` and `manualTorpTurn`'s turn argument go from the sim, every
    held schema and the app.
  - The right-button heading: `mapRequests.torpHeading` now comes from the left-button steer. At Weapons the right
    button pans again: the `manualTorpedoFlying` exemption in `cameraInput.apply` (`runtime.ts` L617,
    `onlineSource.ts` L199) goes.
- **The camera** follows it as now (`trackManualTorpedo`, `torpedoCamera.ts` L16).
- **The guns while it flies:**
  - no MAN slew, no `gunHeld`, and `pewFire` is refused `missile-in-flight` (§3.4, §6);
  - AUTO guns keep slewing and firing;
  - Z still toggles the guns, so the gunner can set AUTO after the launch;
  - A/D, 1/2/3 and W/S still select and power.
- **When the flight ends** (a hit, out of fuel, shot down, the edge): LMB goes back to the selected weapon on its **next
  press**. A held LMB from the flight fires nothing, and the client needs a fresh press. If the torpedo was selected at
  launch, the selection returns to the last gun selected (the pew by default). So "control returns to the selected gun"
  holds, and a held LMB can't launch a second torpedo.

## 8. Commands, held input and the step

**Commands** (`net/contracts.ts` L104-L112, `net/codec.ts` L127, `authority/duelRules.ts`, `DUEL_KINDS` and
`WEAPON_ORDER` in `step.ts` L43-L46, the ship module's `commands` in `hash.ts` L158, `isWeaponsCommand` in `runtime.ts`
L256):
- new `gunMode {manual}`, placed first in `WEAPON_ORDER` (`['laserMode', 'torpMode', 'gunMode', ...]`);
- `pewFire {}`, with no aim;
- `weaponPower {slot, delta}`, unchanged (W/S and the pips send it);
- `missileLaunch`, `torpMode` and `torpLock`, unchanged;
- the laser commands stay on the wire for the laser fit.

**Held input** (`HeldInput`, `net/contracts.ts` L40):
- new `turretAim?: number`: the reticle's world bearing from the own ship, a fine aim 0..65535 (absent or −1: none).
  Schema `z.number().int().min(-1).max(65535).optional()`.
- new `weaponSel?: number`: the selected slot, 0..2 (absent: none). Schema `z.number().int().min(0).max(2).optional()`.
- `gunHeld`, reused: at the Hound's Weapons seat it is LMB held on the open map.
- `torpHeading`, reused as §7 says.
- `torpTurn`, removed.
- **Every held schema:** `net/codec.ts` L163-L165, `authority/checkpoint.ts` L40, `authority/duelCheckpoint.ts` L73,
  `authority/replay.ts` L17.
- **The authority** (`authority/core.ts`): the expiry check (L330) also expires a frame with `turretAim` or `weaponSel`
  set, and the pause clear (L436) deletes both. A lost frame therefore holds the turrets after the 250 ms held timeout
  (`REMOTE_HELD_TIMEOUT_MS`).

**`ShipInput`** (`weapons.ts` L19):
- new `turretAim` (−1 none), `weaponSel` (−1 none) and `pewTrigger` (false);
- `torpTurn` removed;
- `IDLE_INPUT` and `UNCREWED_INPUT` (L56, L58) take the defaults, so the Hunter's inputs are as today.

**The step** (`step.ts` L301-L304) fills them from the Weapons attendant's held frame:
- `turretAim` and `weaponSel` as sent;
- `gunHeld` true only on a turret class when `held.gunHeld && weaponSel === 1`. On the Valkyrn it is today's rule,
  unchanged.
- The sim then applies the MAN and flight rules (§3.4, §5).

**The tick order** inside `applyWeaponsInput` for the crew:
1. locks;
2. `stepBurst`;
3. **slew turrets**;
4. `tickGun` (MAN trigger or AUTO);
5. laser (laser classes only);
6. torpedo launch;
7. **pew** (`pewTrigger`, AUTO pew, or the Hunter's `pewAim`), last as today.

`tickPew` keeps running in `tickWeapons` (L363), every tick, attended or not.

## 9. Controls at the Weapons station (app)

The Helm and walking pattern: the mouse aims, WASD manages, LMB is the main action. These keys hold only at the Hound's
Weapons seat (the seat is `weapons` and the class has a turret). The Valkyrn's Flight seat and the laser fit keep theirs
(Valkyrn spec §5.1).

| Input | W-4 action at the Hound's Weapons seat | Before (W-1 to W-3) |
|---|---|---|
| Mouse over the open map | The reticle: `turretAim` every frame, from `mapRequests.aimLaser`'s fine bearing (renamed `reticle`; `scene.ts` L279-L281) | The W-2 laser aim |
| LMB click | Pew selected, MAN: `pewFire` (one shot, a third) | `pewFire` at the clicked point |
| LMB held | Autocannon selected, MAN: `gunHeld` (fires while held) | — |
| LMB click | Torpedo selected: `missileLaunch` (as F), or why not | — |
| LMB held | MANUAL torpedo flying: steer it (§7) | — |
| LMB, AUTO gun selected | Nothing | — |
| A / D | Select the previous / next weapon, wrapping | A/D steer the MANUAL torpedo |
| 1 / 2 / 3, Num 1 / 2 / 3 | Select pew pew / autocannon / torpedo | 1 / 2 picked up the laser / torpedo; 3 tuned frequency A |
| W / S | `weaponPower` +1 / −1 on the selected weapon | Nothing at Weapons |
| Z | `gunMode`: both guns AUTO ↔ MAN | `laserMode` |
| V | `torpMode` (unchanged) | same |
| F | `missileLaunch` (unchanged) | same |
| E / Q | Step the torpedo's target room (`torpLock`), as the Flight seat does (`runtime.ts` L440-L445) | Step the laser's lock |
| Space | Nothing at Weapons (at the Helm it is still auto-face) | Fire the laser |
| 4 / 5 | Nothing on the Hound (frequency needs a laser) | Frequency B / C |
| RMB on the map | Pan (as on Science) | The MANUAL torpedo's heading |
| T, G, C, X, Tab, Esc, M, wheel, middle drag | Unchanged | same |

**Clashes and how they're resolved:**
- **1 / 2 against the FTL pick-up.** `contactController.ts` L140 intercepts `WEAPON_CODES` as pick-ups. At the Hound's
  Weapons seat it no longer takes the digits: they select. A card click still picks the torpedo up for a room click,
  and selects it too. The laser fit's 1 / 2 are unchanged.
- **3 against frequency A.** `FREQ_CODES` (`input.ts` L21) is read only on a class with a laser. On the Hound, 3 selects.
- **W / S against the throttle notches.** `PRESS_CODES` L17 binds W/S to `throttleUp` / `throttleDown`. The runtime
  sends a throttle only from the Helm and Flight seats, so at Weapons the same press edges become `weaponPower`. No new
  key code.
- **A / D.** They are movement codes and have no press edges. New press actions `selectPrev` / `selectNext` on KeyA /
  KeyD, read only at the Hound's Weapons seat. The seated gunner doesn't walk, and the crew Helm's thrusters read held
  keys, not these edges.
- **Z.** `KeyAction` `laserMode` is renamed `weaponMode`. The runtime sends `gunMode` on a turret class and `laserMode` on
  a laser class.
- **Numpad 1-3 against Num + / Num −** (zoom) and Num Enter (confirm): different codes, no clash.
- **LMB over the console blocks.** LMB over a card, pips, a tag, the enemy window or a console block stays the UI's, as
  W-1's `onWeaponsMap` test does today (`scene.ts` L253-L261). Only the open map fires. The torpedo's room click in the
  enemy window is unchanged.

**Selection** is client state: the pew at a sit, kept through a torpedo flight (§7), and sent every frame as
`weaponSel`. The local runtime (`runtime.ts` `play`, L403) and online (`onlineDuel.ts` `play`, L233) both keep it.
`app/duel/input.ts` gains `WEAPON_SELECT_CODES` (Digit1..3, Numpad1..3) beside `WEAPON_CODES`.

**Refusals** (the Feel-ii path, `refuse` in `runtime.ts` / `source.refuse` online):
- pew `NO CHARGE`;
- autocannon `OVERHEAT` while locked, and `NO POWER` at 0 bars, on the press edge of a held LMB (as the Flight seat's
  dead trigger, `runtime.ts` L456);
- torpedo today's launch reasons;
- W/S at the end of a range: the pips flash (`unavailable`).

**`app/controlsList.ts`:**
- The Single player rows change: the left click, Z, the walk row's Weapons clause, the right drag, and the
  `fireDown`, `laserMode` and `torpMode` texts.
- New rows:
  - "Mouse, at Weapons: the reticle; the selected gun's turret follows it, inside its arc";
  - "A / D, 1 / 2 / 3, Num 1 / 2 / 3: select a weapon";
  - "W / S at Weapons: power the selected weapon";
  - "Z: both guns AUTO / MAN";
  - "Hold left mouse with a MANUAL torpedo flying: steer it".
- The rows stay built from the input tables (`WEAPON_SELECT_CODES`, `PRESS_CODES`), as the list's header requires.
  The Valkyrn section is unchanged.

## 10. Console and map (render and UI)

- **`ui/duel/WeaponsStation.tsx`:** three cards in slot order: PEW PEW, AUTOCANNON, TORPEDO. Today's are the PEW row,
  BEAM and TORPEDO. `consoleLayout.ts` `weaponCard` changes `'laser'` to `'autocannon'`.
  - **The selected card's frame is `hot`** (`data-ui-card-selected`). A click on a card's body selects it, and a click on
    TORPEDO also picks it up (FTL room targeting).
  - **PEW PEW:** the three charge pips (W-1) and an AUTO / MAN tag.
  - **AUTOCANNON:** a heat bar with `OVERHEAT` blinking while locked (from the Valkyrn's GUN card, Valkyrn spec §7.4), its
    rate in rounds a second at the current bars and mode (`6/S`; `OFF` at 0 bars), and the same AUTO / MAN tag.
    - **The two gun tags are one switch:** both lit in MAN, and a click on either sends `gunMode`, as Z does.
  - **TORPEDO:** as now, with its own tag (V). In MAN while it flies it reads `STEER LMB`, not `STEER A/D`.
  - **The bar pips under each card** stay (left click +1, right click −1).
  - **The hint row:** `LMB FIRE · A/D SELECT · W/S POWER · Z AUTO/MAN`. The BEAM refusal and firing texts go, and the
    refusal row names PEW, AUTOCANNON or TORPEDO.
- **The Weapons map** (`render/tactical/weaponsModel.ts` L277-L304, `tacticalLayer.ts` L375):
  - the **selected gun's arc** edges, about the nose (`dim`), replacing the W-1 cone;
  - each gun's **muzzle line** along its real turret angle (`aimDir` of the interpolated turret): the selected gun's
    `mid`, the other's `dim`. The pew's runs to `PEW_RANGE`, the autocannon's to 600;
  - the **reticle** at the pointer, a small cross (`main`);
  - in AUTO, a **bracket on the target** while a gun is on solution (`hot`);
  - the W-2 dashed laser line is not drawn on the Hound;
  - autocannon rounds as the tracers `roundDraws` already draws for any gun class (`weaponsModel.ts` L276).
- **Sound:** the autocannon uses the Valkyrn gun's fire and hit sounds (the `gunFire` / `gunHit` events), with no new
  sample.
- **The Helm and Science maps** draw the muzzle lines `dim` and no reticle.

## 11. Online

- **The authority decides everything.** The turrets, AUTO, firing and the torpedo are all sim state or sim rules. NO
  CHARGE online stays the authority's `unavailable` for a `pewFire` (W-1 review F2, `onlineDuel.ts` L217), and the same
  applies to `gunMode`'s noop and the autocannon's refusals.
- **The held fields** go out in `sessionHeld` (`onlineDuel.ts` L68) at the Hound's Weapons seat: `turretAim`,
  `weaponSel`, `gunHeld`, and `torpHeading` while steering. The held change test (L74) adds them, and drops `torpTurn`.
- **Client prediction:**
  - **The reticle** is local and drawn at once.
  - **The own seat's selected turret** is predicted as the crew Helm's throttle is (playtest2feedback Decision 14). The
    client runs `slewTurret` from the replica's turret over the held frames it has sent and the replica hasn't shown,
    at most the same cap, at the mode's traverse. Its muzzle line draws from that, so the turret answers the mouse
    with no round-trip lag.
  - **Everything else** draws from the replica: the other gun's line, AUTO's turrets, every round.
  - `onlineSource.ts` gains `turret()`, as `thrMille()`.
- **The mode toggle** follows W-2's pattern: send once, judge from the latest queued (`laserModeSent` becomes
  `gunModeSent`).
- **The wire's version:** SIM 60 (§13.3). A client and an authority on different versions refuse each other, as now.

## 12. The scripted crew gunner (`sim/duel/scripted.ts`)

The goal is bots that use pew pew and the autocannon. The crew bots lose all ten duel-gate seeds at SIM 59.

- **On a turret class (the Hound),** the gunner's first seated tick spends the reactor's spare bar:
  - `shipPower {system: Weapons, delta: +1}`, then `weaponPower {slot: Autocannon, delta: +1}`.
  - The start uses 9 of 10 bars, and ship commands are admitted before `weaponPower` in the same tick (`step.ts`
    L417-L440). So pew 1, autocannon 1, torpedo 1.
  - It replaces Decision 20's move (pew −1, beam +1) on this class. `barMoved` still makes it once a round.
  - If the shipPower is refused (no spare bar), it moves nothing.
- **The guns stay AUTO.** The gunner sends no `pewFire` and no held aim. AUTO's point defence and lead (§4.2) do what
  `gunnerPew` did. `gunnerPew` and the `laserLock` line no longer run on this class.
- **The torpedo rule** keeps `MISSILE_GAP` and the `torpLock`, without the laser terms: `canLaunch` and the gap.
- **On any other class** (the Valkyrn in the identity test's "pair" runs), everything stays as on master, byte for byte:
  the pew → beam move, `laserLock` and `gunnerPew`. So `tests/valkyrnIdentity.test.ts` keeps its digests.
- **The gates** (§14): the per-seed gates must pass. The aggregate band (3 to 5 minutes, the crew both wins and loses)
  stays `it.skip` as at SIM 59 (kind c). Its numbers go in the plan's report.
- **The tuning ladder,** in order, until the crew wins at least one seed:
  1. `AUTOCANNON`'s `hitsPerHull`;
  2. `AUTOCANNON_AUTO_RANGE`;
  3. `MISSILE_GAP`;
  4. the gunner's Weapons bar choice.
  - Never the Hunter's or the Valkyrn's knobs.

## 13. State, hash, snapshots, determinism

### 13.1 State and hash

- **Ship module** (`hash.ts`):
  - `pewTurret`, `gunTurret` and `gunsManual` are appended to `SYSTEMS_TAIL` (L24), with `gunsManual` in `FLAGS` (L27);
  - `commands` gains `gunMode` (L158).
  - Compile-time completeness (the `never` checks) covers the new members.
- **Validation** (`hash.ts` bounds, about L228-L270, and `sim/snapshotValidation.ts`):
  - `pewTurret` within ±the slot class's pew turret arc, 0 without a turret (a per-class rule like `pewChargeRule`
    L258); `gunTurret` likewise;
  - `gunsManual` a bit, true only on the crew slot of a turret class (as `laserManual`'s crew-only check);
  - `gunCooldown`'s bound is the largest of every gun's `intervalTicks` and its `intervalByBars` tables (10).
- **Snapshots** copy the module's fields (`cloneTacticalFromModule`), so no list changes. `tests/duelModules.test.ts`'s
  pinned field and kind lists are updated.

### 13.2 Determinism

- **The new arithmetic is integer:** turret offsets, rates, tables, the heat stop. `aimDir` (`dirBetween`: + − × ÷,
  sqrt) gives the direction. Leads use `interceptTime` and `nearestHeading` (`lead.ts`), the heading tables, as
  `pewLead` does. No new randomness, so the crew's AUTO aims exactly.
- `npm run test:determinism` passes on Node, Electron and Firefox.

### 13.3 SIM_VERSION and the bless

The repo's pattern, as the playtest2feedback merge did it (58e61a6d's parents):
1. Re-pick the pinned whole-run fixtures (kind b) and replace the changed rules' tests (kind a, listed in §14).
2. A same-version bless at SIM 59 for the new behaviour: `tests/golden/duel-1.json`, `duel-rematch.json` and the
   determinism fixture re-recorded.
3. SIM_VERSION 59 → 60 alone, blessed, with the canonical trace and the duel oracle proving every run unchanged per
   tick (`scripts/golden/blessGuard` refuses otherwise).
4. Re-pick the duel app smoke's forced-round-end seed if its round no longer ends inside the window (as b7c0919e).

W-4a, b and c are built on one branch and merge once at SIM 60 (§19).

### 13.4 What stays bit-identical

- **The Valkyrn:** `tests/valkyrnIdentity.test.ts`'s five digests do not change.
  - Its digest hashes `flattenTactical`, which now also holds the three new fields. They are always 0 / false on the
    Valkyrn, so the test leaves them out by name, as it already leaves out `thrMille`.
  - A new assertion in the same runs checks they stay 0 / false.
  - The Valkyrn's gun takes the `turret === null` branch everywhere, and its interval is `GUN.intervalTicks`.
- **The Hunter:** no rule or number changes. `tests/pewHunter.test.ts`, `tests/torpedoGuidance.test.ts` and the
  Hunter's unit tests pass unchanged.
  - New `tests/w4HunterIdentity.test.ts`: `hunterThink`'s outputs over a fixed scripted crew trajectory (state written
    directly, no crew weapons) match a digest recorded at SIM 59 on master.
- **The laser fit:** W-2's `tests/manualLaser*.test.ts`, run on `VALKYRN_LASER_CLASS`, pass.

## 14. Tests

Each rule gets a test. File names are suggestions, prefixed `w4`.

- **Loadout** (`w4Loadout.test.ts`):
  - the Hound's slots: pew with a turret, `AUTOCANNON`, the torpedo, no laser;
  - the start power 1 / 0 / 1;
  - the trim order takes the autocannon's bar before the pew's;
  - the Valkyrn's `GUN` and the Hunter's pew have no turret;
  - every laser command from the Hound is `unavailable`;
  - Space and 4 / 5 at the Hound's Weapons seat queue nothing.
- **Autocannon** (`w4Autocannon.test.ts`):
  - the interval by bars, AUTO 10 / 8 / 6 / 5 and MAN 8 / 7 / 5 / 4, measured between `gunFire` events;
  - 0 bars fires nothing;
  - the heat and lock as the Valkyrn's, with Weapons damage halving the cooling;
  - rounds leave along the turret with the ship's velocity added;
  - the twin muzzles alternate on the hull;
  - hits as `gunHit`, with a room level after 6 unshielded hits.
- **Turret** (`w4Turret.test.ts`):
  - `slewTurret` moves at most the rate, never past the wanted offset, and clamps to the arc;
  - the wrap across 0 / 65535;
  - an integer in and out for every case;
  - MAN slews only the selected gun, at 455 / 341;
  - AUTO at 364 / 273;
  - no power or unattended holds;
  - a turning ship carries the turret.
- **AUTO** (`w4Auto.test.ts`):
  - **pew:** it fires only when the target is seen, inside 450, in the arc, with a clear line and on solution; once per
    third charged; it shoots down an inbound torpedo within 300 before the ship;
  - **autocannon:** it fires on solution inside 600; it holds at heat ≥ 800 and never locks over 3000 ticks of
    continuous AUTO; it settles at one round per about 12.5 ticks;
  - **no fire** on an unseen (fogged) enemy, behind a rock, or out of the arc;
  - AUTO turrets go back to the nose with no target;
  - a seeded scenario pins a known hit count.
- **MAN** (`w4Manual.test.ts`):
  - the pew gain 7 / 10 / 14 / 18;
  - `gunMode` admission (seat, malformed, noop, `unavailable` on the Valkyrn) and its order before `pewFire`;
  - `pewFire` is refused in AUTO and during a MANUAL flight, a second one in a tick is a noop, and the round flies along
    the turret, not the cursor;
  - `gunHeld` fires the autocannon only when it is selected.
- **Manual torpedo** (`manualTorpedo*.test.ts`, updated):
  - `torpTurn` is gone from every schema (a frame carrying it is malformed);
  - `torpHeading` from the left-button steer turns it and holds on release;
  - the right button pans at Weapons;
  - the guns during a flight: MAN holds and `pewFire` is `missile-in-flight`, while AUTO keeps firing;
  - after the flight, a held LMB fires nothing until a fresh press, and the selection returns from the torpedo to the
    last gun;
  - W-3's flight tests keep their numbers.
- **Wire and authority:**
  - `gunMode` and the new `pewFire` round-trip the codec;
  - `turretAim` and `weaponSel` round-trip every held schema and are optional;
  - out-of-range values are malformed;
  - an expired frame with only `turretAim` is expired, and a pause clears both;
  - the authority rejects a wrong-seat `gunMode`.
- **Hash and snapshot:**
  - the bounds (turret within its class's arc, `gunsManual` crew-only, the cooldown bound 10);
  - a snapshot round-trip mid-slew;
  - `tests/duelModules.test.ts`'s lists.
- **App** (`w4Input.test.ts`, `w4Ui.test.tsx`):
  - A/D and 1 / 2 / 3 / Num 1-3 select, wrapping, with the highlight;
  - W/S send `weaponPower` on the selected slot;
  - Z sends `gunMode` (and `laserMode` on the laser fit);
  - LMB sends `pewFire`, `gunHeld` or `missileLaunch` by selection and nothing on an AUTO gun;
  - 1 / 2 are not intercepted as pick-ups at the Hound's seat;
  - the cards in slot order, the shared tag, the heat bar and `6/S`;
  - the map's arc, the muzzle lines and the reticle;
  - the controls list rows come from the tables.
- **Online** (`w4Online.test.ts`):
  - `sessionHeld` carries the new fields at the Hound's Weapons seat only;
  - the predicted turret matches the stepped turret once the replica catches up;
  - NO CHARGE comes from the authority's `unavailable`.
- **Scripted and gates:**
  - the gunner's first tick sends `shipPower` then `weaponPower` and ends at 1 / 1 / 1;
  - the Valkyrn pair's commands are unchanged;
  - **kind (a):** `tests/duelGates.test.ts`'s per-seed "the crew uses both weapons" becomes
    `pewShots + gunShots ≥ 1` and `missilesLaunched ≥ 1` (was `laserReleases ≥ 1`), and the same in
    `tests/duelScripted.test.ts`;
  - the aggregate gate stays skipped (kind c), its numbers reported.
- **Identity:** §13.4's three.
- **Final checks:** `npm run typecheck`, `npm test`, `npm run test:determinism` and `npm run build`.

## 15. What changes for whom

| | Crew Hound (`cutter`) | Hunter | Valkyrn (gun) | Valkyrn laser fit |
|---|---|---|---|---|
| Loadout | pew (turret ±60°), autocannon (turret ±30°), torpedo; no beam | unchanged (laser, pew, torpedo) | unchanged (fixed gun, torpedo) | unchanged (beam, torpedo) |
| Slot-1 bars | autocannon interval 10 / 8 / 6 / 5 | none | ignored, as now | beam shots and charge, as now |
| AUTO / MAN guns | new (Z, both together; start AUTO) | always auto (its own AI) | none (`gunMode` `unavailable`) | none; W-2 `laserMode` on Z |
| Reticle and turrets | new (mouse, slew, muzzle lines) | none | none (the nose aims) | none |
| LMB at Weapons | fire the selected weapon / steer a MANUAL torpedo | — | the Flight seat's gun, unchanged | unchanged |
| A/D, 1 / 2 / 3, W/S at Weapons | select, select, power | — | Flight seat unchanged | Flight seat unchanged |
| Manual torpedo | mouse-steered (LMB), no A/D or right drag | none | unchanged rules (no MANUAL flight on the Flight seat) | unchanged |
| Bots | gunner powers the autocannon, AUTO guns | `hunter.ts` unchanged | pilot and pair bit-identical | — |
| Sim tests pinned | goldens re-blessed | identity digest (§13.4) | `valkyrnIdentity` digests unchanged | `manualLaser*` pass |

## 16. Decisions

1. **The Hound's loadout is pew pew, the autocannon and the torpedo** (owner 2026-11-19). The beam leaves the Hound and
   its slot is the autocannon's. The Hunter, the Valkyrn and the laser fit keep their weapons.
2. **The autocannon is `gun.ts`** with a ±30° turret and bars setting its interval (10 / 8 / 6 / 5). The Valkyrn's
   heat, lock and hit rules stay.
3. **Start power is 1 / 0 / 1.**
4. **Weapons controls copy the Helm:** the mouse aims, WASD manages, LMB fires. A/D or 1 / 2 / 3 select, W/S power the
   selected weapon, F still launches, Space no longer fires.
5. **Z toggles both guns together, and V stays the torpedo's.**
6. **AUTO guns** slew and fire with lead at a seen enemy in range and arc. The pew fires on each charged third. The
   autocannon stops at 80 % heat. LMB does nothing on an AUTO gun, and W/S still work.
7. **MAN gets +25 % traverse and about +20 % fire rate,** as integer tables.
8. **The traverse rates** are pew 364 / 455 and autocannon 273 / 341 fine steps a tick (§3.3).
9. **The MANUAL torpedo is flown by LMB toward the cursor.** Releasing holds the heading. W-3's flight numbers stay, A/D
   and the right drag are removed, and the camera follows.
10. **While a MANUAL torpedo flies, MAN guns neither aim nor fire, and AUTO guns fight on.**
11. **The scripted gunner powers the autocannon from the spare reactor bar and leaves the guns on AUTO.** The Valkyrn
    bots don't change.
12. **SIM 59 → 60 with the bless pattern.** The authority decides, and the client predicts the turret and the reticle.

## 17. Judgement calls the code forced (owner to check)

1. **The Hound's laser slot is null, not a hidden beam.** This turns off every beam path through the Valkyrn's existing
   no-laser guards. The cost: Science's weak shield frequency (Sci-1 Level 2) no longer affects the Hound, and the Hound
   can't dig rocks with a laser. Only the torpedo breaks rocks. Both are listed as later work (§18).
2. **AUTO pew does point defence first** (the inbound torpedo within 300, before the ship). That's the scripted gunner's
   W-1 priority. The owner's text names only the enemy.
3. **AUTO needs a clear line of sight** (no rock or planet in the way) as well as seen, range and arc, so it doesn't pour
   rounds into rocks.
4. **AUTO fires during the 30 s hold**, as the AUTO beam does today. So AUTO guns end the peaceful start as soon as the
   enemy is seen in range. The alternative is "AUTO holds fire until hostile".
5. **AUTO and the turrets work only while Weapons is attended,** today's seat rule for every crew weapon. A gunner who
   stands up to repair leaves the guns silent.
6. **The 80 % stop has no hysteresis.** The autocannon settles into the cooling-limited rate (about one round per 12.5
   ticks) instead of bursting and pausing.
7. **One `gunsManual` flag for both guns,** since Z always toggles both. There's no per-gun mode.
8. **Selection is held input (`weaponSel`), not sim state,** because only the selected MAN gun follows the reticle. It
   costs a field on the held wire and no hash field.
9. **`pewFire` drops its aim:** the round goes where the turret points.
10. **Muzzles stay on the hull frame and only the round direction turns.** This keeps the Valkyrn's code path verbatim
    (`turret === null`).
11. **Fire-rate bonuses are rounded to integer tables:** the pew is +17 / +25 / +17 / +20 %, the autocannon +25 / +14 /
    +20 / +25 %. Exact +20 % would need a new `PEW_CHARGE_SCALE`, which would change the Hunter's hashed charge units.
12. **The MANUAL torpedo keeps W-3's `holdTurn` band,** not the Helm nose's `aimTurn` band. Its feel and tests stay. Only
    the client path is the Helm's.
13. **After a MANUAL flight, the selection returns from the torpedo to the last gun,** and LMB needs a fresh press. This
    prevents a held button launching again.
14. **E/Q step the torpedo's target room on the Hound,** as on the Flight seat, since there's no laser lock to step.
15. **A/D wrap around the three weapons.**
16. **Ryan's "Missiles auto: fires … as long as there's ammo" is not adopted.** The AUTO torpedo stays W-3's: a lock in
    range, or F / LMB. The owner's decisions keep W-3 and don't mention auto-launch.
17. **The Valkyrn identity test leaves the three new fields out by name.** Their values are asserted zero, so the
    pinned digests can stay.
18. **The 600 u AUTO range for the autocannon,** just under a round's 607 u reach at rest.

## 18. Out of scope / later

- Ryan's **weapon cooling and overcharge**.
- **Sensors extending weapon range and the reticle.**
- The **gas tank** (the owner removed it on 2026-11-19, and Ryan's note is parked).
- **Autopilot**.
- The **AUTO torpedo launching on its own** while ammo lasts (§17.16).
- The **weak frequency** for the Hound's guns, and **rock damage** from pew or autocannon rounds (§17.1).
- **Turret sprites** on the ship art (the map's muzzle lines carry it this pass).
- **Turrets for the Hunter**, and AUTO / MAN for its weapons.
- **Changing the Valkyrn** or its Flight seat.
- The sector (non-duel) mode.

## 19. Build parts

One branch, `w4-weapons-controls`, merged to master once at SIM 60 (§13.3). Each part is planned, built and reviewed in
turn, and gets the owner's look and feel check on the branch. Each part adds an entry to `docs/gates.md`, in the format of
the W-2 and W-3 entries (an Automated box and a Manual box with screenshots).

1. **W-4a: loadout, autocannon and power keys.**
   - What it builds: §2, §5, §6's `pewFire` without the aim (the pew turret stays at 0, so it fires along the nose),
     W/S, A/D and 1 / 2 / 3 selection with the highlight, LMB fire by selection (the autocannon held), and the
     scripted gunner (§12).
   - Gate entry: "W-4a: the Hound's guns". The cards in slot order with the selected one lit; W/S moving bars; holding LMB
     with the autocannon selected (heat rising, OVERHEAT); 1 / 2 / 3 and A/D.
   - Screenshots: the three cards; the autocannon firing with its heat bar.
2. **W-4b: reticle, turrets, AUTO and MAN.**
   - What it builds: §3, §4, the map's arc, muzzle lines and reticle, Z and the shared tag, and online prediction (§11).
   - Gate entry: "W-4b: turrets and AUTO/MAN". The muzzle lines trail the reticle and stop at the arc; Z flips both
     tags; on AUTO both guns track and fire with no input, and the pew shoots a torpedo down; MAN feels quicker.
   - Screenshots: the map in MAN, with the reticle, the selected arc and two muzzle lines; AUTO on solution with the
     bracket.
   - Does the slewing read as "slowly follows"?
3. **W-4c: the mouse-flown torpedo.**
   - What it builds: §7.
   - Gate entry: "W-4c: flying the torpedo". V to MAN, F, then hold LMB and the torpedo swings toward the cursor; let go
     and it holds; AUTO guns keep firing while MAN guns go quiet; when it ends, LMB is the selected gun again.
   - Screenshots: a MANUAL torpedo under LMB steer, with the STEER LMB card.
   - Does it feel like the Helm's steer?
