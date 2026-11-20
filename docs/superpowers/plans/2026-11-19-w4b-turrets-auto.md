# W-4b: the reticle, the turrets, AUTO and MAN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Hound's two guns on slewing turrets that follow a mouse reticle, give each gun its own AUTO / MAN switch (R flips the selected weapon's, Shift+R sets both guns together, and each card's tag is its own switch; amendment §2), make AUTO aim with lead and fire within a small tolerance of its solution at a seen, hostile enemy ship in range, arc and line of sight (the pew on each charged third, the autocannon until 80 % heat; track but hold fire during the 30 s hold). Put a gun in the gunner's hands only when its own switch is MAN and it is the selected weapon, with +25 % traverse and about +20 % fire rate, while every other gun fights on AUTO (owner 2026-11-19). Give the crew a target room (the old laser lock, stepped by E / Q or a plain room click in the enemy window): a round fired by hand carries it and damages it (six autocannon hits or two pew pew hits a level), and an AUTO round wears only the hull (amendment §3). Draw the selected arc, the muzzle lines, the reticle and the AUTO bracket, predict the own seat's selected turret online, have the scripted Helm line the guns up, and move the scripted gunner onto AUTO guns, tuned by spec §12's ladder.

**Architecture:**

- **New hashed state.** `ShipSystems.pewTurret`, `gunTurret` (signed fine-step offsets from the nose) and the two mode flags `pewManual` and `gunManual` (Task 1 added one flag for both guns, `gunsManual`; Task 3 splits it, amendment §2.1) sit in the ship module's `SYSTEMS_TAIL` after `torpManual`, the flags in `FLAGS`, with per-class bounds in `validateTacticalValues`. Each round pool entry gains `room` (Task 8, amendment §3.3): its own hashed scalar after `flight`, so `ROUND_SLOT` is 8. Snapshots and clones follow from the modules, as W-3's fields did.
- **One slew law.** `slewTurret(turret, heading, aim, rate, arcSteps)` in the new `sim/tactical/turret.ts` (integers, `+ −` and the integer modulo) is the only turret arithmetic. The step calls it through `slewTurrets(state, i, input)` (also in `turret.ts`), which runs in `applyWeaponsInput` right after `stepBurst` and before `tickGun`, and returns which AUTO guns are on solution. The app's prediction calls the same `slewTurret`.
- **Hand control (owner 2026-11-19, spec §3.4, amendment §2.3).** One helper, `handControl(state, i, weaponSel, slot)` in `state.ts` (that gun's own flag, `pewManual` for slot 0 and `gunManual` for slot 1, and `weaponSel === slot`; W-4c adds "and no MANUAL flight"), says which gun is in the gunner's hands. The gun in hand follows the reticle at MAN traverse, fires on LMB and takes MAN's rates. Every other powered gun is AUTO-driven, a MAN one that is not selected too. The slew, `tickGun`, `tickPew` (through `tickWeapons`), the console's tag and the map's bracket all read it.
- **AUTO.** `autoSolution(state, i, 'pew' | 'gun')` (turret.ts) returns the lead aim's offset from the nose (W-1's `pewLead`, the new `gunLead` in `gun.ts` with the velocity relative to the Hound), or null when the enemy is unseen, out of range, behind the planet or a rock, has no intercept (or none inside the round's life, for the autocannon), or lies outside the arc. A gun is on solution when the slew leaves it within `AUTO_FIRE_TOLERANCE` (182 fine steps) of that offset (`onSolution`, owner 2026-11-19). `tickGun` gains an `auto` argument (on solution and hostile); the pew's AUTO round is fired at the end of `applyWeaponsInput`, where `firePew` runs today.
- **MAN.** `gunMode {slot, manual}` (one gun's switch, amendment §2.2) is admitted first in `WEAPON_ORDER` beside `laserMode` and `torpMode`. W-4a's seams gain a `manual` flag (the caller's hand control) and keep their bodies otherwise: `gunInterval(state, i, manual)` reads the MAN row, `pewGain(state, i, manual)` reads `PEW_MAN_GAIN_BY_BARS`, and `gunAimFine` / `pewAimFine` add the turrets. `pewFire {}` is refused `unavailable` while `pewManual` is false.
- **The target room (amendment §3).** It is `ShipSystems.lock`, hashed and bounded today. On the Hound `laserLock {room}` sets it: the step admits it on a turret class with no laser, and a lock-only branch in `applyWeaponsInput` writes it first in the tick. A round fired by hand is tagged `lock + 1` (`GunRound.room`); AUTO's rounds, the Hunter's and the Valkyrn's carry 0. `gunHit` wears a turret gun's tagged room (an untagged round wears none), and `pewHit` adds `PEW_ROOM_WEAR` to the same counter for a tagged round of the crew's turret pew. The Valkyrn's gun keeps the room under the round.
- **The wire.** `HeldInput.turretAim` (the reticle's world bearing, a fine aim, −1 none) rides every held schema, the authority's expiry and pause lists and `ShipInput.turretAim`.
- **The app.** `MapRequests.aimLaser` becomes `reticle` (the laser fit's MANUAL laser and the Hound's turrets share it). `KeyR` joins `PRESS_CODES` as `'weaponMode'`, and a press with Shift held is `'weaponModeAll'` (a Ctrl or Meta press counts nothing); KeyZ keeps `'laserMode'` and KeyV `'torpMode'`, which only the laser fit's Weapons seat reads (amendment §2.4). A pure `modeRequests` (in `app/duel/weaponsSeat.ts`) turns one frame's R, Shift+R and tag clicks into `gunMode` and `torpMode` commands in both runtimes. LMB fires a gun only while its own switch is MAN. E / Q and a plain room click in the enemy window send `laserLock` (amendment §3.6). A pure `predictTurret` (in `app/duel/weaponsSeat.ts`) is the online seat's selected-turret prediction, the throttle's analogue.
- **The scripted gunner** drops W-4a's stand-in pew and leaves the guns on AUTO. **The scripted Helm's line-up** (W-4a) moves to the autocannon's 600 u and ±30°.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2 (+ jsdom for UI tests), React + zustand (console), zod 3 (wire), Pixi.js (map), Electron/electron-vite, the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (converged at 96c8c2dd), as amended by `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md`, which wins wherever the two differ (next paragraph). W-4b is §19 item 2 and §19.1's W-4b rules: §3 (all), §4 (all), §6's AUTO refusal, §8's `turretAim`, `gunMode` and the tick order, §9's mouse reticle and mode key (R and Shift+R by the amendment, not Z), §10's tags (one switch a card by the amendment), the map's arc, muzzle lines, reticle and bracket, §11 (all), §12 (AUTO, no stand-in, the tuning ladder), §13.1, §13.4's Valkyrn identity change, §14's turret, AUTO, MAN, online and hash tests.

**Amendment (it wins):** `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` (converged at f7530409; cited below as "amendment §n"). Where it and the W-4 spec differ, the amendment wins. This plan carries all of it but its W-4c text: §2 (a mode per weapon: the two flags, `gunMode {slot, manual}`, hand control, R and Shift+R, the tags and hint rows, online), §3 (the target room: `laserLock` on the Hound, the round's `room`, the hit rules, what AUTO loses, the controls), §4, §5's tests and §6's build order.

**State at the hold (3b2a90c5):** Tasks 1 and 2 are executed and committed on the branch, as their text below reads. Their text is kept as it was executed: it names `gunsManual`, which Task 3 splits, and the task numbers inside it are the old plan's (old Tasks 3 to 11 are Tasks 4, 5, 6, 7, 9, 10, 11, 13 and 14 here; Tasks 3, 8 and 12 are the amendment's). The report's list that Task 1 started keeps its name, "Task 11 re-picks"; Task 14 works through it. The build resumes at Task 3.

**Builds on:** the W-4a plan `docs/superpowers/plans/2026-11-19-w4a-loadout.md`, fully executed on the same branch. Every W-4a name is consumed exactly as that plan defines it (Interfaces blocks below quote them). **Shared names:** the W-4 contract (controller scratchpad `w4-contract.md`); Decisions 1, 2, 4, 6, 11 and 17 to 22 add or move names, all inside this plan.

**Worktree:** the W-4a worktree `C:\Users\djuar\FTLite\.worktrees\w4` on branch `w4-weapons-controls`, with its four junctions (see W-4a's "Worktree setup (controller)"). The controller checks `npm run test:duel-app-runtime` passes there before Task 1. Every command runs from the worktree root.

## Global Constraints

- **Version (spec §13.3's version note, a33ad26e).** V is the SIM_VERSION on master when W-4 starts: **60 today** (the fire-venting merge 0dbe1be6), so the spec's "SIM 59" means V and its "SIM 60" means V + 1. SIM_VERSION stays **V** for all of W-4b: Task 14 re-blesses at V with a same-version `npm run bless` (a deliberate gameplay change; precedent 54d5825d, d8640a20), and W-4b makes no bump. The V → V + 1 bump is W-4c's last task. (The branch is cut from SIM 60 and master has since moved to 61, so the merge controller bumps to 62 at the merge; nothing in this plan changes for it.) Read V once with `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts` and write the number wherever this plan says V. Never pass `--fresh`. Never hand-edit goldens.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **Exact names and values (binding):**
  - **State:** `ShipSystems.pewTurret: number`, `gunTurret: number` (signed integers within ± their class's `arcSteps`, 0 without a turret), `pewManual: boolean` and `gunManual: boolean` (pew pew's and the autocannon's mode: false AUTO, true MAN; each true only on the crew slot of a class whose weapon in that slot has a turret; Task 3 splits Task 1's `gunsManual` into them, in its place in `SYSTEMS_TAIL`). All 0 / false at every round's start. `GunRound.room: number` (Task 8: 0 none, else the Room index + 1; 0 on a free entry), `roundRoom(tag: number): -1 | 0 | 1 | 2` (`state.ts`), `ROUND_SLOT = 8` and the hashed field `${pool}.${k}.room` after `${pool}.${k}.flight` (`hash.ts`).
  - **`sim/tactical/turret.ts`:** `turretOffset(heading, aim): number`, `slewTurret(turret, heading, aim, rate, arcSteps): number`, `turretWorldAim(heading, turret): number`, `onSolution(turret: number, sol: number | null): boolean`, `autoSolution(state, i, gun: 'pew' | 'gun'): number | null`, `interface AutoOnSolution { pew: boolean; gun: boolean }`, `slewTurrets(state, i, input): AutoOnSolution`.
  - **`sim/tactical/state.ts`:** `handControl(state: TacticalState, i: number, weaponSel: number, slot: number): boolean` (Task 4).
  - **`sim/tactical/tuning.ts`:** `AUTO_FIRE_TOLERANCE = 182` (Task 5); `AUTOCANNON_ARC_COS = 0.8660254037844386` (cos 30°, Task 7); `PEW_ROOM_WEAR = 3` (Task 8).
  - **`sim/tactical/gun.ts`:** `gunLead(state, i, tx, ty, tvx, tvy): number`; `gunInterval(state, i, manual = false)`; `tickGun(state, i, input, auto = false)`; `placeRound(state, r: Omit<GunRound, 'active' | 'room'> & { room?: number }, pool?)` (Task 8, Decision 19).
  - **`sim/tactical/pew.ts`:** `pewGain(state, i, manual = false)`, `tickPew(state, i, manual = false)` (Task 4); `pewAutoReady(state, i)` (Task 7); `firePew(state, i, aim, room = 0)`, `firePewTrigger(state, i, room = 0)` (Task 8).
  - **Command:** `{ kind: 'gunMode'; slot: 0 | 1; manual: boolean }` (slot 0 pew pew, 1 the autocannon; Decision 17); `laserLock {room}` is unchanged on the wire, and on the Hound it is the target room's command (Task 8). **Event:** `pewHit` gains `room: number` (−1 for none or a shield hit) and `level: boolean` (Task 8). `WEAPON_ORDER = ['laserMode', 'torpMode', 'gunMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']`.
  - **Held input:** `HeldInput.turretAim?: number` (−1..65535; absent or −1 none). **Ship input:** `ShipInput.turretAim: number` (−1 in `IDLE_INPUT`, `UNCREWED_INPUT`, hunter.ts's literal and an unattended Weapons). `step.ts` `heldTurretAim(h): number`.
  - **Tuning (Task 13, the ladder's knobs, base values):** `HOUND_HELM_LINEUP = true` (`scripted.ts`; rung 0's reference row turns it off), `AUTOCANNON_HITS_PER_HULL = 12` (`tuning.ts`; `AUTOCANNON.hitsPerHull` reads it, `GUN` keeps `GUN_HITS_PER_HULL`), `HOUND_MISSILE_GAP = 1500` and `HOUND_GUNNER_AUTOCANNON_BARS: 1 | 2 = 1` (`scripted.ts`; `houndGunner` reads them, the Valkyrn's `gunner` keeps `MISSILE_GAP`).
  - **App:** `MapRequests.reticle(aim)`, `reticleAim(): number | null`, `resetReticle()` (renamed from `aimLaser`, `laserAim`, `resetLaserAim`); `DuelRuntimeDeps.reticleAim?()` (renamed from `laserAim?`); `KeyAction 'weaponMode'` (KeyR, new) and `'weaponModeAll'` (Shift+KeyR: no code of its own in `PRESS_CODES`); `'laserMode'` stays KeyZ's and `'torpMode'` KeyV's; `KeyEventLike.ctrlKey?`, `metaKey?`; `ConsoleInput.mode?(slot: 0 | 1 | 2)` and `KeySample.modeTaps?: number[]` (a tag's click, Decision 18); `modeRequests(base, sel, presses, taps): { modes; changed }` (`weaponsSeat.ts`); `weaponsSeatHeld(sel, trigger, aim = -1)`; `sessionHeld(k, d, me, steer, weapons?: { sel: number; trigger: boolean; aim?: number })`; `predictTurret(t, slot, held, manual, k): number`; `DuelViewSource.turret?(slot: 0 | 1): number`; the online source's `turret(slot)` and `gunModeBase(slot: 0 | 1, manual: boolean | null)`; in `onlineDuel.ts`, `gunModeSent: [ModeSent | null, ModeSent | null]` (one per gun slot) and `lockSent: { room: number; sequence: number; round: number } | null`; `ContactSync.turret?: boolean` (`contactController.ts`).
  - **View:** `CombatModelInput.turrets?`, `weaponSel?`, `reticle?`; `CombatDraw.turretArc`, `muzzles`, `reticle`, `bracket`; `WeaponsPanel.pewManual?`, `gunManual?`, `gunsHand?`, `gunsHold?`; Buttons `gun-mode-pew`, `gun-mode-autocannon` (each its own switch); `ContactView.roomClick?: boolean` (`contactModel.ts`); the hint row texts `R AUTO/MAN · Q/E ROOM: <NAME>` and `Q/E ROOM: <NAME> · RMB TORPEDO: CLEAR`, with `<NAME>` one of `WEAPONS`, `SHIELDS`, `ENGINES`.
- **The fences (spec §13.4).** The Valkyrn and its laser fit have no turret: `slewTurrets` returns at once on them, `gunMode` is `unavailable` for either slot, their turret fields and mode flags stay 0 / false, and `tickGun`'s `turret === null` branch is today's code. Their rounds carry `room` 0, `laserLock` is unchanged on both (unavailable on the Valkyrn, the laser's lock on the laser fit), and the Valkyrn's `gunHit` keeps the room under the round (amendment §3.4). `tests/valkyrnIdentity.test.ts`'s five digests do not change: Task 1 rebuilds its hashed array without the new fields, by name; Task 3 renames the flag in that pattern and Task 8 adds the two pools' `room` fields to it. `tests/valkyrnRoundsRocks.test.ts`, `tests/w4HunterIdentity.test.ts`, `tests/pewHunter.test.ts` and `tests/torpedoGuidance.test.ts` pass unchanged at the end of every task.
- **The fallout rule (binding on every task; as W-4a's).** Classify each failing test exactly once: a rule W-4b replaces (kind (a): rewrite, citing "W-4 spec §n"); a whole-run number (kind (b): re-pick in Task 14 with `// W-4b (SIM V): was <old>`); a band (kind (c): stays as it is). Never edit a band's limits, never skip a kind (a) or (b) test, never delete a test except a kind (a) test whose rule no class keeps (name it in the commit).
- **Known-red window:** these fail by design, and only these:
  - from Task 1 (new hashed fields; Task 3 changes a field name and adds one value per ship, and Task 8 adds one value per round pool entry, so the flatten length and every duel hash move again at each) until Task 14: `tests/golden.test.ts`, `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts`, and any test that pins a duel hash or flatten length (`tests/duelCheckpoint.test.ts`, `tests/duelSnapshot.test.ts`: list each in the report's "Task 11 re-picks");
  - from Task 5 (turrets move rounds) until Task 14: the trajectory pins (`tests/duelModules.test.ts`'s `played(…)`, `tests/tacticalSlots.test.ts`, `tests/duelScripted.test.ts`'s whole-run values);
  - from Task 7 (AUTO fires; Task 8 then takes AUTO's room damage away, amendment §3.5, which moves whole runs once more) until Task 13: `tests/duelGates.test.ts`'s per-seed tests, only if a seed fails; Task 13's ladder must end with them green.
  Every other test passes at the end of each task. Each task runs its own targeted tests; the full suite runs in Tasks 1, 7, 8 and 14.
- **Sim rules:** only `+ − × ÷` and `sqrt` in `src/renderer/src/sim/**` (`tests/helpers/determinismGuard.ts`: `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt` only; no trig, no `**`, no `Math.hypot`). No sim file imports from `app/`, `render/`, `input/` or `ui/`. No new randomness. The turret arithmetic is integer.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`; `npm run test:duel-app-runtime`; `npm run test:determinism`. Never two vitest processes at once. A full-suite timeout under load is re-run alone before it counts (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`).
- **Determinism logs:** after every `npm run test:determinism`, `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging.
- **Line endings:** working copies are CRLF (`core.autocrlf=true`). Change existing files with the Edit tool; never hand-convert endings. New files may be LF.
- **Worktrees:** never delete a `node_modules` junction (including `services/signalling/node_modules`); a missing one is recreated, never "cleaned".
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` as its last `-m`. After writing any file, check it is not all null bytes (`head -c 64 <file> | od -c | head -1`); commit at the end of every task. **Match every edit by the quoted text**, not a line number: master's code was read at `b4d5dba4`, and W-4a's code is quoted from its plan. The amendment's tasks (3, 8 and 12) and every step the amendment changed quote the branch at `3b2a90c5`, or the text an earlier task of this plan writes. Every "unchanged" diff uses W-4a's fixed `W4_BASE` (in `docs/superpowers/research/2026-11-19-w4-report.md`), never `master`.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "W-4 spec §n" on changed lines that need a reason, and "W-4 amendment §n" where the amendment is the reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **`turret.ts` holds the slew law and AUTO; `pew.ts` and `gun.ts` do not import it.** `turret.ts` imports `pewLead` / `pewMuzzle` (pew.ts) and `gunLead` (gun.ts), so the reverse import would be a cycle. `pewAimFine` and `gunAimFine` therefore write `turretWorldAim`'s formula inline (`(heading × HEADING_COUNT + turret + AIM_STEPS) % AIM_STEPS`), and Task 5's test pins them equal to `turretWorldAim`. `turretOffset` is `clampAim`'s signed difference (pew.ts L55) without the clamp.
2. **`slewTurrets` returns the AUTO on-solution flags** (`{ pew, gun }`), and `applyWeaponsInput` passes them on: `tickGun(state, i, input, auto.gun && enemyHostile(state))` and, last, the AUTO pew round. So the hold rule (§4.3: track, no fire while `hostileAt` is −1) lives in `weapons.ts`, beside the slew, and `gun.ts` needs no science import. The gun in hand never sets a flag; an AUTO-driven gun does, in MAN too (Decision 14).
3. **The range test is centre to centre, the line of sight muzzle to centre.** §4.2 says "its centre is within the gun's AUTO range" and "the line from the muzzle to it is clear": the range is the own ship's centre to the enemy's centre (squared, so no sqrt); the sight line runs from the gun's muzzle point (`pewMuzzle`; for the autocannon the nose point between its muzzles, `muzzleForward` along the heading) to the enemy's centre, through `geometry.ts lineOfSight` (planet and rocks).
4. **The AUTO pew never bursts (spec §4.3).** The pew starts every round full (`state.ts` L230) and stays full through the hold, so the literal `pewReady` rule would open every round with three rounds on three ticks: a burst, which §4.3 rules out ("it fires each time a third has charged, and it never bursts"). The AUTO pew therefore fires only when it is on solution, hostile, and `pewAutoReady(state, i)` holds (new in `pew.ts`). That means `pewReady`, and either a full charge or a third completed by the last `tickPew`:
   - `s.pewCharge >= pewFull(def)`, or
   - `s.pewCharge % pewThird(def) < pewGain(state, i)`.

   From full it fires one round, which leaves exactly two thirds. The next round comes when the charge is full again: one round each time a third has charged, every `PEW_TICKS_BY_BARS` ticks. AUTO's gains (6 / 8 / 12 / 15) divide the third (360) exactly, so the test is integer and exact. A charge drained by MAN shots fires again at each third it completes. The rule is stateless: no new hashed field.
5. **The view draws the turret about the interpolated heading.** §10 says "`aimDir` of the interpolated turret". The turret is fixed to the hull, so the muzzle line is drawn at the interpolated nose angle plus the turret's current offset (`turret / AIM_STEPS` of a turn). The sim ticks at 60 Hz (`TICK_HZ`), so the offset needs no interpolation of its own; online, the own seat's selected turret is the predicted one (Task 9).
6. **`predictTurret` is a pure app helper,** `predictTurret(t, slot, held, manual, k)` in `app/duel/weaponsSeat.ts`, beside W-4a's seat rules. The online source's `turret(slot)` calls it with its `sentHeld`, that gun's own mode in flight (`gunModeBase(slot, …)`, the throttle's `throttleBase` pattern; amendment §2.6) and `unackedFrames`; Single player's `turret(slot)` returns the sim's value. This makes spec §11's agreement test a unit test against the stepped sim.
7. **LMB on an AUTO gun does nothing.** Both runtimes send `pewFire` only while pew pew's own switch is MAN and put `gunHeld` in the held frame only while the autocannon's is (`weaponsSeatHeld(sel, trigger && gunManual, aim)`), and the autocannon's dead-trigger refusal is shown only then, so an AUTO gun gets no command and no refusal (§4.3). The mode the runtimes judge each gun by is the latest queued / in-flight `gunMode` for that slot, else the sim's flag (amendment §2.4), so two quick presses of R flip twice.
8. **R is `KeyAction 'weaponMode'`, Shift+R `'weaponModeAll'`; Z and V keep their names (amendment §2.4).** The old plan renamed KeyZ's action to `'weaponMode'`; that rename is dropped. `PRESS_CODES` gains `KeyR: 'weaponMode'`. The key handler counts `'weaponModeAll'` instead when Shift is held, and neither when Ctrl or Meta is (so Ctrl+R stays the browser's; KeyR needs no entry of its own in `GUARDED_CODES`, which already takes every `PRESS_CODES` key and skips modified ones). At the Hound's Weapons seat the runtimes read `weaponMode`, `weaponModeAll` and the tags' taps (Decision 18), and read neither `laserMode` (Z) nor `torpMode` (V): W-4a's read of `p.torpMode` in the Hound's branch goes, in both runtimes. The laser class's branch keeps `p.laserMode` and `p.torpMode` as they are, and reads none of the new ones, so R does nothing there. The BEAM card's tag still presses `'laserMode'` and the laser block's TORPEDO tag `'torpMode'`.
9. **The tags (amendment §2.5).** Each card's tag is its own switch: a click on a gun's tag flips that gun's mode and a click on the Hound block's TORPEDO tag flips the torpedo's (Decision 18 says how the click travels). A tag's light is its gun's own switch (`WeaponsPanel.pewManual`, `gunManual`): lit when it is set to MAN. Its word is what the gun does now (Decision 14): `MAN` on the gun in hand (`WeaponsPanel.gunsHand`, the slot in hand or −1), else `HOLD` while the hold keeps AUTO quiet (`!enemyHostile(t)`), else `AUTO`. So a MAN gun that is not selected reads `AUTO` (or `HOLD`), lit, which tells the gunner it will come to hand when selected; with both on MAN and pew pew selected they read MAN and AUTO, both lit; and with the torpedo selected both read AUTO (or HOLD). With no enemy ship the hold never ends, so `HOLD` stays; no duel has no enemy.
10. **The bracket** is drawn on the enemy's drawn marker when an AUTO-driven powered gun (not in hand, Decision 14) is on solution. It is `hot` once hostile and `dim` in the hold. The view's test is the sim's own one tick ahead: `onSolution(slewTurret(turret, heading, turretWorldAim(heading, sol), traverse[0], arcSteps), sol)` from the replica's turret and heading. So a target whose lead drifts a step between ticks keeps the bracket, where "the turret equals the solution now" would blink every time the lead moved (review finding 11). The view reads the replica's turrets for this, never the prediction.
11. **The ladder's knobs are Hound-only constants (Task 13).** `MISSILE_GAP` is also the Valkyrn pair's (`gunner` on the Valkyrn class, pinned by `tests/valkyrnIdentity.test.ts`), and `AUTOCANNON` copies `GUN`'s hit numbers. So Task 13 first adds `HOUND_HELM_LINEUP`, `AUTOCANNON_HITS_PER_HULL`, `HOUND_MISSILE_GAP` and `HOUND_GUNNER_AUTOCANNON_BARS` at their base values (a no-op), then moves only those. Rung 4's 0 / 2 / 1 is the gunner sending `weaponPower {Pew, −1}` then `{Autocannon, +1}` twice after the `shipPower`, each pre-checked as §12 requires.
12. **The smokes: R before the quiet check, and the torpedo's launch path (Task 6; amendment §6).** W-4a's step 5 asserts that Space fires nothing for 2 s. From Task 7 an AUTO gun may fire on its own once hostile, so the step first presses R: pew pew is the selected weapon at a sit, so that one press puts it on MAN and in hand, where it fires only on the left button. The autocannon holds no bar until after the check (the round starts 1 / 0 / 1), so it cannot fire in it. The smoke's key request carries no modifier, so it cannot send Shift+R, and it needs none. With V retired at the Hound's seat, both smokes launch their MANUAL torpedo by selecting it (3), pressing R (the torpedo's `torpMode`), then F. Both changes land in Task 6, the task that binds R.
13. **The scripted gunner sends no `gunMode`, no `laserLock` and no held aim** (§12, amendment §3.5). Its guns stay on AUTO, so its rounds are untagged and from Task 8 the bots take rooms only with the torpedo. Its `houndGunner` keeps W-4a's bar move and torpedo rule and loses the stand-in pew; its AUTO guns open the tick after its torpedo launch ends the hold, or at the 30 s clock.
14. **Hand control (owner 2026-11-19, spec §3.4, §17 item 19; amendment §2.3).** A gun is the gunner's only when its own switch is MAN and it is the selected weapon: `handControl(state, i, weaponSel, slot)` is that gun's flag (`pewManual` for slot 0, `gunManual` for slot 1, false for any other slot) `&& weaponSel === slot` (`state.ts`, so `gun.ts`, `pew.ts`, `turret.ts`, `weapons.ts` and the view share it without a cycle). It reads the held `weaponSel` through `ShipInput`, so it is not hashed state. The gun in hand slews to the reticle at MAN traverse (holding with no reticle), fires on the trigger (`gunHeld`, `pewFire`) and takes MAN's rates (`gunInterval(…, true)`, `pewGain(…, true)`). Every other powered gun is AUTO-driven with AUTO's numbers and rules: a MAN gun that is not selected, and both with the torpedo or nothing selected. So a gun's switch matters only while that gun is selected, and with pew pew on MAN, the autocannon on AUTO and the autocannon selected, the left button does nothing (the amendment's table, §2.3). `pewFire`'s admission stays on the mode, now pew pew's own (`pewManual`, spec §6, amendment §2.3): a held `weaponSel` can trail the command by a frame online, and the app sends `pewFire` only with pew pew selected and on MAN. W-4c adds "no MANUAL flight" to the helper's condition, so the whole sim changes in one place.
15. **The AUTO fire tolerance (owner 2026-11-19, spec §4.2, §17 item 20).** `onSolution(turret, sol)` is `sol !== null && |turret − sol| ≤ AUTO_FIRE_TOLERANCE` (182). The round still flies along the real turret. 182 + the lead's 128 half step is 17.8 u at 600 u, inside the Hunter's 20 u radius. 182 is also the autocannon's per-tick lag in a 150°/s turn (455 − 273), which with the pew's 91 keeps a trailing gun on solution for a tick or two after it meets the target. A model scan (4096 starts, two turns each) found no pass without an on-solution tick at 128 or more, and 531 under the exact rule.
16. **The scripted Helm's line-up moves to the autocannon (spec §12, Task 7).** W-4a's ±60° / `PEW_RANGE` stand-in becomes ±30° (`AUTOCANNON_ARC_COS`) within `AUTOCANNON_AUTO_RANGE`. A target inside ±30° is inside both arcs, so both AUTO guns can bear, and the Helm goes back to its orbit. Task 13 rung 0 records what it is worth (`HOUND_HELM_LINEUP`).

**Choices the amendment leaves to the plan (Decisions 17 to 25):**

17. **`gunMode`'s shape on the wire.** The type is `{ kind: 'gunMode'; slot: 0 | 1; manual: boolean }`. The codec admits any integer slot (`z.number().int()`, as `weaponPower`'s), and the sim answers a slot other than 0 or 1 `malformed`, so the amendment's `malformed` step is reachable from the wire. The admission order is the amendment's (§2.2), which differs from the old plan's: `malformed` (the slot, then the boolean) comes before `unavailable` (no turret in that slot). `authority/duelRules.ts` names no command kind (it steps through `duelCodec`), so it needs no edit; the codec and `net/contracts.ts` carry the shape.
18. **How a tag's click travels: `ConsoleInput.mode?(slot)` and `KeySample.modeTaps`.** Today the TORPEDO tag presses `'torpMode'`, the same press edge KeyV makes, and the Hound's seat no longer reads that edge (Decision 8). So the Hound block's three tags call a new optional `ConsoleInput.mode?(slot: 0 | 1 | 2)`, and the keyboard counts the clicks per weapon in `KeySample.modeTaps` (`[pew pew, autocannon, torpedo]`, cleared as `selectTo` is). One pure helper, `modeRequests(base, sel, presses, taps)` in `app/duel/weaponsSeat.ts`, turns a frame's Shift+R presses (each: both guns to AUTO if either is on MAN, else both to MAN; the torpedo untouched), R presses (each flips the selected weapon) and tag taps (each flips its own weapon) into the modes after the frame and which weapons changed. Both runtimes send one `gunMode` or `torpMode` per changed weapon. The laser block's tags keep their press edges.
19. **`placeRound`'s `room` is optional (a stated deviation from amendment §3.3).** The amendment has `placeRound`'s argument type (`Omit<GunRound, 'active'>`) force every caller to pass `room`. About thirty test callers place rounds by hand, `tests/valkyrnRoundsRocks.test.ts` among them, and that file is a fence this plan and the W-4 spec keep byte for byte (Task 14's `git diff --stat W4_BASE` check); `npx tsc -b` type-checks `tests/`. So the argument is `Omit<GunRound, 'active' | 'room'> & { room?: number }` and `placeRound` writes `room: r.room ?? 0`. The amendment's reason holds: `room` joins the copied list, so a recycled entry never keeps its old tag, and the sim's own callers (`fireRound`, `firePew`) pass it explicitly.
20. **Where a round gets its tag.** `tickGun` passes `hand ? s.lock + 1 : 0` to `fireRound` (so only the autocannon in hand tags). `applyWeaponsInput` passes `s.lock + 1` to `firePewTrigger` for an admitted `pewFire` on a crew pew with a turret, in hand or not (amendment §3.3, judgement call 7), and nothing for AUTO's round or the Hunter's `firePew`. The lock-only write runs first in `applyWeaponsInput`, so a same-tick `laserLock` tags the new room.
21. **The tag's reader, and what pew pew's room wear needs.** `roundRoom(tag)` in `state.ts` gives the Room a tag names, or −1. `gunHit` takes the round's tag: a gun with a turret wears `roundRoom(tag)` (none at −1) and the Valkyrn's keeps `gunRoomOf`. `pewHit` adds `PEW_ROOM_WEAR` only when the owner is the crew slot, its pew has a turret, its class has a gun (whose `hitsPerLevel` is the threshold) and the round is tagged. `tests/w4Rooms.test.ts` reads the hull numbers from `AUTOCANNON.hitsPerHull`, so the ladder's rung 1 (Task 13) cannot break it.
22. **The plain room click.** `contactModel` sets `ContactView.roomClick` at the Weapons station of a turret class. The window's `boxDown`, with nothing picked up, then calls `actions.console.lock(room)`: the console's existing lock path, which the keyboard hands the runtimes as `KeySample.lockTo`. At the Hound's seat both runtimes send `laserLock` for a `lockTo` of 0..2 and drop −1 (the target room has no "none"; the Hound's block has no card that asks for it). With a weapon picked up the click is `contact.pick`, as now.
23. **The refusal for a room that cannot be chosen.** E, Q and the click on an unseen enemy raise `NO CONTACT` through the existing `'laser'` control (`lockRefusal`), and the Hound block's reason row names it `ROOM` (`ROOM: NO CONTACT`), where the laser block says `BEAM`.
24. **The controls list.** R and Shift+R get their rows from the tables (Shift+R's keys are written from `weaponMode`'s code). The amendment says the Hound's Z and V rows go; the list has one Single player section for the Hound and the laser fit, so the two rows stay and now begin "With the laser fit at Weapons," as the Space row does. No row says Z or V does anything on the Hound.
25. **Which task lands which kind (a) rewrite (amendment §5).** `tests/w4PewFire.test.ts`'s laser-command case and `tests/w4Autocannon.test.ts`'s six-hits case change in Task 8, with their rules. `tests/w4Runtime.test.ts`'s E / Q case changes in Task 12: until then the runtime still steps `torpLock`. `pewHit`'s two new members are required, as `gunHit`'s are, so Task 8 also adds `room: -1, level: false` to the `pewHit` literals that `tsc` or an exact match would fail on: `app/duel/onlineSource.ts`'s (the amendment's own change, moved here from the app task so every task ends with `tsc` clean) and four test files'.

## Seam for W-4c

W-4c (`docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`) adds the MANUAL-torpedo flight gates on top of these exact shapes. W-4c's plan anchors on them as written here:
- **The online prediction:** the online source's `turret(slot: 0 | 1)` returns `predictTurret(d.tactical, slot, sentHeld, gunModeShown[slot] ?? (slot === 0 ? sys.pewManual : sys.gunManual), unackedFrames)` at the Hound's Weapons seat, with `sys = d.tactical.systems[0]` (Task 9: that gun's own mode, amendment §2.6). W-4c's flight gate is the `k` argument at that call: `manualTorpedoFlying(d.tactical) ? 0 : unackedFrames`.
- **Hand control:** `handControl(state, i, weaponSel, slot)` in `state.ts` (Task 4) is two lines: `const s = state.systems[i]!, manual = slot === 0 ? s.pewManual : slot === 1 && s.gunManual;` then `return manual && weaponSel === slot;`. The slew (`slewTurrets`' per-gun branch `if (handControl(state, i, input.weaponSel, slot)) { … } else { … AUTO … }`, Task 5), `tickGun` (Task 4, Task 7), `tickPew` through `tickWeapons` (Task 4), the console's `gunsHand` (Task 11) and the map's bracket (Task 10) all read it. W-4c's flight rule (spec §3.4, §7: during a MANUAL flight no gun is in hand, so both are AUTO-driven) is one added condition on the `return` line, `&& missileOf(state, i)?.manual !== true` (`missileOf` is in `state.ts` itself, so no import and no cycle; `manualTorpedoFlying` lives in `manualTorpedo.ts`, which `turret.ts` cannot import). It replaces the old seam, a `manualTorpedoFlying` guard in the MAN slew.
- **The `pewFire` AUTO refusal:** in `step.ts`'s `pewFire` block (Task 7), `if (!sys0.pewManual) { result(e, 'unavailable'); continue; }` (pew pew's own switch), just before the noop. W-4c's `missile-in-flight` refusal goes right after it.
- **The crew literal:** `turretAim: gunner >= 0 ? heldTurretAim(gunnerHeld) : -1` (Task 2).
- **The online held frame:** after Task 6, `pump` builds it as `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent[1] ? gunModeSent[1].manual : d.tactical.systems[0].gunManual), aim: reticleNow() ?? -1 })` (the trigger is the autocannon's, so it reads slot 1's mode).
- **The modes at the Hound's seat (Task 6):** both runtimes' Hound branches end their mode block with `const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];` (`mode` is `modeRequests(…)`'s result), and gate the pew click on `pewManual` and the dead-trigger refusal on `gunManual`. Single player's `frame` merges `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(1), deps.reticleAim?.() ?? -1)`.
- **The keys:** R is the `weaponMode` press and Shift+R `weaponModeAll`; Z (`laserMode`) and V (`torpMode`) do nothing at the Hound's Weapons seat. So a test or a smoke sets a gun to MAN with the gun selected and R (or the sim's flag, or a `gunMode {slot, manual}` command), and launches a MANUAL torpedo with the torpedo selected, R, then F.
- **The target room (Tasks 8 and 12):** E / Q at the Hound's seat send `laserLock` and never `torpLock`; the contact controller no longer takes them there. Nothing in W-4c reads the round's `room`.

---

### Task 1: The turret state, its hash and bounds, the slew law, and the Valkyrn digest without the new fields

**Status: DONE on the branch (2e5a9190, dc64136d). Do not re-run.**

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts` (`ShipSystems`, `systemsFor`, `emptySystems`), `src/renderer/src/sim/tactical/hash.ts` (`SYSTEMS_TAIL`, `FLAGS`, `systemsRules`, `turretRule`, `validateTacticalValues`)
- Create: `src/renderer/src/sim/tactical/turret.ts`
- Create: `tests/w4Turret.test.ts`
- Modify: `tests/valkyrnIdentity.test.ts`

**Interfaces:**
- Consumes: `hasTurret(cls)`, `PEW_TURRET`, `AUTOCANNON_TURRET` (W-4a Task 3, `defs.ts`); `AIM_STEPS`, `HEADING_COUNT` (`tuning.ts`); `validateTacticalValues(shape, values, offset = 0)` (`hash.ts`; note the argument order), `flattenTactical`, `unflattenTactical`, `TACTICAL_MODULES`.
- Produces: `ShipSystems.pewTurret | gunTurret | gunsManual`; `turretOffset`, `slewTurret`, `turretWorldAim` (turret.ts; Task 4 adds `autoSolution` and `slewTurrets` there).

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §3.1, §3.2, §13.1: the turret state (two signed offsets and one mode flag, 0 / false at the start, bounded by
// the slot's own class), and the slew law: toward the wanted offset (clampAim's signed difference, clamped to the arc) by
// at most the rate, never past it; integers in and out; the wrap across 0 / 65535.
import { describe, expect, it } from 'vitest';
import { slewTurret, turretOffset, turretWorldAim } from '../src/renderer/src/sim/tactical/turret';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { AUTOCANNON_ARC_STEPS, PEW_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';

const PEW = PEW_ARC_STEPS, GUN = AUTOCANNON_ARC_STEPS;   // 10922, 5461

describe('the slew law (W-4 spec §3.2)', () => {
  it('turretOffset is the signed fine difference from the nose, wrapping', () => {
    expect([turretOffset(0, 1000), turretOffset(0, 65000), turretOffset(255, 100), turretOffset(64, 64 * 256)]).toEqual([1000, -536, 356, 0]);
  });
  it('moves toward the wanted offset by at most the rate, and stops on it', () => {
    expect(slewTurret(0, 0, 1000, 364, PEW)).toBe(364);
    expect(slewTurret(728, 0, 1000, 364, PEW)).toBe(1000);
    expect(slewTurret(1000, 0, 1000, 364, PEW)).toBe(1000);
    expect(slewTurret(0, 0, 65000, 364, PEW)).toBe(-364);
    expect(slewTurret(-400, 0, 65000, 364, PEW)).toBe(-536);
  });
  it('clamps the wanted offset to the arc, both ways', () => {
    let t = 0;
    for (let k = 0; k < 60; k++) t = slewTurret(t, 0, 20000, 455, PEW);
    expect(t).toBe(PEW);
    for (let k = 0; k < 60; k++) t = slewTurret(t, 0, 65536 - 20000, 341, GUN);
    expect(t).toBe(-GUN);
  });
  it('a turning ship carries the turret: the same offset is a new world aim', () => {
    expect(turretWorldAim(0, 1000)).toBe(1000);
    expect(turretWorldAim(10, 1000)).toBe(10 * 256 + 1000);
    expect(turretWorldAim(0, -364)).toBe(65536 - 364);
    expect(turretWorldAim(255, 400)).toBe((255 * 256 + 400) % 65536);
  });
  it('integers in, an integer out, for every heading and a sweep of aims', () => {
    for (let h = 0; h < 256; h += 17) for (let a = 0; a < 65536; a += 4099) for (const t of [-PEW, -1, 0, 7, PEW]) {
      const v = slewTurret(t, h, a, 455, PEW);
      expect(Number.isInteger(v) && Math.abs(v) <= PEW && Math.abs(v - t) <= 455).toBe(true);
    }
  });
});

describe('the turret state (W-4 spec §3.1, §13.1)', () => {
  it('starts 0 / false on every slot and class', () => {
    for (const cls of [ShipClass.Cutter, ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) for (const s of createTacticalState(5, 2, cls).systems)
      expect([s.pewTurret, s.gunTurret, s.gunsManual]).toEqual([0, 0, false]);
  });
  it('round-trips mid-slew through flatten and unflatten', () => {
    const st = createTacticalState(5), s = st.systems[0]!;
    Object.assign(s, { pewTurret: -2911, gunTurret: 4000, gunsManual: true });
    const back = createTacticalState(5);
    unflattenTactical(back, flattenTactical(st));
    expect([back.systems[0]!.pewTurret, back.systems[0]!.gunTurret, back.systems[0]!.gunsManual]).toEqual([-2911, 4000, true]);
    expect(() => validateTacticalValues(st, flattenTactical(st))).not.toThrow();
  });
  it('bounds each turret by its slot\'s class: the Hound\'s ±arc, 0 elsewhere; gunsManual only on the crew slot of a turret class', () => {
    const bad = (cls: number, f: (st: ReturnType<typeof createTacticalState>) => void): string => {
      const st = createTacticalState(5, 2, cls); f(st);
      try { validateTacticalValues(st, flattenTactical(st)); return 'ok'; } catch (e) { return String((e as Error).message); }
    };
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewTurret = PEW; st.systems[0]!.gunTurret = -GUN; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewTurret = PEW + 1; })).toMatch(/pewTurret/);
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunTurret = GUN + 1; })).toMatch(/gunTurret/);
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.pewTurret = 1; })).toMatch(/pewTurret/);   // the Hunter: no turret
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunTurret = 1; })).toMatch(/gunTurret/);   // the Valkyrn's gun: no turret
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunsManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.gunsManual = true; })).toMatch(/gunsManual/);
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunsManual = true; })).toMatch(/gunsManual/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Turret.test.ts`
Expected: FAIL (`turret.ts` does not exist).

- [ ] **Step 3: The slew law**

Create `src/renderer/src/sim/tactical/turret.ts`:

```ts
// W-4 spec §3 (W-4b): the Hound's turrets. One pure slew law, shared by the step and the app's prediction (§11): a turret
// is an offset from the nose in fine heading steps (AIM_STEPS to the turn), fixed to the hull, moving toward the wanted
// offset (clampAim's signed difference, pew.ts L55, clamped to the arc) by at most its traverse a tick. Integers in, an
// integer out; only + − and the integer modulo. Task 4 adds AUTO's solutions and the per-tick slew of both guns.
import { AIM_STEPS, HEADING_COUNT } from './tuning';

/** The signed fine-step difference of fine aim `aim` from heading index `heading`'s nose, in (−AIM_STEPS/2, AIM_STEPS/2]:
 *  ((aim − heading·256 + 1.5·AIM_STEPS) mod AIM_STEPS) − AIM_STEPS/2. `aim` may be any integer (it wraps). */
export function turretOffset(heading: number, aim: number): number {
  return ((((aim - heading * HEADING_COUNT + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS) - AIM_STEPS / 2;
}
/** One tick of a turret at offset `turret` on a ship at heading index `heading` toward fine aim `aim`: the wanted offset is
 *  turretOffset clamped to ±arcSteps, and the turret moves toward it by at most `rate` (never past it). */
export function slewTurret(turret: number, heading: number, aim: number, rate: number, arcSteps: number): number {
  const raw = turretOffset(heading, aim), want = raw > arcSteps ? arcSteps : raw < -arcSteps ? -arcSteps : raw, step = want - turret;
  return turret + (step > rate ? rate : step < -rate ? -rate : step);
}
/** A turret's world aim: the fine aim (0..AIM_STEPS − 1) of offset `turret` on the nose of heading index `heading`. */
export function turretWorldAim(heading: number, turret: number): number {
  return (((heading * HEADING_COUNT + turret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
}
```

(The double modulo keeps a negative intermediate in range: `heading × 256 + turret` is negative only for heading 0 and a negative turret.)

- [ ] **Step 4: The state**

In `src/renderer/src/sim/tactical/state.ts`, in `ShipSystems`, after `torpManual: boolean;` add:

```ts
  /** W-4 spec §3.1: the Hound's turrets, each a signed offset from the nose in fine heading steps (AIM_STEPS to the turn),
   *  within ± its class's turret arcSteps (0 on a class without that turret); and both guns' mode, false AUTO, true MAN
   *  (gunMode; only the crew slot of a turret class is ever MAN). Every round starts 0 / 0 / AUTO. */
  pewTurret: number; gunTurret: number; gunsManual: boolean;
```

In `systemsFor`, after `torpManual: false,   // W-3: and the torpedo too` add `pewTurret: 0, gunTurret: 0, gunsManual: false,   // W-4 spec §3.1: the turrets on the nose, both guns AUTO`. In `emptySystems`, after `torpManual: false,` add `pewTurret: 0, gunTurret: 0, gunsManual: false,`.

- [ ] **Step 5: The hash and the bounds**

In `src/renderer/src/sim/tactical/hash.ts`:

1. In `SYSTEMS_TAIL`, replace `'laserManual', 'laserAim', 'torpManual'] as const` with `'laserManual', 'laserAim', 'torpManual', 'pewTurret', 'gunTurret', 'gunsManual'] as const`, and add to the line's comment "; the turrets and the guns' mode, W-4b".
2. `FLAGS`: add `'gunsManual'`.
3. In `systemsRules`, after `torpManual: flagBit,` add:

```ts
  // W-4 spec §13.1: the guns' mode a bit (validateTacticalValues adds the crew-and-turret check); the turrets are checked
  // against the slot's own class (turretRule).
  gunsManual: flagBit,
```

4. After `pewChargeRule`, add:

```ts
/** W-4 spec §13.1: a slot's turret offset, within ± its own class's turret arc (0 for a class without that turret). */
const turretRule = (cls: number, gun: 'pew' | 'gun'): ((v: number) => boolean) => {
  const t = SHIP_CLASSES[cls]?.slots[gun]?.turret ?? null;
  return within(t ? -t.arcSteps : 0, t ? t.arcSteps : 0);
};
```

5. In `validateTacticalValues`, replace

```ts
        const rule = ship[1] === 'ships' ? BODY_RULES[key] : key === 'pewCharge' ? pewChargeRule(clsOf.get(i) ?? -1) : sys[key];
```

with

```ts
        const rule = ship[1] === 'ships' ? BODY_RULES[key] : key === 'pewCharge' ? pewChargeRule(clsOf.get(i) ?? -1)
          : key === 'pewTurret' ? turretRule(clsOf.get(i) ?? -1, 'pew') : key === 'gunTurret' ? turretRule(clsOf.get(i) ?? -1, 'gun') : sys[key];   // W-4 spec §13.1
```

and after the `torpManual` crew-only line add:

```ts
        if (ship[1] === 'systems' && key === 'gunsManual' && slice[0] !== 0 && (i !== CREW_SLOT || !hasTurret(SHIP_CLASSES[clsOf.get(i) ?? -1] ?? SHIP_CLASSES[0]!) || (SHIP_CLASSES[clsOf.get(i) ?? -1] === undefined))) bad('only the crew slot of a turret class has a gun mode');   // W-4 spec §13.1
```

Add `hasTurret` to hash.ts's `./defs` import. Extend `validateTacticalValues`'s doc comment: "W-4: a slot's turrets within its class's arcs, and the guns' mode only on the crew slot of a turret class."

- [ ] **Step 6: The Valkyrn digest without the new fields (spec §13.4)**

In `tests/valkyrnIdentity.test.ts`:

1. Replace the import of `flattenTactical` with `import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';` and add `import type { TacticalState } from '../src/renderer/src/sim/tactical/state';` (keep `Outcome`).
2. After `const HOUND = parseShip(hound), TICKS = 3000;` add:

```ts
/** W-4 spec §13.4: the three W-4b fields (always 0 / false on the Valkyrn, asserted per tick below) are left out by name, so
 *  the hashed array is flattenTactical before W-4b's fields, element for element: every tactical module's fields in order, −0 as 0. */
const W4B_FIELDS = /^systems\.\d+\.(pewTurret|gunTurret|gunsManual)$/;
function flattenWithoutTurrets(t: TacticalState): number[] {
  const out: number[] = [];
  for (const m of TACTICAL_MODULES) for (const f of m.fields(t)) if (!W4B_FIELDS.test(f.name)) f.read(t, out);
  return out.map((v) => (v === 0 ? 0 : v));
}
```

3. In `run`, replace `...flattenTactical(d.tactical),` with `...flattenWithoutTurrets(d.tactical),`; declare `let zero = true;` before the loop and, after the `h.update(JSON.stringify(r));` line, add `for (const s of d.tactical.systems) zero &&= s.pewTurret === 0 && s.gunTurret === 0 && !s.gunsManual;`; change the return to `` return `${kind}-${seed}:${d.interior.tick}:${h.digest('hex').slice(0, 16)}${zero ? '' : ':TURRET'}`; `` (a moved field makes the string differ from the pin).
4. Append to the header comment: "W-4 spec §13.4 (W-4b): the hashed array leaves out pewTurret, gunTurret and gunsManual by name (they are always 0 / false on the Valkyrn, and a nonzero one appends `:TURRET`, failing the pin); the digests are unchanged."

The five pinned strings stay exactly as they are.

- [ ] **Step 7: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Turret.test.ts tests/valkyrnIdentity.test.ts tests/duelModules.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts`
Expected: tsc clean; `w4Turret`, `valkyrnIdentity` (its five pins unchanged), `w4HunterIdentity` and `valkyrnRoundsRocks` PASS. `duelModules`: its member walk and "every field moves the hash" PASS (the fields are module fields); only a `played(…)` pin may be red if it pins a hash.

- [ ] **Step 8: Classify the fallout**

Run: `npx electron-vite build` then `npx vitest run --maxWorkers=4 2>&1 | tail -60`
Expected: only the known-red window's files (the goldens, hash or length pins). Add each red hash pin to the report's "Task 11 re-picks" list under `## W-4b` in `docs/superpowers/research/2026-11-19-w4-report.md` (create the heading if W-4a left none).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/turret.ts tests/w4Turret.test.ts tests/valkyrnIdentity.test.ts docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "feat(w4b): the turret state and the guns' mode, hashed and bounded per class; the slew law; the Valkyrn digest leaves the new fields out by name (W-4 spec §3.1, §3.2, §13.1, §13.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `turretAim` on the wire, in every held schema, the authority and `ShipInput`

**Status: DONE on the branch (3b2a90c5). Do not re-run.**

**Files:**
- Modify: `src/renderer/src/net/contracts.ts`, `net/codec.ts`, `authority/core.ts`, `authority/checkpoint.ts`, `authority/duelCheckpoint.ts`, `authority/replay.ts`
- Modify: `src/renderer/src/sim/tactical/weapons.ts` (`ShipInput`, `IDLE_INPUT`, `UNCREWED_INPUT`), `sim/tactical/hunter.ts` (its literal), `sim/duel/step.ts` (`heldTurretAim`, the crew input)
- Modify: the held round-trip, expiry and pause tests beside W-4a's `weaponSel` cases (Task 7 of W-4a placed one beside each file's `torpHeading` case)
- Create: `tests/w4TurretAim.test.ts`

**Interfaces:**
- Consumes: W-4a's crew literal in `step.ts` (quoted in Step 4), `heldWeaponSel(h)`, `NO_HELD`.
- Produces: `HeldInput.turretAim?`, `ShipInput.turretAim`, `heldTurretAim(h: HeldInput): number`.

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §8: turretAim, the reticle's world bearing (a fine aim 0..65535; −1 or absent none), rides the held frame from
// the Weapons attendant into ShipInput.turretAim; anything else reads as none.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { heldTurretAim } from '../src/renderer/src/sim/duel/step';
import { IDLE_INPUT, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';

describe('turretAim (W-4 spec §8)', () => {
  it('heldTurretAim reads an integer 0..65535 and anything else as none', () => {
    const h = (turretAim?: number) => ({ moveX: 0, moveY: 0, interactHeld: false, ...(turretAim !== undefined ? { turretAim } : {}) });
    expect([0, 65535, 16384, -1, 65536, 1.5, undefined].map((a) => heldTurretAim(h(a)))).toEqual([0, 65535, 16384, -1, -1, -1, -1]);
  });
  it('the idle and uncrewed inputs carry no aim', () => {
    expect([IDLE_INPUT.turretAim, UNCREWED_INPUT.turretAim]).toEqual([-1, -1]);
  });
});
void parseShip; void cutter;
```

Beside each W-4a `weaponSel` held case (grep `weaponSel` in `tests/`: the codec, `checkpoint`, `duelCheckpoint`, `replay`, and the authority expiry and pause tests), add one `turretAim` case in that file's idiom:
- a frame with `turretAim: 65535` round-trips; `turretAim: -1` round-trips; `65536` and `-2` are malformed; a frame without it is valid;
- the authority: a held frame carrying only `turretAim` expires after `REMOTE_HELD_TIMEOUT_MS` (it is neutralised), and a pause deletes `turretAim`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4TurretAim.test.ts`
Expected: FAIL (`heldTurretAim` not exported).

- [ ] **Step 3: The contracts and every held schema**

`net/contracts.ts`: in `HeldInput`, after `weaponSel?: number;` add `turretAim?: number;`, and add to its doc comment: "W-4 spec §8: `turretAim` the reticle's world bearing from the own ship, a fine aim 0..65535 (−1 or absent none), read from the Weapons attendant; the selected MAN gun's turret slews toward it."

`net/codec.ts`: in the `held` schema, after W-4a's `weaponSel: z.number().int().min(0).max(2).optional(),` add `turretAim: z.number().int().min(-1).max(65535).optional(),` and add "turretAim: W-4b" to the line's comment.

`authority/checkpoint.ts`, `authority/duelCheckpoint.ts`, `authority/replay.ts`: in each held object, after `weaponSel: z.number().int().min(0).max(2).optional(),` add `turretAim: z.number().int().min(-1).max(65535).optional(),`.

`authority/core.ts`: in `expireHeld`'s condition, after `h.weaponSel !== undefined ||` add `h.turretAim !== undefined ||`; in the pause clear, after `delete h.weaponSel;` add `delete h.turretAim;`; add "and the reticle" to both W-4 comments.

- [ ] **Step 4: `ShipInput`, the Hunter's literal and the step**

`sim/tactical/weapons.ts`: in `ShipInput`, after `weaponSel: number;` add:

```ts
  /** W-4 spec §8: the Weapons attendant's reticle, a fine aim 0..65535, −1 none (every other input). The selected MAN gun's
   *  turret slews toward it (turret.ts slewTurrets). */
  turretAim: number;
```

and in `IDLE_INPUT` and `UNCREWED_INPUT`, after `weaponSel: -1,` add `turretAim: -1,`.

`sim/tactical/hunter.ts`: in the `const input: ShipInput = { ... }` literal, after `weaponSel: -1,` add `turretAim: -1,`.

`sim/duel/step.ts`:
1. After W-4a's `heldWeaponSel`, add:

```ts
/** W-4 spec §8: the reticle in a held frame: an integer 0..65535, else −1 (none). */
export function heldTurretAim(h: HeldInput): number {
  const a = h.turretAim;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < AIM_STEPS ? a : -1;
}
```

(import `AIM_STEPS` from `'../tactical/tuning'` beside `HEADING_COUNT`).
2. In W-4a's crew literal, replace `weaponSel, pewTrigger: false, scanner: true };` with `weaponSel, pewTrigger: false, turretAim: gunner >= 0 ? heldTurretAim(gunnerHeld) : -1, scanner: true };   // W-4 spec §8: the reticle`.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4TurretAim.test.ts tests/w4PewFire.test.ts <each held-schema and authority test you edited> tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts`
Expected: tsc clean; all PASS (no sim behaviour changes in this task).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/core.ts src/renderer/src/authority/checkpoint.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/replay.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/duel/step.ts tests/w4TurretAim.test.ts <the held tests edited>
git commit -m "feat(w4b): turretAim rides every held schema, the authority's expiry and pause, and ShipInput (W-4 spec §8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One mode flag per gun: `gunsManual` becomes `pewManual` and `gunManual` (amendment §2.1)

Task 1 put one flag for both guns, `gunsManual`, on the branch. Nothing sets or reads it yet outside the state, the hash and three tests, so this task only renames and splits it, in every place it stands at `3b2a90c5`:
- `src/renderer/src/sim/tactical/state.ts`: `ShipSystems` (the member and its doc), `systemsFor`, `emptySystems`;
- `src/renderer/src/sim/tactical/hash.ts`: `SYSTEMS_TAIL`, `FLAGS`, `systemsRules`, the mode check in `validateTacticalValues` and that function's doc comment;
- `tests/w4Turret.test.ts`: the three state cases;
- `tests/tacticalDeterminism.test.ts`: the flatten key guard's `ShipSystems` key list, its comment and its length line (58 values per ship today);
- `tests/valkyrnIdentity.test.ts`: the left-out pattern, the zero check and the two comments;
- `docs/superpowers/research/2026-11-19-w4-report.md`: one line under "Task 11 re-picks".

`src/renderer/src/sim/snapshotValidation.ts` names no tactical field (it goes through `validateTacticalValues`), so it needs no edit. `git grep -n "gunsManual" -- src tests scripts` must print nothing when the task is done.

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts`, `src/renderer/src/sim/tactical/hash.ts`
- Modify: `tests/w4Turret.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/valkyrnIdentity.test.ts`
- Modify: `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: Task 1's `ShipSystems.gunsManual`, `SYSTEMS_TAIL`, `FLAGS`, `systemsRules`, the `gunsManual` check in `validateTacticalValues` (each quoted below as it stands on the branch); `SHIP_CLASSES`, `CREW_SLOT`.
- Produces: `ShipSystems.pewManual: boolean`, `ShipSystems.gunManual: boolean` (Task 4 sets them through `gunMode` and reads them in `handControl`; Task 7 reads `pewManual` in `pewFire`'s admission).

- [ ] **Step 1: Rewrite the state tests (the failing tests)**

In `tests/w4Turret.test.ts`, in the describe "the turret state (W-4 spec §3.1, §13.1)":

1. In "starts 0 / false on every slot and class", replace

```ts
      expect([s.pewTurret, s.gunTurret, s.gunsManual]).toEqual([0, 0, false]);
```

with

```ts
      expect([s.pewTurret, s.gunTurret, s.pewManual, s.gunManual]).toEqual([0, 0, false, false]);   // W-4 amendment §2.1: a mode per gun
```

2. In "round-trips mid-slew through flatten and unflatten", replace `Object.assign(s, { pewTurret: -2911, gunTurret: 4000, gunsManual: true });` with `Object.assign(s, { pewTurret: -2911, gunTurret: 4000, pewManual: true, gunManual: false });`, and replace

```ts
    expect([back.systems[0]!.pewTurret, back.systems[0]!.gunTurret, back.systems[0]!.gunsManual]).toEqual([-2911, 4000, true]);
```

with

```ts
    expect([back.systems[0]!.pewTurret, back.systems[0]!.gunTurret, back.systems[0]!.pewManual, back.systems[0]!.gunManual]).toEqual([-2911, 4000, true, false]);   // the two flags are separate values
```

3. Rename the third case from `'bounds each turret by its slot\'s class: the Hound\'s ±arc, 0 elsewhere; gunsManual only on the crew slot of a turret class'` to `'bounds each turret by its slot\'s class: the Hound\'s ±arc, 0 elsewhere; each gun\'s mode only on the crew slot of a class whose weapon in that slot has a turret'`, and replace its last three lines

```ts
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunsManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.gunsManual = true; })).toMatch(/gunsManual/);
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunsManual = true; })).toMatch(/gunsManual/);
```

with

```ts
    // W-4 amendment §2.1: each flag is checked against its own weapon's turret.
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewManual = true; st.systems[0]!.gunManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.pewManual = true; })).toMatch(/pewManual/);   // the Hunter: its pew has no turret
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.gunManual = true; })).toMatch(/gunManual/);   // and it has no gun
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunManual = true; })).toMatch(/gunManual/);   // the Valkyrn's gun: no turret
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.pewManual = true; })).toMatch(/pewManual/);   // no pew at all
    expect(bad(ShipClass.ValkyrnLaser, (st) => { st.systems[0]!.pewManual = true; })).toMatch(/pewManual/);
    expect(bad(ShipClass.ValkyrnLaser, (st) => { st.systems[0]!.gunManual = true; })).toMatch(/gunManual/);
```

Also change the file's header comment's "two signed offsets and one mode flag" to "two signed offsets and a mode flag per gun (W-4 amendment §2.1)".

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Turret.test.ts`
Expected: FAIL (the three state cases: `pewManual` and `gunManual` are `undefined`, and no bound names them). The slew law's cases still pass.

- [ ] **Step 3: The state**

In `src/renderer/src/sim/tactical/state.ts`:

1. In `ShipSystems`, replace Task 1's doc and member

```ts
  /** W-4 spec §3.1: the Hound's turrets, each a signed offset from the nose in fine heading steps (AIM_STEPS to the turn),
   *  within ± its class's turret arcSteps (0 on a class without that turret); and both guns' mode, false AUTO, true MAN
   *  (gunMode; only the crew slot of a turret class is ever MAN). Every round starts 0 / 0 / AUTO. */
  pewTurret: number; gunTurret: number; gunsManual: boolean;
```

with

```ts
  /** W-4 spec §3.1: the Hound's turrets, each a signed offset from the nose in fine heading steps (AIM_STEPS to the turn),
   *  within ± its class's turret arcSteps (0 on a class without that turret). W-4 amendment §2.1: each gun's own mode,
   *  pew pew's and the autocannon's, false AUTO, true MAN (gunMode {slot}; only the crew slot of a class whose weapon in
   *  that slot has a turret is ever MAN). Every round starts 0 / 0 / AUTO / AUTO. */
  pewTurret: number; gunTurret: number; pewManual: boolean; gunManual: boolean;
```

2. In `systemsFor`, replace `pewTurret: 0, gunTurret: 0, gunsManual: false,   // W-4 spec §3.1: the turrets on the nose, both guns AUTO` with `pewTurret: 0, gunTurret: 0, pewManual: false, gunManual: false,   // W-4 spec §3.1, amendment §2.1: the turrets on the nose, each gun AUTO`.
3. In `emptySystems`, replace `pewTurret: 0, gunTurret: 0, gunsManual: false,` with `pewTurret: 0, gunTurret: 0, pewManual: false, gunManual: false,`.

- [ ] **Step 4: The hash and the bounds**

In `src/renderer/src/sim/tactical/hash.ts`:

1. `SYSTEMS_TAIL`: replace `'torpManual', 'pewTurret', 'gunTurret', 'gunsManual'] as const` with `'torpManual', 'pewTurret', 'gunTurret', 'pewManual', 'gunManual'] as const` (the two flags in the old one's place, pew pew's first), and in the line's comment change "the turrets and the guns' mode, W-4b" to "the turrets and each gun's mode, W-4b (amendment §2.1)".
2. `FLAGS`: replace `'torpManual', 'gunsManual']` with `'torpManual', 'pewManual', 'gunManual']`.
3. In `systemsRules`, replace

```ts
  // W-4 spec §13.1: the guns' mode a bit (validateTacticalValues adds the crew-and-turret check); the turrets are checked
  // against the slot's own class (turretRule).
  gunsManual: flagBit,
```

with

```ts
  // W-4 spec §13.1, amendment §2.1: each gun's mode a bit (validateTacticalValues adds the crew-and-turret check); the
  // turrets are checked against the slot's own class (turretRule).
  pewManual: flagBit, gunManual: flagBit,
```

4. In `validateTacticalValues`, replace

```ts
        if (ship[1] === 'systems' && key === 'gunsManual' && slice[0] !== 0) {   // W-4 spec §13.1: only the crew slot of a turret class has a gun mode
          const c = SHIP_CLASSES[clsOf.get(i) ?? -1];
          if (i !== CREW_SLOT || c === undefined || !hasTurret(c)) bad('only the crew slot of a turret class has a gun mode');
        }
```

with

```ts
        if (ship[1] === 'systems' && (key === 'pewManual' || key === 'gunManual') && slice[0] !== 0) {   // W-4 amendment §2.1: a gun's mode only on the crew slot of a class whose weapon in that slot has a turret
          const c = SHIP_CLASSES[clsOf.get(i) ?? -1], turret = (key === 'pewManual' ? c?.slots.pew : c?.slots.gun)?.turret ?? null;
          if (i !== CREW_SLOT || turret === null) bad('only the crew slot of a class with that turret has a gun mode');
        }
```

5. Nothing else in `hash.ts` reads `hasTurret`: remove it from the `./defs` import (`import { hasTurret, pewFullCharge, SHIP_CLASSES, type ShipClassDef } from './defs';` becomes `import { pewFullCharge, SHIP_CLASSES, type ShipClassDef } from './defs';`).
6. In `validateTacticalValues`'s doc comment, change "W-4: a slot's turrets within its class's arcs, and the guns' mode only on the crew slot of a turret class." to "W-4: a slot's turrets within its class's arcs, and each gun's mode only on the crew slot of a class whose weapon in that slot has a turret (amendment §2.1)."

- [ ] **Step 5: The flatten key guard (58 → 59 values per ship)**

In `tests/tacticalDeterminism.test.ts`, in "Ship, ShipSystems and TacticalState fields are exactly those flattenTactical knows":

1. In the `Object.keys(st.systems[0]).sort()` list (it is in sort order): replace `'gunLocked', 'gunMuzzle',` with `'gunLocked', 'gunManual', 'gunMuzzle',`; replace `'gunWear', 'gunsManual', 'hull',` with `'gunWear', 'hull',`; replace `'pewHits', 'pewShots',` with `'pewHits', 'pewManual', 'pewShots',`.
2. In the comment above the length line, replace "W-4 spec §3.1, §13.1 (W-4b): the two" and the line after it ("turrets and the guns' mode, 3 more per slot (44 scalars).") with "W-4 spec §3.1, §13.1 (W-4b), amendment §2.1: the two" and "turrets and each gun's mode, 4 more per slot (45 scalars)."
3. In the length line, replace `+ 6 + 2 * 58 + 17);` with `+ 6 + 2 * 59 + 17);`.

- [ ] **Step 6: The Valkyrn digest's left-out fields (spec §13.4, amendment §2.1)**

In `tests/valkyrnIdentity.test.ts`:

1. Replace `const W4B_FIELDS = /^systems\.\d+\.(pewTurret|gunTurret|gunsManual)$/;` with `const W4B_FIELDS = /^systems\.\d+\.(pewTurret|gunTurret|pewManual|gunManual)$/;`.
2. In `run`, replace `zero &&= s.pewTurret === 0 && s.gunTurret === 0 && !s.gunsManual;` with `zero &&= s.pewTurret === 0 && s.gunTurret === 0 && !s.pewManual && !s.gunManual;`.
3. In the doc comment above `W4B_FIELDS`, change "the three W-4b fields" to "the four W-4b fields".
4. In the header comment, change "leaves out pewTurret, gunTurret and gunsManual by name" to "leaves out pewTurret, gunTurret, pewManual and gunManual by name".

The five pinned strings stay exactly as they are: the array that is hashed leaves the same positions out (one flag's place is now two, both left out).

- [ ] **Step 7: Run**

Run: `npx tsc -b` then `git grep -n "gunsManual" -- src tests scripts` then `npx vitest run tests/w4Turret.test.ts tests/tacticalDeterminism.test.ts tests/valkyrnIdentity.test.ts tests/duelModules.test.ts tests/w4TurretAim.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: tsc clean (a leftover `gunsManual` is a type error); the grep prints nothing; `w4Turret`, `tacticalDeterminism`, `valkyrnIdentity` (its five pins unchanged), `w4TurretAim` and the fences PASS. `duelModules`: its member walk and "every field moves the hash" PASS (both flags are module fields); only a `played(…)` pin may be red, as after Task 1. No run moves in this task (nothing sets either flag yet), so no other test changes its result.

- [ ] **Step 8: The report**

In `docs/superpowers/research/2026-11-19-w4-report.md`, under `## W-4b`, at the end of the "Task 11 re-picks" section, add with the Edit tool:

```markdown

Task 3 (W-4 amendment §2.1): `gunsManual` is split into `pewManual` and `gunManual`, so each systems record has one more
hashed value (the flatten key guard: 2 × 58 → 2 × 59 per-slot values, updated in Task 3). No new red test: the duel
goldens were already in the window.
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts tests/w4Turret.test.ts tests/tacticalDeterminism.test.ts tests/valkyrnIdentity.test.ts docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "feat(w4b): a mode flag per gun: gunsManual becomes pewManual and gunManual, hashed and bounded by each weapon's own turret; the flatten key guard and the Valkyrn digest's left-out list follow (W-4 amendment §2.1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `gunMode`, hand control, and MAN's fire-rate tables

**Files:**
- Modify: `src/renderer/src/net/contracts.ts`, `net/codec.ts`, `sim/tactical/hash.ts` (`shipModule.commands`), `sim/duel/step.ts` (`WEAPON_ORDER`, `DUEL_KINDS`, the admission), `app/duel/runtime.ts` (`isWeaponsCommand`)
- Modify: `src/renderer/src/sim/tactical/state.ts` (`handControl`), `sim/tactical/gun.ts` (`gunInterval`, `fireRound`, `tickGun`), `sim/tactical/pew.ts` (`pewGain`, `tickPew`), `sim/tactical/weapons.ts` (`tickWeapons`' `tickPew` call)
- Modify: `tests/duelModules.test.ts` (the kinds list), `tests/duelCheckpoint.test.ts` (its codec case's `examples` map gains `gunMode`)
- Create: `tests/w4Manual.test.ts`

**Interfaces:**
- Consumes: W-4a's `gunInterval(state, i)` (body quoted in Step 4), `PEW_MAN_GAIN_BY_BARS`, `AUTOCANNON_MAN_INTERVAL_BY_BARS`, `hasTurret`, `houndWeapons(st, bars)` (W-4a helper), `ShipInput.weaponSel` (W-4a).
- Consumes (Task 3): `ShipSystems.pewManual`, `gunManual`.
- Produces: `DuelCommand { kind: 'gunMode'; slot: 0 | 1; manual: boolean }` (Decision 17); `pewManual` and `gunManual` set by the step; `handControl(state, i, weaponSel, slot)` (Decision 14, amendment §2.3); `gunInterval(state, i, manual = false)`, `pewGain(state, i, manual = false)`, `tickPew(state, i, manual = false)`.

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §3.4, §4.1, §4.4, amendment §2.2, §2.3: gunMode {slot, manual} (Weapons seat only; malformed for a slot other
// than 0 or 1 or a non-boolean; unavailable without a turret in that slot; a noop per slot), set at once, two slots in one
// tick both applying; hand control (that gun's own switch on MAN, and selected: owner 2026-11-19); the gun in hand's fire
// rate: the pew's gain 7 / 10 / 14 / 18 units a tick and the autocannon's interval 8 / 7 / 5 / 4.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { gunInterval, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { pewGain } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, handControl } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { houndWeapons } from './helpers/crewWeapons';

const CUTTER = parseShip(cutter);
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });

describe('gunMode (W-4 spec §4.1, amendment §2.2)', () => {
  it("Weapons seat only; one gun's mode, set at once; a repeat is a noop, per slot; a bad slot or a non-boolean is malformed", () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 1), env(d, d.helmPlayer, { kind: 'gunMode', slot: 0, manual: false }, 1)] });
      // stepDuelTick sorts its results by player, then sequence (step.ts, its last line); the Helm is player 0 here.
      expect(d.helmPlayer).toBe(0);
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'not-at-weapons'], ['applied', null]]);
      expect([s.pewManual, s.gunManual]).toEqual([true, false]);   // the autocannon's switch is its own
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 2)] })[0]).toMatchObject({ status: 'noop' });
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 1, manual: false }, 3)] })[0]).toMatchObject({ status: 'noop' });   // slot 1 is still AUTO
      const malformed = [{ kind: 'gunMode', slot: 0, manual: 1 }, { kind: 'gunMode', slot: 2, manual: true }, { kind: 'gunMode', slot: -1, manual: true }, { kind: 'gunMode', slot: 0.5, manual: true }, { kind: 'gunMode', manual: true }];
      malformed.forEach((c, k) => expect(stepDuelTick(d, { held: [], commands: [env(d, g, c as never, 4 + k)] })[0], JSON.stringify(c)).toMatchObject({ status: 'rejected', reason: 'malformed' }));
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: false }, 9)] });
      expect([s.pewManual, s.gunManual]).toEqual([false, false]);
    } finally { disposeDuel(d); }
  });
  it('two gunMode commands for different slots in one tick both apply; a second for the same slot is judged against the mode the first set', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 1), env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 2), env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 3), env(d, g, { kind: 'gunMode', slot: 0, manual: false }, 4)] });
      expect(r.map((x) => x.status)).toEqual(['applied', 'applied', 'noop', 'applied']);   // one player's results, in sequence order
      expect([s.pewManual, s.gunManual]).toEqual([false, true]);
    } finally { disposeDuel(d); }
  });
  it('is unavailable on the Valkyrn and on its laser fit, for either slot (no turret); malformed is judged first', () => {
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) for (const slot of [0, 1] as const) {
      const v = createSeatedDuel(CUTTER, 5, 0, 2, cls), g = 1 - v.helmPlayer;
      try {
        expect(stepDuelTick(v, { held: [], commands: [env(v, g, { kind: 'gunMode', slot, manual: true }, 1)] })[0], `class ${cls} slot ${slot}`).toMatchObject({ status: 'rejected', reason: 'unavailable' });
        expect(stepDuelTick(v, { held: [], commands: [env(v, g, { kind: 'gunMode', slot: 2, manual: true } as never, 2)] })[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
        expect([v.tactical.systems[0].pewManual, v.tactical.systems[0].gunManual]).toEqual([false, false]);
      } finally { disposeDuel(v); }
    }
  });
});

describe('hand control (W-4 spec §3.4, amendment §2.3, owner 2026-11-19)', () => {
  it("a gun is in hand only when its own switch is MAN and it is selected: every row of the amendment's table; the Hunter never", () => {
    const st = createTacticalState(5), s = st.systems[0]!;
    /** [pew pew in hand, the autocannon in hand] with these switches and this selection. */
    const hands = (pew: boolean, gun: boolean, sel: number): [boolean, boolean] => { s.pewManual = pew; s.gunManual = gun; return [handControl(st, 0, sel, WeaponSlot.Pew), handControl(st, 0, sel, WeaponSlot.Autocannon)]; };
    for (const sel of [-1, 0, 1, 2]) expect(hands(false, false, sel), `AUTO / AUTO, selected ${sel}`).toEqual([false, false]);
    expect(hands(true, false, WeaponSlot.Pew)).toEqual([true, false]);           // MAN / AUTO, pew pew selected: pew pew in hand
    expect(hands(true, false, WeaponSlot.Autocannon)).toEqual([false, false]);   // MAN / AUTO, the autocannon selected: both AUTO-driven (the left button does nothing)
    expect(hands(false, true, WeaponSlot.Autocannon)).toEqual([false, true]);    // AUTO / MAN, the autocannon selected: it is in hand
    expect(hands(false, true, WeaponSlot.Pew)).toEqual([false, false]);
    expect(hands(true, true, WeaponSlot.Pew)).toEqual([true, false]);            // MAN / MAN: only the selected gun
    expect(hands(true, true, WeaponSlot.Autocannon)).toEqual([false, true]);
    expect(hands(true, true, WeaponSlot.Torpedo)).toEqual([false, false]);       // MAN / MAN, the torpedo selected: both AUTO-driven
    expect(hands(true, true, -1)).toEqual([false, false]);                       // nothing selected (an unattended seat)
    expect([handControl(st, 1, WeaponSlot.Pew, WeaponSlot.Pew), handControl(st, 0, WeaponSlot.Torpedo, WeaponSlot.Torpedo)]).toEqual([false, false]);   // the Hunter is never MAN; the torpedo is no gun
  });
});

describe("the gun in hand's fire rate (W-4 spec §4.4)", () => {
  it('the pew gains 7 / 10 / 14 / 18 units a tick in hand and keeps 6 / 8 / 12 / 15 otherwise, MAN or not', () => {
    for (const [bars, man, auto] of [[1, 7, 6], [2, 10, 8], [3, 14, 12], [4, 18, 15]] as const) {
      const st = houndWeapons(createTacticalState(5), [bars, 0, 0]); st.systems[0]!.bars[1] = 10;   // the overdrive bar allows a 4th
      expect(pewGain(st, 0), `${bars} bars AUTO`).toBe(auto);
      st.systems[0]!.pewManual = true;
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Autocannon, WeaponSlot.Pew)), `${bars} bars MAN, not in hand`).toBe(auto);   // owner 2026-11-19: an AUTO-driven gun keeps AUTO's rate
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew)), `${bars} bars in hand`).toBe(man);
      st.systems[0]!.pewManual = false; st.systems[0]!.gunManual = true;
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew)), `${bars} bars, only the autocannon on MAN`).toBe(auto);   // amendment §2.3: the bonus is the gun in hand's only
    }
    const hunter = createTacticalState(5);
    expect([pewGain(hunter, 1), pewGain(hunter, 1, true)]).toEqual([6, 6]);   // the Hunter's rate is its class's (720 / 120), unchanged
  });
  it('the autocannon in hand fires every 8 / 7 / 5 / 4 ticks, measured between gunFire events; MAN with it unselected keeps AUTO\'s row', () => {
    for (const [bars, interval] of [[1, 8], [2, 7], [3, 5], [4, 4]] as const) {
      const st = houndWeapons(createTacticalState(5), [0, bars, 0]), s = st.systems[0]!; s.bars[1] = 10; s.gunManual = true;
      expect([gunInterval(st, 0), gunInterval(st, 0, true)], `${bars} bars`).toEqual([[0, 10, 8, 6, 5][bars], interval]);
      expect(gunInterval(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Autocannon)), `${bars} bars, pew pew selected`).toBe([0, 10, 8, 6, 5][bars]);   // MAN but not selected: AUTO's row
      const at: number[] = [];
      for (let k = 0; k < 80; k++) { st.events = []; tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true, weaponSel: WeaponSlot.Autocannon }); if (st.events.some((e) => e.kind === 'gunFire')) at.push(k); }
      expect(new Set(at.slice(1).map((t, j) => t - at[j]!)), `${bars} bars`).toEqual(new Set([interval]));
    }
  });
});
```

(`tickGun`'s trigger in this task is still W-4a's `input.gunHeld` for any turret gun; Task 7 keeps it for the gun in hand only. The interval row is the hand control of the tick, `weaponSel` 1 here.) A noop result is `{ status: 'noop' }` (`step.ts` L317, L322: `result(e, undefined, 'noop')`), as the test reads.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Manual.test.ts`
Expected: FAIL (`gunMode` is `not-in-duel`; `handControl` is not exported; MAN gains equal AUTO's).

- [ ] **Step 3: The command**

`net/contracts.ts`: after the `torpMode` member add:

```ts
  /** W-4 spec §4.1, amendment §2.2: Weapons sets one of the Hound's guns' mode, `slot` 0 pew pew or 1 the autocannon: true
   *  MAN (while it is the selected weapon it follows the reticle and fires on LMB), false AUTO (it aims with lead and fires
   *  by itself at a seen, hostile enemy ship). Any integer slot passes the codec; the sim answers another one malformed,
   *  and a slot whose weapon has no turret unavailable. */
  | { kind: 'gunMode'; slot: 0 | 1; manual: boolean }
```

`net/codec.ts`: after the `torpMode` line add `z.object({ kind: z.literal('gunMode'), slot: z.number().int(), manual: z.boolean() }).strict(),   // W-4b, amendment §2.2: one gun's AUTO / MAN (the sim checks the slot)`, and add "W-4b adds `gunMode`" to the codec's header list. `authority/duelRules.ts` needs no edit (Decision 17).

`sim/tactical/hash.ts` `shipModule.commands`: `['laserMode', 'torpMode', 'gunMode', 'laserLock', ...]` (insert `'gunMode'` after `'torpMode'`).

`app/duel/runtime.ts` `isWeaponsCommand`: add `|| c.kind === 'gunMode'`.

`sim/duel/step.ts`:
1. `WEAPON_ORDER`: insert `'gunMode'` after `'torpMode'`. `DUEL_KINDS`: insert `'gunMode'` after `'torpMode'`.
2. In the loop's kind filter (`if (c.kind !== 'laserMode' && c.kind !== 'torpMode' && ...`), add `&& c.kind !== 'gunMode'` after `c.kind !== 'torpMode'`.
3. After the `torpMode` branch (`else if (c.kind === 'torpMode') { ... }`), add:

```ts
    else if (c.kind === 'gunMode') {   // W-4 spec §4.1, amendment §2.2: one gun's mode (slot 0 pew pew, 1 the autocannon), set now, so a same-tick pewFire is judged in it
      if ((c.slot !== 0 && c.slot !== 1) || typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      const slots = classOf(d.tactical, 0).slots, key = c.slot === 0 ? 'pewManual' : 'gunManual';
      if (((c.slot === 0 ? slots.pew : slots.gun)?.turret ?? null) === null) { result(e, 'unavailable'); continue; }   // no turret in that slot: the Valkyrn and its laser fit
      if (c.manual === sys0[key]) { result(e, undefined, 'noop'); continue; }   // that gun's mode is unchanged (a second for the slot in a tick is judged against the first)
      sys0[key] = c.manual;
    }
```

   The order is the amendment's: stale-tick and `not-at-weapons` (the loop's shared checks above), `malformed`, `unavailable`, `noop`. Two commands for different slots in one tick both apply, since each reads and writes its own flag.
4. Extend the admission comment block (the long `// Tactical commands, ...` comment): "W-4: gunMode third, set at once, so a same-tick pewFire is judged in the new mode; one gun a command (amendment §2.2)."

`tests/duelModules.test.ts`: in the kinds expectation insert `'gunMode'` (alphabetically, after `'designate'`), and add "W-4 spec §4.1 (gunMode)" to its comment.

`tests/duelCheckpoint.test.ts`, the case "the duel codec admits exactly the duel modules' command kinds plus the core's setPaused": its `examples` map must name every module command (`expect(kinds.sort()).toEqual(Object.keys(examples).sort())`), so after `torpMode: { kind: 'torpMode', manual: true },` add `gunMode: { kind: 'gunMode', slot: 1, manual: true },   // W-4 spec §4.1, amendment §2.2`.

- [ ] **Step 4: Hand control and MAN's tables (Decision 14)**

`sim/tactical/state.ts`, after `missileOf` (or beside `classOf`), add:

```ts
/** W-4 spec §3.4, amendment §2.3 (owner 2026-11-19): whether ship i's gun `slot` (0 pew pew, 1 the autocannon; bars.ts
 *  WeaponSlot) is in the gunner's hands this tick: that gun's own switch is MAN (pewManual, gunManual), and it is the Weapons
 *  seat's selected weapon (`weaponSel`, held input, −1 none). The gun in hand follows the reticle, fires on the trigger and
 *  takes MAN's rates; every other powered gun is AUTO-driven, a MAN one that is not selected too. Only the crew slot of a
 *  turret class is ever MAN (hash.ts), so this is false elsewhere, and for any other slot. W-4c adds the MANUAL flight here. */
export function handControl(state: TacticalState, i: number, weaponSel: number, slot: number): boolean {
  const s = state.systems[i]!, manual = slot === 0 ? s.pewManual : slot === 1 && s.gunManual;
  return manual && weaponSel === slot;
}
```

(The two lines are W-4c's anchor: it adds one condition to the `return`.)

`sim/tactical/gun.ts`:
1. Add `handControl` to the `./state` import.
2. W-4a's `gunInterval`: change its signature to `export function gunInterval(state: TacticalState, i: number, manual = false): number {` and replace `return g.intervalByBars[0]![weaponBars(state.systems[i]!, WeaponSlot.Autocannon)] ?? 0;` with

```ts
  return g.intervalByBars[manual ? 1 : 0]![weaponBars(state.systems[i]!, WeaponSlot.Autocannon)] ?? 0;   // W-4 spec §4.4: MAN's row for the gun in hand (W-4b)
```

   and update its doc comment: "W-4a: row 0 (AUTO); W-4b reads the mode." → "`manual`: the autocannon is in hand this tick (handControl, the caller's), read when a round fires."
3. W-4a's `fireRound(state, i, g)` becomes `fireRound(state: TacticalState, i: number, g: GunDef, manual = false)`, and its cooldown `s.gunCooldown = g.turret === null ? g.intervalTicks : gunInterval(state, i);` becomes `s.gunCooldown = g.turret === null ? g.intervalTicks : gunInterval(state, i, manual);`.
4. In `tickGun`, replace W-4a's

```ts
  if (g.turret !== null && gunInterval(state, i) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  fireRound(state, i, g);
```

   with

```ts
  const hand = g.turret !== null && handControl(state, i, input.weaponSel, WeaponSlot.Autocannon);   // W-4 spec §3.4, §4.4: the autocannon in hand
  if (g.turret !== null && gunInterval(state, i, hand) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  fireRound(state, i, g, hand);
```

   (Task 7 replaces these three lines and the condition above them.) The Valkyrn's gun has no turret, so `hand` is false and `fireRound` sets `intervalTicks` as before.

`sim/tactical/pew.ts`:
1. `pewGain`: change its signature to `export function pewGain(state: TacticalState, i: number, manual = false): number {` and replace

```ts
  const ticks = PEW_TICKS_BY_BARS[weaponBars(state.systems[i]!, WeaponSlot.Pew)]!;
  return ticks > 0 ? pewThird(def) / ticks : 0;
```

   with

```ts
  const bars = weaponBars(state.systems[i]!, WeaponSlot.Pew);
  if (manual && def.turret !== null) return PEW_MAN_GAIN_BY_BARS[bars]!;   // W-4 spec §4.4: the Hound's pew in hand, about +20 %
  const ticks = PEW_TICKS_BY_BARS[bars]!;
  return ticks > 0 ? pewThird(def) / ticks : 0;
```

   adding `PEW_MAN_GAIN_BY_BARS` to pew.ts's bars import and "W-4 spec §4.4: `manual` (the pew in hand this tick, handControl) reads PEW_MAN_GAIN_BY_BARS on the Hound's turret pew" to its doc comment. (The `i !== CREW_SLOT` line above stays first, so the Hunter's rate never changes.)
2. `tickPew`: `export function tickPew(state: TacticalState, i: number, manual = false): void {`, and its gain `pewGain(state, i)` becomes `pewGain(state, i, manual)`.

`sim/tactical/weapons.ts` `tickWeapons`: replace `  tickPew(state, i);   // W-1: the pew refills every tick, …` (keep the comment) with `  tickPew(state, i, handControl(state, i, input.weaponSel, WeaponSlot.Pew));   // W-1: …; W-4 spec §4.4: MAN's gain while the pew is in hand`, adding `handControl` to weapons.ts's `./state` import.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Manual.test.ts tests/w4Autocannon.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts`
Expected: tsc clean; all PASS except a known-red pin (nobody sends `gunMode` yet, so no run changes).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/step.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/w4Manual.test.ts
git commit -m "feat(w4b): gunMode {slot, manual} sets one gun AUTO / MAN; hand control (that gun's own switch on MAN, and selected; owner 2026-11-19) and its fire-rate tables (W-4 spec §3.4, §4.1, §4.4; amendment §2.2, §2.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The turrets slew: AUTO's solutions, MAN's reticle, and rounds along the turrets

**Files:**
- Modify: `src/renderer/src/sim/tactical/turret.ts` (`onSolution`, `autoSolution`, `slewTurrets`), `sim/tactical/tuning.ts` (`AUTO_FIRE_TOLERANCE`), `sim/tactical/gun.ts` (`gunLead`, `gunAimFine`), `sim/tactical/pew.ts` (`pewAimFine`), `sim/tactical/weapons.ts` (`applyWeaponsInput`)
- Modify: `tests/w4Turret.test.ts`

**Interfaces:**
- Consumes: `pewLead(state, i, tx, ty, tvx, tvy)`, `pewMuzzle(state, i)` (pew.ts), `interceptTime`, `nearestHeading` (lead.ts), `lineOfSight(state, ax, ay, bx, by)` (geometry.ts), `shipSeen(t, i)` (science.ts), `handControl` (Task 4), `weaponBars`, `WeaponSlot.Pew | Autocannon`, `hasTurret`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, W-4a's `gunAimFine` / `pewAimFine` bodies (quoted in Step 4).
- Produces: `AUTO_FIRE_TOLERANCE`, `gunLead`, `onSolution`, `autoSolution`, `AutoOnSolution`, `slewTurrets` (turret.ts). Task 7 consumes `slewTurrets`' return; Task 10 `onSolution`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/w4Turret.test.ts` (add the imports it needs: `applyWeaponsInput`, `IDLE_INPUT`, `type ShipInput` from weapons; `autoSolution`, `slewTurrets` from turret; `gunLead`, `gunAimFine`, `tickGun` from gun; `pewAimFine`, `pewLead`, `firePewTrigger`, `aimDir` from pew; `houndWeapons` from `./helpers/crewWeapons`; `mover` from `./helpers/rockArena`; `hx`, `hy` from direction; `AUTO_FIRE_TOLERANCE`, `HEADING_COUNT` from tuning):

```ts
/** The Hound at (0, 1500) nose `heading`, still, no rocks; the Hunter at `ahead` u along heading `bearing` from it, still;
 *  bars pew / autocannon / torpedo. */
function scene(bars: readonly [number, number, number], heading = 0, bearing = 0, ahead = 300): ReturnType<typeof createTacticalState> {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * ahead, y: 1500 + hy(bearing) * ahead, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
const tick = (st: ReturnType<typeof createTacticalState>, input: ShipInput) => slewTurrets(st, 0, input);

describe('when a turret slews (W-4 spec §3.4)', () => {
  it('MAN: the gun in hand follows the reticle at 455 / 341 a tick; the other gun is AUTO-driven (no target: back to the nose at 364 / 273); the torpedo selected, both are; no reticle, the gun in hand holds', () => {
    const st = scene([1, 1, 1], 0, 0, 5000), s = st.systems[0]!; s.pewManual = true; s.gunManual = true;   // both switches on MAN; the Hunter 5000 u off: no AUTO solution
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 0]);
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455 - 364, 341]);   // owner 2026-11-19: the pew, out of hand, slews on AUTO
    tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341 - 273]);   // the torpedo selected: both AUTO-driven
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: -1 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 68]);   // the autocannon in hand with no reticle holds
  });
  it('each gun reads its own switch (amendment §2.3): pew pew on MAN and the autocannon on AUTO with the autocannon selected, neither follows the reticle; the autocannon on MAN alone and selected, only it does', () => {
    const st = scene([1, 1, 1], 0, 0, 5000), s = st.systems[0]!; s.pewManual = true;   // no AUTO solution: an AUTO-driven turret stays on the nose
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 0]);   // pew pew is MAN but not selected; the selected autocannon is on AUTO
    s.pewManual = false; s.gunManual = true;
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341]);   // the autocannon in hand, at its MAN traverse
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341 - 273]);   // pew pew selected on AUTO: nothing in hand, and the autocannon goes back toward the nose at its AUTO traverse
  });
  it('MAN: the gun out of hand fights on AUTO: it slews onto its own lead at its AUTO traverse and reports on solution; the gun in hand never reports (owner 2026-11-19)', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!; s.pewManual = true; s.gunManual = true;
    const pewSol = autoSolution(st, 0, 'pew')!, gunSol = autoSolution(st, 0, 'gun')!;
    const pewInHand = { ...IDLE_INPUT, weaponSel: 0, turretAim: 60000 };   // the reticle 5536 steps left of the nose
    let on = tick(st, pewInHand);
    expect([s.pewTurret, s.gunTurret, on.pew, on.gun]).toEqual([-455, 273, false, false]);
    for (let k = 0; k < 10; k++) on = tick(st, pewInHand);
    expect([s.gunTurret, on.gun, on.pew]).toEqual([gunSol, true, false]);
    for (let k = 0; k < 30; k++) on = tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 60000 });
    expect([s.pewTurret, on.pew, on.gun]).toEqual([pewSol, true, true]);   // the torpedo selected: both on AUTO
  });
  it('AUTO is on solution within AUTO_FIRE_TOLERANCE (182 fine steps) of its lead, both sides, and not at 183 (owner 2026-11-19)', () => {
    expect(AUTO_FIRE_TOLERANCE).toBe(182);
    const sol = 6 * 256;   // the Hunter 6 heading steps right, still: the lead is the bearing (the AUTO case below)
    const from = (start: number): boolean => { const st = scene([1, 0, 1], 0, 6); st.systems[0]!.pewTurret = start; return tick(st, IDLE_INPUT).pew; };
    expect([from(sol - 364 - 182), from(sol - 364 - 183), from(sol + 364 + 182), from(sol + 364 + 183)]).toEqual([true, false, true, false]);
  });
  it('AUTO: each powered gun slews onto its lead at 364 / 273 a tick and reports on solution once it sits there', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!;   // the Hunter 6 heading steps (8.4°) right of the nose
    const pewSol = autoSolution(st, 0, 'pew')!, gunSol = autoSolution(st, 0, 'gun')!;
    expect([pewSol, gunSol]).toEqual([6 * 256, 6 * 256]);   // still target, still shooter: the lead is the bearing
    const first = tick(st, IDLE_INPUT);
    expect([s.pewTurret, s.gunTurret, first.pew, first.gun]).toEqual([364, 273, false, false]);
    let on = first;
    for (let k = 0; k < 10; k++) on = tick(st, IDLE_INPUT);
    expect([s.pewTurret, s.gunTurret, on.pew, on.gun]).toEqual([pewSol, gunSol, true, true]);
  });
  it('AUTO: no solution (unseen, out of range, behind a rock, outside the arc) and the turret goes back to the nose', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!;
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    s.bars[3] = 0;   // Sensors 0: sensor range 300 (Engineering spike §10.4); the Hunter at 300 is still seen
    Object.assign(st.ships[1], { x: hx(6) * 400, y: 1500 + hy(6) * 400 });
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // unseen
    s.bars[3] = 1;
    Object.assign(st.ships[1], { x: hx(6) * 700, y: 1500 + hy(6) * 700 });
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // beyond 450 and 600
    Object.assign(st.ships[1], { x: hx(6) * 300, y: 1500 + hy(6) * 300 });
    mover(st, 0, hx(6) * 150, 1500 + hy(6) * 150, 0, 0, 20);
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // a rock in the line
    st.rocks.fill(0);
    Object.assign(st.ships[1], { x: hx(40) * 300, y: 1500 + hy(40) * 300 });   // 56° right: inside the pew's ±60°, outside the autocannon's ±30°
    const e = st.ships[1]!;
    expect(autoSolution(st, 0, 'pew')).toBe(turretOffset(0, pewLead(st, 0, e.x, e.y, 0, 0)));   // 42 × 256: the lead is from the muzzle, 21 u ahead, so bearing 40 from the centre is 42.46 steps from it
    expect(autoSolution(st, 0, 'gun')).toBeNull();
    for (let k = 0; k < 30; k++) tick(st, IDLE_INPUT);
    expect(s.gunTurret).toBe(0);   // no solution: back to the nose
  });
  it('no power, no slew; unattended, both hold; a turning ship carries the turret', () => {
    const st = scene([1, 0, 1], 0, 6), s = st.systems[0]!;
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    expect(s.gunTurret).toBe(0);   // the autocannon on 0 bars holds
    const held = s.pewTurret;
    st.ships[0].heading = 20;
    tick(st, { ...IDLE_INPUT, weapons: false });
    expect(s.pewTurret).toBe(held);   // unattended: the offset holds, so the world aim turned with the nose
    expect(pewAimFine(st, 0)).toBe(turretWorldAim(20, held));
  });
  it('the Valkyrn and the laser fit never slew', () => {
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) {
      const st = createTacticalState(5, 2, cls), s = st.systems[0]!;
      expect(slewTurrets(st, 0, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 })).toEqual({ pew: false, gun: false });
      expect([s.pewTurret, s.gunTurret]).toEqual([0, 0]);
    }
  });
});

describe('rounds along the turrets, and the leads (W-4 spec §3.2, §4.2, §5, §6)', () => {
  it('pewAimFine and gunAimFine are turretWorldAim of their turrets; a pew round and an autocannon round leave along them', () => {
    const st = scene([1, 1, 1], 10), s = st.systems[0]!; s.pewTurret = -2000; s.gunTurret = 3000;
    expect([pewAimFine(st, 0), gunAimFine(st, 0)]).toEqual([turretWorldAim(10, -2000), turretWorldAim(10, 3000)]);
    firePewTrigger(st, 0);
    const p = st.pew.find((r) => r.active)!, [px, py] = aimDir(turretWorldAim(10, -2000));
    expect([p.vx / Math.hypot(p.vx, p.vy), p.vy / Math.hypot(p.vx, p.vy)].map((v) => v.toFixed(9))).toEqual([px, py].map((v) => v.toFixed(9)));
    tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true });
    const g = st.rounds.find((r) => r.active)!, [gx, gy] = aimDir(turretWorldAim(10, 3000));
    expect(g.vx).toBeCloseTo(gx * 700, 9); expect(g.vy).toBeCloseTo(gy * 700, 9);   // still ship: GUN_SPEED along the turret
  });
  it('gunLead uses the velocity relative to the Hound (rounds inherit it); pewLead the target\'s own', () => {
    const st = scene([1, 1, 1], 0, 0, 400);
    Object.assign(st.ships[0], { vx: 200, vy: 0 });
    Object.assign(st.ships[1], { vx: 200, vy: 0 });   // flying in formation: the gun's lead is straight at it
    const e = st.ships[1]!;
    expect(gunLead(st, 0, e.x, e.y, e.vx, e.vy)).toBe(0);
    expect(pewLead(st, 0, e.x, e.y, e.vx, e.vy)).toBeGreaterThan(0);   // the pew leads the target's own motion
  });
  it("gunLead gives none for an intercept past the round's life (W-4 spec §4.2)", () => {
    const st = scene([1, 1, 1], 0, 0, 1000), e = st.ships[1]!;   // 1000 u dead ahead, still: about 1.4 s at GUN_SPEED, past a round's life (its reach is about 607 u)
    expect(gunLead(st, 0, e.x, e.y, 0, 0)).toBe(-1);
    Object.assign(e, { y: 1500 + hy(0) * 400 });   // 400 u: inside its reach
    expect(gunLead(st, 0, e.x, e.y, 0, 0)).toBe(0);
  });
});
```

The two `toFixed(9)` comparisons stand for "equal to nine decimals"; write them as `toBeCloseTo(v, 9)` pairs if preferred.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4Turret.test.ts`
Expected: FAIL (`slewTurrets` / `autoSolution` / `gunLead` not exported).

- [ ] **Step 3: `gunLead`**

In `sim/tactical/gun.ts`, add `import { interceptTime, nearestHeading } from './lead';` and, after `gunAimFine`, add:

```ts
/** W-4 spec §4.2: ship i's autocannon lead on a target at (tx, ty) moving at (tvx, tvy): the fine aim (a whole heading
 *  index × HEADING_COUNT) from the nose point between its muzzles to where a round fired now meets the target holding its
 *  velocity. A gun round inherits the ship's velocity (fireRound), so the velocity relative to ship i is used. −1 without a
 *  gun, without an intercept, or when the intercept comes after the round's life (lifeTicks · DT, in seconds as
 *  interceptTime's). */
export function gunLead(state: TacticalState, i: number, tx: number, ty: number, tvx: number, tvy: number): number {
  const g = classOf(state, i).slots.gun;
  if (!g) return -1;
  const s = state.ships[i]!, mx = s.x + hx(s.heading) * g.muzzleForward, my = s.y + hy(s.heading) * g.muzzleForward;
  const rx = tx - mx, ry = ty - my, vx = tvx - s.vx, vy = tvy - s.vy, t = interceptTime(rx, ry, vx, vy, g.speed);
  if (t < 0 || t > g.lifeTicks * DT) return -1;   // no intercept, or one the round would not live to reach
  const h = nearestHeading(rx + vx * t, ry + vy * t);
  return h < 0 ? -1 : h * HEADING_COUNT;
}
```

(`lead.ts` imports only `direction`, `state` and `tuning`, so there is no cycle. `gun.ts` already imports `DT` from `./tuning`. `interceptTime` returns seconds (`lead.ts` L8), so the life is `lifeTicks · DT`.)

- [ ] **Step 4: The aim seams read the turrets (Decision 1)**

`sim/tactical/gun.ts`: replace W-4a's

```ts
export function gunAimFine(state: TacticalState, i: number): number { return state.ships[i]!.heading * HEADING_COUNT; }
```

with

```ts
export function gunAimFine(state: TacticalState, i: number): number {
  return (((state.ships[i]!.heading * HEADING_COUNT + state.systems[i]!.gunTurret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;   // turret.ts turretWorldAim's formula (no import: turret.ts imports this file)
}
```

and its doc comment's "W-4a: the nose (W-4b adds gunTurret)" → "the nose plus gunTurret (W-4 spec §3.2)". Add `AIM_STEPS` to gun.ts's tuning import.

`sim/tactical/pew.ts`: replace W-4a's

```ts
export function pewAimFine(state: TacticalState, i: number): number { return state.ships[i]!.heading * HEADING_COUNT; }
```

with

```ts
export function pewAimFine(state: TacticalState, i: number): number {
  return (((state.ships[i]!.heading * HEADING_COUNT + state.systems[i]!.pewTurret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;   // turret.ts turretWorldAim's formula
}
```

and its doc comment likewise ("the nose plus pewTurret").

- [ ] **Step 5: AUTO's solutions and the per-tick slew**

In `sim/tactical/tuning.ts`, after `GUN_AUTO_HEAT_STOP` (W-4a), add:

```ts
/** W-4 spec §4.2 (owner 2026-11-19): AUTO is on solution when its turret ends the tick within this many fine steps (1.0°)
 *  of the lead. With the lead's half step the worst aim error is 310 steps, 17.8 u at the autocannon's 600 u (the Hunter's
 *  radius is 20); 182 is also the autocannon's per-tick lag in a 150°/s turn (455 − 273), so a trailing gun still fires. */
export const AUTO_FIRE_TOLERANCE = 182;
```

Append to `sim/tactical/turret.ts` (and extend its imports):

```ts
import { weaponBars, WeaponSlot } from './bars';
import { hasTurret } from './defs';
import { hx, hy } from './direction';
import { lineOfSight } from './geometry';
import { gunLead } from './gun';
import { pewLead, pewMuzzle } from './pew';
import { shipSeen } from './science';
import { classOf, CREW_SLOT, handControl, type TacticalState } from './state';
import { AUTO_FIRE_TOLERANCE, AUTOCANNON_AUTO_RANGE, PEW_RANGE } from './tuning';
import type { ShipInput } from './weapons';   // type only: weapons.ts imports this file

/** W-4 spec §4.2 (owner 2026-11-19): whether a turret at offset `turret` is on AUTO solution `sol`: within
 *  AUTO_FIRE_TOLERANCE fine steps of it (null: no solution). The step's test after the slew, and the view's bracket. */
export function onSolution(turret: number, sol: number | null): boolean {
  return sol !== null && Math.abs(turret - sol) <= AUTO_FIRE_TOLERANCE;
}

/** W-4 spec §4.2: ship i's AUTO solution for its pew or its autocannon: the lead aim's offset from the nose (a whole heading
 *  × 256 less the nose), when the crew's target ship is seen (shipSeen), its centre lies within the gun's AUTO range of the
 *  own centre (PEW_RANGE, AUTOCANNON_AUTO_RANGE), the line from the gun's muzzle to its centre is clear (lineOfSight: the
 *  planet and rocks), it has an intercept and the offset lies inside ±arcSteps. Ship only: never a torpedo (owner
 *  2026-11-19). null otherwise, and on a class without that turret. */
export function autoSolution(state: TacticalState, i: number, gun: 'pew' | 'gun'): number | null {
  const cls = classOf(state, i), def = gun === 'pew' ? cls.slots.pew : cls.slots.gun, turret = def?.turret ?? null;
  if (!def || !turret) return null;
  const j = state.systems[i]!.target, me = state.ships[i]!, e = state.ships[j];
  if (j === i || !e || !e.active || !shipSeen(state, j)) return null;
  const range = gun === 'pew' ? PEW_RANGE : AUTOCANNON_AUTO_RANGE, dx = e.x - me.x, dy = e.y - me.y;
  if (dx * dx + dy * dy > range * range) return null;
  const m = gun === 'pew' ? pewMuzzle(state, i) : { x: me.x + hx(me.heading) * def.muzzleForward, y: me.y + hy(me.heading) * def.muzzleForward };
  if (!lineOfSight(state, m.x, m.y, e.x, e.y)) return null;
  const lead = gun === 'pew' ? pewLead(state, i, e.x, e.y, e.vx, e.vy) : gunLead(state, i, e.x, e.y, e.vx, e.vy);
  if (lead < 0) return null;
  const off = turretOffset(me.heading, lead);
  return off > turret.arcSteps || off < -turret.arcSteps ? null : off;
}

/** Which AUTO guns sit on their solution after this tick's slew (Task 7 fires them). */
export interface AutoOnSolution { pew: boolean; gun: boolean }
const NONE: AutoOnSolution = Object.freeze({ pew: false, gun: false });

/**
 * W-4 spec §3.4: one tick of ship i's turrets, before anything moves (the pre-move heading), from applyWeaponsInput after
 * stepBurst and before tickGun. Only the crew slot of a turret class, only while Weapons is attended; a gun on 0 bars holds.
 * The gun in hand (handControl: its own switch on MAN, and the selected weapon; owner 2026-11-19) slews toward the reticle (input.turretAim)
 * at its MAN traverse, and holds with no reticle. Every other powered gun is AUTO-driven, a MAN one out of hand too: it slews toward its
 * solution (autoSolution) at its AUTO traverse, or back to the nose with none, and reports on solution when it ends
 * within AUTO_FIRE_TOLERANCE of it (onSolution). It slews in the hold too; only firing waits (§4.3, applyWeaponsInput).
 */
export function slewTurrets(state: TacticalState, i: number, input: ShipInput): AutoOnSolution {
  const cls = classOf(state, i);
  if (i !== CREW_SLOT || !hasTurret(cls) || !input.weapons) return NONE;
  const s = state.systems[i]!, heading = state.ships[i]!.heading, out = { pew: false, gun: false };
  for (const gun of ['pew', 'gun'] as const) {
    const turret = (gun === 'pew' ? cls.slots.pew : cls.slots.gun)?.turret ?? null, slot = gun === 'pew' ? WeaponSlot.Pew : WeaponSlot.Autocannon;
    if (!turret || weaponBars(s, slot) < 1) continue;   // no power, no slew
    const now = gun === 'pew' ? s.pewTurret : s.gunTurret;
    let next = now;
    if (handControl(state, i, input.weaponSel, slot)) {   // the gun in hand (W-4c adds the MANUAL flight inside handControl)
      if (input.turretAim < 0) continue;   // no reticle: it holds
      next = slewTurret(now, heading, input.turretAim, turret.traverse[1], turret.arcSteps);
    } else {   // AUTO-driven: AUTO, and in MAN the gun out of hand (taking control never costs firepower)
      const sol = autoSolution(state, i, gun);
      next = slewTurret(now, heading, turretWorldAim(heading, sol ?? 0), turret.traverse[0], turret.arcSteps);
      out[gun] = onSolution(next, sol);
    }
    if (gun === 'pew') s.pewTurret = next; else s.gunTurret = next;
  }
  return out;
}
```

Merge the new imports with the file's existing `./tuning` import (one import per module). Check `science.ts` imports nothing from `weapons.ts` or `turret.ts` (`grep -n "^import" src/renderer/src/sim/tactical/science.ts`); it does not today.

- [ ] **Step 6: The slew in the tick order (spec §8)**

In `sim/tactical/weapons.ts`, add `import { slewTurrets } from './turret';` and replace

```ts
  stepBurst(state, i);
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
```

with

```ts
  stepBurst(state, i);
  slewTurrets(state, i, input);   // W-4 spec §3.4, §8: the turrets slew before the gun and the pew fire (the pre-move heading)
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
```

(Task 7 captures the return value.) Add to `applyWeaponsInput`'s doc comment: "W-4: the turrets slew after the burst, before the gun."

- [ ] **Step 7: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Turret.test.ts tests/w4Autocannon.test.ts tests/w4PewFire.test.ts tests/w4Manual.test.ts tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/duelScripted.test.ts tests/duelGates.test.ts`
Expected: tsc clean; all PASS except the known-red trajectory pins in `duelScripted` (the stand-in pew now flies along the AUTO-slewed pew turret, so whole runs move). `duelGates`' per-seed tests should still pass (the stand-in still fires); if one fails, record it for Task 13 and go on.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/turret.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts tests/w4Turret.test.ts
git commit -m "feat(w4b): the turrets slew: AUTO onto its lead (pewLead, gunLead) within a 182-step tolerance, the gun in hand onto the reticle, the other on AUTO; rounds fly along the turrets (W-4 spec §3.4, §4.2, §5, §6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The reticle, R and Shift+R, and LMB by mode, in both runtimes; the smokes' launch path

**Files:**
- Modify: `src/renderer/src/app/duel/mapRequests.ts`, `app/duel/scene.ts`, `app/duel/duelMode.ts`, `app/duel/runtime.ts`, `app/duel/onlineDuel.ts`, `app/duel/input.ts`, `app/duel/weaponsSeat.ts`, `app/controlsList.ts`, `ui/actions.ts` (the console's `mode`), `ui/duel/WeaponsStation.tsx` (the Hound block's TORPEDO tag), `scripts/network/duel-app-smoke.ts`, `scripts/network/internet-app-smoke.ts` (Decision 12)
- Modify (kind (a) renames): `tests/manualLaserScene.test.ts`, `tests/onlineDuelSession.test.ts` (each `aimLaser` / `laserAim()` / `resetLaserAim` they use). No press is renamed: KeyZ's action stays `laserMode` (Decision 8), so `tests/manualLaserInput.test.ts`, `tests/manualLaserUi.test.tsx` and every `press('laserMode')` stay as they are.
- Modify: `tests/w4Input.test.ts`, `tests/w4Runtime.test.ts`, `tests/w4Online.test.ts`, `tests/w4Ui.test.tsx` (W-4a's files)

**Interfaces:**
- Consumes: W-4a's Hound branches in `runtime.ts` `play` and `onlineDuel.ts` `play` (quoted below from the branch), `weaponsSeatHeld(sel, trigger)`, `sessionHeld(k, d, me, steer, weapons?)`, `heldChanged`, `requests.triggerHeld()` / `DuelRuntimeDeps.triggerHeld?()`, `houndWeaponsSeat`, `refusal(d, 'pew' | 'autocannon')`, `pewSent`, `torpModeBase()` / `torpModeSent`; Task 3's `pewManual` and `gunManual`; Task 4's `gunMode {slot, manual}`.
- Produces: `MapRequests.reticle | reticleAim | resetReticle`; `DuelRuntimeDeps.reticleAim?()`; `KeyAction 'weaponMode' | 'weaponModeAll'`; `KeyEventLike.ctrlKey? | metaKey?`; `ConsoleInput.mode?(slot)`; `KeySample.modeTaps?`; `modeRequests(base, sel, presses, taps)`; `weaponsSeatHeld(sel, trigger, aim = -1)`; `sessionHeld(..., weapons?: { sel; trigger; aim? })`; `gunModeSent` (one per gun slot); the local `gunModeBase(slot)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/w4Input.test.ts` (add `modeRequests` to its `weaponsSeat` import):

```ts
describe('the reticle, R and Shift+R (W-4 spec §9, amendment §2.4, W-4b)', () => {
  it('R is the weaponMode press and Shift+R weaponModeAll; Ctrl+R, Meta+R and a repeat count nothing; Z and V keep their actions', () => {
    expect([PRESS_CODES.KeyR, PRESS_CODES.KeyZ, PRESS_CODES.KeyV]).toEqual(['weaponMode', 'laserMode', 'torpMode']);
    const t = target(), kb = createDuelKeyboard(t);
    const down = (mods: object = {}, repeat = false): void => t.fire('keydown', { ...key('KeyR', repeat), ...mods });
    down(); down();
    expect(kb.sample().presses).toMatchObject({ weaponMode: 2, weaponModeAll: 0 });
    down({ shiftKey: true });
    expect(kb.sample().presses).toMatchObject({ weaponMode: 0, weaponModeAll: 1 });
    down({ ctrlKey: true }); down({ metaKey: true }); down({ shiftKey: true, ctrlKey: true }); down({ shiftKey: true, metaKey: true }); down({}, true);
    expect(kb.sample().presses).toMatchObject({ weaponMode: 0, weaponModeAll: 0 });   // the browser's chords and an OS repeat: no press
  });
  it('a tag click counts a mode tap for its weapon (ConsoleInput.mode); a sample, clearUi and clear drop them', () => {
    const t = target(), kb = createDuelKeyboard(t);
    expect(kb.sample().modeTaps).toEqual([0, 0, 0]);
    kb.ui.mode?.(1); kb.ui.mode?.(1); kb.ui.mode?.(2);
    expect(kb.sample().modeTaps).toEqual([0, 2, 1]);
    expect(kb.sample().modeTaps).toEqual([0, 0, 0]);
    kb.ui.mode?.(0); kb.clearUi(); expect(kb.sample().modeTaps).toEqual([0, 0, 0]);
    kb.ui.mode?.(0); kb.clear(); expect(kb.sample().modeTaps).toEqual([0, 0, 0]);
  });
  it('modeRequests: R flips the selected weapon (the torpedo when it is selected), a tag its own weapon, Shift+R both guns by its rule in all four gun states and never the torpedo', () => {
    const p = (weaponMode = 0, weaponModeAll = 0) => ({ weaponMode, weaponModeAll });
    const A = false, M = true;
    expect(modeRequests([A, A, A], 0, p(1))).toEqual({ modes: [M, A, A], changed: [true, false, false] });
    expect(modeRequests([A, M, A], 1, p(1))).toEqual({ modes: [A, A, A], changed: [false, true, false] });
    expect(modeRequests([A, A, A], 2, p(1))).toEqual({ modes: [A, A, M], changed: [false, false, true] });   // the torpedo selected: its torpMode
    expect(modeRequests([A, A, A], 0, p(2))).toEqual({ modes: [A, A, A], changed: [false, false, false] });   // two presses in one frame flip twice
    expect(modeRequests([A, A, A], 0, p(), [0, 1, 1])).toEqual({ modes: [A, M, M], changed: [false, true, true] });   // each tag is its own switch
    // Shift+R: if either gun is on MAN both go to AUTO, else both go to MAN; only a gun whose mode changes is sent.
    expect(modeRequests([A, A, M], 2, p(0, 1))).toEqual({ modes: [M, M, M], changed: [true, true, false] });
    expect(modeRequests([M, A, A], 0, p(0, 1))).toEqual({ modes: [A, A, A], changed: [true, false, false] });
    expect(modeRequests([A, M, A], 0, p(0, 1))).toEqual({ modes: [A, A, A], changed: [false, true, false] });
    expect(modeRequests([M, M, M], 1, p(0, 1))).toEqual({ modes: [A, A, M], changed: [true, true, false] });
    expect(modeRequests([M, A, A], 0, p(0, 2))).toEqual({ modes: [M, M, A], changed: [false, true, false] });   // twice: both to AUTO, then both to MAN
  });
  it('the map requests keep the latest reticle until reset', () => {
    const r = createMapRequests();
    expect(r.reticleAim()).toBeNull();
    r.reticle(100); r.reticle(16384);
    expect([r.reticleAim(), r.reticleAim()]).toEqual([16384, 16384]);
    r.resetReticle(); expect(r.reticleAim()).toBeNull();
  });
  it('the seat\'s held fields carry the reticle, and gunHeld only with the autocannon selected and the trigger live', () => {
    expect(weaponsSeatHeld(0, false, 16384)).toEqual({ weaponSel: 0, turretAim: 16384 });
    expect(weaponsSeatHeld(1, true, -1)).toEqual({ weaponSel: 1, gunHeld: true });
    expect(weaponsSeatHeld(1, true, 3.5)).toEqual({ weaponSel: 1, gunHeld: true });   // not an integer: no aim
  });
});
```

In `tests/w4Runtime.test.ts` (W-4a's file, its `rig(cls?)`), extend the rig:
- a reticle: add `reticle: number | null = null` beside `trigger`, the dep `reticleAim: () => reticle` beside `triggerHeld`, and `const aim = (v: number | null): void => { reticle = v; };`;
- a tag click: `const tap = (slot: 0 | 1 | 2): void => { const m = [...(keys.modeTaps ?? [0, 0, 0])]; m[slot] = (m[slot] ?? 0) + 1; keys = { ...keys, modeTaps: m }; };`, and add `modeTaps: [0, 0, 0]` to the file's `ONE_FRAME` (so a tap lasts one frame, as a press does);
- return `aim` and `tap` with the others.

**Kind (a), W-4 spec §4.3, §9, amendment §2.4** (each round starts with every switch on AUTO, where LMB does nothing, and V is not read at the Hound's seat):
- In W-4a's case "LMB: pewFire with pew pew selected …", insert `r.press('weaponMode'); r.tick();   // R: pew pew, the selected weapon, to MAN` after the Space check and before the first click, and change `r.set({ selectTo: 2 }); r.press('torpMode'); r.tick();   // MANUAL: no lock or range needed` to `r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick();   // the torpedo selected: R is its torpMode (MANUAL: no lock or range needed)`. Its assertions stay.
- In W-4a's case "the held trigger sends gunHeld only with the autocannon selected …", change `r.hold(false); r.set({ selectTo: 1 }); r.tick(); r.rt.takeRefusals();` to `r.hold(false); r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick(); r.rt.takeRefusals();   // R: the selected autocannon to MAN`. Its assertions stay.
- The laser-fit case keeps `r.press('laserMode')`.

Append:

```ts
describe("the Hound's Weapons seat in W-4b (W-4 spec §4.1, §4.3, §9; amendment §2.4)", () => {
  it('R flips the selected gun, and the torpedo when it is selected; two R presses on separate frames before a tick flip twice', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([true, false, false, ['applied']]);
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, false]);
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, true]);
      r.press('weaponMode'); r.rt.frame(1 / 60); r.press('weaponMode'); r.tick();   // the second is judged from the first's queued torpMode
      expect([sys.torpManual, r.statuses()]).toEqual([true, ['applied', 'applied']]);
    } finally { r.rt.dispose(); }
  });
  it('Shift+R sets both guns together in all four gun states, sends gunMode only for a gun that changes and never torpMode', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([true, true, false, ['applied', 'applied']]);   // AUTO / AUTO: both to MAN
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, r.statuses()]).toEqual([false, false, ['applied', 'applied']]);   // MAN / MAN: both to AUTO
      r.press('weaponMode'); r.tick();   // MAN / AUTO
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, r.statuses()]).toEqual([false, false, ['applied']]);   // either on MAN: both to AUTO, one command
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick();   // AUTO / MAN
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([false, false, false, ['applied']]);
    } finally { r.rt.dispose(); }
  });
  it("Z and V queue nothing at the Hound's Weapons seat, and still work on the laser fit's, where R does nothing", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('laserMode'); r.press('torpMode'); r.tick();
      expect([r.statuses(), sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([[], false, false, false]);
    } finally { r.rt.dispose(); }
    const f = rig(ShipClass.ValkyrnLaser), fs = f.d.tactical.systems[0];
    try {
      f.press('laserMode'); f.press('torpMode'); f.tick(); expect([fs.laserManual, fs.torpManual]).toEqual([true, true]);
      f.press('weaponMode'); f.press('weaponModeAll'); f.tap(2); f.tick(); expect([f.statuses(), fs.laserManual, fs.torpManual]).toEqual([[], true, true]);
    } finally { f.rt.dispose(); }
  });
  it('a tag click (a mode tap) flips its own weapon, whatever is selected', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.tap(1); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([false, true, false]);   // pew pew is selected; the autocannon's tag is its own switch
      r.tap(2); r.tap(0); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, true]);
    } finally { r.rt.dispose(); }
  });
  it("a left click fires pew pew only while its own switch is MAN, whatever the autocannon's is; on AUTO it queues nothing and refuses nothing", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick();   // the autocannon on MAN; pew pew still on AUTO
      r.set({ selectTo: 0 }); r.tick(); r.rt.takeRefusals();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses(), r.rt.takeRefusals()]).toEqual([0, [], []]);
      r.press('weaponMode'); r.tick();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses()]).toEqual([1, ['applied']]);
    } finally { r.rt.dispose(); }
  });
  it("the held trigger puts gunHeld only while the autocannon's own switch is MAN; on AUTO it refuses nothing; a dead trigger on MAN refuses NO POWER", () => {
    const r = rig();
    try {
      r.press('weaponMode'); r.tick();   // pew pew on MAN: not the autocannon's switch
      r.set({ selectTo: 1 }); r.tick(); r.rt.takeRefusals();
      r.hold(true); r.tick();
      expect([r.rt.held()[0]!.gunHeld, r.rt.takeRefusals()]).toEqual([undefined, []]);
      r.hold(false); r.press('weaponMode'); r.tick(); r.rt.takeRefusals();
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'autocannon', reason: 'NO POWER' });
    } finally { r.rt.dispose(); }
  });
  it('the held frame carries turretAim from deps.reticleAim, and none while it returns null', () => {
    const r = rig();
    try {
      r.aim(12000); r.tick(); expect(r.rt.held()[0]!.turretAim).toBe(12000);
      r.aim(null); r.tick(); expect(r.rt.held()[0]!.turretAim).toBeUndefined();
    } finally { r.rt.dispose(); }
  });
});
```

Append to `tests/w4Online.test.ts` (W-4a's file already imports `heldChanged` and declares `N`, the empty held frame):

```ts
describe('the online reticle and mode (W-4 spec §11, W-4b)', () => {
  it('a change of the reticle alone is a held change (the latency stamp); the same reticle is not', () => {
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0, turretAim: 5000 })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0 })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0, turretAim: 4000 })).toBe(false);
  });
  it('sessionHeld carries turretAim at the Hound\'s Weapons seat only', () => {
    const d = createSeatedDuel(CUTTER, 5), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      const g = 1 - d.helmPlayer;
      expect(sessionHeld(K, d, g, -1, { sel: 0, trigger: false, aim: 4000 })).toMatchObject({ weaponSel: 0, turretAim: 4000 });
      expect(sessionHeld(K, d, d.helmPlayer, -1, { sel: 0, trigger: false, aim: 4000 })).not.toHaveProperty('turretAim');
      expect(sessionHeld(K, fit, 1 - fit.helmPlayer, -1, { sel: 0, trigger: false, aim: 4000 })).not.toHaveProperty('turretAim');
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
});
```

In `tests/onlineDuelSession.test.ts`:
- add `reticle(aim: number): void;` to both `requests` type literals (in `h`'s `sceneOpts` type and in the mocked `createDuelScene`'s `opts` type; the rename below turns their `aimLaser` into `reticle`, so it is that entry);
- give the rig's `key` an optional third argument for the modifiers: `key(type: 'keydown' | 'keyup', code: string, mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) { win.dispatch(type, { code, repeat: false, preventDefault() {}, ...mods }); },`.

**Kind (a), W-4 spec §4.3, amendment §2.4** (on AUTO a click and the trigger send nothing):
- In "the online pew (W-1 review F2)", both cases click the map from the Hound's Weapons seat. After each case's first `r.session.frame();` add `r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump();   // W-4b: pew pew, the selected weapon, to MAN, where the click fires`. Their assertions stay (the `ids` and `commands()` lists stay aligned: the `gunMode` is one more entry in both). The second case's seat-0 part is unchanged.
- In "the online Hound Weapons seat (W-4 spec §11)": case (1) "2 selects the autocannon: the held trigger rides the frame as gunHeld …" taps R after 2 (`tapKey(r, 'Digit2'); tapKey(r, 'KeyR'); h.sceneOpts[0]!.requests!.trigger(true); r.pump(); r.session.frame();`: the autocannon selected and on MAN in the same pump); case (2) "with pew pew selected (the default) the map click sends pewFire {} …" gets `tapKey(r, 'KeyR'); r.pump();` after its `r.session.frame();`. Their assertions stay.

Then add, in the same block:

```ts
  it('R sends gunMode for the selected gun; a second R before the result flips back (from gunModeSent for that slot)', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const modes = () => c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode');
    tapKey(r, 'KeyR'); r.pump(); tapKey(r, 'KeyR'); r.pump();
    expect(modes()).toEqual([{ kind: 'gunMode', slot: 0, manual: true }, { kind: 'gunMode', slot: 0, manual: false }]);
    tapKey(r, 'Digit2'); tapKey(r, 'KeyR'); r.pump();
    expect(modes().at(-1)).toEqual({ kind: 'gunMode', slot: 1, manual: true });   // the autocannon's own switch; pew pew's in-flight mode is untouched
    tapKey(r, 'Digit3'); tapKey(r, 'KeyR'); r.pump();
    expect(modes().at(-1)).toEqual({ kind: 'torpMode', manual: true });   // the torpedo selected: R is its torpMode
    r.dispose();
  });
  it('Shift+R sends both guns to AUTO when either is on MAN (only the one that changes), else both to MAN, and never torpMode; Ctrl+R sends nothing', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const modes = () => c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode');
    const shiftR = (): void => { r.key('keydown', 'KeyR', { shiftKey: true }); r.key('keyup', 'KeyR', { shiftKey: true }); r.pump(); };
    shiftR();
    expect(modes()).toEqual([{ kind: 'gunMode', slot: 0, manual: true }, { kind: 'gunMode', slot: 1, manual: true }]);
    tapKey(r, 'KeyR'); r.pump();   // pew pew back to AUTO: the autocannon is still on MAN in flight
    shiftR();
    expect(modes().slice(3)).toEqual([{ kind: 'gunMode', slot: 1, manual: false }]);
    r.key('keydown', 'KeyR', { ctrlKey: true }); r.key('keyup', 'KeyR', { ctrlKey: true }); r.pump();
    expect(modes()).toHaveLength(4);
    r.dispose();
  });
  it('Z and V send nothing from the Hound\'s Weapons seat', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    tapKey(r, 'KeyZ'); tapKey(r, 'KeyV'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode' || x.kind === 'laserMode')).toEqual([]);
    r.dispose();
  });
  it('on AUTO a left click with pew pew selected sends nothing; after R it sends pewFire {}', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
    tapKey(r, 'KeyR'); r.pump();
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([{ kind: 'pewFire' }]);
    r.dispose();
  });
  it('the held frame follows the reticle, pump by pump (the latest kept, not drained)', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    h.sceneOpts[0]!.requests!.reticle(4000); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 4000 });
    r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 4000 });   // no new pointer sample: the last reticle stands
    h.sceneOpts[0]!.requests!.reticle(5000); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 5000 });
    r.dispose();
  });
```

The pump sends a held frame every pump whether or not it changed (`client.held` each pump; `heldChanged` only stamps the change for the latency report), so a rising `c.helds()` count proves nothing. The "a reticle change alone is a held change" rule is `heldChanged`'s, tested as a unit in `tests/w4Online.test.ts` (above).

Append to `tests/w4Ui.test.tsx`:

```tsx
describe("the Hound block's TORPEDO tag and the mode keys' rows (amendment §2.4, §2.5)", () => {
  it('a click on the TORPEDO tag flips the torpedo through the mode channel (mode(2)), not the V press', () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, torpManual: false }))));
    fireEvent.pointerDown(q('[data-testid="console-torp-mode"]')!, { button: 0 });
    expect(i.mode).toHaveBeenCalledWith(2);
    expect(i.press).not.toHaveBeenCalled();
  });
  it("the laser block's TORPEDO tag still presses torpMode", () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, torpManual: false, pew: undefined }))));
    fireEvent.pointerDown(q('[data-testid="console-torp-mode"]')!, { button: 0 });
    expect(i.press).toHaveBeenCalledWith('torpMode');
    expect(i.mode).not.toHaveBeenCalled();
  });
  it('the controls list has R and Shift+R from the tables, and the Z and V rows are the laser fit\'s', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'R')?.action).toMatch(/^At Weapons, switch the selected weapon between AUTO and MAN/);
    expect(rows.find((r) => r.keys === 'Shift+R')?.action).toMatch(/^At Weapons, switch both guns together/);
    expect(rows.find((r) => r.keys === 'Z')?.action).toMatch(/^With the laser fit at Weapons/);
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/^With the laser fit at Weapons/);
    expect(rows.some((r) => r.keys === '')).toBe(false);   // weaponModeAll has no code of its own: no row without keys
    expect(rows).toContainEqual({ keys: 'Mouse', action: "At Weapons, the reticle: the selected gun's turret follows it, inside its arc (MAN)" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/w4Ui.test.tsx`
Expected: FAIL (`PRESS_CODES.KeyR` is undefined; no `reticle`, `modeRequests` or `modeTaps`; `weaponsSeatHeld` has no third argument; the TORPEDO tag presses `torpMode`).

- [ ] **Step 3: The reticle requests**

`app/duel/mapRequests.ts`: rename `aimLaser(aim)` → `reticle(aim)`, `laserAim()` → `reticleAim()`, `resetLaserAim()` → `resetReticle()` (the interface, the docs and `createMapRequests`; the closure variable `laserAim` → `reticleAim`), and update the docs: "W-2, W-4 spec §9: the reticle: the pointer's latest fine bearing on the open Weapons map (the laser fit's MANUAL laser fires along it; the Hound's MAN gun turret follows it), kept until a new round."

`app/duel/scene.ts`:
- `options.requests?.resetLaserAim();` → `options.requests?.resetReticle();`;
- in the `laserPointer` gate, replace `classOf(d.tactical, CREW_SLOT).slots.laser !== null` with `(classOf(d.tactical, CREW_SLOT).slots.laser !== null || hasTurret(classOf(d.tactical, CREW_SLOT)))`, rename `laserPointer` → `reticlePointer`, and `options.requests?.aimLaser(...)` → `options.requests?.reticle(...)`; update the comment ("W-2, W-4 spec §9: the reticle follows the pointer on the open Weapons map, for the laser fit's MANUAL laser and the Hound's turrets");
- in the combat input, `laserAim: ... options.requests?.laserAim() ?? null ...` → `options.requests?.reticleAim() ?? null` (the field name `laserAim` on `CombatModelInput` stays: it is the laser line's).

`app/duel/duelMode.ts`: `laserAim: () => requests.laserAim()` → `reticleAim: () => requests.reticleAim()`.

`app/duel/runtime.ts`: `DuelRuntimeDeps.laserAim?(): number | null;` → `reticleAim?(): number | null;` (doc: "W-2, W-4: the reticle (mapRequests reticleAim)"), and `deps.laserAim?.()` → `deps.reticleAim?.()`.

`app/duel/onlineDuel.ts`: `const laserAimNow = (): number | null => requests.laserAim();` → `const reticleNow = (): number | null => requests.reticleAim();   // W-2, W-4: the reticle (kept, not drained)`, and its use `laserAimNow()` → `reticleNow()`. **Inside `pump` and `play` the name `requests` is the ContactRequests**; read the map requests only through closures declared beside `reticleNow` (`takeSteer0` is the precedent). W-4a declares `const triggerNow = (): boolean => requests.triggerHeld();` there and uses it in `play` and `pump`.

Rename the uses in `tests/manualLaserScene.test.ts` and the `onlineDuelSession.test.ts` fakes (`aimLaser` → `reticle`, `laserAim()` → `reticleAim()`, `resetLaserAim()` → `resetReticle()`), kind (a), citing W-4 spec §9.

- [ ] **Step 4: R, Shift+R and the tags' channel (Decisions 8 and 18)**

`app/duel/input.ts`:
1. In `KeyAction`, after `'torpMode'` add `| 'weaponMode' | 'weaponModeAll'`, and add to its doc comment: "W-4 amendment §2.4: R flips the selected weapon's AUTO / MAN at the Hound's Weapons seat (`weaponMode`), and with Shift held it sets both guns together (`weaponModeAll`, which has no code of its own); Z and V stay the laser fit's."
2. In `PRESS_CODES`, after `KeyV: 'torpMode',` add `KeyR: 'weaponMode',`.
3. In `emptyPresses`, after `torpMode: 0,` add `weaponMode: 0, weaponModeAll: 0,`.
4. `interface KeyEventLike { code: string; repeat: boolean; shiftKey?: boolean; preventDefault(): void }` becomes `interface KeyEventLike { code: string; repeat: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault(): void }`.
5. In `down`, between the Shift+W line and the last `else`, add one branch, so the three lines read:

```ts
    else if (e.code === MOVE_CODES.up && e.shiftKey === true) { if (!e.repeat) throttleTo = THROTTLE_MAX; }   // Feel-ii §1.4: Shift+W is full burn
    else if (PRESS_CODES[e.code] === 'weaponMode') { if (!e.repeat && e.ctrlKey !== true && e.metaKey !== true) presses[e.shiftKey === true ? 'weaponModeAll' : 'weaponMode']++; }   // W-4 amendment §2.4: R, and Shift+R for both guns; Ctrl+R and Meta+R are the browser's, so they count nothing
    else { const action = PRESS_CODES[e.code]; if (action && !e.repeat) presses[action]++; }
```

6. In `ConsoleInput`, after `select?(slot: 0 | 1 | 2): void;` add:

```ts
  /** W-4 amendment §2.5: a click on a card's AUTO / MAN tag on the Hound's block (0 pew pew, 1 the autocannon, 2 the
   *  torpedo): each tag is its own switch. Optional, as select. */
  mode?(slot: 0 | 1 | 2): void;
```

7. In `KeySample`, after the `freqKeyTo?` / `gunFreqKeyTo?` / `selectTo?` line add:

```ts
  /** W-4 amendment §2.5: the tag clicks since the previous sample, per weapon [pew pew, the autocannon, the torpedo];
   *  absent means none. createDuelKeyboard always sets it. Read only at the Hound's Weapons seat. */
  modeTaps?: readonly number[];
```

8. In `createDuelKeyboard`: beside `let freqKeyTo …` declare `let modeTaps = [0, 0, 0];`; in `consoleInput`, after `select(slot) { selectTo = slot; },` add `mode(slot) { modeTaps[slot] = (modeTaps[slot] ?? 0) + 1; },`; in `sample()`, add `modeTaps` to the `out` literal (after `selectTo`) and `modeTaps = [0, 0, 0];` to the reset line under it; in `clearUi` and in `clear`, add `modeTaps = [0, 0, 0];`.

`app/web/pageGuards.ts` needs no edit: `GUARDED_CODES` takes every `PRESS_CODES` key, and the guard already leaves Ctrl, Meta and Alt chords to the browser.

`ui/actions.ts`: in `consoleActions`, after `select: (slot) => consoleInput?.select?.(slot)   // W-4 spec §10: a card click selects` add `,` to that entry and the line `mode: (slot) => consoleInput?.mode?.(slot)   // W-4 amendment §2.5: a tag click`.

`ui/duel/WeaponsStation.tsx`: the file has two identical `torp-mode` Buttons. In the first, the one inside `HoundWeapons`, change `onPress={() => actions.console.press('torpMode')}` to `onPress={() => actions.console.mode?.(2)}` (the Hound's seat no longer reads the `torpMode` press, Decision 8). The second, in the laser block, stays. Add to the file's header comment: "W-4 amendment §2.5: on the Hound's block the TORPEDO tag flips the torpedo through the console's mode channel (R with the torpedo selected does the same)."

`app/duel/weaponsSeat.ts`: add (the file already imports `KeyAction`):

```ts
/** W-4 amendment §2.4, §2.5: the mode changes one frame asks for at the Hound's Weapons seat. `base`: each weapon's mode the
 *  app judges from, [pew pew, the autocannon, the torpedo] (the latest queued or sent for it, else the state's). In order:
 *  each Shift+R press sets both guns together (both to AUTO if either is on MAN, else both to MAN; the torpedo is not
 *  touched); each R press flips the selected weapon `sel`; each tag click (`taps`, per weapon) flips its own weapon.
 *  Returns the modes after the frame and which weapons changed: a command goes only for a weapon whose mode changes. */
export function modeRequests(base: readonly [boolean, boolean, boolean], sel: number, presses: Pick<Record<KeyAction, number>, 'weaponMode' | 'weaponModeAll'>, taps: readonly number[] = []): { modes: [boolean, boolean, boolean]; changed: [boolean, boolean, boolean] } {
  const modes: [boolean, boolean, boolean] = [base[0], base[1], base[2]];
  const flip = (w: number): void => { if (w === 0 || w === 1 || w === 2) modes[w] = !modes[w]; };
  for (let n = 0; n < presses.weaponModeAll; n++) { const man = !(modes[0] || modes[1]); modes[0] = man; modes[1] = man; }
  for (let n = 0; n < presses.weaponMode; n++) flip(sel);
  for (let w = 0; w < WEAPON_COUNT; w++) for (let n = 0; n < (taps[w] ?? 0); n++) flip(w);
  return { modes, changed: [modes[0] !== base[0], modes[1] !== base[1], modes[2] !== base[2]] };
}
```

`app/controlsList.ts`:
1. In `DUEL_ACTION`, replace the `laserMode` and `torpMode` entries with these four (Decision 24):

```ts
  laserMode: 'With the laser fit at Weapons, switch the laser between AUTO (it fires at its target by itself) and MANUAL (Space fires it along the map aim)',
  torpMode: 'With the laser fit at Weapons, switch the torpedo between AUTO (it homes on its target) and MANUAL (F launches it with no target; A/D and the right mouse fly it)',
  weaponMode: 'At Weapons, switch the selected weapon between AUTO and MAN: a gun on AUTO aims and fires by itself, and on MAN it follows the reticle and fires on the left button while it is selected; the torpedo on MANUAL launches with no target',
  weaponModeAll: 'At Weapons, switch both guns together: both to AUTO if either is on MAN, else both to MAN (the torpedo keeps its mode)',
```

2. In the loop over `DUEL_ACTION`, add `|| action === 'weaponModeAll'` to the `continue` condition (it has no code of its own), and after `duel.push({ keys, action: DUEL_ACTION[action] });` add `if (action === 'weaponMode') duel.push({ keys: `Shift+${keys}`, action: DUEL_ACTION.weaponModeAll });   // W-4 amendment §2.4: written from R's own code`.
3. After W-4a's three Weapons rows (the `duel.push({ keys: …, action: 'At Weapons, select a weapon' }, …)` call), add: `duel.push({ keys: 'Mouse', action: "At Weapons, the reticle: the selected gun's turret follows it, inside its arc (MAN)" });`.

- [ ] **Step 5: The seat's held fields**

`app/duel/weaponsSeat.ts`: replace W-4a's `weaponsSeatHeld` with

```ts
/** The seat's held fields: the selection, the reticle as turretAim (an integer 0..65535, else none) and the trigger as
 *  gunHeld only while the autocannon is selected (W-4b: callers pass `trigger && the autocannon's own mode is MAN`, so an
 *  AUTO autocannon sends none). */
export function weaponsSeatHeld(sel: number, trigger: boolean, aim = -1): Pick<HeldInput, 'weaponSel' | 'gunHeld' | 'turretAim'> {
  return { weaponSel: sel, ...(Number.isInteger(aim) && aim >= 0 && aim < 65536 ? { turretAim: aim } : {}), ...(trigger && sel === WeaponSlot.Autocannon ? { gunHeld: true } : {}) };
}
```

- [ ] **Step 6: Single player's Hound branch (Decisions 7, 8 and 18)**

In `app/duel/runtime.ts` (add `modeRequests` to the `./weaponsSeat` import):

1. After `torpModeBase`, add:

```ts
  /** W-4 amendment §2.4: the active player's latest queued gunMode for gun `slot` (0 pew pew, 1 the autocannon), else the
   *  sim's flag (as torpModeBase). */
  const gunModeBase = (slot: 0 | 1): boolean => {
    const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'gunMode' && x.command.slot === slot)?.command;
    return c && c.kind === 'gunMode' ? c.manual : slot === 0 ? d.tactical.systems[0].pewManual : d.tactical.systems[0].gunManual;
  };
```

2. In W-4a's Hound branch, replace the two lines that read V

```ts
      let torpManual = torpModeBase();
      if (p.torpMode % 2 === 1) { torpManual = !torpManual; queue({ kind: 'torpMode', manual: torpManual }); }
```

   (the pair inside `if (houndWeaponsSeat(d, active)) {`; the laser class's branch below has the same pair and keeps it) with

```ts
      // W-4 amendment §2.4, §2.5: R flips the selected weapon's switch (a gun's gunMode; the torpedo's torpMode when it is
      // selected), Shift+R sets both guns together, and a tag click flips its own weapon; each judged from the latest queued
      // mode, else the sim's. Z and V (p.laserMode, p.torpMode) are not read at this seat.
      const mode = modeRequests([gunModeBase(0), gunModeBase(1), torpModeBase()], weaponSel, p, k.modeTaps);
      for (const slot of [0, 1] as const) if (mode.changed[slot]) queue({ kind: 'gunMode', slot, manual: mode.modes[slot] });
      if (mode.changed[2]) queue({ kind: 'torpMode', manual: mode.modes[2] });
      const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];
```

   (`torpManual` keeps its name, so the launch lines under it read it as before.)
3. Replace W-4a's `if (pew !== null && weaponSel === WeaponSlot.Pew) {` in that branch with `if (pew !== null && weaponSel === WeaponSlot.Pew && pewManual) {   // W-4 spec §4.3: on AUTO the click does nothing`, and W-4a's `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon) {` with `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunManual) {`.
4. Change W-4a's closing comment `// Space and Z do nothing here in W-4a (Z's gunMode is W-4b's)` to `// Space, Z and V do nothing here (W-4 amendment §2.4)`.
5. In `frame`, replace W-4a's `weaponsSeatHeld(weaponSel, deps.triggerHeld?.() ?? false)` with `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(1), deps.reticleAim?.() ?? -1)` (the trigger is the autocannon's, so it reads slot 1's mode).

- [ ] **Step 7: The online Hound branch**

In `app/duel/onlineDuel.ts` (add `modeRequests` to the `./weaponsSeat` import):

1. Above `createOnlineDuelSession`, declare the shape, and beside `laserModeSent` the two slots:

```ts
/** A mode this seat asked for, until its result comes back. */
type ModeSent = { manual: boolean; sequence: number; round: number };
```

```ts
  // W-4 spec §4.1, §11, amendment §2.4: each gun's mode this seat last asked for, [pew pew, the autocannon], until its result
  // comes back (as laserModeSent): the base R, Shift+R and the tags build on, so two quick presses flip twice.
  let gunModeSent: [ModeSent | null, ModeSent | null] = [null, null];
```

2. In `observe`'s result loop, beside the `laserModeSent` clear, add `for (const slot of [0, 1] as const) { const sent = gunModeSent[slot]; if (sent && result.id.player === descriptor.seatId && result.id.sequence === sent.sequence) gunModeSent[slot] = null; }   // W-4: the replica is the base again`.
3. Everywhere `torpModeSent = null` is reset (the sit and the stand in `play`, the attach), also set `gunModeSent = [null, null];`. In `pump`, after the `torpModeSent` round check add `for (const slot of [0, 1] as const) { const sent = gunModeSent[slot]; if (sent && d && d.round !== sent.round) gunModeSent[slot] = null; }   // W-4: every round starts AUTO`.
4. In W-4a's online Hound branch, replace the two lines that read V

```ts
      let torpManual = torpModeSent ? torpModeSent.manual : sys0.torpManual;
      if (p.torpMode % 2 === 1) { torpManual = !torpManual; const id = send({ kind: 'torpMode', manual: torpManual }); if (id) torpModeSent = { manual: torpManual, sequence: id.sequence, round: d.round }; }
```

   (the first of the two such pairs, the one with `sys0`; the laser class's pair below reads `sys` and stays) with

```ts
      // W-4 amendment §2.4, §2.5: R, Shift+R and the tags, each weapon judged from the mode in flight for it, else the
      // replica's. Z and V are not read at this seat.
      const mode = modeRequests([gunModeSent[0] ? gunModeSent[0].manual : sys0.pewManual, gunModeSent[1] ? gunModeSent[1].manual : sys0.gunManual, torpModeSent ? torpModeSent.manual : sys0.torpManual], weaponSel, p, k.modeTaps);
      for (const slot of [0, 1] as const) if (mode.changed[slot]) { const id = send({ kind: 'gunMode', slot, manual: mode.modes[slot] }); if (id) gunModeSent[slot] = { manual: mode.modes[slot], sequence: id.sequence, round: d.round }; }
      if (mode.changed[2]) { const id = send({ kind: 'torpMode', manual: mode.modes[2] }); if (id) torpModeSent = { manual: mode.modes[2], sequence: id.sequence, round: d.round }; }
      const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];
```

   and gate its pew click on `pewManual` and its dead-trigger refusal on `gunManual`, exactly as Step 6.3 does (`if (pew !== null && weaponSel === WeaponSlot.Pew && pewManual) {` and `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunManual) {`). Change the branch's closing comment as Step 6.4 does.
5. `sessionHeld`: change the `weapons` parameter's type to `{ sel: number; trigger: boolean; aim?: number }` and its spread to `weaponsSeatHeld(weapons.sel, weapons.trigger, weapons.aim ?? -1)`; extend its doc ("and the reticle as turretAim").
6. In `pump`, replace W-4a's `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() })` with

```ts
sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent[1] ? gunModeSent[1].manual : d.tactical.systems[0].gunManual), aim: reticleNow() ?? -1 })
```

7. `heldChanged`: add `|| a.turretAim !== b.turretAim` (comment "W-4b").

- [ ] **Step 8: The smokes (Decision 12, amendment §6)**

In `scripts/network/duel-app-smoke.ts`, in W-4a's step 5:
1. Immediately before `const before = [latest(await status(h)), latest(await status(g))];` add:

```ts
    await press(h, 'R'); await delay(500);   // W-4 spec §4.3, amendment §2.4 (W-4b): pew pew, the selected weapon, to MAN, so no AUTO round can fire in the quiet check (the autocannon has no bar yet)
```

2. Replace `await press(h, 'V'); await delay(300); await press(h, 'F');` with:

```ts
    await press(h, '3'); await delay(300); await press(h, 'R'); await delay(300); await press(h, 'F');   // W-4 amendment §2.4: V is retired at the Hound's seat: select the torpedo, R to MANUAL, F
```

3. In the step's comment, change "then sets the torpedo MANUAL (V) and launches it (F, no lock or range)" to "then selects the torpedo (3), sets it MANUAL (R) and launches it (F, no lock or range)", and add "(pew pew on MAN)" after "presses Space".

In `scripts/network/internet-app-smoke.ts`:
1. In `duelRun`, replace `await hold(guest,'V',120);await pause(300);await hold(guest,'F',120);` with `await hold(guest,'3',120);await pause(300);await hold(guest,'R',120);await pause(300);await hold(guest,'F',120);` and change the line's comment's "a MANUAL torpedo launches with no lock or range" to "a MANUAL torpedo (select it, R, F: amendment §2.4) launches with no lock or range".
2. In `deviceDuelRun`, replace `else {await hold(app,'V',120);await pause(300);await hold(app,'F',120);}` with `else {await hold(app,'3',120);await pause(300);await hold(app,'R',120);await pause(300);await hold(app,'F',120);}`.

The key names are the Electron driver's (`'3'` gives the code `Digit3`, `'R'` gives `KeyR`), as `'V'` and `'F'` are today. The internet smoke needs the Cloudflare service and, for the device run, a second machine, so it is the owner's to run; this task proves it by `npx tsc -b`.

- [ ] **Step 9: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/w4Ui.test.tsx tests/onlineDuelSession.test.ts tests/manualLaserScene.test.ts tests/manualLaserInput.test.ts tests/manualLaserUi.test.tsx tests/manualTorpedoInput.test.ts tests/manualTorpedoUi.test.tsx tests/duelCheckpoint.test.ts tests/duelRuntime.test.ts tests/settingsAndControls.test.ts tests/scienceInput.test.ts tests/internetAppReport.test.ts`
Expected: tsc clean; all PASS (a `duelCheckpoint` whole-run pin may stay known-red). A test that fires the Hound's pew pew or autocannon from a click or the trigger with the switch on AUTO, or flips the Hound's torpedo with the `torpMode` press, is kind (a) (W-4 spec §4.3, amendment §2.4): put the gun on MAN first (`press('weaponMode')` with it selected), or press `weaponMode` with the torpedo selected; list each in the commit body. Then `npm run test:duel-app-runtime`: the smoke passes.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/controlsList.ts src/renderer/src/ui/actions.ts src/renderer/src/ui/duel/WeaponsStation.tsx scripts/network/duel-app-smoke.ts scripts/network/internet-app-smoke.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/w4Ui.test.tsx tests/onlineDuelSession.test.ts tests/manualLaserScene.test.ts <each kind (a) test fixed in Step 9>
git commit -m "feat(w4b): the reticle drives turretAim; R flips the selected weapon's AUTO / MAN and Shift+R both guns (gunMode per slot), Z and V are not read at the Hound's seat; LMB fires a gun only while its own switch is MAN, local and online; the smokes launch a MANUAL torpedo by 3, R, F (W-4 spec §4.1, §4.3, §9, §11; amendment §2.4, §2.6, §6)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: AUTO fires: the pew on each third, the autocannon to 80 % heat, nothing in the hold; the scripted gunner on AUTO

**Files:**
- Modify: `src/renderer/src/sim/tactical/gun.ts` (`tickGun`), `sim/tactical/pew.ts` (`pewAutoReady`), `sim/tactical/weapons.ts` (`applyWeaponsInput`), `sim/tactical/tuning.ts` (`AUTOCANNON_ARC_COS`), `sim/duel/step.ts` (`pewFire`'s AUTO refusal), `sim/duel/scripted.ts` (`houndGunner`, `helmAxes`' line-up)
- Create: `tests/w4Auto.test.ts`
- Modify: `tests/w4Manual.test.ts`, `tests/duelScripted.test.ts` (kind (a): W-4a's stand-in tests and the Helm line-up's geometry), `tests/w4PewFire.test.ts`, `tests/w4Autocannon.test.ts`, `tests/w4Turret.test.ts` (kind (a): AUTO ignores the held trigger, Step 4)

**Interfaces:**
- Consumes: `slewTurrets` → `AutoOnSolution` (Task 5), `handControl` (Task 4), `enemyHostile(t)` (science.ts L29), `GUN_AUTO_HEAT_STOP`, `AUTOCANNON_AUTO_RANGE` (tuning.ts), Task 4's `tickGun` lines (quoted in Step 3), W-4a's `houndGunner` and `helmAxes` line-up (quoted in Step 5), W-4a's `pewFire` admission block (quoted in Step 4).
- Produces: `tickGun(state, i, input, auto = false)`; `pewAutoReady(state, i): boolean` (pew.ts); `AUTOCANNON_ARC_COS` (tuning.ts).

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §4.2, §4.3: AUTO fires only at a seen, hostile enemy ship in range, arc and line of sight, on solution, attended
// and powered: the pew one round each time a third has charged, never a burst (Decision 4), the autocannon at its interval until 80 % heat (it never
// locks; it settles at the cooling rate); in the hold (hostileAt −1) both track and fire nothing, and the first AUTO round
// comes the tick after a crew shot or the clock ends the hold; a torpedo crossing a round aimed at the ship is still hit.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { pewAutoReady, pewGain, stepPew } from '../src/renderer/src/sim/tactical/pew';
import { pewThird } from '../src/renderer/src/sim/tactical/defs';
import { classOf, createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { hostilityStep } from '../src/renderer/src/sim/tactical/science';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { AUTOCANNON } from '../src/renderer/src/sim/tactical/defs';
import { GUN_AUTO_HEAT_STOP, PEW_RECHARGE_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { houndWeapons } from './helpers/crewWeapons';
import { mover } from './helpers/rockArena';

/** The Hound at (0, 1500) nose north, still; the Hunter `ahead` u along heading `bearing`; no rocks; hostile unless `hold`. */
function scene(bars: readonly [number, number, number], bearing = 0, ahead = 300, hold = false): TacticalState {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * ahead, y: 1500 + hy(bearing) * ahead, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.hostileAt = hold ? -1 : 0;
  st.events = [];
  return st;
}
/** One weapons tick of the crew (applyWeaponsInput then tickWeapons); returns the gunFire / pewFire events of the tick. */
function tick(st: TacticalState, input: ShipInput = IDLE_INPUT): { gun: number; pew: number } {
  st.events = []; applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input);
  return { gun: st.events.filter((e) => e.kind === 'gunFire').length, pew: st.events.filter((e) => e.kind === 'pewFire').length };
}

describe('AUTO firing (W-4 spec §4.3)', () => {
  it('the pew: one round from full, then one round per charged third (60 ticks at 1 bar); never a burst (Decision 4)', () => {
    const st = scene([1, 0, 1]), at: number[] = [];
    for (let k = 0; k < 400; k++) if (tick(st).pew) at.push(k);
    expect(at.length).toBeGreaterThanOrEqual(6);
    expect(at[1]! - at[0]!).toBe(PEW_RECHARGE_TICKS);   // no second round on the next tick from the stored thirds
    expect(new Set(at.slice(1).map((t, j) => t - at[j]!))).toEqual(new Set([PEW_RECHARGE_TICKS]));   // 1 bar: a third every 60 ticks
  });
  it('pewAutoReady: full, or a third just completed; not mid-third', () => {
    const st = scene([1, 0, 1]), s = st.systems[0]!, def = classOf(st, 0).slots.pew!;
    expect(pewAutoReady(st, 0)).toBe(true);   // full
    s.pewCharge = 2 * pewThird(def) + pewGain(st, 0); expect(pewAutoReady(st, 0)).toBe(false);   // mid-third, two stored
    s.pewCharge = 2 * pewThird(def); expect(pewAutoReady(st, 0)).toBe(true);   // a third just completed
    s.pewCharge = pewGain(st, 0) - 1; expect(pewAutoReady(st, 0)).toBe(false);   // under a third: pewReady fails
  });
  it('the autocannon: every 10 ticks at 1 bar on solution; it stops at 80 % heat and never locks over 3000 ticks; it settles near one round per 12.5 ticks', () => {
    const one = scene([0, 1, 1]), at: number[] = [];
    for (let k = 0; k < 120; k++) if (tick(one).gun) at.push(k);
    expect(new Set(at.slice(1).map((t, j) => t - at[j]!))).toEqual(new Set([10]));
    const hot = scene([0, 3, 0]), s = hot.systems[0]!;
    let maxHeat = 0, shots = 0;
    for (let k = 0; k < 3000; k++) { shots += tick(hot).gun; maxHeat = Math.max(maxHeat, s.gunHeat); expect(s.gunLocked).toBe(false); if (k === 1999) shots = 0; }
    expect(maxHeat).toBeLessThanOrEqual(GUN_AUTO_HEAT_STOP + AUTOCANNON.heatPerShot);
    expect(shots).toBeGreaterThanOrEqual(78); expect(shots).toBeLessThanOrEqual(82);   // 1000 ticks / 12.5
  });
  it('no AUTO fire on an unseen enemy, behind a rock, out of the arc, unattended or unpowered', () => {
    const fired = (st: TacticalState, input: ShipInput = IDLE_INPUT): number => { let n = 0; for (let k = 0; k < 200; k++) { const f = tick(st, input); n += f.gun + f.pew; } return n; };
    const unseen = scene([1, 1, 1], 0, 400); unseen.systems[0]!.bars[3] = 0;   // sensor range 300
    expect(fired(unseen)).toBe(0);
    const rock = scene([1, 1, 1]); mover(rock, 0, 0, 1500 + hy(0) * 150, 0, 0, 20);
    expect(fired(rock)).toBe(0);
    expect(fired(scene([1, 1, 1], 64))).toBe(0);   // 90° right: outside both arcs
    expect(fired(scene([1, 1, 1]), { ...IDLE_INPUT, weapons: false })).toBe(0);
    expect(fired(scene([0, 0, 1]))).toBe(0);
  });
  it('AUTO pew aims only at the ship: an inbound torpedo within 300 is never its target, but one crossing a round aimed at the ship is hit', () => {
    const st = scene([1, 0, 1], 64);   // the Hunter out of the arc
    placeMissile(st, 1, { x: 0, y: 1500 + hy(0) * 200, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    for (let k = 0; k < 120; k++) tick(st);
    expect(st.systems[0]!.pewShots).toBe(0);   // no point defence
    const cross = scene([1, 0, 1]);
    placeMissile(cross, 1, { x: 0, y: 1500 + hy(0) * 60, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    for (let k = 0; k < 20 && cross.missiles.some((m) => m.active); k++) { tick(cross); stepPew(cross); }
    expect(cross.missiles.some((m) => m.active && m.owner === 1)).toBe(false);   // W-1's sweep shot it down
  });
});

describe('AUTO holds fire during the hold (W-4 spec §4.3, owner 2026-11-19)', () => {
  it('both guns slew onto solution and fire nothing while hostileAt is −1; the first AUTO round comes the tick after the hold ends', () => {
    const st = scene([1, 1, 1], 6, 300, true), s = st.systems[0]!;
    let fired = 0;
    for (let k = 0; k < 120; k++) { const f = tick(st); fired += f.gun + f.pew; }
    expect(fired).toBe(0);
    expect(s.pewTurret).toBe(6 * 256);
    expect(s.gunTurret).toBe(6 * 256);
    s.missilesLaunched = 1; hostilityStep(st, 1);   // a crew launch ends the hold, after the weapons, as duel.ts orders it
    expect(st.hostileAt).toBeGreaterThanOrEqual(0);
    const next = tick(st);
    expect(next.gun + next.pew).toBeGreaterThan(0);
  });
});

describe('AUTO in a sustained Helm turn (W-4 spec §4.2, owner 2026-11-19: the fire tolerance)', () => {
  it('both guns still fire while the nose sweeps across the Hunter at the full unboosted 150°/s (455 fine steps a tick), the autocannon less often than at rest', () => {
    /** 120 ticks with the Hunter 300 u north, the Hound turning clockwise from heading index `start` (or still at 0). */
    const count = (turning: boolean): { gun: number; pew: number } => {
      const st = scene([1, 1, 1]), n = { gun: 0, pew: 0 };
      let fine = turning ? 212 * 256 : 0;   // turning: the Hunter starts 44 heading steps (62°) right of the nose, outside both arcs
      for (let k = 0; k < 120; k++) {
        st.ships[0].heading = Math.floor(fine / 256) % 256;   // the heading index a 150°/s turn reaches each tick (headingAcc's whole part)
        const f = tick(st); n.gun += f.gun; n.pew += f.pew;
        if (turning) fine += 455;
      }
      return n;
    };
    const rest = count(false), turn = count(true);
    expect(turn.gun, 'the autocannon in the turn').toBeGreaterThanOrEqual(1);
    expect(turn.pew, 'the pew in the turn').toBeGreaterThanOrEqual(1);
    expect(turn.gun).toBeLessThan(rest.gun);
  });
});

describe('MAN never costs firepower (W-4 spec §3.4, owner 2026-11-19)', () => {
  it('with pew pew in hand the autocannon fires on its own at the hostile ship; with the torpedo selected both do; the hold still keeps them quiet', () => {
    const run = (st: TacticalState, sel: number): { gun: number; pew: number } => {
      const n = { gun: 0, pew: 0 };
      for (let k = 0; k < 120; k++) { const f = tick(st, { ...IDLE_INPUT, weaponSel: sel, turretAim: -1 }); n.gun += f.gun; n.pew += f.pew; }
      return n;
    };
    const man = scene([1, 1, 1], 6); man.systems[0]!.pewManual = true; man.systems[0]!.gunManual = true;   // both switches on MAN
    const pewInHand = run(man, 0);
    expect(pewInHand.gun).toBeGreaterThan(0);   // the autocannon, out of hand, fights on AUTO
    expect(pewInHand.pew).toBe(0);   // the pew in hand fires only on a pewFire (none here)
    const both = run(man, 2);
    expect([both.gun > 0, both.pew > 0]).toEqual([true, true]);   // the torpedo selected: both AUTO-driven
    const held = scene([1, 1, 1], 6, 300, true); held.systems[0]!.pewManual = true; held.systems[0]!.gunManual = true;
    const quiet = run(held, 0);
    expect(quiet.gun + quiet.pew).toBe(0);   // AUTO's rules: nothing in the hold
  });
  it('a MAN gun that is not selected fights on AUTO, and an AUTO gun that is selected does too (amendment §2.3: the switch matters only while the gun is selected)', () => {
    const run = (st: TacticalState, sel: number): { gun: number; pew: number } => {
      const n = { gun: 0, pew: 0 };
      for (let k = 0; k < 120; k++) { const f = tick(st, { ...IDLE_INPUT, weaponSel: sel, turretAim: -1, gunHeld: true }); n.gun += f.gun; n.pew += f.pew; }
      return n;
    };
    const pewMan = scene([1, 1, 1], 6); pewMan.systems[0]!.pewManual = true;   // pew pew MAN, the autocannon AUTO
    const onGun = run(pewMan, 1);   // the autocannon selected: nothing is in hand, so both fire on AUTO (the held trigger does nothing)
    expect([onGun.gun > 0, onGun.pew > 0]).toEqual([true, true]);
    const gunMan = scene([1, 1, 1], 6); gunMan.systems[0]!.gunManual = true;   // the autocannon MAN, pew pew AUTO
    const onPew = run(gunMan, 0);   // pew pew selected on AUTO: both AUTO-driven
    expect([onPew.gun > 0, onPew.pew > 0]).toEqual([true, true]);
  });
});
```

The turning case's start (heading index 212) puts the Hunter outside both arcs, so each gun must meet it on the sweep and then trail it. A turret-and-bearing model of this geometry (the solution as the bearing's whole index, the slew law as written) gave the autocannon no on-solution tick under an exact-only rule and two ticks within the tolerance. If the real lead's muzzle offset moves those ticks, keep the start and the assertions, and report the counts.

Append to `tests/w4Manual.test.ts`:

```ts
describe('pewFire in AUTO and MAN (W-4 spec §6, amendment §2.3)', () => {
  it("is unavailable while pew pew is on AUTO; a same-tick gunMode for slot 0 first makes it apply; a second in the tick is a noop; the autocannon's switch does not open it", () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    try {
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      const gun = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 2), env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 3)] });
      expect(gun.map((x) => [x.id.sequence, x.status, x.reason ?? null])).toEqual([[2, 'rejected', 'unavailable'], [3, 'applied', null]]);   // slot 1 is the autocannon's
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 4), env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 5), env(d, g, { kind: 'pewFire' }, 6)] });
      expect(r.map((x) => [x.id.sequence, x.status])).toEqual(expect.arrayContaining([[5, 'applied'], [4, 'applied'], [6, 'noop']]));
    } finally { disposeDuel(d); }
  });
  it("reads pew pew's own switch: refused with pewManual false and admitted with it true, whatever gunManual is", () => {
    for (const gunManual of [false, true]) {
      const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
      try {
        s.gunManual = gunManual;
        expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1)] })[0], `gunManual ${gunManual}`).toMatchObject({ status: 'rejected', reason: 'unavailable' });
        s.pewManual = true;
        expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 2)] })[0], `gunManual ${gunManual}`).toMatchObject({ status: 'applied' });
      } finally { disposeDuel(d); }
    }
  });
  it('gunHeld fires the autocannon in MAN only with it selected; in AUTO a held trigger fires nothing', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      s.bars[1] = 3; s.weaponPower = [1, 1, 1];
      Object.assign(d.tactical.ships[1], { x: 5000, y: 5000 });   // far off: AUTO has no solution
      const held = (weaponSel: number) => { const h = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]; h[g] = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true, weaponSel } as never; return h; };
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(1), commands: [] });
      expect(s.gunShots).toBe(0);   // AUTO ignores the trigger
      s.pewManual = true;
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(1), commands: [] });
      expect(s.gunShots).toBe(0);   // pew pew's switch is not the autocannon's (amendment §2.3)
      s.gunManual = true;
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(0), commands: [] });
      expect(s.gunShots).toBe(0);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(1), commands: [] });
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4Auto.test.ts tests/w4Manual.test.ts`
Expected: FAIL (AUTO fires nothing; `pewFire` applies in AUTO; the held trigger fires in AUTO).

- [ ] **Step 3: `tickGun`'s AUTO and MAN triggers**

In `sim/tactical/gun.ts`, add `GUN_AUTO_HEAT_STOP` to the tuning import, change the signature to `export function tickGun(state: TacticalState, i: number, input: ShipInput, auto = false): void {`, and replace W-4a's trigger line and Task 4's three lines

```ts
  if (!input.weapons || !input.gunHeld || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  const hand = g.turret !== null && handControl(state, i, input.weaponSel, WeaponSlot.Autocannon);   // W-4 spec §3.4, §4.4: the autocannon in hand
  if (g.turret !== null && gunInterval(state, i, hand) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  fireRound(state, i, g, hand);
```

with

```ts
  if (!input.weapons || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  if (g.turret === null) { if (input.gunHeld) fireRound(state, i, g); return; }   // the Valkyrn: its trigger, as before
  const hand = handControl(state, i, input.weaponSel, WeaponSlot.Autocannon);   // W-4 spec §3.4: in hand (its own switch on MAN, and selected), else AUTO-driven
  if (gunInterval(state, i, hand) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  // W-4 spec §4.3, §5: in hand it fires on the held trigger (the step sets it only with the autocannon selected); AUTO-driven
  // (on AUTO, or on MAN but not selected: owner 2026-11-19) it fires on solution once hostile (`auto`, applyWeaponsInput) while
  // below the 80 % heat stop, so it never locks; no hysteresis. A held trigger does nothing to an AUTO-driven gun.
  if (hand ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g, hand);
```

and extend its doc comment: "W-4 spec §4.3: a turret gun in hand fires on the trigger, an AUTO-driven one on `auto` (on solution and hostile) below GUN_AUTO_HEAT_STOP." For the Valkyrn the checks and their order are equivalent to master's single condition (each is a pure read before the one `fireRound`, which with `manual` false sets `intervalTicks`).

- [ ] **Step 4: `applyWeaponsInput` and the step**

`sim/tactical/weapons.ts`: import `enemyHostile` from `./science` (beside `shipSeen`). Replace Task 5's

```ts
  slewTurrets(state, i, input);   // W-4 spec §3.4, §8: the turrets slew before the gun and the pew fire (the pre-move heading)
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
```

with

```ts
  const auto = slewTurrets(state, i, input);   // W-4 spec §3.4, §8: the turrets slew before the gun and the pew fire (the pre-move heading)
  const hostile = enemyHostile(state);   // W-4 spec §4.3: AUTO tracks in the hold and fires only once hostile
  tickGun(state, i, input, auto.gun && hostile);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
```

In `src/renderer/src/sim/tactical/pew.ts`, after `pewReady`, add:

```ts
/** W-4 spec §4.3 (Decision 4): whether ship i's AUTO pew may fire now: pewReady, and either full or a third completed by
 *  the last tickPew (the charge sits within one tick's gain above a whole third). So AUTO fires one round each time a third
 *  has charged and never bursts the stored thirds. Integers on AUTO's gains (they divide the third). */
export function pewAutoReady(state: TacticalState, i: number): boolean {
  const def = classOf(state, i).slots.pew, c = state.systems[i]!.pewCharge;
  return def !== null && pewReady(state, i) && (c >= pewFull(def) || c % pewThird(def) < pewGain(state, i));
}
```

and import `pewAutoReady` in `weapons.ts` from `./pew` (beside `firePewTrigger`). Then, in `weapons.ts`, replace W-4a's

```ts
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's pewFire, along the turret; last, as before
  else if (input.pewAim >= 0) firePew(state, i, input.pewAim);   // W-1 (pew pew spec §1): the Hunter's aim; attended (above)
```

with

```ts
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's MAN pewFire, along the turret; last, as before
  else if (auto.pew && hostile && pewAutoReady(state, i)) firePewTrigger(state, i);   // W-4 spec §4.3 (Decision 4): AUTO, one round each time a third has charged, never a burst
  else if (input.pewAim >= 0) firePew(state, i, input.pewAim);   // W-1 (pew pew spec §1): the Hunter's aim; attended (above)
```

`sim/duel/step.ts`: in W-4a's `pewFire` block, replace

```ts
    else {   // W-4 spec §6, §19.1 (W-4a): no aim; one round a tick (the first wins), then a pew pew bar and a third stored (pewReady)
      if (crew.pewTrigger) { result(e, undefined, 'noop'); continue; }
```

with

```ts
    else {   // W-4 spec §6: no aim; MAN only; one round a tick (the first wins), then a pew pew bar and a third stored (pewReady)
      if (!sys0.pewManual) { result(e, 'unavailable'); continue; }   // W-4b, amendment §2.3: pew pew's own switch; on AUTO it fires itself
      if (crew.pewTrigger) { result(e, undefined, 'noop'); continue; }
```

Kind (a) rewrites, each citing W-4 spec §4.3 (from this task on, a turret gun on AUTO ignores `gunHeld`, `pewFire` needs pew pew on MAN, and every round starts with both switches on AUTO):
- `tests/w4PewFire.test.ts` (W-4a): its admission test sets pew pew to MAN first (`d.tactical.systems[0].pewManual = true` after creating the duel). Its case "on the Hound gunHeld fires the autocannon only with weaponSel 1" sets `gunManual = true` on the Hound duel before stepping.
- `tests/w4Autocannon.test.ts` (W-4a): the `gaps()` helper calls `tickGun(st, 0, IDLE_INPUT, true)` instead of `tickGun(st, 0, TRIGGER)`, which fixes the interval-by-bars case. The direct `TRIGGER` calls in the rounds-along-the-aim, cooldown, six-hits-a-level and 0-bar cases change the same way (W-4a plan's w4Autocannon at its L584, L604, L609, L616, L619 and L628). That is AUTO on solution with the AUTO rows, so W-4a's 10 / 8 / 6 / 5 assertions stand. The heat-and-lock case sets `s.gunManual = true` and fires with `{ ...TRIGGER, weaponSel: 1 }` (the autocannon in hand, Decision 14: `TRIGGER` alone has `weaponSel` −1, which leaves the gun AUTO-driven and never locking), because only the gun in hand can lock. It asserts heat, lock and cooling only, so it needs no re-pin.
- `tests/w4Turret.test.ts` (Task 5's "a pew round and an autocannon round leave along them"): `tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true })` becomes `tickGun(st, 0, IDLE_INPUT, true)`.

- [ ] **Step 5: The scripted gunner on AUTO (spec §12)**

In `sim/duel/scripted.ts` `houndGunner`, delete the stand-in pew block:

```ts
  const s = t.ships[0], e = t.ships[target]!;
  if (e.active && pewReady(t, 0) && weaponBars(sys, WeaponSlot.Pew) > 0 && t.tick - pair.lastPew >= SCRIPTED_PEW_GAP) {
    const dx = e.x - s.x, dy = e.y - s.y;
    if (dx * dx + dy * dy <= PEW_RANGE * PEW_RANGE && inArc(s.heading, dx, dy, PEW_ARC_COS)) { out.push({ kind: 'pewFire' }); pair.lastPew = t.tick; }
  }
```

and rewrite its doc comment: "W-4 spec §12: the gunner on a turret class (the Hound). Its first seated tick spends the spare bar on the autocannon (pre-checked, so both commands are admitted) and does nothing else that tick. The guns stay AUTO (no gunMode, no held aim, no pewFire, and no laserLock: it never steps the target room, W-4 amendment §3.5): they track and, once the enemy is hostile, fire by themselves (applyWeaponsInput). Its torpedo rule (a torpLock while the target is seen, canLaunch and the gap) launches the AUTO torpedo, which also ends the 30 s hold if the clock has not. No laser command." Remove imports that are now unused (tsc names them; `gunnerPew` on other classes still uses some, and the Helm's line-up below uses `inArc` and `shipSeen`).

**The Helm's line-up moves to the autocannon (Decision 16).** In `sim/tactical/tuning.ts`, after `AUTOCANNON_AUTO_RANGE`, add:

```ts
/** W-4 spec §12: cos 30°, the autocannon's ±30° arc as inArc's cosine: the scripted Helm lines the guns up outside it. */
export const AUTOCANNON_ARC_COS = 0.8660254037844386;
```

In `sim/duel/scripted.ts` `helmAxes`, replace W-4a's line-up

```ts
  if (hasTurret(classOf(t, 0)) && e.active && shipSeen(t, targetOf(t, 0)) && ex * ex + ey * ey <= PEW_RANGE * PEW_RANGE && !inArc(s.heading, ex, ey, PEW_ARC_COS))
```

with

```ts
  if (hasTurret(classOf(t, 0)) && e.active && shipSeen(t, targetOf(t, 0)) && ex * ex + ey * ey <= AUTOCANNON_AUTO_RANGE * AUTOCANNON_AUTO_RANGE && !inArc(s.heading, ex, ey, AUTOCANNON_ARC_COS))
```

(the `return { turn: autoFaceTurn(t, 0), … }` line under it stays), add `AUTOCANNON_ARC_COS, AUTOCANNON_AUTO_RANGE` to scripted.ts's tuning import, and change its comment's "(the stand-in pew's cone; W-4b: …)" to "(W-4b: inside the autocannon's ±30° both AUTO guns bear, so outside it, within its 600 u, the Helm turns the nose on)". Task 13 adds `HOUND_HELM_LINEUP` to this condition.

In `tests/duelScripted.test.ts`'s describe "the scripted Helm lines the guns up (W-4 spec §12, §19.1: W-4a's ±60° stand-in)" (kind (a), W-4 spec §12: the autocannon's geometry), rename it to "the scripted Helm lines the guns up (W-4 spec §12: outside the autocannon's ±30°, within 600 u)", and replace the first case's three `place(...)` lines with:

```ts
      place(d, 32, 300); expect(faces(d)).toBe(true);    // 45° right: outside ±30° (inside the pew's ±60°, but the autocannon cannot bear)
      place(d, 16, 300); expect(faces(d)).toBe(false);   // 22.5° right: inside ±30°, so it orbits
      place(d, 64, 520); expect(faces(d)).toBe(true);    // 520 u: beyond PEW_RANGE, inside the autocannon's 600
      place(d, 64, 700); expect(faces(d)).toBe(false);   // beyond 600
```

and its title to "on the Hound: face while the Hunter is seen within 600 u outside the autocannon's ±30°; not inside it, not beyond 600". The Valkyrn case stays. Keep `movedPair`, which the line-up describe uses.

In `tests/duelScripted.test.ts`, replace W-4a's describe ("the scripted gunner on the Hound (… W-4a's stand-in pew)") with (kind (a), W-4 spec §12):

```ts
describe('the scripted gunner on the Hound (W-4 spec §12: AUTO guns)', () => {
  it('its first seated tick sends shipPower Weapons +1 then weaponPower Autocannon +1, both applied: pew 1, autocannon 1, torpedo 1', () => {
    const d = createSeatedDuel(layout, 2), pair = createScriptedPair(2);
    try {
      const input = scriptedInput(pair, d), gunner = 1 - d.helmPlayer;
      expect(input.commands.filter((e) => e.id.player === gunner).map((e) => e.command)).toEqual([{ kind: 'shipPower', system: 1, delta: 1 }, { kind: 'weaponPower', slot: 1, delta: 1 }]);
      expect(stepDuelTick(d, input).every((r) => r.status === 'applied')).toBe(true);
      expect(d.tactical.systems[0].weaponPower).toEqual([1, 1, 1]);
    } finally { disposeDuel(d); }
  });
  it('moves nothing when no spare bar is left', () => {
    const d = createSeatedDuel(layout, 2), pair = createScriptedPair(2);
    try {
      const b = d.tactical.systems[0].bars; b[0] = b[0]! + 1;
      expect(scriptedInput(pair, d).commands.filter((e) => e.command.kind === 'shipPower' || e.command.kind === 'weaponPower')).toEqual([]);
    } finally { disposeDuel(d); }
  });
  it('over whole duels it sends no pewFire, no gunMode and no laser command (no laserLock: amendment §3.5); its AUTO guns fire nothing before the hostile event, whose cause is its torpedo or the clock', () => {
    for (const seed of [1, 2, 4]) {
      const d = createSeatedDuel(layout, seed), p = createScriptedPair(seed);
      let hostile = false, cause = '';
      try {
        while (d.tactical.outcome === Outcome.Running) {
          const input = scriptedInput(p, d);
          expect(input.commands.some((e) => e.command.kind === 'pewFire' || e.command.kind === 'gunMode' || (e.command.kind.startsWith('laser') && e.command.kind !== 'laserFrequency'))).toBe(false);
          stepDuelTick(d, input);
          for (const e of d.tactical.events) if (e.kind === 'hostile') { hostile = true; cause = e.cause; }
          if (!hostile) expect(d.tactical.systems[0].pewShots + d.tactical.systems[0].gunShots, `seed ${seed} tick ${d.tactical.tick}`).toBe(0);
        }
        expect(['missile', 'clock'], `seed ${seed}`).toContain(cause);
      } finally { disposeDuel(d); }
    }
  }, 60_000);
  it("the Valkyrn pair's gunner is today's code: it still makes the pew → beam move on the Valkyrn class", () => {
    const d = createSeatedDuel(layout, 2, 0, 2, ShipClass.Valkyrn), pair = createScriptedPair(2);
    try {
      expect(scriptedInput(pair, d).commands.filter((e) => e.id.player === 1 - d.helmPlayer).map((e) => e.command)).toEqual([{ kind: 'weaponPower', slot: 0, delta: -1 }, { kind: 'weaponPower', slot: 1, delta: 1 }]);
    } finally { disposeDuel(d); }
  });
});
```

and in the whole-duel kinds expectation drop `'pewFire'`: `['shipPower', 'sit', 'stand', 'torpLock', 'weaponPower']` (comment: "W-4 spec §12, §14 (kind a): AUTO guns, so no pewFire (W-4b removed W-4a's stand-in)"); if the seed's duel no longer uses every kind, re-pick it as W-4a's Task 8 says. Drop the `pewFires` helper and imports that are now unused; keep `movedPair` (the Helm line-up's describe uses it).

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4Turret.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/duelScripted.test.ts tests/valkyrnIdentity.test.ts tests/valkyrnRounds.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/manualLaserBeam.test.ts tests/manualLaserMode.test.ts`
Expected: tsc clean; all PASS except `duelScripted`'s known-red whole-run values. The laser fit's AUTO beam still fires in the hold (W-2's tests on the laser fit, unchanged).

Then: `npx vitest run tests/duelGates.test.ts` and `npx tsx scripts/duel-telemetry.ts`. Record in the report under `## W-4b` the per-seed lines (pew rounds, gun rounds, launches, hold end rt and cause) and the summary. A failing per-seed test is the known-red window until Task 13.

- [ ] **Step 7: Classify the fallout**

Run: `npx electron-vite build` then `npx vitest run --maxWorkers=4 2>&1 | tail -80`
Expected: only the known-red window. Any other red test: apply the fallout rule (a test that expects the Hound's pew to fire in AUTO on `pewFire`, or the old held trigger in AUTO, is kind (a)); list each in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/w4Turret.test.ts tests/duelScripted.test.ts docs/superpowers/research/2026-11-19-w4-report.md <each kind (a) test fixed in Step 7>
git commit -m "feat(w4b): AUTO fires at a seen, hostile ship on solution (the pew per third, the autocannon to 80 % heat), holds fire in the hold, and keeps the gun out of hand firing in MAN; pewFire is MAN only; the scripted gunner leaves the guns on AUTO and the Helm lines up the autocannon (W-4 spec §3.4, §4.3, §6, §12)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The target room in the sim: `laserLock` on the Hound, rounds that carry the room, and the hit rules (amendment §3.1 to §3.4)

This task comes after Task 7 on purpose (amendment §6): until Task 7 deleted it, W-4a's stand-in in the scripted gunner sent `pewFire`; tagged before then, those rounds would have worn rooms and moved whole runs an extra time. From here an AUTO gun wears only the hull, so the scripted crew takes rooms only with its torpedo (amendment §3.5) and whole runs move once more (the known-red window).

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts` (`GunRound`, `emptyRound`, `roundRoom`, the `pewHit` event), `sim/tactical/hash.ts` (`ROUND_SLOT`, `MissingRoundKeys`, `roundFields`, `validateTacticalValues`), `sim/tactical/tuning.ts` (`PEW_ROOM_WEAR`), `sim/tactical/gun.ts` (`placeRound`, `fireRound`, `tickGun`, `gunHit`, `stepRounds`), `sim/tactical/pew.ts` (`firePew`, `firePewTrigger`, `pewHit`, `stepPew`), `sim/tactical/weapons.ts` (`applyWeaponsInput`), `sim/duel/step.ts` (the `laserLock` admission)
- Modify: `src/renderer/src/app/duel/onlineSource.ts` (its `pewHit` literal, Decision 25)
- Create: `tests/w4Rooms.test.ts`
- Modify (kind (a)): `tests/w4PewFire.test.ts`, `tests/w4Autocannon.test.ts`, `tests/engineeringFog.test.ts`, `tests/pewUi.test.tsx`, `tests/pewViews.test.ts`, `tests/pewRounds.test.ts`
- Modify: `tests/valkyrnIdentity.test.ts` (the left-out pattern), `tests/tacticalDeterminism.test.ts` (the comment on the length line), `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: `GunRound`, `emptyRound()`, `Room`, `CREW_SLOT`, `classOf` (`state.ts`); `ROUND_SLOT`, `ROUND_KEYS`, `MissingRoundKeys`, `roundFields(pool, k)`, the round branch of `validateTacticalValues` (`hash.ts`, quoted below from the branch); `placeRound`, `gunRoomOf`, `gunHit`, `stepRounds` (`gun.ts`, as on the branch); Task 4's `fireRound(state, i, g, manual = false)` and `handControl`; Task 7's `tickGun` (its last line is quoted in Step 5) and its two pew lines at the end of `applyWeaponsInput` (quoted in Step 7); `firePew`, `firePewTrigger`, `pewHit`, `stepPew` (`pew.ts`, as on the branch); `validLock`, `validTarget` (`weapons.ts`); `hasTurret` (`defs.ts`); the `laserLock` lines of `step.ts` (quoted in Step 7); `launchMissile`, `resolveMissiles` (`missiles.ts`, unchanged: `land` already reads `lock` as the torpedo lands).
- Produces: `GunRound.room`, `roundRoom(tag)`, `ROUND_SLOT = 8`, the hashed field `${pool}.${k}.room`; `PEW_ROOM_WEAR`; `placeRound`'s optional `room`; `firePew(state, i, aim, room = 0)`, `firePewTrigger(state, i, room = 0)`; `pewHit`'s `room` and `level`; `laserLock` as the Hound's target room command. Task 12 sends it and reads the event's new members; Task 13's report reads `gunHit` / `pewHit` `level`.

- [ ] **Step 1: Write the failing test**

Create `tests/w4Rooms.test.ts`:

```ts
// W-4 amendment §3 (W-4b): the crew's target room is ShipSystems.lock. On the Hound laserLock sets it (the seat, malformed,
// −1 and an unseen enemy unavailable; laserTargeted and laserRock untouched). A round fired by hand carries it (room =
// lock + 1 at the moment of firing); AUTO's rounds, the Hunter's and the Valkyrn's carry 0. The autocannon by hand wears the
// tagged room wherever the round lands, and on AUTO wears no room; pew pew by hand adds PEW_ROOM_WEAR to the same counter;
// shield hits are unchanged. An AUTO torpedo with no torpedo lock strikes the room lock names as it lands. The round's room
// is hashed, bounded and snapshotted.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { AUTOCANNON, GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound, stepRounds, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { flattenTactical, ROUND_SLOT, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { launchMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { firePew, stepPew } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, emptyRound, missileOf, Room, roundRoom, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { PEW_ROOM_WEAR } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { houndWeapons } from './helpers/crewWeapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { holdInSight } from './helpers/sensorSight';

const CUTTER = parseShip(cutter), N: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });
/** One command on one tick with the enemy held in sensor sight (the ships spawn out of it); its result. */
const seen = (d: DuelState, player: number, command: DuelCommand, seq: number) => { holdInSight(d.tactical); return stepDuelTick(d, { held: [], commands: [env(d, player, command, seq)] })[0]!; };

describe("laserLock is the target room's command on the Hound (amendment §3.2)", () => {
  it('the seat, malformed, −1 unavailable, an unseen enemy unavailable; seen, it sets lock and leaves laserTargeted and laserRock', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      expect([s.lock, s.laserTargeted, s.laserRock]).toEqual([Room.Shields, false, -1]);
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'laserLock', room: Room.Engines }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // unseen: the ships spawn out of sensor range
      expect(s.lock).toBe(Room.Shields);
      expect(seen(d, d.helmPlayer, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
      for (const room of [3, -2, 1.5]) expect(seen(d, g, { kind: 'laserLock', room }, 2), String(room)).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(seen(d, g, { kind: 'laserLock', room: -1 }, 3)).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // the target room has no "none": nothing to clear
      expect(s.lock).toBe(Room.Shields);
      expect(seen(d, g, { kind: 'laserLock', room: Room.Engines }, 4)).toMatchObject({ status: 'applied' });
      expect([s.lock, s.laserTargeted, s.laserRock]).toEqual([Room.Engines, false, -1]);
      expect(seen(d, g, { kind: 'laserLock', room: Room.Weapons }, 5)).toMatchObject({ status: 'applied' });
      expect(s.lock).toBe(Room.Weapons);
    } finally { disposeDuel(d); }
  });
  it("is unavailable on the Valkyrn (no laser, no turret); on the laser fit it is the laser's lock, as before", () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      expect(seen(v, 1 - v.helmPlayer, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      expect(v.tactical.systems[0].lock).toBe(Room.Shields);
      const f = fit.tactical.systems[0], g = 1 - fit.helmPlayer;
      expect(seen(fit, g, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'applied' });
      expect([f.lock, f.laserTargeted]).toEqual([Room.Engines, true]);
      expect(seen(fit, g, { kind: 'laserLock', room: -1 }, 2)).toMatchObject({ status: 'applied' });   // the laser's clear still works
      expect([f.lock, f.laserTargeted]).toEqual([Room.Engines, false]);
    } finally { disposeDuel(v); disposeDuel(fit); }
  });
});

/** The Hound at (0, 1500) nose north, still; the Hunter `ahead` u dead ahead (north is −y), still, its nose toward the Hound,
 *  shields down; no rocks; bars pew pew / autocannon / torpedo. */
function arena(bars: readonly [number, number, number], ahead = 120): TacticalState {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 0, y: 1500 - ahead, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
  st.systems[1]!.shields = 0;
  st.events = [];
  return st;
}
/** The same, with the Hunter far off to the side: nothing can land. */
function range(bars: readonly [number, number, number]): TacticalState {
  const st = arena(bars);
  Object.assign(st.ships[1], { x: 2400, y: 1500 });
  return st;
}
/** `n` rounds of the crew's, each tagged `tag`, placed 30 u south of the Hunter's centre flying north, so each enters its
 *  circle on its first step and crosses its middle (the room under the round is Shields). */
function land(st: TacticalState, n: number, tag: number, pool: 'rounds' | 'pew' = 'rounds'): void {
  const h = st.ships[1]!;
  for (let k = 0; k < n; k++) {
    placeRound(st, { x: h.x, y: h.y + 30, vx: 0, vy: pool === 'pew' ? -900 : -700, age: 0, owner: 0, room: tag }, pool === 'pew' ? st.pew : st.rounds);
    if (pool === 'pew') stepPew(st); else stepRounds(st);
  }
}
const hits = (st: TacticalState, kind: 'gunHit' | 'pewHit') => st.events.filter((e) => e.kind === kind) as unknown as { ship: number; room: number; level: boolean; hull: boolean; stripped: boolean }[];
const HAND = { ...IDLE_INPUT, gunHeld: true, weaponSel: 1 };   // the trigger held with the autocannon selected

describe('a round carries the room it was fired at (amendment §3.3)', () => {
  it('the autocannon by hand: lock + 1 at the moment of firing, and a later change of lock leaves it; on AUTO, and on MAN but not selected, 0', () => {
    const st = range([1, 3, 1]), s = st.systems[0]!;
    s.gunManual = true; s.lock = Room.Engines;
    tickGun(st, 0, HAND);
    const r = st.rounds.find((e) => e.active)!;
    expect(r.room).toBe(Room.Engines + 1);
    s.lock = Room.Weapons; stepRounds(st);
    expect([r.active, r.room]).toEqual([true, Room.Engines + 1]);   // a round is not guided: it keeps the room it was fired at
    const auto = range([1, 3, 1]);
    auto.systems[0]!.lock = Room.Engines;
    tickGun(auto, 0, IDLE_INPUT, true);   // AUTO on solution
    expect(auto.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
    const out = range([1, 3, 1]);
    out.systems[0]!.gunManual = true; out.systems[0]!.lock = Room.Engines;
    tickGun(out, 0, { ...IDLE_INPUT, gunHeld: true, weaponSel: 0 }, true);   // MAN but pew pew is selected: AUTO-driven
    expect(out.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
  });
  it('an admitted pewFire carries the room even when pew pew is not the held selection, and a same-tick laserLock tags the new room', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, t = d.tactical, s = t.systems[0];
    try {
      s.pewManual = true;
      const held: HeldInput[] = [N, N]; held[g] = { ...N, weaponSel: 1 };   // the selection trails the click by a frame (amendment judgement call 7)
      holdInSight(t);
      const r = stepDuelTick(d, { held, commands: [env(d, g, { kind: 'pewFire' }, 1), env(d, g, { kind: 'laserLock', room: Room.Weapons }, 2)] });
      expect(r.map((x) => x.status)).toEqual(['applied', 'applied']);
      expect(s.lock).toBe(Room.Weapons);
      expect(t.pew.filter((e) => e.active).map((e) => [e.owner, e.room])).toEqual([[0, Room.Weapons + 1]]);   // the lock is applied first in the tick
    } finally { disposeDuel(d); }
  });
  it("rounds fired by AUTO's rules, the Hunter's and the Valkyrn's carry no room", () => {
    const st = arena([1, 1, 1], 300), s = st.systems[0]!;
    st.hostileAt = 0; s.lock = Room.Engines;
    for (let k = 0; k < 20; k++) applyWeaponsInput(st, 0, IDLE_INPUT);   // both guns on AUTO, the Hunter dead ahead: on solution at once
    expect([s.pewShots > 0, s.gunShots > 0]).toEqual([true, true]);
    expect([...st.rounds, ...st.pew].filter((e) => e.active).every((e) => e.room === 0)).toBe(true);
    firePew(st, 1, 0);   // the Hunter's pew
    expect(st.pew.filter((e) => e.active && e.owner === 1).map((e) => e.room)).toEqual([0]);
    const v = createTacticalState(5, 2, ShipClass.Valkyrn);
    v.systems[0]!.lock = Room.Engines;
    tickGun(v, 0, { ...IDLE_INPUT, gunHeld: true });
    expect(v.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
  });
});

describe('hits on the target room (amendment §3.4)', () => {
  it("the autocannon by hand: six unshielded hits raise the tagged room a level, wherever they land; no other room's wear moves; the hull wears as before", () => {
    const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 5, Room.Engines + 1);
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 0, 0], [0, 0, 5]]);   // the rounds cross the middle (Shields is under them); the wear is the Engines'
    st.events = []; land(st, 1, Room.Engines + 1);
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 0, 1], [0, 0, 0]]);
    expect(hits(st, 'gunHit')).toMatchObject([{ ship: 1, room: Room.Engines, level: true, stripped: false }]);
    land(st, 6, Room.Engines + 1);
    expect([t.rooms, t.hull]).toEqual([[0, 0, 2], hull - Math.floor(12 / AUTOCANNON.hitsPerHull)]);   // 12 hits in all: the hull wears at hitsPerHull
    land(st, 3, Room.Engines + 1);
    expect(t.gunRoomWear).toEqual([0, 0, 0]);   // a level-2 room holds its wear at 0
    expect(st.systems[0]!.gunHits).toBe(15);
  });
  it('the autocannon on AUTO (an untagged round): the hull wears at hitsPerHull and no room; the event names no room', () => {
    const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, AUTOCANNON.hitsPerHull, 0);
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [0, 0, 0], hull - 1]);
    expect(hits(st, 'gunHit')).toHaveLength(AUTOCANNON.hitsPerHull);
    expect(hits(st, 'gunHit').every((e) => e.room === -1 && !e.level)).toBe(true);
    expect(hits(st, 'gunHit').at(-1)).toMatchObject({ hull: true });
  });
  it('pew pew by hand: each unshielded hit costs the hull and adds PEW_ROOM_WEAR, so two raise the room; one plus three autocannon hits by hand also do; a level-2 room holds its wear at 0', () => {
    expect(PEW_ROOM_WEAR).toBe(3);
    const st = arena([1, 1, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [3, 0, 0], hull - 1]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ ship: 1, hull: true, stripped: false, room: Room.Weapons, level: false });
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[1, 0, 0], [0, 0, 0], hull - 2]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ room: Room.Weapons, level: true });
    land(st, 1, Room.Weapons + 1, 'pew'); land(st, 3, Room.Weapons + 1);   // one pew pew hit and three autocannon hits by hand share the counter
    expect([t.rooms[Room.Weapons], t.gunRoomWear[Room.Weapons]]).toEqual([2, 0]);
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms[Room.Weapons], t.gunRoomWear[Room.Weapons]]).toEqual([2, 0]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ room: Room.Weapons, level: false, hull: true });
  });
  it("pew pew on AUTO (an untagged round) is hull only, and so is the Hunter's pew on the crew", () => {
    const st = arena([1, 1, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 2, 0, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [0, 0, 0], hull - 2]);
    expect(hits(st, 'pewHit').every((e) => e.room === -1 && !e.level)).toBe(true);
    const own = st.systems[0]!, ownHull = own.hull; own.shields = 0;
    placeRound(st, { x: 0, y: 1500 - 30, vx: 0, vy: 900, age: 0, owner: 1 }, st.pew); stepPew(st);   // the Hunter's round, into the Hound
    expect([own.rooms, own.gunRoomWear, own.hull]).toEqual([[0, 0, 0], [0, 0, 0], ownHull - 1]);
  });
  it('shield hits by either gun are unchanged, tagged or not, the weak frequency included', () => {
    for (const tag of [0, Room.Engines + 1]) {
      const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
      t.shields = 2; st.systems[0]!.freq = (st.weakFreq + 1) % 3;   // off the weak frequency
      land(st, AUTOCANNON.hitsPerLayer, tag);
      expect([t.shields, t.rooms, t.gunRoomWear], `tag ${tag}`).toEqual([1, [0, 0, 0], [0, 0, 0]]);
      land(st, 1, tag, 'pew');
      expect([t.shields, t.rooms, t.gunRoomWear, t.hull], `tag ${tag}`).toEqual([0, [0, 0, 0], [0, 0, 0], hull]);   // a strip costs no hull and wears no room
      expect(hits(st, 'pewHit').at(-1)).toMatchObject({ stripped: true, hull: false, room: -1, level: false });
      const weak = arena([1, 3, 1]), w = weak.systems[1]!;
      w.shields = 2; weak.systems[0]!.freq = weak.weakFreq;
      land(weak, AUTOCANNON.weakHitsPerLayer!, tag);
      expect(w.shields, `weak, tag ${tag}`).toBe(1);
      w.shields = 2; land(weak, 1, tag, 'pew');
      expect([w.shields, w.rooms, w.gunRoomWear], `weak pew, tag ${tag}`).toEqual([0, [0, 0, 0], [0, 0, 0]]);   // two layers on the weak frequency
    }
  });
  it("the Valkyrn's gun keeps the room under the round, whatever lock says", () => {
    const v = createTacticalState(5, 2, ShipClass.Valkyrn), t = v.systems[1]!;
    v.rocks.fill(0); t.shields = 0; v.systems[0]!.lock = Room.Engines;
    Object.assign(v.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
    Object.assign(v.ships[1], { x: 0, y: 1380, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
    for (let k = 0; k < GUN.hitsPerLevel; k++) { placeRound(v, { x: 0, y: 1410, vx: 0, vy: -700, age: 0, owner: 0 }); stepRounds(v); }
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 1, 0], [0, 0, 0]]);   // through the middle: Shields, the room under the round
  });
});

describe('an AUTO torpedo with no torpedo lock follows the target room (amendment §3.1)', () => {
  it('it strikes the room lock names as it lands, so stepping the room while it flies moves the strike; one launched with a torpedo lock keeps its room', () => {
    const st = arena([1, 1, 1]), s = st.systems[0]!, t = st.systems[1]!, h = st.ships[1]!;
    /** Launch an AUTO torpedo (as F does, through launchMissile) with these locks, change lock in flight, and land it on the Hunter. */
    const strike = (lockAtLaunch: number, torpLock: number, lockAtImpact: number): number[] => {
      t.rooms = [0, 0, 0]; s.lock = lockAtLaunch; s.torpLock = torpLock; s.torpManual = false; s.magazine = 1;
      launchMissile(st, 0);
      s.lock = lockAtImpact;   // E / Q while it flies
      Object.assign(missileOf(st, 0)!, { x: h.x, y: h.y, age: 100 });
      resolveMissiles(st);
      return [...t.rooms];
    };
    expect(strike(Room.Shields, -1, Room.Engines)).toEqual([0, 0, 1]);   // no torpedo lock: the room lock names when it lands
    expect(strike(Room.Shields, Room.Weapons, Room.Engines)).toEqual([1, 0, 0]);   // launched with a torpedo lock: it keeps that room
  });
});

describe("the round's room in the hash and the snapshot (amendment §3.3)", () => {
  it("ROUND_SLOT is 8; a recycled pool entry takes the new round's tag; an ended entry holds zeros; roundRoom reads a tag", () => {
    expect(ROUND_SLOT).toBe(8);
    expect(emptyRound().room).toBe(0);
    const st = arena([1, 1, 1]);
    for (let k = 0; k < st.pew.length; k++) placeRound(st, { x: 0, y: 0, vx: 0, vy: 0, age: k, owner: 0, room: 3 }, st.pew);
    const e = placeRound(st, { x: 1, y: 1, vx: 0, vy: 0, age: 0, owner: 1 }, st.pew);   // a full pool: the oldest entry is recycled, and no tag is given
    expect([e.owner, e.room]).toEqual([1, 0]);
    expect([roundRoom(0), roundRoom(1), roundRoom(2), roundRoom(3), roundRoom(4)]).toEqual([-1, Room.Weapons, Room.Shields, Room.Engines, -1]);
  });
  it('bounds: 0..3, 0 on a free entry, nonzero only on a crew round', () => {
    const bad = (f: (st: TacticalState) => void): string => { const st = arena([1, 1, 1]); f(st); try { validateTacticalValues(st, flattenTactical(st)); return 'ok'; } catch (e) { return String((e as Error).message); } };
    const fly = (st: TacticalState, owner: number, room: number, pool = st.rounds): void => { Object.assign(pool[0]!, { active: true, owner, x: 5, y: 5, vx: 1, vy: 1, age: 1, room }); };
    expect(bad((st) => { fly(st, 0, 3); fly(st, 0, 1, st.pew); })).toBe('ok');
    expect(bad((st) => fly(st, 0, 4))).toMatch(/rounds\.0\.room/);
    expect(bad((st) => fly(st, 0, -1, st.pew))).toMatch(/pew\.0\.room/);
    expect(bad((st) => fly(st, 1, 2))).toMatch(/rounds\.0\.room/);   // the Hunter's round is never tagged
    expect(bad((st) => { st.rounds[0]!.room = 1; })).toMatch(/rounds\.0\.room/);   // a free entry holds zeros
  });
  it('a snapshot with tagged rounds in flight round-trips', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d.tactical.rounds[3]!, { active: true, owner: 0, x: 40, y: 50, vx: 700, vy: 0, age: 2, room: 2 });
      Object.assign(d.tactical.pew[1]!, { active: true, owner: 0, x: 60, y: 70, vx: 0, vy: -900, age: 1, room: 3 });
      const back = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, 'w4'), 'w4');
      try { expect([back.tactical.rounds[3]!.room, back.tactical.pew[1]!.room, hashDuel(back)]).toEqual([2, 3, hashDuel(d)]); } finally { disposeDuel(back); }
    } finally { disposeDuel(d); }
  });
});
```

If `loadDuelSnapshot` or `saveDuelSnapshot` takes its arguments in another order than `app/duel/onlineDuel.ts`'s `freeze` passes them (`loadDuelSnapshot(layout, saveDuelSnapshot(d, digest), digest)`), follow that call and keep the assertions.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Rooms.test.ts`
Expected: FAIL (`roundRoom`, `PEW_ROOM_WEAR` and `ROUND_SLOT` 8 do not exist; `laserLock` is `unavailable` on the Hound; a round has no `room`).

- [ ] **Step 3: The round's room in the state, and the event**

In `src/renderer/src/sim/tactical/state.ts`:

1. Replace

```ts
/** Valkyrn spec §7.2: a gun round in the pool: its position, velocity (u/s) and ticks flown, the ship slot that fired
 *  it, and whether it flies. A free entry holds zeros. */
export interface GunRound { x: number; y: number; vx: number; vy: number; age: number; owner: number; active: boolean }
/** A free round pool entry. */
export function emptyRound(): GunRound { return { x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false }; }
```

with

```ts
/** Valkyrn spec §7.2: a gun round in the pool: its position, velocity (u/s) and ticks flown, the ship slot that fired
 *  it, and whether it flies. W-4 amendment §3.3: `room`, the target room it was fired at: 0 for none, else the Room index
 *  + 1 (1 Weapons, 2 Shields, 3 Engines); set only on a round the crew fires by hand from a turret, and never changed in
 *  flight. A free entry holds zeros. */
export interface GunRound { x: number; y: number; vx: number; vy: number; age: number; owner: number; active: boolean; room: number }
/** A free round pool entry. */
export function emptyRound(): GunRound { return { x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false, room: 0 }; }
/** W-4 amendment §3.3: the Room a round's tag names (tag − 1), or −1 for an untagged round (0) or any other value. */
export function roundRoom(tag: number): -1 | 0 | 1 | 2 { return tag === 1 ? 0 : tag === 2 ? 1 : tag === 3 ? 2 : -1; }
```

2. In `DuelEvent`, replace

```ts
  /** W-1: ship `owner`'s pew round hit ship `ship` at (x, y): `stripped` it took a shield layer, `hull` it cost hull. */
  | { kind: 'pewHit'; ship: number; owner: number; stripped: boolean; hull: boolean; x: number; y: number }
```

with

```ts
  /** W-1: ship `owner`'s pew round hit ship `ship` at (x, y): `stripped` it took a shield layer, `hull` it cost hull.
   *  W-4 amendment §3.4: `room` the Room a round fired by hand wore (−1 for none, and on a shield hit) and `level` whether
   *  that raised its level, as gunHit has. */
  | { kind: 'pewHit'; ship: number; owner: number; stripped: boolean; hull: boolean; room: number; level: boolean; x: number; y: number }
```

In `src/renderer/src/sim/tactical/tuning.ts`, after `GUN_HITS_PER_LEVEL`'s line add:

```ts
/** W-4 amendment §3.4: the wear a pew pew hit by hand adds to its target room's gunRoomWear (the autocannon's counter, a
 *  level at the owner's gun's hitsPerLevel, 6): two hits a level. */
export const PEW_ROOM_WEAR = 3;
```

- [ ] **Step 4: The hash and the bounds**

In `src/renderer/src/sim/tactical/hash.ts`:

1. Replace

```ts
/** Values per round pool entry: active, owner, then x, y, vx, vy, age (zeros when free); Valkyrn spec §7.3. */
export const ROUND_SLOT = 7;
```

with

```ts
/** Values per round pool entry: active, owner, then x, y, vx, vy, age, then (W-4 amendment §3.3) the room (zeros when
 *  free); Valkyrn spec §7.3. */
export const ROUND_SLOT = 8;
```

2. Replace `type MissingRoundKeys = Exclude<keyof GunRound, (typeof ROUND_KEYS)[number] | 'active' | 'owner'>;` with `type MissingRoundKeys = Exclude<keyof GunRound, (typeof ROUND_KEYS)[number] | 'active' | 'owner' | 'room'>;   // W-4 amendment §3.3: room is its own field`. `ROUND_KEYS` (the `flight` vector) is unchanged, so the Valkyrn digest can leave the new field out by name.
3. In `roundFields`, after the `flight` field's closing `}` (the last element of the returned array) add a comma and:

```ts
    scalar(`${pool}.${k}.room`, (s) => s[pool][k]!.room, (s, v) => { s[pool][k]!.room = v; })   // W-4 amendment §3.3: the target room it was fired at, a field of its own after the flight
```

   and extend the function's doc comment: "W-4 amendment §3.3: then its room."
4. In `validateTacticalValues`'s round branch, replace

```ts
      const key = round[3]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
```

with

```ts
      // W-4 amendment §3.3: the room closes the entry, after the flight's ROUND_KEYS.length values (as a missile's manual bit).
      const key = round[3]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : key === 'flight' ? 2 : 2 + ROUND_KEYS.length)]!;
```

   and after the branch's `age out of range` line add:

```ts
      if (active === 1 && key === 'room') {   // W-4 amendment §3.3: 0 none, else a Room index + 1; only a crew round is tagged
        if (!within(0, 3)(slice[0]!)) bad('room is not 0..3');
        // The owner's class is not checked: rounds are in the space module, validated before the ship module where the classes are learned.
        if (slice[0] !== 0 && values[at - 1 - ROUND_KEYS.length] !== CREW_SLOT) bad('only a crew round carries a room');   // the entry's owner
      }
```

   A free entry's room is already held at 0 by the branch's `a free entry holds values` line.
5. In `validateTacticalValues`'s doc comment, after "an age within the longest gun life (the gun's round pool and the pew's alike, W-1)" add ", and (W-4 amendment §3.3) a room 0..3 that is nonzero only on a crew round".

- [ ] **Step 5: The autocannon: the tag at the muzzle and at the hit**

In `src/renderer/src/sim/tactical/gun.ts` (add `roundRoom` to its `./state` import):

1. `placeRound` (Decision 19): replace

```ts
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active'>, pool: GunRound[] = state.rounds): GunRound {
```

with

```ts
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active' | 'room'> & { room?: number }, pool: GunRound[] = state.rounds): GunRound {
```

   and its `Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true });` with `Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true, room: r.room ?? 0 });   // W-4 amendment §3.3: a recycled entry takes the new round's tag (none unless given)`. Add to its doc comment: "W-4 amendment §3.3: `room` the round's tag (absent 0, none)."
2. `fireRound` (Task 4 gave it `manual = false`): add a fifth parameter, `room = 0`, and in its `placeRound(state, { … })` literal change `age: 0, owner: i` to `age: 0, owner: i, room`. Add to its doc comment: "W-4 amendment §3.3: `room` tags the round (the autocannon in hand: its ship's lock + 1)."
3. `tickGun`: replace Task 7's last line

```ts
  if (hand ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g, hand);
```

with

```ts
  if (hand ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g, hand, hand ? s.lock + 1 : 0);   // W-4 amendment §3.3: a round fired by hand carries the target room; an AUTO-driven gun's carries none
```

   The Valkyrn's `fireRound(state, i, g)` above it is unchanged: its rounds carry 0.
4. `gunHit`: change its signature to `function gunHit(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number, tag = 0): void {` and replace its unshielded part

```ts
  const room = gunRoomOf(state, k, ox, oy, nx, ny);
  const hull = ++t.gunHull >= g.hitsPerHull;   // this hit takes a hull point (spec §7.3: only it is the terminal cause gun)
  if (hull) { t.hull = Math.max(0, t.hull - 1); t.gunHull = 0; }
  let level = false;   // this hit raised the Room's level (the view's ROOM HIT / OFFLINE callout)
  if (t.rooms[room] < 2) { if (++t.gunRoomWear[room] >= g.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
  else t.gunRoomWear[room] = 0;
  state.events.push({ kind: 'gunHit', ship: k, room, stripped: false, hull, level, x, y });
```

with

```ts
  // W-4 amendment §3.4: a turret gun's round wears the room it was fired at (its tag, wherever on the ship it lands), and an
  // untagged one (AUTO's) wears no room: room −1, level false. The Valkyrn's gun (no turret) keeps the room under the round.
  const room = g.turret === null ? gunRoomOf(state, k, ox, oy, nx, ny) : roundRoom(tag);
  const hull = ++t.gunHull >= g.hitsPerHull;   // this hit takes a hull point (spec §7.3: only it is the terminal cause gun)
  if (hull) { t.hull = Math.max(0, t.hull - 1); t.gunHull = 0; }
  let level = false;   // this hit raised the Room's level (the view's ROOM HIT / OFFLINE callout)
  if (room !== -1) {
    if (t.rooms[room] < 2) { if (++t.gunRoomWear[room] >= g.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
    else t.gunRoomWear[room] = 0;
  }
  state.events.push({ kind: 'gunHit', ship: k, room, stripped: false, hull, level, x, y });
```

   The shield branch above it is unchanged, the weak frequency included. For the Valkyrn every statement runs as before, in the same order (`room` is never −1 there). Extend the doc comment: "W-4 amendment §3.4: `tag` the round's room; a turret gun wears that room (none for an untagged round)."
5. `stepRounds`: `if (ship >= 0) gunHit(state, r.owner, ship, ox, oy, r.x, r.y);` becomes `if (ship >= 0) gunHit(state, r.owner, ship, ox, oy, r.x, r.y, r.room);` (the entry is emptied only after it, on the line below).

- [ ] **Step 6: Pew pew: the tag at the muzzle and at the hit**

In `src/renderer/src/sim/tactical/pew.ts` (add `roundRoom` to its `./state` import and `PEW_ROOM_WEAR` to its `./tuning` import):

1. `firePew`: change its signature to `export function firePew(state: TacticalState, i: number, aim: number, room = 0): boolean {`, and in its `placeRound` call change `age: 0, owner: i }, state.pew);` to `age: 0, owner: i, room }, state.pew);`. Add to its doc comment: "W-4 amendment §3.3: `room` tags the round (0: none)."
2. Replace `export function firePewTrigger(state: TacticalState, i: number): boolean { return firePew(state, i, pewAimFine(state, i)); }` with `export function firePewTrigger(state: TacticalState, i: number, room = 0): boolean { return firePew(state, i, pewAimFine(state, i), room); }`.
3. Replace `pewHit` (its doc comment and body) with:

```ts
/** Owner's pew round hit ship k at (x, y) (spec §1): with a shield layer up it strips one (the shield clock and the gun's
 *  wear go to 0, as any strip; W-4 spec §5.2: two on the weak frequency from the crew's turret pew); else it costs the owner's
 *  pew hull. W-4 amendment §3.4: an unshielded hit by a tagged round (`tag`, a round the crew fired by hand) of the crew's
 *  turret pew also adds PEW_ROOM_WEAR to its target room's gunRoomWear, the autocannon's counter: at the owner's gun's
 *  hitsPerLevel the room's level rises and the wear goes to 0, and on a level-2 room the wear is held at 0. An untagged round,
 *  the Hunter's pew and a class with no gun never wear a room. The owner counts the hit; a pewHit event marks it, with the
 *  room worn (−1 none) and whether its level rose. */
function pewHit(state: TacticalState, owner: number, k: number, x: number, y: number, tag = 0): void {
  const cls = classOf(state, owner), def = cls.slots.pew, gun = cls.slots.gun, t = state.systems[k]!;
  if (!def) return;
  state.systems[owner]!.pewHits++;
  const stripped = t.shields > 0;
  // W-4 spec §5.2: the crew's turret pew (the Hound's) on the enemy's weak frequency strips 2 layers (as many as are up).
  const weak = owner === CREW_SLOT && def.turret !== null && state.systems[owner]!.freq === state.weakFreq;
  let room: -1 | 0 | 1 | 2 = -1, level = false;
  if (stripped) { t.shields -= weak ? Math.min(2, t.shields) : 1; t.shieldClock = 0; t.gunWear = 0; }
  else {
    t.hull = Math.max(0, t.hull - def.hull);
    if (owner === CREW_SLOT && def.turret !== null && gun !== null) room = roundRoom(tag);   // W-4 amendment §3.4
    if (room !== -1 && gun !== null) {
      if (t.rooms[room] < 2) { if ((t.gunRoomWear[room] += PEW_ROOM_WEAR) >= gun.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
      else t.gunRoomWear[room] = 0;
    }
  }
  state.events.push({ kind: 'pewHit', ship: k, owner, stripped, hull: !stripped, room, level, x, y });
}
```

   (`gunRoomWear` stays inside its bound, 0 to `hitsPerLevel` − 1: the sum resets whenever it reaches the threshold.)
4. `stepPew`: `else if (hit === 'ship') pewHit(state, r.owner, k, ox + (r.x - ox) * best, oy + (r.y - oy) * best);` becomes `else if (hit === 'ship') pewHit(state, r.owner, k, ox + (r.x - ox) * best, oy + (r.y - oy) * best, r.room);`.

- [ ] **Step 7: The lock's write and its admission (amendment §3.2)**

`src/renderer/src/sim/tactical/weapons.ts` (add `import { hasTurret } from './defs';`), in `applyWeaponsInput`:

1. Directly after the laser's lock block (the `if (armed && input.weapons && input.laserLock !== null && validTarget(input.laserLock)) { … }` statement, which is the first in the function), add:

```ts
  // W-4 amendment §3.2: on a class with a turret gun and no laser (the Hound) laserLock is the target room's command. It sets
  // the crew's lock and nothing else: laserTargeted stays false and laserRock is not touched. Here, first in the tick's
  // order (before tickGun and the pew), so a round fired by hand this tick carries the new room.
  if (!armed && crew && hasTurret(classOf(state, i)) && input.weapons && input.laserLock !== null && validLock(input.laserLock)) s.lock = input.laserLock;
```

2. Replace Task 7's first pew line

```ts
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's MAN pewFire, along the turret; last, as before
```

with

```ts
  // W-4 amendment §3.3: a clicked shot carries the target room, in hand that tick or not (a held weaponSel can trail the command online).
  if (input.pewTrigger) firePewTrigger(state, i, crew && classOf(state, i).slots.pew?.turret ? s.lock + 1 : 0);   // W-4 spec §6, §8: the crew's MAN pewFire, along the turret; last, as before
```

   Task 7's AUTO line under it (`else if (auto.pew && hostile && pewAutoReady(state, i)) firePewTrigger(state, i);`) and the Hunter's `firePew(state, i, input.pewAim)` stay: their rounds carry 0.
3. Add to `applyWeaponsInput`'s doc comment: "W-4 amendment §3.2: on a turret class without a laser `laserLock` sets the lock (the target room) alone."

`src/renderer/src/sim/duel/step.ts`:

1. Replace the no-laser line

```ts
    if ((c.kind === 'laserMode' || c.kind === 'laserLock' || c.kind === 'laserCharge' || c.kind === 'laserFire' || (c.kind === 'rockLock' && c.weapon === 'laser')) && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser; W-2: nor its mode or MANUAL shot
```

with

```ts
    // Valkyrn spec §6.1: no laser; W-2: nor its mode or MANUAL shot. W-4 amendment §3.2: on a class with a turret gun (the Hound) laserLock is the target room's command, so it is not caught here.
    if ((c.kind === 'laserMode' || (c.kind === 'laserLock' && !hasTurret(classOf(d.tactical, 0))) || c.kind === 'laserCharge' || c.kind === 'laserFire' || (c.kind === 'rockLock' && c.weapon === 'laser')) && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }
```

2. In the `laserLock` branch, between its `malformed` check and its seen check, add the −1 rule, so the branch reads:

```ts
    else if (c.kind === 'laserLock') {
      if (!validTarget(c.room)) { result(e, 'malformed'); continue; }
      if (c.room < 0 && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // W-4 amendment §3.2: the Hound's target room has no "none": nothing to clear
      if (c.room >= 0 && !shipSeen(d.tactical, d.tactical.systems[0].target)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4: seen
      crew.laserLock = c.room;   // −1 clears the laser's target (a laser class only)
    }
```

   So on the Hound the order is the amendment's: stale-tick, `not-at-weapons`, `malformed`, `unavailable` for −1, `unavailable` unseen, else admitted. On a class with a laser nothing changes; on the Valkyrn (no laser, no turret) the no-laser line still answers `unavailable`. (The "Task 10" in that comment is the Engineering spike's own task number, already in the code.)

- [ ] **Step 8: The literals and the pinned lists that follow**

`pewHit`'s two new members are required (Decision 25). Add `room: -1, level: false,` after the `hull:` member of each of these `pewHit` literals (kind (a), W-4 amendment §3.4; none of them is a hit by hand):
- `src/renderer/src/app/duel/onlineSource.ts`, in `gapEvents`: `{ kind: 'pewHit', ship: target, owner: i, stripped: false, hull: false, x: tgt.x, y: tgt.y }`; and extend the comment above it: "nor the room (W-4 amendment §3.4: online a room hit by a gun shows no callout, as the gun's)".
- `tests/engineeringFog.test.ts`: the two literals `crewHitsEnemy` and `enemyHitsCrew`.
- `tests/pewUi.test.tsx`: the two literals passed to `duelEventSounds`.
- `tests/pewViews.test.ts`: the two literals passed to `pushPewHits`.
- `tests/pewRounds.test.ts`: the `toEqual([{ kind: 'pewHit', ship: 1, owner: 0, stripped: true, hull: false, … }])` expectation (an exact match on the event).

`tests/valkyrnIdentity.test.ts` (amendment §3.3):
1. Replace Task 3's `const W4B_FIELDS = /^systems\.\d+\.(pewTurret|gunTurret|pewManual|gunManual)$/;` with `const W4B_FIELDS = /^(systems\.\d+\.(pewTurret|gunTurret|pewManual|gunManual)|(rounds|pew)\.\d+\.room)$/;`.
2. In `run`, after the `for (const s of d.tactical.systems) zero &&= …;` line add `for (const r of d.tactical.rounds) zero &&= r.room === 0; for (const r of d.tactical.pew) zero &&= r.room === 0;`.
3. In the header comment, after "pewManual and gunManual by name" add "and the two round pools' room fields (rounds.<k>.room, pew.<k>.room; W-4 amendment §3.3)". In the doc comment above `W4B_FIELDS`, change "the four W-4b fields" to "the four W-4b fields and each round's room".

The five pinned strings stay exactly as they are: the left-out values are the new ones only, and the `flight` vector is unchanged.

`tests/tacticalDeterminism.test.ts`: the flatten key guard's length line multiplies the two pools by `ROUND_SLOT`, so it follows the constant by itself. Add to the comment above it: "W-4 amendment §3.3: ROUND_SLOT is 8 (each round's room)."

- [ ] **Step 9: The two W-4a tests whose rules change here (kind (a), amendment §5)**

`tests/w4PewFire.test.ts`: the case `"every laser command from the Hound's Weapons seat is unavailable, except laserFrequency (W-4 spec §2.1, §14 Loadout)"`:
- rename it `"every laser command from the Hound's Weapons seat is unavailable, except laserFrequency and laserLock (W-4 spec §2.1, §14 Loadout; amendment §3.2)"`;
- drop `{ kind: 'laserLock', room: 1 }, ` from its `laser` list (the four others stay, and the expectation, which maps the list, follows);
- change the `holdInSight` line's comment from "so laserLock is judged by the laser rule, not the sight rule" to "the enemy seen, as before (laserLock's own cases are in tests/w4Rooms.test.ts)".

`tests/w4Autocannon.test.ts`: replace the case `'six unshielded hits raise a room a level (gunHit as the Valkyrn\'s)'` (after Task 7 its loop fires with `tickGun(st, 0, IDLE_INPUT, true)`) with:

```ts
  it('six unshielded hits by hand raise the target room a level; the same rounds on AUTO raise none (W-4 amendment §3.4)', () => {
    const st = hound(3), s = st.systems[0]!;
    Object.assign(st.ships[1], { x: 0, y: 1500 - 120, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
    st.systems[1]!.shields = 0;
    s.gunManual = true; s.lock = Room.Engines;   // in hand: its own switch on MAN, and selected
    let levelled = false;
    for (let k = 0; k < 200 && !levelled; k++) {
      st.events = []; tickGun(st, 0, { ...TRIGGER, weaponSel: 1 }); stepRounds(st);
      levelled = st.events.some((e) => e.kind === 'gunHit' && e.level && e.room === Room.Engines);
    }
    expect(levelled).toBe(true);
    expect([s.gunHits, st.systems[1]!.rooms]).toEqual([6, [0, 0, 1]]);   // the tagged room, wherever the rounds landed
    const auto = hound(3);
    Object.assign(auto.ships[1], { x: 0, y: 1500 - 120, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
    auto.systems[1]!.shields = 0;
    for (let k = 0; k < 120; k++) { tickGun(auto, 0, IDLE_INPUT, true); stepRounds(auto); }
    expect(auto.systems[0]!.gunHits).toBeGreaterThanOrEqual(6);
    expect([auto.systems[1]!.rooms, auto.systems[1]!.gunRoomWear]).toEqual([[0, 0, 0], [0, 0, 0]]);
  });
```

and in the file's header comment change "and gunHit's room level after 6 hits" to "and, by hand, the target room's level after 6 hits (W-4 amendment §3.4)".

- [ ] **Step 10: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Rooms.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4Turret.test.ts tests/w4Frequency.test.ts tests/w4Rocks.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/engineeringFog.test.ts tests/pewUi.test.tsx tests/pewViews.test.ts tests/pewRounds.test.ts tests/valkyrnGun.test.ts tests/valkyrnRounds.test.ts tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/duelScripted.test.ts`
Expected: tsc clean (every hand-placed round in `tests/` compiles unchanged: `room` is optional there, Decision 19); all PASS except the known-red whole-run values (`duelModules`' `played(…)`, `duelScripted`'s). `valkyrnIdentity`'s five pins are unchanged, and `git diff --stat W4_BASE -- tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts` prints nothing. `duelModules`' member walk and "every field moves the hash" pass with no edit: `rounds.<k>.room` is a module field whose name is the member's path.

- [ ] **Step 11: Classify the fallout, and the gates**

Run: `npx electron-vite build` then `npx vitest run --maxWorkers=4 2>&1 | tail -80`
Expected: only the known-red window. Any other red test: apply the fallout rule. A test that expects an AUTO round of the Hound's autocannon to raise a room, a hit by hand to wear the room under the round, `laserLock` to be refused on the Hound, or a `pewHit` event without `room` and `level`, is kind (a) (W-4 amendment §3.2, §3.4); list each in the commit body.

Then: `npx vitest run tests/duelGates.test.ts` and `npx tsx scripts/duel-telemetry.ts`. Under `## W-4b` in the report, add a section "After Task 8 (AUTO rounds wear no room)": the per-seed lines and the summary, beside Task 7's, so Task 13 can show what the rule cost the bots. A failing per-seed test stays in the known-red window until Task 13.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/duel/step.ts src/renderer/src/app/duel/onlineSource.ts tests/w4Rooms.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/engineeringFog.test.ts tests/pewUi.test.tsx tests/pewViews.test.ts tests/pewRounds.test.ts tests/valkyrnIdentity.test.ts tests/tacticalDeterminism.test.ts docs/superpowers/research/2026-11-19-w4-report.md <each kind (a) test fixed in Step 11>
git commit -m "feat(w4b): the target room: laserLock sets it on the Hound, rounds fired by hand carry it (a hashed room per round, ROUND_SLOT 8), the autocannon by hand wears it and on AUTO wears no room, pew pew by hand adds PEW_ROOM_WEAR; pewHit names the room (W-4 amendment §3.1 to §3.4)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The online prediction of the own selected turret (spec §11)

**Files:**
- Modify: `src/renderer/src/app/duel/weaponsSeat.ts` (`predictTurret`), `app/duel/onlineSource.ts` (`turret`, `gunModeBase`), `app/duel/onlineDuel.ts` (feed `gunModeBase`), `app/duel/runtime.ts` (`turret`), `app/duel/scene.ts` (`DuelViewSource.turret?`)
- Modify: `tests/w4Online.test.ts`

**Interfaces:**
- Consumes: `slewTurret` (turret.ts), `weaponBars`, `WeaponSlot`, `houndWeaponsSeat`, the source's `sentHeld` and `unackedFrames`, `gunModeSent` (Task 6).
- Produces: `predictTurret(t: TacticalState, slot: 0 | 1, held: Pick<HeldInput, 'weaponSel' | 'turretAim'>, manual: boolean, k: number): number`; `DuelViewSource.turret?(slot: 0 | 1): number`; the online source's `turret(slot)` and `gunModeBase(slot: 0 | 1, manual: boolean | null)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/w4Online.test.ts` (imports: `predictTurret` from `../src/renderer/src/app/duel/weaponsSeat`, `stepDuelTick` from `../src/renderer/src/sim/duel/step`):

```ts
describe('the predicted own turret (W-4 spec §11)', () => {
  /** A seated Hound duel in MAN with the Hunter far off (no AUTO), and the gunner's held frame with the selection and reticle. */
  function rig(sel: number, aim: number) {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    Object.assign(d.tactical.systems[0], { pewManual: true, gunManual: true });   // both switches on MAN: the selected gun is in hand
    Object.assign(d.tactical.ships[1], { x: 6000, y: 6000 });
    const gunnerHeld = { moveX: 0, moveY: 0, interactHeld: false, weaponSel: sel, turretAim: aim };
    const held = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]; held[g] = gunnerHeld;
    return { d, held, gunnerHeld };
  }
  it('equals the authority\'s turret after k stepped ticks with the same held frame (k = 0, 1, 5, 30)', () => {
    for (const k of [0, 1, 5, 30]) {
      const { d, held, gunnerHeld } = rig(0, 9000);
      try {
        const heading = d.tactical.ships[0].heading, want = predictTurret(d.tactical, 0, gunnerHeld, true, k);
        for (let n = 0; n < k; n++) stepDuelTick(d, { held, commands: [] });
        expect(d.tactical.ships[0].heading, 'the heading stays fixed in this rig').toBe(heading);
        expect(d.tactical.systems[0].pewTurret, `k ${k}`).toBe(want);
      } finally { disposeDuel(d); }
    }
  });
  it('is the replica\'s turret (k treated as 0) in AUTO, at 0 bars, with the torpedo selected or with no reticle', () => {
    const { d, gunnerHeld } = rig(0, 9000);
    try {
      const t = d.tactical; t.systems[0].pewTurret = 100;
      expect(predictTurret(t, 0, gunnerHeld, false, 10)).toBe(100);
      expect(predictTurret(t, 1, { weaponSel: 1, turretAim: 9000 }, true, 10)).toBe(t.systems[0].gunTurret);   // the autocannon on 0 bars
      expect(predictTurret(t, 0, { weaponSel: 2, turretAim: 9000 }, true, 10)).toBe(100);
      expect(predictTurret(t, 0, { weaponSel: 0 }, true, 10)).toBe(100);
      expect(predictTurret(t, 0, gunnerHeld, true, 10)).not.toBe(100);
    } finally { disposeDuel(d); }
  });
});
```

Add to `tests/onlineDuelSession.test.ts`'s Hound block (the rig's replica is the published duel, never stepped, so its turret stays 0 and its mode AUTO):

```ts
  it("the source's turret(0) follows the reticle at MAN traverse while gunMode is in flight, then the replica's again", () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    // turretAim is a world fine aim and the spawn heading depends on the seed (map.ts spawnAt): aim 2000 steps right of the
    // replica's nose, inside the pew's ±10922 arc.
    const h0 = c.state()!.tactical.ships[0].heading, want = (h0 * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // AUTO: the replica's
    r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump(); r.pump(); r.session.frame();   // R with pew pew selected: its gunMode {slot: 0} is in flight
    const p = src().turret(0);
    expect(p > 0 && p <= 2000 && (p % 455 === 0 || p === 2000)).toBe(true);   // k unacknowledged frames of MAN's 455 a frame toward +2000
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('gunMode')]!;
    c.results.push({ id, tick: 3, status: 'applied' }); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // gunModeSent[0] cleared: the replica's mode (AUTO) is the base again
    r.dispose();
  });
  it("the prediction reads the selected gun's own mode: pew pew's MAN in flight does not move the autocannon's turret (amendment §2.6)", () => {
    const r = rig(1), sys = r.d.tactical.systems[0]!;
    sys.bars[1] = 3; sys.weaponPower = [1, 1, 1];   // the autocannon powered on the replica (an unpowered gun is never predicted)
    const c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    const h0 = c.state()!.tactical.ships[0].heading, want = (h0 * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want);
    tapKey(r, 'KeyR'); r.pump();   // pew pew, the selected weapon, to MAN (in flight)
    tapKey(r, 'Digit2'); r.pump(); r.pump(); r.session.frame();
    expect(src().turret(1)).toBe(0);   // the autocannon is selected and its own switch is AUTO: the replica's turret
    tapKey(r, 'KeyR'); r.pump(); r.pump(); r.session.frame();
    const p = src().turret(1);
    expect(p > 0 && p <= 2000 && (p % 341 === 0 || p === 2000)).toBe(true);   // its own gunMode in flight: MAN's 341 a frame
    r.dispose();
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Online.test.ts`
Expected: FAIL (`predictTurret` not exported).

- [ ] **Step 3: `predictTurret`**

In `app/duel/weaponsSeat.ts` add (with `import { slewTurret } from '../../sim/tactical/turret';`, `import { classOf, Outcome, type TacticalState } from '../../sim/tactical/state';`, and `weaponBars` beside `WeaponSlot`):

```ts
/** W-4 spec §11 (the crew Helm throttle's analogue, playtest2feedback Decision 14): the own seat's predicted turret for gun
 *  `slot` (0 pew pew, 1 the autocannon): slewTurret applied `k` times (the unacknowledged held frames) from the replica's
 *  turret, with the replica's heading held fixed, the latest sent reticle and the gun's MAN traverse and arc. The replica's
 *  turret as it is unless `manual` (that gun's own mode, amendment §2.6) is MAN, `slot` is the sent selection, the gun has a turret and a bar, a reticle was sent
 *  and the round runs. Only the drawn muzzle line uses it; rounds always come from the replica. */
export function predictTurret(t: TacticalState, slot: 0 | 1, held: Pick<HeldInput, 'weaponSel' | 'turretAim'>, manual: boolean, k: number): number {
  const s = t.systems[0], base = slot === 0 ? s.pewTurret : s.gunTurret, cls = classOf(t, 0), turret = (slot === 0 ? cls.slots.pew : cls.slots.gun)?.turret ?? null;
  const aim = held.turretAim ?? -1;
  if (!manual || held.weaponSel !== slot || turret === null || !Number.isInteger(aim) || aim < 0 || t.outcome !== Outcome.Running
    || weaponBars(s, slot === 0 ? WeaponSlot.Pew : WeaponSlot.Autocannon) < 1) return base;
  let v = base;
  for (let n = 0; n < k; n++) v = slewTurret(v, t.ships[0].heading, aim, turret.traverse[1], turret.arcSteps);
  return v;
}
```

- [ ] **Step 4: The sources**

`app/duel/scene.ts` `DuelViewSource`: add `/** W-4 spec §10, §11: gun slot's turret offset to draw (0 pew pew, 1 the autocannon): online the own seat's prediction, else the sim's. Absent: the sim's. */ turret?(slot: 0 | 1): number;`.

`app/duel/runtime.ts`: in `interface DuelRuntime` (it declares every returned member, and `createDuelRuntime` returns an object literal, so an undeclared member fails the excess-property check), after W-4a's `weaponSel(): number;` add `/** W-4 spec §11: gun slot's turret offset (the sim's; no lag locally). */ turret(slot: 0 | 1): number;`. Then, in the returned object after W-4a's `weaponSel: () => weaponSel,`, add `turret: (slot: 0 | 1) => (slot === 0 ? d.tactical.systems[0].pewTurret : d.tactical.systems[0].gunTurret),   // W-4 spec §11: no lag locally`.

`app/duel/onlineSource.ts`:
- imports: `houndWeaponsSeat` from `./controls` (beside `crewHelmSeat`), `predictTurret` from `./weaponsSeat`;
- state: beside `shownThrottle`, `let gunModeShown: [boolean | null, boolean | null] = [null, null];   // W-4 amendment §2.6: each gun's mode in flight, [pew pew, the autocannon]`;
- the source's type: add `turret(slot: 0 | 1): number; gunModeBase(slot: 0 | 1, manual: boolean | null): void;`;
- in the object, after W-4a's `weaponSel: ...`:

```ts
    /** W-4 spec §11: gun slot's turret: at the Hound's Weapons seat the own selected one predicted over the unacknowledged
     *  frames (predictTurret, the mode in flight first), else the replica's. */
    turret: (slot: 0 | 1): number => {
      const d = duel();
      if (!houndWeaponsSeat(d, seat)) return slot === 0 ? d.tactical.systems[0].pewTurret : d.tactical.systems[0].gunTurret;
      const sys = d.tactical.systems[0];
      return predictTurret(d.tactical, slot, sentHeld, gunModeShown[slot] ?? (slot === 0 ? sys.pewManual : sys.gunManual), unackedFrames);   // W-4 amendment §2.6: that gun's own mode
    },
    /** Gun `slot`'s mode in flight (onlineDuel's gunModeSent for it), or null: the replica's flag is the base. */
    gunModeBase(slot, manual) { gunModeShown[slot] = manual; },
```

`app/duel/onlineDuel.ts`: at both places that call `source?.throttleBase(throttleSent ? throttleSent.level : null);` add `for (const slot of [0, 1] as const) source?.gunModeBase(slot, gunModeSent[slot] ? gunModeSent[slot]!.manual : null);   // W-4 spec §11, amendment §2.6`.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Online.test.ts tests/onlineDuelSession.test.ts tests/onlineDuel.test.ts tests/valkyrnOnline.test.ts tests/w4Runtime.test.ts`
Expected: tsc clean; all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts tests/w4Online.test.ts
git commit -m "feat(w4b): the online seat predicts its own selected turret over the unacknowledged frames, as the throttle (W-4 spec §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The map: the selected arc, the muzzle lines, the reticle and the AUTO bracket

**Files:**
- Modify: `src/renderer/src/render/tactical/weaponsModel.ts` (`CombatModelInput`, `CombatDraw`, `combatModel`), `render/tactical/tacticalLayer.ts` (the draw), `app/duel/scene.ts` (the inputs)
- Create: `tests/w4Map.test.ts`

**Interfaces:**
- Consumes: `combatModel(input)` locals `own` (the interpolated own ship, `h` its fractional heading), `ownS`, `cls`, `z`, `enemyS`, `enemyShown`; `headingAngle(h)`, `drawnScale(z)` (tacticalModel.ts); `hasTurret`, `autoSolution`, `onSolution`, `slewTurret`, `turretWorldAim`, `handControl`, `enemyHostile`, `weaponBars`, `WeaponSlot`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, `AIM_STEPS`, `SHIP_RADIUS`; `DuelViewSource.turret?` / `weaponSel?`; the scene's `reticlePointer` (Task 6).
- Produces: `CombatModelInput.turrets?: { pew: number; gun: number } | null`, `weaponSel?: number`, `reticle?: Point | null`; `CombatDraw.turretArc: ArcDraw | null`, `muzzles: MuzzleDraw[]`, `reticle: Point | null`, `bracket: BracketDraw | null`; `interface MuzzleDraw extends Segment { selected: boolean }`, `interface BracketDraw { x: number; y: number; r: number; live: boolean }`.

- [ ] **Step 1: Write the failing test**

Write `tests/w4Map.test.ts` on `tests/pewViews.test.ts`'s rig (its `input()` helper, `vp` and `prevOf`), with the new fields passed through:

```ts
// W-4 spec §10 (W-4b): on the Hound's Weapons map the selected gun's arc about the nose (dim), each gun's muzzle line along
// its turret (the selected one mid, the other dim; the pew to PEW_RANGE, the autocannon to 600), the reticle at the pointer,
// and a bracket on the enemy while an AUTO-driven gun is on solution, tested one slew ahead within the tolerance (hot once
// hostile, dim in the hold; never for the gun in hand); no W-1 cone or aim line; on the Helm map the muzzle lines only,
// dim, and no reticle.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { headingAngle, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { autoSolution, slewTurrets } from '../src/renderer/src/sim/tactical/turret';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { AIM_STEPS, AUTOCANNON_ARC_STEPS, AUTOCANNON_AUTO_RANGE, PEW_ARC_STEPS, PEW_RANGE } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 }, Z = 0.5;
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', over: Partial<CombatModelInput> = {}): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), ...over };
}
/** The Hound at (0, 1500) nose north, still, the Hunter 300 u ahead on `bearing`; pew 1, autocannon 1. */
function scene(bearing = 0, cls?: number): { st: TacticalState; cam: Camera } {
  const st = createTacticalState(5, 2, cls), s = st.systems[0]!;
  s.bars[1] = 3; s.weaponPower = [1, 1, 1];
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * 300, y: 1500 + hy(bearing) * 300, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.rocks.fill(0); st.hostileAt = 0;
  return { st, cam: createCamera(0, 1500, Z) };
}
const angleOf = (m: { x1: number; y1: number; x2: number; y2: number }): number => Math.atan2(m.x2 - m.x1, -(m.y2 - m.y1));

describe("the Hound's Weapons map (W-4 spec §10)", () => {
  it("the selected arc is the selected gun's; none with the torpedo selected; no W-1 cone or aim line", () => {
    const { st, cam } = scene();
    const c0 = combatModel(input(st, cam, 'weapons', { weaponSel: 0 })), c1 = combatModel(input(st, cam, 'weapons', { weaponSel: 1 })), c2 = combatModel(input(st, cam, 'weapons', { weaponSel: 2 }));
    expect(c0.turretArc!.half).toBeCloseTo((PEW_ARC_STEPS / AIM_STEPS) * 2 * Math.PI, 12);
    expect(c1.turretArc!.half).toBeCloseTo((AUTOCANNON_ARC_STEPS / AIM_STEPS) * 2 * Math.PI, 12);
    expect(c2.turretArc ?? null).toBeNull();
    expect([c0.pewCone ?? null, c0.pewAim ?? null]).toEqual([null, null]);
  });
  it('the muzzle lines follow the turrets (input.turrets wins over the state) and the selection', () => {
    const { st, cam } = scene();
    const c = combatModel(input(st, cam, 'weapons', { weaponSel: 0, turrets: { pew: 2731, gun: -2731 } }));
    expect(c.muzzles!.map((m) => m.selected)).toEqual([true, false]);
    const [p, g] = c.muzzles!;
    expect(angleOf(p!)).toBeCloseTo(headingAngle(0) + (2731 / AIM_STEPS) * 2 * Math.PI, 9);
    expect(angleOf(g!)).toBeCloseTo(headingAngle(0) - (2731 / AIM_STEPS) * 2 * Math.PI, 9);
    expect(Math.hypot(p!.x2 - p!.x1, p!.y2 - p!.y1)).toBeCloseTo(PEW_RANGE * Z, 9);
    expect(Math.hypot(g!.x2 - g!.x1, g!.y2 - g!.y1)).toBeCloseTo(AUTOCANNON_AUTO_RANGE * Z, 9);
  });
  it('the reticle is the pointer on the Weapons map only', () => {
    const { st, cam } = scene(), at = { x: 700, y: 300 };
    expect(combatModel(input(st, cam, 'weapons', { reticle: at })).reticle).toEqual(at);
    expect(combatModel(input(st, cam, 'helm', { reticle: at })).reticle ?? null).toBeNull();
  });
  it('the AUTO bracket: when the next AUTO slew lands within the tolerance, live when hostile, dim in the hold; the gun in hand gets none, the gun out of hand in MAN does', () => {
    const { st, cam } = scene(6), s = st.systems[0]!, e = worldToScreen(cam, vp, st.ships[1].x, st.ships[1].y);
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).toBeNull();   // turrets at 0, the solutions 1536 away: more than a slew and the tolerance
    s.pewTurret = autoSolution(st, 0, 'pew')!;
    expect(combatModel(input(st, cam, 'weapons')).bracket).toMatchObject({ x: e.x, y: e.y, live: true });
    st.hostileAt = -1;
    expect(combatModel(input(st, cam, 'weapons')).bracket).toMatchObject({ live: false });
    st.hostileAt = 0; s.pewManual = true; s.gunManual = true;   // both switches on MAN: the selected gun is the one in hand
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 0 })).bracket ?? null).toBeNull();   // the pew is in hand; the autocannon (at 0) is off its solution
    s.gunTurret = autoSolution(st, 0, 'gun')!;
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 0 })).bracket).toMatchObject({ live: true });   // owner 2026-11-19: the autocannon fights on AUTO in MAN
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 1 })).bracket).toMatchObject({ live: true });   // the pew, now out of hand, sits on its solution
  });
  it('the bracket does not flicker: a turret one slew behind its lead still shows it; one beyond a slew and the tolerance does not (Decision 10)', () => {
    const { st, cam } = scene(6), s = st.systems[0]!, sol = autoSolution(st, 0, 'pew')!;
    s.pewTurret = sol - 364 - 182;   // the next slew (364) ends 182 short: on solution
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).not.toBeNull();
    s.pewTurret = sol - 364 - 183;
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).toBeNull();
  });
  it('the bracket stays on, frame after frame, while the moving Hound keeps its pew tracking a drifting lead (Decision 10)', () => {
    const { st, cam } = scene(0), own = st.ships[0];
    own.vx = 240;   // crossing under the Hunter 300 u ahead: the lead's whole-index bearing drifts every few ticks
    const shown: boolean[] = [];
    for (let k = 0; k < 60; k++) {
      slewTurrets(st, 0, IDLE_INPUT);   // the sim's AUTO slew, on the pre-move position
      own.x += own.vx / 60;   // then the ship moves, as the tick does
      if (k >= 10) shown.push((combatModel(input(st, cam, 'weapons')).bracket ?? null) !== null);   // the replica after the tick
    }
    expect(shown.every(Boolean)).toBe(true);
  });
  it('on the Helm map: two dim muzzle lines, no arc, no reticle, no bracket', () => {
    const { st, cam } = scene(6);
    st.systems[0]!.pewTurret = autoSolution(st, 0, 'pew')!;
    const c = combatModel(input(st, cam, 'helm', { reticle: { x: 1, y: 1 } }));
    expect(c.muzzles!.map((m) => m.selected)).toEqual([false, false]);
    expect([c.turretArc ?? null, c.reticle ?? null, c.bracket ?? null]).toEqual([null, null, null]);
  });
  it("the laser fit's Weapons map draws no muzzle lines (no turret)", () => {
    const { st, cam } = scene(0, ShipClass.ValkyrnLaser);
    expect(combatModel(input(st, cam, 'weapons')).muzzles ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Map.test.ts`
Expected: FAIL (no `turretArc` / `muzzles`).

- [ ] **Step 3: The model**

In `render/tactical/weaponsModel.ts`:

1. Imports: `hasTurret` from `../../sim/tactical/defs`; `autoSolution, onSolution, slewTurret, turretWorldAim` from `../../sim/tactical/turret`; `handControl` from `../../sim/tactical/state`; `enemyHostile` from `../../sim/tactical/science` (beside `pointSeen`); `weaponBars, WeaponSlot` from `../../sim/tactical/bars`; add `AUTOCANNON_AUTO_RANGE` to the tuning import.
2. After `Segment`, add:

```ts
/** W-4 spec §10: a gun's muzzle line along its turret; `selected` draws it mid (the selected gun on the Weapons map), else dim. */
export interface MuzzleDraw extends Segment { selected: boolean }
/** W-4 spec §10: AUTO's bracket on the enemy's drawn marker while a gun is on solution; `live` hot (hostile), else dim (the hold). */
export interface BracketDraw { x: number; y: number; r: number; live: boolean }
```

3. In `CombatDraw` (the interface with `pewCone?`), add `turretArc?: ArcDraw | null; muzzles?: MuzzleDraw[]; reticle?: Point | null; bracket?: BracketDraw | null;` with the doc "W-4 spec §10: the Hound's turrets".
4. In `CombatModelInput`, after `laserAim?`, add:

```ts
  /** W-4 spec §10, §11: the turret offsets to draw (online the own seat's predicted selected turret); absent: the state's. */
  turrets?: { pew: number; gun: number } | null;
  /** W-4 spec §10: the Hound's selected weapon (0..2); absent 0. */
  weaponSel?: number;
  /** W-4 spec §10: the reticle (the pointer on the open Weapons map, screen px), or null. */
  reticle?: Point | null;
```

5. Replace `if (input.console === 'weapons' && pewDef && input.ships.includes(0)) {` (W-1's cone) with `if (input.console === 'weapons' && pewDef && pewDef.turret === null && input.ships.includes(0)) {   // W-4: a turret pew draws its arc and muzzle line below`.
6. After that block, add:

```ts
  // W-4 spec §10: on a turret class (the Hound) the selected gun's arc about the drawn nose (dim), each gun's muzzle line
  // along its turret offset about the drawn nose (Decision 5: the hull carries the turret; the selected one mid on the
  // Weapons map, dim elsewhere), the reticle at the pointer, and a bracket on the enemy while an AUTO-driven gun (not in
  // hand: AUTO, or the other gun in MAN) is on its solution: the sim's test one tick ahead, from the replica's turret and
  // heading (Decision 10), so a drifting lead does not flicker it; hot once hostile, dim in the hold.
  let turretArc: ArcDraw | null = null, reticle: Point | null = null, bracket: BracketDraw | null = null;
  const muzzles: MuzzleDraw[] = [];
  if (hasTurret(cls) && input.ships.includes(0)) {
    const sys = state.systems[0]!, base = headingAngle(own.h), sel = input.weaponSel ?? 0, onWeapons = input.console === 'weapons';
    const turrets = input.turrets ?? { pew: sys.pewTurret, gun: sys.gunTurret };
    for (const [slot, def, range, off] of [[0, cls.slots.pew, PEW_RANGE, turrets.pew], [1, cls.slots.gun, AUTOCANNON_AUTO_RANGE, turrets.gun]] as const) {
      const t = def?.turret ?? null;
      if (!t) continue;
      const a = base + (off / AIM_STEPS) * 2 * Math.PI, r = range * z, chosen = onWeapons && slot === sel;
      muzzles.push({ x1: ownS.x, y1: ownS.y, x2: ownS.x + Math.sin(a) * r, y2: ownS.y - Math.cos(a) * r, selected: chosen });
      if (chosen) turretArc = { x: ownS.x, y: ownS.y, r, angle: base, half: (t.arcSteps / AIM_STEPS) * 2 * Math.PI };
    }
    if (onWeapons) reticle = input.reticle ?? null;
    const on = (gun: 'pew' | 'gun'): boolean => {
      const slot = gun === 'pew' ? WeaponSlot.Pew : WeaponSlot.Autocannon, t = (gun === 'pew' ? cls.slots.pew : cls.slots.gun)?.turret ?? null;
      if (!t || weaponBars(sys, slot) < 1 || handControl(state, 0, sel, slot)) return false;   // the gun in hand gets no bracket
      const s = autoSolution(state, 0, gun), h = state.ships[0]!.heading, now = gun === 'pew' ? sys.pewTurret : sys.gunTurret;
      return s !== null && onSolution(slewTurret(now, h, turretWorldAim(h, s), t.traverse[0], t.arcSteps), s);   // the next AUTO slew lands within the tolerance
    };
    if (onWeapons && enemyShown && (on('pew') || on('gun'))) bracket = { x: enemyS.x, y: enemyS.y, r: SHIP_RADIUS * drawnScale(z) + 6, live: enemyHostile(state) };
  }
```

(`enemyShown` is declared at `weaponsModel.ts` L202, above W-1's pew block at L279, so it is in scope here.) Add `drawnScale` to the tacticalModel import.
7. In the return, add `turretArc, muzzles, reticle, bracket`.

- [ ] **Step 4: The layer**

In `render/tactical/tacticalLayer.ts`, after the W-2 laser aim line (`if (la) { ... }`), add:

```ts
      // W-4 spec §10: the Hound's selected arc edges (dim), its muzzle lines (the selected mid, the other dim), the reticle (a
      // small cross, main) and AUTO's bracket on the enemy (hot once hostile, dim in the hold).
      const ta = c?.turretArc ?? null;
      if (ta) for (const side of [-1, 1]) {
        const a = ta.angle + side * ta.half;
        combat.moveTo(ta.x, ta.y).lineTo(ta.x + Math.sin(a) * ta.r, ta.y - Math.cos(a) * ta.r).stroke({ width: 1, color: CRT.dim });
      }
      for (const m of c?.muzzles ?? []) combat.moveTo(m.x1, m.y1).lineTo(m.x2, m.y2).stroke({ width: 1, color: m.selected ? CRT.mid : CRT.dim });
      const rt = c?.reticle ?? null;
      if (rt) combat.moveTo(rt.x - 6, rt.y).lineTo(rt.x - 2, rt.y).moveTo(rt.x + 2, rt.y).lineTo(rt.x + 6, rt.y).moveTo(rt.x, rt.y - 6).lineTo(rt.x, rt.y - 2).moveTo(rt.x, rt.y + 2).lineTo(rt.x, rt.y + 6).stroke({ width: 1, color: CRT.main });
      const bk = c?.bracket ?? null;
      if (bk) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        combat.moveTo(bk.x + sx * bk.r, bk.y + sy * (bk.r - 5)).lineTo(bk.x + sx * bk.r, bk.y + sy * bk.r).lineTo(bk.x + sx * (bk.r - 5), bk.y + sy * bk.r).stroke({ width: 2, color: bk.live ? CRT.hot : CRT.dim });
```

- [ ] **Step 5: The scene's inputs**

In `app/duel/scene.ts`, in the combat `input` object after `laserAim: ...`, add:

```ts
          turrets: source.turret ? { pew: source.turret(0), gun: source.turret(1) } : null,   // W-4 spec §10, §11: online the own selected turret is predicted
          weaponSel: source.weaponSel?.() ?? 0,
          reticle: station === 'weapons' && view === 'weapons' && reticleOnMap ? reticlePointer : null,   // W-4 spec §10: the cross at the pointer
```

where `reticleOnMap` is the `onWeaponsMap(...)` result Task 6's `reticlePointer` block already computes (hoist it into a `const reticleOnMap = reticlePointer !== null && onWeaponsMap(reticlePointer, ...)` used by both).

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Map.test.ts tests/pewViews.test.ts tests/manualLaserViews.test.ts tests/duelWeaponsView.test.ts tests/feelPresentation.test.ts`
Expected: tsc clean; all PASS. W-1's `pewViews` cases that pin the cone and aim line on the Cutter are kind (a) (W-4 spec §10: the arc and muzzle lines replace them on the Hound): rewrite each for the Hound's arc, or keep it on a class with a turretless pew if one is constructed in the test; list them in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/app/duel/scene.ts tests/w4Map.test.ts <each kind (a) view test>
git commit -m "feat(w4b): the Weapons map draws the selected arc, both muzzle lines, the reticle and AUTO's bracket; the Helm and Science maps the muzzle lines (W-4 spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A switch on each card: the AUTO / MAN / HOLD tags, and the two hint rows (amendment §2.5)

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts` (`WeaponsPanel`), `ui/duel/WeaponsStation.tsx` (W-4a's `HoundWeapons`, `houndRoomHint`)
- Modify: `tests/w4Ui.test.tsx`

**Interfaces:**
- Consumes: W-4a's `WeaponsPanel.autocannon` / `selected` and its `weaponsPanel()` spread (quoted in Step 3), `HoundWeapons`, `HOUND_PEW_PIPS_X`, `weaponCard('autocannon')`, `Button` (`ui/stage/Button.tsx`), `textPx` (`render/theme.ts`), `enemyHostile`, `handControl` (Task 4), `ConsoleInput.mode?` and the Hound block's TORPEDO tag already on it (Task 6), `WeaponsPanel.lock`, `torpTarget` and `torpRock` (on the branch today: `lock: sys.lock`), `ROOM_NAMES` (`render/duel/interiorModel.ts`: `['WEAPONS', 'SHIELDS', 'ENGINES']`).
- Produces: `WeaponsPanel.pewManual?: boolean`, `gunManual?: boolean` (each gun's own switch), `gunsHand?: number` (the gun slot in hand, −1 none), `gunsHold?: boolean`; Buttons `gun-mode-pew`, `gun-mode-autocannon` (testids `console-gun-mode-pew`, `console-gun-mode-autocannon`, following `Button`'s `console-${name}` rule as W-3's `console-torp-mode`), each its own switch; `houndRoomHint(lock: number, torpTarget: boolean): string` (`WeaponsStation.tsx`).

- [ ] **Step 1: Write the failing test**

Append to `tests/w4Ui.test.tsx` (W-4a's rig: `mount()`, `texts()`, `q()`, `view()`, `weapons(over)`, `AC`, `input()`, and its `STATION` / `textPx` imports). Add these imports: `consoleModel` beside the `ConsoleView` type import, `houndRoomHint` beside `freeText`, `cutter from '../src/renderer/src/sim/ship/cutter.json'`, `parseShip` from `../src/renderer/src/sim/ship/schema`, `disposeDuel` from `../src/renderer/src/sim/duel/state`, and `createSeatedDuel` from `./helpers/duelSeat`. The panel fields are set directly in the view, and `Button`'s `lit` state is `dataset.uiButton === 'lit'`, as the `console-torp-mode` test reads it:

```tsx
/** An element's rectangle from its inline style (jsdom does no layout), as tests/engineeringWeaponsUi.test.tsx reads it. */
const rect = (e: HTMLElement): [number, number, number, number] => { const l = parseFloat(e.style.left), t = parseFloat(e.style.top); return [l, t, l + parseFloat(e.style.width), t + parseFloat(e.style.height)]; };
const overlap = (a: [number, number, number, number], b: [number, number, number, number]): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('a switch on each card: the AUTO / MAN / HOLD tags (W-4 spec §4.3, §10; amendment §2.5)', () => {
  const tags = () => ['pew', 'autocannon'].map((w) => q(`[data-testid="console-gun-mode-${w}"]`)!);
  const lit = (): boolean[] => tags().map((t) => t.dataset.uiButton === 'lit');
  const words = (): string[] => texts().filter((t) => t === 'AUTO' || t === 'HOLD' || t === 'MAN');
  /** The Hound's panel with these switches, this gun in hand, this selection and the hold. The torpedo's own tag is left out
   *  (`torpManual` absent), so `words` are the two guns'. */
  const panel = (pewManual: boolean, gunManual: boolean, gunsHand: number, selected = 0, gunsHold = false) => view(weapons({ autocannon: AC, selected, pewManual, gunManual, gunsHand, gunsHold }));
  it("the word is what the gun does and the light is its own switch, in every row of the amendment's table", () => {
    const { duel } = mount();
    const row = (pewManual: boolean, gunManual: boolean, selected: number, gunsHand: number): { lit: boolean[]; words: string[] } => { act(() => duel.frame(panel(pewManual, gunManual, gunsHand, selected))); return { lit: lit(), words: words().sort() }; };
    expect(row(false, false, 0, -1)).toEqual({ lit: [false, false], words: ['AUTO', 'AUTO'] });
    expect(row(true, false, 0, 0)).toEqual({ lit: [true, false], words: ['AUTO', 'MAN'] });     // pew pew in hand
    expect(row(true, false, 1, -1)).toEqual({ lit: [true, false], words: ['AUTO', 'AUTO'] });   // a MAN gun that is not selected reads AUTO, lit
    expect(row(false, true, 1, 1)).toEqual({ lit: [false, true], words: ['AUTO', 'MAN'] });     // the autocannon in hand
    expect(row(true, true, 0, 0)).toEqual({ lit: [true, true], words: ['AUTO', 'MAN'] });
    expect(row(true, true, 1, 1)).toEqual({ lit: [true, true], words: ['AUTO', 'MAN'] });
    expect(row(true, true, 2, -1)).toEqual({ lit: [true, true], words: ['AUTO', 'AUTO'] });     // the torpedo selected: both AUTO-driven
    act(() => duel.frame(panel(true, true, -1, 2, true)));
    expect([lit(), words()]).toEqual([[true, true], ['HOLD', 'HOLD']]);   // the 30 s hold: an AUTO-driven gun reads HOLD
    act(() => duel.frame(panel(true, false, 0, 0, true)));
    expect(words().sort()).toEqual(['HOLD', 'MAN']);   // the gun in hand still reads MAN in the hold
  });
  it('the panel carries each switch, the gun in hand and the hold from the state (consoleModel)', () => {
    const d = createSeatedDuel(parseShip(cutter), 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const w = (weaponSel: number) => consoleModel({ duel: d, me: g, mode: 'online', hidden: false, held: NO_HELD_FLAGS, overlay: null, weaponSel })!.weapons!;
      expect(w(0)).toMatchObject({ pewManual: false, gunManual: false, gunsHand: -1, gunsHold: true });   // a round starts on AUTO, in the hold
      s.pewManual = true;
      expect([w(0).gunsHand, w(1).gunsHand, w(1).pewManual, w(1).gunManual]).toEqual([0, -1, true, false]);   // in hand only while selected
      s.gunManual = true; d.tactical.hostileAt = 0;
      expect([w(1).gunsHand, w(2).gunsHand, w(1).gunsHold]).toEqual([1, -1, false]);
    } finally { disposeDuel(d); }
  });
  it('each tag is its own switch: a click on a gun tag flips that gun through the mode channel', () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(panel(false, false, -1)));
    fireEvent.pointerDown(tags()[0]!, { button: 0 });
    expect(i.mode.mock.calls).toEqual([[0]]);
    fireEvent.pointerDown(tags()[1]!, { button: 0 });
    expect(i.mode.mock.calls).toEqual([[0], [1]]);
    expect(i.press).not.toHaveBeenCalled();
  });
  it('the tags clear the PEW PEW label, the charge pips, the bar pips, the AUTOCANNON title and each other (8 px from the text)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, pewManual: false, gunManual: false, gunsHand: -1, gunsHold: false, weaponBars: [1, 1, 1], weaponFree: 0 }))));
    const [pew, gun] = tags().map(rect), x0 = STATION.x + 8;
    expect(pew[0]).toBeGreaterThanOrEqual(x0 + textPx('PEW PEW', 1) + 8);
    expect(pew[2] + 8).toBeLessThanOrEqual(x0 + HOUND_PEW_PIPS_X);
    expect(gun[0]).toBeGreaterThanOrEqual(STATION.x + 8 + 6 + textPx('AUTOCANNON', 1) + 8);   // the card's text x (lx) plus the title
    const others = [...document.querySelectorAll<HTMLElement>('[data-ui-pew-pip], [data-ui-weapon-pip]')].map(rect);
    expect(others.length).toBeGreaterThan(0);
    for (const o of others) for (const t of [pew, gun]) expect(overlap(t, o), `${t} vs ${o}`).toBe(false);
    expect(overlap(pew, gun)).toBe(false);
  });
  it('the hint rows: LMB FIRE · A/D SELECT · W/S POWER, then R AUTO/MAN · Q/E ROOM: <NAME>, or Q/E ROOM: <NAME> · RMB TORPEDO: CLEAR while the torpedo has a target; each clear of FREE / ROCKS by 8 px', () => {
    const { duel } = mount(), names = ['WEAPONS', 'SHIELDS', 'ENGINES'];
    names.forEach((name, lock) => {
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: -1 }))));
      expect(texts()).toContain('LMB FIRE · A/D SELECT · W/S POWER');
      expect(texts()).toContain(`R AUTO/MAN · Q/E ROOM: ${name}`);
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: 2 }))));
      expect(texts()).toContain(`Q/E ROOM: ${name} · RMB TORPEDO: CLEAR`);   // something to clear: the clear hint shows, and the room name never leaves
      expect(texts()).not.toContain(`R AUTO/MAN · Q/E ROOM: ${name}`);
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: -1, torpRock: true }))));
      expect(texts()).toContain(`Q/E ROOM: ${name} · RMB TORPEDO: CLEAR`);   // a rock target is a target to clear too
    });
    expect(texts()).not.toContain('RIGHT-CLICK TORPEDO: CLEAR');
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    expect(x0 + textPx('LMB FIRE · A/D SELECT · W/S POWER', 1) + 8).toBeLessThanOrEqual(right - textPx(freeText(9), 1));
    for (const lock of [0, 1, 2]) for (const t of [houndRoomHint(lock, false), houndRoomHint(lock, true)])
      expect(x0 + textPx(t, 1) + 8, t).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
    expect([textPx(houndRoomHint(0, false), 1), textPx(houndRoomHint(0, true), 1)]).toEqual([173, 218]);   // the widest name (WEAPONS); 229 px is the room left of ROCKS 99 and its 8 px
  });
  it("the laser fit's BEAM tag still presses laserMode", () => {
    const { ui, duel } = mount(), i = input();
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, laserManual: false }))));
    fireEvent.pointerDown(q('[data-testid="console-laser-mode"]')!, { button: 0 });
    expect(i.press).toHaveBeenCalledWith('laserMode');
  });
});
```

The `console-laser-mode` button shows only when the panel carries `laserManual` (`WeaponsStation.tsx`, the laser block), which the last case sets.

**Kind (a), W-4 amendment §2.5:** in W-4a's case "the PEW PEW label, its charge pips and every Hound hint and refusal keep their 8 px …", the last line measures the row W-4a drew, `'RIGHT-CLICK TORPEDO: CLEAR'`. Change that line to `expect(x0 + textPx(houndRoomHint(0, true), 1) + 8).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));` (the widest text the row can now hold).

**The measure (amendment §2.5).** The room left of `ROCKS 99` is 284 − 47 − 8 = 229 px (the block's inner width, the tally, the gap). At the font's advances (`render/theme.ts`), `R AUTO/MAN · Q/E ROOM: WEAPONS` is 173 px and `Q/E ROOM: WEAPONS · RMB TORPEDO: CLEAR` is 218 px; `SHIELDS` and `ENGINES` are 2 px narrower than `WEAPONS`. Both fit, as W-4's 225 px row did.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Ui.test.tsx`
Expected: FAIL (no gun tags, no `houndRoomHint`, the old second row).

- [ ] **Step 3: The model**

In `render/duel/consoleModel.ts`, in `WeaponsPanel` after W-4a's `autocannon?` / `selected?`, add:

```ts
  /** W-4 spec §10 (W-4b), amendment §2.5: each gun's own switch (its tag is lit while it is set to MAN); the gun slot in the
   *  gunner's hands (0 or 1, −1 none: handControl, owner 2026-11-19), whose tag reads MAN while every other gun's reads AUTO,
   *  a MAN one that is not selected too; and whether the 30 s hold keeps the AUTO-driven guns quiet (their tags then read
   *  HOLD instead of AUTO). */
  pewManual?: boolean; gunManual?: boolean; gunsHand?: number; gunsHold?: boolean;
```

and in W-4a's `weaponsPanel()` spread (the `...(hasTurret(classOf(t, 0)) && classOf(t, 0).slots.gun ? { autocannon: { ... }, selected: i.weaponSel ?? 0 } : {})` entry), add after `selected: i.weaponSel ?? 0` the fields `pewManual: sys.pewManual, gunManual: sys.gunManual, gunsHand: [0, 1].find((g) => handControl(t, 0, i.weaponSel ?? 0, g)) ?? -1, gunsHold: !enemyHostile(t)` (import `enemyHostile` from `../../sim/tactical/science` and `handControl` from `../../sim/tactical/state`). W-4c's flight rule reaches the tag through `handControl` with no change here. W-4a's AUTOCANNON `rate` (`autocannonRateText(gunInterval(t, 0))`) becomes `autocannonRateText(gunInterval(t, 0, handControl(t, 0, i.weaponSel ?? 0, 1)))`, so the card shows the rate the gun fires at: MAN's only in hand.

- [ ] **Step 4: The station**

In `ui/duel/WeaponsStation.tsx`, add `textPx` to the `../../render/theme` import and `import { ROOM_NAMES } from '../../render/duel/interiorModel';`, and:
- above `HoundWeapons`, add:

```tsx
/** W-4 amendment §2.5: the Hound block's second hint row. It names the mode key and the target room (WEAPONS, SHIELDS or
 *  ENGINES); while the torpedo has a target (a room or a rock) it names the room and the torpedo's clear instead, since only
 *  two rows fit above the divider. */
export const houndRoomHint = (lock: number, torpTarget: boolean): string => {
  const name = ROOM_NAMES[lock] ?? ROOM_NAMES[1]!;
  return torpTarget ? `Q/E ROOM: ${name} · RMB TORPEDO: CLEAR` : `R AUTO/MAN · Q/E ROOM: ${name}`;
};
```

- in W-4a's `HoundWeapons`, add a helper `const gunTag = (slot: 0 | 1): string => (weapons.gunsHand === slot ? 'MAN' : weapons.gunsHold ? 'HOLD' : 'AUTO');` (each tag names what its gun does, Decision 9);
- on the PEW PEW row, between its `PEW PEW` label (45 px) and the charge pips at `x0 + HOUND_PEW_PIPS_X` (W-4a): `<Button name="gun-mode-pew" label={gunTag(0)} x={x0 + textPx('PEW PEW', 1) + 8} y={top + 4} w={36} h={18} lit={weapons.pewManual === true} onPress={() => actions.console.mode?.(0)} />`. That spans `x0 + 53` to `x0 + 89`, 11 px short of the first charge pip, and `top + 4` to `top + 22`, above the bar pips at `top + 24`;
- in the AUTOCANNON card's header, right of its title: `<Button name="gun-mode-autocannon" label={gunTag(1)} x={ax + textPx('AUTOCANNON', 1) + 8} y={A.y + 2} w={36} h={18} lit={weapons.gunManual === true} onPress={() => actions.console.mode?.(1)} />` with W-4a's `A = weaponCard('autocannon')` and `ax = A.x + 6`. The title is 60 px, so the tag spans `ax + 68` to `ax + 104`, inside the card and left of the `2` hint. W-2's BEAM tag sat at `lx + 66`, which the longer title would touch;
- the second hint row: replace W-4a's `<PixelText text="RIGHT-CLICK TORPEDO: CLEAR" x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />` with `<PixelText text={houndRoomHint(weapons.lock, weapons.torpTarget >= 0 || weapons.torpRock === true)} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />`. The first row stays `LMB FIRE · A/D SELECT · W/S POWER`, and the rows stay at `y0 + 116` and `y0 + 134` (the divider at `y0 + 156` leaves no room for a third);
- update the file's header comment: "W-4 spec §10 (W-4b), amendment §2.5: each gun card has its own AUTO / MAN tag and each tag is its own switch (R flips the selected weapon's, Shift+R both guns'): lit while that gun is set to MAN; its word is what the gun does now: MAN for the gun in hand, else AUTO, or HOLD while the hold keeps AUTO quiet. The second hint row names the target room."

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Ui.test.tsx tests/manualLaserUi.test.tsx tests/manualTorpedoUi.test.tsx tests/targetingUi.test.tsx tests/engineeringWeaponsUi.test.tsx tests/rockTargetUi.test.tsx`
Expected: tsc clean; all PASS (the last two are the existing "+8 clear" and overlap tests on the laser block, which W-4b does not move).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/w4Ui.test.tsx
git commit -m "feat(w4b): an AUTO / MAN / HOLD tag on each gun card, each its own switch (lit on MAN, MAN only on the gun in hand); the second hint row names R and the target room, or the torpedo's clear while it has a target (W-4 spec §10; amendment §2.5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The target room in the app: E / Q, the room click, the controller's fence, the bracket, online `lockSent`, the pew callout (amendment §3.4, §3.6)

**Files:**
- Modify: `src/renderer/src/app/duel/runtime.ts`, `app/duel/onlineDuel.ts` (the Hound branches: E / Q and the click; `lockSent`), `app/duel/contactController.ts` (`ContactSync.turret`, `intercept`), `app/duel/scene.ts` (the sync's flag), `render/duel/contactModel.ts` (`lockRoom`, `roomClick`), `ui/duel/ContactWindow.tsx` (`boxDown`), `render/tactical/hitModel.ts` (the pew branch and flash), `ui/duel/WeaponsStation.tsx` (the reason row's `ROOM`), `app/controlsList.ts`
- Modify: `tests/w4Runtime.test.ts`, `tests/w4Input.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/w4Ui.test.tsx`, `tests/w4Map.test.ts`, `tests/contactModel.test.ts`

**Interfaces:**
- Consumes: Task 8's `laserLock` on the Hound and `pewHit`'s `room` / `level`; `cycleLock`, `stepTorpRoom` (`app/duel/controls.ts`); `lockRefusal(d)` (`render/duel/situationModel.ts`: `NO CONTACT` while the enemy is unseen); W-4a's copied E / Q block in both Hound branches (quoted in Steps 3 and 4 from the branch); `KeySample.lockTo` / `ConsoleInput.lock` (`input.ts`); `ContactSync`, `intercept` (`contactController.ts`); `contactModel`'s two `lockRoom` lines; `ContactWindow`'s `boxDown`; `hitCallouts`, `pushHits`, `roomCallout` (`hitModel.ts`); `torpModeSent`'s clears in `onlineDuel.ts` (the result, the sit, the stand, the round, the attach); `hasTurret`; Task 11's `houndRoomHint`.
- Produces: `lockSent`; `ContactSync.turret?`; `ContactView.roomClick?`; the `PEW: ` callout and the pew flash; the `ROOM` reason; the controls list's Q / E row.

- [ ] **Step 1: Write the failing tests**

`tests/w4Runtime.test.ts`: add `lockTo: null, torpTo: null` to the file's `ONE_FRAME` (so a console lock request lasts one frame, as a press does), and return the rig's `contact` with its other members.

**Kind (a), W-4 amendment §3.6, §5:** replace W-4a's case `"E / Q step the torpedo's target room (no laserLock)"` with:

```ts
  it('E / Q step the target room (laserLock, no torpLock)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      expect([sys.lock, sys.torpLock]).toEqual([1, -1]);   // Shields at a round's start; no torpedo target
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 2, -1]);   // E: Shields → Engines
      r.press('interact'); r.tick(); expect(sys.lock).toBe(0);   // wraps to Weapons
      r.press('prevLock'); r.tick(); expect([sys.lock, sys.torpLock]).toEqual([2, -1]);   // Q: back, wrapping
      r.press('interact', 2); r.tick(); expect([r.statuses(), sys.lock]).toEqual([['applied'], 1]);   // two presses in one frame: one command, two steps
    } finally { r.rt.dispose(); }
  });
```

and change the file's header comment's "E/Q step the torpedo's room" to "E/Q step the target room (W-4 amendment §3.6)". Then append:

```ts
describe("the target room at the Hound's Weapons seat (W-4 amendment §3.6)", () => {
  it('two E presses on separate frames before a tick step twice (from the latest queued laserLock)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      holdInSight(r.d.tactical);
      r.press('interact'); r.rt.frame(1 / 60); r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([['applied', 'applied'], 0]);   // Shields → Engines → Weapons
    } finally { r.rt.dispose(); }
  });
  it("a plain room click (the console's lock request) sets the target room; the torpedo's own target is only its pick-up click; a clear is never sent", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ lockTo: 0 }); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 0, -1]);
      r.set({ torpTo: 2 }); r.tick();   // the pick-up's room click (contact.pick → the console's torpLock)
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 0, 2]);   // the enemy is 700 u off, out of torpedo range: the lock stands
      r.set({ lockTo: -1 }); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([[], 0]);   // the target room has no "none"
    } finally { r.rt.dispose(); }
  });
  it('with the enemy unseen E raises NO CONTACT and the room keeps its value', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[3] = 0;   // Sensors 0: sensor range 300, and the rig holds the enemy 700 u off
      r.tick(); r.rt.takeRefusals();
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([['rejected:unavailable'], 1]);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'laser', reason: 'NO CONTACT' });
    } finally { r.rt.dispose(); }
  });
  it('with the torpedo picked up, E still steps the target room: laserLock goes, no torpLock, and the pick-up stays', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.contact.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: r.rt.epoch(), laser: false, turret: true });
      r.contact.pickUp('torpedo');
      expect([r.contact.intercept('KeyE'), r.contact.intercept('KeyQ')]).toEqual([false, false]);   // the keys fall through to the seat
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock, r.contact.aimWeapon()]).toEqual([['applied'], 2, -1, 'torpedo']);
    } finally { r.rt.dispose(); }
  });
});
```

Append to `tests/w4Input.test.ts`:

```ts
describe("E / Q with the torpedo picked up (W-4 amendment §3.6)", () => {
  it("at the Hound's Weapons seat they are not taken and the pick-up stays; the Flight seat and the laser fit's Weapons seat still step the torpedo's room", () => {
    const hound = createContactController();
    hound.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: false, turret: true });
    hound.pickUp('torpedo');
    expect([hound.intercept('KeyE'), hound.intercept('KeyQ'), hound.aimWeapon(), hound.takeRequests().torpStep]).toEqual([false, false, 'torpedo', undefined]);
    const flight = createContactController();
    flight.sync({ shown: true, station: 'flight', target: 1, active: () => true, epoch: 0, laser: false });
    flight.pickUp('torpedo');
    expect([flight.intercept('KeyE'), flight.intercept('KeyE'), flight.intercept('KeyQ'), flight.aimWeapon(), flight.takeRequests().torpStep]).toEqual([true, true, true, 'torpedo', 1]);
    const fit = createContactController();
    fit.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: true });
    fit.pickUp('torpedo');
    expect([fit.intercept('KeyE'), fit.takeRequests().torpStep]).toEqual([true, 1]);
  });
});
```

Add to `tests/onlineDuelSession.test.ts`'s Hound block ("the online Hound Weapons seat"):

```ts
  it('two E presses before a replica arrives step the target room twice (lockSent); it clears on the result, a new round and a stand', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock' || x.kind === 'torpLock');
    const e = (): void => { tapKey(r, 'KeyE'); r.pump(); };
    e(); e();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 2 }, { kind: 'laserLock', room: 0 }]);   // from the replica's Shields, then from the room in flight
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('laserLock')]!;
    c.results.push({ id, tick: 3, status: 'applied' }); r.pump();
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });   // the result cleared it: the replica's lock (still Shields) is the base again
    nextRound(r.d); c.publish(r.d); r.pump();
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });   // a new round: from its Shields, not from the room in flight
    tapKey(r, 'KeyX'); r.pump();   // this seat's stand clears it (the replica still shows the seat)
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });
    expect(locks().some((x) => x.kind === 'torpLock')).toBe(false);
    r.dispose();
  });
  it('Q steps back, and a plain room click (the console lock request) sends laserLock; neither sends torpLock, and a clear is never sent', () => {
    const consoles: { lock(room: number): void }[] = [];
    const r = rig(1, undefined, {}, { setConsole: (i: { lock(room: number): void } | null) => { if (i) consoles.push(i); } }), c = r.attach(); r.session.frame();
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock' || x.kind === 'torpLock');
    tapKey(r, 'KeyQ'); r.pump();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 0 }]);   // Q: Shields → Weapons
    consoles[0]!.lock(2); r.pump();   // the enemy window's plain room click reaches the session through the console's lock
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });
    consoles[0]!.lock(-1); r.pump();
    expect(locks()).toHaveLength(2);   // the target room has no "none"
    r.dispose();
  });
```

(`lockSent` is also cleared on a sit and on a re-attach, in the same statements that clear `torpModeSent`; Step 4 names each. The session hands its keyboard's console input to `deps.setConsole`, which the rig's `extra` argument supplies.)

Append to `tests/w4Ui.test.tsx` (add these imports: `contactModel` and `type ContactView` from `../src/renderer/src/render/duel/contactModel`, `createContactController` from `../src/renderer/src/app/duel/contactController`, `createTacticalState` and `type TacticalState` from `../src/renderer/src/sim/tactical/state`):

```tsx
describe("the enemy window at the Hound's Weapons seat (W-4 amendment §3.6)", () => {
  const hound = (): TacticalState => { const st = createTacticalState(4); st.known[0] = 2; return st; };
  const windowOf = (st: TacticalState, aim: boolean): ContactView => contactModel({ state: st, contact: 0, aim, weapon: 'torpedo', station: 'weapons', t: 0, weapons: { charge } })!;
  const clickRoom = (contact: ContactView, room: number): void => { const c = contact.rooms[room]!.centre; fireEvent.pointerDown(document.querySelector('[data-ui-contact-box]')!, { button: 0, clientX: c.x, clientY: c.y }); };
  it("a plain room click sets the target room (the console's lock); with the torpedo picked up the click is the torpedo's target, as before", () => {
    const { ui, duel } = mount(), i = input(), controller = createContactController();
    ui.actions.setConsole(i); ui.actions.setContact(controller);
    controller.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: false, turret: true });
    const plain = windowOf(hound(), false);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 0 })), contact: plain }));
    clickRoom(plain, 2);
    expect(i.lock).toHaveBeenCalledWith(2);
    expect(i.torpLock).not.toHaveBeenCalled();
    controller.pickUp('torpedo');
    const armed = windowOf(hound(), true);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 2 })), contact: armed }));
    clickRoom(armed, 0);
    expect(i.torpLock).toHaveBeenCalledWith(0);
    expect(i.lock).toHaveBeenCalledTimes(1);
  });
  it('the bracket and the hint row follow lock', () => {
    const { duel } = mount(), st = hound();
    st.systems[0].lock = 2;
    const contact = windowOf(st, false);
    expect(contact.lockRoom).toBe(2);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 0, lock: st.systems[0].lock })), contact }));
    expect(document.querySelector('[data-ui-contact-lock]')).not.toBeNull();
    expect(texts()).toContain('R AUTO/MAN · Q/E ROOM: ENGINES');
  });
  it('a refused room (the enemy unseen) reads ROOM: NO CONTACT on the reason row, clear of FREE by 8 px', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, refused: { control: 'laser', reason: 'NO CONTACT', flash: true } }))));
    expect(texts()).toContain('ROOM: NO CONTACT');
    expect(STATION.x + 8 + textPx('ROOM: NO CONTACT', 1) + 8).toBeLessThanOrEqual(STATION.x + STATION.w - 8 - textPx(freeText(9), 1));
  });
  it('the controls list names Q / E at Weapons, from the tables', () => {
    expect(controlSections()[0]!.rows).toContainEqual({ keys: 'Q / E', action: 'At Weapons, step the target room (Weapons, Shields, Engines); rounds fired by hand damage it' });
  });
});
```

Append to `tests/contactModel.test.ts` (its `model`, `known` and `LASER_FIT`):

```ts
describe("the Hound's target room in the enemy window (W-4 amendment §3.6)", () => {
  it('the bracket is the target room whenever the rooms are drawn, the unknown contact included, at every station; a plain room click is on at Weapons only', () => {
    for (const level of [0, 1, 2]) {
      const st = known(level);   // the Hound: laserTargeted stays false
      expect([st.systems[0].laserTargeted, model(st)!.lockRoom], `level ${level}`).toEqual([false, 1]);   // Shields at a round's start
      st.systems[0].lock = 2;
      expect([model(st)!.lockRoom, model(st, { station: 'helm', weapons: null })!.lockRoom, model(st, { station: 'science', weapons: null })!.lockRoom], `level ${level}`).toEqual([2, 2, 2]);
      expect([model(st)!.roomClick ?? false, model(st, { station: 'helm', weapons: null })!.roomClick ?? false], `level ${level}`).toEqual([true, false]);
    }
    const fit = known(2, LASER_FIT);
    fit.systems[0].laserTargeted = false;
    expect([model(fit)!.lockRoom, model(fit)!.roomClick ?? false]).toEqual([null, false]);   // a laser class keeps laserTargeted ? lock : null, and no plain click
  });
});
```

**Kind (a), W-4 amendment §3.6:** in the same file, the Level 1 case of "the enemy below Level 2" builds the Hound (`known(1)`), clears `laserTargeted` and expects `lockRoom` null. That is the laser's rule: change its `known(1)` to `known(1, LASER_FIT)` and add the comment "the beam's rule, on the laser fit (the Hound always brackets its target room)".

Append to `tests/w4Map.test.ts` (add `hitCallouts`, `pushHits` and `CALLOUT_COLOUR` from `../src/renderer/src/render/tactical/hitModel`, and `type ViewEvent` beside `createFx`):

```ts
describe('a pew pew room hit on the map (W-4 amendment §3.4)', () => {
  it('a pewHit with level on the enemy shows the PEW: room callout and flashes the room; one without a room shows neither; the crew is never the struck ship', () => {
    const st = createTacticalState(5), fx = createFx();
    const hit = (over: object): ViewEvent => ({ kind: 'pewHit', ship: 1, owner: 0, stripped: false, hull: true, room: -1, level: false, x: 0, y: 0, ...over });
    expect(hitCallouts([hit({ room: 2, level: true })], st)).toEqual([{ text: 'PEW: ENGINES HIT', colour: CALLOUT_COLOUR.hit, kind: 'hit' }]);
    expect(hitCallouts([hit({ room: 2 }), hit({}), hit({ ship: 0, owner: 1, room: 2, level: true })], st)).toEqual([]);   // wear without a level; no room; a hit on the crew
    st.systems[1]!.rooms[2] = 2;
    expect(hitCallouts([hit({ room: 2, level: true })], st)[0]).toMatchObject({ text: 'PEW: ENGINES OFFLINE', kind: 'offline' });
    pushHits(fx, [hit({ room: 0 }), hit({})], st);
    expect(fx.struck.map((s) => [s.ship, s.room])).toEqual([[1, 0]]);   // a room hit by hand flashes its room, level or not; an untagged hit flashes none
    pushHits(fx, [hit({ ship: 0, owner: 1, room: 1 })], st);
    expect(fx.struck).toHaveLength(1);   // never the crew's own ship
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4Runtime.test.ts tests/w4Input.test.ts tests/w4Ui.test.tsx tests/w4Map.test.ts tests/contactModel.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL (E still queues `torpLock`; the controller takes E; no `roomClick`; `lockRoom` is null on the Hound; no `PEW: ` callout).

- [ ] **Step 3: Single player's Hound branch**

In `app/duel/runtime.ts`, in the Hound branch of `play` (`if (houndWeaponsSeat(d, active)) {`), replace W-4a's copy of the Flight seat's block

```ts
      // E / Q (and E/Q while the torpedo is picked up) step the torpedo's target room, as the Flight seat does (§9).
      const steps = p.interact - p.prevLock + (requests.torpStep ?? 0);
      if (steps !== 0) {
        const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'torpLock')?.command;
        const room = stepTorpRoom(last && last.kind === 'torpLock' ? last.room : d.tactical.systems[0].torpLock, steps);
        queue({ kind: 'torpLock', room });
        const why = room >= 0 ? lockRefusal(d) : null; if (why) refuse('launch', why);
      }
```

with

```ts
      // W-4 amendment §3.6: E / Q step the target room (Weapons → Shields → Engines, wrapping), judged from the latest queued
      // laserLock, else the sim's lock; a plain room click in the enemy window (the console's lock request) sets it. Neither
      // makes a torpedo lock (that is only the pick-up click, k.torpTo below), and requests.torpStep is not read here.
      const steps = p.interact - p.prevLock;
      if (steps !== 0) {
        const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
        let room = last && last.kind === 'laserLock' && last.room >= 0 ? last.room : d.tactical.systems[0].lock;
        for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
        queue({ kind: 'laserLock', room });
        const why = lockRefusal(d); if (why) refuse('laser', why);   // NO CONTACT: the sim refuses a room on an unseen enemy
      }
      if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) {   // a clear (−1) is never sent: the target room has no "none"
        queue({ kind: 'laserLock', room: k.lockTo });
        const why = lockRefusal(d); if (why) refuse('laser', why);
      }
```

The Flight seat's own block above (the one whose comment begins "Q/E (and E/Q while the torpedo is picked up, the contact controller's torpStep)") stays as it is. The Hound branch's `k.torpTo` line under the replaced block stays. `cycleLock` and `stepTorpRoom` are both still imported and used (the laser class's branch and the Flight seat).

- [ ] **Step 4: The online Hound branch and `lockSent`**

In `app/duel/onlineDuel.ts`:

1. Beside `torpModeSent`'s declaration, add:

```ts
  // W-4 amendment §3.6: the target room this seat last asked for, until its result comes back (as torpModeSent): the base E
  // and Q step from, so two quick presses step twice before the replica catches up.
  let lockSent: { room: number; sequence: number; round: number } | null = null;
```

2. In `observe`'s result loop, beside the `torpModeSent` clear, add `if (lockSent && result.id.player === descriptor.seatId && result.id.sequence === lockSent.sequence) lockSent = null;   // W-4 amendment §3.6: the replica is the base again`.
3. In each statement that sets `torpModeSent = null` in `play` (the sit, inside `if (c >= 0) { … }`, and the stand, `if (p.stand > 0) { … }`) and in `attach` (the long reset line), also set `lockSent = null;`. In `pump`, after the `torpModeSent` round check, add `if (lockSent && d && d.round !== lockSent.round) lockSent = null;   // W-4 amendment §3.6: every round starts on Shields`.
4. In the online Hound branch, replace W-4a's copy

```ts
      // E / Q (and E/Q while the torpedo is picked up) step the torpedo's target room from the replica's, as the Flight seat does (§9).
      const steps = p.interact - p.prevLock + (requests.torpStep ?? 0);
      if (steps !== 0) {
        const room = stepTorpRoom(sys0.torpLock, steps);
        send({ kind: 'torpLock', room });
        const why = room >= 0 ? lockRefusal(d) : null; if (why) source?.refuse('launch', why);
      }
```

with

```ts
      // W-4 amendment §3.6: E / Q step the target room from the room in flight (lockSent), else the replica's lock; a plain room
      // click in the enemy window sets it. Neither makes a torpedo lock, and requests.torpStep is not read here.
      const sendLock = (room: number): void => {
        const id = send({ kind: 'laserLock', room }); if (id) lockSent = { room, sequence: id.sequence, round: d.round };
        const why = lockRefusal(d); if (why) source?.refuse('laser', why);   // NO CONTACT: the authority refuses a room on an unseen enemy
      };
      const steps = p.interact - p.prevLock;
      if (steps !== 0) {
        let room = lockSent ? lockSent.room : sys0.lock;
        for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
        sendLock(room);
      }
      if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) sendLock(k.lockTo);   // a clear (−1) is never sent
```

   The branch's `k.torpTo` line under it stays (the pick-up click). The laser class's branch below keeps its own `requests.torpStep` block.

- [ ] **Step 5: The contact controller's fence**

In `app/duel/contactController.ts`:

1. In `ContactSync`, after `laser?: boolean;` add:

```ts
  /** W-4 amendment §3.6: the crew class has a turret gun (the Hound; absent: false). At its Weapons seat E and Q are never
   *  taken, torpedo picked up or not: they step the target room. */
  turret?: boolean;
```

2. In `createContactController`, beside `laserFit = true` declare `turretFit = false`, and in `sync` after `laserFit = s.laser ?? true;` add `turretFit = s.turret ?? false;`.
3. In `intercept`, in the E / Q branch, add the fence as its first line, so the branch reads:

```ts
      if ((code === 'KeyE' || code === 'KeyQ') && st?.aim && (station === 'weapons' || station === 'flight')) {
        if (station === 'weapons' && turretFit) return false;   // W-4 amendment §3.6: the Hound's Weapons seat: the keys step the target room, and the pick-up stays
        if (weapon === 'torpedo') { torpStep += code === 'KeyE' ? 1 : -1; return true; }   // the torpedo stays picked up
        st = { ...st, aim: false };   // the laser's pick-up drops; the key steps the laser's target
        return false;
      }
```

4. Add to `intercept`'s doc comment (on the interface): "W-4 amendment §3.6: never KeyE or KeyQ at a turret class's Weapons seat."

In `app/duel/scene.ts`, in the `contact.sync({ … })` call, after `laser: classOf(d.tactical, CREW_SLOT).slots.laser !== null` add `, turret: hasTurret(classOf(d.tactical, CREW_SLOT))` (`hasTurret` is already imported there).

- [ ] **Step 6: The window: the bracket and the plain click**

`render/duel/contactModel.ts` (add `hasTurret` from `../../sim/tactical/defs`):

1. In `ContactView`, after `unknown?: boolean;` add:

```ts
  /** W-4 amendment §3.6: a plain click on a room, with nothing picked up, sets the crew's target room: the Weapons station
   *  of a class with a turret gun (the Hound). Absent: no. */
  roomClick?: boolean;
```

   and change `lockRoom`'s doc to "The crew laser's target room (FTL targeting spec §1: while it has one), at Level 1 or more; W-4 amendment §3.6: on a class with a turret gun, the target room, whenever the rooms are drawn."
2. In `contactModel`, after `const crewSys = state.systems[CREW_SLOT], weapon = i.weapon ?? 'laser';` add:

```ts
  // W-4 amendment §3.6: on a class with a turret gun (the Hound) the bracket is the target room whenever the rooms are drawn
  // (laserTargeted stays false there); on any other class it is the laser's target, while it has one.
  const turretGun = hasTurret(classOf(state, CREW_SLOT)), lockRoom = turretGun ? crewSys.lock : crewSys.laserTargeted ? crewSys.lock : null;
  const roomClick = turretGun && i.station === 'weapons';
```

3. In both returns that draw rooms (the unknown-contact one, `level < 1`, and the last one), replace `lockRoom: crewSys.laserTargeted ? crewSys.lock : null,` with `lockRoom, roomClick,`.

`ui/duel/ContactWindow.tsx`: replace the end of `boxDown`

```ts
    if (e.button !== 0 || !aiming) return;
    const room = roomAt(toInternal(e));
    if (room >= 0) actions.contact.pick(room);   // a click on no room does nothing; the aim stays armed
```

with

```ts
    if (e.button !== 0) return;
    const room = roomAt(toInternal(e));
    if (room < 0) return;   // a click on no room does nothing; the aim stays armed
    if (aiming) actions.contact.pick(room);
    else if (contact.roomClick) actions.console.lock(room);   // W-4 amendment §3.6: a plain room click sets the target room
```

and add to the file's header comment: "W-4 amendment §3.6: at the Hound's Weapons seat a plain room click, with nothing picked up, sets the target room, and the laser's corner brackets mark it."

- [ ] **Step 7: The pew callout and flash, the reason row, the controls list**

`render/tactical/hitModel.ts`:
1. In `hitCallouts`, after the `gunHit` branch add:

```ts
    else if (e.kind === 'pewHit' && e.ship === ENEMY_SLOT && e.room >= 0 && e.level) out.push(roomCallout(state, e.room, 'PEW: '));   // W-4 amendment §3.4: a room pew pew took down a level by hand, as the gun's
```

2. In `pushHits`, after the `gunHit` line add:

```ts
    else if (e.kind === 'pewHit' && e.ship !== CREW_SLOT) { ship = e.ship; room = e.room; }   // W-4 amendment §3.4: the crew's pew pew on a room (room −1, an untagged or shield hit, flashes none)
```

3. Add to both functions' doc comments: "and (W-4 amendment §3.4) every crew pew pew round fired by hand that raises a Room's level" / "a crew pew pew round on a room".

`ui/duel/WeaponsStation.tsx`: in `HoundWeapons`' `who`, change `c === 'laser' ? 'BEAM'` to `c === 'laser' ? 'ROOM'` (Decision 23: on the Hound the `laser` control is the target room's refusal). The laser block's own reason row keeps `BEAM`.

`app/controlsList.ts`: after Task 6's `Mouse` row add:

```ts
  duel.push({ keys: `${codesFor('prevLock').map(keyLabel).join('')} / ${codesFor('interact').map(keyLabel).join('')}`, action: 'At Weapons, step the target room (Weapons, Shields, Engines); rounds fired by hand damage it' });   // W-4 amendment §3.6
```

The `interact` and `prevLock` rows above it (the laser fit's lock keys) and the Flight section's E / Q row are unchanged.

Online needs nothing more for the callout: `onlineSource.ts`'s `pewHit` literal already names no room (Task 8), so online a room hit by a gun shows no callout or flash, as the gun's shows none today; the enemy window's room levels still follow the replica.

- [ ] **Step 8: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Runtime.test.ts tests/w4Input.test.ts tests/w4Online.test.ts tests/w4Ui.test.tsx tests/w4Map.test.ts tests/contactModel.test.ts tests/contactWindow.test.tsx tests/contactScene.test.ts tests/targetingUi.test.tsx tests/onlineDuelSession.test.ts tests/valkyrnRuntime.test.ts tests/valkyrnOnline.test.ts tests/duelRuntime.test.ts tests/settingsAndControls.test.ts tests/pewViews.test.ts`
Expected: tsc clean; all PASS. A test that expects E or Q at the Hound's Weapons seat to send `torpLock`, the enemy window to show no bracket on the Hound, or a plain room click there to do nothing, is kind (a) (W-4 amendment §3.6): rewrite it for the target room, or move it to the laser fit when it is the beam's rule; list each in the commit body. Then `npm run test:duel-app-runtime`: the smoke passes (it presses neither E nor Q at Weapons).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/contactController.ts src/renderer/src/app/duel/scene.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/ui/duel/ContactWindow.tsx src/renderer/src/render/tactical/hitModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx src/renderer/src/app/controlsList.ts tests/w4Runtime.test.ts tests/w4Input.test.ts tests/onlineDuelSession.test.ts tests/w4Ui.test.tsx tests/w4Map.test.ts tests/contactModel.test.ts <each kind (a) test fixed in Step 8>
git commit -m "feat(w4b): E / Q and a plain room click set the target room (laserLock, never torpLock), torpedo picked up or not; the enemy window brackets it; online lockSent; the PEW: room callout and flash; the copied torpedo-room block leaves the Hound's branch (W-4 amendment §3.4, §3.6)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The tuning ladder (spec §12)

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (`AUTOCANNON_HITS_PER_HULL`), `sim/tactical/defs.ts` (`AUTOCANNON.hitsPerHull`), `sim/duel/scripted.ts` (`HOUND_MISSILE_GAP`, `HOUND_GUNNER_AUTOCANNON_BARS`, `houndGunner`)
- Modify: `tests/w4Loadout.test.ts` (W-4a's "its hit numbers are the Valkyrn's" rest-equality: `hitsPerHull` joins the excluded fields), `tests/helpers/scriptedDuel.ts` (the report's room levels by weapon, amendment §3.5), `tests/duelScripted.test.ts` (its case), `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: `AUTOCANNON`, `GUN_HITS_PER_HULL`, `AUTOCANNON_AUTO_RANGE`, `MISSILE_GAP`, `houndGunner` (Task 7), `runDuel`, `telemetryLine`, `gateSummary` (`tests/helpers/scriptedDuel.ts`), `scripts/duel-telemetry.ts`.
- Produces: `HOUND_HELM_LINEUP`, `AUTOCANNON_HITS_PER_HULL`, `HOUND_MISSILE_GAP`, `HOUND_GUNNER_AUTOCANNON_BARS` (Decision 11), the shipped values and the whole sweep's table.

- [ ] **Step 1: The knobs at their base values (a no-op)**

`sim/tactical/tuning.ts`, after `GUN_HITS_PER_HULL`: 

```ts
/** W-4 spec §12: the autocannon's own copy of the hits a hull point (the tuning ladder's rung 1; GUN keeps GUN_HITS_PER_HULL). */
export const AUTOCANNON_HITS_PER_HULL = 12;
```

`sim/tactical/defs.ts`: in `AUTOCANNON`'s literal add `hitsPerHull: AUTOCANNON_HITS_PER_HULL,` after `...GUN,` (import it).

`sim/duel/scripted.ts`, after `MISSILE_GAP`:

```ts
/** W-4 spec §12 (Decision 11): the Hound gunner's own torpedo gap and how many bars its first tick gives the autocannon (1:
 *  the spare bar, 1 / 1 / 1; 2: also pew pew's, 0 / 2 / 1). The tuning ladder's rungs 3 and 4; the Valkyrn's gunner keeps
 *  MISSILE_GAP. */
export const HOUND_MISSILE_GAP = 1500;
export const HOUND_GUNNER_AUTOCANNON_BARS = 1 as 1 | 2;   // `as`, so `=== 2` type-checks while it holds 1
/** W-4 spec §12: rung 0, the Hound Helm's line-up (helmAxes). Always true in a shipped build; the ladder's reference row
 *  sets it false once to record what the line-up is worth. */
export const HOUND_HELM_LINEUP = true as boolean;   // `as`, so the reference row's `false` type-checks
```

In `helmAxes`, add `HOUND_HELM_LINEUP && ` at the front of Task 7's line-up condition (`if (HOUND_HELM_LINEUP && hasTurret(classOf(t, 0)) && e.active && …)`).

In `houndGunner`: the torpedo rule's `MISSILE_GAP` → `HOUND_MISSILE_GAP`; the bar move becomes

```ts
    const w = DuelSystem.Weapons, two = HOUND_GUNNER_AUTOCANNON_BARS === 2;
    if (sparesOf(d) >= 1 && capacityOf(d, w) > sys.bars[w]! && weaponBars(sys, WeaponSlot.Autocannon) === 0 && (!two || weaponBars(sys, WeaponSlot.Pew) >= 1)) {
      out.push({ kind: 'shipPower', system: w, delta: 1 });
      if (two) out.push({ kind: 'weaponPower', slot: WeaponSlot.Pew, delta: -1 });
      out.push({ kind: 'weaponPower', slot: WeaponSlot.Autocannon, delta: 1 });
      if (two) out.push({ kind: 'weaponPower', slot: WeaponSlot.Autocannon, delta: 1 });
    }
```

(replacing W-4a's two-command push; `applyWeaponPower` judges them in sequence order, so with Weapons at 3 bars each is admitted).

In `tests/w4Loadout.test.ts`, add `hitsPerHull` to both destructurings of the "hit numbers are the Valkyrn's" case and add `expect(AUTOCANNON.hitsPerHull).toBe(AUTOCANNON_HITS_PER_HULL)` (kind (a): spec §12 lets gate tuning move AUTOCANNON's copy).

**The report's room levels by weapon (amendment §3.5).** From Task 8 an AUTO gun wears no room, and the scripted gunner leaves its guns on AUTO, so the bots take rooms only with the torpedo. The ladder's report records it per seed. In `tests/helpers/scriptedDuel.ts`:

1. Above `DuelRun`, add:

```ts
/** W-4 amendment §3.5: the enemy room levels the crew raised in one run, by weapon, per Room (Weapons, Shields, Engines). */
export interface RoomLevels { gun: [number, number, number]; pew: [number, number, number]; torpedo: [number, number, number] }
```

   and add `roomLevels: RoomLevels` to `DuelRun`.
2. In `runDuel`, declare `const levels: RoomLevels = { gun: [0, 0, 0], pew: [0, 0, 0], torpedo: [0, 0, 0] };` beside `holdCause`; as the loop body's first line add `const before = [...d.tactical.systems[1]!.rooms];   // W-4 amendment §3.5: the enemy's room levels before the tick`; and replace `for (const e of d.tactical.events) if (e.kind === 'hostile') holdCause = e.cause;` with

```ts
      for (const e of d.tactical.events) {
        if (e.kind === 'hostile') holdCause = e.cause;
        // W-4 amendment §3.5: one per crew gun or pew pew hit that raised an enemy room; a crew torpedo on the enemy: its room's level after the tick less before it.
        else if ((e.kind === 'gunHit' || e.kind === 'pewHit') && e.ship === 1 && e.room >= 0 && e.level) levels[e.kind === 'gunHit' ? 'gun' : 'pew'][e.room as 0 | 1 | 2]++;
        else if (e.kind === 'missileEnd' && e.ship === 0 && e.target === 1 && e.room >= 0) levels.torpedo[e.room as 0 | 1 | 2] += d.tactical.systems[1]!.rooms[e.room]! - before[e.room]!;
      }
```

   and add `roomLevels: levels` to the returned object.
3. In `telemetryLine`, after the `crew  pew … rounds, gun … rounds; hold ended …` line add:

```ts
    `  crew  room levels W/S/E: gun ${r.roomLevels.gun.join('/')}, pew ${r.roomLevels.pew.join('/')}, torpedo ${r.roomLevels.torpedo.join('/')}`,   // W-4 amendment §3.5
```

Add to `tests/duelScripted.test.ts`'s describe "the scripted gunner on the Hound (W-4 spec §12: AUTO guns)" (import `runDuel` and `telemetryLine` from `./helpers/scriptedDuel` if the file does not already):

```ts
  it("the run's report names the enemy room levels the crew raised, by weapon: the bots' guns stay on AUTO, so no gun or pew pew hit raises one (W-4 amendment §3.5)", () => {
    const r = runDuel(1, 'scripted');
    expect([r.roomLevels.gun, r.roomLevels.pew]).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(r.roomLevels.torpedo.every((n) => Number.isInteger(n))).toBe(true);
    expect(telemetryLine(r)).toContain(`room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo ${r.roomLevels.torpedo.join('/')}`);
  }, 60_000);
```

A test that pins `telemetryLine`'s whole text or its line count is kind (a) (amendment §3.5: one more line); the gate summary (`gateSummary`) is unchanged.

Run: `npx tsc -b` then `npx vitest run tests/w4Loadout.test.ts tests/duelScripted.test.ts tests/valkyrnIdentity.test.ts` then `npx tsx scripts/duel-telemetry.ts > ../w4b-ladder-base.txt`
Expected: tsc clean; PASS (bar the known-red pins); the telemetry's outcomes and counts equal Task 8's (the knobs hold their base values, and the new line only reports).

- [ ] **Step 2: Rung 0, the base and its reference row**

From `../w4b-ladder-base.txt` take `crew wins N` and run `npx vitest run tests/duelGates.test.ts`. Record the base row (rung 0: the Helm line-up on, every knob at base): setting, crew wins, crew losses, median length, per-seed pass or the failing seeds.

Then the reference row: set `HOUND_HELM_LINEUP = false as boolean`, run `npx tsx scripts/duel-telemetry.ts > ../w4b-ladder-lineup-off.txt` and `npx vitest run tests/duelGates.test.ts`, record the row marked "reference, never kept", and set it back to `true as boolean`.

- [ ] **Step 3: The rungs, in order, all of them (spec §12)**

Run every setting below in order, with every other knob at its base value. Record the whole sweep, whichever rung passes. For each: change the one constant, run `npx tsx scripts/duel-telemetry.ts > ../w4b-ladder-<name>.txt` and `npx vitest run tests/duelGates.test.ts`, record a row as in Step 2, then put the constant back to its base value.

1. `AUTOCANNON_HITS_PER_HULL`: 10, then 8, then 6.
2. `AUTOCANNON_AUTO_RANGE` (tuning.ts): 450.
3. `HOUND_MISSILE_GAP`: 1125, then 750.
4. `HOUND_GUNNER_AUTOCANNON_BARS`: 2.

The setting kept is the first in this order that meets the target (crew wins ≥ 1 with every per-seed test passing), counting rung 0's base row first: if the base meets it, the base numbers ship. Set the kept setting's constant (none for the base) once the sweep is done. Never touch a Hunter or a Valkyrn knob. If no setting meets the target, every knob stays at its base value and the base numbers ship.

For the setting kept, update the tests it pins (kind (a), citing W-4 spec §12):
- rung 1: `tests/w4Loadout.test.ts`'s `AUTOCANNON.hitsPerHull` assertion reads the constant, so it needs no change;
- rung 2: W-4a's `w4Loadout` pin of `AUTOCANNON_AUTO_RANGE` (600) becomes the kept value, with `// W-4b ladder: was 600`;
- rung 3: no test pins `HOUND_MISSILE_GAP`'s value;
- rung 4: Task 7's "its first seated tick sends shipPower … then weaponPower Autocannon +1" reads the four commands (`shipPower`, then `weaponPower` Pew −1, then Autocannon +1 twice), and the resulting bars `[0, 2, 1]`.

Add the changed test files to Step 5's commit. `tests/w4Loadout.test.ts` is always in it (Step 1's `hitsPerHull` destructuring); its range pin changes only for rung 2.

- [ ] **Step 4: The report**

Under `## W-4b` in `docs/superpowers/research/2026-11-19-w4-report.md` write: the ladder table (every setting of the sweep, in order: rung 0's base row and its line-up-off reference row, then every value of rungs 1 to 4), the setting kept (or "none met the target: base numbers ship; the owner decides"), and for the kept setting the per-seed table (seed, length s, outcome, pew rounds, gun rounds, torpedo launches, hold end rt, hold cause, and the enemy room levels the crew raised by weapon, W/S/E for the gun, pew pew and the torpedo: amendment §3.5) from `telemetryLine` and the `gateSummary` lines. Under the table, one sentence comparing it with Task 7's lines (recorded before Task 8, when the AUTO autocannon still raised rooms) and Task 8's, so the owner can see what the amendment's rule cost the bots. The aggregate gate stays `it.skip` (kind (c)); its numbers are these.

Run: `npx tsc -b` then `npx vitest run tests/duelGates.test.ts tests/w4Loadout.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts`
Expected: the per-seed gates PASS (if no setting met the target and a per-seed test still fails, stop and report to the controller with the table: the owner decides, spec §12); the fences PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/duel/scripted.ts tests/w4Loadout.test.ts tests/helpers/scriptedDuel.ts tests/duelScripted.test.ts docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "tune(w4b): the spec §12 ladder on the Hound-only knobs (rung 0 the Helm line-up, the whole sweep recorded); <the setting kept, or base numbers>" -m "<the ladder table, one line per setting>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The same-version bless at V (60 today), the re-picks, the full verification and the gate entry

**Files:**
- Modify (generated): `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json` (only through `npm run bless`)
- Modify: the kind (b) tests in the report's "Task 11 re-picks" list
- Modify: `docs/gates.md`, `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the W-4b branch state W-4c starts from.

- [ ] **Step 1: The fences, unchanged**

Run: `git diff --stat W4_BASE -- tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts` then `git log --oneline W4_BASE..HEAD -- tests/w4HunterIdentity.test.ts` then `git diff W4_BASE -- tests/valkyrnIdentity.test.ts | grep "^[-+] *'" ` then `npx vitest run tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: no diff in the first three. `w4HunterIdentity` was created after `W4_BASE` (W-4a Task 1), so it is not diffed against it: the log lists exactly one commit, W-4a Task 1's, and the run passes. No changed pinned digest line in `valkyrnIdentity` (only Task 1's flatten helper, with Task 3's flag names and Task 8's two `room` fields in its left-out pattern). All PASS.

- [ ] **Step 2: The same-version bless**

Run: `npm run bless`
Expected: `blessed basic.json: ...; duel-1.json: ... ticks, outcome <o>, final <h>; determinism-v2.json: sim version V, ... (unchanged); duel-rematch.json: ...`. Never `--fresh`. A refusal means an artifact is missing or at another version: stop and report.

- [ ] **Step 3: The kind (b) re-picks**

For each test in the report's "Task 11 re-picks" list (Task 1 named it under the old numbering; it is this task's list) and any other red whole-run pin, run it, take the new value from the failure, and set it with `// W-4b (SIM V): was <old>`. Re-pick a seed only where the test's own comment says the seed was chosen for a property, searching as that comment says.

Run: `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts tests/duelModules.test.ts tests/tacticalSlots.test.ts tests/duelScripted.test.ts tests/duelGates.test.ts`
Expected: all PASS.

- [ ] **Step 4: The full verification**

Run, one at a time: `npx tsc -b`; `npx electron-vite build`; `npx vitest run --maxWorkers=4`; `npm run test:determinism` then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`; `npm run test:duel-app-runtime`.
Expected: tsc clean; the whole suite PASS (re-run a load-sensitive timeout alone); determinism passes on Node, Electron and Firefox; the smoke passes. If the smoke's forced round end (step 3) times out, re-pick `DUEL_TEST_SEED` as W-4a's Task 13 Step 3 says (`W-4b: <old> -> <seed>, decided on tick <t>`).

- [ ] **Step 5: The report**

Under `## W-4b` in the report add: the commit range (from W-4a's last commit to HEAD), the bless line from Step 2, the test count from Step 4, every kind (a) rewrite and kind (b) re-pick with its file, and whether `DUEL_TEST_SEED` moved.

- [ ] **Step 6: The gate entry**

Append to `docs/gates.md`, in the W-2 / W-3 / W-4a entries' format:

```markdown
## W-4b: turrets and AUTO/MAN (2026-11-19)

Spec `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` §3, §4, §6, §8-§12, §13.1, §13.4, §19, as amended by `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` §2 to §6; plan `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md`.

- [x] Automated (W-4b): `npx vitest run` passes (<files> files, <tests> tests). This includes the turret state (hashed, bounded per class), the slew law (rate, arc, wrap, integers), MAN slewing only the gun in hand at 455 / 341 while the other fights on AUTO, AUTO at 364 / 273 and on solution within 182 fine steps (firing through a sustained Helm turn), AUTO's solutions (seen, range, line of sight, arc, ship only) and firing (the pew per third, the autocannon to 80 % heat and never locking, nothing in the 30 s hold), the scripted Helm lining the guns up, MAN's fire-rate tables, `gunMode {slot, manual}` (a mode per gun) and `pewFire`'s AUTO refusal on pew pew's own switch, `turretAim` in every held schema, R and Shift+R (Z and V unread at the Hound's seat) and a switch on each card, the target room (`laserLock` on the Hound, E / Q and the plain room click, never `torpLock`; rounds fired by hand tagged with it; six autocannon hits or two pew pew hits by hand a room level, AUTO hits the hull only; the enemy window's bracket; online `lockSent`), the map's arc, muzzle lines, reticle and bracket, the online turret prediction equal to the stepped turret, and the scripted gunner on AUTO guns (`tests/w4*.test.ts`). `npx tsc -b` is clean; SIM_VERSION V (60 today), goldens blessed at V, no bump; `tests/valkyrnIdentity.test.ts`'s digests and `tests/w4HunterIdentity.test.ts` unchanged; determinism passes on Node, Electron and Firefox. Tuning ladder: <the setting kept, or "base numbers">.
- [ ] Manual (owner): play a Single player duel at the Hound's Weapons seat.
  1. Move the mouse over the map: the reticle follows; with the selected gun on MAN (R) its muzzle line trails the reticle and stops at the arc's edge.
  2. R flips the selected weapon's tag (the torpedo's when it is selected), Shift+R both guns' together; a click on a tag flips that weapon alone. Z and V do nothing here.
  3. In the first 30 s, on AUTO, the guns track the enemy and the tags read HOLD; nothing fires.
  4. Once hostile, on AUTO, both guns track and fire at the ship with no input; the bracket lights on the enemy.
  5. With both guns on MAN and pew pew selected, its tag reads MAN and the autocannon's AUTO (lit), and the autocannon keeps firing on its own while you aim the pew.
  6. MAN feels quicker to traverse and fire than AUTO.
  7. Q / E moves the bracket in the enemy window (Weapons, Shields, Engines), and the second hint row names the room; a click on a room there, with nothing picked up, sets it too.
  8. Six autocannon hits or two pew pew hits by hand take the bracketed room down a level; on AUTO the same hits only wear the hull.
  9. With the torpedo picked up (its card), Q / E still move the guns' room, and a room click sets the torpedo's own target.

  Screenshots for the look gate:
  1. The map in MAN, with the reticle, the selected arc and two muzzle lines.
  2. AUTO on solution with the bracket.
  3. The Weapons block with one gun on MAN and one on AUTO, and the enemy window with the target room bracketed.

  Does the slewing read as "slowly follows"?
```

Fill `<files>`, `<tests>` and the ladder line from Steps 4 and Task 13.

- [ ] **Step 7: Check for zeroed files, then commit**

Run: `git status --short` and, for each modified or new file, `head -c 64 <file> | od -c | head -1` (no file may read as all `\0`).

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json docs/gates.md docs/superpowers/research/2026-11-19-w4-report.md <each re-picked test, and scripts/network/duel-app-smoke.ts if DUEL_TEST_SEED moved>
git commit -m "test(w4b): same-version bless at SIM_VERSION V for the turrets, a mode per gun and the target room (duel goldens re-recorded); the kind b re-picks; the W-4b gate entry" -m "<the bless line from Step 2>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage (W-4b scope):** §3.1 state → Task 1, the flag split in Task 3; §3.2 slew law → Task 1, wired in Task 5; §3.3 numbers → W-4a's tuning constants, exercised in Tasks 1 and 5; §3.4 when a turret slews → Task 5 (§19.1: the MANUAL-torpedo hold is W-4c's); §4.1 the mode and `gunMode` → Task 4, the keys in Task 6; §4.2 targets and solutions (ship only, `pewLead`, `gunLead`, line of sight) → Task 5; §4.3 AUTO firing, the heat stop, LMB on an AUTO gun, the hold → Task 7 (sim) and Task 6 (app); §4.4 MAN tables → Task 4; §6 `pewFire`'s AUTO refusal → Task 7; §8 `turretAim`, `gunMode`, the tick order → Tasks 2, 4, 5, 7; §9 the mouse reticle and the mode keys → Task 6; §10 the tags and hint rows → Task 11, the map → Task 10; §11 online (the authority decides, held fields, prediction, `gunModeSent`) → Tasks 6 and 9; §12 AUTO gunner and the ladder → Tasks 7 and 13; §13.1 hash and bounds → Tasks 1, 3 and 8 (the cooldown bound is W-4a's Task 3); §13.4 the Valkyrn identity → Tasks 1, 3 and 8, the fences → every sim task; §14's turret, AUTO, MAN, online, hash and snapshot tests → Tasks 1-12; §19.1 the per-part bless and gates → Tasks 13 and 14.
- **Amendment coverage:** §2.1 the two flags → Task 3; §2.2 `gunMode {slot, manual}` and its admission order → Task 4; §2.3 hand control per gun and its table → Tasks 4, 5 and 7, `pewFire` on `pewManual` → Task 7; §2.4 R, Shift+R, the Ctrl / Meta rule, Z and V unread at the Hound's seat, the controls rows → Task 6; §2.5 a switch per card and the two hint rows → Task 11 (the TORPEDO tag's channel in Task 6); §2.6 online, per slot → Tasks 6 and 9 (the W-4c text is W-4c's); §3.1 the target room and the AUTO torpedo that follows it → Task 8 (the test; `land` is unchanged); §3.2 `laserLock` on the Hound → Task 8; §3.3 the round's `room` (state, `placeRound`, `emptyRound`, hash, bounds, `ROUND_SLOT`, the identity test) → Task 8; §3.4 the hit rules and `pewHit`'s members → Task 8, the callout and flash → Task 12, online's literal → Task 8; §3.5 what AUTO loses and the report's room levels → Tasks 8 and 13; §3.6 E / Q, the room click, the controller's fence, the bracket, `lockSent`, the hint row's name, the controls row → Tasks 11 and 12; §4 wire, state, events → Tasks 3, 4 and 8; §5's replaced bullets and kind (a) rewrites → Tasks 8 and 12 (Decision 25); §6 the smokes → Task 6, the copied E / Q block → Task 12, the gate entry's added checks → Task 14.
- **Where this plan departs from the amendment's letter:** `placeRound`'s `room` is optional, to keep the fence tests byte for byte (Decision 19). The Z and V rows of the controls list are re-labelled for the laser fit, not removed (Decision 24). `KeyR` is in `GUARDED_CODES` through `PRESS_CODES`, with no entry of its own (Decision 8). `authority/duelRules.ts` needs no edit for `gunMode`'s `slot` (Decision 17).
- **Placeholders:** every test body, sim and app, is written in full. The app tests extend W-4a's rigs (`w4Runtime`'s `rig()`, `onlineDuelSession`'s `rig()`, `w4Ui`'s `mount()`) and `pewViews`' `input()`.
- **The owner's 2026-11-19 calls:** hand control (its own switch on MAN, and selected; every other gun AUTO) → Task 4 (`handControl`, the rates), Task 5 (the slew), Task 7 (`tickGun`, firing tests), Task 10 (bracket), Task 11 (tags); the AUTO tolerance → Task 5 (`AUTO_FIRE_TOLERANCE`, `onSolution`), Task 7 (the turning test), Task 10 (the bracket one slew ahead). The Helm line-up (§12) → Task 7, rung 0 in Task 13. The amendment's calls (a switch per weapon on R and Shift+R; Q / E cycle one target room that a gun in hand damages; pew pew in hand damages it too; a MAN gun that is not selected fights on AUTO) → Tasks 3, 4, 6, 8, 11 and 12.
- **Type consistency:** `handControl`, `onSolution`, `AUTO_FIRE_TOLERANCE`, `AUTOCANNON_ARC_COS`, `HOUND_HELM_LINEUP`, `gunInterval(…, manual)`, `pewGain(…, manual)`, `tickPew(…, manual)`, `WeaponsPanel.gunsHand`, `turretOffset`, `slewTurret`, `turretWorldAim`, `autoSolution`, `AutoOnSolution`, `slewTurrets`, `gunLead`, `tickGun(…, auto)`, `heldTurretAim`, `predictTurret`, `weaponsSeatHeld(sel, trigger, aim)`, `sessionHeld(…, { sel, trigger, aim })`, `gunModeSent` (a pair, one per slot), `gunModeBase(slot, …)`, `DuelViewSource.turret`, `MapRequests.reticle/reticleAim/resetReticle`, `DuelRuntimeDeps.reticleAim`, `KeyAction 'weaponMode' / 'weaponModeAll'`, `ConsoleInput.mode`, `KeySample.modeTaps`, `modeRequests`, `CombatModelInput.turrets/weaponSel/reticle`, `CombatDraw.turretArc/muzzles/reticle/bracket`, `WeaponsPanel.pewManual/gunManual/gunsHold`, `ShipSystems.pewManual/gunManual`, `gunMode {slot, manual}`, `GunRound.room`, `roundRoom`, `ROUND_SLOT`, `PEW_ROOM_WEAR`, `placeRound`'s optional `room`, `firePew(…, room)`, `firePewTrigger(…, room)`, `pewHit`'s `room` and `level`, `lockSent`, `ContactSync.turret`, `ContactView.roomClick` and `houndRoomHint` are each defined once and used with the same signature in later tasks.
