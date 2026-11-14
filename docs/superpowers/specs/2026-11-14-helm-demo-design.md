# Helm Demo: The Gravity-Well Duel (design)

Status: spec written 2026-11-14 from the owner's direction and thesis grill Q11 to Q22. Not yet reviewed. **Gospel: `docs/vision/napkin.md`; binding answers: `docs/vision/thesis-grill.md`** (the grill wins where this spec disagrees). Numbers marked *(start)* are starting values for tuning, not decisions. Defaults marked **(rec.)** are Claude's, written into the grill as "Claude's default; the owner can correct it".

## 1. The owner's words

> "core demo i want to build will be around the helm mini game. This is sid meiers pirates inspired navigation around a gravity well in a tactical top down view. Helm will manage the thrust, velocity and turning of the ship to navigate through obsticals, and around enemies. weapons will share that view to target weapons"

> "im thinking a laser weapon and cruise missiles that they control" (Q19)

## 2. What the demo is

Two friends on two computers crew one small ship in a top-down duel against one enemy ship around a planet. One player flies the **Helm** (direct stick, real momentum, real gravity). The other runs **Weapons** (a laser with a firing arc and a room lock, and cruise missiles the gunner steers by hand). Hits damage FTL-style rooms (Engines, Weapons, Shields), and a player has to leave their console to repair them. The duel ends when one hull breaks: about 3 to 5 minutes.

It exists to answer one question: **is gravity-well piloting with a two-person crew fun?** (Q14). It is built so the same physics, obstacles and enemy carry a later three-encounter run (§13).

### Sources (grill)

| Q | Decision |
|---|---|
| Q11 | Design outside and inside together; the demo is the tactical view with a thin room link |
| Q12 | Arcade with real momentum and gravity; mild drag; a stabilise assist on release |
| Q13 | Firing arcs plus room targeting |
| Q14 | One duel around one planet with a few asteroids, built to grow into a three-encounter run |
| Q15, Q15b | Exactly two players, Helm and Weapons, no bots; two computers over the network |
| Q16 | Planet: gravity plus a damaging wall, no zones |
| Q17 | Enemy: a blunt hunter under the same rules, written as states |
| Q18 | Helm: direct stick (turn, thrust, reverse, stabilise on release) |
| Q19, Q19b | A laser and cruise missiles steered directly; the laser cannot fire while a missile flies |
| Q20 | FTL shield layers; missiles bypass shields |
| Q21 | A player leaves their console to repair a damaged room |
| Q22 | Acceptance: a five-question checklist plus telemetry targets |

### Not in the demo

Interior crew, oxygen, fires, doors and walking (the full inside link comes after, Q11). Bots in seats (Q15). Solo play. The sector run, events, dialogue, shops, careers and the open world. Rings, atmospheres and aerobraking (Q16). Directional shields (Q20). Enemy moods (Q17). New art beyond original placeholder shapes (§11). Prediction and rollback (§10).

## 3. The arena

A fixed, circular arena seen from above, with the planet at its centre.

| Thing | Rule | Values *(start)* |
|---|---|---|
| Arena | Circle of radius `R_ARENA`. Past the edge a soft spring pushes bodies back in; no damage | `R_ARENA` 600 units |
| Planet | Static, at the origin. Pulls every body (ships, missiles). Contact costs hull and bounces | radius 70; contact 4 hull, bounce keeps 50% of the normal speed, 1 s grace before it can hurt the same ship again |
| Gravity | `a = −GM · d / (|d|² + ε²)^{3/2}` toward the planet, with a small softening `ε` | `GM` 2.5e6 (a circular orbit at r = 250 moves at 100 u/s); `ε` 20 |
| Asteroids | 5 static circles, positioned from the duel seed so that none overlap the planet, each other or the spawns. They do not pull. Contact costs hull and bounces; they block laser line of sight | radius 30 to 55; contact 1 hull |
| Spawns | The two ships start on opposite sides of the planet, in roughly circular orbits going the same way | r = 350 |

Asteroids are static in the demo. The B-run debris field (§13) reuses the same circle bodies, and moving them later is additive.

## 4. Physics and determinism

The sim runs at today's 60 Hz (`TICK_HZ`) inside the Net-1 authority and follows its rules from the first commit: commands in, deterministic state out, no client callbacks.

- **Arithmetic:** Float64 using only `+ − × ÷`, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `round`, `sign` (the Net-1 AST guard, `tests/determinismGuard.test.ts`, already covers `sim/**`). No `sin`, `cos`, `atan2`, `hypot` or `pow`. `|d|³` is computed as `r2 · sqrt(r2)`.
- **Headings:** a fixed table of **256 unit vectors** in `sim/tactical/headings.ts`, written as numeric literals by a generator script that runs outside the sim (`scripts/gen-headings.ts`, which may use `Math.cos`). A test checks every entry's length against 1 by `sqrt` and checks the table's symmetry. A ship's heading is an index from 0 to 255, plus a fractional turn accumulator.
- **Arcs and sectors without angles:** "inside a ±θ arc" means `dot(h, u) ≥ cos θ · |u|`, where `cos θ` is a literal constant. "Which side" uses the 2-D cross product. Neither needs trigonometry.
- **Integration:** semi-implicit (symplectic) Euler once per tick: apply forces, update velocity, update position. Bodies update in a fixed order (crew ship, enemy, missiles by spawn id). Collisions are circle against circle, resolved in the same fixed order.
- **Randomness:** one new named stream, `rng.tactical`, seeded from the duel seed. It feeds asteroid layout, repair prompts and the enemy's small decision jitter. Combat hits are geometric and draw no random numbers.

Tests (in `npm test`): a circular orbit at r = 250 holds its radius within 2% over 60 s with no thrust; energy drift stays bounded over a 5-minute coast; the same seed and commands give the same hash; a golden replay of a scripted duel; arc and sector truth tables.

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

## 6. The Helm console

Direct stick (Q18). The Helm sends **held axes every tick**: `turn ∈ {−1, 0, 1}` and `thrust ∈ {−1, 0, 1}`.

| Input | Effect *(start)* |
|---|---|
| Turn | 150°/s (1.78 heading steps per tick via the accumulator), × the Engines factor |
| Thrust forward | 120 u/s² along the heading, × the Engines factor |
| Thrust reverse | 40% of forward |
| Drag | Velocity × (1 − 0.15 · dt) each tick (mild, Q12) |
| **Stabilise** | While `thrust = 0` and `turn = 0`, the assist cancels **sideways** velocity (perpendicular to the heading) at up to 80 u/s². It never fights gravity along the heading, so a released ship stops sliding sideways but still falls and orbits (Q12: "kills drift" for beginners; experts thrust through it) **(rec.)** |

Keys: keyboard W/S thrust, A/D turn, R repair; gamepad left stick or d-pad plus triggers, a face button for repair. The Helm's screen draws the ship's **predicted path** for about 2 s ahead, computed by the same pure physics function from the current state (render only). It makes slingshots readable **(rec.)**.

## 7. The Weapons console

Two modes on one console: **laser** and **missile in flight** (Q19, Q19b).

### 7a. Laser (Q13)

- **Arc:** ±60° around the nose, range 450 *(start)*. The Weapons screen draws the arc. The Helm's positioning decides whether the enemy is in it.
- **Room lock:** the gunner cycles the locked enemy room (Weapons, Shields, Engines). The lock is shown on the enemy ship on both screens.
- **Charge and release:** holding Fire charges the laser (4 s × the Weapons-room factor). Releasing at full charge fires; releasing early discards the charge. A full charge can be held for 3 s, then it vents and starts over. The skill is timing the release for the moment the enemy is in the arc with line of sight.
- **The shot:** an instant beam. It hits if the enemy is inside the arc and range and the segment between the ships misses the planet and every asteroid; otherwise it is a miss (shown). It draws no random numbers.
- **Effect:** with a shield layer up, it strips one layer. With shields down, the locked room takes +1 damage and the hull takes 2.

### 7b. Cruise missiles (Q19, Q19b)

- **Magazine:** 4, plus 1 regained every 45 s up to 4 *(start)*. One missile in flight at a time **(rec.)**.
- **Launch:** fired from the nose with the ship's velocity plus 60 u/s along the heading. Launching switches the console to missile mode.
- **Flight:** the missile thrusts on its own (160 u/s²). The gunner steers it with `turn ∈ {−1, 0, 1}` at 120°/s, using the same stick as the Helm's turn. Gravity acts on it, so curving it round the planet is a skill. 6 s of fuel, then it coasts for 2 s and self-destructs.
- **Impact:** with the enemy ship, it bypasses shields (Q20); the room comes from the impact point (§5), that room takes +1 damage and the hull takes 3. A missile hitting the planet, an asteroid or the arena edge is destroyed. A missile can hit its own ship after 1 s of flight **(rec.: the gunner has to fly it carefully)**.
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

A sim-flown ship under the same physics, arcs and rules. It sees only what the crew could see (both ships' positions and velocities, the planet and the asteroids). It drives itself through the **same command shape** as the crew's ship (`helmAxes`, the laser commands, the missile commands), so it is deterministic and fair.

Written as a small state machine; the demo has two states, and moods (Q17 C) are later additions.

- **Hunt:** steer toward a lead point (where the crew's ship will be in 0.5 s at its current velocity). Thrust when the heading error is under 30°. Avoid the planet with a **short lookahead**: if the straight-line path over the next 0.75 s comes within `planet radius + 30`, turn away and thrust. The short lookahead is the bluntness that lets the Helm bait it into the planet with a tight slingshot (Q16, Q17).
- **Firing:** charge the laser continuously and release when the crew's ship is in arc with line of sight, after a 0.2 s jitter from `rng.tactical`. Lock the crew's Shields room until it reaches level 2, then Weapons (the lock only matters once a shot lands with the crew's shields down). Launch a missile when the crew is within 400, at most one per 30 s, and steer it with simple pursuit with a 0.3 s reaction lag (beatable by hard turns and by putting the planet between them).
- **Repair:** when a room is at level 2, or at level 1 and the crew's ship is out of laser range, enter **Repair** for that room (§8 price), then return to Hunt.

Tuning goal: a competent pair wins about 60 to 70% of the time, and a pair who ignores the planet loses (Q22).

## 10. Two screens over the network (Q15b)

- **Seats:** the lobby assigns player 0 to the Helm and player 1 to Weapons; the players can swap before starting. One player per machine.
- **The shared view:** both screens show the **whole arena with a fixed camera** (planet centred, at about 0.6 px per unit at 1280 x 720) **(rec.)**, so it is literally the same view (owner's words: "weapons will share that view"). Each screen adds its own layer: the Helm sees the predicted path and its thrust and turn state; Weapons sees the laser arc, the charge bar, the room lock and the missile count. Both see both hulls, the shield pips, the room damage and the other player's status (flying, firing, repairing).
- **Transport:** the demo runs over Net-0's chosen stack. By Net-0 and the direction spec A6, **Net-1b comes before Net-3**, and Net-3 is "two machines over the internet, no prediction" (WebRTC, Cloudflare signalling and TURN, join codes). Net-3 needs the owner's Cloudflare account and domain (Net-0 open item 2).
- **Net-2 is not a prerequisite for the duel (rec.).** Click-to-move and the per-player FTL layout serve the interior game (MG-1b), not this view.
- **Latency:** without prediction (Net-4), the Helm's own inputs show after one round trip plus interpolation. A direct stick is the input most sensitive to this. The first networked playtests run on one home network (LAN, low latency); internet tests follow. If internet delay makes the Helm feel bad, pulling prediction of **the crew's own ship** forward from Net-4 is the planned remedy (§14).

## 11. Look and sound

Original placeholder shapes drawn with Pixi Graphics: a shaded planet disc, rough asteroid polygons, both ships as original wedge silhouettes with three visible room segments tinted by damage, shield rings, a beam flash, missile trails, an impact burst and a planet-contact spark. No new art files, so the foundation §12 originality rule holds trivially. The existing music tracks may play; there are no new sound effects beyond reusing the ones that exist.

## 12. Architecture

- **New subtree `sim/tactical/`:** `state.ts` (`TacticalState`: bodies, ships, rooms, shields, weapons, missiles, repair, enemy brain, telemetry), `step.ts`, `physics.ts`, `headings.ts` (generated), `weapons.ts`, `repair.ts`, `hunter.ts`, `hash.ts`, `snapshot.ts`, `tuning.ts`. It imports nothing from the sector-run sim beyond shared helpers (RNG, hashing).
- **One session, two modes:** the authority gains a mode discriminant, `sector` (today) or `duel`. A run is one or the other. Command validation, ledgers, the tick driver and publication stay shared.
- **Commands:** a new tactical family added to the closed union (an explicit Net-1 amendment, as MG-X will be): `helmAxes {turn, thrust}` (held; latest per player per tick), `laserLock {room}`, `laserCharge {held}`, `missileLaunch`, `missileSteer {turn}`, `repairToggle {room}`, `repairPress {dir}`. Seat ownership is validated as today: only the Helm seat sends `helmAxes`; only the Weapons seat sends weapon commands; either seat sends repair commands for its own player.
- **Versioning:** one `SIM_VERSION` bump when the duel mode lands, with its own golden file. The sector run's figures, gates and goldens are unchanged.
- **Scripted pair for tests only:** a headless scripted Helm and gunner (orbit, line up, release in arc, the occasional missile and repair) drive telemetry and gate tests. They are never offered as a seat (Q15).
- **Telemetry (per duel):** duration; outcome; laser releases, hits, misses and layers stripped; missiles launched, hits by room, losses by cause; planet and asteroid contacts per ship; enemy planet contacts after crew manoeuvres (baits); repairs started and finished per player; time away from each console; time the enemy spent in the laser arc.

## 13. Growing into B (Q14)

Nothing in the duel assumes it is the only encounter. Later, the B run is three encounters on the same physics:

1. **Debris run:** the same arena code with many asteroid bodies (static or slow-moving) and a goal circle.
2. **The duel:** this demo.
3. **Escape:** two hunters and a jump-point circle at the arena edge; reaching it ends the encounter.

To make that cheap: the arena layout is data (planet, asteroid list, spawns, goal circles); win and lose conditions are a small list of predicates per encounter; the hunter takes its target as a parameter and its state machine accepts new states.

## 14. Milestones

| # | Milestone | Proves | Depends on |
|---|---|---|---|
| H-0 | **Duel sim, headless.** Arena, physics, heading table, both consoles' rules, shields, rooms, repair, hunter, commands, telemetry, the scripted pair, golden replay | The rules are deterministic and tunable; the scripted duels hit the telemetry targets | Net-1a (in) |
| H-1 | **Dev view.** The renderer for both screens and a **dev-only split view** (two keyboards, one machine) for tuning feel before the network exists. Not the demo (Q15b), only a workbench | Feel tuning can start early | H-0 |
| H-2 | **The networked duel (the demo).** Two machines, one player each, over Net-3. LAN playtests first, then internet. Run the Q22 checklist | **Is it fun?** | H-1, Net-1b, Net-3 |
| H-3 | **The B run.** Debris run and escape (§13) | The physics carries more than a duel | H-2 passed |

H-0 and H-1 run alongside Net-1b. Roadmap item 36 records this order. It puts the Helm demo ahead of the direction spec's MG-0/MG-X/MG-1a sequence for now; those milestones remain, and MG-1a's integrated encounter becomes this duel plus the full interior link.

## 15. Acceptance (Q22)

**Telemetry gates** (headless, scripted pair against the hunter, seeds 1 to 10): median duel length 3 to 5 minutes; both outcomes occur; both weapons used in every duel; no duel ends from planet contact in under 30 s; same-seed hash and golden replay pass. These gate H-0. The live gates in H-2 use the real telemetry.

**Playtest checklist** (H-2, after each session, yes/no):
1. Did the Helm use the planet's gravity on purpose at least once (a slingshot or a bait)?
2. Did the two players talk to coordinate ("bring the nose round", "missile away")?
3. Did either player leave their console to repair at a moment that mattered?
4. Can each player retell one fight moment?
5. Did they want to play again straight away?

**The demo is done** when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel). Results go in `docs/gates.md` under a new "Helm demo" section and in a playtest report.

## 16. Risks

1. **Network latency on a direct stick.** The biggest risk (§10). Mitigation: LAN first, measure, pull own-ship prediction forward if needed.
2. **The demo waits on Net-1b and Net-3.** Mitigation: H-0 and H-1 proceed in parallel; the owner's Cloudflare setup is requested early.
3. **The gunner is idle while the Helm lines up.** Missiles, the room lock and repair give Weapons work; telemetry tracks time with nothing to do (laser full and out of arc, no missile).
4. **Gravity makes the fight a spiral.** If both ships settle into the same orbit, add tuning (spawn orbits, enemy lead) before adding systems.
5. **The hunter is too dumb or too good.** Tuned against the scripted pair first, then by playtest; its numbers are all in `sim/tactical/tuning.ts`.
6. **Determinism with Float64.** IEEE `+ − × ÷ sqrt` are exact and identical across engines, but literals and operation order must be fixed; the real-browser cross-engine harness from Net-1b runs the duel golden too.

## 17. Open questions (defaults taken meanwhile)

1. Stabilise kills only sideways drift, not all motion (§6). **(rec.)**
2. One missile in flight at a time; the magazine regenerates (§7b). **(rec.)**
3. Missiles can hit their own ship after 1 s (§7b). **(rec.)**
4. No point defence in the demo (§7b). **(rec.)**
5. The enemy repairs and pays the same price (§8). **(rec., in grill Q21)**
6. A fixed whole-arena camera on both screens (§10). **(rec.)**
7. Net-2 is not needed for the duel (§10). **(rec.)**
8. The dev-only split view in H-1 is a tuning workbench, never the demo (§14). **(rec.)**

## Change log

- 2026-11-14: written from the owner's Helm direction and grill Q11 to Q22.
