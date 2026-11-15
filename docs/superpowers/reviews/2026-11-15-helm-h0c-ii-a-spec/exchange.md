# Codex review exchange: helm-h0c-ii-a-spec

Subject: `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 464e3be, effort high, 194 s, 589157 in / 516736 cached / 9706 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 Sector goldens cannot change only in version fields
The required version bump necessarily changes stored sector hashes, so the stated re-bless diff is impossible. · spec L76-L77, L94; src/renderer/src/sim/flatten.ts:L45-L50; src/shared/hash.ts:L3-L10; tests/golden.test.ts:L27-L31 · The golden test compares hashes computed from a flattened state containing SIM_VERSION. Changing 35 to 36 changes those hashes even when gameplay is identical. · Require version fields and their derived hashes to be re-blessed. Prove the version-only gameplay change by comparing all other canonical values and gameplay traces.

### [P0] R1-F2 The runtime fallback drops the binding ten-seed gate
The proposed default three-seed smoke run would leave seeds 4 to 10 unchecked in the full suite. · spec L64-L70, L93; docs/superpowers/specs/2026-11-14-helm-demo-design.md:L309-L311 · The parent makes the seeds 1 to 10 result an H-0 gate. · Keep all ten seeds in the required gate run. If needed, add a separate three-seed smoke test without substituting it for the gate.

### [P1] R1-F3 The scripted flight and firing policy needs exact rules
The Helm’s orbit, alignment and avoidance choices and the gunner’s missile cadence and release rule leave multiple materially different implementations. · spec L30, L35-L40, L43; src/renderer/src/sim/tactical/weapons.ts:L48-L52, L72-L96; src/renderer/src/sim/tactical/predict.ts:L21-L30 · The plan writer cannot derive one deterministic policy or expected gate results from phrases such as “brings the nose round” and “every so often.” · Specify the state transitions, numerical thresholds, turn and thrust choices, line-of-sight rule, missile interval, priority order and tie breaks, with the pair’s tunable constants named.

### [P1] R1-F4 Repair assignment contradicts the nearest-character rule
The spec assigns Engines to the Helm while also requiring the nearest character to take a repair. · spec L41; docs/superpowers/specs/2026-11-14-helm-demo-design.md:L183-L189 · The parent’s walk distances put the gunner about 6 tiles from Engines and the Helm about 27 tiles away. The two rules select different repairers. · Choose one assignment rule and specify priority and tie breaks when several rooms are damaged.

### [P1] R1-F5 A planet-contact ending has no defined attribution
The gate asks whether a duel ended from planet contact, but the proposed telemetry observes contact counters while the outcome is decided after all damage in the tick. · spec L50, L64-L69; src/renderer/src/sim/tactical/contacts.ts:L38-L55; src/renderer/src/sim/tactical/duel.ts:L22-L29 · A planet hit and another lethal hit can occur in one tick. A counter change and final outcome do not identify which damage caused the ending. · Define terminal-cause precedence and record the necessary per-damage event, or state an explicit observable proxy for this gate.

### [P1] R1-F6 The bait proxy contradicts its telemetry definition
The proposed count requires proximity and turning at contact, while the stated bait measure requires a preceding manoeuvre within five seconds that brought the hunter toward the obstacle. · spec L50; docs/superpowers/specs/2026-11-14-helm-demo-design.md:L285-L286 · The proxy can count unrelated contacts and miss contacts after the crew stops turning. · Define a tick-stamped manoeuvre condition, its direction test and the 300-tick window; then count qualifying enemy contacts against that definition.

### [P1] R1-F7 Weapons can have work while its missile is in flight
The proposed “nothing to do” condition counts missile flight as idle even though the gunner steers that missile. · spec L53; docs/vision/thesis-grill.md:L183-L189; src/renderer/src/sim/tactical/duel.ts:L22-L23; src/renderer/src/sim/tactical/missiles.ts:L32-L43 · This overstates idle time during one of the gunner’s required activities. · Exclude ticks with an attended missile in flight, and specify the remaining idle predicate precisely.

### [P1] R1-F8 The duel hash does not include SIM_VERSION
The spec says SIM_VERSION is hashed into every flattened state, but neither tactical nor duel flattening includes it. · spec L25, L76-L78; src/renderer/src/sim/duel/hash.ts:L8-L13; src/renderer/src/sim/tactical/hash.ts:L15-L28 · The new duel golden would not distinguish a version change unless its fixture checks the version separately. · Include SIM_VERSION in flattenDuel, or require and verify an explicit version field in the duel golden.

### [P1] R1-F9 Per-player repair start and finish events need semantics
The proposed events do not define a start after interrupted work or who receives finish credit when two players repair together. · spec L51, L55-L58; src/renderer/src/sim/duel/step.ts:L46-L60 · The existing repair phase reduces each player to a per-room holder count, so those per-player transitions cannot be inferred from its current data alone. · Define start and finish attribution, including resumed and joint work, and specify whether previous holder state lives in the duel state or is derived by the telemetry accumulator.

### [P2] R1-F10 Missile-to-missile losses are omitted
The telemetry cause list omits the existing `missile` ending cause. · spec L49; src/renderer/src/sim/tactical/state.ts:L52-L56; src/renderer/src/sim/tactical/missiles.ts:L76-L80 · Those losses would have no specified bucket in the per-ship totals. · Add missile-to-missile collision to the loss causes.

## Verified
- The headless duel step and local command envelope exist without an authority-mode or command-union change: spec L14-L16, src/renderer/src/sim/duel/commands.ts:L1-L13, src/renderer/src/sim/duel/step.ts:L17-L17.
- A separate seeded RNG helper exists, and the guarded sim roots include sim/duel: src/shared/rng.ts:L1-L21, tests/boundary.test.ts:L12-L28.
- The sim has a reachability BFS but no path-returning helper found in the requested sim/headless search: src/renderer/src/sim/ship/reachability.ts:L1-L19; the fallback BFS in spec L42 is appropriate.
- Walking repairs are supported by the current phase order, held interaction, same-room reach check and open doors: src/renderer/src/sim/duel/state.ts:L33-L49, src/renderer/src/sim/duel/step.ts:L46-L60, L118-L125.
- Tactical laser and missile-ending events are cleared each tick and omitted from tactical hashing: src/renderer/src/sim/tactical/duel.ts:L15-L18, src/renderer/src/sim/tactical/hash.ts:L1-L3.
- The numerical §16 gates are transcribed in the spec: spec L7-L12, L64-L69; docs/superpowers/specs/2026-11-14-helm-demo-design.md:L309-L311.

## Not verified
- The review ledger was absent from this checkout; the request identifies this as round 1 and supplies no awaited IDs.
- No test suite, ten-seed simulation, runtime measurement or screenshot check was run, as requested.
- Additional source ranges in reachability.ts, movement.ts, interact.ts, contacts.ts, geometry.ts, app/duel/controls.ts, tacticalDeterminism.test.ts and src/shared/hash.ts were read to verify the path, movement, telemetry and hash findings. No other paths were explored.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at the brief commit. 10 accepted (2 P0, 7 P1, 1 P2), 0 rejected, 0 deferred. Each claim was checked against the cited code and held.

## R1-F1 [P0]: Sector goldens cannot change only in version fields

Confirmed: `flatten` writes `SIM_VERSION` at `out[0]` (`flatten.ts:L45-L50`), so every stored sector hash changes with the bump. §6 now re-blesses all of them, and proves the change is version-only by what does not change. The gameplay-projection checks in `tests/golden.test.ts` read the pinned `tests/fixtures/net1a-baseline.json` and must still pass untouched, as must the sector gates and traces. The plan lists every re-blessed file, and none of the pinned projection fixtures may be among them.

## R1-F2 [P0]: The runtime fallback drops the binding ten-seed gate

Confirmed against parent §16. §5 now runs the ten-seed gate in the full suite always, with no fallback. If it is slow, it may be split into one test per seed with a raised timeout, but it may not drop seeds. A quick smoke test is allowed only in addition.

## R1-F3 [P1]: The scripted flight and firing policy needs exact rules

Confirmed. §3 now gives:
- the Helm as a fixed priority list (avoid via `predictPath` over `AVOID_TICKS`, line up when charged, orbit at a seeded `ORBIT_R` with prograde tangent steering and speed bands), with tie breaks;
- the gunner's charge, release (arc, range and line of sight via `geometry.ts`, otherwise release at the hold limit), lock (Shields until down, then Weapons) and missile rules (`canLaunch`, beyond `LASER_RANGE`, `MISSILE_GAP`), with steering by the bearing-error sign.

The pair's constants are named, and the plan sets their values from the prototype.

## R1-F4 [P1]: Repair assignment contradicts the nearest-character rule

Confirmed. There is now one rule, nearest free character by BFS walk:
- ties go to player 1;
- one assignment each;
- with several rooms damaged, the higher level goes first, then room order;
- the character walks back to its own console and sits.

## R1-F5 [P1]: A planet-contact ending has no defined attribution

Confirmed: the outcome is decided after all of a tick's damage (`duel.ts:L22-L29`). §4 now records a terminal cause for each ship whose hull reached 0 on the final tick: planet, asteroid, ship, laser or missile, from that tick's counters and events. A duel ends from planet contact when the losing ship (both, for a draw) took a planet contact on its final tick.

## R1-F6 [P1]: The bait proxy contradicts its telemetry definition

Confirmed. §4 now defines a crew manoeuvre: a tick with a non-zero Helm axis while the enemy is within 900 u, stamped with its tick. A bait is an enemy planet or asteroid contact within 300 ticks after one, provided the enemy's distance to that obstacle shrank over the window.

## R1-F7 [P1]: Weapons can have work while its missile is in flight

Confirmed. The idle predicate now excludes ticks with a crew missile in flight, and states the rest precisely (seated, charge full or frozen, no launch possible, enemy out of arc).

## R1-F8 [P1]: The duel hash does not include SIM_VERSION

Confirmed (`duel/hash.ts:L8-L13`, `tactical/hash.ts:L15-L28`). §2's claim is corrected. `flattenDuel` gains `SIM_VERSION` as its first value, and the duel golden also stores it.

## R1-F9 [P1]: Per-player repair start and finish events need semantics

Confirmed. `repairPhase` emits two events:
- `repairWork {player, room}` for each player who worked that tick;
- `repairDone {room, players}` naming every worker when a level drops.

The telemetry accumulator, not the duel state, keeps the previous tick's workers. A start counts when a player resumes after a gap, and a finish credits every named player.

## R1-F10 [P2]: Missile-to-missile losses are omitted

Confirmed (`tactical/state.ts:L52-L56`). Added to the loss causes.

## Also changed

- Change log entry for round 1.

## Files changed

- docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md

<!-- end -->

---

# Round 2 (delta, reviewing b92cad3, effort medium, 102 s, 498230 in / 422400 cached / 4802 out)

Verdict: changes requested

## Prior findings
- R1-F1: resolved — Spec L100 now requires re-blessing the hashes derived from the version change; flatten.ts:L50 includes SIM_VERSION.
- R1-F2: resolved — Spec L87-L93 requires all ten seeds in the full-suite gate.
- R1-F3: still open — The Helm avoidance rule in spec L36 cannot be implemented as stated: predict.ts:L21-L31 returns positions without a contact marker and never detects the map edge. Spec L38 also leaves the orbit radius band described only as the “open band between the belt gaps,” without a usable radial bound. Specify contact detection, edge detection, and the orbit radius bounds.
- R1-F4: resolved — Spec L46-L49 replaces the conflicting room assignments with one nearest-free-character rule and tie breaks.
- R1-F5: resolved — Spec L74-L81 defines an observable final-tick planet-contact attribution using the contact counter; tactical/duel.ts:L24-L29 confirms outcome is decided after contact damage.
- R1-F6: still open — Spec L59-L61 requires the enemy’s distance to the asteroid it hit, but contacts.ts:L43-L45 records only an aggregate asteroidHits counter, and tactical/state.ts:L51-L56 has no asteroid-contact event or asteroid index. Add an event identifying the struck obstacle and positions needed for the distance test, or define a computable proxy.
- R1-F7: resolved — Spec L64 excludes ticks with a crew missile in flight from Weapons idle time.
- R1-F8: resolved — Spec L101 requires SIM_VERSION in both the duel golden and flattenDuel; duel/hash.ts:L8-L13 confirms it is absent today.
- R1-F9: resolved — Spec L66-L72 defines worker and completion events, resumed starts, joint finish credit, and accumulator ownership of previous workers.
- R1-F10: resolved — Spec L58 includes losses to the other missile, matching tactical/state.ts:L56.

## Verified
- The subject matches commit b92cad3; its ten-seed gate matches parent spec L309-L311.
- Spec L100 matches flatten.ts:L50 and the stored-hash checks in tests/golden.test.ts:L27-L37.
- Spec L66-L72 can attribute repair work from the per-player loop in duel/step.ts:L49-L60.

## Not verified
- No tests were run; this was a read-only spec review.
- The named review run directory was inaccessible, so its files could not be checked. The ledger and round-1 response supplied in the brief were used.

---

# Round 2 response (spec revised)

Reviewed `round-2.json`. No new findings. Codex re-raised R1-F3 and R1-F6, and both re-raises are correct. Fixed again; 0 rejected, 0 deferred.

## R1-F3 [P1]: The scripted flight and firing policy needs exact rules (still open, fixed again)

Confirmed: `predictPath` returns positions only and never detects the edge (`predict.ts:L21-L31`). The avoid rule now tests each predicted position for a hazard itself:
- the planet within `planet.r + SHIP_RADIUS + AVOID_MARGIN`;
- any asteroid from `queryGrid` within `a.r + SHIP_RADIUS + AVOID_MARGIN`;
- distance from the centre beyond `rMap − AVOID_MARGIN`.

It turns directly away from the first hazard (toward the centre for the edge). The orbit band is now bounded outside the belt and inside the edge (`ORBIT_MIN ≥ BELT_OUTER + 200 = 1500`, `ORBIT_MAX ≤ R_MAP − 600 = 2200`), and `AVOID_MARGIN` joins the named constants.

## R1-F6 [P1]: The bait proxy contradicts its telemetry definition (still open, fixed again)

Confirmed: the sim records only aggregate hit counters (`contacts.ts:L43-L45`). The struck obstacle is now identified at the contact tick: the planet for a `planetHits` rise, or the asteroid nearest the enemy from `queryGrid` for an `asteroidHits` rise. The accumulator keeps the enemy's position at the stamped manoeuvre tick and compares its distance to that obstacle then and at contact.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md

<!-- end -->

---

