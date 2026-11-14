# Helm Demo: The Gravity-Well Duel (design)

Status: spec written 2026-11-14 from the owner's direction and thesis grill Q11 to Q23c. Not yet reviewed. **Gospel: `docs/vision/napkin.md`; binding answers: `docs/vision/thesis-grill.md`** (the grill wins where this spec disagrees). Numbers marked *(start)* are starting values for tuning, not decisions. Defaults marked **(rec.)** are Claude's; the owner can overturn any of them.

## 1. The owner's words

> "core demo i want to build will be around the helm mini game. This is sid meiers pirates inspired navigation around a gravity well in a tactical top down view. Helm will manage the thrust, velocity and turning of the ship to navigate through obsticals, and around enemies. weapons will share that view to target weapons"

> "im thinking a laser weapon and cruise missiles that they control" (Q19)

> "im just talking about the tactical view. We need to be able to scroll in and out in a large map, and the helm pilots the ship through this map." (Q23)

Reference for the tactical view: the bridge-simulator genre (the owner named Artemis Spaceship Bridge Simulator). This game takes the genre's ideas (a station screen per player, a zoomable map, a bearing ring, arcs drawn on the map) and designs its own screens, art, names and layout. It does not reproduce another game's interface (foundation §12, direction spec A10).

## 2. What the demo is

Two friends on two computers crew one small ship against one enemy ship in a large map around a planet, seen top-down. One player flies the **Helm** (direct stick, real momentum, real gravity). The other runs **Weapons** (a laser with a firing arc and a room lock, and cruise missiles the gunner steers by hand). Each player has their own zoomable view of the same map. Hits damage FTL-style rooms (Engines, Weapons, Shields), and a player has to leave their console to repair them. The duel ends when one hull breaks: about 3 to 5 minutes.

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

### Not in the demo

Interior crew, oxygen, fires, doors and walking (the full inside link comes after, Q11). Bots in seats (Q15). A solo game mode for players (solo exists only as the owner's playtest mode, §11a). The sector run, events, dialogue, shops, careers and the open world. Moons, rings, atmospheres and aerobraking (Q16, Q23c). Directional shields (Q20). Enemy moods (Q17). Sensor range or fog. New art beyond original placeholder shapes (§12). Prediction and rollback (§11b).

## 3. The map

A circular map about 4 to 5 times wider than one screen, with the planet at its centre (Q23c). The map is **data** (a `MapDef`), so a moon, a debris field or a goal circle is added by adding a body, not by changing code.

| Thing | Rule | Values *(start)* |
|---|---|---|
| Map edge | Circle of radius `R_MAP`. Past the edge a soft spring pushes bodies back in; no damage. Drawn as a faint boundary | `R_MAP` 2800 units |
| Planet | Static at the origin; pulls every body (ships, missiles); contact costs hull and bounces (Q16) | radius 70; contact 4 hull, bounce keeps 50% of the normal speed, 1 s grace before it can hurt the same ship again |
| Gravity | `a = −GM · d / (|d|² + ε²)^{3/2}` toward the planet | `GM` 2.5e6 (a circular orbit at r = 250 moves at 100 u/s; the pull is about 2 u/s² at the belt and 0.3 u/s² at the edge); `ε` 20 |
| Asteroid belt | A ring of static asteroids between two radii, with 3 **gaps** at seeded bearings wide enough to fly through at speed. Threading the belt is the Helm's obstacle course | inner radius 1100, outer 1300; about 70 asteroids, radius 15 to 45; gaps 160 units wide |
| Loose clusters | 3 clusters of 4 to 7 asteroids at seeded positions between the belt and the edge; cover and obstacles | cluster radius 150; asteroid radius 20 to 55 |
| Asteroids (all) | Static circles. They do not pull. Contact costs hull and bounces; they block laser line of sight | contact 1 hull |
| Spawns | Two spawn points on opposite sides, outside the belt, in slow orbits going the same way, so a fight starts with an approach | r = 2000 |

**Seeded layout:** belt positions, gap bearings and cluster positions come from `rng.tactical` and the duel seed. A generator rejects overlaps (with the planet, each other, the spawns and the gap corridors), so every seed gives a fair map. The layout is part of the published run setup, so both screens draw the same map.

## 4. Physics and determinism

The sim runs at today's 60 Hz (`TICK_HZ`) inside the Net-1 authority and follows its rules from the first commit: commands in, deterministic state out, no client callbacks.

- **Arithmetic:** Float64 using only `+ − × ÷`, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `round`, `sign` (the Net-1 AST guard, `tests/determinismGuard.test.ts`, already covers `sim/**`). No `sin`, `cos`, `atan2`, `hypot` or `pow`. `(|d|² + ε²)^{3/2}` is computed as `q · sqrt(q)`.
- **Headings:** a fixed table of **256 unit vectors** in `sim/tactical/headings.ts`, written as numeric literals by a generator script that runs outside the sim (`scripts/gen-headings.ts`, which may use `Math.cos`). A test checks every entry's length against 1 by `sqrt` and checks the table's symmetry. A ship's heading is an index from 0 to 255, plus a fractional turn accumulator.
- **Arcs and sectors without angles:** "inside a ±θ arc" means `dot(h, u) ≥ cos θ · |u|`, where `cos θ` is a literal constant. "Which side" uses the 2-D cross product. Neither needs trigonometry.
- **Integration:** semi-implicit (symplectic) Euler once per tick: apply forces, update velocity, update position. Bodies update in a fixed order (crew ship, enemy, missiles by spawn id). Collisions are circle against circle, resolved in the same fixed order.
- **Broad phase:** about 100 static asteroids. A fixed uniform grid (cell 200 units), built once per map, gives each body its nearby asteroids in a fixed cell order. Collisions and line of sight stay cheap and deterministic as maps grow.
- **Randomness:** one new named stream, `rng.tactical`, seeded from the duel seed. It feeds the map layout, repair prompts and the enemy's small decision jitter. Combat hits are geometric and draw no random numbers.

Tests (in `npm test`): a circular orbit at r = 250 holds its radius within 2% over 60 s with no thrust; energy drift stays bounded over a 5-minute coast; the same seed and commands give the same hash; every seed from 1 to 200 produces a valid map (no overlaps, three passable gaps, clear spawns); a golden replay of a scripted duel; arc and sector truth tables.

## 5. The ships

Both ships have identical stats (the enemy is symmetric in the demo).

| Stat | Values *(start)* |
|---|---|
| Body | Circle of radius 20; hull 30 |
| Rooms | **Weapons** (nose), **Shields** (flanks), **Engines** (stern). Each has a damage level of 0, 1 or 2 |
| Shields | 2 layers; one layer recharges every 5 s while undamaged |

**Room by impact point.** A missile hits the room where it physically strikes. Take the impact point `p` relative to the ship centre, `f = dot(p, h)` and `s = cross(h, p)`: nose if `f ≥ |s|`, stern if `−f ≥ |s|`, otherwise flank. Approach angle is the gunner's room choice (Q19b).

**Damage effects** (level 0 / 1 / 2) *(start)*:

| Room | Effect |
|---|---|
| Engines | Thrust and turn rate ×1 / ×0.6 / ×0.25 (Q11) |
| Weapons | Laser charge time ×1 / ×1.6 / ×2.5; missiles cannot launch at level 2 (Q11) |
| Shields | Recharge time ×1 / ×1.5 / stopped (Q20) |

Every room hit also deals hull damage (§7). A room at level 2 takes no further room damage, but its hits still cost hull.

## 6. The Helm: flying the ship

Direct stick (Q18). The Helm's client sends **held axes every tick on the existing held-input channel** (`HeldInput.moveX` = turn, `moveY` = thrust, `net/contracts.ts`), so the stick needs no new command kind **(rec.)**. Each axis is −1, 0 or 1.

| Input | Effect *(start)* |
|---|---|
| Turn | 150°/s (1.78 heading steps per tick via the accumulator), × the Engines factor |
| Thrust forward | 120 u/s² along the heading, × the Engines factor |
| Thrust reverse | 40% of forward |
| Drag | Velocity × (1 − 0.15 · dt) each tick (mild, Q12). Terminal speed under full thrust is about 800 u/s, so crossing the map takes several seconds, not a minute |
| **Stabilise** | While both axes are zero, the assist cancels **sideways** velocity (perpendicular to the heading) at up to 80 u/s². It never cancels gravity or forward speed, so a released ship stops skidding but still coasts, falls and orbits (Q12: "kills drift" for beginners; experts thrust through it) **(rec.)** |

Keys: keyboard W/S thrust, A/D turn, R repair; gamepad left stick (x turn, y thrust) or d-pad, triggers as an alternative for thrust and reverse, a face button for repair.

**Feel targets** (tuned by hand in the dev flight view, §15): from a standstill near the belt, a pilot threads a gap within 15 s of trying; a slingshot past the planet at r ≈ 150 changes direction by more than 90° and leaves faster than it came in; a released ship at cruise speed stops skidding within 1 s.

## 7. The Weapons console

Two modes on one console: **laser** and **missile in flight** (Q19, Q19b).

### 7a. Laser (Q13)

- **Arc:** ±60° around the nose, range 450 *(start)*. The Weapons view draws the arc. The Helm's positioning decides whether the enemy is in it.
- **Room lock:** the gunner cycles the locked enemy room (Weapons, Shields, Engines). The lock is shown on the enemy ship on both screens.
- **Charge and release:** holding Fire charges the laser (4 s × the Weapons-room factor). Releasing at full charge fires; releasing early discards the charge. A full charge can be held for 3 s, then it vents and starts over. The skill is timing the release for the moment the enemy is in the arc with line of sight.
- **The shot:** an instant beam. It hits if the enemy is inside the arc and range and the segment between the ships misses the planet and every asteroid; otherwise it is a miss (shown). It draws no random numbers.
- **Effect:** with a shield layer up, it strips one layer. With shields down, the locked room takes +1 damage and the hull takes 2.

### 7b. Cruise missiles (Q19, Q19b)

- **Magazine:** 4, plus 1 regained every 45 s up to 4 *(start)*. One missile in flight at a time **(rec.)**.
- **Launch:** fired from the nose with the ship's velocity plus 60 u/s along the heading. Launching switches the console to missile mode.
- **Flight:** the missile thrusts on its own (160 u/s²). The gunner steers it at 120°/s on the held-input channel (turn axis), using the same kind of stick as the Helm's turn. Gravity acts on it, so curving it round the planet is a skill. 6 s of fuel, then it coasts for 2 s and self-destructs.
- **Impact:** with the enemy ship, it bypasses shields (Q20); the room comes from the impact point (§5), that room takes +1 damage and the hull takes 3. A missile hitting the planet, an asteroid or the map edge is destroyed. A missile can hit its own ship after 1 s of flight **(rec.: the gunner has to fly it carefully)**.
- **The trade:** while a missile flies, the laser cannot be charged or fired; a held full charge freezes (no venting). When the missile ends, the console returns to laser mode (Q19b).
- **Point defence:** none in the demo. Missiles are dodged by flying, or die on the planet and asteroids **(rec.; the grill leaves it open)**.

Keys: keyboard Q/E cycle the lock, Space hold-to-charge and release, F launch a missile, A/D steer a missile, R repair; the gamepad equivalent.

## 8. Damage and repair (Q21)

Either player can leave their console to repair one damaged room.

- **Leaving:** press Repair, choose a damaged room, and the player's screen shows the repair mini game in place of their console. While the Helm is away, axes read zero (the ship coasts with stabilise on). While the gunner is away, the laser charge freezes and a missile in flight coasts unsteered. Press Repair again to go back at any time; repair progress on the current step is kept.
- **The mini game:** the sim deals a sequence of **6 direction prompts** per damage level from `rng.tactical`. Each correct press advances it; a wrong press locks input for 0.5 s. Completing a sequence lowers that room by one level. A quick player clears a level in about 3 to 4 s *(start)*.
- **Why sim-owned:** the sequence lives in the authority and presses arrive as commands, so the outcome is deterministic and no client-reported quality is needed. This is deliberately smaller than MG-X's attempt model (direction spec A1, A2). If MG-X lands first, repair moves onto it.
- **Enemy repair:** the enemy repairs too, at the same price **(rec.)**: repairing Engines stops it turning and thrusting; repairing Weapons or Shields stops it firing. It uses the same per-level duration (§9).

## 9. The enemy: the hunter (Q17)

A sim-flown ship under the same physics, arcs and rules. It sees only what the crew can see (everything on the map, since the demo has no fog: both ships' positions and velocities, the planet and the asteroids). It drives itself through the **same inputs** as the crew's ship (held axes for turn and thrust, the laser commands, the missile commands), so it is deterministic and fair.

Written as a small state machine; the demo has two states, and moods (Q17 C) are later additions.

- **Hunt:** steer toward a lead point (where the crew's ship will be in 0.5 s at its current velocity). Thrust when the heading error is under 30°. Avoid the planet and asteroids with a **short lookahead**: if the straight-line path over the next 0.75 s comes within `body radius + 30`, turn away and thrust. The short lookahead is the bluntness that lets the Helm bait it into the planet or the belt (Q16, Q17).
- **Firing:** charge the laser continuously and release when the crew's ship is in arc with line of sight, after a 0.2 s jitter from `rng.tactical`. Lock the crew's Shields room until it reaches level 2, then Weapons (the lock only matters once a shot lands with the crew's shields down). Launch a missile when the crew is within 400, at most one per 30 s, and steer it with simple pursuit with a 0.3 s reaction lag (beatable by hard turns and by putting the planet or the belt between them).
- **Repair:** when a room is at level 2, or at level 1 and the crew's ship is out of laser range, enter **Repair** for that room (§8 price), then return to Hunt.

Tuning goal: a competent pair wins about 60 to 70% of the time, and a pair who ignores the planet loses (Q22).

## 10. The tactical view

Each player sees the same map on their own screen through their own camera (Q23, Q23b). The camera is client-only view state: it is never sent to the authority and never part of the sim hash, so looking around cannot change the game.

### 10a. The camera

- **Follow by default.** The camera centres on the player's own ship. North is fixed at the top and the ship rotates **(rec.)**, so the planet and the orbits stay still on screen and a slingshot reads as a curve.
- **Zoom.** Continuous between the closest and the widest view, eased over 0.15 s; about the cursor with the mouse wheel, about the screen centre with keys and gamepad.
  - Closest: about 1.2 px per unit (the ship is about 48 px across; fine flying and aiming).
  - Widest: the whole map fits the screen height (about 0.12 px per unit at 720 px).
  - Default at the start: about 0.5 px per unit (the ship, the nearby belt and part of the well in view).
- **Pan away.** Dragging with the mouse (right or middle button) or the gamepad's right stick moves the camera off the ship. It stays where it was put until the player snaps back **(rec.)**.
- **Snap back.** Keyboard `C` or a right-stick click recentres on the ship with a 0.2 s ease and resumes following.
- **Off-screen arrows.** At the screen edge, arrows point to things off-screen: the player's own ship (always), the enemy and the planet, each with its distance.
- **Keys:** keyboard `−`/`=` and the mouse wheel zoom; gamepad shoulders zoom. These never clash with the Helm's or Weapons' keys.

Because the camera is per player, the gunner can watch the enemy while the Helm watches the planet.

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
   - **Weapons:** the laser arc and range, the charge bar, the room lock on the enemy, the missile count, and in missile mode the missile's predicted path.
8. **Screen-space overlay:** off-screen arrows, the zoom level, a scale bar, the snap-back hint while panned, both hulls, the shield pips, the room damage and the other player's status (flying, firing, repairing).

Rendering interpolates between published states (render time = latest state minus one tick), so motion stays smooth at 60 fps today and over Net-3's 20 to 30 Hz deltas later.

## 11. Seats, solo playtesting and the network

### 11a. Solo playtesting (Q24)

Until Net-3 exists, the owner playtests alone and runs between the stations.

- **One player, both seats.** The solo player owns both seats (Helm = player 0, Weapons = player 1) as two player IDs on one local loopback link, which Net-1a already supports. The authority, commands, held input and sim are exactly those Net-3 carries later; only the transport differs. Nothing in the duel is built twice.
- **Switching.** Tab (gamepad: Select/View) swaps the screen between the Helm and Weapons. Each station keeps its own camera (§10a), and the screen is exactly what a multiplayer player at that station sees.
- **The station left behind** behaves as if its player stepped away, the same rule as leaving for a repair (§8): the Helm's axes read zero, so the ship coasts with stabilise on; the laser charge freezes and a missile in flight coasts unsteered. Repair works as in §8 from either station.
- **Duel length:** solo duels run longer and harder than two-player ones, because one station is always idle. The Q22 targets apply to two-player sessions; solo telemetry is recorded with a `solo` flag and judged separately.

### 11b. Two screens over the network (Q15b)

- **Seats:** the lobby assigns player 0 to the Helm and player 1 to Weapons; the players can swap before starting. One player per machine.
- **Transport:** the demo runs over Net-0's chosen stack. By Net-0 and the direction spec A6, **Net-1b comes before Net-3**, and Net-3 is "two machines over the internet, no prediction" (WebRTC, Cloudflare signalling and TURN, join codes). Net-3 needs the owner's Cloudflare account and domain (Net-0 open item 2). Net-3's state and message shapes should be mode-agnostic so the duel rides on it without rework.
- **Net-2 is not a prerequisite for the duel (rec.).** Click-to-move and the per-player FTL layout serve the interior game (MG-1b), not this view.
- **Latency:** without prediction (Net-4), the remote player's inputs show after one round trip plus interpolation. A direct stick is the input most sensitive to this, so seat the Helm on the host machine where possible. The first networked playtests run on one home network (LAN); internet tests follow, with input-to-screen delay measured. If delay makes the Helm feel bad, pulling prediction of **the crew's own ship** forward from Net-4 is the planned remedy (§17).

## 12. Look and sound

Original placeholder shapes drawn with Pixi Graphics (§10b): a shaded planet disc, rough asteroid polygons, both ships as original wedge silhouettes with three visible room segments, shield rings, a beam flash, missile trails, an impact burst and a planet-contact spark. No new art files, so the foundation §12 originality rule holds trivially. The existing music tracks may play; there are no new sound effects beyond reusing the ones that exist.

## 13. Architecture

- **Sim, new subtree `sim/tactical/`:** `map.ts` (`MapDef`, the seeded generator and its validation), `bodies.ts` and `physics.ts` (gravity, thrust, drag, stabilise, integration, collisions, the broad-phase grid, and the pure `predictPath(state, bodyId, seconds)` used by the render), `headings.ts` (generated), `state.ts` (`TacticalState`: bodies, ships, rooms, shields, weapons, missiles, repair, enemy brain, telemetry), `step.ts`, `weapons.ts`, `repair.ts`, `hunter.ts`, `hash.ts`, `snapshot.ts`, `tuning.ts`. It imports nothing from the sector-run sim beyond shared helpers (RNG, hashing).
- **One session, two modes:** the authority gains a mode discriminant, `sector` (today) or `duel`. A run is one or the other. Command validation, ledgers, the tick driver and publication stay shared.
- **Inputs:** turn and thrust for the Helm, and missile steering for Weapons, ride the existing held-input channel (validated per seat: the Helm seat's held input steers the ship; the Weapons seat's steers its missile). A new tactical command family joins the closed union (an explicit Net-1 amendment, as MG-X will be): `laserLock {room}`, `laserCharge {held}`, `missileLaunch`, `repairToggle {room}`, `repairPress {dir}`. Only the Weapons seat sends weapon commands; either seat sends repair commands for its own player.
- **Client view, new `render/tactical/`:** `camera.ts` (follow, pan, snap, zoom, screen ↔ world transforms; pure and unit-tested), `tacticalLayer.ts` (the draw order in §10b), `offscreen.ts` (edge arrows), `grid.ts`. Camera inputs are handled in the client and never become commands.
- **Versioning:** one `SIM_VERSION` bump when the duel mode lands, with its own golden file. The sector run's figures, gates and goldens are unchanged.
- **Scripted pair for tests only:** a headless scripted Helm and gunner (orbit, line up, release in arc, the occasional missile and repair) drive telemetry and gate tests. They are never offered as a seat (Q15).
- **Telemetry (per duel):** duration; outcome; laser releases, hits, misses and layers stripped; missiles launched, hits by room, losses by cause; planet and asteroid contacts per ship; enemy planet and belt contacts after crew manoeuvres (baits); repairs started and finished per player; time away from each console; time the enemy spent in the laser arc; time Weapons had nothing to do.

## 14. Growing into B (Q14)

Nothing in the duel assumes it is the only encounter. Later, the B run is three encounters on the same map code and physics:

1. **Debris run:** a map with a dense field (static or slow-moving asteroids) and a goal circle.
2. **The duel:** this demo.
3. **Escape:** two hunters and a jump-point circle at the map edge; reaching it ends the encounter.

To make that cheap: the map is data (planet, belt, clusters, spawns, goal circles, and later moons); win and lose conditions are a small list of predicates per encounter; the hunter takes its target as a parameter and its state machine accepts new states.

## 15. Milestones

| # | Milestone | Proves | Depends on |
|---|---|---|---|
| H-0 | **Duel sim, headless.** First the map, physics, headings and held-input flight (with the orbit, energy, hash and 200-seed map tests); then both consoles' rules, shields, rooms, repair, the hunter, commands, telemetry, the scripted pair and the golden replay | The rules are deterministic and tunable; the scripted duels hit the telemetry targets | Net-1a (in) |
| H-1 | **Dev view and solo playtest.** First a **dev flight view**: one ship, one player, the full camera (§10a) and the Helm layer, to meet the §6 feel targets by hand. Then the Weapons layer and the **solo playtest mode** (one player, both seats, Tab between stations, §11a). Not the multiplayer demo (Q15b) | Feel tuning starts early; the owner flies it | H-0 (flight part first) |
| H-2 | **The networked duel (the demo).** Two machines, one player each, over Net-3. LAN playtests first, then internet. Run the Q22 checklist | **Is it fun?** | H-1, Net-1b, Net-3 |
| H-3 | **The B run.** Debris run and escape (§14) | The map and physics carry more than a duel | H-2 passed |

H-1 includes the solo playtest mode (§11a), so the owner plays the full duel by switching stations before Net-3; the dev split view is optional once switching works. H-0's flight part and H-1's flight view come first: everything else in the duel sits on top of them. H-0 and H-1 run alongside Net-1b. Roadmap item 36 records this order. It puts the Helm demo ahead of the direction spec's MG-0/MG-X/MG-1a sequence for now; those milestones remain, and MG-1a's integrated encounter becomes this duel plus the full interior link.

## 16. Acceptance (Q22)

**Telemetry gates** (headless, scripted pair against the hunter, seeds 1 to 10): median duel length 3 to 5 minutes; both outcomes occur; both weapons used in every duel; no duel ends from planet contact in under 30 s; same-seed hash and golden replay pass. These gate H-0. The live gates in H-2 use the real telemetry.

**Playtest checklist** (H-2, after each session, yes/no):
1. Did the Helm use the planet's gravity on purpose at least once (a slingshot or a bait)?
2. Did the two players talk to coordinate ("bring the nose round", "missile away")?
3. Did either player leave their console to repair at a moment that mattered?
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

## 18. Open questions (defaults taken meanwhile)

1. Stabilise kills only sideways drift, not all motion (§6). **(rec.)**
2. Turn, thrust and missile steering ride the existing held-input channel (§6, §13). **(rec.)**
3. One missile in flight at a time; the magazine regenerates (§7b). **(rec.)**
4. Missiles can hit their own ship after 1 s (§7b). **(rec.)**
5. No point defence in the demo (§7b). **(rec.)**
6. The enemy repairs and pays the same price (§8). **(rec., in grill Q21)**
7. North-up with a rotating ship, not heading-up (§10a). **(rec.)**
8. The camera stays where it was panned until the player snaps back; no automatic return (§10a). **(rec.)**
9. Everything on the map is visible to both players and the enemy; no sensor range or fog (§9, §10). **(rec.)**
10. Net-2 is not needed for the duel; Net-3 is written mode-agnostic (§11b). **(rec.)**
11. The dev flight view in H-1 is a workbench; the solo playtest mode is the owner's, not a player-facing game mode (§11a, §15). **(rec.)**
12. Map size, belt radii and spawns at r = 2000 (§3) need checking against the 3 to 5 minute target once the hunter exists. *(start)*
13. Tab (gamepad Select/View) switches stations in solo (§11a). **(rec.)**

## Change log

- 2026-11-14: written from the owner's Helm direction and grill Q11 to Q22.
- 2026-11-14: grill Q24: solo playtesting until Net-3, one player owning both seats and switching stations (§11a); H-1 gains the solo mode.
- 2026-11-14: folded in the tactical view (grill Q23 to Q23c): a large zoomable map with one planet, an asteroid belt and clusters; a per-player follow camera with pan, snap and zoom; the view's draw order; held-input flight and missile steering. The one-screen arena and the fixed shared camera are gone. The short-lived separate tactical view spec was merged here and deleted.
