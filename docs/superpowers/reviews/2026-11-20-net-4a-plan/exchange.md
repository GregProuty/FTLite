# Codex review exchange: net-4a-plan

Subject: `docs/superpowers/plans/2026-11-20-net-4a-duel-prediction.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing a2e909a5, effort high, 1102 s, 14807813 in / 14478947 cached / 98536 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 The trim drops every unacknowledged entry before an anchor exists, so P never builds its lead (lead stays 0-3 ticks at any RTT over one cadence gap)
After a reset `offset = T - local` maps the newest entry to T, and every later confirm sets `offset = target - local` and drops every entry with `local <= T - offset`. With P standing on T (no lead yet), that cut is the newest local tick: the whole log goes. The anchor this seat needs (the entry the authority latched one round trip ago) has therefore always been dropped before its heldHighWater arrives. With no anchor, `measured = max(T, local + offset) = standing`, so the target stays where P stands and the lead is never built. Trace of Task 4's 'runs ahead' test (S = 0, 6-tick delay): at L = 9, T = 9 and hw = 3, but the log holds only entries 7, 8 and 9 (the confirm at L = 6 dropped entries 1-6). No anchor is found, measured = 9, target = 9, offset = 0 and the cut = 9, which drops everything again. This repeats forever, so `expect(p.stats().lead).toBe(6)` fails (lead 0). The command test fails the same way: at L = 12 (T = 12, cw = 0) entry 10 is cut, its throttle moves to `waiting`, and the re-sim to T = 12 leaves P at throttle 0. In the real rig, a reset makes P equal to T at reception and P then advances one tick per local tick, so P stands about on T at every later publication and the same cut applies. The spec's §3.4 step 1 states the same rule; the plan copies it without noting the gap. · plan L895 (reset: `log = []`, `offset = publication.tick - local`), L913 (anchor searched only in `log`), L917-919, L923 (`offset = target - local`), L925-926 (`cut = T - offset`; `while (log[0].local <= cut) log.shift()`), L681-697 (test expects lead 6), L707-722 (command test). Spec L97 (§3.4 step 1: same trim, same post-reset mapping). The measuring script hides it: its first confirm comes 15 local ticks after the reset (plan L2292-2301), so the anchor is still in the log. · P is just C plus a few ticks: no prediction of your own input. While input changes, P snaps back to C at every publication; your own input is applied one RTT early and every hash at T mismatches. Task 4's own test fails. So do G1(b) (L1103-1108, hash mismatches), G3 at 600 ms (L1124-1127 expects some `!stepped`) and G5(d) (L1153-1157 expects stalls). The executor is left to redesign §3.4 inside Task 5. · Separate 'keep for anchoring' from 'carry commands'. In confirm: (1) find the anchor as now. (2) Drop log entries only by acknowledgement: `local <= anchor.local` when an anchor is found, none otherwise (bounded by PREDICT_LOG_MAX). (3) For entries the new mapping places at or before T (`local <= T - offset`) that are not dropped, move their surviving commands (`sequence > cw`) to the first entry mapped after T (or `waiting`) and empty those entries' command lists, but keep their heldSequence so a later hw can anchor on them. `planned()` already indexes by `local`, so it works with older entries kept. Record this as plan deviation 2 (the spec's step 1 rule cannot build a lead). Add a hand test where each publication is confirmed only after the predictor has stepped up to that publication's tick (lead 0 at reception, as on the wire), and assert that the lead reaches the round trip in ticks.

### [P1] R1-F2 Task 9 deletes `unackedFrames`, but `turret()` still reads it, and the turret/vent tests that read the source are neither rewritten nor deleted
onlineSource's `turret()` passes `unackedFrames` to `predictTurret`. Task 9 deletes `unackedFrames` (and its own grep check requires it gone) but never says what `turret()` becomes, so tsc fails. Behaviour also changes from Task 7 on. Once Task 6/7 make `duel()` return P, `turret()` reads P's `pewManual`. P already carries the gunMode command, because the stub's commandHighWater stays 0, so P never drops it. So tests/onlineDuelSession.test.ts L315 (`turret(0)` is 0 once the gunMode result clears gunModeSent) fails, yet Task 7 Step 5 expects PASS. Separately, L812-821 calls `h.source!.helmVent()` and `thrMille()`, which Task 9 removes; that case is not in Task 9's delete list. · onlineSource.ts:L177-183 (`turret` → `predictTurret(..., manualTorpedoFlying(d.tactical) ? 0 : unackedFrames)`); plan L1936 (delete `unackedFrames`…), L1952 (grep must print nothing for unackedFrames), L1386 (`duel = predicted() ?? client.state()`), L1475 (stub watermarks zeros), L1661 (Task 7 'still pass'); tests/onlineDuelSession.test.ts:L302-316, L374-393, L812-821; plan L1894-1897 (delete list omits these). · Task 9 cannot compile as written, Task 7's test run fails on an existing case, and an executor must invent the turret's behaviour. · In Task 9 set `turret: (slot) => { const s = duel().tactical.systems[0]; return slot === 0 ? s.pewTurret : s.gunTurret; }` (P already slews toward the held turretAim) and remove the `predictTurret` import. Rewrite L302-332 and L374-393 against P, with acknowledgement by `water.command`; delete or rewrite L812-821 (vent and thrMille now read P's own fields). In Task 7, either expect L302-316 to change or keep `turret()` on `client.state()` until Task 9.

### [P1] R1-F3 Task 7's 'first tick takes the presses' test uses the Cutter's Weapons seat, where Space sends nothing
`rig(1)` builds the Cutter (the Hound turret class). At its Weapons seat `houndWeaponsSeat` is true and the session's branch for that seat ignores Space. No `laserCharge` is ever sent, so `toHaveLength(1)` fails whatever the tick logic does. The existing Space→laserCharge cases pass `ShipClass.ValkyrnLaser` for exactly this reason. · plan L1498-1503; app/duel/controls.ts:L38 (`houndWeaponsSeat` = weapons && hasTurret); app/duel/onlineDuel.ts:L309-361 (L361: 'Space, Z and V do nothing here'); tests/onlineDuelSession.test.ts:L522, L528, L558 (`rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser)`). · The new test fails at Task 7 Step 5 for a reason unrelated to the feature. · Use `rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser)` in that case.

### [P1] R1-F4 Task 10's record test validates a record whose summary is only `{ round, seed }`; the strict summary schema rejects it
`roundEvent(0)` gives the record `{ round, seed }`. The test spreads that into `summary` and expects `validateDuelRecord` not to throw, but `summary` is a strict zod object with about 25 required fields. The plan's fallback ("use this file's existing record cases") does not help: they also use `roundEvent`. · plan L1993-2003, L2009; tests/onlineDuelSession.test.ts:L97 (`roundEvent` → `record: { round, seed: 7 }`); net/duelRecord.ts:L37-43 (strict summary), L53-55. · The test cannot pass as written. · Validate only the new block: `expect(() => duelRecordSchema.shape.prediction.unwrap().parse(rec.prediction)).not.toThrow()` (import `duelRecordSchema`). Alternatively build a full summary the way tests/onlineDuel.test.ts:L131 does.

### [P1] R1-F5 The impaired link imports `createRng`/`nextFloat` from `src/renderer/src/sim/rng`, which does not exist
The module is `src/shared/rng.ts`; scripted.ts imports it as `../../../../shared/rng`. The plan's note assumes the file is `sim/rng.ts` and leaves only an export-name fallback. · plan L482, L549; Glob `src/{renderer/src/sim,shared}/rng.ts` → only `src/shared/rng.ts`; sim/duel/scripted.ts:L5; src/shared/rng.ts exports `createRng(seed)` and `nextFloat(r)`. · Task 3 fails at import, and Tasks 5 and 11 depend on it. · `import { createRng, nextFloat } from '../../src/shared/rng';` and delete the 'check at execution' note.

### [P2] R1-F6 The sector schema bump breaks fixtures not in Task 1's list (encounterMode, sessionCapture)
Both tests start a host for `sectorMode` with an identity literal of `schemaVersion: 1`. `createHostRuntime` compares it with the definition, which is now 2. Task 1 Step 5 runs encounterMode.test.ts and expects PASS, but its only advice is for zod errors that name `held`. · plan L91-93, L206-214; tests/encounterMode.test.ts:L39 (`harness(sectorMode)` → identity `schemaVersion: 1`); tests/sessionCapture.test.ts:L213-221 (initialize `modeId: 'sector', schemaVersion: 1`); src/network/hostRuntime.ts:L10. · Task 1's verification run fails, and the full suite (Task 12) fails on sessionCapture. · In Task 1 Step 4, change those literals to `sectorMode.schemaVersion` (encounterMode.test.ts:39 can use `mode.schemaVersion`). Also grep tests for `modeId: 'sector', schemaVersion: 1` and `modeId: 'duel', schemaVersion: 2` where a real mode is hosted.

### [P2] R1-F7 `heldKey` omits `weaponSel` and `turretAim`, so 'verified' can pass with the partner's newer reticle or selection unused
The input key for 'equal by content' covers 10 of HeldInput's 12 fields. When the Weapons partner moves the reticle (turretAim changes every pump while aiming) or changes selection, the publication's `held` differs from what P stepped after T, yet the keys match. P is verified while its partner turret is stale for the whole lead, and it is corrected only by the next publication's hash at T. · plan L856-857 (HELD_KEYS); net/contracts.ts:L43 (HeldInput has weaponSel, turretAim); net/codec.ts:L165; spec L100 (§3.4 step 4, 'equal (by content)'). · Verify accepts a P that is not what a re-sim would produce, in ordinary Hound play. · Add `'weaponSel'` and `'turretAim'` to HELD_KEYS, or build the key from a sorted list of all keys. Add a predictor test where only the partner's turretAim changes and confirm returns 'resimulated'.

### [P2] R1-F8 Task 9 has the session's 'decided', rematch and leave prompt read P, contrary to §3.6 (outcome from C)
`const d = predictor?.state() ?? client?.state()` feeds `decided`, `leavePromptKeys` and the held-or-neutral choice. P leads by the round trip, so it decides the round first. For the length of the lead, input goes neutral, Enter sends a `rematch` the authority answers duel-running, and Escape opens the leave prompt instead of pausing. A predicted kill the authority does not confirm produces the same symptoms. · plan L1921; spec L131 (§3.6: round outcome, end card and phase from C and the publication); app/duel/onlineDuel.ts:L450 (`decided`), L457, L463, L475. · This is an unstated deviation from §3.6, and it shows at the end of every round the crew wins. · Keep `decided` and `leavePromptKeys` on the confirmed replica: compute `decided` from `client.state()` and read only the seat, console and refusal decisions from P.

### [P2] R1-F9 Task 1's first test waits too few ticks for a cadence publication that includes the latched frame
The frame is sent after `w.tick(2)` and sits in the guest outbox through pump 3; pump 4 latches it. In this rig pump k runs tick k, and unreliable publications go out only on ticks that are multiples of 3. `w.tick(3)` ends at tick 5, so seat 1's newest publication is tick 3's, which predates the frame, and `p.held[0]` is neutral. · plan L117-124; authority/tickDriver.ts:L18, L43 (one tick per 1000/60 ms pump, numbered from 0); tests/helpers/onlineDuel.ts:L57 (pump, then flush); src/network/modes/streamBinding.ts:L91 (non-cadence unreliable publications are dropped). · The Task 1 test would fail after the implementation is correct. · Use `w.tick(6)` after the `held` call, as the existing online tests do, or assert on the first cadence publication whose `heldHighWater[0]` is at least the frame's sequence.

### [P2] R1-F10 The gate tests run thousands of full-stack ticks with no timeout, under vitest's default 5 s
G4 runs 3600 ticks of the online authority, codec and two remote clients, plus two predictors, three times. G1 has 13 runs and G5 four 1260-tick runs. The existing online scripted test, which does less per tick, needs `300_000` and a setImmediate yield per case. · plan L1092-1102, L1142-1160, L2151-2160; vitest.config.ts:L11 (no testTimeout); tests/duelOnline.test.ts:L44-46, L92 (`}, 300_000)`). · The gates likely fail by timeout, or stall the worker RPC, rather than on what they measure. · Give each gate `it` an explicit timeout (e.g. 120_000) and `await new Promise((r) => setImmediate(r))` at its start, as duelOnline.test.ts does.

### [P3] R1-F11 Plan deviation 1 lets a 1-2 tick mapping error persist indefinitely
With `offset = target - local` and the slack, a lasting shift of the anchor by 1-2 ticks never corrects. Examples: ticks dropped by LOCAL_TICKS_MAX, or the authority running two ticks in one pump. Every own-input change then fails the hash at T, and each re-sim reuses the same wrong mapping, so a small correction recurs at every publication while flying. The deviation is otherwise sound: tick() and planned() agree, and commands cannot vanish. · plan L918, L923, L972-976; spec L103, L105. · It adds avoidable repeated corrections, which G4 would count. · When a re-sim was triggered by the hash at T (not by keys) and the anchor exists, adopt the anchor's offset for planning while keeping P's tick when within the slack, or report the measured-minus-standing gap in stats so the playtest can see it.

### [P3] R1-F12 F3's RESIM figure is the p99 of all confirms, and a link close does not dispose the predictor
The overlay passes `p99(confirmSamples)`, which includes cheap verified confirms, while §3.10 asks for the re-simulation time; the record uses `roundResim`, which is correct. Separately, §3.4 disposes the predictor at link close, but the plan disposes it only in `release()`. After a close, `pump` keeps calling `predictor.tick(idle)`, so P steps hidden up to the cap. · plan L2102 vs L2079; spec L183, L117; plan L1586; app/duel/onlineDuel.ts:L519 (onClose does not call release). · The F3 figure is mislabelled; the extra stepping wastes a little CPU. · Keep a `liveResim` list for the overlay. In the onClose handler add `predictor?.dispose(); predictor = null; confirmedSequence = 0;`.

## Verified
- codec.ts:L164-166 defines the `held` schema inside messageSchemaFor, and L202-207 is the publication schema with the watermark refine, so Task 1's codec edit compiles; duelPublicationSchema is exported at codec.ts:L255.
- core.ts:L58, L316 and L436: `held` is the authority's latched array (L436 clears it before the pause publication at L437); executeTick publishes right after the step (L446-468), so `held` is what the tick used.
- duelStream.ts:L36 and sectorStream.ts:L36 carry the whole publication as metadata (`...publication`), so `held` rides the wire without changes there.
- Schema version sites: duel.ts:L19, onlineDuel.ts:L19, sector.ts:L20, onlineSector.ts:L31; hostRuntime.ts:L10 compares them.
- streamClient.ts:L196-205: neutralize's shape matches Task 4's rewrite; duelClient.ts:L60-78: `command` returns a CommandId or null and `held` returns a sequence or null.
- snapshot.ts:L35, L114-118, L220-227: the header has crewClass, and restoreDuelSnapshot requires the same layout, seed, crew and class, which the predictor's `matches` checks; publication.hash equals snapshot.header.hash (hashDuel = hashF64(flattenDuel)).
- tactical/state.ts exports Outcome (L131), NO_AXES (L217), CREW_SLOT (L220), createTacticalState (L288) and missileOf (L315); ships and missiles have headingAcc.
- rocks.ts exports rockAt (with r), rockAlive, rockSlots and beginRockTick; rockBreak.ts:L119 `breakRock(s, k, ux, uy, by, ship, pattern)` matches burstRock's call; scripted.ts:L380 `scriptedInput(pair, d): DuelInput` with envelopes stamped with requestedTick = st.tick; DuelEnvelope = CommandEnvelope<DuelCommand>.
- step.ts:L393-402: the Valkyrn's throttle command applies within the same step (requestedTick must equal the tick; the Helm attendant; not newtonianHelm), so the hand-built command test's authority side is right.
- G2 arithmetic: snapshots at 0..1797 step 3, kept when k + 12 <= 1800 → 597 checks.
- Task 4's cap, pause, decided, new-seed and hashAt tests trace correctly through the plan's reset and tick code.
- No double application of commands in the predictor: a command leaves the entries only by cw (plan L914-915), and after the authority runs it, a recorded key or hash mismatch re-simulates from T without it.
- boundary.test.ts:L12 and determinismGuard.ts: the predictor uses only Math.abs, min, max and sqrt, has no `**`, and imports nothing from app, render or input.
- Task 7's tick clock against the rig (rig.pump advances 1000/60; 50 ms gives 3 ticks; 200 ms is capped at 4) and the unfocused (+5) and link-close cases trace correctly.
- Task 8: duelSounds.ts:L64-73 gives the audio test's victory cue from the confirmed watch only; interiorView.ts:L47, L113, L179-180, L210 and crewSprites.ts:L28, L54-72 match the override plumbing in tiles; timeline.ts:L1 matches PresentationPoint.
- Task 11 part B: the anchor is exact (heldSequence L is the input that produced tick L; heldHighWater k) and sequenceAt's watermarks cover exactly the commands stepped before k.

## Not verified
- Whether `const w = onlineDuel(..., { link: (peer) => impairedPair(peer, { now: () => w.nowMs(), ... }) })` (plan L1077, L2152) raises TS7022 (a variable referenced in its own initializer through an expression-bodied arrow) under tsc -b; vitest would run it either way.
- Whether other descriptor literals (tests/onlineRenderer.test.ts, tests/pageSession.test.ts) are compared against the bumped compatibility; not traced.
- Whether the onlineDuelSession lockSent case (L333-351) still passes once Task 9 reads P: it depends on whether the sim admits laserLock on an unseen enemy at the start.
- Whether the added `held` metadata keeps busy duel images under MAX_METADATA_BYTES and MAX_IMAGE_BYTES (imageCodec limits not read).
- The real run time of the gate and G2 tests; the timeout finding rests on duelOnline.test.ts's 300 s budget, not on a measurement.
- Whether the determinism browser bundle (vite, root scripts/determinism) imports cutter.json and the sim cleanly; not built.
- Whether `(s as { thrMille?: unknown })` in Task 9's rewritten tests passes tsc's comparability check.
- Whether the onlineDuel rig's authority ever starts paused, which would shift the Task 1 tick arithmetic; tickDriver.ts gives one tick per pump from tick 0 when running.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `a2e909a5`: 11 accepted, 0 rejected, 1 deferred (R1-F11). Several findings come from the W-4 merge (90cd5825, SIM 63), which landed on master after the plan was written. The plan now follows it throughout.

## R1-F1 [P0]: The trim drops every unacknowledged entry before an anchor exists

Confirmed. I traced Task 4's "runs ahead" test with the old code. After the reset `P` stands on `T`, the cut is the newest local tick, and every entry goes before its held watermark can come back. The spec's §3.4 step 1 has the same rule.

Fixed in Task 4's `confirm`:
- An entry leaves the log only at or before the anchor, or by `PREDICT_LOG_MAX`.
- An entry the mapping puts at or before `T` keeps its `heldSequence`, and its commands move to the first entry mapped after `T` (or to `waiting`).

I retraced the "runs ahead" test with the fix: at L=9 the anchor is entry 3, measured is T+6, `P` re-simulates to it, and the confirms after that verify. Recorded as plan deviation 2, next to the code, with the reason the spec's rule cannot build a lead.

## R1-F2 [P1]: Task 9 deletes `unackedFrames` but `turret()` reads it

Confirmed: `onlineSource.ts:L177-183` (W-4) calls `predictTurret(..., unackedFrames)`.
- Task 6 now switches only the drawing members to `P`. Every other member reads a new `replica()` until Task 9, so W-4's turret, `thrMille` and vent behave as today in Tasks 6 to 8.
- Task 9 removes `gunModeSent`, `lockSent`, `gunModeShown` and `gunModeBase`, and makes `turret()` read `P`'s `pewTurret` and `gunTurret`.
- Task 9 rewrites the W-4 turret and lock cases against `P` (acknowledged by `water.command`), and deletes the blur case. It drops `predictTurret` if it has no caller, and its grep check covers the new names.

## R1-F3 [P1]: Space test on the Cutter's Hound-style Weapons seat

Confirmed: `controls.ts:L38` and `onlineDuel.ts:L361`. The test now uses `ShipClass.ValkyrnLaser`.

## R1-F4 [P1]: Record test validates a partial summary

Confirmed: `roundEvent` gives `{ round, seed }` (`tests/onlineDuelSession.test.ts:L97`). The test now validates only `duelRecordSchema.shape.prediction`.

## R1-F5 [P1]: rng import path

Confirmed: the module is `src/shared/rng.ts` (`scripted.ts:L5`). The import is fixed and the check-at-execution note is gone.

## R1-F6 [P2]: Sector schema bump breaks hosted-mode literals

Confirmed: `encounterMode.test.ts:L39` and `sessionCapture.test.ts:L213-221` against `hostRuntime.ts:L10`. Task 1 Step 4 now changes them to read the definition, greps for others, and adds `sessionCapture` to the run.

## R1-F7 [P2]: `heldKey` omits W-4's fields

Confirmed: `contracts.ts:L43` now has `weaponSel` and `turretAim`, and no longer has `torpTurn`, which would also have failed `tsc`.
- `HELD_KEYS` lists all 12 fields, with a compile-time check that none is missing.
- `heldKey` is exported and unit-tested for single-field changes.

## R1-F8 [P2]: `decided` and the leave prompt read P

Confirmed against spec §3.6 (L131). In Task 9, `decided`, `leavePromptKeys` and the guard read the confirmed replica `c`; only console decisions read `P`.

## R1-F9 [P2]: Task 1 test waits too few ticks

Confirmed by the cadence filter (`streamBinding.ts:L91`). Both waits are now `w.tick(6)`.

## R1-F10 [P2]: Gate tests have no timeout

Confirmed: `vitest.config.ts` has no testTimeout, and `duelOnline.test.ts` uses 300 s plus a yield. The Task 5 describes take `{ timeout: 120_000 }` and Task 11's takes 300 s, each with a `setImmediate` yield in `beforeEach`.

## R1-F11 [P3]: A lasting 1-2 tick mapping error persists

Deferred. The effect is real but bounded: it only adds re-simulations while this seat's input changes. `stats()` already exposes `measured` and `standing`, so G1(c) and the playtest can see it. If G4 or the playtest shows recurring corrections, adopting the anchor's offset after a hash mismatch is the follow-up.

## R1-F12 [P3]: F3 RESIM figure; no dispose on link close

Confirmed. Task 7's close handler now disposes the predictor (spec L117), and F3 reads a `liveResim` list of re-simulation times only.

## Also changed

- The Global Constraints and Task 12 say `SIM_VERSION` stays 63, not 62. The W-4 merge moved it after the spec was written.

## Files changed

- docs/superpowers/plans/2026-11-20-net-4a-duel-prediction.md

<!-- end -->

---

