# The Valkyrn: a solo test ship that flies like a fighter (design, 2026-11-18)

## 1. Goal

Owner, 2026-11-18: "I want to build a new ship ... a ship that will work well in single player. I want to combine weapons
and helm into one role, basically the helm for the valkyrn will have missiles and a mini gun type weapon. It will fly and
fight like a fighter jet. And I want the mini gun weapon to have an elite dangerous feel to it, so an aiming reticle that
you have to lead in the direction the enemy is moving in."

And: "the valkyrn will also have the same science and engineering features as the hound. The hound is our multiplayer
ship right now but I want something that I can pilot/ play myself so that I can test out certain features without another
player so it needs to be able to test the latest features that we add to the hound/ rest of the game."

So the Valkyrn is the **solo test ship**: the same Hunter duel, every Hound feature, one player, flown like a fighter.

## 2. Owner decisions (fixed)

1. **Same game.** The Hunter duel in the gravity-well map, unchanged. Not a new mode, not waves.
2. **Mouse aim.** The nose turns toward the mouse cursor; W/S throttle; left mouse fires the minigun, right mouse fires
   a missile. (Not keyboard turning, not both.)
3. **Walkable interior**, built from the Valkyrn deck plan, like the Hound.
4. **Fixed minigun with a lead pip** (Elite Dangerous fixed weapons). No gimbal.
5. **Feature parity with the Hound**: Science, Engineering, repair, fire, crew health, airlocks, the enemy window, the
   console feel features, and whatever is added to the Hound later.
6. Single player only for now. Multiplayer stays on the Hound.

## 3. The rule: ships differ only in data

- The Valkyrn runs the same duel code as the Hound (`sim/duel/*`, `sim/tactical/*`, the runtime, the views). What
  differs is data: the layout JSON (with four new optional fields, §3.1), the painted art, the repair points, the map
  silhouette, and the ship class (flight and weapon numbers).
- No code may branch on a layout id or class id. Behaviour that differs comes from a field on the layout or the class.

### 3.1 New layout fields (`sim/ship/schema.ts`, optional, absent on the Hound)

| field | type | meaning | Hound | Valkyrn |
|---|---|---|---|---|
| `shipClass` | class id string, resolved through `SHIP_CLASSES` | the crew slot's class | absent = `cutter` | `valkyrn` |
| `crew` | 1..4 | a fixed crew size; absent = any size the caller asks for (2..4) | absent | 1 |
| `helmHoldsUnattended` | boolean | the crew ship flies its throttle and held heading while the Helm is empty (§4.4) | absent = false | true |
| `hull` | `HullId` | the console-map silhouette (§4.5) | absent = `hound` | `valkyrn` |

### 3.2 The no-id-literal test

`tests/noShipIdLiterals.test.ts` greps `src/renderer/src/**/*.{ts,tsx}` for the quoted ids `'hound'`, `'cutter'`,
`'valkyrn'`, `'valkyrnLaser'`, `'scout'` (and the double-quoted forms). Allowed files: `sim/ship/*.json`,
`sim/tactical/defs.ts`, `sim/duel/tuning.ts`, `render/battlemapModel.ts`, `render/tactical/hullModel.ts`,
`render/assetNames.ts`, `sim/ship/fleet.ts`, `render/credits.generated.ts`. The ai profile value `'hunter'` is not a
class id and is not in the pattern (the Hunter's class id stays `hunter`; `ai === 'hunter'` stays legal). The sites
that read ids today are fixed in the build:
- `hullFor(crew)` (hullModel.ts) takes the hull id from the layout's `hull` field (crew ship) or `'scout'` (enemy);
- `hudModel.ts` `!== 'cutter'` reads a layout field instead (the plan names which);
- `fleet.ts` `shipForCrew` stays the online and Hound default; the single-player picker (§9) supplies the layout.

### 3.3 Parity test

`tests/shipParity.test.ts`: for each ship in the single-player picker, every station kind, room system, tactical repair
point (one per tactical Room), at least one airlock, and a breach site per room with a system that the Hound has, the
Valkyrn has too. A feature that adds a station kind or a system to the Hound fails this test until the Valkyrn gets it.
Allowed differences: Navigation and Weapons are one combined seat (§5); rooms with `system: null` are not compared.

## 4. The ship and its interior

### 4.1 Art and licence

- File: `4213598-Valkyrn v1 16x16.png` (2240×2240, 140 px per 5-ft square, transparent background) from the owner's
  `Downloads\battlemaps\34745`, the same 2-Minute Tabletop source as the Hound. Licence CC BY-NC 4.0, as the Hound.
- Out of git like the other bought art: `art/import.json` gains the entry and `npm run art:import` copies it to
  `public/assets/paid/2mt/valkyrn.png`. The manifest entry is committed with the licence, store, credit ("Valkyrn by
  2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0") and the modification "rotated 90° clockwise". The existing
  `docs/gates.md` 2-Minute Tabletop line names the Valkyrn too. New optional asset `ship.valkyrn.map`.
- Rotated 90° clockwise so the nose faces right like the Hound's (import gains `rotate: 90`, beside `flipX`).
- When the asset is missing the interior falls back to procedural tiles, as the Hound does.

### 4.2 Grid

- As the Hound (Hound battlemap spec §1): one map square is 2 tiles, offset half a tile so painted square boundaries fall
  on tile centres; painted walls run through rows of `#`; doors sit in painted wall gaps. After rotation the pressurised
  hull (cockpit to ramp) is about 12 squares long and 2.5 wide: a layout of about 25 × 7 tiles. The plan pins the exact
  numbers after tracing.
- `BATTLEMAPS.valkyrn` (battlemapModel.ts) gives the name, px per tile, origin and painted bounds (alpha bounding box,
  wings and engines), which feed the duel camera fit, as the Hound's do.

### 4.3 Rooms (Hound room → Valkyrn room)

| Hound | Valkyrn (front to back in the painting) | Systems and stations |
|---|---|---|
| Bridge (B) | **Cockpit**: the two pilot chairs | `navigation` + `weapons` as one **Flight** seat (front chair) |
| Ops (O) | **Ops**: the room with two chairs facing the console | `science` system; the Science / Engineering / Doors console group, as the Hound's |
| Medbay (M) | **Quarters, bunk side** | `medbay` |
| Life Support (L) | **Quarters, galley and washroom side** | `lifeSupport` |
| Engines (E) | **Missile bay, ramp half** | `engineering` |
| Reactor (R) | **Missile bay, rack half** | `reactor` |
| Quarters (Q), Hold (H) | none | (`system: null` rooms; parity does not compare them) |

- Repair points, one per tactical Room (`DUEL_REPAIR_POINTS.valkyrn`): Weapons in Ops (as the Hound's is in Ops),
  Shields in the Reactor, Engines in Engines, each on an open floor tile.
- Airlocks: the ramp (Engines) and one hull door; breach sites one per room on an outer wall tile; allocations copied
  from the Hound. Station tiles sit on the painted furniture. Spawn: the Ops floor.
- Tokens, console markers and the painted layer draw exactly as on the Hound (Hound battlemap spec §§3–5); the
  `battlemapLayer` takes its entry from `BATTLEMAPS[layout.id]`, not a Hound constant.

### 4.4 Crew of one

- Signatures: Sci-2's `createDuel(layout, seed, helmPlayer = 0, crew = 2)` gains a fifth argument,
  `createDuel(layout, seed, helmPlayer = 0, crew = 2, cls?: number)`; `startRound` and `loadDuelSnapshot` pass all five.
  `createTacticalState(seed, slots = DUEL_CLASSES.length, crewClass = ShipClass.Cutter)` gains a third.
- The crew size has one source: `createDuel`'s `crew` argument (1..4). When the layout has `crew`, the argument must
  equal it (else it throws). The Valkyrn always runs with crew 1; the Hound keeps 2..4 (Sci-2).
- Widened validations, all local: `createDuel` accepts 1..4; the snapshot header's `playerCount` 1..4; the single
  player `DuelInit.playerCount` 1..4. Online keeps 2..4 (the host form and the network producers reject 1); the codec
  limit stays 4.
- The rules at n = 1: the round is lost when the one character is downed (Sci-2's "every character downed"), or the hull
  is gone. Revive needs a teammate, so it never happens at n = 1. Repair and extinguish use the solo rate.
- Runtime at n = 1 (`app/duel/runtime.ts`): no first-tick `presence false` for another player, no `other` character, no
  Tab character swap (Tab still toggles the console and the ship view while seated), `held` has length n. The readout's
  crew list has no rows at n = 1.
- **Out of the seat** (`helmHoldsUnattended`, true on the Valkyrn): while no present character attends the Helm, the crew
  ship flies `throttleThrust(d.throttle)` and, when `holdHeading ≥ 0`, `headingTurn` toward it (else no turn). The pilot
  can stand up to repair and the ship keeps flying the last bearing and throttle. With the field false (the Hound) an
  empty Helm flies zero axes as today, so the Hound's goldens and duelGates are unchanged. Weapons auto-fire still needs
  the seat attended (unchanged rule).
- Build order: after Sci-2 merges (it owns crew n > 2 and SIM 51 → 52); the Valkyrn takes the next version.

### 4.5 Map silhouette

- `HullId` gains `valkyrn`: an outline traced from the painting's exterior (fuselage, wings, tail; in ship units, only the
  coordinates in git, as the Hound's) with three room polygons in `ROOM_NAMES` order placed over the deck plan (Weapons:
  Ops; Shields: the bay's rack half; Engines: the ramp half). The enemy window and the console maps draw it for the crew
  ship when the layout's `hull` is `valkyrn`.

## 5. The Flight console (one seat for Helm and Weapons)

- The layout lists the `navigation` and `weapons` stations on one tile in one console group
  (`consoleGroups: [{ tile, kinds: ["navigation", "weapons"] }]`), as the Hound's Ops group seats one character at
  Science, Engineering and Doors. `createDuel`'s check becomes: Navigation and Weapons in different groups, **or** the
  crew is 1. Sitting at the group seats the character at both stations, so every rule that asks "is the Helm attended" or
  "is Weapons attended" is true for that pilot: auto-face, throttle, laser/torpedo auto-fire, torpedo lock, the scan rate
  from the Helm or Weapons.
- The view is the Helm map, centred on the own ship, with the auto-frame (Feel-i) keeping the Hunter on screen
  (zoom clamped 0.25–1). On top of it: the crosshair and lead pip (§7.3), the heat bar, and the Weapons console's side
  tools: the weapon cards (§8), the enemy window with FTL room targeting, the 360 torpedo circle and the lock tone.
- The status sentence, refusal flashes, pings, collision warning, gravity rings and EVADE arrow all show, as on the Helm.

### 5.1 Flight seat bindings

| input | action |
|---|---|
| mouse position over the map | `aim` (§6.2) |
| left mouse (held) | `gunHeld` (§7.1); with the laser fit (§8), nothing (the laser auto-fires at its target) |
| right mouse | torpedo launch (`missileLaunch`) |
| Space (held) | auto-face (`face`), as on the Helm |
| W/S, mouse wheel over the throttle, Shift+W | throttle, as on the Helm |
| Q/E | step the torpedo's target room |
| 2 / clicking the TORPEDO card | pick up the torpedo (FTL targeting); 1 / the LASER card only with the laser fit |
| 3/4/5 | laser frequency, only with the laser fit |
| middle click, G | ping |
| middle drag | pan |
| Tab | console ↔ ship view |

There is no click-to-heading on the Flight seat: the right button is the torpedo, so the Flight seat never sends
`heading`, and the view has no HDG marker (the aim bearing is the cursor).

## 6. Flight (sim)

### 6.1 The Valkyrn class

New `ShipClassDef` entries in `defs.ts`: `valkyrn` (gun) and `valkyrnLaser` (the developer laser fit, §8), appended to
`SHIP_CLASSES` so existing class indices do not move. Start values, tuned in §10:

| | Hound (Cutter class) | Valkyrn |
|---|---|---|
| hull | 40 | 30 |
| thrust (u/s²) | 120 | 160 |
| turn (°/s) | 150 | 200 (turnStepsPerTick ≈ 2.37) |
| shields | 2 layers | 2 layers |
| slots | laser (×2) + torpedo | gun + torpedo (`valkyrnLaser`: the Cutter's laser + torpedo) |
| radius | 20 | 20 |

- `slots` becomes `{ laser: LaserDef | null; gun: GunDef | null; missile: MissileDef }`. Cutter and Hunter: `gun: null`.
- With `laser: null`: `laserCharge` stays 0, `laserTargeted` false, and charge, hold, lock-targeting, auto-fire and burst
  are skipped. The commands `laserLock`, `laserCharge` and `laserFrequency` are answered `unavailable` (a new command
  result; the refusal flash reads `NO LASER`). Every reader of `slots.laser` guards `null`, among them: the hash
  validator's bounds (`hash.ts`: the laser maxima are taken over classes whose laser is not null, and the gun bounds
  over classes whose gun is not null), `render/duel/consoleModel.ts` (no laser burst or range row), `situationModel.ts`
  (no laser sentence or refusal; the gun's reasons instead: `GUN OVERHEAT`, `WEAPONS OFFLINE`), `hitModel.ts` and
  `sim/duel/telemetry.ts` (no laser counts). The plan greps every `slots.laser` read and lists it. The weak shield frequency (Science Level 2) affects the laser only, so on
  the gun Valkyrn it is shown but has no effect: the one parity exception, testable with the laser fit.
- `createTacticalState(seed, slots, crewClass)` takes the crew slot's class index (default Cutter); the Hunter's slot is
  unchanged. The duel holds it as `DuelState.crewClass` (set by `createDuel` from its `cls` argument, else the layout's
  `shipClass`, else Cutter); `startRound` passes it to the next round's `createDuel`; the snapshot header carries it and
  `loadDuelSnapshot` passes it back. `systems[0].cls` (already hashed) must equal it (validated).
- The Hunter is unchanged.

### 6.2 Mouse aim

- `HeldInput` gains `aim?: number`: a heading index 0..255, or −1 / absent for none. Any other value (NaN, non-integer,
  out of range) counts as −1. It rides the held wire like `face` (codec, checkpoints, replay schemas); an authority pause
  or held-input expiry clears it. The runtime turns the pointer's bearing from the own ship's drawn marker into a heading
  index every frame while the pointer is over the Flight map; over the side tools it sends the last value.
- `helmTurn` (sim/duel/step.ts) order: A/D, else auto-face (`face`), else **aim**, else the held heading, else none.
  The aim turn is `aimTurn`: the signed heading-index difference `d = ((aim − heading + 384) mod 256) − 128`; no turn when
  `|d| ≤ 1`, else the sign of `d`. A band of three indices is wider than one tick's integer step (2 or 3 at 2.37 steps
  per tick), so the nose never steps across it; `defs.ts` asserts every class has `turnStepsPerTick < 3`. Settled, the
  nose is within one index (1.41°) of the cursor: 14.7 u off at the gun's 600 u reach, inside the Hunter's 20 u radius.
- After the tick's axes are taken: A/D or `face` held at the Helm clear `holdHeading` (as today); otherwise a valid
  `aim` sets `holdHeading = aim`, so the out-of-seat rule (§4.4) flies the last bearing.

## 7. The minigun (sim and view)

### 7.1 Firing

- A new weapon kind `gun` in `defs.ts` (`GunDef`): interval `GUN_INTERVAL_TICKS` 6 (10 rounds/s), muzzle speed
  `GUN_SPEED` 700 u/s along the nose plus the ship's velocity, life `GUN_LIFE_TICKS` 52 (about 607 u of reach at rest),
  two muzzles at forward `radius + 1` (21 u) and lateral ±12 u, firing alternately (`gunMuzzle` 0/1, starboard first).
- `HeldInput` gains `gunHeld?: boolean` (absent false; codec, checkpoints and replay like `face`). A round fires on a
  tick when `gunHeld` is held at the Weapons station by its attendant, the class has a gun, `gunLocked` is false,
  Weapons is below level 2, and `gunCooldown` is 0; then `gunCooldown = GUN_INTERVAL_TICKS`. `gunCooldown` counts down
  every tick.
- **Heat**: each round adds `GUN_HEAT_PER_SHOT` 50 to `gunHeat`, which drops `GUN_COOL` 4 per tick (net about 4.3 a tick
  while firing). Reaching `GUN_HEAT_MAX` 1000 (about 3.8 s of fire from cold) sets `gunLocked`; while locked it cools
  `GUN_COOL_LOCKED` 8 per tick and unlocks at 0 (about 2.1 s). Weapons at level 1 halves both coolings (integer halves:
  2 and 4).

### 7.2 Rounds and hits

- Rounds live in `tactical.rounds`, a fixed pool of `GUN_POOL` 64 entries `{ x, y, vx, vy, age, owner, active }`; a free
  entry holds zeros (validated as missiles are). A new round takes the lowest free index; when none is free it replaces
  the active round with the highest `age`, lowest index on ties.
- **Step order**: the gun fires in `applyWeaponsInput` from the pre-move pose (as the laser does, "before anything
  moves"); rounds move in a new `stepRounds` after the ships fly and contacts resolve, so a round also moves on its spawn
  tick. A round flies straight (no gravity, no drag) and is swept as a segment from its old to its new position against,
  in order, the enemy ship's post-move circle (radius 20), the asteroids and the planet; the first contact along the
  segment ends it. A round reaching `GUN_LIFE_TICKS` ends. Rounds never hit their own ship. Only + − × ÷ and sqrt.
- **Shielded enemy** (`shields > 0`): the hit adds 1 to the target's `gunWear`; at `GUN_HITS_PER_LAYER` 8 it strips a
  layer (`shields−−`, `shieldClock = 0`, the same `stripped` event a laser strip makes) and zeroes `gunWear`. Any strip
  (laser, missile or gun) zeroes `gunWear`.
- **Unshielded enemy**: the Room is found from the **closest-approach point** to the enemy's post-move centre of the
  infinite line through the round's old and new positions of the hit tick (the sweep's own frame). The sweep hit the
  circle, so this line meets it and the point is the middle of the chord it cuts: aim decides it, not the tick the round
  crossed the edge. Project that point's offset from the centre on the enemy's post-move nose axis (its heading after the
  tick's flight), `p`;
  `p > r/3` Weapons, `p < −r/3` Engines, else Shields (ties at exactly ±r/3 go to Shields). The hit adds 1 to the
  target's `gunHull` (every `GUN_HITS_PER_HULL` 3: hull −1, `gunHull` back to 0) and 1 to `gunRoomWear[room]` (every
  `GUN_HITS_PER_LEVEL` 6: that Room's level +1, capped at 2, wear back to 0; at level 2 the wear stays 0 and only hull
  counts). A Room repaired one level zeroes its wear. So a shot along the enemy's axis (from ahead or astern) always
  strikes Shields; to choose Weapons or Engines the pilot attacks from the side and aims fore or aft (a mastery skill).
- **Hostility** (Sci-1): the crew's first gun round turns the enemy hostile, as a laser release does. The rule reads
  `shots + gunShots`, and the `hostile` cause union gains `'gun'` (precedence laser, gun, missile, clock).
- Events: `gunFire` (ship, muzzle) and `gunHit` (ship, Room or −1 for a shield hit, the closest-approach point) for the
  views and telemetry.

### 7.3 State, hash and snapshots

New `ShipSystems` fields (all ships; zero for classes without a gun; all zero in `systemsFor`): `gunHeat`, `gunLocked`,
`gunCooldown`, `gunMuzzle`, `gunWear`, `gunHull`, `gunRoomWear[3]`, `gunShots`, `gunHits`. They and `tactical.rounds`
join the hash's system keys, the snapshot, and the validator (bounds: heat 0..`GUN_HEAT_MAX`, cooldown 0..interval,
muzzle 0..1, wear 0..7, hull 0..2, room wear 0..5, counts ≥ 0; a round's age 0..life, owner a ship slot).
`DuelState.crewClass` joins the duel hash and snapshot header (§6.1). The online view's `gapEvents` gains gun hits from
the `gunHits` counter, for completeness (the Valkyrn is not online).

### 7.4 Crosshair and lead pip (view)

- **Crosshair**: a small fixed mark on the nose line at the gun's reach, `CRT.mid`.
- **Lead pip**: where the Hunter will be when a round fired now reaches it, from the relative position and velocity and
  the round's speed (the intercept of a constant-velocity target; no positive solution draws no pip). A diamond with a
  thin line to the Hunter, `CRT.mid`; `CRT.hot` and brackets when the nose line passes within the Hunter's radius of the
  pip ("on target"). Pure function in `render/duel/leadModel.ts`.
- Hit feedback: a tick flash at the hit point, a click per hit (at most one per 3 ticks), `-1` floats on hull steps, the
  existing shield pop on a strip.
- **Heat bar** in the GUN card and under the crosshair: `HEAT` and a bar, blinking `OVERHEAT` while locked.

## 8. Missiles and the laser fit

- Right mouse launches the torpedo (the manual launch) with the existing rules: 360 range, magazine 4, regain, boost
  then homing, the lock tone. The TORPEDO card's FTL targeting and auto-launch work as on the Hound's Weapons console.
- The weapon cards follow the class's slots: **GUN** (heat, `READY` / `OVERHEAT` / `OFFLINE`) and **TORPEDO** (`MAG n/4`,
  range, target room); with the laser fit, LASER and TORPEDO exactly as on the Hound.
- **Developer switch** (Settings, single player only): "Valkyrn: fit laser instead of gun". On, the Valkyrn duel starts
  with `cls` = `valkyrnLaser` (the Valkyrn's hull and flight, the Cutter's double laser and torpedo). The class index
  is in the duel state, its hash and the snapshot header (§6.1), so a rematch and a replay keep it.

## 9. Picking the ship

- Single player opens a ship choice: **Hound** (crew of two, Tab between them, as today) and **Valkyrn** (solo fighter).
  The choice is remembered with the settings. Multiplayer is unchanged (Hound).
- The sit-down card for the Flight seat: `FLIGHT: MOUSE TO STEER · W/S THROTTLE · L-CLICK GUN · R-CLICK TORPEDO`.
- The controls list gains the Flight seat's bindings (§5.1).

## 10. Tests and gates

- **Parity** (§3.3) and the no-id-literal test (§3.2).
- **Crew of one**: `createDuel` at n = 1 (and a throw when the `crew` argument disagrees with the layout's `crew`); a snapshot
  round trip at n = 1; the downed pilot loses the round; the out-of-seat rule flies throttle and held heading on the
  Valkyrn and zero axes on the Hound.
- **Class**: `crewClass` from the layout, from the `cls` argument, kept by a rematch and a snapshot round trip; `systems[0].cls`
  validated; the gun Valkyrn never emits a `laser` event and answers `laserLock` / `laserCharge` / `laserFrequency`
  `unavailable`.
- **Aim**: the nose settles on a fixed aim with no turn-sign flip over 60 ticks, within one index; A/D and `face` win;
  an invalid aim counts as −1; aim sets `holdHeading`; it rides the codec, checkpoint, replay, hash and snapshot.
- **Gun**: interval and alternate muzzles; heat, the lockout and its length; Weapons level 1 halves cooling, level 2
  stops fire; rounds hit the ship / an asteroid / the planet and end, and end at their life; the pool overflow rule;
  shield wear strips a layer at 8 and any strip zeroes it; the Room by closest approach (a side-on shot offset forward of the
  centre hits Weapons, aft hits Engines; a shot along the axis from ahead or astern hits Shields); the same with the Hunter moving at full
  thrust (the post-move centre and heading are used); hull every 3 hits; room level every 6; repair zeroes the wear; the first
  gun round turns the enemy hostile with cause `gun`.
- **Lead pip**: with `DEFAULT_FLIGHT` replaced by `{ gravity: false, edge: false, drag: 0, stabilise: 0 }` and the Hunter
  coasting, a round fired along the pip's bearing passes within the Hunter's radius; with the default flight far from the
  planet (≥ 1500 u) it passes within 10 u of the predicted point.
- **Null laser**: a Hound snapshot and checkpoint still validate with the Valkyrn classes in `SHIP_CLASSES`; the Flight
  console, situation, hit and telemetry models build for the gun Valkyrn.
- **View**: the crosshair, pip, heat bar, the Valkyrn silhouette and every new mark on the CRT amber ramp (`crtColours`).
- **Gate**: a scripted Valkyrn pilot (aims at the pip, fires in bursts under the heat limit, launches torpedoes in
  range, stands to repair a level-2 Room and returns) over the duelGates seeds: median round 3–5 minutes and the Hunter
  wins at least one of ten. Tune the gun counters (§7.2) and the class (§6.1) to pass; report the numbers.
- **Hound unchanged**: the Hound's goldens move only by the version bump (the bless procedure, never `--fresh`); its
  duelGates numbers are unchanged.
- Gates: `npx tsc -b`, full vitest, `npm run test:duel-app-runtime`.
- **Screenshots** to `C:\Users\djuar\FTLite-shots\valkyrn\`: the ship picker, the interior on foot, the Flight console
  mid-fight with the crosshair on the pip, an overheat, a repair run aft.

## 11. Out of scope

- The Valkyrn online; bots; a gimbal; Valkyrn-only features beyond its data (§3). Asteroid destruction stays on its spike
  branch.

## 12. As built (Part iii, 2026-11-18)

- **Scripted pilot:** `sim/duel/scriptedPilot.ts`. It sits at the Flight seat and steers by `aim` only: avoid, dodge, orbit
  at 1850 u until the Hunter is within 900 u, then attacks the lead (`sim/tactical/lead.ts`, pinned equal to the
  view's pip). It holds the gun in bursts (release at 80% heat, resume when cold), launches a torpedo when it can at most
  every 1500 ticks, and stands for a level-2 Room (Weapons, Shields, Engines), repairs it to 0 and sits again. It walks to
  the seat and the repair points by the pair's `goalTiles` less the tiles on the very edge of reach: a walker settles on
  a tile centre only to about 1e-14, and from x = 15 the Flight seat read 1.5000000000000071 tiles away, out of reach.
- **Chosen numbers:** `GUN_HITS_PER_LAYER` 8 (kept at the start value), `GUN_HITS_PER_HULL` 12 (start 3),
  `GUN_HITS_PER_LEVEL` 6 (kept at the start value), `VALKYRN_HULL` 30 (kept at the start value). The pilot's numbers: as
  started (`PILOT_ORBIT_R` 1850, `PILOT_ENGAGE_RANGE` 900, `PILOT_STAND_RANGE` 300, `PILOT_CLOSE_GAIN` 0.5,
  `PILOT_MAX_CLOSE` 120, `PILOT_FIRE_RANGE` 560, `PILOT_HEAT_RELEASE` 800, `PILOT_MISSILE_GAP` 1500).
- **Measured** (the Valkyrn gate, `tests/duelGates.test.ts`, seeds 1 to 10, cap 15 min): median 229.8 s, crew wins 9,
  Hunter wins 1 (seed 2, 271.8 s: asteroid contacts, 11 of them, while the pilot was away repairing), draws 0, none at the
  cap; gun hit rate 83.6% (5583 of 6677). Seeds 1, 9 and 10 end with the Hunter hitting the planet (167.0, 179.8 and
  138.3 s), none under 30 s. The pilot is a near-perfect shot (about 84% of rounds hit), so the counters, not the aim,
  set the round length; the Hunter rarely hurts the Valkyrn (at most 6 hull in a round the crew wins), which is why
  `VALKYRN_HULL` barely moves the gate.
- **Sweep** (`npx tsx scripts/valkyrn-telemetry.ts sweep …`). Stage A, `--hull 2,3,4,5 --vhull 24,30,36,40`: no line passed;
  `vhull` changed nothing at any `hull`:
  ```
  hull=2  median  86.6 s  crew 10 hunter 0  gun hit 84.3%   (every vhull)
  hull=3  median 100.2 s  crew 10 hunter 0  gun hit 84.3%   (every vhull; the start values)
  hull=4  median 119.7 s  crew 10 hunter 0  gun hit 84.7%   (every vhull)
  hull=5  median 131.4 s  crew 10 hunter 0  gun hit 85.6%   (every vhull)
  ```
  Stage B, `--hull 5 --vhull 24 --layer 6,8,10,12 --level 4,6,8`: no line passed:
  ```
  layer=6 hull=5 level=4 vhull=24  median 132.4 s  crew 10 hunter 0 draw 0 cap 0  gun hit 86.1%  FAIL: median 132.4 s < 180; hunter wins 0 < 1
  layer=6 hull=5 level=6 vhull=24  median 130.4 s  crew 9 hunter 1 draw 0 cap 0  gun hit 86.1%  FAIL: median 130.4 s < 180
  layer=6 hull=5 level=8 vhull=24  median 131.8 s  crew 9 hunter 1 draw 0 cap 0  gun hit 84.8%  FAIL: median 131.8 s < 180
  layer=8 hull=5 level=4 vhull=24  median 131.6 s  crew 9 hunter 1 draw 0 cap 0  gun hit 84.6%  FAIL: median 131.6 s < 180
  layer=8 hull=5 level=6 vhull=24  median 131.4 s  crew 10 hunter 0 draw 0 cap 0  gun hit 85.6%  FAIL: median 131.4 s < 180; hunter wins 0 < 1
  layer=8 hull=5 level=8 vhull=24  median 137.0 s  crew 10 hunter 0 draw 0 cap 0  gun hit 85.3%  FAIL: median 137.0 s < 180; hunter wins 0 < 1
  layer=10 hull=5 level=4 vhull=24  median 137.3 s  crew 10 hunter 0 draw 0 cap 0  gun hit 83.4%  FAIL: median 137.3 s < 180; hunter wins 0 < 1
  layer=10 hull=5 level=6 vhull=24  median 139.0 s  crew 8 hunter 2 draw 0 cap 0  gun hit 84.5%  FAIL: median 139.0 s < 180
  layer=10 hull=5 level=8 vhull=24  median 140.9 s  crew 9 hunter 1 draw 0 cap 0  gun hit 83.7%  FAIL: median 140.9 s < 180
  layer=12 hull=5 level=4 vhull=24  median 138.2 s  crew 10 hunter 0 draw 0 cap 0  gun hit 83.7%  FAIL: median 138.2 s < 180; hunter wins 0 < 1
  layer=12 hull=5 level=6 vhull=24  median 140.5 s  crew 10 hunter 0 draw 0 cap 0  gun hit 84.6%  FAIL: median 140.5 s < 180; hunter wins 0 < 1
  layer=12 hull=5 level=8 vhull=24  median 140.6 s  crew 10 hunter 0 draw 0 cap 0  gun hit 83.6%  FAIL: median 140.6 s < 180; hunter wins 0 < 1
  ```
  The pilot's numbers, one at a time at `layer=10 hull=5 level=6 vhull=24` (plan Task 4 Step 4): none reached 180 s, so
  they stay as started:
  ```
  PILOT_MISSILE_GAP=900    median 133.0 s  crew 9 hunter 1   gun hit 85.7%
  PILOT_MISSILE_GAP=2100   median 142.8 s  crew 9 hunter 1   gun hit 86.2%
  PILOT_STAND_RANGE=250    median 124.6 s  crew 9 hunter 1   gun hit 89.1%
  PILOT_STAND_RANGE=340    median 143.8 s  crew 9 hunter 1   gun hit 81.4%
  PILOT_ENGAGE_RANGE=700   median 134.3 s  crew 10 hunter 0  gun hit 86.6%
  PILOT_ENGAGE_RANGE=1200  median 141.4 s  crew 7 hunter 3   gun hit 84.9%
  ```
  Stage A repeated once with `--hull` extended upward (the plan's reading rule: too short, raise `--hull`; 5 was the top
  of the listed range), `--hull 6,7,8,9,10,12 --vhull 24,30`, then the neighbours `--hull 9,10,11 --vhull 16,20` and
  `--hull 11,13,14 --vhull 30` (layer 8, level 6 throughout; `vhull` again changed nothing from 16 to 30):
  ```
  hull=6   median 148.0 s  crew 10 hunter 0  FAIL: median < 180; hunter wins 0
  hull=7   median 162.9 s  crew 10 hunter 0  FAIL: median < 180; hunter wins 0
  hull=8   median 174.5 s  crew 10 hunter 0  FAIL: median < 180; hunter wins 0
  hull=9   median 186.5 s  crew 10 hunter 0  FAIL: hunter wins 0
  hull=10  median 199.5 s  crew 10 hunter 0  FAIL: hunter wins 0
  hull=11  median 217.5 s  crew 10 hunter 0  FAIL: hunter wins 0
  hull=12  median 229.8 s  crew 9 hunter 1   gun hit 83.6%  PASS   (vhull 24 and 30)
  hull=13  median 236.8 s  crew 9 hunter 1   gun hit 83.4%  PASS
  hull=14  median 247.1 s  crew 9 hunter 1   gun hit 83.3%  PASS
  ```
  At `hull=12`, `--vhull 5,10,24`: 5 gives median 162.9 s, crew 5 hunter 5 (FAIL); 10 and 24 equal 30. The pick is the
  PASS line closest to the start values: `hull=12 vhull=30` (distance 3.0).
- **Hound unchanged:** `duel-oracle.ts same` and `canonical-trace.ts same` pass at SIM_VERSION 53. The tuning moves only gun
  rounds and the Valkyrn class, so there is no version bump (Valkyrn iii plan Decision 11).
