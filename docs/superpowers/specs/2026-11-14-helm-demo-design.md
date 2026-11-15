# Helm Demo: The Gravity-Well Duel (design)

Status: spec written 2026-11-14 from the owner's direction and thesis grill Q11 to Q27. Not yet reviewed. **Gospel: `docs/vision/napkin.md`; binding answers: `docs/vision/thesis-grill.md`** (the grill wins where this spec disagrees). Numbers marked *(start)* are starting values for tuning, not decisions. Defaults marked **(rec.)** are Claude's; the owner can overturn any of them.

## 1. The owner's words

> "core demo i want to build will be around the helm mini game. This is sid meiers pirates inspired navigation around a gravity well in a tactical top down view. Helm will manage the thrust, velocity and turning of the ship to navigate through obsticals, and around enemies. weapons will share that view to target weapons"

> "im thinking a laser weapon and cruise missiles that they control" (Q19)

> "im just talking about the tactical view. We need to be able to scroll in and out in a large map, and the helm pilots the ship through this map." (Q23)

> "These map view gameplay mechanisms/ mini games are perfect for what we're trying to build. Especially because the graphics are minimal. So the players should see these map views when in their terminals, but see the FTL style map of the ship when they leave the consoles, and be able to run around as their character and fix issues/ do tasks around the ship" (Q26, Q27)

Reference for the tactical view: the bridge-simulator genre (the owner named Artemis Spaceship Bridge Simulator). This game takes the genre's ideas (a station screen per player, different views of one shared space, a zoomable map, a bearing ring, arcs drawn on the map) and designs its own screens, art, names and layout. It does not reproduce another game's interface (foundation §12, direction spec A10).

## 2. What the demo is

Two friends on two computers crew one small ship against one enemy ship in a large map around a planet, seen top-down. One player flies the **Helm** (direct stick, real momentum, real gravity). The other runs **Weapons** (a laser with a firing arc and a room lock, and cruise missiles the gunner steers by hand). Seated at a console, each player sees that console's **map view** of the one shared map, centred on their ship (Q25, Q26). Hits damage FTL-style rooms (Engines, Weapons, Shields). To repair one, a player **stands up, sees the FTL-style interior of their ship, and runs their character to the damaged room** to fix it (Q27), while their console sits empty. The duel ends when one hull breaks: about 3 to 5 minutes.

It exists to answer one question: **is gravity-well piloting with a two-person crew fun?** (Q14). It is built so the same map, physics and enemy carry a later three-encounter run (§14).

### Sources (grill)

| Q | Decision |
|---|---|
| Q11 | Design outside and inside together; the demo is the tactical view with a thin room link |
| Q12 | Arcade with real momentum and gravity; mild drag; a stabilise assist on release; slingshots work |
| Q13 | Firing arcs plus room targeting |
| Q14 | One duel around one planet, built to grow into a three-encounter run |
| Q15, Q15b | Exactly two players, Helm and Weapons, no bots; two computers over the network |
| Q16 | Planet: gravity plus a damaging wall, no zones |
| Q17 | Enemy: a blunt hunter under the same rules, written as states |
| Q18 | Helm: direct stick (turn, thrust, reverse, stabilise on release) |
| Q19, Q19b | A laser and cruise missiles steered directly; the laser cannot fire while a missile flies |
| Q20 | FTL shield layers; missiles bypass shields |
| Q21 | A player leaves their console to repair a damaged room |
| Q22 | Acceptance: a five-question checklist plus telemetry targets |
| Q23 | The tactical view is a large map, bigger than one screen, that the player zooms in and out of |
| Q23b | The camera follows the player's ship; the player can pan away and snap back |
| Q23c | One planet, an asteroid belt ring and loose asteroid clusters, stored as data |
| Q24 | Until Net-3, the owner playtests alone, owning both seats and switching between the stations |
| Q25 | One shared map space, a different view per station |
| Q26 | Weapons is ship-centred like the Helm (Q25's sector map withdrawn); minimal map graphics are the style |
| Q27 | At a console: its map view. Standing: the FTL-style interior; walk to rooms and repair there. In the demo |

### Not in the demo

Oxygen, fires, breaches, boarders, medbay, power allocation and the other sector-run interior systems (the interior in the demo is walking, doors, consoles and repair only, §8). Per-room task mini games beyond repair (MG-X). A whole-map sector view (waits for a Science or Captain station, Q26). Bots in seats (Q15). A solo game mode for players (solo exists only as the owner's playtest mode, §11a). The sector run, events, dialogue, shops, careers and the open world. Moons, rings, atmospheres and aerobraking (Q16, Q23c). Directional shields (Q20). Enemy moods (Q17). Sensor range or fog. New art beyond original placeholder shapes (§12). Prediction and rollback (§11b).

## 3. The map

A circular map about 4 to 5 times wider than one screen, with the planet at its centre (Q23c). The map is **data** (a `MapDef`), so a moon, a debris field or a goal circle is added by adding a body, not by changing code.

| Thing | Rule | Values *(start)* |
|---|---|---|
| Map edge | Circle of radius `R_MAP`. A ship past the edge gets an inward acceleration `a = −K_EDGE · (|d| − R_MAP) · d/|d|`; no damage. A missile that crosses it is destroyed (§4 collision matrix). Drawn as a faint boundary | `R_MAP` 2800 units; `K_EDGE` 2 /s² |
| Planet | Static at the origin; pulls every body (ships, missiles); contact costs hull and bounces (Q16) | radius 70; contact 4 hull, bounce keeps 50% of the normal speed, 1 s grace before it can hurt the same ship again |
| Gravity | `a = −GM · d / (|d|² + ε²)^{3/2}` toward the planet | `GM` 2.5e6 (a circular orbit at r = 250 moves at 100 u/s; the pull is about 2 u/s² at the belt and 0.3 u/s² at the edge); `ε` 20 |
| Asteroid belt | A ring of static asteroids between two radii, with 3 **gaps** at seeded bearings wide enough to fly through at speed. Threading the belt is the Helm's obstacle course | inner radius 1100, outer 1300; about 70 asteroids, radius 15 to 45; gaps 160 units wide |
| Loose clusters | 3 clusters of 4 to 7 asteroids at seeded positions between the belt and the edge; cover and obstacles | cluster radius 150; asteroid radius 20 to 55 |
| Asteroids (all) | Static circles. They do not pull. Contact costs hull and bounces; they block laser line of sight | contact 1 hull; bounce keeps 50% of the normal speed; 1 s grace per ship–asteroid pair |
| Spawns | Two spawn points on opposite sides, outside the belt, in slow orbits going the same way, so a fight starts with an approach | r = 2000 |

**Seeded layout:** belt positions, gap bearings and cluster positions come from `rng.tactical` and the duel seed. A generator rejects overlaps (with the planet, each other, the spawns and the gap corridors), so every seed gives a fair map. The layout is part of the published run setup, so both screens draw the same map.

## 4. Physics and determinism

The sim runs at today's 60 Hz (`TICK_HZ`) inside the Net-1 authority and follows its rules from the first commit: commands in, deterministic state out, no client callbacks.

- **Arithmetic:** Float64 using only `+ − × ÷`, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `round`, `sign` (the Net-1 AST guard in `tests/helpers/determinismGuard.ts`, run over every `sim/**` file by `tests/boundary.test.ts`). No `sin`, `cos`, `atan2`, `hypot` or `pow`. `(|d|² + ε²)^{3/2}` is computed as `q · sqrt(q)`.
- **Headings:** a fixed table of **256 unit vectors** in `sim/tactical/headings.ts`, written as numeric literals by a generator script that runs outside the sim (`scripts/gen-headings.ts`, which may use `Math.cos`). A test checks every entry's length against 1 by `sqrt` and checks the table's symmetry. A ship's heading is an index from 0 to 255, plus a fractional turn accumulator.
- **Arcs and sectors without angles:** "inside a ±θ arc" means `dot(h, u) ≥ cos θ · |u|`, where `cos θ` is a literal constant. "Which side" uses the 2-D cross product. Neither needs trigonometry.
- **Integration:** semi-implicit (symplectic) Euler once per tick: apply forces, update velocity, update position. Bodies update in a fixed order (crew ship, enemy, missiles by spawn id). Collisions are circle against circle, resolved in the same fixed order.
- **Collisions** (after all positions update; per body in the fixed order, static bodies first (the planet, then asteroids in ascending index from the broad phase), then the other moving bodies by id; a contact is `|d| < r₁ + r₂`):

  | Pair | Outcome *(start)* |
  |---|---|
  | Ship – planet | Push the ship out along the contact normal to `r₁ + r₂`; reflect the normal velocity component, keeping 50%; 4 hull; then a 1 s grace for that ship and the planet, during which contact still pushes and bounces but costs no hull |
  | Ship – asteroid | Same, 1 hull, grace per ship–asteroid pair |
  | Ship – ship | Push both apart equally along the normal; exchange the normal velocity components, then keep 50% of each; 1 hull each; 1 s grace for the pair |
  | Missile (radius 4) – planet, asteroid or map edge | The missile is destroyed |
  | Missile – the other ship | The missile lands per §7b, then is destroyed |
  | Missile – its own ship | Ignored entirely (no contact, no destruction) for its first 60 ticks (1 s) of flight; after that, it lands per §7b and is destroyed |
  | Missile – missile | Both are destroyed; no damage |
  | Several contacts in one tick | Each is handled in the order above for that body; hull costs add; positions are corrected after each push |
- **Map edge:** applied as a force with gravity (§3), not as a contact, so it needs no correction step.
- **Broad phase:** about 100 static asteroids. A fixed uniform grid (cell 200 units), built once per map, gives each body its nearby asteroids in a fixed cell order. Collisions and line of sight stay cheap and deterministic as maps grow.
- **Randomness:** one new named stream, `rng.tactical`, seeded from the duel seed. It feeds the map layout and the enemy's small decision jitter. Combat hits are geometric and draw no random numbers.

Tests (in `npm test`): **gravity-only configuration** (drag and stabilise switched off by test tuning): a circular orbit at r = 250 holds its radius within 2% over 60 s, and total energy over a 5-minute coast stays within 1% of its start. **Flight configuration** (drag and stabilise on, gravity and the edge off): from rest, full forward thrust is within 5% of 800 u/s after 30 s (the drag time constant is about 6.7 s); a ship heading north at 300 u/s forward with 60 u/s sideways, axes released, has sideways speed below 5 u/s within 60 ticks. The same seed and commands give the same hash; every seed from 1 to 200 produces a valid map (no overlaps, three passable gaps, clear spawns); a golden replay of a scripted duel; arc and sector truth tables.

## 5. The ships

Both ships have identical stats (the enemy is symmetric in the demo).

| Stat | Values *(start)* |
|---|---|
| Body | Circle of radius 20; hull 30 |
| Rooms | **Weapons** (nose), **Shields** (flanks), **Engines** (stern). Each has a damage level of 0, 1 or 2 |
| Shields | 2 layers. Below 2 layers, a recharge clock counts up at 1/s ÷ the Shields-room factor; at 5 s it adds a layer and resets to 0. A laser hit that strips a layer resets the clock to 0. The clock is held (not reset) while the Shields room is at level 2, and resumes at the new factor when repair lowers it. At 2 layers the clock stays at 0 |

**Room by impact point.** A missile hits the room where it physically strikes. Take the impact point `p` relative to the ship centre, `f = dot(p, h)` and `s = cross(h, p)`: nose if `f ≥ |s|`, stern if `−f ≥ |s|`, otherwise flank. Approach angle is the gunner's room choice (Q19b).

**Damage effects** (level 0 / 1 / 2) *(start)*:

| Room | Effect |
|---|---|
| Engines | Thrust and turn rate ×1 / ×0.6 / ×0.25 (Q11) |
| Weapons | Laser charge time ×1 / ×1.6 / ×2.5; missiles cannot launch at level 2 (Q11) |
| Shields | Recharge time ×1 / ×1.5 / stopped, applied to the recharge clock above (Q20) |

Every room hit also deals hull damage (§7). A room at level 2 takes no further room damage, but its hits still cost hull.

## 6. The Helm: flying the ship

Direct stick (Q18). The Helm's client sends **held axes every tick on the existing held-input channel** (`HeldInput.moveX` = turn, `moveY` = thrust, `net/contracts.ts`), so the stick needs no new command kind **(rec.)**. Each axis is −1, 0 or 1.

| Input | Effect *(start)* |
|---|---|
| Turn | 150°/s (1.78 heading steps per tick via the accumulator), × the Engines factor |
| Thrust forward | 120 u/s² along the heading, × the Engines factor |
| Thrust reverse | 40% of forward |
| Drag | Velocity × (1 − 0.15 · dt) each tick (mild, Q12). Terminal speed under full thrust is about 800 u/s, so crossing the map takes several seconds, not a minute |
| **Stabilise** | On the tick both axes go to zero, the assist records the **sideways** speed (perpendicular to the heading) as the skid, then removes it at up to 80 u/s² until it is gone. Sideways speed that gravity adds later is never recorded, so the assist never cancels gravity or forward speed: a released ship stops skidding but still coasts, falls and orbits (Q12: "kills drift" for beginners; experts thrust through it) **(rec.)** |

Keys: keyboard W/S thrust, A/D turn, the existing stand-up key to leave the console (§8); gamepad left stick (x turn, y thrust) or d-pad, triggers as an alternative for thrust and reverse, the existing stand-up button.

**Feel targets** (tuned by hand in the dev flight view, §15): from a standstill near the belt, a pilot threads a gap within 15 s of trying; a slingshot past the planet at r ≈ 150 changes direction by more than 90° and leaves faster than it came in; a released ship sliding sideways at up to 60 u/s stops skidding within 1 s (the assist removes about 80 u/s of skid per second, so a larger skid takes proportionally longer).

## 7. The Weapons console

Two modes on one console: **laser** and **missile in flight** (Q19, Q19b).

### 7a. Laser (Q13)

- **Arc:** ±60° around the nose, range 450 *(start)*. The Weapons view draws the arc, and the enemy's arc too (same rules, §9), so the crew can see where not to be. The Helm's positioning decides whether the enemy is in it.
- **Room lock:** the gunner cycles the locked enemy room (Weapons, Shields, Engines). The lock is shown on the enemy ship on both screens.
- **Charge and release:** holding Fire charges the laser (4 s × the Weapons-room factor). Releasing at full charge fires; releasing early discards the charge. A full charge can be held for 3 s, then it vents and starts over. The skill is timing the release for the moment the enemy is in the arc with line of sight.
- **The shot:** an instant beam. It hits if the enemy is inside the arc and range and the segment between the ships misses the planet and every asteroid; otherwise it is a miss (shown). It draws no random numbers.
- **Effect:** with a shield layer up, it strips one layer. With shields down, the locked room takes +1 damage and the hull takes 2.

### 7b. Cruise missiles (Q19, Q19b)

- **Magazine:** 4, plus 1 regained every 45 s up to 4 *(start)*. One missile in flight at a time **(rec.)**.
- **Launch:** spawned at the ship centre + heading × 25 units (the ship's radius 20, the missile's 4, and 1 clear), with the ship's velocity plus 60 u/s along the heading. Launching switches the console to missile mode.
- **Flight:** the missile thrusts on its own (160 u/s²). The gunner steers it at 120°/s on the held-input channel (turn axis), using the same kind of stick as the Helm's turn. Gravity acts on it, so curving it round the planet is a skill. 6 s of fuel, then it coasts for 2 s and self-destructs.
- **Impact:** with the enemy ship, it bypasses shields (Q20); the room comes from the impact point (§5), that room takes +1 damage and the hull takes 3. A missile hitting the planet, an asteroid or the map edge is destroyed. A missile can hit its own ship after 1 s of flight **(rec.: the gunner has to fly it carefully)**.
- **The trade:** while a missile flies, the laser cannot be charged or fired; a held full charge freezes (no venting). When the missile ends, the console returns to laser mode (Q19b).
- **Unattended missiles:** a missile always burns its 6 s of fuel and then coasts and self-destructs on its own clock, attended or not. "Unattended" (§8) only means its steering input reads zero, so it flies straight under thrust and gravity.

**Weapons state transitions.** The laser has `charge` (0 to full) and a `fireHeld` flag set by `laserCharge {held}`. *Attended* means a present player is seated at Weapons (§8).

| Event | Laser | Missile |
|---|---|---|
| `laserCharge {held: true}`, attended, no missile in flight | `fireHeld` set; charge rises each tick; at full, the 3 s hold timer runs, then it vents to 0 | n/a |
| `laserCharge {held: false}`, attended | Full: fire (§7a), charge to 0. Partial: discard, charge to 0 | n/a |
| `laserCharge` of either kind while a missile flies | Ignored (rejected `missile-in-flight`); charge and hold timer frozen | Unchanged |
| `missileLaunch`, attended, magazine > 0, Weapons room < 2, no missile in flight | Charge and hold timer freeze where they are; `fireHeld` cleared | Launched (§7b) |
| Missile ends (impact, self-destruct, planet, asteroid, edge) | Unfreezes. A frozen full charge resumes its hold timer and needs a fresh `held: true` then `held: false` to fire | — |
| Console becomes unattended (stand up, Tab away, disconnect) | `fireHeld` cleared **without firing or discarding**; charge and hold timer freeze | Steering reads zero |
| Console becomes attended again | Unfreezes; fire needs a fresh `held: true` | Steering resumes |
- **Point defence:** none in the demo. Missiles are dodged by flying, or die on the planet and asteroids **(rec.; the grill leaves it open)**.

Keys: keyboard Q/E cycle the lock, Space hold-to-charge and release, F launch a missile, A/D steer a missile, the stand-up key to leave; the gamepad equivalent.

## 8. The interior: leaving the console, walking and repair (Q21, Q27)

Each player is a character aboard the crew's ship. **Seated at a console, they see its map view (§10). Standing, they see the FTL-style interior of their own ship** and walk their character through it. This reuses FTLite's existing interior, not a new one.

- **The ship:** the **Cutter** layout (`sim/ship/cutter.json`, the FTL-look ship from Demo-iii) **(rec.)**. Its Navigation console (Bridge B, tile 27,6, bow), Weapons console (Weapons W, tile 8,6) and Engines room (E, stern) are separate rooms, and the Cutter has no console groups. The Skiff is ruled out because its Navigation and Weapons share one console. Other Cutter consoles (Science, Doors, Medbay, Life Support, Engineering) are scenery in the demo: `sit` on them is rejected **(rec.)**.
- **The crew:** both characters are the trait-free **Recruit** (`CHARACTERS[4]` in `characters.ts`), with no skill head starts, and **XP is not awarded in the duel**, so walking is exactly `CREW_SPEED` (4 tiles/s) and repair is exactly the §8 time **(rec.)**. Character choice comes back with the sector run.
- **What runs inside:** walking and collision (`movement.ts`), sitting down and standing up, and Interact on the held input (`interactHeld`). **Every door is held open for the whole duel** (`DoorState.HeldOpen`, set at creation): today's doors need the Doors station online, and power is off in the duel. Fires, oxygen, breaches, boarders, power allocation, medbay, events and the director are **off**. The exact phase list is in §13.
- **Consoles are roles.** Sitting at Navigation makes a player the Helm; sitting at Weapons makes them the gunner. Either player may sit at either free console **(rec.)**, so a pair can swap mid-fight. A duel starts with player 0 seated at Navigation and player 1 at Weapons.
- **Present or away.** Each player has a `present` flag in the duel state, true at the start. It changes in two ways, both journaled so replay reproduces them:
  - the player's client sends the `presence {present}` command (solo Tab, §11a), journaled and admitted like any player command;
  - the authority detaches or attaches the player's link. It then queues a **lifecycle presence control**, a new member of the lifecycle control union beside `LifecyclePause`: `LifecyclePresence = { kind: 'presence'; players: number[]; present: boolean }`, with `players` the binding's full player list in ascending order (one link carries two players in solo, §11a). It goes through the same lifecycle-control path (`JournalControl` with `source: 'lifecycle'`, `authority/core.ts`, whose `control` field widens to `LifecyclePause | LifecyclePresence`). It is recorded in that tick's journal `controls` with its ordinal and applied at the next tick boundary. Replay applies the recorded `players` and never consults transport bindings.

  In the seat phase (§13), lifecycle presence controls apply first, then player commands in envelope order. Going away also zeroes that player's held input, as the authority already does on detach. A character whose player is away stays exactly where it is.
- **An empty console** is one with nobody seated, or with a seated player who is away. With Navigation empty, the ship coasts with stabilise on (axes read zero). With Weapons empty, the §7 "unattended" rules apply: the charge freezes, nothing fires, and a missile flies on unsteered.
- **Damage shows inside.** Each tactical room (§5) has a **repair point**, a tile named in the duel's layout data **(rec.)**:

  | Tactical room | Interior room | Tile | Walk from Bridge console | Walk from Weapons console |
  |---|---|---|---|---|
  | Engines | Engines (E) | 2,6 | about 27 tiles, 7 s | about 6 tiles, 1.5 s |
  | Weapons | Weapons (W) | 8,7 | about 22 tiles, 5.5 s | **none**: a character standing up at the Weapons console is already in reach |
  | Shields | Reactor (R) | 16,8 | about 11 tiles, 3 s | about 8 tiles, 2 s |

  A walk is measured to the first position from which the repair is in reach (`REACH`, measured to the tile's square as `interact.ts` does), along paths through the Cutter's doors at 4 tiles/s *(start; H-0 measures them with the scripted pair)*. The gunner fixing their own Weapons room needs no walk **by design (rec.)**: standing up still leaves the console empty for the whole repair, which is the price. Everyone else walks. A damaged room shows its level on the interior view (tint and a marker), and the console overlays list it.
- **Repair:** while standing **inside the repair point's room** and within `REACH` of its tile, hold Interact (`interactHeld`). It is a new interaction target kind for tactical room damage, modelled on today's station repair in `interact.ts` but with the same-room check that the Power target lacks. If several repair targets qualify, the nearest wins, ties to the lower tactical room index (Weapons, Shields, Engines). One damage level takes **4 s** for one repairer *(start)*; two players on the same target each work at the existing `TEAM_MULT` (1.25). Progress is kept when Interact is released, when the repairer walks off or goes away, and when the room takes another hit (a hit adds a level; the progress continues toward lowering it by one). Completing lowers the room by one level and resets the progress.
- **Why hold-to-repair, not the old button sequence:** the walk is now the price of leaving a console, and hold-to-repair is what FTLite's crew already does. The per-room task mini games of the napkin come with MG-X and replace it there **(rec.)**.
- **Inputs:** held axes move the character while standing and fly or steer while seated (§13). Interact is the held `interactHeld` flag. Sitting down and standing up are today's `sit` and `stand` commands; `presence` is new (§13).
- **Enemy repair:** the enemy has no interior. It repairs abstractly at about the same price **(rec.)**, specified in §9.

## 9. The enemy: the hunter (Q17)

A sim-flown ship under the same physics, arcs and rules. It sees only what the crew can see (everything on the map, since the demo has no fog: both ships' positions and velocities, the planet and the asteroids). It drives itself through the **same inputs** as the crew's ship (held axes for turn and thrust, the laser commands, the missile commands), so it is deterministic and fair.

Written as a small state machine; the demo has two states, and moods (Q17 C) are later additions.

- **Hunt:** steer toward a lead point (where the crew's ship will be in 0.5 s at its current velocity). Thrust when the heading error is under 30°. Avoid the planet and asteroids with a **short lookahead**: if the straight-line path over the next 0.75 s comes within `body radius + 30`, turn away and thrust. The short lookahead is the bluntness that lets the Helm bait it into the planet or the belt (Q16, Q17).
- **Standoff** **(rec.)**: the hunter fights at laser range instead of ramming. With the crew's ship more than 320 units away it pursues as above. Within 320 it turns to keep the crew's *current* position (not the lead point) dead ahead and does not thrust forward; if it is closing on the crew faster than 40 u/s (relative velocity along the line between them), it thrusts in reverse to brake. Lookahead avoidance still overrides both. *(start: 320, 40)* Added after the H-0b review: with pure pursuit, rams caused about two thirds of a passive crew's hull loss, which would make the §16 duel-length targets untunable.
- **Firing:** hold Fire whenever the laser is not frozen, so it charges and, once full, holds (and vents after 3 s, §7a, then charges again). The crew's ship is **eligible** when it is inside the arc and range with line of sight. On the first tick the charge is full **and** the crew is eligible, draw one jitter `j` uniformly from 0 to 12 ticks (0.2 s) from `rng.tactical`. Release `j` ticks later if the charge is still full and the crew still eligible. If either stops holding before then, cancel and draw again the next time both hold. A release starts the charge from 0, so the next shot waits a full charge. Lock the crew's Shields room until it reaches level 2, then Weapons (the lock only matters once a shot lands with the crew's shields down). Launch a missile when the crew is within 400, at most one per 30 s. Steer it by simple pursuit toward where the crew's ship was **18 ticks (0.3 s) ago**, read from a ring buffer of the crew ship's last 18 positions kept in the hunter's state (filled with the crew ship's spawn position at the start) (beatable by hard turns and by putting the planet or the belt between them).
- **Repair** (one room at a time, highest damage level first, ties Engines, then Weapons, then Shields): enter Repair when a room is at level 2, or at level 1 while the crew's ship is out of laser range. A Repair visit has a **walk** of 6 s (the stand-in for crossing its ship), then **work** at 4 s per level, then it returns to Hunt; it repairs **one level per visit**. During the whole visit the repaired room's console is "empty" by the §8 rule: repairing Engines zeroes its axes (it coasts with stabilise on); repairing Weapons or Shields means it does not charge, fire, launch or steer a missile (its missile, if any, flies on unsteered). A new hit during the visit does not interrupt it. The timers count ticks and draw no random numbers.

Tuning goal: a competent pair wins about 60 to 70% of the time, and a pair who ignores the planet loses (Q22).

## 10. The console map views

A seated player sees the shared map through their console's own camera (Q23, Q23b, Q25, Q26). Both consoles are **ship-centred**; they differ in what is drawn on top (§10b). The style is minimal vector graphics on dark space, by choice (Q26). Cameras are client-only view state: they are never sent to the authority and never part of the sim hash, so looking around cannot change the game. A standing player sees the interior instead (§8); each console keeps its camera for whoever sits there next.

### 10a. The camera (both consoles)

- **North up.** North is fixed at the top and ships rotate **(rec.)**, so the planet and the orbits stay still on screen and a slingshot reads as a curve.
- **Follow by default.** The camera centres on the player's own ship.
- **Zoom.** Continuous between the closest and the widest view, eased over 0.15 s; about the cursor with the mouse wheel, about the screen centre with keys and gamepad.
  - Closest: about 1.2 px per unit (the ship is about 48 px across; fine flying and aiming).
  - Widest: the whole map fits the screen height (about 0.12 px per unit at 720 px).
  - Default at the start: about 0.5 px per unit (the ship, the nearby belt and part of the well in view).
- **Pan away.** Dragging with the mouse (right or middle button) or the gamepad's right stick moves the camera off the ship. It stays where it was put until the player snaps back **(rec.)**.
- **Snap back.** Keyboard `C` or a right-stick click recentres on the ship with a 0.2 s ease and resumes following.
- **Off-screen arrows.** At the screen edge, arrows point to things off-screen: the player's own ship (always), the enemy and the planet, each with its distance.
- **Keys:** keyboard `−`/`=` and the mouse wheel zoom; gamepad shoulders zoom. These never clash with the Helm's or Weapons' keys.
- **Weapons, missile in flight:** `C` toggles the camera between following the ship and following the missile **(rec.: steering a missile far from the ship needs it on screen)**. The off-screen arrows add the missile.

Because each player zooms and pans on their own, the gunner can watch the enemy while the Helm watches the planet, and either can call out positions by grid square.

### 10b. What the view draws

Original placeholder shapes in Pixi Graphics; the world container is scaled and translated by the camera. Back to front:

1. **Background:** deep space and a faint parallax star field (render only, seeded from the run).
2. **Grid:** a coordinate grid labelled with column letters and row numbers so players can call positions ("they're in D4"). Spacing switches with zoom (500 units wide, 250 close) so lines never crowd.
3. **Gravity contours:** faint rings around the planet at fixed pulls (for example 40, 10 and 3 u/s²), so the well's strength is visible at any zoom.
4. **The map edge.**
5. **Bodies:** the planet (shaded disc) and asteroids (rough original polygons from each asteroid's seed). At wide zoom the belt draws as a band with its gaps visible, and single asteroids are drawn only above a minimum on-screen size.
6. **Ships:** original wedge silhouettes with three room segments tinted by damage, and shield rings. **Below a minimum on-screen size, a ship draws as a fixed-size icon** (a chevron along its heading, coloured crew or enemy), so ships never vanish at wide zoom. Missiles draw with trails.
7. **Per-console layers:**
   - **Helm:** the **predicted path** (about 2 s ahead at close zoom, rising to about 8 s at wide zoom), computed by the same pure physics function from the latest state; a velocity vector; a heading line; the thrust and turn state; a **bearing ring** around the ship (0 to 359, north = 0) at close and middle zoom.
   - **Weapons:** the bearing ring; the own laser arc and range; **the enemy's arc** (dimmer, so the crew sees where not to be); the room lock and bearing and range on the enemy; and in missile mode the missile's predicted path.
8. **Screen-space overlay:** off-screen arrows, the zoom level, a scale bar, the snap-back hint while panned, both hulls, the shield pips, the room damage, and the other player's status (at Helm, at Weapons, walking, repairing). Weapons adds the charge bar and the missile magazine. A short console readout list on one side (hull, shields, room levels, magazine) in the same minimal style **(rec.)**.

Rendering interpolates between published states (render time = latest state minus one tick), so motion stays smooth at 60 fps today and over Net-3's 20 to 30 Hz deltas later.

## 11. Seats, solo playtesting and the network

### 11a. Solo playtesting (Q24)

Until Net-3 exists, the owner playtests alone and runs between the stations.

- **One player, both characters.** The solo player owns both characters (player 0 and player 1) as two player IDs on one local loopback link, which Net-1a already supports. The authority, commands, held input and sim are exactly those Net-3 carries later; only the transport differs. Nothing in the duel is built twice.
- **Switching.** Tab (gamepad: Select/View) switches which character the owner controls, and the screen with it: that character's console view if seated, the interior if standing (Q27). The client sends `presence {present: false}` for the character left and `presence {present: true}` for the one taken, in that order on the same tick, and stops sending held input for the character left (§8). Each screen is exactly what a multiplayer player in that position sees.
- **The character left behind** stays where it is and is *away* (§8). A seated one leaves its console empty: the ship coasts with stabilise on; the laser charge freezes without firing, and a missile flies on unsteered. A standing one stops walking, and any repair it was doing pauses with its progress kept (its Interact reads released). The owner can run one character to a repair, Tab back, and Tab again to finish it.
- **Duel length:** solo duels run longer and harder than two-player ones, because one station is always idle. The Q22 targets apply to two-player sessions; solo telemetry is recorded with a `solo` flag and judged separately.

### 11b. Two screens over the network (Q15b)

- **Seats:** player 0 starts seated at Navigation (Helm) and player 1 at Weapons; the players can swap before starting, or swap consoles during the duel by walking (§8). One player per machine.
- **Transport:** the demo runs over Net-0's chosen stack. By Net-0 and the direction spec A6, **Net-1b comes before Net-3**, and Net-3 is "two machines over the internet, no prediction" (WebRTC, Cloudflare signalling and TURN, join codes). Net-3 needs the owner's Cloudflare account and domain (Net-0 open item 2). Net-3's state and message shapes should be mode-agnostic so the duel rides on it without rework.
- **Net-2 is not a prerequisite for the duel (rec.).** The demo's interior is walked with the held stick, as in the couch game today; Net-2's click-to-move and per-player interior layout are not needed for it.
- **Latency:** without prediction (Net-4), the remote player's inputs show after one round trip plus interpolation. A direct stick is the input most sensitive to this, so seat the Helm on the host machine where possible. The first networked playtests run on one home network (LAN); internet tests follow, with input-to-screen delay measured. If delay makes the Helm feel bad, pulling prediction of **the crew's own ship** forward from Net-4 is the planned remedy (§17).

## 12. Look and sound

**Console views:** minimal vector graphics on dark space, the chosen style (Q26), drawn with Pixi Graphics (§10b): a shaded planet disc, rough asteroid polygons, both ships as original wedge silhouettes with three visible room segments, shield rings, arcs, a beam flash, missile trails, an impact burst and a planet-contact spark. **Interior:** the existing FTL-look Cutter renderer (Demo-iii, Demo-x), plus a damage tint and marker on the three repair rooms. No new art files, so the foundation §12 originality rule holds trivially. The existing music tracks may play; there are no new sound effects beyond reusing the ones that exist.

## 13. Architecture

- **Sim, subtree `sim/tactical/`** (H-0a and H-0b, merged): `map.ts` (`MapDef`, the seeded generator and its validation), `grid.ts` (broad phase), `headings.ts` (generated) and `direction.ts`, `physics.ts` (gravity, the edge spring, flight), `contacts.ts` (ship contacts), `predict.ts` (the pure `predictPath(state, shipIndex, axes, ticks, every)` used by the render), `geometry.ts` (arcs, line of sight, impact room), `weapons.ts` (`ShipInput`, laser, shields, magazine), `missiles.ts`, `hunter.ts`, `duel.ts` (`stepDuel`, one headless tick for both ships), `state.ts` (`TacticalState`: ships, rooms, shields, weapons, missiles, the hunter and its abstract repair, outcome, per-tick events), `hash.ts`, `tuning.ts`. H-0c adds the snapshot encoding and `cloneTactical`. It imports nothing from the sector-run sim beyond `DT` and shared helpers (RNG, hashing).
- **The interior (Q27):** the duel's state is `{ interior, tactical, present }`. `interior` is today's `SimState`, created from the Cutter layout with two Recruits (§8) and every door held open. The sector `stepCommands` (`sim/step.ts`) is **not** called; a new `sim/duel/step.ts` runs its own phase list, and the sector step is unchanged. Each duel tick:
  1. **Reset scratch** as the sector step does.
  2. **Seat phase:** apply `sit` commands through today's interaction-command validation (`commands.ts`), allowed only on the Navigation and Weapons stations; then apply `stand` through the stand handler, which H-0 extracts from `consoleSystem` (`console.ts`) into a shared function so the duel can call it without the sector console effects (beams, scans, torpedoes, door toggles). Then apply `presence`.
  3. **Tactical commands:** `laserLock`, `laserCharge`, `missileLaunch`, validated against the seats **after** step 2: accepted only from a present player now seated at Weapons, else rejected `not-at-weapons`.
  4. **Interact:** the duel's interaction targeting (tactical repair targets only; no fires, breaches, revives, fights or torpedoes) reads each standing, present player's `interactHeld`.
  5. **Movement** (`movementSystem`), for standing, present players only.
  6. **Tactical step** (§4 to §9), reading who is present and seated at Navigation and Weapons, and their held axes.
  7. **Damage hand-over:** tactical room levels are the single source of truth; the interior reads them for repair targets and tints, and a finished repair lowers the tactical level.
  8. **Advance the tick.**

  Same-tick order between players follows the existing envelope order inside each phase. The duel's command allowlist is `sit`, `stand`, `presence`, `laserLock`, `laserCharge`, `missileLaunch` and the session's `setPaused`; anything else is rejected `not-in-duel`.
- **One session, two modes:** the authority gains a mode discriminant, `sector` (today) or `duel`. A run is one or the other. Command validation, ledgers, the tick driver and publication stay shared. `authority/core.ts`, typed to `SimState` today, takes the duel state through that discriminant.
- **Inputs:** held axes are routed by the character's position: **standing**, they walk the character (today's path); **seated at Navigation**, they are the Helm's turn and thrust; **seated at Weapons**, they steer a missile in flight. A new duel command family joins the closed union (an explicit Net-1 amendment, as MG-X will be): `laserLock {room}`, `laserCharge {held}`, `missileLaunch` and `presence {present}`. Sitting and standing use the existing `sit` and `stand` commands; Interact is the held `interactHeld` flag.
- **Client view, new `render/tactical/`:** `camera.ts` (follow, pan, snap, zoom, screen ↔ world transforms; pure and unit-tested), `tacticalLayer.ts` (the draw order in §10b), `offscreen.ts` (edge arrows), `grid.ts`. Camera inputs are handled in the client and never become commands. The screen shows the console view while the player's character is seated and the existing interior renderer while standing.
- **Versioning:** one `SIM_VERSION` bump when the duel mode lands, with a new duel golden. `SIM_VERSION` is hashed into every flattened state (`flatten.ts`), so the sector goldens are **re-blessed for the version number only**: the bless commit must show that only the version field changed, and the sector run's gameplay figures, gates and traces stay unchanged. The tactical state and `rng.tactical` live only in the duel state and its own flatten; the sector `SimState`'s stream list does not change.
- **Scripted pair for tests only:** a headless scripted Helm and gunner (orbit, line up, release in arc, the occasional missile, and standing up to walk to a repair and back) drive telemetry and gate tests. They are never offered as a seat (Q15).
- **Telemetry (per duel):** duration; outcome; laser releases, hits, misses and layers stripped; missiles launched, hits by room, losses by cause; planet and asteroid contacts per ship; enemy planet and belt contacts after crew manoeuvres (baits); repairs started and finished per player; time away from each console, split into walking and repairing; console swaps; time the enemy spent in the laser arc; time Weapons had nothing to do.

## 14. Growing into B (Q14)

Nothing in the duel assumes it is the only encounter. Later, the B run is three encounters on the same map code and physics:

1. **Debris run:** a map with a dense field (static or slow-moving asteroids) and a goal circle.
2. **The duel:** this demo.
3. **Escape:** two hunters and a jump-point circle at the map edge; reaching it ends the encounter.

To make that cheap: the map is data (planet, belt, clusters, spawns, goal circles, and later moons); win and lose conditions are a small list of predicates per encounter; the hunter takes its target as a parameter and its state machine accepts new states.

## 15. Milestones

| # | Milestone | Proves | Depends on |
|---|---|---|---|
| H-0 | **Duel sim, headless** (built as H-0a flight, H-0b combat and the hunter, H-0c interior link and duel step; H-0a and H-0b merged 2026-11-14). First the map, physics, headings and held-input flight (with the orbit, energy, hash and 200-seed map tests); then both consoles' rules, shields, rooms, the hunter, commands; then the **interior link** (§8, §13: the Cutter interior with the duel's systems, seat-routed held input, repair points and the tactical-repair target); telemetry, the scripted pair and the golden replay | The rules are deterministic and tunable; the scripted duels, walking to repairs included, hit the telemetry targets | Net-1a (in) |
| H-1 | **Dev view and solo playtest.** First a **dev flight view**: one ship, one player, the follow camera (§10a) and the Helm layer, to meet the §6 feel targets by hand. Then the Weapons layer; then **standing up into the interior view**, walking to a repair and sitting back down; then the **solo playtest mode** (one player, both characters, Tab between them, §11a). Not the multiplayer demo (Q15b) | Feel tuning starts early; the owner flies it and runs the ship | H-0 (flight part first) |
| H-2 | **The networked duel (the demo).** Two machines, one player each, over Net-3. LAN playtests first, then internet. Run the Q22 checklist | **Is it fun?** | H-1, Net-1b, Net-3 |
| H-3 | **The B run.** Debris run and escape (§14) | The map and physics carry more than a duel | H-2 passed |

H-1 includes the solo playtest mode (§11a), so the owner plays the full duel by switching stations before Net-3; the dev split view is optional once switching works. H-0's flight part and H-1's flight view come first: everything else in the duel sits on top of them. H-0 and H-1 run alongside Net-1b. Roadmap item 36 records this order. It puts the Helm demo ahead of the direction spec's MG-0/MG-X/MG-1a sequence for now; those milestones remain. The duel already carries a walking interior (Q27); MG-1a's integrated encounter becomes this duel plus the rest of the interior (fires, oxygen, power, boarders) and MG-X's per-room tasks.

## 16. Acceptance (Q22)

**Telemetry gates** (headless, scripted pair against the hunter, seeds 1 to 10): median duel length 3 to 5 minutes; both outcomes occur; both weapons used in every duel; no duel ends from planet contact in under 30 s; same-seed hash and golden replay pass. These gate H-0. The live gates in H-2 use the real telemetry.

**Playtest checklist** (H-2, after each session, yes/no):
1. Did the Helm use the planet's gravity on purpose at least once (a slingshot or a bait)?
2. Did the two players talk to coordinate ("bring the nose round", "missile away")?
3. Did either player run from their console to repair at a moment that mattered?
4. Can each player retell one fight moment?
5. Did they want to play again straight away?

**The demo is done** when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel). Results go in `docs/gates.md` under a new "Helm demo" section and in a playtest report.

## 17. Risks

1. **Network latency on a direct stick.** The biggest risk (§11b). Mitigation: seat the Helm on the host, LAN first, measure, pull own-ship prediction forward if needed.
2. **The demo waits on Net-1b and Net-3.** Mitigation: H-0 and H-1 proceed in parallel; the owner's Cloudflare setup is requested early.
3. **The gunner is idle while the Helm lines up, or during the approach across a large map.** Missiles, the room lock and repair give Weapons work; telemetry tracks time with nothing to do. If the approach is dull, move the spawns in (§3).
4. **Gravity makes the fight a spiral.** If both ships settle into the same orbit, add tuning (spawn orbits, enemy lead) before adding systems.
5. **The hunter is too dumb or too good.** Tuned against the scripted pair first, then by playtest; its numbers are all in `sim/tactical/tuning.ts`.
6. **Determinism with Float64.** IEEE `+ − × ÷ sqrt` are exact and identical across engines, but literals and operation order must be fixed; the real-browser cross-engine harness from Net-1b runs the duel golden too.
7. **Reusing the sector interior couples the duel to `SimState`.** The interior systems were written for the sector run and read many of its fields. Mitigation: the duel runs only the phases it lists (§13); a test asserts that a duel's interior never starts fires, breaches, boarders or events; the sector run's gameplay traces must stay unchanged (its goldens change only by the version number, §13).
8. **Walking makes repair too slow or too cheap.** The Cutter's walks (1.5 to 7 s, §8) plus 4 s per level are the price. Tune with the repair time and the Shields repair point's position before changing the ship.

## 18. Open questions (defaults taken meanwhile)

1. Stabilise kills only sideways drift, not all motion (§6). **(rec.)**
2. Turn, thrust and missile steering ride the existing held-input channel (§6, §13). **(rec.)**
3. One missile in flight at a time; the magazine regenerates (§7b). **(rec.)**
4. Missiles can hit their own ship after 1 s (§7b). **(rec.)**
5. No point defence in the demo (§7b). **(rec.)**
6. The enemy repairs abstractly at the same price plus a fixed walk allowance (§8). **(rec., in grill Q21)**
7. North-up with a rotating ship, not heading-up (§10a). **(rec.)**
8. The camera stays where it was panned until the player snaps back; no automatic return (§10a). **(rec.)**
9. Everything on the map is visible to both players and the enemy; no sensor range or fog (§9, §10). **(rec.)**
10. Net-2 is not needed for the duel; Net-3 is written mode-agnostic (§11b). **(rec.)**
11. The dev flight view in H-1 is a workbench; the solo playtest mode is the owner's, not a player-facing game mode (§11a, §15). **(rec.)**
12. Map size, belt radii and spawns at r = 2000 (§3) need checking against the 3 to 5 minute target once the hunter exists. *(start)*
13. Tab (gamepad Select/View) switches the controlled character in solo (§11a). **(rec.)**
14. At Weapons, `C` during a missile's flight toggles the camera between the ship and the missile (§10a). **(rec.)**
15. The Cutter is the duel ship; its other consoles are scenery (§8). **(rec.)**
16. Either player may sit at either free console mid-duel (§8). **(rec.)**
17. Repair is hold-to-repair, 4 s per level, until MG-X's per-room tasks (§8). **(rec.)** *(start)*
18. The Shields repair point sits in the Cutter's Reactor room (R) (§8). **(rec.)**
19. Both crew are trait-free Recruits with no XP in the duel (§8). **(rec.)**
20. Every Cutter door is held open in the duel (§8). **(rec.)**
21. The hunter keeps a standoff at 320 units and brakes when closing faster than 40 u/s (§9). **(rec.)** *(start)*

## Change log

- 2026-11-14: written from the owner's Helm direction and grill Q11 to Q22.
- 2026-11-14: grill Q24: solo playtesting until Net-3, one player owning both seats and switching stations (§11a); H-1 gains the solo mode.
- 2026-11-14: folded in the tactical view (grill Q23 to Q23c): a large zoomable map with one planet, an asteroid belt and clusters; a per-player follow camera with pan, snap and zoom; the view's draw order; held-input flight and missile steering. The one-screen arena and the fixed shared camera are gone. The short-lived separate tactical view spec was merged here and deleted.
- 2026-11-14: grill Q25: one shared map, two views. The Helm keeps the follow camera; Weapons gets a whole-map sector view on the lettered grid that zooms and pans but does not follow (§2, §10, §10a, §10b, §18 item 14).
- 2026-11-14: grill Q26 and Q27. Weapons is ship-centred like the Helm (the sector view is withdrawn until a Science or Captain station). Players are characters aboard the Cutter: seated, they see their console's map view; standing, they see the FTL-style interior and walk to the damaged room to repair it (hold-to-repair, replacing the button-sequence mini game). Consoles are roles; solo Tab switches characters. Rewrote §2, §8, §10, §10a, §10b, §11, §12, §13 and §15; added risks 7 and 8 and open items 15 to 18.
- 2026-11-14: H-0a plan review (R1-F1): stabilise removes only the skid recorded at release, so it never cancels gravity (§6).
- 2026-11-14: after H-0b (merged): §9 hunter standoff band (it rammed constantly with pure pursuit); §4 guard reference and contact order match the code (ascending asteroid index); §13 module list matches what H-0a/H-0b built; §15 notes the H-0a/b/c split; §18 item 21.
