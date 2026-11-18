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

The Hound has a **reactor of 8 bars** and five powered systems:

| System | Max bars | What each bar does | At 0 bars |
|---|---|---|---|
| Shields | 4 | every 2 bars is one shield layer (cap = floor(bars / 2)); bars also set the recharge rate | no layers, no recharge |
| Weapons | 3 | laser charge rate and torpedo reload (magazine regen) rate | the laser cannot charge, torpedoes cannot launch |
| Engines | 3 | thrust and turn rate | the ship cannot thrust or turn (it still drifts) |
| Sensors | 2 | Science scan rate (and the Helm/Weapons scan rate) | no scans |
| Oxygen | 2 | Life Support air injection rate | no injection; the air runs down |

- Total demand at max is 14 against 8, so something always goes hungry.
- **Start of every round:** Shields 2, Weapons 2, Engines 2, Sensors 1, Oxygen 1 (8 used, 0 spare).
- **Damage knocks out bars (FTL).** Each damage level on a tactical Room removes one usable bar from its system:
  Room.Weapons → Weapons, Room.Shields → Shields, Room.Engines → Engines. A system's *effective* bars are
  `min(powered, max + overdrive − damage)`. A bar that damage knocks out returns to the reactor pool at once. Repair
  restores capacity, not power: the player re-adds the bar.
- Sensors and Oxygen have no tactical Room today, so in the spike they take no weapon damage. Their rooms can still
  burn and breach, and Sensors can overheat. Note this in the report.
- **Rates by bars.** The crew ship's tactical tables are indexed by effective bars instead of damage level:
  `LASER_CHARGE_RATE`, the magazine regen, `SHIELD_RATE` plus the layer cap, `ENGINE_FACTOR` (thrust and turn), and the
  scan rates. Start values: 0 bars = today's level-2 value (off), the round-start bars = today's level-0 value, each
  bar above that +25 %, each bar below it interpolated toward off. Tune freely; record the final tables in the report.
- The Hunter's `rooms` damage levels and its tables stay exactly as today.

## 3. Overdrive, heat and coolant (Artemis on FTL bars)

- Every system except Oxygen may take **one overdrive bar** above its max (it still costs a reactor bar). The overdrive
  bar adds another +25 % on its rate.
- While overdriven a system gains heat; otherwise it cools. **8 coolant units** are shared (Artemis's 8, up from the
  old sector game's 4); each system holds 0, 1 or 2. Coolant is never consumed.
- Heat rules come from the sector game's `heat.ts` (HEAT_MAX 240, HEAT_RISE 2, HEAT_COOL_UNIT 1, HEAT_COOL_IDLE 4 per
  hazard tick): one coolant unit slows the rise, two hold it level.
- **Overheat:** at HEAT_MAX the system fails. Its bars return to the pool, and it rolls OVERHEAT_FIRE_CHANCE to set
  its room alight. A failed system takes no bars until its heat has cooled back to 0 (HEAT_COOL_IDLE plus its
  coolant). Every system can recover this way, including Sensors, which has no repair point.
- `heat.ts` and `power.ts` are keyed by the sector game's StationKind, which has no Shields, Engines or Sensors. The
  spike therefore adds a small duel power module (`sim/duel/power.ts`: bars, overdrive, heat and coolant per duel
  system) that ports those rules. It does not bend the sector code.

## 4. Oxygen, breaches and fire

The duel interior is already a full sector `SimState`. The spike turns on the sector hazard code it already carries.

- **Oxygen per room** through `hazards/oxygen.ts`'s flow model: air moves through open doors, closed doors leak a
  little (PASSAGE_CLOSED), and space is a fixed zero. Crew breathe (BREATH_RATE).
- **Life Support** (room L) injects air at a rate set by the Oxygen system's effective bars (0 = none). With 0 bars the
  ship slowly runs down.
- **Breaches.** An enemy hit on the crew ship rolls a breach chance (start: laser 0.2, missile 0.5) on a breach site in
  the struck Room's repair room (rng.hazards, one draw per hit, none if that room is already breached). A breached room
  vents to space. A player standing at the breach site patches it with the same work loop as putting out a fire (solo
  and team rates as for fire).
- **Low air hurts:** a conscious crew member in a room below **25 %** oxygen loses health at O2_DAMAGE per second
  through the duel health system (downed and revive as today). The 25 % line is a spike value, above the sector
  game's 10 %.
- **Fire needs air (FTL).** The duel's fire uses the sector fire step: it burns oxygen (FIRE_O2_RATE), shrinks below
  about 15 % air, goes out at 0, and **spreads to neighbouring rooms through open doors**. A fire in a tactical repair
  room keeps today's damage cadence (DUEL_FIRE_DAMAGE_TICKS). Enemy hits still ignite as today.
- **Venting.** An open airlock (H, L) empties its room in about 2 s. Open the doors between a burning room and an
  airlock room to vent it; the fire goes out and anyone inside starts to suffocate.

## 5. Doors

- Doors start in **auto**: closed, but they open for a crew member walking through and close behind (the sector door
  behaviour). Today's duel holds every door open; the spike drops that.
- **Click a door** in the ship view: auto → held open → auto. **Click an airlock:** closed → open → closed.
- These are sim commands (`door`, `airlock`, each naming the edge or airlock index), accepted from **any player whose
  screen shows the ship view**: on foot, or seated with the SHIP tab open. The sim only checks that the player is
  conscious and present. Range is not checked: remote opening is allowed. The last command wins.
- Sealing (the sector game's Sealed state) is out of the spike.

## 6. Ship-view HUD (amber CRT)

The HUD is drawn whenever a player's screen shows the interior, in the amber CRT look of the consoles (palette, scan
lines and glow from the CRT map). It has no seat and no terminal.

- **Power columns** at the bottom left: one column per system (Shields, Weapons, Engines, Sensors, Oxygen) showing
  powered bars, empty capacity, bars lost to damage (crossed), and the overdrive bar. **Left-click** a column adds a
  bar; **right-click** removes one. Keys: none in the spike, since the mouse is the controller in the ship view.
- **Reactor:** the spare bars, as a column beside the systems.
- **Heat and coolant:** a heat bar under each column (amber → red), and a coolant pip counter (0 to 2) that cycles on
  click. The pool's free units are shown by the reactor column.
- **On the interior:** a per-room air tint (amber fades to red below 25 %), breach and fire icons, door and airlock
  glyphs that read auto, held open or open to space, and a hover highlight on a clickable door.
- The commands go through the normal intent and command path, so they work online.
- Presets (Artemis's SHIFT+number) are out of the spike. Note them in the report as a candidate.

## 7. Sim modules and the wire

- A new duel module `power` (after `helm`, before `interior`): per system its powered bars, heat and coolant, plus the
  failed flags. Commands `power` (system, +1/−1), `coolant` (system), `door`, `airlock`. Reasons: `malformed`,
  `stale-tick`, `unavailable` (no free bar, at max, the system failed and is still hot, the player is downed or away).
- Oxygen, breaches, airlocks, fire and doors already live in the interior's flattened state, so they need no new field.
  The spike measures the snapshot growth anyway.
- `tests/duelModules.test.ts` must hold every new DuelState member to a field or an exclusion.

## 8. Testing

- Sim tests:
  - bars never exceed the reactor or a system's max plus overdrive;
  - a damage level knocks out a bar and returns it to the pool;
  - repair restores capacity but not power;
  - rates follow effective bars;
  - heat rises only while overdriven, and two coolant units hold it level;
  - an overheat fails the system and may ignite its room, and the system takes bars again once cooled;
  - Life Support at 0 bars runs the air down;
  - a breach vents a room, and patching it stops the venting;
  - an open airlock vents a room in about 2 s and puts its fire out;
  - fire spreads through an open door but not a closed one;
  - crew below 25 % air lose health;
  - door and airlock commands are accepted from any present, conscious player and rejected from a downed one.
- Determinism: hash agreement over a seed sweep with the new systems running; the goldens re-blessed on the branch.
- App smoke: click a power column, a coolant counter and a door in the running app; assert the state changed.
- Screenshots (playwright-core and Electron, as in the visual check method): the HUD at round start, an overdriven and
  overheating system, a room venting through an airlock.

## Out of scope

Presets, Artemis's DamCon teams (the players are the repair crew), sealed doors, Medbay and Doors power, a Hunter
reactor, scrap upgrades of the reactor, and an Engineering terminal.
