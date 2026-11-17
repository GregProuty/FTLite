# Codex review exchange: science-scans-spec

Subject: `docs/superpowers/specs/2026-11-17-science-scans-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 4e568c78, effort high, 410 s, 2349849 in / 2239545 cached / 31921 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Tactical ticks do not restart at 0 on a rematch, so the hostility clock and the derelict orbit break from round 2
§4.1 says the hostility clock compares state.tick with HOSTILE_AFTER_TICKS because "tactical ticks restart at 0 every round". They don't. startRound moves the new round's tactical tick to the encounter tick. In every round after the first, state.tick is already ≥ 1200 on the round's first tick, so the enemy turns hostile at once. The derelict's angle phase + ω·tick is also offset by baseTick, which breaks the 'at least 600 from both spawns at tick 0' placement guarantee. · spec L39, L25, L61, L63; src/renderer/src/sim/duel/step.ts:L83-L95 (startRound: `next.tactical.tick = tick`, graceUntil.fill(tick), hunter.lastLaunch += tick); sim/duel/state.ts:L52 (baseTick lives in DuelState, not TacticalState) · This contradicts the existing sim. Rematch play (and tests/duelRematchGolden) would show an enemy hostile from tick 0 and a derelict drawn somewhere other than its checked placement. · Add a round-relative base to the tactical state, e.g. `TacticalState.startTick` (set to 0 in createTacticalState and to `tick` in startRound beside lastLaunch, hashed). Write the clock as `state.tick - startTick >= HOSTILE_AFTER_TICKS` and the orbit as `phase + ω·(tick − startTick)`. Have startRound shift `hostileAt` if it is ≥ 0. Add a rematch test: Patrol holds for 1200 ticks in round 2.

### [P1] R1-F2 A new duel command named `scan` collides with the sector's `scan` in the shared Command union
`Command = SectorCommand | DuelCommand`, and SectorCommand already has `{ kind: 'scan'; station; target }`. Adding a duel `{ kind: 'scan'; contact }` means `c.kind === 'scan'` on a Command narrows to both variants. applyConsoleCommand, which takes `CommandEnvelope<Command>`, reads `c.station` and `c.target` after that check, and that stops type-checking. · spec L81; src/renderer/src/net/contracts.ts:L57, L70-L84; src/renderer/src/sim/commands.ts:L87-L88, L128-L132 · The interface as named cannot be built without breaking the sector's command handling, and two plan authors would resolve it differently (rename vs add guards). · Give the duel command its own kind, e.g. `contactScan` (keep `designate` and `laserFrequency`, which don't collide). Name it in DuelCommand, duelWire.commands, DUEL_KINDS and a module's `commands` list.

### [P1] R1-F3 Scan progress and 'cancel by leaving' are placed in stepDuel, which can't see seats or presence
§4.5 runs scan progress inside the tactical `stepDuel(state, crew, tuning)`. §5 says scan progress cancels when station `by` has no present seated player. Occupancy (`interior.stations.occupant`) and `present` live in DuelState. stepDuel gets only the tactical state and the crew's ShipInput, which carries helm/weapons flags and no Science or station attendance. The hunter gates and tests also call stepDuel directly with no interior. · spec L71, L86, L48; src/renderer/src/sim/tactical/duel.ts:L22; src/renderer/src/sim/tactical/weapons.ts:L9-L22 (ShipInput fields); src/renderer/src/sim/duel/step.ts:L46-L49 (attendant), L168-L169 · As written, the cancel rule can't be built where the spec puts it. Implementers would either widen ShipInput or move the step into step.ts, and those give different tick positions and different hashes. · State it explicitly. Option (a): step.ts computes `scannerAttended = attendant(d, scan.by) >= 0` after the seat phase and passes it in a new ShipInput field (e.g. `scanner: boolean`, true in IDLE_INPUT and the gate bots); stepDuel's scan step cancels when it is false. Option (b): run scan progress in step.ts right after stepDuel. Name the choice and the exact tick position.

### [P1] R1-F4 The hash/snapshot work for the new state is under-specified: validation rejects Patrol and Shield loot, clone would share the new objects, and module placement is unstated
(1) validateTacticalValues bounds `hunter.mode` to within(Hunt, Repair) = 0..1, so `HunterMode.Patrol = 2` makes every snapshot taken in the first 20 s fail validation. (2) It bounds shields to the largest class's layers (2), so the `Shield` loot (class max + 1 = 3) fails validation. (3) cloneTacticalFromModule shallow-copies the state and rebuilds only the ships/systems/missiles/hunter containers. The new nested `scan`, `derelict` and `known` objects would be shared between the copy and the original, so rollback and replay would corrupt state. (4) The spec says the fields are 'in the tactical modules' but not which module (space or ship) or the canonical order (e.g. where `freq` goes in SYSTEMS_TAIL). (5) The new `DuelState.science` must be a field or be listed in DUEL_NOT_SNAPSHOTTED, as nav and weapons are. · spec L31-L33, L37, L44-L45, L50, L54-L55, L60, L64, L92, L130; src/renderer/src/sim/tactical/hash.ts:L172 (shields within(0, max layers)), L179 (hunter.mode within(Hunt, Repair)), L143-L148 (clone containers), L17-L22, L65-L83; src/renderer/src/sim/duel/modules.ts:L4, L79-L84 · Snapshot restore (online join and resync) would throw during Patrol and after Shield salvage, and a shared nested object breaks rollback determinism. These are exactly the per-field obligations the plan's subagents need spelled out. · Add a hash/snapshot subsection. List each new field with its module (e.g. hostileAt, known, scan.*, designated, weakFreq and derelict.* in `space` after the hunter fields; `freq` in `ship` SYSTEMS_TAIL after `lock`) and its validation rule. Widen `hunter.mode` to Patrol and shields to `max layers + 1`, or bound shields per class + 1. Rebuild fresh scan/derelict/known containers in cloneTacticalFromModule. Add `science` to DUEL_NOT_SNAPSHOTTED. Test that a snapshot at tick 600 and one after Shield loot both restore.

### [P1] R1-F5 The derelict's closed-form position has no defined angle units or trig, and the placement draws are ambiguous
The angle `phase + ω·tick` mixes a heading index (phase 0..255) with ω in some unit, and gives a non-integer angle. The tactical sim never calls Math.sin or Math.cos; it uses the generated HEADING_X/HEADING_Y table and dirBetween for fractions. The spec doesn't say how to turn the fractional angle into x/y, or which way 'clockwise' prograde points for the velocity (spawnAt uses heading + 64). Placement is also ambiguous: whether a rejection redraws orbitR or only phase, how the 1/3 trap is drawn (nextInt(3) === 0 vs nextFloat < 1/3), and how loot is drawn. Separately, orbitR in [900, 1500] overlaps the asteroid belt (1100 to 1300), so on some seeds salvage means hovering inside the belt. · spec L61, L63-L65; src/renderer/src/sim/tactical/direction.ts:L6-L15 (table lookup, dirBetween); headings.ts:L1-L3 (generated table); src/renderer/src/sim/tactical/map.ts:L26-L29, L57-L60 (spawnAt prograde = heading + 64); tuning.ts:L16-L17 (BELT_INNER/OUTER); no Math.sin/cos anywhere under src/renderer/src/sim · Two implementers would produce different positions and rng streams. Bringing in Math.sin breaks the sim's table-only trig convention, which exists so peers can't drift. · Define the angle in heading-index units: `a = phase + ωh·(tick − startTick)` with `ωh = circularSpeed(orbitR) / orbitR · DT · HEADING_COUNT / (2π)`. Position: `[dx, dy] = dirBetween(floor(a) mod 256, a − floor(a))` times orbitR. Velocity: `dirBetween` of a + 64 times circularSpeed(orbitR). Fix the draw order exactly: weakFreq `nextInt(3)`; orbitR `900 + nextInt(601)` drawn once; phase `nextInt(256)` redrawn up to 16 times; loot `nextInt(3)`; trapped `nextInt(3) === 0`. Either exclude the belt band from orbitR (e.g. [700, 1000] ∪ [1400, 1500]) or state that the overlap is intended.

### [P1] R1-F6 The SIM_VERSION two-step is misdescribed and leaves out the migration entry
§8 says step 1 is 'a commit where only the version and the goldens move'. In the Artemis-ii precedent, step 1 adds the new fields at neutral values plus a `MIGRATIONS[40]` entry with `added` regexes, and the oracle proves every run unchanged. All gameplay changes are blessed in step 2 at the same version. Here the new rng draws in createTacticalState (weakFreq, derelict) shift rng.s and every later hunter jitter, and Patrol and the shield start change every run, so none of them can be in step 1. The spec names no `MIGRATIONS[43]` entry and no list of added fields. · spec L132; docs/superpowers/specs/2026-11-17-artemis-consoles-design.md:L220-L228; tests/duelThrottle.test.ts:L145 (MIGRATIONS[42]); tests/duelOracle.test.ts:L6 (scripts/golden/duelOracle MIGRATIONS) · Following the spec literally either fails the oracle or produces an unexplained golden churn. The plan needs the exact split. · Restate it as: Step 1, SIM_VERSION 43 → 44, add every new field at a neutral value (hostileAt −1 with no Patrol, known [0,0], scan idle, freq 0, no new rng draws, derelict zeroed), the three command kinds and their admission, and `MIGRATIONS[43] = { change: 'Sci-1: science scans', rename: () => undefined, derived: [], added: [/^hostileAt$/, /^known/, /^scan\./, /^designated$/, /^weakFreq$/, /^derelict\./, /^systems\.\d+\.freq$/] }`; bless, and the oracle proves runs unchanged. Step 2, Patrol, the draws, salvage and the strip rule, blessed at 44.

### [P1] R1-F7 Contact ids clash with ship slots in the view layer, and pickShip can't return the derelict
The sim uses `Contact.Enemy = 0` and `Contact.Derelict = 1`, but the enemy is ship slot 1 and CREW_SLOT is 0. The contact window's state is `ContactState.ship` (a slot). Its sync closes on `!active(st.ship)` and disarms when `target !== st.ship`. pickShip returns `number | null` over active non-crew slots. 'pickShip's radius rule extended to the derelict' doesn't say whether the result becomes a contact id or a slot, how the derelict (not a slot, no `active`) passes the closing rules, or how aim is kept enemy-only. · spec L43, L111, L115, L120; src/renderer/src/app/duel/contactController.ts:L7, L11, L42-L46, L55-L61; src/renderer/src/render/tactical/tacticalModel.ts:L321-L327; src/renderer/src/sim/tactical/state.ts:L100 · Two implementers would key the window differently. An off-by-one between contact 0 and slot 0 points the window or the scan at the crew's own ship. · Re-key the controller on a contact id: `ContactState { contact: 0 | 1; aim: boolean }`. Add a new `pickContact(input, p): 0 | 1 | null` (keep pickShip for the enemy and use derelictPos with the same pickRadius for the derelict, nearest wins). Map the enemy contact to `hunterSlot` for drawing and aim. The sync's active check uses the enemy slot for contact 0 and is always true for the derelict; arm() is a no-op for the derelict.

### [P1] R1-F8 Patrol isn't mapped onto ShipInput or tickWeapons; the shield 'no recharge' rule has no named home
tickWeapons recharges shields for every slot unconditionally whenever `shields < layers`. §8 lists weapons.ts only for the 'frequency strip', so nothing is assigned the Patrol recharge gate. The spec also doesn't say what shieldClock does in Patrol (held at 0 or accumulating), which decides when the first layer returns after hostility. It doesn't say which ShipInput Patrol returns (`weapons: false` freezes the laser and clears fireHeld; `weapons: true` with no commands does not), or whether the trail ring buffer still updates in Patrol, which changes missile steering for 18 ticks after hostility. 'Only flies (threat avoidance, no pursuit)' leaves the no-threat case open (axes zero?). The shield start is given as `SHIELD_LAYERS − 1`, not the class's layers − 1. · spec L26-L27, L37, L71, L130; src/renderer/src/sim/tactical/weapons.ts:L47-L50, L81, L106-L107; src/renderer/src/sim/tactical/hunter.ts:L58-L69, L83; src/renderer/src/sim/tactical/state.ts:L113-L116 · Each choice changes the hash and the tested shield timing, so two implementers would build different rules. · Specify it. In Patrol, hunterThink updates the trail first, skips updateRepair, and returns `{ helm: true, weapons: false, axes: threat ? avoid : {0,0}, … }`. tickWeapons skips the shield clock (held at 0) for the hunter slot while `state.hostileAt < 0`. createTacticalState sets `systems[1].shields = classOf(1).shields.layers − 1`. The hostility step sets `hunter.mode = Hunt` and `hostileAt = state.tick` (round-relative per the rematch finding). List weapons.ts for the recharge gate.

### [P2] R1-F9 Rejection reasons and wire shapes are left to the plan; `not-seated` doesn't exist
§5 uses `not-seated`, which isn't in COMMAND_REASONS, and then says 'the plan reuses existing reasons where they fit', which defers the decision. The codec's `index` is `int ≥ 0`, so `designate` with −1 (the clear) fails at the wire unless designate uses a different shape. The spec also doesn't say whether out-of-range values pass the codec and get `malformed` from the sim, as throttle does. `designate` has no `noop` when unchanged, unlike laserFrequency, and it doesn't say which module's `commands`/`reasons` lists the new kinds join. · spec L81-L83, L88; src/renderer/src/net/contracts.ts:L88-L92; src/renderer/src/net/codec.ts:L25, L110-L122; src/renderer/src/sim/tactical/hash.ts:L118-L119; src/renderer/src/sim/duel/modules.ts:L49-L55 · Admission tests ('admission per seat') need fixed reason strings, and the wire shape decides which values reach the sim at all. · Use `invalid-seat` for a scan from an unseated or wrong-seat player (no new reason). Wire: `contact: z.number().int()` and `freq: z.number().int()`, with the sim answering `malformed` outside 0..1, −1..1 and 0..2. designate returns `noop` when unchanged. Add a new `science` duel module (or extend `ship`) listing the three kinds and their reasons.

### [P2] R1-F10 Same-tick ordering, scan hand-over and exact tick counts are unstated
The spec doesn't say where the three commands are admitted relative to WEAPON_ORDER and throttle, or what happens when two scan commands land in one tick (envelope order, last wins?). It doesn't say whether a laserFrequency change applies to a release in the same tick, which it would, since fireLaser runs later inside stepDuel. Science clicking SCAN on a contact a Helm player is slow-scanning gets `noop`, so Science can only speed it up by aborting it. The tests demand 'exact tick counts', but the spec doesn't say whether the start tick's progress step counts (L1 done after 180 steps, including the start tick?). The same goes for hostility (`tick >= 1200` at the check gives hostileAt 1200 after 1200 Patrol steps, not the 1199 the test wording suggests). · spec L46-L49, L71, L81, L85, L147-L148; src/renderer/src/sim/duel/step.ts:L165-L191; src/renderer/src/sim/tactical/duel.ts:L28, L34-L39 · The tests will be written against whatever the implementer guessed, and online prediction in Sci-2 depends on the same order. · Add a phase line: after throttle, in envelope order, `laserFrequency`, then `designate`, then `contactScan`, each last-wins. A freq change applies to this tick's release. Define completion as: a scan started at tick t completes at the end of tick t + ceil(units/rate) − 1, and hostility fires in the step whose round-relative tick is 1199, so hostileAt = 1199. Decide whether a scan from a faster seat on the same contact upgrades the rate (recommended: keep progress, take the higher rate, set `by`).

### [P2] R1-F11 View rules conflict with the enemy window spec and existing keys, and the console types have no 'science'
The enemy window spec says T toggles the window on the laser target slot and 'T again' closes it. Sci-1 makes T cycle enemy → derelict → closed, without saying it supersedes that rule or what T does on Science, where the panel is always shown. It also doesn't say whether T selection on Science sends designate the way a click does. S is already `throttleDown` and moveY down. ConsoleStation is 'helm' | 'weapons' | 'ship', consoleTabs' reach is 'helm' | 'weapons', the layout's STATION.h has only helm/weapons, and the controller's `shown` and its T handling admit only helm/weapons. None of this is listed as changed. It also isn't said whether the Science panel shows the LASER aim. · spec L111-L122, L131; docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md:L22-L25, L31, L36; src/renderer/src/app/duel/input.ts:L14; src/renderer/src/render/duel/consoleModel.ts:L12, L33; src/renderer/src/render/duel/consoleLayout.ts:L10-L11, L18; src/renderer/src/app/duel/contactController.ts:L8-L11, L68-L73; src/renderer/src/app/duel/controls.ts:L10-L16 · UI subagents will implement conflicting key and shown rules. · State that Sci-1 replaces enemy-window §3's T rule. Define T on Science as cycling enemy → derelict → none, sending designate each time. Map S to scan only on the Science station (throttle is Helm-only). Extend ConsoleStation, Seat, consoleTabs reach, and the controller's shown set to 'science'. Add a SCIENCE layout entry (map reserves with the panel fixed at CONTACT). Disable LASER aim on Science.

### [P2] R1-F12 The gates have fixed bands, so 'regenerated' and 're-checked' give no rule when the Patrol opening moves them
tests/duelGates.test.ts asserts a median of 180 to 300 s and that the crew both wins and loses; there is no baseline to regenerate. Patrol adds up to 20 s, the enemy's opening shield drops to 1, and the scripted crew's existing fire triggers the ambush, all of which shift outcomes. The spec gives no action if the median leaves the band or the crew stops losing. · spec L95, L155; tests/duelGates.test.ts:L22-L31 · An implementer whose gate fails has no rule: retune, widen the band, or ship red. · Say what passes: the bands stay as they are. If the median leaves 180 to 300 s, the plan reports it and the owner decides; no silent band edits. Or pre-authorise one knob (e.g. HOSTILE_AFTER_TICKS stays and SHIP_HULL may move). Record the expected direction (longer by at most 20 s).

## Verified
- Hostility triggers can be observed at the spec's step position: crew laser releases push `{kind:'laser', ship:0, hit}` and missile endings push `{kind:'missileEnd', ship, target, cause}` into state.events during the same stepDuel (weapons.ts:L74, missiles.ts:L25), before weapon clocks (duel.ts:L28-L34).
- In Patrol, rooms can only be damaged by a crew laser hit with shields down or a missile, and both make the enemy hostile in the same tick. Rams cost hull only (contacts.ts:L18, L39), so updateRepair can't leave Patrol by itself unless the Patrol branch skips it as recommended.
- Shield loot above the class max won't recharge further: tickWeapons holds the clock at 0 when `shields >= layers` (weapons.ts:L106), which matches spec L64 and L140.
- Scan timings check out: 900/5 = 180, 1800/5 = 360, 900/2 = 450, 1800/2 = 900 (spec L46-L49).
- The sit filter currently admits only nav/weapons (step.ts:L149). sitDown at a grouped station seats the player at every member and sets Seated.station to members[0] (stations.ts:L31-L36). The Hound's Science console is station 2 in room O, grouped with Engineering and Doors (hound.json:L178-L213), so a Science seat is buildable once allowedSits and consoleInReach (controls.ts:L35) include it.
- The duel codec admits kinds by an explicit list (codec.ts:L110-L122), and step.ts rejects unlisted kinds with not-in-duel through DUEL_KINDS (step.ts:L29, L191), so the new kinds must be added in both places.
- A new round builds a fresh tactical state through createDuel/createTacticalState (step.ts:L88), so all new tactical fields reset per round apart from the tick-base problem.
- Relative salvage speed is reachable: circularSpeed over orbitR 900 to 1500 gives roughly 41 to 53 u/s, and spawns at radius 2000 against orbitR ≤ 1500 are at least 500 apart, so the 600 rejection triggers only near alignment.

## Not verified
- Whether applyInteractionCommands' sit validation requires the Science group to be powered online in the duel interior (stations.level > 0); I assumed it is, from allocation 1 in hound.json, but didn't read the sit handler.
- Whether groupStations orders the Hound's Ops group with Science first (members[0]), which affects Seated.station after a sit; I didn't read the derived-layout builder.
- The scripted crew's opening behaviour, i.e. how soon it lands a hit and triggers the ambush; I didn't read scripted.ts beyond grep lines, so the gate shift is estimated.
- The view models (contactModel.ts, tacticalModel.ts shield rings and pips) for assumptions that shields ≤ class layers; I didn't read them.
- The duel snapshot restore path, to confirm validateTacticalValues runs on online join and resync; I inferred it from the 'duel snapshot tactical' error text in hash.ts:L195.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `f0b422de`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Tactical ticks do not restart at 0 on a rematch
Confirmed: step.ts startRound sets `next.tactical.tick = tick`. Added `TacticalState.startTick` (science module), set by startRound beside lastLaunch; every round-relative rule uses `rt = tick - startTick` (spec 4.1, 4.5); rematch test added (spec 10).

## R1-F2 [P1]: `scan` collides with the sector's `scan`
Confirmed: contracts.ts:57. Renamed to `contactScan` (spec 5).

## R1-F3 [P1]: Scan progress in stepDuel cannot see seats
Confirmed: stepDuel takes only TacticalState and ShipInput. Added `ShipInput.scanner`, set in step.ts from `attendant(d, scan.by)`; other constructors set true; the science steps stay in stepDuel so the headless gates get hostility (spec 4.6).

## R1-F4 [P1]: Hash and snapshot under-specified
Confirmed: hash.ts validation bounds hunter.mode to Hunt..Repair and shields to max layers; the clone rebuilds named containers only. New spec 6.2: the `science` module with its ordered field list, `freq` after `lock`, fresh containers in the clone, widened validation, `science` in DUEL_NOT_SNAPSHOTTED.

## R1-F5 [P1]: Derelict trig and draws ambiguous
Confirmed: the sim uses table trig only (direction.ts). Spec 4.5 now defines the angle in heading units with dirBetween, the exact draw order with nextInt, and orbitR bands clear of the belt (700-1000, 1400-1599).

## R1-F6 [P1]: SIM_VERSION two-step misdescribed
Confirmed against the Artemis spec 5.6 and duelOracle MIGRATIONS[42]. Spec 6.3 restated: step 1 neutral fields plus MIGRATIONS[43] with added regexes; step 2 the behaviour.

## R1-F7 [P1]: Contact ids clash with ship slots
Confirmed: contactController keys on a ship slot. Spec 4 and 7.2: contact ids are separate, ContactState.contact, new pickContact, the enemy drawn through hunterSlot, arm a no-op on the derelict.

## R1-F8 [P1]: Patrol not mapped onto ShipInput/tickWeapons
Confirmed: tickWeapons recharges unconditionally. Spec 4.2 gives the exact Patrol ShipInput, trail kept, repair skipped, shield clock held while hostileAt < 0; the start uses the class layers.

## R1-F9 [P2]: Reasons and wire shapes
Confirmed: `not-seated` does not exist. Spec 5 uses existing reasons, int wire with the sim answering malformed, designate noop, the science module's lists.

## R1-F10 [P2]: Same-tick ordering and exact counts
Confirmed. Spec 5 admission order after throttle; same-tick freq applies; a faster seat takes over the rate; spec 4.3 exact completion tick; spec 4.1 hostility in the step of rt 1199.

## R1-F11 [P2]: View rules conflict
Confirmed: input.ts maps S to throttle; types have no science. Spec 7.2/7.3: T supersedes the enemy-window rule, S scans on Science only, science added to the console types, layout and shown set; no aim on Science.

## R1-F12 [P2]: Gates have fixed bands
Confirmed: duelGates.test.ts asserts 180-300 s. Spec 10: bands unchanged; a failure is reported to the owner, no band edits or retuning.

## Also changed

- Section 9 edge cases updated for missiles and the trap deciding a round.

## Files changed

- docs/superpowers/specs/2026-11-17-science-scans-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 15b4d988, effort medium, 126 s, 650607 in / 584854 cached / 9726 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Step-1 neutral derelict (orbitR 0) fails the new §6.2 validation, so step-1 snapshots cannot restore
§6.3 step 1 zeroes the derelict (`derelict zeroed with salvaged 1`), so `derelict.orbitR` is 0. §6.2 validates `derelict.orbitR in the drawn bands` ([700, 1000] ∪ [1400, 1599]). Every snapshot taken under step 1 would therefore fail validation on restore. The two sections contradict each other. · spec L117 (step 1: derelict zeroed, salvaged 1); spec L113 (orbitR in the drawn bands); spec L68 (bands 700..1000, 1400..1599); src/renderer/src/sim/duel/modules.ts:L87-L95 (the snapshot path runs through these modules) · Under step 1 the snapshot and online-join tests would throw. The plan author would then have to choose between relaxing validation and picking a non-zero neutral value, and those two choices give different step-1 hashes. · Pick one neutral value that the validation accepts, and name it in step 1. One option is `orbitR` 700 with `salvaged` 1. The other is to allow `orbitR` 0 in validation only when `salvaged` is 1. Then add a step-1 snapshot round-trip test.

### [P2] R2-F2 The spec doesn't say whether `scanner` is computed before or after contactScan admission, and a takeover in the same tick depends on it
§4.6 says step.ts sets `scanner = scan.contact < 0 || attendant(d, scan.by) >= 0` 'after the seat phase'. §5's admission phase also runs after the seat phase and can change `scan.by`: a faster seat takes over the rate and its `by`. Take a Helm scan whose Helm player stands this tick while Science sends contactScan on the same contact. If `scanner` is computed before admission it is false and the scan cancels. If it is computed after, it is true and the scan continues at Science's rate. · spec L82 (scanner computed 'after the seat phase'); spec L92 (takeover sets `by`); spec L97 (admission after the throttle loop, against the seats after the seat phase); src/renderer/src/sim/duel/step.ts:L168-L192 (crew ShipInput built, then the command loops) · The two orders produce different hashes in a reachable case, and the scan tests ('a faster seat takes over', 'leaving the seat cancels') would be written against whichever one the implementer guessed. · State that `scanner` is computed after the contactScan admission loop, from the scan as it stands after admission. Add a test where the Helm player stands and Science takes over in the same tick.

## Prior findings
- R1-F1: resolved — `startTick` is set by startRound beside lastLaunch (step.ts:L93). Every round-relative rule uses rt (spec L37). hostileAt is round-relative and starts at −1 in each new round. A rematch test is listed (L170).
- R1-F2: resolved — The command is renamed `contactScan` (spec L88, L92).
- R1-F3: resolved — `ShipInput.scanner` is set in step.ts from `attendant(d, scan.by)`, and the science steps stay in stepDuel (spec L82-L83). `attendant` exists at step.ts:L46. The tick order relative to admission is still open; see the new P2.
- R1-F4: resolved — §6.2 gives the science module, its field order, `freq` after `lock` (SYSTEMS_TAIL at hash.ts:L20), fresh clone containers, and validation widened for Patrol (hash.ts:L179) and layers + 1 (hash.ts:L172). `science` is added to DUEL_NOT_SNAPSHOTTED (L104). The step-1 orbitR conflict is raised separately.
- R1-F5: resolved — The angle is in heading units, using `dirBetween`/`wrapHeading` (direction.ts:L5, L10), `circularSpeed` (map.ts:L26), `DT` (sim/tuning.ts:L3) and `HEADING_COUNT` (tuning.ts:L8). The draw order and bands are exact (L66-L75). Prograde is heading + 64, as in spawnAt (map.ts:L58).
- R1-F6: still open — The two-step structure is now correct, but the version numbers are stale. Master already has `SIM_VERSION = 44` (src/renderer/src/sim/tuning.ts:L7, from the start-aboard merge 69f34c27), and the oracle requires bump = baseline + 1 with MIGRATIONS keyed by the baseline (scripts/golden/duelOracle.ts:L10, L331-L333). Spec L117 says 43 → 44 with `MIGRATIONS[43]`, which the oracle would never apply. It should say 44 → 45 with `MIGRATIONS[44]`, and L118, the §1/§8 text and the role line should be updated to match. The `added` regexes match duelSchema's `<module id>.<field>` naming (duelOracle.ts:L103, L111).
- R1-F7: resolved — `ContactState.contact`, the new `pickContact`, the enemy drawn through `hunterSlot` (duel.ts:L13) and `arm` as a no-op on the derelict are all in spec L33 and L133-L134 and L139.
- R1-F8: resolved — The Patrol ShipInput is given exactly (L44), the shield clock is held while hostileAt < 0 (L45), and the start is the class's layers − 1 (L39). This fits tickWeapons L106-L107 and laserFrozen when `weapons` is false (weapons.ts:L48-L49).
- R1-F9: resolved — Only existing reasons are used: `invalid-seat` and `not-at-weapons` (as the throttle uses them, step.ts:L185). The wire is int, the sim answers malformed, designate returns noop, and the module lists are in L110.
- R1-F10: resolved — The spec now states the admission order after the throttle (L97), that a frequency change applies in the same tick (fireLaser runs inside stepDuel later), the completion tick formula (L53), hostility at rt 1199 (L40) and the rate takeover (L92). The scanner-versus-admission ordering is raised as a new P2.
- R1-F11: resolved — T now supersedes the enemy-window rule, S scans on Science only, Science is added to ConsoleStation/Seat/reach/layout, and Science has no aim (L105, L135, L139, L143-L146).
- R1-F12: resolved — The bands are unchanged, the expected direction is stated, and a failed band is reported to the owner (L177).

## Verified
- Hostility triggers line up with the event shapes: a `laser` event has `ship` and `hit` (state.ts:L78) and a `missileEnd` event has `ship` and `target` (state.ts:L80). The hostility step runs after resolveMissiles and tickWeapons (duel.ts:L33-L34), so that tick's events are present.
- Holding the Patrol shield clock fits tickWeapons L106-L107. A layer at layers + 1 is never regained because the `shields >= layers` branch zeroes the clock.
- A derelict at orbitR ≤ 1599 is always at least 401 from spawns at SPAWN_RADIUS 2000 (tuning.ts:L34). The 600 rule can bind only on the outer band, and the inner band always clears it.
- DUEL_MODULES uses path 'tactical' for the tactical modules (modules.ts:L88-L89), and the `science` id doesn't collide with an existing module id.
- `stationOfKind[StationKind.Science]` exists in the sector sim (debris.ts:L70).

## Not verified
- That the Hound layout actually has a Science station in Ops. I didn't open the layout file.
- Whether non-belt asteroids or the belt asteroids' radius (BELT_R_MAX 45) intrude within SALVAGE_RANGE of orbitR 1000 or 1400. The edges are close (1100 − 45 = 1055 against 1000 + 60), but I didn't check generateMap's placement.
- What start-aboard (SIM 44) changed beyond the version number, for example whether its sit or consoleInReach changes conflict with §6.1. I didn't read that spec.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject. 3 accepted (R1-F6 reopened, R2-F1, R2-F2), 0 rejected. 11 prior IDs resolved.

## R1-F6 [P1]: The SIM_VERSION two-step (reopened)
Confirmed: src/renderer/src/sim/tuning.ts:7 is 44 after the start-aboard merge 69f34c27. Spec 6.3 now says 44 -> 45 with MIGRATIONS[44]; step 2 blesses at 45; section 8 names MIGRATIONS[44].

## R2-F1 [P1]: Step-1 neutral derelict fails validation
Confirmed: orbitR 0 is outside the 6.2 bands. Step 1 now uses orbitR 700, phase 0, loot 0, trapped 0, salvage 0, salvaged 1; a step-1 snapshot round-trip test is added.

## R2-F2 [P2]: scanner versus contactScan admission
Confirmed. Spec 4.6: scanner is computed after the contactScan admission loop, from the scan after admission; a same-tick takeover test is added.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-science-scans-design.md

<!-- end -->

---

