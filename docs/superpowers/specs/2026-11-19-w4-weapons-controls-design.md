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
`docs/` or `scripts/`. Every number is a starting value, kept in `sim/tactical/tuning.ts`, `sim/tactical/bars.ts` or (the
rock numbers) `sim/tactical/rockTuning.ts`, and tuned in playtest.

The owner answered three of §17's calls on 2026-11-19, and this spec carries the answers: the autocannon breaks rocks
(§5.1), Science's weak frequency boosts pew pew and the autocannon (§5.2), AUTO holds fire during the 30 s hold (§4.3),
and AUTO pew aims only at the enemy ship (§4.2).

## 1. Scope and which ships

- **The Hound** gets everything here: the new loadout, the turrets, AUTO/MAN, the new keys and the mouse-flown torpedo.
- **The Hunter** is unchanged: its laser (`HUNTER_LASER`), its pew (`HUNTER_PEW`, no turret), its torpedo and
  `hunter.ts` keep their code paths (its `ShipInput` literal takes the new defaults, §8). Its fights change only because the crew's weapons do.
- **The Valkyrn** (`VALKYRN_CLASS`) keeps its fixed-forward gun, its Flight seat and its flight, bit for bit
  (`tests/valkyrnIdentity.test.ts`, §13.4).
- **The Valkyrn laser fit** (`VALKYRN_LASER_CLASS`, a developer fit) keeps the beam and W-2's manual laser. It is the
  only crew class that still has the beam, so W-2's code stays in the tree.
- Only the duel. The sector mode is untouched.

## 2. The Hound's loadout

| Slot (`WeaponSlot`) | Weapon | Bars (1 / 2 / 3 / overdrive 4th) | Arc | Damage |
|---|---|---|---|---|
| 0 `Pew` | **Pew pew** (W-1), a main weapon | ticks per third 60 / 45 / 30 / 24 (`PEW_TICKS_BY_BARS`, as now) | ±60° turret | as W-1: a layer (2 on the weak frequency, §5.2), else 1 hull; never a room; stops on rocks |
| 1 `Autocannon` | **The autocannon**: the Valkyrn's gun (`gun.ts`) moved onto the Hound | fire interval 10 / 8 / 6 / 5 ticks | ±30° turret (new) | as the Valkyrn's gun: 8 hits a layer (4 on the weak frequency, §5.2), 12 a hull point, 6 a room level; 4 rounds a rock hp (§5.1) |
| 2 `Torpedo` | **The torpedo**, a main weapon | reload 4 / 6 / 8 / 10 (`TORPEDO_RELOAD_BY_BARS`, as now); 3 bars hit for 2 levels | launch forward, as now | as now |

- **Start power** stays `START_WEAPON_POWER = [1, 0, 1]` (`bars.ts` L70): pew 1, autocannon 0, torpedo 1. The trim order
  (torpedo, then slot 1, then pew, `trimmedWeaponPower` L76) and the 9-bar budget are unchanged.
- **`defs.ts`:**
  - `GunDef` gains `turret: TurretDef | null`, `intervalByBars: readonly (readonly number[])[] | null` (indexed
    `[manual ? 1 : 0][bars]`), `rock: GunRockDef | null` (§5.1) and `weakHitsPerLayer: number | null` (§5.2).
    `PewDef` gains `turret: TurretDef | null`.
  - `TurretDef = { arcSteps: number; traverse: readonly [number, number] }`: the arc in fine heading steps
    (`AIM_STEPS` 65536 to the turn) and the traverse per tick for AUTO and for MAN.
  - `GunRockDef = { roundsPerHp: number; pushPerRound: number }` (§5.1).
  - `GUN` (the Valkyrn's) gets `turret: null, intervalByBars: null, rock: null, weakHitsPerLayer: null`. `PEW` and
    `HUNTER_PEW` get `turret: null`.
  - New `AUTOCANNON: GunDef = { ...GUN, turret: AUTOCANNON_TURRET, intervalByBars: [AUTOCANNON_INTERVAL_BY_BARS,
    AUTOCANNON_MAN_INTERVAL_BY_BARS], rock: { roundsPerHp: AUTOCANNON_ROUNDS_PER_ROCK_HP, pushPerRound:
    AUTOCANNON_ROCK_PUSH }, weakHitsPerLayer: AUTOCANNON_WEAK_HITS_PER_LAYER }` and
    `HOUND_PEW: PewDef = { ...PEW, turret: PEW_TURRET }`.
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
- **Commands:** `laserLock`, `laserCharge`, `laserMode`, `laserFire` and `rockLock {weapon: 'laser'}` are answered
  `unavailable` by today's no-laser rules (`step.ts` L313). The app no longer sends them from the Hound (§9).
  `laserFrequency` is the exception: it now tunes the Hound's guns (§5.2), so its admission (`step.ts` L387) answers
  `unavailable` only on a class with neither a laser nor a turret gun.
- **Engineering's beam tables** (`BEAM_SHOTS_BY_BARS`, `BEAM_RATE_BY_BARS`) stay, read only by the laser fit.
  `laserOffline` for the crew (`beamShots === 0`) is always true on the Hound. It gates only the laser.
- **UI:** the BEAM card, its FIRE (Space) button, the FTL opener's goal glow, the `x2` burst mark and the W-2 dashed aim
  line go from the Hound's Weapons station (§10). The contact window no longer offers a laser pick-up on the Hound. The
  frequency row stays (§10).
- **Two beam jobs move to the guns** (owner 2026-11-19, §17 item 1):
  - **Science's weak shield frequency** (Sci-1 Level 2) now boosts pew pew and the autocannon against shields (§5.2),
    so Science still matters on the Hound.
  - **Rock digging.** The laser's rock target is gone. Autocannon rounds wear and break rocks instead (§5.1). Pew pew
    rounds still stop on rocks with no effect, as today. The torpedo's rock target and blast are unchanged.
- **Telemetry:** `laserReleases` (`sim/duel/telemetry.ts` L26) reads 0 for the Hound. The gates read `pewShots` and
  `gunShots` instead (§14). Neither is in `ShipTelemetry` or `DuelRun` today, so `DuelRun` (`tests/helpers/scriptedDuel.ts`
  L30) gains `pewShots`, `gunShots`, `holdEndTick` and `holdCause` (the final `tactical.hostileAt`, and the `hostile` event's
  `cause`; −1 and `'none'` if the round never turned hostile), read from the final state and the run's events, as `ValkyrnRun` reads
  `gunShots` (`tests/helpers/valkyrnGate.ts`). `ShipTelemetry` is unchanged. `scripts/duel-telemetry.ts` prints them per
  seed for the report.

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
  back to 0, the nose. It slews during the 30 s hold too; only its firing waits (§4.3).
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

**Ship only** (owner 2026-11-19, §17 item 2). Both AUTO guns aim only at that ship. The AUTO pew never aims at a
torpedo, so there is no point-defence priority and no `AUTO_PD_RANGE`. W-1's incidental rule stays: `stepPew` sweeps
every round against the other side's torpedoes in flight, so an AUTO pew round aimed at the ship still shoots down a
torpedo that crosses its path. Autocannon rounds never hit torpedoes (`stepRounds`), as today.

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

Every AUTO rule needs the Weapons console attended, the gun powered (bars ≥ 1) and the enemy hostile
(`enemyHostile(state)`, `science.ts` L29; the hold rule below).
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
  reads AUTO (`HOLD` in the hold).
- **AUTO holds fire during the hold** (owner 2026-11-19, §17 item 4). While `hostileAt` is −1, AUTO guns track and
  slew (§3.4) and can sit on solution, but fire nothing. So AUTO never ends the peaceful start by itself.
  - **The hold ends as it does today** (`hostilityStep`, `science.ts` L36): the crew's first shot of the round (a MAN
    pew or autocannon round, at the enemy, a rock or nothing; or a torpedo launch, AUTO or MAN), or the clock at
    `HOSTILE_AFTER_TICKS` (30 s). A scan does not end it (Sci-1 decision 5). The Hunter's own hold is unchanged.
  - `hostilityStep` runs after `tickWeapons` (`duel.ts` L48), so AUTO opens fire from the tick after the one that ends
    the hold.
  - With no enemy ship (`hunter < 0`, so `hostileAt` stays −1) there is no target either, so the rule changes nothing.
  - The laser fit's AUTO beam is not a turret gun and keeps today's rule: it fires during the hold (the FTL opener).
  - The card's AUTO tag reads `HOLD` while the hold keeps an AUTO gun quiet (§10).

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
- **Unchanged:** heat, the lock, the halved cooling under Weapons damage, the round pool (`GUN_POOL` 64), the sweep in
  `stepRounds`, the room under the closest approach (`gunRoomOf`), the `gunFire` / `gunHit` events and the hostility
  cause `gun`.
- **Changed, for a gun with the new fields only:** a round that meets a rock (§5.1) and a hit on a shield layer on the
  weak frequency (§5.2). On `GUN` both fields are null, so the Valkyrn's rounds take today's branches.
- **Its hit numbers are the Valkyrn's** (`GUN_HITS_PER_LAYER` 8, `GUN_HITS_PER_HULL` 12, `GUN_HITS_PER_LEVEL` 6), copied
  into `AUTOCANNON`. Gate tuning (§12) may move `AUTOCANNON`'s own copies only, never `GUN`'s.
- **Its roles:** the autocannon is the Hound's room damage now. Six unshielded hits raise a room a level, which takes
  over the beam's "take out systems" role (pew pew spec §6 decision 2). It is also the Hound's rock digger (§5.1). Pew
  pew strips shields and does hull damage, and its rounds still shoot down a torpedo in their path (§4.2).

### 5.1 Autocannon rounds break rocks (owner 2026-11-19)

Today a gun round that meets a rock is absorbed: it ends and the rock takes nothing (spike ii §12, `stepRounds`). Spike
ii rejected a laser-style chip because a full laser hit per round (2 damage, `LASER_ROCK_PUSH`) would shred the belt at
10 rounds a second. It also thought a fractional chip needed a per-rock wear field. It doesn't: rock hp is already a
real number in the pool (`rocks.ts`, slot value 6), and the torpedo's blast already leaves fractional hp
(`rockBlast.ts`: 2 + 4 · fall). So the autocannon chips with a fraction and no new state.

- **The rule.** In `stepRounds`, when the first contact along a round's segment is a live rock `k` and the round's gun
  has `rock !== null`:
  1. **push:** `pushRock(k, ux · J, uy · J)` with `J = pushPerRound / rockMass(r)` and (ux, uy) the unit direction of
     the round's segment (old to new position). A static rock wakes, as every push does (§3.1 of spike ii);
  2. **wear:** `hitRock(k, 1 / roundsPerHp, ux, uy, 'gun', owner)`. That pushes the `rock` `hit` event, adds 1 to
     `rockHits`, and at hp ≤ 0 breaks the rock in the fan pattern along the round (`breakRock`), counting `rocksBroken`
     for the owner;
  3. the round ends, as today.
  - Push first, then damage, as the laser's `laserStrikesRock` (`rockWeapons.ts`). A piece born this tick is not in the
    way (`rockBorn`), so a later round this tick passes where a piece was just made, as today.
  - Ties stay as today (`stepRounds`: ship, then rocks by ascending slot, then the planet, each needing a strictly
    smaller entry): a ship wins its ties over a rock, and on an exact rock–planet tie the rock is the contact (and is
    worn). The rock branch runs only when a rock is the first contact.
- **The numbers** (`rockTuning.ts`, beside `LASER_ROCK_DAMAGE`):
  - `AUTOCANNON_ROUNDS_PER_ROCK_HP = 4`: one round wears 1 / 4 = 0.25 hp. A quarter is exact in binary, so the wear
    stays exact and needs no rounding.
  - `AUTOCANNON_ROCK_PUSH = 500`: per round. Four rounds push 2000, the laser's push per hp
    (`LASER_ROCK_PUSH / LASER_ROCK_DAMAGE` = 4000 / 2), so the autocannon moves a rock as hard per hp as the beam did.
    An r 15 rock gains about 2.2 u/s a round and an r 45 rock about 0.25 u/s.
  - **What it takes:** a seeded rock has 2 to 6 hp (`rockHp`, `ceil(r / 10)`), so it breaks in 8 to 24 rounds. In
    MAN at 3 bars (a round every 5 ticks) that is 0.7 to 2.0 s. Holding LMB on a big rock nears the heat lock (§4.4),
    which is the cost of digging with a gun.
- **Who digs.** MAN aim: the gunner holds the reticle on a rock and LMB. AUTO never targets a rock (its line-of-sight
  rule, §4.2, keeps it off rocks, as `AUTO_DIG` false keeps the AUTO beam off them), and there is no `rockLock` for the
  guns. A round that misses the enemy and meets a rock wears it too.
- **Hostility is unchanged:** every round counts in `gunShots`, so shooting a rock during the hold ends it (§4.3), as
  laser shots at rocks do today (spike ii §6.3).
- **`RockCause`** (`state.ts` L170) gains `'gun'`. `vacate` and the rock targets are unchanged.
- **Presentation:** `rockFx.ts` draws the existing `spark` item on a `hit` by `gun` (the `bump` spark, L51).
  `rockSounds.ts` plays nothing for a `hit` by `gun`, so the rounds don't eat the `ROCK_SOUNDS_PER_S` budget. Breaks
  sound and burst as today (`ROCK_CRUNCH`, the split and dust bursts).
- **The Valkyrn stays bit-identical.** `GUN.rock` is null, so its rounds keep the absorbed branch: no push, no wear, no
  event, no `rockHits`. `tests/valkyrnRoundsRocks.test.ts` passes unchanged. The fence is the gun def, so it is a
  per-class rule, not a per-slot one.
- **Pew pew rounds still stop on rocks with no effect** (`stepPew`, W-1's merge rule). The owner's answer names only the
  autocannon.

### 5.2 The weak shield frequency boosts the guns (owner 2026-11-19)

Sci-1 Level 2 reveals the enemy's weak frequency (`TacticalState.weakFreq`, 0..2), and Weapons tunes `ShipSystems.freq`
to A, B or C. Today only the crew laser reads it: on a match a laser hit strips `min(2, shields)` layers instead of 1
(`laserStrike`, `weapons.ts` L172). On the Hound the same match boosts the guns against shields. Hull and room damage
don't change: the frequency is a shield rule.

- **Pew pew:** a crew round that hits a shield layer while `freq === weakFreq` strips `min(2, shields)` layers instead
  of 1 (`pewHit`, `pew.ts` L94). It is Sci-1 decision 6's rule, "2 layers instead of 1", moved from the beam to the
  pew. As any strip, it zeroes `shieldClock` and the gun wear.
- **Autocannon:** while `freq === weakFreq`, a layer goes at `weakHitsPerLayer` hits instead of `hitsPerLayer`:
  `AUTOCANNON_WEAK_HITS_PER_LAYER = 4` against 8 (`bars.ts`, beside the autocannon's interval tables). The same
  doubling as the pew's, as an integer. `gunHit` (`gun.ts`) compares `++gunWear` with the threshold of the moment, so
  retuning mid-wear simply uses the new one. The wear stays below 8, inside today's `gunWear` bound.
- **The fence:** the pew bonus needs the owner to be `CREW_SLOT` and its pew to have a turret (`HOUND_PEW` only). The
  autocannon's needs the owner to be `CREW_SLOT` and its gun to have `weakHitsPerLayer !== null` (`AUTOCANNON` only).
  - This matters: `freq` starts at 0 on every ship and `weakFreq` is 0 in about a third of seeds, so a rule without the
    class fence would change the Valkyrn's gun hits in those seeds. With it, `GUN` and `HUNTER_PEW` keep today's numbers.
  - The laser fit's beam keeps its Sci-1 rule unchanged.
- **Tuning on the Hound:** `laserFrequency {freq}` keeps its name on the wire (it is the crew's shield frequency now). Its
  admission answers `unavailable` only on a class with neither a laser nor a turret gun, so the Hound accepts it and the
  Valkyrn still refuses it. The app sends it from keys 4 / 5 / 6 and the frequency row (§9, §10). `freq`'s state, hash
  field and bound (0..2) are unchanged.
- **The bots:** the scripted gunner doesn't tune (as today). It fights at A, so it gets the bonus in the seeds where
  `weakFreq` is 0, as the beam did.

## 6. Pew pew on a turret (sim, W-4a and W-4b)

- **The round flies along the pew turret's world aim,** not along a clicked point. The muzzle stays at the nose point
  (`pewMuzzle`). Rounds, pool, rocks stopping them and the incidental torpedo hits are W-1's. Damage is W-1's except
  the weak-frequency strip (§5.2).
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
- `laserFrequency {freq}`, unchanged on the wire, now admitted on a turret class too (§5.2);
- the other laser commands stay on the wire for the laser fit.

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
- `IDLE_INPUT` and `UNCREWED_INPUT` (L56, L58) take the defaults, and so does the Hunter's own `ShipInput` literal
  (`hunter.ts` L143: drop `torpTurn`, add `turretAim: -1, weaponSel: -1, pewTrigger: false`), so the Hunter's inputs are
  as today. That literal is the only `hunter.ts` edit.

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
| 4 / 5 / 6 | `laserFrequency` A / B / C: the guns' shield frequency (§5.2) | 4 / 5 tuned frequency B / C; 6 nothing |
| RMB on the map | Pan (as on Science) | The MANUAL torpedo's heading |
| T, G, C, X, Tab, Esc, M, wheel, middle drag | Unchanged | same |

**Clashes and how they're resolved:**
- **1 / 2 against the FTL pick-up.** `contactController.ts` L140 intercepts `WEAPON_CODES` as pick-ups. At the Hound's
  Weapons seat it no longer takes the digits: they select. A card click still picks the torpedo up for a room click,
  and selects it too. The laser fit's 1 / 2 are unchanged.
- **3 against frequency A.** The keyboard does not know the class, and today every Digit3 / 4 / 5 keydown sets `freqTo`
  (`input.ts` L146). So the digits travel as separate `KeySample` fields, and the runtime picks by class:
  - `freqKeyTo?: number`: from `FREQ_CODES` (Digit3 / 4 / 5 → 0 / 1 / 2), as today's key path. It tunes only on a
    class with a laser (the laser fit's Weapons seat and Flight seat); on the gun fit it only raises NO LASER (below).
  - `gunFreqKeyTo?: number`: from a new `GUN_FREQ_CODES = { Digit4: 0, Digit5: 1, Digit6: 2 }`. Read only at the
    Hound's Weapons seat.
  - `selectTo?: number`: from a new `WEAPON_SELECT_CODES` (Digit1..3, Numpad1..3 → 0..2). Read only at the Hound's
    Weapons seat.
  - `freqTo` is now written only by the console's frequency buttons (`ConsoleInput.frequency`), and is read on both.
  - Each is the last such keydown since the previous sample (no repeats), as `freqTo` is today, and `clear` / `clearUi`
    drop them as they drop `freqTo`.
  - The local runtime (the Weapons branch near L521, the Flight branch near L452) and online (`onlineDuel.ts` near L303)
    send `laserFrequency` from `freqKeyTo ?? freqTo` on a laser class, and from `gunFreqKeyTo ?? freqTo` on the Hound.
    So 3 on the Hound selects the torpedo and sends no `laserFrequency`, and 4 tunes A.
  - The gun fit's Flight seat keeps its NO LASER cue for 3 / 4 / 5 (Valkyrn spec §6.1): `runtime.ts` L453 refuses on
    `freqKeyTo ?? freqTo`, and `tests/valkyrnRuntime.test.ts` (L127-L134) holds `freqKeyTo` instead of `freqTo`.
  - `pageGuards.ts` `GUARDED_CODES` adds `GUN_FREQ_CODES` and `WEAPON_SELECT_CODES`. Digit6 and Numpad1-3 have no other
    binding.
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
`weaponSel`. The local runtime (`runtime.ts` `play`, L403) and online (`onlineDuel.ts` `play`, L233) both keep it, and
set it from `KeySample.selectTo`, the A / D press edges and a card click.
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
  - "4 / 5 / 6 at Weapons: tune the guns' shield frequency A / B / C";
  - "Hold left mouse with a MANUAL torpedo flying: steer it".
- The laser fit's frequency row (L84) stays, on `FREQ_CODES`.
- The rows stay built from the input tables (`WEAPON_SELECT_CODES`, `GUN_FREQ_CODES`, `PRESS_CODES`), as the list's
  header requires.
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
    - **In the hold** (§4.3) an AUTO gun's tag reads `HOLD` instead of `AUTO`, so the gunner sees why it is quiet.
  - **The frequency row** (`A B C`, Sci-1 §7.4, `WeaponsStation.tsx` L151-L154) shows on the Hound under the cards, with
    the tuned one lit and the weak one marked after a Level 2 scan, as today. Its buttons send `laserFrequency`; its key
    hint reads 4 / 5 / 6.
  - **TORPEDO:** as now, with its own tag (V). In MAN while it flies it reads `STEER LMB`, not `STEER A/D`.
  - **The bar pips under each card** stay (left click +1, right click −1).
  - **The hint row:** `LMB FIRE · A/D SELECT · W/S POWER · Z AUTO/MAN`. The BEAM refusal and firing texts go, and the
    refusal row names PEW, AUTOCANNON or TORPEDO.
- **The Weapons map** (`render/tactical/weaponsModel.ts` L277-L304, `tacticalLayer.ts` L375):
  - the **selected gun's arc** edges, about the nose (`dim`), replacing the W-1 cone;
  - each gun's **muzzle line** along its real turret angle (`aimDir` of the interpolated turret): the selected gun's
    `mid`, the other's `dim`. The pew's runs to `PEW_RANGE`, the autocannon's to 600;
  - the **reticle** at the pointer, a small cross (`main`);
  - in AUTO, a **bracket on the target** while a gun is on solution (`hot`; `dim` during the hold, when it won't fire);
  - the W-2 dashed laser line is not drawn on the Hound;
  - autocannon rounds as the tracers `roundDraws` already draws for any gun class (`weaponsModel.ts` L276).
- **Sound:** the autocannon uses the Valkyrn gun's fire and hit sounds (the `gunFire` / `gunHit` events), with no new
  sample. Its rock hits and breaks are §5.1's.
- **The Helm and Science maps** draw the muzzle lines `dim` and no reticle.

## 11. Online

- **The authority decides everything.** The turrets, AUTO, firing and the torpedo are all sim state or sim rules. NO
  CHARGE online stays the authority's `unavailable` for a `pewFire` (W-1 review F2, `onlineDuel.ts` L217), and the same
  applies to `gunMode`'s noop and the autocannon's refusals.
- **The held fields** go out in `sessionHeld` (`onlineDuel.ts` L68) at the Hound's Weapons seat: `turretAim`,
  `weaponSel`, `gunHeld`, and `torpHeading` while steering. The held change test (L74) adds them, and drops `torpTurn`.
- **Client prediction:**
  - **The reticle** is local and drawn at once.
  - **The own seat's selected turret** is predicted as the crew Helm's throttle is (playtest2feedback Decision 14,
    `onlineSource.ts` `thrMille`: the replica's value plus the latest sent held frame applied `unackedFrames` times):
    - `predicted = slewTurret` applied `k` times, starting from the replica's turret of the selected gun, with the
      replica's heading (held fixed: the Helm's heading is not predicted), the latest sent `turretAim`, the gun's MAN
      traverse and its `arcSteps`. `k` is `unackedFrames` (capped at `UNACKED_MAX`, as the throttle's).
    - `k` is 0, so the replica's turret is drawn, unless all of these hold: the mode is MAN (`gunModeSent?.manual`, else
      the replica's `gunsManual`); the sent `weaponSel` is a gun (0 or 1) with bars ≥ 1; the seat is the Hound's Weapons
      seat; the latest sent `turretAim` is ≥ 0; and (from W-4c) no MANUAL torpedo flies.
    - The unacknowledged count is in held frames, not ticks, so the prediction may run ahead of the authority by a few
      ticks of slew. That is accepted, as for the throttle: the next replica corrects it, and only the drawn muzzle
      line uses it. Rounds always come from the replica.
    - Its muzzle line draws from it, so the turret answers the mouse with no round-trip lag.
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
  - The gunner can't see a refusal before `weaponPower` is judged in the same tick, so it checks first and sends
    nothing unless all hold: `!barMoved`, `sparesOf(d) ≥ 1`, `capacityOf(d, DuelSystem.Weapons) > ` the Weapons bars
    (`power.ts`, the rules `applyPower` applies), and `weaponBars(sys, WeaponSlot.Autocannon) === 0`. `barMoved` is set
    on the first seated tick either way. So every command it sends is admitted.
- **The guns stay AUTO.** The gunner sends no `pewFire` and no held aim. AUTO's lead (§4.2) aims at the ship as
  `gunnerPew` did. `gunnerPew` and the `laserLock` line no longer run on this class.
  - **No deliberate point defence** (§4.2, owner 2026-11-19). `gunnerPew` shot an inbound torpedo first; the Hound's
    bots don't. Their pew rounds can still hit a torpedo crossing the line to the ship.
- **The torpedo rule** keeps `MISSILE_GAP` and the `torpLock`, without the laser terms: `canLaunch` and the gap.
- **The hold** (§4.3). The AUTO guns are quiet until the enemy turns hostile. The gunner's own move ends the hold
  sensibly: its `torpLock` launches the AUTO torpedo once the enemy is seen and in torpedo range, the launch counts in
  `missilesLaunched`, and the AUTO guns open on the next tick. If the torpedo never gets a launch in the first 30 s,
  the clock ends the hold at rt 1800 as today. The gunner doesn't need to fire a MAN shot, and it doesn't toggle to MAN.
  - Before W-4 the crew's AUTO beam opened during the hold. The Hound's bots now open with the torpedo or at 30 s, which
    can lengthen the opener. The gates (§14) account for it: the per-seed "uses both weapons" test counts over the whole
    round, so it holds whenever the round outlasts the hold. The Hunter can't fire before the hold ends, so only rocks or
    the planet could end a round inside it, and the gate already fails a planet-contact end under 30 s. If a seed ends
    inside the hold, the tuning ladder below applies before any gate changes. The plan's report records each seed's
    hold-end tick and its cause (`hostile` event `missile` or `clock`) beside the aggregate numbers.
- **On any other class** (the Valkyrn in the identity test's "pair" runs), everything stays as on master, byte for byte:
  the pew → beam move, `laserLock` and `gunnerPew`. So `tests/valkyrnIdentity.test.ts` keeps its digests.
- **The gates** (§14): the per-seed gates must pass. The aggregate band (3 to 5 minutes, the crew both wins and loses)
  stays `it.skip` as at SIM 59 (kind c). Its numbers go in the plan's report.
- **The tuning ladder** runs once, at the end of W-4b (§19.1). Its target is at least one crew win over the ten gate
  seeds with every per-seed gate passing. Each rung is tried in order, value by value, with the earlier rungs held at
  their base values; the first setting that meets the target is kept and the ladder stops:
  1. `AUTOCANNON`'s `hitsPerHull`: 12 (base), 10, 8, 6;
  2. `AUTOCANNON_AUTO_RANGE`: 600 (base), 450;
  3. `MISSILE_GAP`: the base, then −25 % and −50 % (rounded to whole ticks);
  4. the gunner's bar move: autocannon +1 (base), then also pew −1 and autocannon +1 more (0 / 2 / 1), each command admitted
     by the same pre-check.
  - If no setting meets the target, the base numbers ship, and the report records the whole sweep (each setting's wins
    and per-seed results). The owner then decides.
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

- **The new arithmetic is integer:** turret offsets, rates, tables, the heat stop, the weak-frequency threshold. The one
  real number is the rock wear, 1 / 4 hp a round, exact in binary, on a pool that already holds real hp; its push is
  `J / m` with + − × ÷, as the laser's. `aimDir` (`dirBetween`: + − × ÷,
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

W-4a, b and c are built on one branch and merge once at SIM 60 (§19). Steps 1, 2 and 4 also run at the end of each part that moves a whole run, and step 3 runs once, at the end of W-4c (§19.1).

### 13.4 What stays bit-identical

- **The Valkyrn:** `tests/valkyrnIdentity.test.ts`'s five digests do not change.
  - Its digest hashes `flattenTactical` (`tests/valkyrnIdentity.test.ts` L29), which now also holds the three new
    fields. They are always 0 / false on the Valkyrn, so the test leaves them out by name: it builds the hashed array
    from `TACTICAL_MODULES`' fields in their order, skipping `systems.*.pewTurret`, `systems.*.gunTurret` and
    `systems.*.gunsManual`, so the array equals SIM 59's `flattenTactical` element for element. (No field is left out
    today; this is new.)
  - A new assertion in the same runs checks they stay 0 / false.
  - The Valkyrn's gun takes the `turret === null` branch everywhere, and its interval is `GUN.intervalTicks`.
  - Its rounds take the `rock === null` branch (absorbed, §5.1), and its layer threshold stays `hitsPerLayer` because
    `GUN.weakHitsPerLayer` is null (§5.2), whatever `freq` and `weakFreq` are. `laserFrequency` stays `unavailable`
    on it. `tests/valkyrnRoundsRocks.test.ts` passes unchanged.
- **The Hunter:** no rule or number changes. Its pew has no turret, so the weak-frequency strip never applies to it.
  `tests/pewHunter.test.ts`, `tests/torpedoGuidance.test.ts` and the Hunter's unit tests pass unchanged.
  - New `tests/w4HunterIdentity.test.ts`: `hunterThink`'s outputs over a fixed scripted crew trajectory (state written
    directly, no crew weapons) match a digest recorded at SIM 59 on master.
- **The laser fit:** its rules are unchanged. Its AUTO beam still fires during the hold, and its laser keeps Sci-1's
  frequency rule.
  - Today W-2's `tests/manualLaser*.test.ts` build the Cutter (`createTacticalState(5)` with the default classes,
    `parseShip(cutter)`, `createSeatedDuel`), not the laser fit. W-4 ports them to `VALKYRN_LASER_CLASS` by its class
    argument (§14.1), and they must then pass with their assertions unchanged except the class.
  - **The laser class's Weapons-seat path is kept.** The laser fit ships only on the Valkyrn layout's Flight seat
    (`main.ts` L132), but the runtime's and online's Weapons-seat laser branch (`laserMode`, `laserFire`, `laserCharge`,
    E / Q laser lock, 3 / 4 / 5) stays, reached on a class with a laser at a Weapons seat: the Hound layout with
    `cls = ShipClass.ValkyrnLaser` (`createDuel`'s and the runtime deps' `cls`). This developer combination is what W-2's
    app tests run on.

## 14. Tests

Each rule gets a test. File names are suggestions, prefixed `w4`.

- **Loadout** (`w4Loadout.test.ts`):
  - the Hound's slots: pew with a turret, `AUTOCANNON`, the torpedo, no laser;
  - the start power 1 / 0 / 1;
  - the trim order takes the autocannon's bar before the pew's;
  - the Valkyrn's `GUN` and the Hunter's pew have no turret;
  - every laser command from the Hound except `laserFrequency` is `unavailable`;
  - Space at the Hound's Weapons seat queues nothing.
- **Autocannon** (`w4Autocannon.test.ts`):
  - the interval by bars, AUTO 10 / 8 / 6 / 5 and MAN 8 / 7 / 5 / 4, measured between `gunFire` events;
  - 0 bars fires nothing;
  - the heat and lock as the Valkyrn's, with Weapons damage halving the cooling;
  - rounds leave along the turret with the ship's velocity added;
  - the twin muzzles alternate on the hull;
  - hits as `gunHit`, with a room level after 6 unshielded hits.
- **Rocks** (`w4Rocks.test.ts`):
  - an autocannon round that meets a rock wears it 0.25 hp, pushes it 500 / m along the round (waking a static rock),
    pushes one `rock` `hit` event with `by: 'gun'` and the owner, and adds 1 to `rockHits`;
  - a rock of r 15 (2 hp) breaks on the 8th round, in the fan pattern along the round, and the owner's `rocksBroken`
    rises by 1;
  - a piece born this tick is not hit by a later round in the same tick;
  - a ship wins an exact tie over a rock (no wear), and a rock wins an exact tie over the planet (worn);
  - pew pew rounds still stop on a rock with no wear, push or event;
  - the Valkyrn's rounds are still absorbed (`tests/valkyrnRoundsRocks.test.ts`, unchanged);
  - a MAN round at a rock during the hold ends the hold with cause `gun`;
  - the view: `rockFx` draws a spark for a `gun` hit and `rockSounds` plays nothing for it.
- **Weak frequency** (`w4Frequency.test.ts`):
  - on the Hound, `laserFrequency` is admitted (seat, malformed, noop as today); on the Valkyrn it is `unavailable`;
  - a crew pew round on a shield layer strips 2 layers at `freq === weakFreq` (1 when one is up), else 1; hull hits are
    unchanged;
  - the autocannon strips a layer at the 4th hit on the weak frequency and the 8th off it; changing `freq` mid-wear uses
    the new threshold;
  - the Hunter's pew and the Valkyrn's gun keep 1 layer and 8 hits with `freq === weakFreq` forced on their slots;
  - 4 / 5 / 6 at the Hound's Weapons seat send `laserFrequency` 0 / 1 / 2; 3 selects the torpedo and queues no
    `laserFrequency`; on the laser fit 3 / 4 / 5 still send 0 / 1 / 2; the row's buttons send it on both, and the weak
    mark shows after a Level 2 scan.
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
    third charged; it never aims at a torpedo, even an inbound one within 300; a torpedo crossing the line of a round
    aimed at the ship is still shot down;
  - **the hold:** with `hostileAt` −1 both AUTO guns slew onto solution and fire nothing over the hold, the tag reads
    `HOLD`; the first AUTO round comes on the tick after a MAN shot, a torpedo launch or the clock ends the hold; the
    laser fit's AUTO beam still fires during the hold. Tests that check AUTO firing set `hostileAt` first;
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
  - with `unackedFrames = k` (k = 0, 1, 5, 30), a fixed heading and the same held frame, the predicted turret equals the
    authority's turret after `k` stepped ticks from the same start;
  - `k` is treated as 0 in AUTO, at 0 bars, with the torpedo selected and with no reticle;
  - a `gunMode` in flight (`gunModeSent`) sets the traverse before the replica shows the new mode;
  - NO CHARGE comes from the authority's `unavailable`.
- **Scripted and gates:**
  - the gunner's first tick sends `shipPower` then `weaponPower` and ends at 1 / 1 / 1;
  - on the Hound the gunner sends no `pewFire`, no `gunMode` and no laser command; its AUTO guns fire nothing before the
    `hostile` event, and the hold ends by its torpedo launch or the clock;
  - the Valkyrn pair's commands are unchanged;
  - **kind (a):** `tests/duelScripted.test.ts`'s whole-duel "every command admitted" test keeps its every-applied check,
    and its pinned kinds list becomes the Hound's: `shipPower` in, `laserLock` out (W-4a also has `pewFire` from the
    stand-in, §19.1; W-4b removes it). The seed may be re-picked (kind b) so the run still uses every kind;
  - **kind (a):** `tests/duelGates.test.ts`'s per-seed "the crew uses both weapons" becomes
    `pewShots + gunShots ≥ 1` and `missilesLaunched ≥ 1` (was `laserReleases ≥ 1`), and the same in
    `tests/duelScripted.test.ts`;
  - the aggregate gate stays skipped (kind c), its numbers reported with each seed's hold-end tick and cause (§12).
- **Identity:** §13.4's three.

### 14.1 Existing tests that assume the Hound's beam

About 60 test files send a laser command, read `laserReleases` or `WeaponSlot.Beam`, or call `todaysCrewWeapons`, and
most build the Cutter by default. Each is handled by one of these rules, and W-4a's plan lists every file with its rule
(from `grep -rln "laserLock\|laserFire\|laserCharge\|laserMode\|laserReleases\|WeaponSlot.Beam\|todaysCrewWeapons\|freqTo\|FREQ_CODES" tests/`,
then each file read to confirm the beam is the crew's, not the Hunter's):
- **The key path:** `tests/scienceInput.test.ts` (L38-L44) is ported: its Digit3 / Digit5 keydown asserts move to
  `freqKeyTo`, its console `ui.frequency` asserts stay on `freqTo`, and new asserts cover Digit4-6 → `gunFreqKeyTo` and
  Digit1-3 / Numpad1-3 → `selectTo`, with the repeat, `clear` and `clearUi` cases.
- **Port (the beam's own rules):** a test of the crew beam's rules (charge, bursts, locks, MANUAL laser, rock digging,
  the frequency strip, laser commands' admission) builds the laser fit instead: `createTacticalState(seed, slots,
  ShipClass.ValkyrnLaser)`, `createDuel(layout, seed, helm, crew, ShipClass.ValkyrnLaser)` or the runtime deps' `cls`.
  Its assertions stay. Where a number moves only because the laser fit flies `FIGHTER` or has another hull, that number
  is re-pinned (kind b) with the reason in a comment.
- **Kind (a), replaced rule:** a test that pins the Hound fighting with a beam is rewritten for the Hound's new weapons or
  deleted, naming W-4 in the commit:
  - the FTL opener's goal glow and the BEAM card on the Hound's Weapons station;
  - `tests/duelScripted.test.ts`'s `gunnerPew` tests ("defence first", the spacing test): no class keeps that rule (§12);
  - the scripted whole-duel kinds list (§12);
  - the per-seed "uses both weapons" gate (§14).
- **The helper:** `tests/helpers/crewWeapons.ts` `todaysCrewWeapons` keeps its meaning for the laser fit (beam 2 bars).
  A test that calls it on the Hound is ported (above). A sibling `houndWeapons(st, [pew, autocannon, torpedo])` sets the
  Hound's bars for the new tests.
- **Kind (b), whole-run pins:** the trajectory-pinned tests (`duelCheckpoint`, `duelSnapshot`, `duelModules`'s
  `played(…)`, `tacticalSlots`, `duelScripted`, `duelGates`) and the goldens are re-picked or re-blessed (§13.3).
- **Unchanged:** a test whose laser under test is the Hunter's, or that only checks a laser command is `unavailable` on a
  no-laser class, stays as it is.

### 14.2 Final checks

- **Final checks:** `npm run typecheck`, `npm test`, `npm run test:determinism` and `npm run build`.

## 15. What changes for whom

| | Crew Hound (`cutter`) | Hunter | Valkyrn (gun) | Valkyrn laser fit |
|---|---|---|---|---|
| Loadout | pew (turret ±60°), autocannon (turret ±30°), torpedo; no beam | unchanged (laser, pew, torpedo) | unchanged (fixed gun, torpedo) | unchanged (beam, torpedo) |
| Slot-1 bars | autocannon interval 10 / 8 / 6 / 5 | none | ignored, as now | beam shots and charge, as now |
| AUTO / MAN guns | new (Z, both together; start AUTO) | always auto (its own AI) | none (`gunMode` `unavailable`) | none; W-2 `laserMode` on Z |
| AUTO in the 30 s hold | tracks, holds fire (`HOLD`) | holds, as now | no AUTO | AUTO beam fires, as now |
| AUTO targets | the enemy ship only; no torpedo-first | its own AI, unchanged | — | unchanged |
| Rocks | autocannon rounds wear 1/4 hp and break rocks; pew rounds stop with no effect | unchanged | gun rounds absorbed, as now | beam digs, as now |
| Weak frequency | pew strips 2 layers, autocannon 4 hits a layer; tuned on 4 / 5 / 6 | none | none (`laserFrequency` `unavailable`) | beam strips 2, as now (3 / 4 / 5) |
| Reticle and turrets | new (mouse, slew, muzzle lines) | none | none (the nose aims) | none |
| LMB at Weapons | fire the selected weapon / steer a MANUAL torpedo | — | the Flight seat's gun, unchanged | unchanged |
| A/D, 1 / 2 / 3, W/S at Weapons | select, select, power | — | Flight seat unchanged | Flight seat unchanged |
| Manual torpedo | mouse-steered (LMB), no A/D or right drag | none | unchanged rules (no MANUAL flight on the Flight seat) | unchanged |
| Bots | gunner powers the autocannon, AUTO guns open after the hold; no point defence | `hunter.ts` unchanged | pilot and pair bit-identical | — |
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
6. **AUTO guns** slew and fire with lead at a seen, hostile enemy ship in range and arc. The pew fires on each charged
   third. The autocannon stops at 80 % heat. LMB does nothing on an AUTO gun, and W/S still work.
7. **MAN gets +25 % traverse and about +20 % fire rate,** as integer tables.
8. **The traverse rates** are pew 364 / 455 and autocannon 273 / 341 fine steps a tick (§3.3).
9. **The MANUAL torpedo is flown by LMB toward the cursor.** Releasing holds the heading. W-3's flight numbers stay, A/D
   and the right drag are removed, and the camera follows.
10. **While a MANUAL torpedo flies, MAN guns neither aim nor fire, and AUTO guns fight on.**
11. **The scripted gunner powers the autocannon from the spare reactor bar and leaves the guns on AUTO.** The Valkyrn
    bots don't change.
12. **SIM 59 → 60 with the bless pattern.** The authority decides, and the client predicts the turret and the reticle.
13. **Autocannon rounds break rocks** (owner 2026-11-19). Each round wears 1 / 4 hp and pushes 500 / m; a rock breaks in
    the fan pattern at 0 hp. Pew pew rounds and the Valkyrn's gun rounds still stop on rocks with no effect.
14. **Science's weak frequency boosts the Hound's guns** (owner 2026-11-19). On a match a pew round strips 2 layers
    and the autocannon strips a layer in 4 hits instead of 8. Tuned with 4 / 5 / 6 or the frequency row.
15. **AUTO holds fire during the 30 s hold** (owner 2026-11-19). It tracks; the hold ends as today.
16. **AUTO pew targets only the enemy ship** (owner 2026-11-19). Its rounds can still hit a torpedo in their path.

## 17. Judgement calls the code forced (owner to check)

Items 1, 2 and 4 were answered by the owner on 2026-11-19. The rest are open.

1. **The Hound's laser slot is null, not a hidden beam.** This turns off every beam path through the Valkyrn's existing
   no-laser guards. The cost was that Science's weak shield frequency (Sci-1 Level 2) no longer affected the Hound, and
   the Hound couldn't dig rocks with a laser.
   **Owner 2026-11-19: "Autocannon breaks rocks."** The laser slot stays null. Autocannon rounds wear and break rocks
   (§5.1: 4 rounds a hp, 500 push a round), and the weak frequency boosts pew pew (2 layers a strip) and the autocannon
   (4 hits a layer instead of 8) instead of the beam (§5.2). Both are fenced by class, so the Valkyrn stays bit-identical.
2. **AUTO pew did point defence first** (the inbound torpedo within 300, before the ship), the scripted gunner's W-1
   priority. The owner's text names only the enemy.
   **Owner 2026-11-19: "No, ship only."** AUTO pew aims only at the enemy ship (§4.2). Its rounds still shoot down a
   torpedo in their path, by W-1's sweep. The Hound's bots lose `gunnerPew`'s torpedo priority with it (§12).
3. **AUTO needs a clear line of sight** (no rock or planet in the way) as well as seen, range and arc, so it doesn't pour
   rounds into rocks.
4. **AUTO fired during the 30 s hold**, as the AUTO beam does today, so AUTO guns would end the peaceful start as soon
   as the enemy was seen in range. The alternative was "AUTO holds fire until hostile".
   **Owner 2026-11-19: "AUTO holds fire during the hold."** AUTO guns track and slew but don't fire until `hostileAt` is
   set (§4.3). The hold ends as today: a crew shot (a MAN round or a torpedo launch) or the 30 s clock. The scripted
   gunner opens with its torpedo or waits for the clock (§12).
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
- **Rock damage from pew pew rounds** (they still stop on rocks with no effect; only the autocannon digs, §5.1).
- **A gun rock target** (`rockLock` for the guns) or AUTO digging; the autocannon digs by MAN aim only.
- **Turret sprites** on the ship art (the map's muzzle lines carry it this pass).
- **Turrets for the Hunter**, and AUTO / MAN for its weapons.
- **Changing the Valkyrn** or its Flight seat.
- The sector (non-duel) mode.

## 19. Build parts

One branch, `w4-weapons-controls`, merged to master once at SIM 60 (§13.3). Each part is planned, built and reviewed in
turn, and gets the owner's look and feel check on the branch. Each part adds an entry to `docs/gates.md`, in the format of
the W-2 and W-3 entries (an Automated box and a Manual box with screenshots).

1. **W-4a: loadout, autocannon and power keys.**
   - What it builds: §2, §5 with its rocks (§5.1) and the weak frequency (§5.2, keys 4 / 5 / 6 and the row), §6's
     `pewFire` without the aim (the pew turret stays at 0, so it fires along the nose), W/S, A/D and 1 / 2 / 3
     selection with the highlight, LMB fire by selection (the autocannon held), and the scripted gunner's bar move
     (§12) with the W-4a stand-in pew rule (§19.1). AUTO and its hold arrive in W-4b.
   - Gate entry: "W-4a: the Hound's guns". The cards in slot order with the selected one lit; W/S moving bars; holding LMB
     with the autocannon selected (heat rising, OVERHEAT); 1 / 2 / 3 and A/D; the autocannon chipping and breaking a
     rock; after a Level 2 scan, tuning to the weak frequency and pew pew taking 2 layers.
   - Screenshots: the three cards; the autocannon firing with its heat bar; a rock breaking under autocannon fire.
2. **W-4b: reticle, turrets, AUTO and MAN.**
   - What it builds: §3, §4, the map's arc, muzzle lines and reticle, Z and the shared tag, and online prediction (§11).
   - Gate entry: "W-4b: turrets and AUTO/MAN". The muzzle lines trail the reticle and stop at the arc; Z flips both
     tags; in the hold AUTO guns track with `HOLD` on their tags and fire nothing; once hostile, on AUTO both guns track
     and fire at the ship with no input; MAN feels quicker.
   - Screenshots: the map in MAN, with the reticle, the selected arc and two muzzle lines; AUTO on solution with the
     bracket.
   - Does the slewing read as "slowly follows"?
3. **W-4c: the mouse-flown torpedo.**
   - What it builds: §7.
   - Gate entry: "W-4c: flying the torpedo". V to MAN, F, then hold LMB and the torpedo swings toward the cursor; let go
     and it holds; AUTO guns keep firing while MAN guns go quiet; when it ends, LMB is the selected gun again.
   - Screenshots: a MANUAL torpedo under LMB steer, with the STEER LMB card.
   - Does it feel like the Helm's steer?

### 19.1 What each part leaves on the branch

Each part must build, typecheck and pass the full suite on its own, in order. The rules below say what holds between
parts.

- **The goldens at each part's end.** Any part that moves a whole run re-blesses `tests/golden/duel-1.json`,
  `duel-rematch.json` and the determinism fixture at SIM 59 (a same-version bless, as 54d5825d did), as its last task.
  The kind (b) re-picks (§14.1) go in the same task. The SIM 59 → 60 bump (§13.3 step 3) runs once, at the end of W-4c.
- **The per-seed gates at each part's end.** `tests/duelGates.test.ts`'s and `tests/duelScripted.test.ts`'s per-seed
  gates (with W-4a's kind (a) change to "uses both weapons", §14) must pass at the end of every part. None is skipped
  between parts. The aggregate stays `it.skip`. The tuning ladder (§12) runs only at the end of W-4b, once AUTO exists.
- **W-4a (no mode yet).** `gunsManual`, `pewTurret` and `gunTurret` are W-4b's state, so in W-4a:
  - `AUTOCANNON` and `HOUND_PEW` carry their full defs (both interval rows, both turrets), but the sim reads only row 0
    (`AUTOCANNON_INTERVAL_BY_BARS`) and fires along the nose (`fireRound`'s turret aim is the heading).
  - `pewFire {}` is admitted as MAN will admit it: stale-tick, `not-at-weapons`, `unavailable` without a pew, the noop,
    then `pewReady`. There is no AUTO refusal yet. The round flies along the nose. `pewGain` reads `PEW_TICKS_BY_BARS`.
  - LMB held with the autocannon selected sends `gunHeld`, and the autocannon fires at row 0's interval.
  - **The scripted gunner** makes §12's bar move. It has no AUTO guns yet, so it keeps a stand-in pew rule:
    `gunnerPew`'s ship branch (seen, within `PEW_RANGE`, inside the nose's ±60° cone, `pewReady`, `SCRIPTED_PEW_GAP`)
    sends `pewFire {}`, and the round flies along the nose. It has no torpedo-first branch. W-4b deletes the stand-in.
  - A MANUAL torpedo still flies by W-3's rules: while it flies, A / D steer it (W-3) and do not select, and the right
    button gives it a heading. W-4c changes both (§7).
- **W-4b.** It adds the state, the turrets, the mode, AUTO and MAN, and the online prediction. The flight rules of §7
  ("The guns while it flies") are W-4c's: in W-4b a MANUAL torpedo in flight does not stop the guns, and A / D still
  steer it.
- **W-4c.** It adds §7, including `pewFire`'s `missile-in-flight` refusal, and then the SIM bump.
