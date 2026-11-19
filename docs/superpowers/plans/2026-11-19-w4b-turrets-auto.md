# W-4b: the reticle, the turrets, AUTO and MAN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Hound's two guns on slewing turrets that follow a mouse reticle, give both guns one AUTO / MAN mode (Z, and the shared tag), make AUTO aim with lead and fire within a small tolerance of its solution at a seen, hostile enemy ship in range, arc and line of sight (the pew on each charged third, the autocannon until 80 % heat; track but hold fire during the 30 s hold). In MAN put only the selected gun in the gunner's hands, with +25 % traverse and about +20 % fire rate, while the other gun fights on AUTO (owner 2026-11-19). Draw the selected arc, the muzzle lines, the reticle and the AUTO bracket, predict the own seat's selected turret online, have the scripted Helm line the guns up, and move the scripted gunner onto AUTO guns, tuned by spec §12's ladder.

**Architecture:**

- **New hashed state.** `ShipSystems.pewTurret`, `gunTurret` (signed fine-step offsets from the nose) and `gunsManual` (one flag for both guns) are appended to the ship module's `SYSTEMS_TAIL` after `torpManual`, `gunsManual` in `FLAGS`, with per-class bounds in `validateTacticalValues`. Snapshots and clones follow from the module, as W-3's fields did.
- **One slew law.** `slewTurret(turret, heading, aim, rate, arcSteps)` in the new `sim/tactical/turret.ts` (integers, `+ −` and the integer modulo) is the only turret arithmetic. The step calls it through `slewTurrets(state, i, input)` (also in `turret.ts`), which runs in `applyWeaponsInput` right after `stepBurst` and before `tickGun`, and returns which AUTO guns are on solution. The app's prediction calls the same `slewTurret`.
- **Hand control (owner 2026-11-19, spec §3.4).** One helper, `handControl(state, i, weaponSel, slot)` in `state.ts` (`gunsManual && weaponSel === slot`; W-4c adds "and no MANUAL flight"), says which gun is in the gunner's hands. The gun in hand follows the reticle at MAN traverse, fires on LMB and takes MAN's rates. Every other powered gun is AUTO-driven, in MAN too. The slew, `tickGun`, `tickPew` (through `tickWeapons`), the console's tag and the map's bracket all read it.
- **AUTO.** `autoSolution(state, i, 'pew' | 'gun')` (turret.ts) returns the lead aim's offset from the nose (W-1's `pewLead`, the new `gunLead` in `gun.ts` with the velocity relative to the Hound), or null when the enemy is unseen, out of range, behind the planet or a rock, has no intercept (or none inside the round's life, for the autocannon), or lies outside the arc. A gun is on solution when the slew leaves it within `AUTO_FIRE_TOLERANCE` (182 fine steps) of that offset (`onSolution`, owner 2026-11-19). `tickGun` gains an `auto` argument (on solution and hostile); the pew's AUTO round is fired at the end of `applyWeaponsInput`, where `firePew` runs today.
- **MAN.** `gunMode {manual}` is admitted first in `WEAPON_ORDER` beside `laserMode` and `torpMode`. W-4a's seams gain a `manual` flag (the caller's hand control) and keep their bodies otherwise: `gunInterval(state, i, manual)` reads the MAN row, `pewGain(state, i, manual)` reads `PEW_MAN_GAIN_BY_BARS`, and `gunAimFine` / `pewAimFine` add the turrets. `pewFire {}` is refused `unavailable` in AUTO.
- **The wire.** `HeldInput.turretAim` (the reticle's world bearing, a fine aim, −1 none) rides every held schema, the authority's expiry and pause lists and `ShipInput.turretAim`.
- **The app.** `MapRequests.aimLaser` becomes `reticle` (the laser fit's MANUAL laser and the Hound's turrets share it). `KeyAction 'laserMode'` becomes `'weaponMode'`: Z sends `gunMode` on the Hound and `laserMode` on the laser fit. LMB fires a gun only in MAN. A pure `predictTurret` (in `app/duel/weaponsSeat.ts`) is the online seat's selected-turret prediction, the throttle's analogue.
- **The scripted gunner** drops W-4a's stand-in pew and leaves the guns on AUTO. **The scripted Helm's line-up** (W-4a) moves to the autocannon's 600 u and ±30°.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2 (+ jsdom for UI tests), React + zustand (console), zod 3 (wire), Pixi.js (map), Electron/electron-vite, the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (converged at 96c8c2dd). W-4b is §19 item 2 and §19.1's W-4b rules: §3 (all), §4 (all), §6's AUTO refusal, §8's `turretAim`, `gunMode` and the tick order, §9's mouse reticle and Z, §10's tags, the map's arc, muzzle lines, reticle and bracket, §11 (all), §12 (AUTO, no stand-in, the tuning ladder), §13.1, §13.4's Valkyrn identity change, §14's turret, AUTO, MAN, online and hash tests.

**Builds on:** the W-4a plan `docs/superpowers/plans/2026-11-19-w4a-loadout.md`, fully executed on the same branch. Every W-4a name is consumed exactly as that plan defines it (Interfaces blocks below quote them). **Shared names:** the W-4 contract (controller scratchpad `w4-contract.md`); Decisions 1, 2, 4, 6 and 11 add or move names, all inside this plan.

**Worktree:** the W-4a worktree `C:\Users\djuar\FTLite\.worktrees\w4` on branch `w4-weapons-controls`, with its four junctions (see W-4a's "Worktree setup (controller)"). The controller checks `npm run test:duel-app-runtime` passes there before Task 1. Every command runs from the worktree root.

## Global Constraints

- **Version (spec §13.3's version note, a33ad26e).** V is the SIM_VERSION on master when W-4 starts: **60 today** (the fire-venting merge 0dbe1be6), so the spec's "SIM 59" means V and its "SIM 60" means V + 1. SIM_VERSION stays **V** for all of W-4b: Task 11 re-blesses at V with a same-version `npm run bless` (a deliberate gameplay change; precedent 54d5825d, d8640a20), and W-4b makes no bump. The V → V + 1 bump is W-4c's last task. Read V once with `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts` and write the number wherever this plan says V. Never pass `--fresh`. Never hand-edit goldens.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **Exact names and values (binding):**
  - **State:** `ShipSystems.pewTurret: number`, `gunTurret: number` (signed integers within ± their class's `arcSteps`, 0 without a turret), `gunsManual: boolean` (false AUTO, true MAN; true only on the crew slot of a turret class). All 0 / false at every round's start.
  - **`sim/tactical/turret.ts`:** `turretOffset(heading, aim): number`, `slewTurret(turret, heading, aim, rate, arcSteps): number`, `turretWorldAim(heading, turret): number`, `onSolution(turret: number, sol: number | null): boolean`, `autoSolution(state, i, gun: 'pew' | 'gun'): number | null`, `interface AutoOnSolution { pew: boolean; gun: boolean }`, `slewTurrets(state, i, input): AutoOnSolution`.
  - **`sim/tactical/state.ts`:** `handControl(state: TacticalState, i: number, weaponSel: number, slot: number): boolean` (Task 3).
  - **`sim/tactical/tuning.ts`:** `AUTO_FIRE_TOLERANCE = 182` (Task 4); `AUTOCANNON_ARC_COS = 0.8660254037844386` (cos 30°, Task 6).
  - **`sim/tactical/gun.ts`:** `gunLead(state, i, tx, ty, tvx, tvy): number`; `gunInterval(state, i, manual = false)`; `tickGun(state, i, input, auto = false)`.
  - **`sim/tactical/pew.ts`:** `pewGain(state, i, manual = false)`, `tickPew(state, i, manual = false)` (Task 3); `pewAutoReady(state, i)` (Task 6).
  - **Command:** `{ kind: 'gunMode'; manual: boolean }`; `WEAPON_ORDER = ['laserMode', 'torpMode', 'gunMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']`.
  - **Held input:** `HeldInput.turretAim?: number` (−1..65535; absent or −1 none). **Ship input:** `ShipInput.turretAim: number` (−1 in `IDLE_INPUT`, `UNCREWED_INPUT`, hunter.ts's literal and an unattended Weapons). `step.ts` `heldTurretAim(h): number`.
  - **Tuning (Task 10, the ladder's knobs, base values):** `HOUND_HELM_LINEUP = true` (`scripted.ts`; rung 0's reference row turns it off), `AUTOCANNON_HITS_PER_HULL = 12` (`tuning.ts`; `AUTOCANNON.hitsPerHull` reads it, `GUN` keeps `GUN_HITS_PER_HULL`), `HOUND_MISSILE_GAP = 1500` and `HOUND_GUNNER_AUTOCANNON_BARS: 1 | 2 = 1` (`scripted.ts`; `houndGunner` reads them, the Valkyrn's `gunner` keeps `MISSILE_GAP`).
  - **App:** `MapRequests.reticle(aim)`, `reticleAim(): number | null`, `resetReticle()` (renamed from `aimLaser`, `laserAim`, `resetLaserAim`); `DuelRuntimeDeps.reticleAim?()` (renamed from `laserAim?`); `KeyAction 'weaponMode'` (renamed from `'laserMode'`, still `KeyZ`); `weaponsSeatHeld(sel, trigger, aim = -1)`; `sessionHeld(k, d, me, steer, weapons?: { sel: number; trigger: boolean; aim?: number })`; `predictTurret(t, slot, held, manual, k): number`; `DuelViewSource.turret?(slot: 0 | 1): number`; the online source's `turret(slot)` and `gunModeBase(manual: boolean | null)`; `gunModeSent` in `onlineDuel.ts`.
  - **View:** `CombatModelInput.turrets?`, `weaponSel?`, `reticle?`; `CombatDraw.turretArc`, `muzzles`, `reticle`, `bracket`; `WeaponsPanel.gunsManual?`, `gunsHand?`, `gunsHold?`; Buttons `gun-mode-pew`, `gun-mode-autocannon`.
- **The fences (spec §13.4).** The Valkyrn and its laser fit have no turret: `slewTurrets` returns at once on them, `gunMode` is `unavailable`, their turret fields stay 0 / false, and `tickGun`'s `turret === null` branch is today's code. `tests/valkyrnIdentity.test.ts`'s five digests do not change (Task 1 rebuilds its hashed array without the three new fields, by name). `tests/valkyrnRoundsRocks.test.ts`, `tests/w4HunterIdentity.test.ts`, `tests/pewHunter.test.ts` and `tests/torpedoGuidance.test.ts` pass unchanged at the end of every task.
- **The fallout rule (binding on every task; as W-4a's).** Classify each failing test exactly once: a rule W-4b replaces (kind (a): rewrite, citing "W-4 spec §n"); a whole-run number (kind (b): re-pick in Task 11 with `// W-4b (SIM V): was <old>`); a band (kind (c): stays as it is). Never edit a band's limits, never skip a kind (a) or (b) test, never delete a test except a kind (a) test whose rule no class keeps (name it in the commit).
- **Known-red window:** these fail by design, and only these:
  - from Task 1 (new hashed fields) until Task 11: `tests/golden.test.ts`, `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts`, and any test that pins a duel hash or flatten length (`tests/duelCheckpoint.test.ts`, `tests/duelSnapshot.test.ts`: list each in the report's "Task 11 re-picks");
  - from Task 4 (turrets move rounds) until Task 11: the trajectory pins (`tests/duelModules.test.ts`'s `played(…)`, `tests/tacticalSlots.test.ts`, `tests/duelScripted.test.ts`'s whole-run values);
  - from Task 6 (AUTO fires) until Task 10: `tests/duelGates.test.ts`'s per-seed tests, only if a seed fails; Task 10's ladder must end with them green.
  Every other test passes at the end of each task. Each task runs its own targeted tests; the full suite runs in Tasks 1, 6 and 11.
- **Sim rules:** only `+ − × ÷` and `sqrt` in `src/renderer/src/sim/**` (`tests/helpers/determinismGuard.ts`: `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt` only; no trig, no `**`, no `Math.hypot`). No sim file imports from `app/`, `render/`, `input/` or `ui/`. No new randomness. The turret arithmetic is integer.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`; `npm run test:duel-app-runtime`; `npm run test:determinism`. Never two vitest processes at once. A full-suite timeout under load is re-run alone before it counts (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`).
- **Determinism logs:** after every `npm run test:determinism`, `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging.
- **Line endings:** working copies are CRLF (`core.autocrlf=true`). Change existing files with the Edit tool; never hand-convert endings. New files may be LF.
- **Worktrees:** never delete a `node_modules` junction (including `services/signalling/node_modules`); a missing one is recreated, never "cleaned".
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` as its last `-m`. After writing any file, check it is not all null bytes (`head -c 64 <file> | od -c | head -1`); commit at the end of every task. **Match every edit by the quoted text**, not a line number: master's code was read at `b4d5dba4`, and W-4a's code is quoted from its plan. Every "unchanged" diff uses W-4a's fixed `W4_BASE` (in `docs/superpowers/research/2026-11-19-w4-report.md`), never `master`.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "W-4 spec §n" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **`turret.ts` holds the slew law and AUTO; `pew.ts` and `gun.ts` do not import it.** `turret.ts` imports `pewLead` / `pewMuzzle` (pew.ts) and `gunLead` (gun.ts), so the reverse import would be a cycle. `pewAimFine` and `gunAimFine` therefore write `turretWorldAim`'s formula inline (`(heading × HEADING_COUNT + turret + AIM_STEPS) % AIM_STEPS`), and Task 4's test pins them equal to `turretWorldAim`. `turretOffset` is `clampAim`'s signed difference (pew.ts L55) without the clamp.
2. **`slewTurrets` returns the AUTO on-solution flags** (`{ pew, gun }`), and `applyWeaponsInput` passes them on: `tickGun(state, i, input, auto.gun && enemyHostile(state))` and, last, the AUTO pew round. So the hold rule (§4.3: track, no fire while `hostileAt` is −1) lives in `weapons.ts`, beside the slew, and `gun.ts` needs no science import. The gun in hand never sets a flag; an AUTO-driven gun does, in MAN too (Decision 14).
3. **The range test is centre to centre, the line of sight muzzle to centre.** §4.2 says "its centre is within the gun's AUTO range" and "the line from the muzzle to it is clear": the range is the own ship's centre to the enemy's centre (squared, so no sqrt); the sight line runs from the gun's muzzle point (`pewMuzzle`; for the autocannon the nose point between its muzzles, `muzzleForward` along the heading) to the enemy's centre, through `geometry.ts lineOfSight` (planet and rocks).
4. **The AUTO pew never bursts (spec §4.3).** The pew starts every round full (`state.ts` L230) and stays full through the hold, so the literal `pewReady` rule would open every round with three rounds on three ticks: a burst, which §4.3 rules out ("it fires each time a third has charged, and it never bursts"). The AUTO pew therefore fires only when it is on solution, hostile, and `pewAutoReady(state, i)` holds (new in `pew.ts`). That means `pewReady`, and either a full charge or a third completed by the last `tickPew`:
   - `s.pewCharge >= pewFull(def)`, or
   - `s.pewCharge % pewThird(def) < pewGain(state, i)`.

   From full it fires one round, which leaves exactly two thirds. The next round comes when the charge is full again: one round each time a third has charged, every `PEW_TICKS_BY_BARS` ticks. AUTO's gains (6 / 8 / 12 / 15) divide the third (360) exactly, so the test is integer and exact. A charge drained by MAN shots fires again at each third it completes. The rule is stateless: no new hashed field.
5. **The view draws the turret about the interpolated heading.** §10 says "`aimDir` of the interpolated turret". The turret is fixed to the hull, so the muzzle line is drawn at the interpolated nose angle plus the turret's current offset (`turret / AIM_STEPS` of a turn). The sim ticks at 60 Hz (`TICK_HZ`), so the offset needs no interpolation of its own; online, the own seat's selected turret is the predicted one (Task 7).
6. **`predictTurret` is a pure app helper,** `predictTurret(t, slot, held, manual, k)` in `app/duel/weaponsSeat.ts`, beside W-4a's seat rules. The online source's `turret(slot)` calls it with its `sentHeld`, the mode in flight (`gunModeBase`, the throttle's `throttleBase` pattern) and `unackedFrames`; Single player's `turret(slot)` returns the sim's value. This makes spec §11's agreement test a unit test against the stepped sim.
7. **LMB in AUTO does nothing.** Both runtimes send `pewFire` only in MAN and put `gunHeld` in the held frame only in MAN (`weaponsSeatHeld(sel, trigger && manual, aim)`), and the autocannon's dead-trigger refusal is shown only in MAN, so an AUTO gun gets no command and no refusal (§4.3). The mode the runtimes judge by is the latest queued / in-flight `gunMode`, else the sim's.
8. **Z is `KeyAction 'weaponMode'`.** The runtimes send `gunMode` at the Hound's Weapons seat (W-4a's branch) and `laserMode` in the laser class's branch (unchanged code, renamed press). The BEAM card's tag and both gun tags press `'weaponMode'`.
9. **The tags.** The two gun tags are one switch: both are lit in MAN, and a click on either presses `weaponMode`. Each tag's word is what its gun does (Decision 14): `MAN` on the gun in hand (`WeaponsPanel.gunsHand`, the slot in hand or −1), else `HOLD` while the hold keeps AUTO quiet (`!enemyHostile(t)`), else `AUTO`. So in MAN with pew pew selected they read MAN and AUTO (or HOLD), and with the torpedo selected both read AUTO (or HOLD). With no enemy ship the hold never ends, so `HOLD` stays; no duel has no enemy.
10. **The bracket** is drawn on the enemy's drawn marker when an AUTO-driven powered gun (not in hand, Decision 14) is on solution. It is `hot` once hostile and `dim` in the hold. The view's test is the sim's own one tick ahead: `onSolution(slewTurret(turret, heading, turretWorldAim(heading, sol), traverse[0], arcSteps), sol)` from the replica's turret and heading. So a target whose lead drifts a step between ticks keeps the bracket, where "the turret equals the solution now" would blink every time the lead moved (review finding 11). The view reads the replica's turrets for this, never the prediction.
11. **The ladder's knobs are Hound-only constants (Task 10).** `MISSILE_GAP` is also the Valkyrn pair's (`gunner` on the Valkyrn class, pinned by `tests/valkyrnIdentity.test.ts`), and `AUTOCANNON` copies `GUN`'s hit numbers. So Task 10 first adds `HOUND_HELM_LINEUP`, `AUTOCANNON_HITS_PER_HULL`, `HOUND_MISSILE_GAP` and `HOUND_GUNNER_AUTOCANNON_BARS` at their base values (a no-op), then moves only those. Rung 4's 0 / 2 / 1 is the gunner sending `weaponPower {Pew, −1}` then `{Autocannon, +1}` twice after the `shipPower`, each pre-checked as §12 requires.
12. **The duel app smoke presses Z before its quiet check (Task 5).** W-4a's step 5 asserts that Space fires nothing for 2 s. From Task 6 an AUTO gun may fire on its own once hostile, so the step first sets both guns to MAN (Z), where nothing fires without the left button.
13. **The scripted gunner sends no `gunMode` and no held aim** (§12). Its `houndGunner` keeps W-4a's bar move and torpedo rule and loses the stand-in pew; its AUTO guns open the tick after its torpedo launch ends the hold, or at the 30 s clock.
14. **Hand control (owner 2026-11-19, spec §3.4, §17 item 19).** In MAN only the selected gun is the gunner's: `handControl(state, i, weaponSel, slot) = gunsManual && weaponSel === slot` (`state.ts`, so `gun.ts`, `pew.ts`, `turret.ts`, `weapons.ts` and the view share it without a cycle). It reads the held `weaponSel` through `ShipInput`, so it is not hashed state. The gun in hand slews to the reticle at MAN traverse (holding with no reticle), fires on the trigger (`gunHeld`, `pewFire`) and takes MAN's rates (`gunInterval(…, true)`, `pewGain(…, true)`). Every other powered gun is AUTO-driven with AUTO's numbers and rules: the unselected one in MAN, and both with the torpedo or nothing selected. `pewFire`'s admission stays on the mode (spec §6): a held `weaponSel` can trail the command by a frame online, and the app sends `pewFire` only with pew pew selected in MAN. W-4c adds "no MANUAL flight" to the helper's condition, so the whole sim changes in one place.
15. **The AUTO fire tolerance (owner 2026-11-19, spec §4.2, §17 item 20).** `onSolution(turret, sol)` is `sol !== null && |turret − sol| ≤ AUTO_FIRE_TOLERANCE` (182). The round still flies along the real turret. 182 + the lead's 128 half step is 17.8 u at 600 u, inside the Hunter's 20 u radius. 182 is also the autocannon's per-tick lag in a 150°/s turn (455 − 273), which with the pew's 91 keeps a trailing gun on solution for a tick or two after it meets the target. A model scan (4096 starts, two turns each) found no pass without an on-solution tick at 128 or more, and 531 under the exact rule.
16. **The scripted Helm's line-up moves to the autocannon (spec §12, Task 6).** W-4a's ±60° / `PEW_RANGE` stand-in becomes ±30° (`AUTOCANNON_ARC_COS`) within `AUTOCANNON_AUTO_RANGE`. A target inside ±30° is inside both arcs, so both AUTO guns can bear, and the Helm goes back to its orbit. Task 10 rung 0 records what it is worth (`HOUND_HELM_LINEUP`).


## Seam for W-4c

W-4c (`docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`) adds the MANUAL-torpedo flight gates on top of these exact shapes. W-4c's plan anchors on them as written here:
- **The online prediction:** the online source's `turret(slot: 0 | 1)` returns `predictTurret(d.tactical, slot, sentHeld, gunModeShown ?? d.tactical.systems[0].gunsManual, unackedFrames)` at the Hound's Weapons seat (Task 7). W-4c's flight gate is the `k` argument at that call: `manualTorpedoFlying(d.tactical) ? 0 : unackedFrames`.
- **Hand control:** `handControl(state, i, weaponSel, slot)` in `state.ts` (Task 3) is `return state.systems[i]!.gunsManual && weaponSel === slot;`. The slew (`slewTurrets`' per-gun branch `if (handControl(state, i, input.weaponSel, slot)) { … } else { … AUTO … }`, Task 4), `tickGun` (Task 3, Task 6), `tickPew` through `tickWeapons` (Task 3), the console's `gunsHand` (Task 9) and the map's bracket (Task 8) all read it. W-4c's flight rule (spec §3.4, §7: during a MANUAL flight no gun is in hand, so both are AUTO-driven) is one added condition there, `&& missileOf(state, i)?.manual !== true` (`missileOf` is in `state.ts` itself, so no import and no cycle; `manualTorpedoFlying` lives in `manualTorpedo.ts`, which `turret.ts` cannot import). It replaces the old seam, a `manualTorpedoFlying` guard in the MAN slew.
- **The `pewFire` AUTO refusal:** in `step.ts`'s `pewFire` block (Task 6), `if (!sys0.gunsManual) { result(e, 'unavailable'); continue; }`, just before the noop. W-4c's `missile-in-flight` refusal goes right after it.
- **The crew literal:** `turretAim: gunner >= 0 ? heldTurretAim(gunnerHeld) : -1` (Task 2).
- **The online held frame:** after Task 5, `pump` builds it as `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent ? gunModeSent.manual : d.tactical.systems[0].gunsManual), aim: reticleNow() ?? -1 })`.

---

### Task 1: The turret state, its hash and bounds, the slew law, and the Valkyrn digest without the new fields

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

### Task 3: `gunMode`, hand control, and MAN's fire-rate tables

**Files:**
- Modify: `src/renderer/src/net/contracts.ts`, `net/codec.ts`, `sim/tactical/hash.ts` (`shipModule.commands`), `sim/duel/step.ts` (`WEAPON_ORDER`, `DUEL_KINDS`, the admission), `app/duel/runtime.ts` (`isWeaponsCommand`)
- Modify: `src/renderer/src/sim/tactical/state.ts` (`handControl`), `sim/tactical/gun.ts` (`gunInterval`, `fireRound`, `tickGun`), `sim/tactical/pew.ts` (`pewGain`, `tickPew`), `sim/tactical/weapons.ts` (`tickWeapons`' `tickPew` call)
- Modify: `tests/duelModules.test.ts` (the kinds list), `tests/duelCheckpoint.test.ts` (its codec case's `examples` map gains `gunMode`)
- Create: `tests/w4Manual.test.ts`

**Interfaces:**
- Consumes: W-4a's `gunInterval(state, i)` (body quoted in Step 4), `PEW_MAN_GAIN_BY_BARS`, `AUTOCANNON_MAN_INTERVAL_BY_BARS`, `hasTurret`, `houndWeapons(st, bars)` (W-4a helper), `ShipInput.weaponSel` (W-4a).
- Produces: `DuelCommand { kind: 'gunMode'; manual: boolean }`; `gunsManual` set by the step; `handControl(state, i, weaponSel, slot)` (Decision 14); `gunInterval(state, i, manual = false)`, `pewGain(state, i, manual = false)`, `tickPew(state, i, manual = false)`.

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §3.4, §4.1, §4.4: gunMode {manual} (Weapons seat only; unavailable without a turret; malformed; noop), set at
// once; hand control (MAN and selected: owner 2026-11-19); the gun in hand's fire rate: the pew's gain 7 / 10 / 14 / 18
// units a tick and the autocannon's interval 8 / 7 / 5 / 4.
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

describe('gunMode (W-4 spec §4.1)', () => {
  it('Weapons seat only; set at once; a repeat is a noop; a non-boolean is malformed', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: true }, 1), env(d, d.helmPlayer, { kind: 'gunMode', manual: false }, 1)] });
      // stepDuelTick sorts its results by player, then sequence (step.ts, its last line); the Helm is player 0 here.
      expect(d.helmPlayer).toBe(0);
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'not-at-weapons'], ['applied', null]]);
      expect(s.gunsManual).toBe(true);
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: true }, 2)] })[0]).toMatchObject({ status: 'noop' });
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: 1 } as never, 3)] })[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: false }, 4)] });
      expect(s.gunsManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('is unavailable on the Valkyrn and on its laser fit (no turret)', () => {
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) {
      const v = createSeatedDuel(CUTTER, 5, 0, 2, cls);
      try { expect(stepDuelTick(v, { held: [], commands: [env(v, 1 - v.helmPlayer, { kind: 'gunMode', manual: true }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' }); }
      finally { disposeDuel(v); }
    }
  });
});

describe('hand control (W-4 spec §3.4, owner 2026-11-19)', () => {
  it('a gun is in hand only in MAN and selected; the Hunter never', () => {
    const st = createTacticalState(5), s = st.systems[0]!;
    expect([handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew), handControl(st, 0, WeaponSlot.Autocannon, WeaponSlot.Autocannon)]).toEqual([false, false]);   // AUTO
    s.gunsManual = true;
    expect([handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew), handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Autocannon)]).toEqual([true, false]);
    expect([handControl(st, 0, WeaponSlot.Torpedo, WeaponSlot.Pew), handControl(st, 0, -1, WeaponSlot.Autocannon)]).toEqual([false, false]);   // the torpedo or nothing selected: both AUTO-driven
    expect(handControl(st, 1, -1, WeaponSlot.Pew)).toBe(false);
  });
});

describe("the gun in hand's fire rate (W-4 spec §4.4)", () => {
  it('the pew gains 7 / 10 / 14 / 18 units a tick in hand and keeps 6 / 8 / 12 / 15 otherwise, MAN or not', () => {
    for (const [bars, man, auto] of [[1, 7, 6], [2, 10, 8], [3, 14, 12], [4, 18, 15]] as const) {
      const st = houndWeapons(createTacticalState(5), [bars, 0, 0]); st.systems[0]!.bars[1] = 10;   // the overdrive bar allows a 4th
      expect(pewGain(st, 0), `${bars} bars AUTO`).toBe(auto);
      st.systems[0]!.gunsManual = true;
      expect(pewGain(st, 0), `${bars} bars MAN, not in hand`).toBe(auto);   // owner 2026-11-19: an AUTO-driven gun keeps AUTO's rate
      expect(pewGain(st, 0, true), `${bars} bars in hand`).toBe(man);
    }
    const hunter = createTacticalState(5);
    expect([pewGain(hunter, 1), pewGain(hunter, 1, true)]).toEqual([6, 6]);   // the Hunter's rate is its class's (720 / 120), unchanged
  });
  it('the autocannon in hand fires every 8 / 7 / 5 / 4 ticks, measured between gunFire events; MAN with it unselected keeps AUTO\'s row', () => {
    for (const [bars, interval] of [[1, 8], [2, 7], [3, 5], [4, 4]] as const) {
      const st = houndWeapons(createTacticalState(5), [0, bars, 0]), s = st.systems[0]!; s.bars[1] = 10; s.gunsManual = true;
      expect([gunInterval(st, 0), gunInterval(st, 0, true)], `${bars} bars`).toEqual([[0, 10, 8, 6, 5][bars], interval]);
      const at: number[] = [];
      for (let k = 0; k < 80; k++) { st.events = []; tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true, weaponSel: WeaponSlot.Autocannon }); if (st.events.some((e) => e.kind === 'gunFire')) at.push(k); }
      expect(new Set(at.slice(1).map((t, j) => t - at[j]!)), `${bars} bars`).toEqual(new Set([interval]));
    }
  });
});
```

(`tickGun`'s trigger in this task is still W-4a's `input.gunHeld` for any turret gun; Task 6 keeps it for the gun in hand only. The interval row is the hand control of the tick, `weaponSel` 1 here.) A noop result is `{ status: 'noop' }` (`step.ts` L317, L322: `result(e, undefined, 'noop')`), as the test reads.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Manual.test.ts`
Expected: FAIL (`gunMode` is `not-in-duel`; MAN gains equal AUTO's).

- [ ] **Step 3: The command**

`net/contracts.ts`: after the `torpMode` member add:

```ts
  /** W-4 spec §4.1: Weapons sets both of the Hound's guns' mode: true MAN (the selected gun follows the reticle and fires on
   *  LMB), false AUTO (each aims with lead and fires by itself at a seen, hostile enemy ship). Unavailable without a turret. */
  | { kind: 'gunMode'; manual: boolean }
```

`net/codec.ts`: after the `torpMode` line add `z.object({ kind: z.literal('gunMode'), manual: z.boolean() }).strict(),   // W-4b: both guns' AUTO / MAN`, and add "W-4b adds `gunMode`" to the codec's header list.

`sim/tactical/hash.ts` `shipModule.commands`: `['laserMode', 'torpMode', 'gunMode', 'laserLock', ...]` (insert `'gunMode'` after `'torpMode'`).

`app/duel/runtime.ts` `isWeaponsCommand`: add `|| c.kind === 'gunMode'`.

`sim/duel/step.ts`:
1. `WEAPON_ORDER`: insert `'gunMode'` after `'torpMode'`. `DUEL_KINDS`: insert `'gunMode'` after `'torpMode'`.
2. In the loop's kind filter (`if (c.kind !== 'laserMode' && c.kind !== 'torpMode' && ...`), add `&& c.kind !== 'gunMode'` after `c.kind !== 'torpMode'`.
3. After the `torpMode` branch (`else if (c.kind === 'torpMode') { ... }`), add:

```ts
    else if (c.kind === 'gunMode') {   // W-4 spec §4.1: both guns' mode, set now, so a same-tick pewFire is judged in it
      if (!hasTurret(classOf(d.tactical, 0))) { result(e, 'unavailable'); continue; }   // the Valkyrn and its laser fit
      if (typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      if (c.manual === sys0.gunsManual) { result(e, undefined, 'noop'); continue; }
      sys0.gunsManual = c.manual;
    }
```

4. Extend the admission comment block (the long `// Tactical commands, ...` comment): "W-4: gunMode third, set at once, so a same-tick pewFire is judged in the new mode."

`tests/duelModules.test.ts`: in the kinds expectation insert `'gunMode'` (alphabetically, after `'designate'`), and add "W-4 spec §4.1 (gunMode)" to its comment.

`tests/duelCheckpoint.test.ts`, the case "the duel codec admits exactly the duel modules' command kinds plus the core's setPaused": its `examples` map must name every module command (`expect(kinds.sort()).toEqual(Object.keys(examples).sort())`), so after `torpMode: { kind: 'torpMode', manual: true },` add `gunMode: { kind: 'gunMode', manual: true },   // W-4 spec §4.1`.

- [ ] **Step 4: Hand control and MAN's tables (Decision 14)**

`sim/tactical/state.ts`, after `missileOf` (or beside `classOf`), add:

```ts
/** W-4 spec §3.4 (owner 2026-11-19): whether ship i's gun `slot` (0 pew pew, 1 the autocannon) is in the gunner's hands this
 *  tick: MAN, and the Weapons seat's selected weapon (`weaponSel`, held input, −1 none). The gun in hand follows the
 *  reticle, fires on the trigger and takes MAN's rates; every other powered gun is AUTO-driven, in MAN too. Only the crew
 *  slot of a turret class is ever MAN (hash.ts), so this is false elsewhere. W-4c adds the MANUAL flight here. */
export function handControl(state: TacticalState, i: number, weaponSel: number, slot: number): boolean {
  return state.systems[i]!.gunsManual && weaponSel === slot;
}
```

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

   (Task 6 replaces these three lines and the condition above them.) The Valkyrn's gun has no turret, so `hand` is false and `fireRound` sets `intervalTicks` as before.

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
git commit -m "feat(w4b): gunMode sets both guns AUTO / MAN; hand control (MAN and selected, owner 2026-11-19) and its fire-rate tables (W-4 spec §3.4, §4.1, §4.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The turrets slew: AUTO's solutions, MAN's reticle, and rounds along the turrets

**Files:**
- Modify: `src/renderer/src/sim/tactical/turret.ts` (`onSolution`, `autoSolution`, `slewTurrets`), `sim/tactical/tuning.ts` (`AUTO_FIRE_TOLERANCE`), `sim/tactical/gun.ts` (`gunLead`, `gunAimFine`), `sim/tactical/pew.ts` (`pewAimFine`), `sim/tactical/weapons.ts` (`applyWeaponsInput`)
- Modify: `tests/w4Turret.test.ts`

**Interfaces:**
- Consumes: `pewLead(state, i, tx, ty, tvx, tvy)`, `pewMuzzle(state, i)` (pew.ts), `interceptTime`, `nearestHeading` (lead.ts), `lineOfSight(state, ax, ay, bx, by)` (geometry.ts), `shipSeen(t, i)` (science.ts), `handControl` (Task 3), `weaponBars`, `WeaponSlot.Pew | Autocannon`, `hasTurret`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, W-4a's `gunAimFine` / `pewAimFine` bodies (quoted in Step 4).
- Produces: `AUTO_FIRE_TOLERANCE`, `gunLead`, `onSolution`, `autoSolution`, `AutoOnSolution`, `slewTurrets` (turret.ts). Task 6 consumes `slewTurrets`' return; Task 8 `onSolution`.

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
    const st = scene([1, 1, 1], 0, 0, 5000), s = st.systems[0]!; s.gunsManual = true;   // the Hunter 5000 u off: no AUTO solution
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 0]);
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455 - 364, 341]);   // owner 2026-11-19: the pew, out of hand, slews on AUTO
    tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341 - 273]);   // the torpedo selected: both AUTO-driven
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: -1 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 68]);   // the autocannon in hand with no reticle holds
  });
  it('MAN: the gun out of hand fights on AUTO: it slews onto its own lead at its AUTO traverse and reports on solution; the gun in hand never reports (owner 2026-11-19)', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!; s.gunsManual = true;
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

/** Which AUTO guns sit on their solution after this tick's slew (Task 6 fires them). */
export interface AutoOnSolution { pew: boolean; gun: boolean }
const NONE: AutoOnSolution = Object.freeze({ pew: false, gun: false });

/**
 * W-4 spec §3.4: one tick of ship i's turrets, before anything moves (the pre-move heading), from applyWeaponsInput after
 * stepBurst and before tickGun. Only the crew slot of a turret class, only while Weapons is attended; a gun on 0 bars holds.
 * The gun in hand (handControl: MAN and the selected weapon, owner 2026-11-19) slews toward the reticle (input.turretAim)
 * at its MAN traverse, and holds with no reticle. Every other powered gun is AUTO-driven, in MAN too: it slews toward its
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

(Task 6 captures the return value.) Add to `applyWeaponsInput`'s doc comment: "W-4: the turrets slew after the burst, before the gun."

- [ ] **Step 7: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Turret.test.ts tests/w4Autocannon.test.ts tests/w4PewFire.test.ts tests/w4Manual.test.ts tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/duelScripted.test.ts tests/duelGates.test.ts`
Expected: tsc clean; all PASS except the known-red trajectory pins in `duelScripted` (the stand-in pew now flies along the AUTO-slewed pew turret, so whole runs move). `duelGates`' per-seed tests should still pass (the stand-in still fires); if one fails, record it for Task 10 and go on.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/turret.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts tests/w4Turret.test.ts
git commit -m "feat(w4b): the turrets slew: AUTO onto its lead (pewLead, gunLead) within a 182-step tolerance, the gun in hand onto the reticle, the other on AUTO; rounds fly along the turrets (W-4 spec §3.4, §4.2, §5, §6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The reticle, Z and LMB by mode, in both runtimes

**Files:**
- Modify: `src/renderer/src/app/duel/mapRequests.ts`, `app/duel/scene.ts`, `app/duel/duelMode.ts`, `app/duel/runtime.ts`, `app/duel/onlineDuel.ts`, `app/duel/input.ts`, `app/duel/weaponsSeat.ts`, `app/controlsList.ts`, `ui/duel/WeaponsStation.tsx` (the BEAM tag's press), `scripts/network/duel-app-smoke.ts` (Decision 12)
- Modify (kind (a) renames): `tests/manualLaserScene.test.ts`, `tests/manualLaserInput.test.ts`, `tests/manualLaserUi.test.tsx`, `tests/onlineDuelSession.test.ts` (each `presses.laserMode` / `press('laserMode')` / `aimLaser` / `laserAim()` / `resetLaserAim` they use; `tests/duelCheckpoint.test.ts`'s `laserMode` is the command kind, which stays)
- Modify: `tests/w4Input.test.ts`, `tests/w4Runtime.test.ts`, `tests/w4Online.test.ts` (W-4a's files)

**Interfaces:**
- Consumes: W-4a's Hound branches in `runtime.ts` `play` and `onlineDuel.ts` `play` (quoted below), `weaponsSeatHeld(sel, trigger)`, `sessionHeld(k, d, me, steer, weapons?)`, `heldChanged`, `requests.triggerHeld()` / `DuelRuntimeDeps.triggerHeld?()`, `houndWeaponsSeat`, `refusal(d, 'pew' | 'autocannon')`, `pewSent`.
- Produces: `MapRequests.reticle | reticleAim | resetReticle`; `DuelRuntimeDeps.reticleAim?()`; `KeyAction 'weaponMode'`; `weaponsSeatHeld(sel, trigger, aim = -1)`; `sessionHeld(..., weapons?: { sel; trigger; aim? })`; `gunModeSent`; the local `gunModeBase()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/w4Input.test.ts`:

```ts
describe('the reticle and Z (W-4 spec §9, W-4b)', () => {
  it('Z is the weaponMode press; the map requests keep the latest reticle until reset', () => {
    expect(PRESS_CODES.KeyZ).toBe('weaponMode');
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

In `tests/w4Runtime.test.ts` (W-4a's file, its `rig(cls?)`), extend the rig with a reticle: add `reticle: number | null = null` beside `trigger`, the dep `reticleAim: () => reticle` beside `triggerHeld`, and `const aim = (v: number | null): void => { reticle = v; };` returned with the others. Then:

**Kind (a), W-4 spec §4.3, §9** (each round starts AUTO, where LMB does nothing). In W-4a's case "LMB: pewFire with pew pew selected …", insert `r.press('weaponMode'); r.tick();` after the Space check and before the first click. In W-4a's case "the held trigger sends gunHeld only with the autocannon selected …", insert `r.press('weaponMode'); r.tick();` as its first line. Their assertions stay. In the laser-fit case, `r.press('laserMode')` becomes `r.press('weaponMode')` (the renamed press).

Append:

```ts
describe("the Hound's Weapons seat in W-4b (W-4 spec §4.1, §4.3, §9)", () => {
  it("Z queues gunMode {manual: true}, a second Z {manual: false}; the laser fit's Weapons seat still queues laserMode", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('weaponMode'); r.tick(); expect([sys.gunsManual, r.statuses()]).toEqual([true, ['applied']]);
      r.press('weaponMode'); r.tick(); expect(sys.gunsManual).toBe(false);
    } finally { r.rt.dispose(); }
    const f = rig(ShipClass.ValkyrnLaser);
    try { f.press('weaponMode'); f.tick(); expect(f.d.tactical.systems[0].laserManual).toBe(true); } finally { f.rt.dispose(); }
  });
  it('in AUTO a left click with pew pew selected queues nothing and refuses nothing; in MAN it queues pewFire {}', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.rt.takeRefusals();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses(), r.rt.takeRefusals()]).toEqual([0, [], []]);
      r.press('weaponMode'); r.tick();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses()]).toEqual([1, ['applied']]);
    } finally { r.rt.dispose(); }
  });
  it('in AUTO the held trigger puts no gunHeld and refuses nothing; in MAN it puts gunHeld and a dead trigger refuses NO POWER', () => {
    const r = rig();
    try {
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

In `tests/onlineDuelSession.test.ts`, add `reticle(aim: number): void;` to both `requests` type literals (L56, L70; the rename below turns their `aimLaser` into `reticle`, so it is that entry). **Kind (a), W-4 spec §4.3:** W-4a's "the online Hound Weapons seat" cases (1) and (2) start with `r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();` (MAN), and their assertions stay. Then add, in the same block, with `const r = rig(1), c = r.attach(); r.session.frame();` and the same key idiom:

```ts
  it('Z sends gunMode {manual: true}; a second Z before the result sends {manual: false} (from gunModeSent)', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const z = (): void => { r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump(); };
    z(); z();
    expect(c.commands().filter((x) => x.kind === 'gunMode')).toEqual([{ kind: 'gunMode', manual: true }, { kind: 'gunMode', manual: false }]);
    r.dispose();
  });
  it('in AUTO a left click with pew pew selected sends nothing; after Z it sends pewFire {}', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();
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

The pump sends a held frame every pump whether or not it changed (`client.held` each pump; `heldChanged` only stamps the change for the latency report), so a rising `c.helds()` count proves nothing. The "a reticle change alone is a held change" rule is `heldChanged`'s, tested as a unit in `tests/w4Online.test.ts` (below).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts`
Expected: FAIL (`KeyZ` is `laserMode`; no `reticle`; `weaponsSeatHeld` has no third argument).

- [ ] **Step 3: The reticle requests**

`app/duel/mapRequests.ts`: rename `aimLaser(aim)` → `reticle(aim)`, `laserAim()` → `reticleAim()`, `resetLaserAim()` → `resetReticle()` (the interface, the docs and `createMapRequests`; the closure variable `laserAim` → `reticleAim`), and update the docs: "W-2, W-4 spec §9: the reticle: the pointer's latest fine bearing on the open Weapons map (the laser fit's MANUAL laser fires along it; the Hound's MAN gun turret follows it), kept until a new round."

`app/duel/scene.ts`:
- `options.requests?.resetLaserAim();` → `options.requests?.resetReticle();`;
- in the `laserPointer` gate, replace `classOf(d.tactical, CREW_SLOT).slots.laser !== null` with `(classOf(d.tactical, CREW_SLOT).slots.laser !== null || hasTurret(classOf(d.tactical, CREW_SLOT)))`, rename `laserPointer` → `reticlePointer`, and `options.requests?.aimLaser(...)` → `options.requests?.reticle(...)`; update the comment ("W-2, W-4 spec §9: the reticle follows the pointer on the open Weapons map, for the laser fit's MANUAL laser and the Hound's turrets");
- in the combat input, `laserAim: ... options.requests?.laserAim() ?? null ...` → `options.requests?.reticleAim() ?? null` (the field name `laserAim` on `CombatModelInput` stays: it is the laser line's).

`app/duel/duelMode.ts`: `laserAim: () => requests.laserAim()` → `reticleAim: () => requests.reticleAim()`.

`app/duel/runtime.ts`: `DuelRuntimeDeps.laserAim?(): number | null;` → `reticleAim?(): number | null;` (doc: "W-2, W-4: the reticle (mapRequests reticleAim)"), and `deps.laserAim?.()` → `deps.reticleAim?.()`.

`app/duel/onlineDuel.ts`: `const laserAimNow = (): number | null => requests.laserAim();` → `const reticleNow = (): number | null => requests.reticleAim();   // W-2, W-4: the reticle (kept, not drained)`, and its use `laserAimNow()` → `reticleNow()`. **Inside `pump` and `play` the name `requests` is the ContactRequests**; read the map requests only through closures declared beside `reticleNow` (`takeSteer0` is the precedent). W-4a declares `const triggerNow = (): boolean => requests.triggerHeld();` there (W-4a Task 11 Step 3.7) and uses it in `play` and `pump`.

Rename the uses in `tests/manualLaserScene.test.ts` and the `onlineDuelSession.test.ts` fakes (`aimLaser` → `reticle`, `laserAim()` → `reticleAim()`, `resetLaserAim()` → `resetReticle()`), kind (a), citing W-4 spec §9.

- [ ] **Step 4: Z is `weaponMode`**

`app/duel/input.ts`: in `KeyAction`, `'laserMode'` → `'weaponMode'`; `PRESS_CODES.KeyZ: 'weaponMode'`; `emptyPresses`'s `laserMode: 0` → `weaponMode: 0`; the doc: "W-2, W-4 spec §9: Z toggles AUTO / MAN at Weapons: both guns on the Hound (gunMode), the laser on the laser fit (laserMode)".

`ui/duel/WeaponsStation.tsx`: the BEAM tag's `actions.console.press('laserMode')` → `press('weaponMode')`.

`app/controlsList.ts`: in `DUEL_ACTION`, replace the `laserMode` entry with `weaponMode: 'At Weapons, switch both guns between AUTO (they aim and fire by themselves) and MAN (the reticle aims, the left button fires); with the laser fit, the laser\'s AUTO / MANUAL'`; and add after W-4a's rows: `{ keys: 'Mouse', action: "At Weapons, the reticle: the selected gun's turret follows it, inside its arc (MAN)" }`.

In the laser class's Weapons branch of `runtime.ts` and `onlineDuel.ts`, `p.laserMode` → `p.weaponMode` (the code is otherwise unchanged).

Rename `presses.laserMode` / `press('laserMode')` / `laserMode:` (the press field) in `tests/manualLaserInput.test.ts`, `tests/manualLaserUi.test.tsx`, `tests/onlineDuelSession.test.ts` and any other test tsc names (kind (a); the `laserMode` **command** kind is unchanged, so `tests/duelCheckpoint.test.ts`, whose only `laserMode` is a command in its codec examples, and the commands in `tests/manualLaserCommands.test.ts`, `tests/ftlTargeting.test.ts` and `tests/rockLock.test.ts` stay as they are).

- [ ] **Step 5: The seat's held fields**

`app/duel/weaponsSeat.ts`: replace W-4a's `weaponsSeatHeld` with

```ts
/** The seat's held fields: the selection, the reticle as turretAim (an integer 0..65535, else none) and the trigger as
 *  gunHeld only while the autocannon is selected (W-4b: callers pass `trigger && manual`, so AUTO sends none). */
export function weaponsSeatHeld(sel: number, trigger: boolean, aim = -1): Pick<HeldInput, 'weaponSel' | 'gunHeld' | 'turretAim'> {
  return { weaponSel: sel, ...(Number.isInteger(aim) && aim >= 0 && aim < 65536 ? { turretAim: aim } : {}), ...(trigger && sel === WeaponSlot.Autocannon ? { gunHeld: true } : {}) };
}
```

- [ ] **Step 6: Single player's Hound branch (Decision 7)**

In `app/duel/runtime.ts`:

1. After `torpModeBase`, add:

```ts
  /** W-4 spec §4.1: the active player's latest queued gunMode, else the sim's (as laserModeBase). */
  const gunModeBase = (): boolean => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'gunMode')?.command; return c && c.kind === 'gunMode' ? c.manual : d.tactical.systems[0].gunsManual; };
```

2. In W-4a's Hound branch, after the `torpMode` toggle line (`if (p.torpMode % 2 === 1) { torpManual = !torpManual; queue({ kind: 'torpMode', manual: torpManual }); }`), add:

```ts
      let gunsManual = gunModeBase();   // W-4 spec §4.1, §9: Z or a gun tag toggles both guns AUTO / MAN (odd presses toggle)
      if (p.weaponMode % 2 === 1) { gunsManual = !gunsManual; queue({ kind: 'gunMode', manual: gunsManual }); }
```

3. Replace W-4a's `if (pew !== null && weaponSel === WeaponSlot.Pew) {` with `if (pew !== null && weaponSel === WeaponSlot.Pew && gunsManual) {   // W-4 spec §4.3: in AUTO the click does nothing`, and W-4a's `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon) {` with `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunsManual) {`.
4. Change W-4a's closing comment `// Space and Z do nothing here in W-4a (Z's gunMode is W-4b's)` to `// Space does nothing here`.
5. In `frame`, replace W-4a's `weaponsSeatHeld(weaponSel, deps.triggerHeld?.() ?? false)` with `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(), deps.reticleAim?.() ?? -1)`.

- [ ] **Step 7: The online Hound branch**

In `app/duel/onlineDuel.ts`:

1. Beside `laserModeSent`, declare:

```ts
  // W-4 spec §4.1, §11: both guns' mode this seat last asked for, until its result comes back (as laserModeSent).
  let gunModeSent: { manual: boolean; sequence: number; round: number } | null = null;
```

2. In `observe`'s result loop, beside the `laserModeSent` clear, add `if (gunModeSent && result.id.player === descriptor.seatId && result.id.sequence === gunModeSent.sequence) gunModeSent = null;   // W-4: the replica is the base again`.
3. Everywhere `torpModeSent = null` is reset (the sit, the stand, the attach), also set `gunModeSent = null;`. In `pump`, after the `torpModeSent` round check add `if (gunModeSent && d && d.round !== gunModeSent.round) gunModeSent = null;   // W-4: every round starts AUTO`.
4. In W-4a's online Hound branch, after its `torpMode` toggle, add:

```ts
      let gunsManual = gunModeSent ? gunModeSent.manual : sys0.gunsManual;   // W-4 spec §4.1: from the mode in flight, else the replica's
      if (p.weaponMode % 2 === 1) { gunsManual = !gunsManual; const id = send({ kind: 'gunMode', manual: gunsManual }); if (id) gunModeSent = { manual: gunsManual, sequence: id.sequence, round: d.round }; }
```

and gate its pew click and dead-trigger refusal on `gunsManual` exactly as Step 6.3 does.
5. `sessionHeld`: change the `weapons` parameter's type to `{ sel: number; trigger: boolean; aim?: number }` and its spread to `weaponsSeatHeld(weapons.sel, weapons.trigger, weapons.aim ?? -1)`; extend its doc ("and the reticle as turretAim").
6. In `pump`, replace W-4a's `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() })` with

```ts
sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent ? gunModeSent.manual : d.tactical.systems[0].gunsManual), aim: reticleNow() ?? -1 })
```

7. `heldChanged`: add `|| a.turretAim !== b.turretAim` (comment "W-4b").

- [ ] **Step 8: The smoke presses Z first (Decision 12)**

In `scripts/network/duel-app-smoke.ts`, in W-4a's step 5, immediately before `const before = [latest(await status(h)), latest(await status(g))];` add:

```ts
    await press(h, 'Z'); await delay(500);   // W-4 spec §4.3 (W-4b): both guns to MAN, so no AUTO round can fire in the quiet check
```

and add "(both guns in MAN)" to the step's comment.

- [ ] **Step 9: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/onlineDuelSession.test.ts tests/manualLaserScene.test.ts tests/manualLaserInput.test.ts tests/manualLaserUi.test.tsx tests/duelCheckpoint.test.ts tests/duelRuntime.test.ts tests/settingsAndControls.test.ts tests/scienceInput.test.ts`
Expected: tsc clean; all PASS (a `duelCheckpoint` whole-run pin may stay known-red). Then `npm run test:duel-app-runtime`: the smoke passes.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/controlsList.ts src/renderer/src/ui/duel/WeaponsStation.tsx scripts/network/duel-app-smoke.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/onlineDuelSession.test.ts <each renamed test>
git commit -m "feat(w4b): the reticle drives turretAim, Z toggles both guns (gunMode), LMB fires only in MAN, local and online (W-4 spec §4.1, §4.3, §9, §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: AUTO fires: the pew on each third, the autocannon to 80 % heat, nothing in the hold; the scripted gunner on AUTO

**Files:**
- Modify: `src/renderer/src/sim/tactical/gun.ts` (`tickGun`), `sim/tactical/pew.ts` (`pewAutoReady`), `sim/tactical/weapons.ts` (`applyWeaponsInput`), `sim/tactical/tuning.ts` (`AUTOCANNON_ARC_COS`), `sim/duel/step.ts` (`pewFire`'s AUTO refusal), `sim/duel/scripted.ts` (`houndGunner`, `helmAxes`' line-up)
- Create: `tests/w4Auto.test.ts`
- Modify: `tests/w4Manual.test.ts`, `tests/duelScripted.test.ts` (kind (a): W-4a's stand-in tests and the Helm line-up's geometry), `tests/w4PewFire.test.ts`, `tests/w4Autocannon.test.ts`, `tests/w4Turret.test.ts` (kind (a): AUTO ignores the held trigger, Step 4)

**Interfaces:**
- Consumes: `slewTurrets` → `AutoOnSolution` (Task 4), `handControl` (Task 3), `enemyHostile(t)` (science.ts L29), `GUN_AUTO_HEAT_STOP`, `AUTOCANNON_AUTO_RANGE` (tuning.ts), Task 3's `tickGun` lines (quoted in Step 3), W-4a's `houndGunner` and `helmAxes` line-up (quoted in Step 5), W-4a's `pewFire` admission block (quoted in Step 4).
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
    const man = scene([1, 1, 1], 6); man.systems[0]!.gunsManual = true;
    const pewInHand = run(man, 0);
    expect(pewInHand.gun).toBeGreaterThan(0);   // the autocannon, out of hand, fights on AUTO
    expect(pewInHand.pew).toBe(0);   // the pew in hand fires only on a pewFire (none here)
    const both = run(man, 2);
    expect([both.gun > 0, both.pew > 0]).toEqual([true, true]);   // the torpedo selected: both AUTO-driven
    const held = scene([1, 1, 1], 6, 300, true); held.systems[0]!.gunsManual = true;
    const quiet = run(held, 0);
    expect(quiet.gun + quiet.pew).toBe(0);   // AUTO's rules: nothing in the hold
  });
});
```

The turning case's start (heading index 212) puts the Hunter outside both arcs, so each gun must meet it on the sweep and then trail it. A turret-and-bearing model of this geometry (the solution as the bearing's whole index, the slew law as written) gave the autocannon no on-solution tick under an exact-only rule and two ticks within the tolerance. If the real lead's muzzle offset moves those ticks, keep the start and the assertions, and report the counts.

Append to `tests/w4Manual.test.ts`:

```ts
describe('pewFire in AUTO and MAN (W-4 spec §6)', () => {
  it('is unavailable in AUTO; a same-tick gunMode MAN first makes it apply; a second in the tick is a noop', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    try {
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 2), env(d, g, { kind: 'gunMode', manual: true }, 3), env(d, g, { kind: 'pewFire' }, 4)] });
      expect(r.map((x) => [x.id.sequence, x.status])).toEqual(expect.arrayContaining([[3, 'applied'], [2, 'applied'], [4, 'noop']]));
    } finally { disposeDuel(d); }
  });
  it('gunHeld fires the autocannon in MAN only with it selected; in AUTO a held trigger fires nothing', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      s.bars[1] = 3; s.weaponPower = [1, 1, 1];
      Object.assign(d.tactical.ships[1], { x: 5000, y: 5000 });   // far off: AUTO has no solution
      const held = (weaponSel: number) => { const h = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]; h[g] = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true, weaponSel } as never; return h; };
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(1), commands: [] });
      expect(s.gunShots).toBe(0);   // AUTO ignores the trigger
      s.gunsManual = true;
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

In `sim/tactical/gun.ts`, add `GUN_AUTO_HEAT_STOP` to the tuning import, change the signature to `export function tickGun(state: TacticalState, i: number, input: ShipInput, auto = false): void {`, and replace W-4a's trigger line and Task 3's three lines

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
  const hand = handControl(state, i, input.weaponSel, WeaponSlot.Autocannon);   // W-4 spec §3.4: in hand (MAN and selected), else AUTO-driven
  if (gunInterval(state, i, hand) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  // W-4 spec §4.3, §5: in hand it fires on the held trigger (the step sets it only with the autocannon selected); AUTO-driven
  // (AUTO, or MAN with the pew in hand: owner 2026-11-19) it fires on solution once hostile (`auto`, applyWeaponsInput) while
  // below the 80 % heat stop, so it never locks; no hysteresis. A held trigger does nothing to an AUTO-driven gun.
  if (hand ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g, hand);
```

and extend its doc comment: "W-4 spec §4.3: a turret gun in hand fires on the trigger, an AUTO-driven one on `auto` (on solution and hostile) below GUN_AUTO_HEAT_STOP." For the Valkyrn the checks and their order are equivalent to master's single condition (each is a pure read before the one `fireRound`, which with `manual` false sets `intervalTicks`).

- [ ] **Step 4: `applyWeaponsInput` and the step**

`sim/tactical/weapons.ts`: import `enemyHostile` from `./science` (beside `shipSeen`). Replace Task 4's

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
      if (!sys0.gunsManual) { result(e, 'unavailable'); continue; }   // W-4b: AUTO fires the pew itself
      if (crew.pewTrigger) { result(e, undefined, 'noop'); continue; }
```

Kind (a) rewrites, each citing W-4 spec §4.3 (from this task on, a turret gun in AUTO ignores `gunHeld`, and every round starts AUTO):
- `tests/w4PewFire.test.ts` (W-4a): its admission test sets MAN first (`d.tactical.systems[0].gunsManual = true` after creating the duel). Its case "on the Hound gunHeld fires the autocannon only with weaponSel 1" also sets `gunsManual = true` on the Hound duel before stepping.
- `tests/w4Autocannon.test.ts` (W-4a): the `gaps()` helper calls `tickGun(st, 0, IDLE_INPUT, true)` instead of `tickGun(st, 0, TRIGGER)`, which fixes the interval-by-bars case. The direct `TRIGGER` calls in the rounds-along-the-aim, cooldown, six-hits-a-level and 0-bar cases change the same way (W-4a plan's w4Autocannon at its L584, L604, L609, L616, L619 and L628). That is AUTO on solution with the AUTO rows, so W-4a's 10 / 8 / 6 / 5 assertions stand. The heat-and-lock case sets `s.gunsManual = true` and fires with `{ ...TRIGGER, weaponSel: 1 }` (the autocannon in hand, Decision 14: `TRIGGER` alone has `weaponSel` −1, which leaves the gun AUTO-driven and never locking), because only the gun in hand can lock. It asserts heat, lock and cooling only, so it needs no re-pin.
- `tests/w4Turret.test.ts` (Task 4's "a pew round and an autocannon round leave along them"): `tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true })` becomes `tickGun(st, 0, IDLE_INPUT, true)`.

- [ ] **Step 5: The scripted gunner on AUTO (spec §12)**

In `sim/duel/scripted.ts` `houndGunner`, delete the stand-in pew block:

```ts
  const s = t.ships[0], e = t.ships[target]!;
  if (e.active && pewReady(t, 0) && weaponBars(sys, WeaponSlot.Pew) > 0 && t.tick - pair.lastPew >= SCRIPTED_PEW_GAP) {
    const dx = e.x - s.x, dy = e.y - s.y;
    if (dx * dx + dy * dy <= PEW_RANGE * PEW_RANGE && inArc(s.heading, dx, dy, PEW_ARC_COS)) { out.push({ kind: 'pewFire' }); pair.lastPew = t.tick; }
  }
```

and rewrite its doc comment: "W-4 spec §12: the gunner on a turret class (the Hound). Its first seated tick spends the spare bar on the autocannon (pre-checked, so both commands are admitted) and does nothing else that tick. The guns stay AUTO (no gunMode, no held aim, no pewFire): they track and, once the enemy is hostile, fire by themselves (applyWeaponsInput). Its torpedo rule (a torpLock while the target is seen, canLaunch and the gap) launches the AUTO torpedo, which also ends the 30 s hold if the clock has not. No laser command." Remove imports that are now unused (tsc names them; `gunnerPew` on other classes still uses some, and the Helm's line-up below uses `inArc` and `shipSeen`).

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

(the `return { turn: autoFaceTurn(t, 0), … }` line under it stays), add `AUTOCANNON_ARC_COS, AUTOCANNON_AUTO_RANGE` to scripted.ts's tuning import, and change its comment's "(the stand-in pew's cone; W-4b: …)" to "(W-4b: inside the autocannon's ±30° both AUTO guns bear, so outside it, within its 600 u, the Helm turns the nose on)". Task 10 adds `HOUND_HELM_LINEUP` to this condition.

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
  it('over whole duels it sends no pewFire, no gunMode and no laser command; its AUTO guns fire nothing before the hostile event, whose cause is its torpedo or the clock', () => {
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

Then: `npx vitest run tests/duelGates.test.ts` and `npx tsx scripts/duel-telemetry.ts`. Record in the report under `## W-4b` the per-seed lines (pew rounds, gun rounds, launches, hold end rt and cause) and the summary. A failing per-seed test is the known-red window until Task 10.

- [ ] **Step 7: Classify the fallout**

Run: `npx electron-vite build` then `npx vitest run --maxWorkers=4 2>&1 | tail -80`
Expected: only the known-red window. Any other red test: apply the fallout rule (a test that expects the Hound's pew to fire in AUTO on `pewFire`, or the old held trigger in AUTO, is kind (a)); list each in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/w4Turret.test.ts tests/duelScripted.test.ts docs/superpowers/research/2026-11-19-w4-report.md <each kind (a) test fixed in Step 7>
git commit -m "feat(w4b): AUTO fires at a seen, hostile ship on solution (the pew per third, the autocannon to 80 % heat), holds fire in the hold, and keeps the gun out of hand firing in MAN; pewFire is MAN only; the scripted gunner leaves the guns on AUTO and the Helm lines up the autocannon (W-4 spec §3.4, §4.3, §6, §12)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The online prediction of the own selected turret (spec §11)

**Files:**
- Modify: `src/renderer/src/app/duel/weaponsSeat.ts` (`predictTurret`), `app/duel/onlineSource.ts` (`turret`, `gunModeBase`), `app/duel/onlineDuel.ts` (feed `gunModeBase`), `app/duel/runtime.ts` (`turret`), `app/duel/scene.ts` (`DuelViewSource.turret?`)
- Modify: `tests/w4Online.test.ts`

**Interfaces:**
- Consumes: `slewTurret` (turret.ts), `weaponBars`, `WeaponSlot`, `houndWeaponsSeat`, the source's `sentHeld` and `unackedFrames`, `gunModeSent` (Task 5).
- Produces: `predictTurret(t: TacticalState, slot: 0 | 1, held: Pick<HeldInput, 'weaponSel' | 'turretAim'>, manual: boolean, k: number): number`; `DuelViewSource.turret?(slot: 0 | 1): number`; the online source's `turret(slot)` and `gunModeBase(manual: boolean | null)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/w4Online.test.ts` (imports: `predictTurret` from `../src/renderer/src/app/duel/weaponsSeat`, `stepDuelTick` from `../src/renderer/src/sim/duel/step`):

```ts
describe('the predicted own turret (W-4 spec §11)', () => {
  /** A seated Hound duel in MAN with the Hunter far off (no AUTO), and the gunner's held frame with the selection and reticle. */
  function rig(sel: number, aim: number) {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    d.tactical.systems[0].gunsManual = true;
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
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump(); r.pump(); r.session.frame();
    const p = src().turret(0);
    expect(p > 0 && p <= 2000 && (p % 455 === 0 || p === 2000)).toBe(true);   // k unacknowledged frames of MAN's 455 a frame toward +2000
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('gunMode')]!;
    c.results.push({ id, tick: 3, status: 'applied' }); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // gunModeSent cleared: the replica's mode (AUTO) is the base again
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
 *  turret as it is unless the mode is MAN, `slot` is the sent selection, the gun has a turret and a bar, a reticle was sent
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
- state: beside `shownThrottle`, `let gunModeShown: boolean | null = null;`;
- the source's type: add `turret(slot: 0 | 1): number; gunModeBase(manual: boolean | null): void;`;
- in the object, after W-4a's `weaponSel: ...`:

```ts
    /** W-4 spec §11: gun slot's turret: at the Hound's Weapons seat the own selected one predicted over the unacknowledged
     *  frames (predictTurret, the mode in flight first), else the replica's. */
    turret: (slot: 0 | 1): number => {
      const d = duel();
      if (!houndWeaponsSeat(d, seat)) return slot === 0 ? d.tactical.systems[0].pewTurret : d.tactical.systems[0].gunTurret;
      return predictTurret(d.tactical, slot, sentHeld, gunModeShown ?? d.tactical.systems[0].gunsManual, unackedFrames);
    },
    /** The guns' mode in flight (onlineDuel's gunModeSent), or null: the replica's is the base. */
    gunModeBase(manual) { gunModeShown = manual; },
```

`app/duel/onlineDuel.ts`: at both places that call `source?.throttleBase(throttleSent ? throttleSent.level : null);` add `source?.gunModeBase(gunModeSent ? gunModeSent.manual : null);   // W-4 spec §11`.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Online.test.ts tests/onlineDuelSession.test.ts tests/onlineDuel.test.ts tests/valkyrnOnline.test.ts tests/w4Runtime.test.ts`
Expected: tsc clean; all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts tests/w4Online.test.ts
git commit -m "feat(w4b): the online seat predicts its own selected turret over the unacknowledged frames, as the throttle (W-4 spec §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The map: the selected arc, the muzzle lines, the reticle and the AUTO bracket

**Files:**
- Modify: `src/renderer/src/render/tactical/weaponsModel.ts` (`CombatModelInput`, `CombatDraw`, `combatModel`), `render/tactical/tacticalLayer.ts` (the draw), `app/duel/scene.ts` (the inputs)
- Create: `tests/w4Map.test.ts`

**Interfaces:**
- Consumes: `combatModel(input)` locals `own` (the interpolated own ship, `h` its fractional heading), `ownS`, `cls`, `z`, `enemyS`, `enemyShown`; `headingAngle(h)`, `drawnScale(z)` (tacticalModel.ts); `hasTurret`, `autoSolution`, `onSolution`, `slewTurret`, `turretWorldAim`, `handControl`, `enemyHostile`, `weaponBars`, `WeaponSlot`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, `AIM_STEPS`, `SHIP_RADIUS`; `DuelViewSource.turret?` / `weaponSel?`; the scene's `reticlePointer` (Task 5).
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
    st.hostileAt = 0; s.gunsManual = true;
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

where `reticleOnMap` is the `onWeaponsMap(...)` result Task 5's `reticlePointer` block already computes (hoist it into a `const reticleOnMap = reticlePointer !== null && onWeaponsMap(reticlePointer, ...)` used by both).

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Map.test.ts tests/pewViews.test.ts tests/manualLaserViews.test.ts tests/duelWeaponsView.test.ts tests/feelPresentation.test.ts`
Expected: tsc clean; all PASS. W-1's `pewViews` cases that pin the cone and aim line on the Cutter are kind (a) (W-4 spec §10: the arc and muzzle lines replace them on the Hound): rewrite each for the Hound's arc, or keep it on a class with a turretless pew if one is constructed in the test; list them in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/app/duel/scene.ts tests/w4Map.test.ts <each kind (a) view test>
git commit -m "feat(w4b): the Weapons map draws the selected arc, both muzzle lines, the reticle and AUTO's bracket; the Helm and Science maps the muzzle lines (W-4 spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The shared AUTO / MAN / HOLD tag and the hint row

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts` (`WeaponsPanel`), `ui/duel/WeaponsStation.tsx` (W-4a's `HoundWeapons`)
- Modify: `tests/w4Ui.test.tsx`

**Interfaces:**
- Consumes: W-4a's `WeaponsPanel.autocannon` / `selected` and its `weaponsPanel()` spread (quoted in Step 3), `HoundWeapons`, `HOUND_PEW_PIPS_X`, `weaponCard('autocannon')`, `Button` (`ui/stage/Button.tsx`), `textPx` (`render/theme.ts`), `enemyHostile`, `handControl` (Task 3).
- Produces: `WeaponsPanel.gunsManual?: boolean`, `gunsHand?: number` (the gun slot in hand, −1 none), `gunsHold?: boolean`; Buttons `gun-mode-pew`, `gun-mode-autocannon` (testids `console-gun-mode-pew`, `console-gun-mode-autocannon`, following `Button`'s `console-${name}` rule as W-3's `console-torp-mode`).

- [ ] **Step 1: Write the failing test**

Append to `tests/w4Ui.test.tsx` (W-4a's rig: `mount()`, `texts()`, `q()`, `view()`, `weapons(over)`, `AC`, `input()`, and its `STATION` / `textPx` imports). The panel fields `gunsManual`, `gunsHand` and `gunsHold` are set directly in the view, and `Button`'s `lit` state is `dataset.uiButton === 'lit'`, as the `console-torp-mode` test reads it:

```tsx
/** An element's rectangle from its inline style (jsdom does no layout), as tests/engineeringWeaponsUi.test.tsx reads it. */
const rect = (e: HTMLElement): [number, number, number, number] => { const l = parseFloat(e.style.left), t = parseFloat(e.style.top); return [l, t, l + parseFloat(e.style.width), t + parseFloat(e.style.height)]; };
const overlap = (a: [number, number, number, number], b: [number, number, number, number]): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('the shared AUTO / MAN / HOLD tag (W-4 spec §4.3, §10)', () => {
  const tags = () => ['pew', 'autocannon'].map((w) => q(`[data-testid="console-gun-mode-${w}"]`)!);
  const words = (): string[] => texts().filter((t) => t === 'AUTO' || t === 'HOLD' || t === 'MAN');
  it('AUTO: both read AUTO once hostile and HOLD in the hold, unlit; MAN: both lit, the gun in hand reads MAN and the other AUTO (or HOLD); the torpedo selected, both AUTO-driven', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: false, gunsHand: -1, gunsHold: false }))));
    expect(tags().map((t) => t.dataset.uiButton === 'lit')).toEqual([false, false]);
    expect(words()).toEqual(['AUTO', 'AUTO']);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: false, gunsHand: -1, gunsHold: true }))));
    expect(words()).toEqual(['HOLD', 'HOLD']);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: true, gunsHand: 0, gunsHold: false }))));
    expect(tags().map((t) => t.dataset.uiButton === 'lit')).toEqual([true, true]);
    expect(words().sort()).toEqual(['AUTO', 'MAN']);   // owner 2026-11-19: the autocannon, out of hand, fights on AUTO
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 2, gunsManual: true, gunsHand: -1, gunsHold: true }))));
    expect(tags().map((t) => t.dataset.uiButton === 'lit')).toEqual([true, true]);
    expect(words()).toEqual(['HOLD', 'HOLD']);
  });
  it('the tags clear the PEW PEW label, the charge pips, the bar pips, the AUTOCANNON title and each other (8 px from the text)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: false, gunsHand: -1, gunsHold: false, weaponBars: [1, 1, 1], weaponFree: 0 }))));
    const [pew, gun] = tags().map(rect), x0 = STATION.x + 8;
    expect(pew[0]).toBeGreaterThanOrEqual(x0 + textPx('PEW PEW', 1) + 8);
    expect(pew[2] + 8).toBeLessThanOrEqual(x0 + HOUND_PEW_PIPS_X);
    expect(gun[0]).toBeGreaterThanOrEqual(STATION.x + 8 + 6 + textPx('AUTOCANNON', 1) + 8);   // the card's text x (lx) plus the title
    const others = [...document.querySelectorAll<HTMLElement>('[data-ui-pew-pip], [data-ui-weapon-pip]')].map(rect);
    expect(others.length).toBeGreaterThan(0);
    for (const o of others) for (const t of [pew, gun]) expect(overlap(t, o), `${t} vs ${o}`).toBe(false);
    expect(overlap(pew, gun)).toBe(false);
  });
  it('a click on either tag presses weaponMode', () => {
    const { ui, duel } = mount(), i = input();
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: false, gunsHold: false }))));
    fireEvent.pointerDown(tags()[0]!, { button: 0 }); fireEvent.pointerDown(tags()[1]!, { button: 0 });
    expect(i.press).toHaveBeenCalledTimes(2);
    expect(i.press).toHaveBeenCalledWith('weaponMode');
  });
  it('the hint rows: LMB FIRE · A/D SELECT · W/S POWER, then Z AUTO/MAN · RIGHT-CLICK TORPEDO: CLEAR, each clear of FREE / ROCKS by 8 px', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, gunsManual: false, gunsHold: false }))));
    expect(texts()).toContain('LMB FIRE · A/D SELECT · W/S POWER');
    expect(texts()).toContain('Z AUTO/MAN · RIGHT-CLICK TORPEDO: CLEAR');
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    expect(x0 + textPx('LMB FIRE · A/D SELECT · W/S POWER', 1) + 8).toBeLessThanOrEqual(right - textPx(freeText(9), 1));
    expect(x0 + textPx('Z AUTO/MAN · RIGHT-CLICK TORPEDO: CLEAR', 1) + 8).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
  });
  it("the laser fit's BEAM tag presses weaponMode too", () => {
    const { ui, duel } = mount(), i = input();
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, laserManual: false }))));
    fireEvent.pointerDown(q('[data-testid="console-laser-mode"]')!, { button: 0 });
    expect(i.press).toHaveBeenCalledWith('weaponMode');
  });
});
```

The `console-laser-mode` button shows only when the panel carries `laserManual` (`WeaponsStation.tsx` L121-L122), which the last case sets.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Ui.test.tsx`
Expected: FAIL (no gun tags).

- [ ] **Step 3: The model**

In `render/duel/consoleModel.ts`, in `WeaponsPanel` after W-4a's `autocannon?` / `selected?`, add:

```ts
  /** W-4 spec §10 (W-4b): both guns' mode (the shared switch, both tags lit in MAN); the gun slot in the gunner's hands (0
   *  or 1, −1 none: handControl, owner 2026-11-19), whose tag reads MAN while the other's reads AUTO; and whether the 30 s
   *  hold keeps the AUTO-driven guns quiet (their tags then read HOLD instead of AUTO). */
  gunsManual?: boolean; gunsHand?: number; gunsHold?: boolean;
```

and in W-4a's `weaponsPanel()` spread (the `...(hasTurret(classOf(t, 0)) && classOf(t, 0).slots.gun ? { autocannon: { ... }, selected: i.weaponSel ?? 0 } : {})` entry), add after `selected: i.weaponSel ?? 0` the fields `gunsManual: sys.gunsManual, gunsHand: [0, 1].find((g) => handControl(t, 0, i.weaponSel ?? 0, g)) ?? -1, gunsHold: !enemyHostile(t)` (import `enemyHostile` from `../../sim/tactical/science` and `handControl` from `../../sim/tactical/state`). W-4c's flight rule reaches the tag through `handControl` with no change here. W-4a's AUTOCANNON `rate` (`autocannonRateText(gunInterval(t, 0))`) becomes `autocannonRateText(gunInterval(t, 0, handControl(t, 0, i.weaponSel ?? 0, 1)))`, so the card shows the rate the gun fires at: MAN's only in hand.

- [ ] **Step 4: The station**

In `ui/duel/WeaponsStation.tsx`, add `textPx` to the `../../render/theme` import, and in W-4a's `HoundWeapons`:
- add a helper `const gunTag = (slot: 0 | 1): string => (weapons.gunsHand === slot ? 'MAN' : weapons.gunsHold ? 'HOLD' : 'AUTO');` (each tag names what its gun does, Decision 9);
- on the PEW PEW row, between its `PEW PEW` label (45 px) and the charge pips at `x0 + HOUND_PEW_PIPS_X` (W-4a): `<Button name="gun-mode-pew" label={gunTag(0)} x={x0 + textPx('PEW PEW', 1) + 8} y={top + 4} w={36} h={18} lit={weapons.gunsManual === true} onPress={() => actions.console.press('weaponMode')} />`. That spans `x0 + 53` to `x0 + 89`, 11 px short of the first charge pip, and `top + 4` to `top + 22`, above the bar pips at `top + 24`;
- in the AUTOCANNON card's header, right of its title: `<Button name="gun-mode-autocannon" label={gunTag(1)} x={lx + textPx('AUTOCANNON', 1) + 8} y={L.y + 2} w={36} h={18} lit={weapons.gunsManual === true} onPress={() => actions.console.press('weaponMode')} />` with `L = weaponCard('autocannon')` and `lx = L.x + 6`. The title is 60 px, so the tag spans `lx + 68` to `lx + 104`, inside the card and left of the `2` hint. W-2's BEAM tag sat at `lx + 66`, which the longer title would touch;
- the second hint row: W-4a's `RIGHT-CLICK TORPEDO: CLEAR` → `Z AUTO/MAN · RIGHT-CLICK TORPEDO: CLEAR` (225 px, left of `ROCKS n` with 8 px to spare). The first row stays `LMB FIRE · A/D SELECT · W/S POWER`: with Z added it would be 268 px, which runs into `FREE n` (241 px is the room);
- update the file's header comment: "W-4 spec §10 (W-4b): the two gun tags are one AUTO / MAN switch (Z), lit in MAN; each names what its gun does: MAN for the gun in hand, else AUTO, or HOLD while the hold keeps AUTO quiet."

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Ui.test.tsx tests/manualLaserUi.test.tsx tests/manualTorpedoUi.test.tsx tests/targetingUi.test.tsx tests/engineeringWeaponsUi.test.tsx tests/rockTargetUi.test.tsx`
Expected: tsc clean; all PASS (the last two are the existing "+8 clear" and overlap tests on the laser block, which W-4b does not move).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/w4Ui.test.tsx
git commit -m "feat(w4b): the shared AUTO / MAN / HOLD tag on both gun cards (MAN on the gun in hand), and Z in the second hint row (W-4 spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The tuning ladder (spec §12)

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (`AUTOCANNON_HITS_PER_HULL`), `sim/tactical/defs.ts` (`AUTOCANNON.hitsPerHull`), `sim/duel/scripted.ts` (`HOUND_MISSILE_GAP`, `HOUND_GUNNER_AUTOCANNON_BARS`, `houndGunner`)
- Modify: `tests/w4Loadout.test.ts` (W-4a's "its hit numbers are the Valkyrn's" rest-equality: `hitsPerHull` joins the excluded fields), `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: `AUTOCANNON`, `GUN_HITS_PER_HULL`, `AUTOCANNON_AUTO_RANGE`, `MISSILE_GAP`, `houndGunner` (Task 6), `runDuel`, `telemetryLine`, `gateSummary` (`tests/helpers/scriptedDuel.ts`), `scripts/duel-telemetry.ts`.
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

In `helmAxes`, add `HOUND_HELM_LINEUP && ` at the front of Task 6's line-up condition (`if (HOUND_HELM_LINEUP && hasTurret(classOf(t, 0)) && e.active && …)`).

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

Run: `npx tsc -b` then `npx vitest run tests/w4Loadout.test.ts tests/duelScripted.test.ts tests/valkyrnIdentity.test.ts` then `npx tsx scripts/duel-telemetry.ts > ../w4b-ladder-base.txt`
Expected: tsc clean; PASS (bar the known-red pins); the telemetry equals Task 6's (the knobs hold their base values).

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
- rung 4: Task 6's "its first seated tick sends shipPower … then weaponPower Autocannon +1" reads the four commands (`shipPower`, then `weaponPower` Pew −1, then Autocannon +1 twice), and the resulting bars `[0, 2, 1]`.

Add the changed test files to Step 5's commit. `tests/w4Loadout.test.ts` is always in it (Step 1's `hitsPerHull` destructuring); its range pin changes only for rung 2.

- [ ] **Step 4: The report**

Under `## W-4b` in `docs/superpowers/research/2026-11-19-w4-report.md` write: the ladder table (every setting of the sweep, in order: rung 0's base row and its line-up-off reference row, then every value of rungs 1 to 4), the setting kept (or "none met the target: base numbers ship; the owner decides"), and for the kept setting the per-seed table (seed, length s, outcome, pew rounds, gun rounds, torpedo launches, hold end rt, hold cause) from `telemetryLine` and the `gateSummary` lines. The aggregate gate stays `it.skip` (kind (c)); its numbers are these.

Run: `npx tsc -b` then `npx vitest run tests/duelGates.test.ts tests/w4Loadout.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts`
Expected: the per-seed gates PASS (if no setting met the target and a per-seed test still fails, stop and report to the controller with the table: the owner decides, spec §12); the fences PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/duel/scripted.ts tests/w4Loadout.test.ts docs/superpowers/research/2026-11-19-w4-report.md <tests/duelScripted.test.ts if rung 4 is kept>
git commit -m "tune(w4b): the spec §12 ladder on the Hound-only knobs (rung 0 the Helm line-up, the whole sweep recorded); <the setting kept, or base numbers>" -m "<the ladder table, one line per setting>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The same-version bless at V (60 today), the re-picks, the full verification and the gate entry

**Files:**
- Modify (generated): `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json` (only through `npm run bless`)
- Modify: the kind (b) tests in the report's "Task 11 re-picks" list
- Modify: `docs/gates.md`, `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the W-4b branch state W-4c starts from.

- [ ] **Step 1: The fences, unchanged**

Run: `git diff --stat W4_BASE -- tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts` then `git log --oneline W4_BASE..HEAD -- tests/w4HunterIdentity.test.ts` then `git diff W4_BASE -- tests/valkyrnIdentity.test.ts | grep "^[-+] *'" ` then `npx vitest run tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: no diff in the first three. `w4HunterIdentity` was created after `W4_BASE` (W-4a Task 1), so it is not diffed against it: the log lists exactly one commit, W-4a Task 1's, and the run passes. No changed pinned digest line in `valkyrnIdentity` (only Task 1's flatten helper). All PASS.

- [ ] **Step 2: The same-version bless**

Run: `npm run bless`
Expected: `blessed basic.json: ...; duel-1.json: ... ticks, outcome <o>, final <h>; determinism-v2.json: sim version V, ... (unchanged); duel-rematch.json: ...`. Never `--fresh`. A refusal means an artifact is missing or at another version: stop and report.

- [ ] **Step 3: The kind (b) re-picks**

For each test in the report's "Task 11 re-picks" list (and any other red whole-run pin), run it, take the new value from the failure, and set it with `// W-4b (SIM V): was <old>`. Re-pick a seed only where the test's own comment says the seed was chosen for a property, searching as that comment says.

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

Spec `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` §3, §4, §6, §8-§12, §13.1, §13.4, §19; plan `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md`.

- [x] Automated (W-4b): `npx vitest run` passes (<files> files, <tests> tests). This includes the turret state (hashed, bounded per class), the slew law (rate, arc, wrap, integers), MAN slewing only the gun in hand at 455 / 341 while the other fights on AUTO, AUTO at 364 / 273 and on solution within 182 fine steps (firing through a sustained Helm turn), AUTO's solutions (seen, range, line of sight, arc, ship only) and firing (the pew per third, the autocannon to 80 % heat and never locking, nothing in the 30 s hold), the scripted Helm lining the guns up, MAN's fire-rate tables, `gunMode` and `pewFire`'s AUTO refusal, `turretAim` in every held schema, Z and the shared tag, the map's arc, muzzle lines, reticle and bracket, the online turret prediction equal to the stepped turret, and the scripted gunner on AUTO guns (`tests/w4*.test.ts`). `npx tsc -b` is clean; SIM_VERSION V (60 today), goldens blessed at V, no bump; `tests/valkyrnIdentity.test.ts`'s digests and `tests/w4HunterIdentity.test.ts` unchanged; determinism passes on Node, Electron and Firefox. Tuning ladder: <the setting kept, or "base numbers">.
- [ ] Manual (owner): play a Single player duel at the Hound's Weapons seat.
  1. Move the mouse over the map: the reticle follows; in MAN (Z) the selected gun's muzzle line trails it and stops at the arc's edge.
  2. Press Z: both tags flip between AUTO and MAN together.
  3. In the first 30 s, on AUTO, the guns track the enemy and the tags read HOLD; nothing fires.
  4. Once hostile, on AUTO, both guns track and fire at the ship with no input; the bracket lights on the enemy.
  5. In MAN, with pew pew selected, its tag reads MAN and the autocannon's AUTO, and the autocannon keeps firing on its own while you aim the pew.
  6. MAN feels quicker to traverse and fire than AUTO.

  Screenshots for the look gate:
  1. The map in MAN, with the reticle, the selected arc and two muzzle lines.
  2. AUTO on solution with the bracket.

  Does the slewing read as "slowly follows"?
```

Fill `<files>`, `<tests>` and the ladder line from Steps 4 and Task 10.

- [ ] **Step 7: Check for zeroed files, then commit**

Run: `git status --short` and, for each modified or new file, `head -c 64 <file> | od -c | head -1` (no file may read as all `\0`).

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json docs/gates.md docs/superpowers/research/2026-11-19-w4-report.md <each re-picked test, and scripts/network/duel-app-smoke.ts if DUEL_TEST_SEED moved>
git commit -m "test(w4b): same-version bless at SIM_VERSION V for the turrets and AUTO/MAN (duel goldens re-recorded); the kind b re-picks; the W-4b gate entry" -m "<the bless line from Step 2>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage (W-4b scope):** §3.1 state → Task 1; §3.2 slew law → Task 1, wired in Task 4; §3.3 numbers → W-4a's tuning constants, exercised in Tasks 1 and 4; §3.4 when a turret slews → Task 4 (§19.1: the MANUAL-torpedo hold is W-4c's); §4.1 the mode and `gunMode` → Task 3, the keys in Task 5; §4.2 targets and solutions (ship only, `pewLead`, `gunLead`, line of sight) → Task 4; §4.3 AUTO firing, the heat stop, LMB on an AUTO gun, the hold → Task 6 (sim) and Task 5 (app); §4.4 MAN tables → Task 3; §6 `pewFire`'s AUTO refusal → Task 6; §8 `turretAim`, `gunMode`, the tick order → Tasks 2, 3, 4, 6; §9 the mouse reticle and Z → Task 5; §10 the tags and hint → Task 9, the map → Task 8; §11 online (the authority decides, held fields, prediction, `gunModeSent`) → Tasks 5 and 7; §12 AUTO gunner and the ladder → Tasks 6 and 10; §13.1 hash and bounds → Task 1 (the cooldown bound is W-4a's Task 3); §13.4 the Valkyrn identity → Task 1, the fences → every sim task; §14's turret, AUTO, MAN, online, hash and snapshot tests → Tasks 1-9; §19.1 the per-part bless and gates → Tasks 10 and 11.
- **Placeholders:** every test body, sim and app, is written in full. The app tests extend W-4a's rigs (`w4Runtime`'s `rig()`, `onlineDuelSession`'s `rig()`, `w4Ui`'s `mount()`) and `pewViews`' `input()`.
- **The owner's 2026-11-19 calls:** hand control (MAN and selected; the other gun AUTO) → Task 3 (`handControl`, the rates), Task 4 (the slew), Task 6 (`tickGun`, firing tests), Task 8 (bracket), Task 9 (tags); the AUTO tolerance → Task 4 (`AUTO_FIRE_TOLERANCE`, `onSolution`), Task 6 (the turning test), Task 8 (the bracket one slew ahead). The Helm line-up (§12) → Task 6, rung 0 in Task 10.
- **Type consistency:** `handControl`, `onSolution`, `AUTO_FIRE_TOLERANCE`, `AUTOCANNON_ARC_COS`, `HOUND_HELM_LINEUP`, `gunInterval(…, manual)`, `pewGain(…, manual)`, `tickPew(…, manual)`, `WeaponsPanel.gunsHand`, `turretOffset`, `slewTurret`, `turretWorldAim`, `autoSolution`, `AutoOnSolution`, `slewTurrets`, `gunLead`, `tickGun(…, auto)`, `heldTurretAim`, `predictTurret`, `weaponsSeatHeld(sel, trigger, aim)`, `sessionHeld(…, { sel, trigger, aim })`, `gunModeSent`, `gunModeBase`, `DuelViewSource.turret`, `MapRequests.reticle/reticleAim/resetReticle`, `DuelRuntimeDeps.reticleAim`, `KeyAction 'weaponMode'`, `CombatModelInput.turrets/weaponSel/reticle`, `CombatDraw.turretArc/muzzles/reticle/bracket` and `WeaponsPanel.gunsManual/gunsHold` are each defined once and used with the same signature in later tasks.
