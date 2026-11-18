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
  differs is data: the layout JSON, the painted art, the repair points, the ship class (flight and weapon numbers), and
  the crew count.
- No code may branch on a layout id or class id (`=== 'hound'`, `=== 'valkyrn'`). Behaviour that differs comes from a
  field on the layout or the class (for example the class's weapon slots, the layout's combined Flight seat). A test
  greps `src/renderer/src` for layout and class id literals outside the data files and the asset tables.
- **Parity test** (`tests/shipParity.test.ts`): for each ship in the single-player picker, every station kind, room
  system, tactical repair point (one per tactical Room), airlock count ≥ 1 and breach site per room that the Hound has,
  the Valkyrn has too. A feature that adds a station kind or system to the Hound fails this test until the Valkyrn gets
  it. The one allowed difference: the Valkyrn's Navigation and Weapons stations are one combined seat (§5).

## 4. The ship and its interior

### 4.1 Art and licence

- File: `4213598-Valkyrn v1 16x16.png` (2240×2240, 140 px per 5-ft square, transparent background) from the owner's
  `Downloads\battlemaps\34745`, the same 2-Minute Tabletop source as the Hound. Licence CC BY-NC 4.0, as the Hound.
- Out of git like the other bought art: `art/import.json` gains the entry and `npm run art:import` copies it to
  `public/assets/paid/2mt/valkyrn.png`. The manifest entry is committed with the licence, store, credit ("Valkyrn by
  2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0") and the modification "rotated 90° clockwise". The existing
  `docs/gates.md` 2-Minute Tabletop line names the Valkyrn too.
- Rotated 90° clockwise so the nose faces right like the Hound's (import gains `rotate: 90`, beside `flipX`).

### 4.2 Grid

- As the Hound (Hound battlemap spec §1): one map square is 2 tiles, offset half a tile so painted square boundaries fall
  on tile centres; painted walls run through rows of `#`; doors sit in painted wall gaps. After rotation the pressurised
  hull (cockpit to ramp) is about 12 squares long and 2.5 wide: a layout of about 25 × 7 tiles. The plan pins the exact
  numbers after tracing.
- The painted bounds (alpha bounding box, wings and engines) feed the duel camera fit, as the Hound's do.

### 4.3 Rooms (Hound room → Valkyrn room)

| Hound | Valkyrn (front to back in the painting) | Systems and stations |
|---|---|---|
| Bridge (B) | **Cockpit**: the two pilot chairs | `navigation` + `weapons` as one **Flight** seat (front chair) |
| Ops (O) | **Ops**: the room with two chairs facing the console | `science` system; the Science / Engineering / Doors console group, as the Hound's |
| Medbay (M) | **Quarters, bunk side** | `medbay` |
| Life Support (L) | **Quarters, galley and washroom side** | `lifeSupport` |
| Engines (E) | **Missile bay, ramp half** | `engineering` |
| Reactor (R) | **Missile bay, rack half** | `reactor` |
| Quarters (Q), Hold (H) | none | (`system: null` rooms; parity does not require them) |

- Repair points, one per tactical Room (`DUEL_REPAIR_POINTS.valkyrn`): Weapons in Ops (as the Hound's is in Ops),
  Shields in the Reactor, Engines in Engines, each on an open floor tile.
- Airlocks: the ramp (Engines) and one hull door; breach sites one per room on an outer wall tile; allocations copied
  from the Hound. Station tiles sit on the painted furniture. Spawn: the Ops floor.
- Tokens, console markers and the painted layer draw exactly as on the Hound (Hound battlemap spec §§3–5); the
  `battlemapLayer` takes its texture from the layout's asset name, not a Hound constant.

### 4.4 Crew of one

- The Valkyrn duel has **one** character: `playerCount` 1, using Sci-2's crew-of-n rule (crew 2 to 4 online; this spec
  extends the sim's loops to n = 1). The round is lost when the one character is downed or the hull is gone, as at any n.
  Revive needs a teammate, so a downed solo pilot loses the round (stated in the parity notes; no bot crew).
- No Tab character swap on the Valkyrn (there is no second character). Tab still toggles the console and the ship view
  while seated.
- While the pilot is out of the seat the ship holds its throttle and its last aim heading (§6.1), as solo Tab already
  keeps a seated character's settings.
- Build order: after Sci-2 merges (it owns `playerCount` > 2 and the SIM 51 → 52 bump); the Valkyrn takes the next
  version.

## 5. The Flight console (one seat for Helm and Weapons)

- The layout's stations list a new combined form: the `navigation` and `weapons` stations share one tile and one console
  group (`consoleGroups: [{ tile, kinds: ["navigation", "weapons"] }]`). `createDuel`'s check that the two are in
  different groups becomes: different groups, or the layout's crew is 1. Sitting there seats the character at both, so
  every rule that asks "is the Helm attended" or "is Weapons attended" is true for that pilot: auto-face, held heading,
  throttle, laser/torpedo auto-fire, torpedo lock, scans from the Helm or Weapons rate.
- The view is the Helm map, centred on the own ship, with the auto-frame (Feel-i) keeping the Hunter on screen
  (zoom clamped 0.25–1). On top of it: the crosshair and lead pip (§7.3), the heat bar, and the Weapons console's side
  tools: the weapon cards (§8), the enemy window with FTL room targeting, the 360 torpedo circle and the lock tone.
- The status sentence, refusal flashes, pings, collision warning, gravity rings and EVADE arrow all show, as on the Helm.

## 6. Flight (sim)

### 6.1 The Valkyrn class

A new `ShipClassDef` `valkyrn` (start values, tuned in §10):

| | Hound (Cutter class) | Valkyrn |
|---|---|---|
| hull | 40 | 30 |
| thrust (u/s²) | 120 | 160 |
| turn (°/s) | 150 | 200 |
| shields | 2 layers | 2 layers |
| weapons | double laser + torpedo | minigun + torpedo |
| radius | 20 | 20 |

The Hunter is unchanged.

### 6.2 Mouse aim

- A new held Helm input value `aim`: a heading index 0..255, or −1 for none. The runtime turns the pointer's bearing from
  the own ship's drawn marker into a heading index every frame and sends it while the pointer is over the Flight map.
- `helmTurn` (sim/duel/step.ts) gains it: A/D, else auto-face, else **aim** (the same `headingTurn` toward a fixed
  bearing, with auto-face's dead band, so it never chatters), else the held heading. An `aim` other than −1 sets the
  held heading to that value, so when the pilot stands up the ship keeps the last bearing.
- On the wire and in the replay it rides the held input like `face` (codec, checkpoints, replay schemas); an authority
  pause or held-input expiry clears it. The Valkyrn's Flight seat sends it; the Hound never does.
- The pointer outside the map (over the side tools) holds the last aim.

## 7. The minigun (sim and view)

### 7.1 Firing

- A new weapon kind `gun` in `defs.ts` (`GunDef`): rounds per second 10 (`GUN_INTERVAL_TICKS` 6), muzzle speed 700 u/s
  added to the ship's velocity, life 52 ticks (about 600 u of reach), two muzzles 12 u either side of the nose line that
  fire alternately, damage counters below.
- Fires while the held input `gunHeld` (left mouse) is true, the gun is not overheated, Weapons is below level 2 and the
  Flight seat is attended. The Hound's class has no gun slot, so `gunHeld` does nothing on it.
- **Heat**: each round adds `GUN_HEAT_PER_SHOT` 50 to a heat counter that drops `GUN_COOL` 4 per tick, so steady fire
  nets about 4.3 a tick; at `GUN_HEAT_MAX` 1000 (about 3.8 s of fire from cold) the gun overheats and locks until heat
  is back to 0, cooling `GUN_COOL_LOCKED` 8 per tick while locked (about 2.1 s). Weapons at level 1 halves both coolings.

### 7.2 Rounds and hits

- Rounds are sim projectiles in a fixed pool on the tactical state (`GUN_POOL` 64: x, y, vx, vy, age, owner, active), in
  the hash and every snapshot path. A round flies straight (no gravity, no drag) and is tested each tick as a swept
  segment against the enemy ship circle, asteroids and the planet; the first contact ends it. Only + − × ÷ and sqrt (the
  determinism guard).
- **On a shielded enemy**: each hit adds 1 to its `gunWear`; at `GUN_HITS_PER_LAYER` 8 it strips a layer (SHIELD DOWN
  and the shield pop as a laser strip) and resets. A recharged layer resets the wear.
- **On an unshielded enemy**: the hit's Room comes from **where it lands**: the impact point projected on the enemy's
  nose axis, front third Weapons, middle Shields, aft third Engines. Each hit adds 1 to the ship's `gunHull` counter
  (every `GUN_HITS_PER_HULL` 3 = 1 hull) and 1 to that Room's `gunRoomWear` (every `GUN_HITS_PER_LEVEL` 6 = that Room's
  level +1, capped at 2), so aiming at a part of the ship is a skill. Start values; tuned in §10.
- Each hit is a tactical event (`gunHit`: ship, Room or −1 for a shield hit, point) for the views, the telemetry
  (`gunShots`, `gunHits`) and the online view's counters, as the laser's are.

### 7.3 Crosshair and lead pip (view)

- **Crosshair**: a small fixed mark on the gun line ahead of the nose at the gun's reach, `CRT.mid`.
- **Lead pip**: where the Hunter will be when a round fired now reaches it, from the relative position and velocity and
  the round speed (the intercept of a constant-velocity target; no solution draws no pip). A diamond with a thin line to
  the Hunter, `CRT.mid`; `CRT.hot` and brackets when the gun line passes within the Hunter's radius of the pip ("on
  target"). Pure function in `render/duel/leadModel.ts`, tested against a sim fly-out.
- Hit feedback: a tick flash on the Hunter at the impact point, a short click sound per hit (rate-limited), small `-1`
  floats on hull steps, the existing shield pop on a strip.
- **Heat bar** under the crosshair readout: `HEAT` and a bar, blinking `OVERHEAT` while locked.

## 8. Missiles and targeting

- Right mouse launches the torpedo (the manual launch, `missileLaunch`) with the existing rules: 360 range, magazine 4,
  regain, boost then homing, the lock tone. The torpedo card's FTL targeting (pick up, drop on a room) and auto-launch work
  as on the Hound's Weapons console; Q/E step the torpedo's target room.
- The weapon cards show **GUN** (heat, `READY` / `OVERHEAT` / `OFFLINE`) and **TORPEDO** (`MAG n/4`, range, target room).
  Key 1 has no laser to pick up on the Valkyrn; the card row follows the class's slots.
- **Developer switch** (Settings, single player only): "Valkyrn: fit laser instead of gun", so laser features can be
  tested solo. With it on the Valkyrn's class uses the Hound's double laser slot (charging, auto-fire, the laser card,
  key 1). It is a setting chosen before the duel starts and recorded in the duel's start data, so a replay is exact.

## 9. Picking the ship

- Single player opens a ship choice: **Hound** (crew of two, Tab between them, as today) and **Valkyrn** (solo fighter).
  The choice is remembered with the settings. Multiplayer is unchanged (Hound).
- The sit-down card for the Flight seat: `FLIGHT: MOUSE TO STEER · W/S THROTTLE · L-CLICK GUN · R-CLICK TORPEDO`.
- The controls list gains the Flight seat's controls.

## 10. Tests and gates

- **Parity** (§3) and the no-id-literal grep.
- **Sim**: aim turns the ship and holds the heading; A/D and auto-face win over it; it rides the held wire, hash and
  snapshot. Gun: interval, alternate muzzles, heat and the lockout, Weapons level 1 and 2, rounds hit the ship / an
  asteroid / the planet and end; the shield wear strips a layer at 8; the Room by impact point; hull every 3 hits; room
  level every 6. Round pool overflow (the oldest round is reused). Crew of one: the downed pilot loses the round.
- **View**: the lead pip against a fly-out (a round fired along the pip with the Hunter coasting hits within 1 tick of
  the predicted time); the crosshair, pip, heat bar and every new mark on the CRT amber ramp (`crtColours`).
- **Gate**: a scripted Valkyrn pilot (aims at the pip, fires in bursts under the heat limit, launches torpedoes in
  range, walks to repair a level-2 Room) over the duelGates seeds: median round 3–5 minutes and the Hunter wins at least
  one of ten. Tune the gun counters (§7.2) and the class (§6.1) to pass; report the numbers.
- **Hound unchanged**: the Hound's goldens move only by the version bump (the bless procedure, never `--fresh`); its
  duelGates numbers are unchanged.
- Gates: `npx tsc -b`, full vitest, `npm run test:duel-app-runtime`.
- **Screenshots** to `C:\Users\djuar\FTLite-shots\valkyrn\`: the ship picker, the interior on foot, the Flight console
  mid-fight with the crosshair on the pip, an overheat, a repair run aft.

## 11. Out of scope

- The Valkyrn online; bots; a gimbal; Valkyrn-only features of any kind (by §3 there are none). Asteroid destruction
  stays on its spike branch.
