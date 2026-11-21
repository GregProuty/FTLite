# Science hacking spike — plan

Spec: `docs/superpowers/specs/2026-11-20-science-hacking-design.md` (§1–§5 plus the R1 amendments in §6, which win).
Branch `spike/hacking`, worktree `.worktrees/hacking`, base origin/master 7e92c060 (SIM 69). Spike: not merged.
Every task: TDD where practical, `npx tsc --noEmit -p .` (or the repo's typecheck script) clean, the touched test files
green, then a commit ending with the Co-Authored-By line. Sim code: + − × ÷ and sqrt only; no Math.random.

## Task 0 — SIM 69 → 70 alone (set the WIP aside)

1. `git diff > <scratchpad>/hack-wip.patch`, then `git checkout -- src` (the four partially edited sim files).
2. On the clean code: `npx tsx scripts/golden/canonical-trace.ts baseline`, `npx tsx scripts/golden/duel-oracle.ts baseline`.
3. Bump `SIM_VERSION` 69 → 70 in `src/renderer/src/sim/tuning.ts` (Edit tool; no Set-Content: it adds a BOM).
4. Both scripts `check`, `npm run bless`, commit `chore(hacking): SIM_VERSION 69 -> 70 alone, blessed`.
5. `git apply <scratchpad>/hack-wip.patch`.

## Task 1 — State, hash, bars helpers

Files: `sim/tactical/{state,hash,bars,tuning}.ts`.
- Finish §2.1/§2.2 (the WIP already adds the fields, constants and helpers): import HACK_BAR_MAX, HACK_DISABLE_TICKS,
  HACK_TICKS in hash.ts; `sensorRange`'s Pick gains `'hackPower'`.
- R1-3 value rules in `validateTacticalValues`: hackPower 0 off the crew slot; hacked all 0 on the crew slot;
  hackRoom −1 ⇔ hackTicks 0; hackTicks ≤ HACK_TICKS − 1; target's hacked[hackRoom] 0 while a hack runs. Follow the
  existing crew-only checks' shape.
- Update the pinned command lists in `tests/scienceState.test.ts` and `tests/duelModules.test.ts`.
- Tests (`tests/hackState.test.ts`): helpers (hackBars trims, scannerBars, hackOnline, roomLevel); a fresh state and a
  rematch start all four fields at rest; flatten/unflatten/clone round trip with a hack running and a room hacked; each
  value rule rejects its bad value.

## Task 2 — Gates read roomLevel

Files: `sim/tactical/{weapons,gun,pew,physics}.ts`. Replace the non-crew `rooms[Room.X]` gate reads with
`roomLevel(sys, Room.X)`: canLaunch's non-crew `up`, laserOffline's non-crew branch, the non-crew laser charge rate, the
non-crew shield recharge rate, gun.ts cooling and fire gate, shipEngineFactor's non-crew branch. pew.ts: `pewPowered`
for a non-crew ship is `roomLevel(Weapons) < 2`, and `tickPew` gains nothing while the ship's pew is unpowered (R1-9;
check the crew path keeps today's behaviour: the crew's gain is already 0 at 0 bars). Damage, repair and the Hunter's
repair choice still read `rooms`. If importing `roomLevel` collides with crtTheme's `roomLevel` anywhere, alias it.
- Tests (`tests/hackGates.test.ts`): with `systems[1].hacked[r] = 100`: Weapons → Hunter laser offline (no charge), canLaunch
  false, pew unpowered and its charge held, and over a few hundred ticks of stepDuel no Hunter pew round or rng draw from
  the pew; Engines → shipEngineFactor 0 (no thrust/turn); Shields → recharge held. With hacked 0 the same reads equal
  today's.

## Task 3 — Science rules: scanner bars, hackStep, hostility

Files: `sim/tactical/{science,duel,weapons,hunter,state}.ts`, `sim/duel/step.ts` (ShipInput literal).
- `sensorRange`, `scanProgressRate` read `scannerBars`.
- `ShipInput.hacker: boolean` (Science attended); every ShipInput literal gains it (true by default, as `scanner`:
  UNCREWED_INPUT etc., the hunter's, step.ts's crew input sets it to `scientist >= 0` — computed where `scientist` is).
- `hackStep(t, hacker)` per spec §2.5 + R1-14: count every slot's hacked down; then a running hack is lost
  (`{kind:'hack', what:'lost', room}`) when !hacker, !hackOnline(crew), designated ≠ Enemy, or !shipSeen(target); else
  hackTicks++ and at HACK_TICKS: target.hacked[room] = HACK_DISABLE_TICKS, Shields → shields 0 and shieldClock 0, push
  `{kind:'hack', what:'done', room}`, hackRoom −1, hackTicks 0. Target = `systems[CREW_SLOT].target`.
- stepDuel: hackStep after scanStep.
- R1-1: hostilityStep also fires when any of the target's hacked > 0, cause `'hack'` (order laser, gun, pew, missile,
  hack, clock). DuelEvent: add the `hack` event; widen the hostile cause union (and any exhaustive switch on causes).
- Tests (`tests/hackStep.test.ts`): set hackRoom directly and step; lands after exactly 420 held ticks (admitted at tick N
  → lands end of N + 419 once Task 4 exists; here pin 420 steps from hackTicks 0); each loss condition loses it with
  the event and resets; the disable lasts exactly 1800 ticks; Shields hack zeroes shields; hostility on the tick after
  landing with cause 'hack'; range shrinks with hack bars (600 at 2 Sensors all on HACK); a shorter range blinds the
  crew's AUTO / lock reads (shipSeen false where it was true).

## Task 4 — Commands and admission

Files: `net/contracts.ts`, `net/codec.ts`, `sim/duel/step.ts`, new `sim/duel/scienceSlots.ts`, `sim/duel/power.ts`,
`sim/tactical/hash.ts` (module command list already done in Task 1).
- DuelCommand: `{ kind: 'sciencePower'; delta: number }`, `{ kind: 'hack'; room: number }`; codec strict schemas (ints).
- `scienceSlots.ts`: `sciencePowerRefusal(d, delta)` ('NO BAR' at 0 for −1; 'NO FREE BAR' when hackBars ≥ effective
  Sensors; 'MAX' at HACK_BAR_MAX) judged on the trimmed value; `applySciencePower` writes back hackBars then ±1;
  `clampSciencePower` writes back hackBars; `clampToCapacity` calls it. `hackRefusal(d, room)` → 'HACK OFFLINE' |
  'SELECT THE ENEMY' | 'OUT OF RANGE' | 'ALREADY DOWN' | null for the UI and the admission.
- step.ts: both in DUEL_KINDS; not in SHIP_KINDS. After the weaponPower loop: sciencePower in (player, sequence) order
  (stale-tick, Science attendant else invalid-seat, delta ±1 else malformed, refusal → unavailable); then hack in
  envelope order (stale-tick, seat, room −1..2 integer else malformed; −1: noop with no hack running else clear (no
  event); room: refusal → unavailable; same running room → noop; else hackRoom = room, hackTicks 0).
- Tests (`tests/hackCommands.test.ts`, via the duel step harness the Sci-1 command tests use): every refusal, noop and
  seat rule; last wins; a hack admitted on tick N lands at the end of N + 419 and the room is gated for 1800 ticks;
  sciencePower clamps when Engineering removes a Sensors bar; codec accepts both and rejects extra keys / non-ints;
  snapshot restore mid-hack and on the tick after landing equals an uninterrupted run; same seed and commands twice →
  equal hashes; a cancel emits no event.

## Task 5 — Client plumbing

Files: `render/duel/shipControls.ts` (ShipCommand widens to `sciencePower | hack`), `app/duel/input.ts` (ConsoleInput
gains optional `sciencePower(delta)` and `hack(room)` pushing onto the ship queue), `app/duel/onlineSource.ts`
(Counters gain the hacked-room rise; gapEvents emits the `hack done` view event from a 0 → >0 rise on the target),
plus anywhere `isConsoleCommand`-style lists need the new kinds so a seat change drops queued ones (runtime.ts).
- Tests: input queue carries both; gapEvents derives `done` from a snapshot pair; the net-4a predictor verifies with
  hack/sciencePower commands in its log (follow its existing command test).

## Task 6 — Science station block

Files: `render/duel/consoleModel.ts` (SciencePanel gains `scan`, `hack` pips, `rooms` [{label, state: 'idle'|'running'|
'down'|'dim', seconds}], `progress`, `status`), `render/duel/consoleLayout.ts` (STATION.h.science 96 → 176),
`ui/duel/ScienceStation.tsx`, `app/duel/flightPointer.ts` / `scene.ts` (Science block click exclusion, R1-7).
- Block rows: title + SENSOR RANGE; hover readout; SCAN pips (read-only) and HACK pips (left +1, right −1 →
  sciencePower); WEAP / SHLD / ENG buttons (click → hack room; the running room → hack −1), showing `ENG 23` while down;
  progress bar; status line (`HACK: NEED 2 BARS` / `HACK: SELECT THE ENEMY` / `HACK: OUT OF RANGE` /
  `HACKING SHLD 4 s` / `SHLD DOWN 27 s` / help); key help at the block's bottom.
- Tests: the panel model's status words for each state; a React render of the block (data-testid / data-ui attrs on
  pips and buttons, following WeaponsStation's tests); the click exclusion (`onScienceMap` or the scene's helper)
  refuses a point inside the Science block.

## Task 7 — Hacked looks

Files: `render/duel/contactModel.ts` + `ui/duel/ContactWindow.tsx`; `render/tactical/tacticalModel.ts` +
`tacticalLayer.ts`.
- ContactRoom gains `hacked: { seconds: number; arcs: number[] } | null` and `hacking: number | null` (progress 0..1), in
  both the "?" and the level 1–2 branches. Arcs: a deterministic zig-zag across the polygon's bounds re-seeded from
  `Math.floor(t * 12)` (render code may use any math). Window: dim blinking fill, the arc path in hot, label `HACK 23`;
  a running hack pulses the room's outline.
- ShipDraw gains `hacked: boolean`; drawShip adds a few crackling spark segments around the enemy (both chevron and
  silhouette paths) and a `HACKED` tag near it.
- Tests: contactModel returns hacked/hacking for both branches with the right seconds; ShipDraw.hacked follows state.

## Task 8 — Finish

1. Same-version `npm run bless`; run the duel oracle / canonical trace `check` against the Task 0 baseline to prove
   no-hack runs keep their behaviour (if the checker refuses because of the added fields, add a test capturing a no-hack
   run's telemetry and final bodies from the base commit instead — R1-13). Repin any fixture ticks / identity digests the
   new hashes move (as the slingshot and sensor-range merges did).
2. Full `npx vitest run` (the three known soak files may time out in parallel; rerun them alone), typecheck, lint if
   the repo has it.
3. `docs/gates.md` entry: "Science hacking spike (owner 2026-11-20, SIM 70)".
4. Visual check per the visual-check memory: build and screenshot the Science block and the enemy window with a room
   hacked (a test hook or a scripted state), look at both.
5. Fable code review of the branch diff; apply findings; re-test; commit.

## Fable plan review amendments (R1, all taken)

1. **Oracle proof**: `ADDITIONS[70]` in scripts/golden/duelOracle.ts declares the four new fields (frozen). The proof runs
   `npx tsx scripts/golden/duel-oracle.ts added` and `npx tsx scripts/golden/canonical-trace.ts same` from
   `.worktrees/hack-bump` (where the SIM 70 baseline was recorded; baselines are keyed by cwd) after
   `git merge --ff-only spike/hacking` there, after Task 4 and again in Task 8, before the same-version bless.
2. Pinned tests: tests/duelCheckpoint.test.ts (codec examples) and tests/tacticalDeterminism.test.ts (flatten key guard
   and length) join Task 1's list.
3. Typecheck is `npm run typecheck` (`tsc -b`); `-p .` checks nothing. No lint script.
4. ScienceStation sends both commands through `actions.console.ship?.(…)` (already forwarded in ui/actions.ts and queued);
   no new ConsoleInput methods.
5. Click exclusion: widen flightPointer's `stationBlock` to `'science'`, export a Science-block test helper, and AND
   `!(station === 'science' && inside the Science block)` into scene.ts's contact-click branch (~:296). Only the station
   block is excluded. Tests in tests/contactScene.test.ts / tests/flightPointer.test.ts.
6. Task 6 pins: tests/scienceSeat.test.ts:62 (STATION.h.science) and tests/scienceConsole.test.ts:77 (the panel shape).
7. Task 7: the enemy ShipDraw is skipped while `known[Enemy] === 0`; also mark the "?" contact mark as hacked (or the
   test sets known 1). `ShipDraw.hacked` is optional (tests/crtColours.test.ts builds a literal).
8. Task 2 / spec D10 correction: a non-crew pew is unpowered by a **hack** only (`hacked[Weapons] === 0`), not by damage
   level 2, so no-hack runs are unchanged (as committed in 5306937b).
9. Task 3 also: the contactScan admission reads `scannerBars`; `ShipInput.hacker` is optional (absent true).
10. Task 5: no predictor code change (commands are logged generically); a predictor test only. `Counters` gains a
    `hacked` triple and gapEvents a `hack done` view event; its consumer is the hack zap (audio/duelSounds, a reused
    SFX) and the fx flash, else the derivation is dropped.
11. Tests added: rematch reset and the end card's duel-decided for both commands (Task 4).
