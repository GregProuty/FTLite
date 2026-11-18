# Spike: Engineering in the ship view (2026-11-18)

Owner, 2026-11-18: start the Engineering role spike, drawing on the Artemis Engineering station (power sliders,
overheating, coolant, presets), and in the same spike build the O2 module and the doors. "Anybody in the ship view
clicks on a door it opens, even remotely ... almost exactly the way that FTL works." The O2 module keeps an oxygen level
across the ship; a hull breach leaks a room's air; opening doors to space vents the air and puts out fires.

Decisions taken in brainstorming:

- **Power model: FTL reactor bars** (owner: "I want to follow FTL on this one"), not Artemis's independent sliders.
- **Artemis heat on top: one overdrive bar per system, heat, a shared coolant pool** (owner: "keep the overdrive and coolant").
- **No Engineering terminal.** The ship view is the Engineering station: "anyone in the ship view should be able to"
  shift power and open doors from the HUD.
- **The ship-view HUD is in the amber CRT style of the consoles** (docs/superpowers/specs/2026-11-17-crt-map-design.md).

A spike: a playable prototype on its own branch to answer the questions below. It is not merged until the owner has
played it and said yes; then it gets a proper spec and build.

## Questions the spike must answer

1. **Feel.** Does moving bars, juggling coolant, closing doors and venting rooms give one player (the 4th seat, or
   whoever is on foot) a full-time job during a duel? Does it change how Helm and Weapons fight?
2. **Clarity.** Can a player read the ship's state (power, heat, air, fire, breaches) at a glance from the HUD?
3. **Cost and determinism.** Snapshot growth (online) and tick cost with oxygen, fire spread and heat running in the
   duel; hash agreement across seeds and in the duel-app smoke.

## 1. Branch and scope

- Branch `spike/engineering` in `.worktrees/engineering` from master. SIM_VERSION is bumped on the branch only; goldens
  re-blessed on the branch only.
- Playable solo and online with a crew of 2 to 4. Only the crew ship (the Hound) gets power, oxygen and doors; the
  Hunter keeps today's damage-level rules.
- Deliverables: the prototype, a report `docs/superpowers/research/2026-11-18-engineering-spike.md` (snapshot size
  before and after, tick cost, determinism, what felt good, what didn't, a recommendation: ship as is / ship simpler /
  drop), and screenshots of the HUD, a vented room and an overheating system.

## 2. Reactor and bars (FTL)

The Hound has a **reactor of 8 bars** and five powered systems. Each system lives in one interior room, and that room
is where it burns, breaches and overheats:

| System | Max | Overdrive | Room | Tactical Room (weapon damage) |
|---|---|---|---|---|
| Shields | 4 | +1 | R (Reactor) | Room.Shields |
| Weapons | 3 | +1 | O (Ops) | Room.Weapons |
| Engines | 3 | +1 | E (Engines) | Room.Engines |
| Sensors | 2 | +1 | O (Ops) | none |
| Oxygen | 2 | none | L (Life Support) | none |

- Total demand at max is 14 against 8, so something always goes hungry.
- **Start of every round:** Shields 2, Weapons 2, Engines 2, Sensors 1, Oxygen 1 (8 used, 0 spare), heat 0, coolant 0
  everywhere, no system failed.
- **Capacity.** A system's capacity is `max(0, slots − damage × knock)`, where `slots` = max + overdrive (5, 4, 4, 3,
  2), `damage` is its tactical Room's level 0..2 (0 for Sensors and Oxygen), and `knock` = ceil(slots / 2) (3 for
  Shields, 2 for Weapons and Engines). This gives capacities 5 / 2 / 0 for Shields and 4 / 2 / 0 for Weapons and
  Engines at damage 0 / 1 / 2. Damage level 2 therefore means the system is off, which is what it means today. A failed
  system's capacity is 0.
- **Powered bars** never exceed capacity. When capacity falls below the powered bars (damage rises, or the system
  fails), the excess bars return to the reactor pool at once; the overdrive bar goes first. Repair raises capacity but
  adds no bar: a player must put the bar back. The **effective bars** are the powered bars.
- Sensors and Oxygen take no weapon damage in the spike (they have no tactical Room). Their rooms still burn and
  breach, and Sensors can overheat. The report notes this.
- **The crew ship's gates read bars, not damage.** For ship 0 only, `laserOffline` is Weapons bars = 0, `canLaunch`
  needs Weapons bars ≥ 1, and the flight code, laser charge, magazine and shields read the tables below by bars. Because
  damage 2 means capacity 0, a level-2 Room still means off, as today. The Hunter (ship 1) keeps every rule, table and
  gate it has today. That includes its laser lock (hunter.ts: target Shields while the crew's Shields Room is below 2),
  which reads the crew's Room damage and is unchanged.

### Rate tables (start values, tune freely)

Columns are effective bars, from 0 to slots. Values are whole units where the code uses whole units. The **bold**
column is the round start, which matches today's undamaged crew ship except where the notes say otherwise.

| Table | 0 | 1 | 2 | 3 | 4 | 5 | Today |
|---|---|---|---|---|---|---|---|
| Shield layers (floor(bars/2)) | 0 | 0 | **1** | 1 | 2 | 2 | 2 layers (SHIELD_LAYERS) |
| Shield recharge (units/tick of SHIELD_RECHARGE_UNITS) | 0 | 2 | **3** | 4 | 5 | 6 | SHIELD_RATE [3, 2, 0] |
| Laser charge (units/tick of LASER_CHARGE_UNITS) | 0 | 25 | **40** | 50 | 60 | | LASER_CHARGE_RATE [40, 25, 0] |
| Magazine regen (units/tick of MAGAZINE_REGEN_UNITS = 10800) | 0 | 2 | **4** | 5 | 6 | | 1 missile / 2700 ticks, undamaged |
| Engine factor (thrust and turn) | 0 | 0.6 | **1** | 1.25 | 1.5 | | ENGINE_FACTOR [1, 0.6, 0] |
| Science scan rate (units/tick) | 0 | **5** | 6 | 7 | | | SCAN_RATE_SCIENCE 5 |
| Helm/Weapons scan rate (units/tick) | 0 | **2** | 2 | 3 | | | SCAN_RATE_OTHER 2 |
| Oxygen factor (× INJECT_FRAC) | 0 | **0.5** | 1 | | | | the sector stub rate 0.03/s at 0.5 |

- **Shields at round start hold 1 layer, not today's 2.** This is deliberate: Engineering gets today's 2 layers back by
  moving 2 more bars into Shields. The report says whether it felt right.
- **Layers above the cap drop at once.** When the bars fall and the layer cap drops below the current layers, the extra
  layers are lost that tick and the shield clock resets to 0.
- **Magazine regen** today is a tick counter (MAGAZINE_REGEN_TICKS 2700). For the crew ship it becomes a units clock:
  it gains the table's rate each tick, and at MAGAZINE_REGEN_UNITS (10800) it regains a missile and resets. At 4 per
  tick this is exactly today's 2700 ticks.

## 3. Overdrive, heat and coolant (Artemis on FTL bars)

- A system is **overdriven** while its powered bars exceed its max (only the overdrive bar does that). Oxygen has no
  overdrive slot.
- **8 coolant units** are shared (Artemis's 8, up from the sector game's 4). Each of the four overdrivable systems
  holds 0, 1 or 2; Oxygen holds none. Coolant is never consumed. A coolant click cycles the system 0 → 1 → 2 → 0, and
  a step the pool cannot supply wraps to 0, as `cycleCoolant` does today. Coolant counts only while the system is
  overdriven or failed.
- **Heat per hazard tick** (HAZARD_EVERY = 5 ticks, 12 Hz; the numbers are heat.ts's, with no quirk term):
  - overdriven: heat += HEAT_RISE (2) − coolant × HEAT_COOL_UNIT (1), floored at 0. One coolant unit halves the rise,
    and two hold it level;
  - neither overdriven nor failed: heat −= HEAT_COOL_IDLE (4), floored at 0;
  - failed: heat −= HEAT_COOL_UNIT × (1 + coolant), floored at 0. That takes 20 s from HEAT_MAX with no coolant and
    about 7 s with two.
- **Overheat.** When heat reaches HEAT_MAX (240), the system fails: its bars return to the pool and heat stays at
  HEAT_MAX. One rng.hazards draw at OVERHEAT_FIRE_CHANCE (0.5) ignites its room (§2 table) if that room isn't burning.
  A failed system has capacity 0 until its heat is 0, then it clears and takes bars again. Sensors has no repair
  point and recovers the same way.
- Fire heat (the sector game's FIRE_HEAT_MAX, where a fire heats its room's stations) is out of the spike.
- `heat.ts` and `power.ts` are keyed by the sector game's StationKind, which has no Shields, Engines or Sensors, so the
  spike adds a duel power module (`sim/duel/power.ts`) with these rules. It does not call or bend the sector code.

## 4. Oxygen, breaches and fire

The duel interior is a full sector `SimState`. The spike runs a chosen set of the sector hazard functions on it, at a
fixed point in the duel step (§7). It never calls the sector `step`.

- **No quirk.** createSimState draws a run quirk, and oxygenStep and doorSystem read it. createDuel passes
  `{ quirk: 3 }` (Lucky Hull). Its only hook is sector debris, which never runs in the duel, so every hook the duel
  reaches is neutral. A test asserts `quirkPassageMult` = 1 and `quirkDoorDelayMult` = 1 on a fresh duel.
- **Oxygen per room** through `oxygenStep`:
  - air moves through open doors and leaks through closed ones (PASSAGE_CLOSED 0.05);
  - breaches vent at PASSAGE_BREACH and open airlocks at AIRLOCK_PASSAGE into space, a fixed zero;
  - living crew breathe (BREATH_RATE) and fire burns air (FIRE_O2_RATE).
  Every room starts full.
- **Life Support injection** is a duel function, not `lifeSupportInjection` (that one reads the sector LifeSupport
  station's output and its seated bonus). Before each oxygenStep it writes
  `injectionScratch[r] = INJECT_FRAC × V[r] × HAZARD_DT × OXY_FACTOR[Oxygen bars]` for every room, and oxygenStep's
  existing clamp and venting skip apply. With 0 bars there is no injection and the air runs down.
- **Breaches.** An enemy hit on the crew ship (the hits duel fire counts: a laser hit by ship 1, or a missile that
  ended on ship 0, with room ≥ 0) rolls a breach in the struck tactical Room's repair room. The chance is
  DUEL_BREACH_CHANCE_LASER 0.2 or DUEL_BREACH_CHANCE_MISSILE 0.5, one rng.hazards draw, and no draw if the room is
  already breached. The Hound has exactly one breach site per room, and the roll activates that site
  (`activateBreach`). Per hit, the fire roll comes first, then the breach roll.
- **Patching.** A breach is patched at its breach-site tile with the fire work loop (DUEL_EXTINGUISH_UNITS, solo and
  team rates as for fire). Progress is stored in `breaches.repair[site]` as a 0..1 fraction of DUEL_EXTINGUISH_UNITS, in
  whole units, like fireRepair. At full it calls `repairBreach`.
- **Low air hurts.** Any conscious character, seated or standing, in a room below **25 %** oxygen (o2 / volume < 0.25)
  loses O2_DAMAGE (6) health per second, applied per tick as today's fire damage is. It runs in healthPhase after fire
  damage and pushes `crewHurt` with a new cause `'air'`. Downed and revive work as today.
- **Fire (FTL).** The sector `fireStep` is the one rule for growth, shrink and spread in every room:
  - a fire grows above 20 % air (FIRE_GROW_FRAC), shrinks below 10 % (FIRE_SHRINK_FRAC), and goes out at 0;
  - it spreads to a neighbouring room with chance FIRE_SPREAD_P × passage per hazard tick: full through an open door,
    0.05× through a closed one, as the code does today.
  The duel's `firePhase` drops its per-tick DUEL_FIRE_GROW. It keeps only the DUEL_FIRE_DAMAGE_TICKS damage cadence
  (a burning repair room raises its tactical Room) and the hit ignition rolls.
- **Fighting fire in every room.** A room's fire is fought at its repair point if it has one (O, R, E, as today) and
  otherwise at its breach-site tile (B, Q, M, L, H), with the same reach, units and rates. Seated characters take fire
  and low-air damage as standing ones do. Today's duel already burns seated characters.
- **Work precedence.** A worker in reach of more than one job works one per tick, in this order: a fire, then a breach,
  then a damaged Room's repair. Ties go to the lowest room index.
- **Venting.** An open airlock (H, L) empties its room in about 2 s. Opening the doors between a burning room and an
  airlock room vents it: the air falls below 10 %, the fire shrinks out, and anyone inside starts to suffocate.

## 5. Doors

- Doors start in **auto** (DoorState.Closed). They open for a crew member walking through and close behind, through the
  sector `doorSystem`. createDuel no longer holds every door open.
- A **door click** toggles auto ↔ held open (Closed/Open → HeldOpen; HeldOpen → Closed). It's a new duel toggle, not
  the sector `cycleDoor`, which passes through Sealed. An **airlock click** toggles `airlocks.open[i]`.
- `doorSystem` runs its fail-safe first. With the sector Doors station offline, the fail-safe closes every airlock and
  releases every held door. The duel keeps that station at its layout allocation and never fails it, so the fail-safe
  never fires. A test holds an airlock open across 600 ticks.
- Sealing (the sector game's Sealed state) is out of the spike.

## 6. Ship-view HUD (amber CRT)

**UI rule:** the HUD, and so these clicks, appear only when a player's screen shows the interior. That means on foot,
or seated with the SHIP tab open. **Sim rule:** §7. The HUD is drawn in the amber CRT look of the consoles (palette,
scan lines and glow from the CRT map). It has no seat and no terminal.

- **Power columns** at the bottom left, one per system (Shields, Weapons, Engines, Sensors, Oxygen). Each shows powered
  bars, empty capacity, slots lost to damage or failure (crossed), and the overdrive slot (marked). **Left-click** a
  column adds a bar; **right-click** removes one. There are no keys in the spike.
- **Reactor:** the spare bars, as a column beside the systems, with the free coolant units under it.
- **Heat and coolant:** a heat bar under each overdrivable column (amber, turning red near HEAT_MAX, flashing while
  failed) and a coolant pip counter (0 to 2) that sends `coolant` on click.
- **On the interior:**
  - a per-room air tint that fades amber to red below 25 %;
  - breach and fire icons;
  - door glyphs for auto and held open, and airlock glyphs for closed and open to space;
  - a hover highlight on a clickable door or airlock.
- Presets (Artemis's SHIFT+number) are out of the spike. The report notes them as a candidate.

## 7. Sim rules, step order and the wire

**Commands.** These are new duel kinds, listed in DUEL_KINDS, so after the round is decided they answer `duel-decided`:

- `power` (system 0..4, delta +1 or −1);
- `coolant` (system 0..3);
- `door` (an edge that is a door);
- `airlock` (an airlock index).

Each is applied for any valid, present, conscious player, seated or standing. There's no range check and no view
check, and the last command in player order wins. Reasons are checked in this order:

1. `stale-tick`
2. `malformed` (bad system, delta, edge or index)
3. `unavailable` (`power` +1 with no spare bar or at capacity; `power` −1 at 0; the player downed or away)

`coolant` never fails on the pool: it wraps (§3).

**A new duel module `power`**, after `helm` and before `interior`, holds per system the powered bars, the heat, the
coolant and the failed flag, plus the crew ship's magazine-regen units clock. Oxygen, breaches, breach repair,
airlocks, fire and doors already live in the interior's flattened state and need no new field. The spike measures the
snapshot growth anyway. `tests/duelModules.test.ts` holds every new member to a field or an exclusion.

**Step order** in `stepDuelTick` (new steps in bold; the rest is today's order):

1. stale and decided checks, seats, tactical commands (as today);
2. **power, coolant, door and airlock commands, in player order**;
3. work: repair, fire, breach (precedence §4);
4. movement;
5. **doorSystem**;
6. stepDuel, which reads bars for ship 0;
7. applyHitDamage;
8. **capacity update** (damage rises return excess bars);
9. per hit in event order: the fire roll, then **the breach roll**;
10. firePhase's damage cadence;
11. **on a hazard tick** ((tick − baseTick) % HAZARD_EVERY = 0): duel injection → oxygenStep → fireStep → duel heat
    (overheat draws);
12. healthPhase: hits, fire, **then low air**, downed, revived.

Every rng.hazards draw comes from step 9, fireStep's spread rolls, or the overheat roll, in that order within a tick.

## 8. Testing

- Sim tests:
  - bars never exceed the reactor or capacity;
  - damage 1 and 2 give the capacities in §2, and the excess bars return to the pool, the overdrive bar first;
  - repair restores capacity but not power;
  - every rate table is read by bars for ship 0 and unchanged for ship 1;
  - layers above the cap drop at once;
  - the magazine units clock regains a missile at 2700 ticks at 2 bars;
  - heat rises 2 per hazard tick at 0 coolant, 1 at 1, and holds at 2;
  - an overheat fails the system, returns its bars, may ignite its room, and the system takes bars again at heat 0;
  - Oxygen bars 0 give no injection and the air falls;
  - a breach vents its room, and patching it stops the venting;
  - an open airlock vents its room in about 2 s and puts its fire out;
  - fire spreads through an open door at FIRE_SPREAD_P and through a closed one at 0.05× (a seeded statistical test over
    N hazard ticks);
  - a fire in a non-point room is put out at its breach-site tile;
  - work precedence holds;
  - crew below 25 % air lose health, seated ones too;
  - the quirk hooks are neutral;
  - an airlock stays open across 600 ticks;
  - the four commands are applied for any present, conscious player and rejected with `unavailable` for a downed one;
  - after the round they answer `duel-decided`.
- Determinism: hash agreement over a seed sweep with the new systems running; the goldens re-blessed on the branch.
- App smoke: click a power column, a coolant counter and a door in the running app, and assert the state changed.
- Screenshots (playwright-core and Electron, as in the visual check method): the HUD at round start, an overdriven and
  overheating system, a room venting through an airlock.

## Out of scope

Presets, Artemis's DamCon teams (the players are the repair crew), sealed doors, Medbay and Doors power, a Hunter
reactor, scrap upgrades of the reactor, and an Engineering terminal.
