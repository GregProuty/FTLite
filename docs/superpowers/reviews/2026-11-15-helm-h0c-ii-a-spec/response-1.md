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
