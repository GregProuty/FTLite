# W-4b: the reticle, the turrets, AUTO and MAN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Hound's two guns on slewing turrets that follow a mouse reticle, give both guns one AUTO / MAN mode (Z, and the shared tag), make AUTO aim with lead and fire at a seen, hostile enemy ship in range, arc and line of sight (the pew on each charged third, the autocannon until 80 % heat; track but hold fire during the 30 s hold), give MAN +25 % traverse and about +20 % fire rate, draw the selected arc, the muzzle lines, the reticle and the AUTO bracket, predict the own seat's selected turret online, and move the scripted gunner onto AUTO guns, tuned by spec §12's ladder.

**Architecture:**

- **New hashed state.** `ShipSystems.pewTurret`, `gunTurret` (signed fine-step offsets from the nose) and `gunsManual` (one flag for both guns) are appended to the ship module's `SYSTEMS_TAIL` after `torpManual`, `gunsManual` in `FLAGS`, with per-class bounds in `validateTacticalValues`. Snapshots and clones follow from the module, as W-3's fields did.
- **One slew law.** `slewTurret(turret, heading, aim, rate, arcSteps)` in the new `sim/tactical/turret.ts` (integers, `+ −` and the integer modulo) is the only turret arithmetic. The step calls it through `slewTurrets(state, i, input)` (also in `turret.ts`), which runs in `applyWeaponsInput` right after `stepBurst` and before `tickGun`, and returns which AUTO guns are on solution. The app's prediction calls the same `slewTurret`.
- **AUTO.** `autoSolution(state, i, 'pew' | 'gun')` (turret.ts) returns the lead aim's offset from the nose (W-1's `pewLead`, the new `gunLead` in `gun.ts` with the velocity relative to the Hound), or null when the enemy is unseen, out of range, behind the planet or a rock, has no intercept, or lies outside the arc. A gun is on solution when the slew leaves it exactly on that offset. `tickGun` gains an `auto` argument (on solution and hostile); the pew's AUTO round is fired at the end of `applyWeaponsInput`, where `firePew` runs today.
- **MAN.** `gunMode {manual}` is admitted first in `WEAPON_ORDER` beside `laserMode` and `torpMode`. W-4a's seams change body only: `gunInterval` reads the MAN row, `pewGain` reads `PEW_MAN_GAIN_BY_BARS`, and `gunAimFine` / `pewAimFine` add the turrets. `pewFire {}` is refused `unavailable` in AUTO.
- **The wire.** `HeldInput.turretAim` (the reticle's world bearing, a fine aim, −1 none) rides every held schema, the authority's expiry and pause lists and `ShipInput.turretAim`.
- **The app.** `MapRequests.aimLaser` becomes `reticle` (the laser fit's MANUAL laser and the Hound's turrets share it). `KeyAction 'laserMode'` becomes `'weaponMode'`: Z sends `gunMode` on the Hound and `laserMode` on the laser fit. LMB fires a gun only in MAN. A pure `predictTurret` (in `app/duel/weaponsSeat.ts`) is the online seat's selected-turret prediction, the throttle's analogue.
- **The scripted gunner** drops W-4a's stand-in pew and leaves the guns on AUTO.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2 (+ jsdom for UI tests), React + zustand (console), zod 3 (wire), Pixi.js (map), Electron/electron-vite, the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (converged at 96c8c2dd). W-4b is §19 item 2 and §19.1's W-4b rules: §3 (all), §4 (all), §6's AUTO refusal, §8's `turretAim`, `gunMode` and the tick order, §9's mouse reticle and Z, §10's tags, the map's arc, muzzle lines, reticle and bracket, §11 (all), §12 (AUTO, no stand-in, the tuning ladder), §13.1, §13.4's Valkyrn identity change, §14's turret, AUTO, MAN, online and hash tests.

**Builds on:** the W-4a plan `docs/superpowers/plans/2026-11-19-w4a-loadout.md`, fully executed on the same branch. Every W-4a name is consumed exactly as that plan defines it (Interfaces blocks below quote them). **Shared names:** the W-4 contract (controller scratchpad `w4-contract.md`); Decisions 1, 2, 4, 6 and 11 add or move names, all inside this plan.

**Worktree:** the W-4a worktree `C:\Users\djuar\FTLite\.worktrees\w4` on branch `w4-weapons-controls`, with its four junctions (see W-4a's "Worktree setup (controller)"). The controller checks `npm run test:duel-app-runtime` passes there before Task 1. Every command runs from the worktree root.

## Global Constraints

- **Version (spec §13.3's version note, a33ad26e).** V is the SIM_VERSION on master when W-4 starts: **60 today** (the fire-venting merge 0dbe1be6), so the spec's "SIM 59" means V and its "SIM 60" means V + 1. SIM_VERSION stays **V** for all of W-4b: Task 11 re-blesses at V with a same-version `npm run bless` (a deliberate gameplay change; precedent 54d5825d, d8640a20), and W-4b makes no bump. The V → V + 1 bump is W-4c's last task. Read V once with `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts` and write the number wherever this plan says V. Never pass `--fresh`. Never hand-edit goldens.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **Exact names and values (binding):**
  - **State:** `ShipSystems.pewTurret: number`, `gunTurret: number` (signed integers within ± their class's `arcSteps`, 0 without a turret), `gunsManual: boolean` (false AUTO, true MAN; true only on the crew slot of a turret class). All 0 / false at every round's start.
  - **`sim/tactical/turret.ts`:** `turretOffset(heading, aim): number`, `slewTurret(turret, heading, aim, rate, arcSteps): number`, `turretWorldAim(heading, turret): number`, `autoSolution(state, i, gun: 'pew' | 'gun'): number | null`, `interface AutoOnSolution { pew: boolean; gun: boolean }`, `slewTurrets(state, i, input): AutoOnSolution`.
  - **`sim/tactical/gun.ts`:** `gunLead(state, i, tx, ty, tvx, tvy): number`; `tickGun(state, i, input, auto = false)`.
  - **Command:** `{ kind: 'gunMode'; manual: boolean }`; `WEAPON_ORDER = ['laserMode', 'torpMode', 'gunMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']`.
  - **Held input:** `HeldInput.turretAim?: number` (−1..65535; absent or −1 none). **Ship input:** `ShipInput.turretAim: number` (−1 in `IDLE_INPUT`, `UNCREWED_INPUT`, hunter.ts's literal and an unattended Weapons). `step.ts` `heldTurretAim(h): number`.
  - **Tuning (Task 10, the ladder's knobs, base values):** `AUTOCANNON_HITS_PER_HULL = 12` (`tuning.ts`; `AUTOCANNON.hitsPerHull` reads it, `GUN` keeps `GUN_HITS_PER_HULL`), `HOUND_MISSILE_GAP = 1500` and `HOUND_GUNNER_AUTOCANNON_BARS: 1 | 2 = 1` (`scripted.ts`; `houndGunner` reads them, the Valkyrn's `gunner` keeps `MISSILE_GAP`).
  - **App:** `MapRequests.reticle(aim)`, `reticleAim(): number | null`, `resetReticle()` (renamed from `aimLaser`, `laserAim`, `resetLaserAim`); `DuelRuntimeDeps.reticleAim?()` (renamed from `laserAim?`); `KeyAction 'weaponMode'` (renamed from `'laserMode'`, still `KeyZ`); `weaponsSeatHeld(sel, trigger, aim = -1)`; `sessionHeld(k, d, me, steer, weapons?: { sel: number; trigger: boolean; aim?: number })`; `predictTurret(t, slot, held, manual, k): number`; `DuelViewSource.turret?(slot: 0 | 1): number`; the online source's `turret(slot)` and `gunModeBase(manual: boolean | null)`; `gunModeSent` in `onlineDuel.ts`.
  - **View:** `CombatModelInput.turrets?`, `weaponSel?`, `reticle?`; `CombatDraw.turretArc`, `muzzles`, `reticle`, `bracket`; `WeaponsPanel.gunsManual?`, `gunsHold?`; Buttons `gun-mode-pew`, `gun-mode-autocannon`.
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
2. **`slewTurrets` returns the AUTO on-solution flags** (`{ pew, gun }`), and `applyWeaponsInput` passes them on: `tickGun(state, i, input, auto.gun && enemyHostile(state))` and, last, the AUTO pew round. So the hold rule (§4.3: track, no fire while `hostileAt` is −1) lives in `weapons.ts`, beside the slew, and `gun.ts` needs no science import. MAN never sets a flag.
3. **The range test is centre to centre, the line of sight muzzle to centre.** §4.2 says "its centre is within the gun's AUTO range" and "the line from the muzzle to it is clear": the range is the own ship's centre to the enemy's centre (squared, so no sqrt); the sight line runs from the gun's muzzle point (`pewMuzzle`; for the autocannon the nose point between its muzzles, `muzzleForward` along the heading) to the enemy's centre, through `geometry.ts lineOfSight` (planet and rocks).
4. **AUTO pew from a full charge.** The rule is §4.3's literal "it fires one round … whenever it is on solution and a third is stored (`pewReady`)". A pew that starts the round full (3 thirds) therefore fires its stored thirds on three consecutive on-solution ticks once hostile, then one round per charged third. "It never bursts" is read as "it has no deliberate burst rule" (the Hunter's `pewBurst`). The reviewer or the owner may ask for a gap; if so it is a one-line `SCRIPTED`-style gap in `applyWeaponsInput`, not taken here.
5. **The view draws the turret about the interpolated heading.** §10 says "`aimDir` of the interpolated turret". The turret is fixed to the hull, so the muzzle line is drawn at the interpolated nose angle plus the turret's current offset (`turret / AIM_STEPS` of a turn). The sim ticks at 60 Hz (`TICK_HZ`), so the offset needs no interpolation of its own; online, the own seat's selected turret is the predicted one (Task 7).
6. **`predictTurret` is a pure app helper,** `predictTurret(t, slot, held, manual, k)` in `app/duel/weaponsSeat.ts`, beside W-4a's seat rules. The online source's `turret(slot)` calls it with its `sentHeld`, the mode in flight (`gunModeBase`, the throttle's `throttleBase` pattern) and `unackedFrames`; Single player's `turret(slot)` returns the sim's value. This makes spec §11's agreement test a unit test against the stepped sim.
7. **LMB in AUTO does nothing.** Both runtimes send `pewFire` only in MAN and put `gunHeld` in the held frame only in MAN (`weaponsSeatHeld(sel, trigger && manual, aim)`), and the autocannon's dead-trigger refusal is shown only in MAN, so an AUTO gun gets no command and no refusal (§4.3). The mode the runtimes judge by is the latest queued / in-flight `gunMode`, else the sim's.
8. **Z is `KeyAction 'weaponMode'`.** The runtimes send `gunMode` at the Hound's Weapons seat (W-4a's branch) and `laserMode` in the laser class's branch (unchanged code, renamed press). The BEAM card's tag and both gun tags press `'weaponMode'`.
9. **The tags.** The two gun tags are one switch: both read `MAN` (lit) in MAN; in AUTO both read `HOLD` while the hold keeps AUTO quiet (`!enemyHostile(t)`) and `AUTO` once hostile. With no enemy ship the hold never ends, so `HOLD` stays; no duel has no enemy.
10. **The bracket** is drawn in AUTO on the enemy's drawn marker when either powered gun's current turret equals its `autoSolution` (the sim's own on-solution test, recomputed from the state), `hot` once hostile and `dim` in the hold. The view reads the replica's turrets for this, never the prediction.
11. **The ladder's knobs are Hound-only constants (Task 10).** `MISSILE_GAP` is also the Valkyrn pair's (`gunner` on the Valkyrn class, pinned by `tests/valkyrnIdentity.test.ts`), and `AUTOCANNON` copies `GUN`'s hit numbers. So Task 10 first adds `AUTOCANNON_HITS_PER_HULL`, `HOUND_MISSILE_GAP` and `HOUND_GUNNER_AUTOCANNON_BARS` at their base values (a no-op), then moves only those. Rung 4's 0 / 2 / 1 is the gunner sending `weaponPower {Pew, −1}` then `{Autocannon, +1}` twice after the `shipPower`, each pre-checked as §12 requires.
12. **The duel app smoke presses Z before its quiet check (Task 5).** W-4a's step 5 asserts that Space fires nothing for 2 s. From Task 6 an AUTO gun may fire on its own once hostile, so the step first sets both guns to MAN (Z), where nothing fires without the left button.
13. **The scripted gunner sends no `gunMode` and no held aim** (§12). Its `houndGunner` keeps W-4a's bar move and torpedo rule and loses the stand-in pew; its AUTO guns open the tick after its torpedo launch ends the hold, or at the 30 s clock.

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

### Task 3: `gunMode`, and MAN's fire-rate tables

**Files:**
- Modify: `src/renderer/src/net/contracts.ts`, `net/codec.ts`, `sim/tactical/hash.ts` (`shipModule.commands`), `sim/duel/step.ts` (`WEAPON_ORDER`, `DUEL_KINDS`, the admission), `app/duel/runtime.ts` (`isWeaponsCommand`)
- Modify: `src/renderer/src/sim/tactical/gun.ts` (`gunInterval`), `sim/tactical/pew.ts` (`pewGain`)
- Modify: `tests/duelModules.test.ts` (the kinds list)
- Create: `tests/w4Manual.test.ts`

**Interfaces:**
- Consumes: W-4a's `gunInterval(state, i)` (body quoted in Step 4), `PEW_MAN_GAIN_BY_BARS`, `AUTOCANNON_MAN_INTERVAL_BY_BARS`, `hasTurret`, `houndWeapons(st, bars)` (W-4a helper).
- Produces: `DuelCommand { kind: 'gunMode'; manual: boolean }`; `gunsManual` set by the step.

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §4.1, §4.4: gunMode {manual} (Weapons seat only; unavailable without a turret; malformed; noop), set at once;
// MAN's fire rate: the pew's gain 7 / 10 / 14 / 18 units a tick and the autocannon's interval 8 / 7 / 5 / 4.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { gunInterval, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { pewGain } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
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
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['applied', null], ['rejected', 'not-at-weapons']]);
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

describe("MAN's fire rate (W-4 spec §4.4)", () => {
  it('the pew gains 7 / 10 / 14 / 18 units a tick in MAN and keeps 6 / 8 / 12 / 15 in AUTO', () => {
    for (const [bars, man, auto] of [[1, 7, 6], [2, 10, 8], [3, 14, 12], [4, 18, 15]] as const) {
      const st = houndWeapons(createTacticalState(5), [bars, 0, 0]); st.systems[0]!.bars[1] = 10;   // the overdrive bar allows a 4th
      expect(pewGain(st, 0), `${bars} bars AUTO`).toBe(auto);
      st.systems[0]!.gunsManual = true;
      expect(pewGain(st, 0), `${bars} bars MAN`).toBe(man);
    }
    const hunter = createTacticalState(5); hunter.systems[1]!.gunsManual = false;
    expect(pewGain(hunter, 1)).toBe(6);   // the Hunter's rate is its class's (720 / 120), unchanged
  });
  it('the autocannon fires every 8 / 7 / 5 / 4 ticks in MAN, measured between gunFire events', () => {
    for (const [bars, interval] of [[1, 8], [2, 7], [3, 5], [4, 4]] as const) {
      const st = houndWeapons(createTacticalState(5), [0, bars, 0]), s = st.systems[0]!; s.bars[1] = 10; s.gunsManual = true;
      expect(gunInterval(st, 0), `${bars} bars`).toBe(interval);
      const at: number[] = [];
      for (let k = 0; k < 80; k++) { st.events = []; tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true }); if (st.events.some((e) => e.kind === 'gunFire')) at.push(k); }
      expect(new Set(at.slice(1).map((t, j) => t - at[j]!)), `${bars} bars`).toEqual(new Set([interval]));
    }
  });
});
```

(`tickGun`'s MAN trigger in this task is W-4a's `input.gunHeld`; Task 6 keeps it for MAN.) Check the noop's status string against W-4a's `tests/w4Frequency.test.ts` and match it if W-4a's executor found a different shape.

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

- [ ] **Step 4: MAN's tables**

`sim/tactical/gun.ts`, W-4a's `gunInterval`: replace `return g.intervalByBars[0]![weaponBars(state.systems[i]!, WeaponSlot.Autocannon)] ?? 0;` with

```ts
  const s = state.systems[i]!;
  return g.intervalByBars[s.gunsManual ? 1 : 0]![weaponBars(s, WeaponSlot.Autocannon)] ?? 0;   // W-4 spec §4.4: MAN's row (W-4b)
```

and update its doc comment: "W-4a: row 0 (AUTO); W-4b reads the mode." → "the row is the mode's (gunsManual: MAN), read when a round fires."

`sim/tactical/pew.ts` `pewGain`: replace

```ts
  const ticks = PEW_TICKS_BY_BARS[weaponBars(state.systems[i]!, WeaponSlot.Pew)]!;
  return ticks > 0 ? pewThird(def) / ticks : 0;
```

with

```ts
  const s = state.systems[i]!, bars = weaponBars(s, WeaponSlot.Pew);
  if (def.turret !== null && s.gunsManual) return PEW_MAN_GAIN_BY_BARS[bars]!;   // W-4 spec §4.4: the Hound's pew in MAN, about +20 %
  const ticks = PEW_TICKS_BY_BARS[bars]!;
  return ticks > 0 ? pewThird(def) / ticks : 0;
```

adding `PEW_MAN_GAIN_BY_BARS` to pew.ts's bars import and "W-4 spec §4.4: the Hound's in MAN by PEW_MAN_GAIN_BY_BARS" to its doc comment.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Manual.test.ts tests/w4Autocannon.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts`
Expected: tsc clean; all PASS except a known-red pin (nobody sends `gunMode` yet, so no run changes).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/step.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts tests/duelModules.test.ts tests/w4Manual.test.ts
git commit -m "feat(w4b): gunMode sets both guns AUTO / MAN; MAN's fire-rate tables (W-4 spec §4.1, §4.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The turrets slew: AUTO's solutions, MAN's reticle, and rounds along the turrets

**Files:**
- Modify: `src/renderer/src/sim/tactical/turret.ts` (`autoSolution`, `slewTurrets`), `sim/tactical/gun.ts` (`gunLead`, `gunAimFine`), `sim/tactical/pew.ts` (`pewAimFine`), `sim/tactical/weapons.ts` (`applyWeaponsInput`)
- Modify: `tests/w4Turret.test.ts`

**Interfaces:**
- Consumes: `pewLead(state, i, tx, ty, tvx, tvy)`, `pewMuzzle(state, i)` (pew.ts), `interceptTime`, `nearestHeading` (lead.ts), `lineOfSight(state, ax, ay, bx, by)` (geometry.ts), `shipSeen(t, i)` (science.ts), `weaponBars`, `WeaponSlot.Pew | Autocannon`, `hasTurret`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, W-4a's `gunAimFine` / `pewAimFine` bodies (quoted in Step 4).
- Produces: `gunLead`, `autoSolution`, `AutoOnSolution`, `slewTurrets` (turret.ts). Task 6 consumes `slewTurrets`' return.

- [ ] **Step 1: Write the failing tests**

Append to `tests/w4Turret.test.ts` (add the imports it needs: `applyWeaponsInput`, `IDLE_INPUT`, `type ShipInput` from weapons; `autoSolution`, `slewTurrets` from turret; `gunLead`, `gunAimFine`, `tickGun` from gun; `pewAimFine`, `pewLead`, `firePewTrigger`, `aimDir` from pew; `houndWeapons` from `./helpers/crewWeapons`; `mover` from `./helpers/rockArena`; `hx`, `hy` from direction; `HEADING_COUNT` from tuning):

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
  it('MAN: only the selected gun follows the reticle, at 455 / 341 a tick; the torpedo selected or no reticle moves nothing', () => {
    const st = scene([1, 1, 1]), s = st.systems[0]!; s.gunsManual = true;
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 0]);
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 341]);
    tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 4000 });
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: -1 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 341]);
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
    expect(autoSolution(st, 0, 'pew')).toBe(40 * 256);
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
 *  gun or an intercept. */
export function gunLead(state: TacticalState, i: number, tx: number, ty: number, tvx: number, tvy: number): number {
  const g = classOf(state, i).slots.gun;
  if (!g) return -1;
  const s = state.ships[i]!, mx = s.x + hx(s.heading) * g.muzzleForward, my = s.y + hy(s.heading) * g.muzzleForward;
  const rx = tx - mx, ry = ty - my, vx = tvx - s.vx, vy = tvy - s.vy, t = interceptTime(rx, ry, vx, vy, g.speed);
  if (t < 0) return -1;
  const h = nearestHeading(rx + vx * t, ry + vy * t);
  return h < 0 ? -1 : h * HEADING_COUNT;
}
```

(`lead.ts` imports only `direction`, `state` and `tuning`, so there is no cycle.)

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

Append to `sim/tactical/turret.ts` (and extend its imports):

```ts
import { weaponBars, WeaponSlot } from './bars';
import { hasTurret } from './defs';
import { hx, hy } from './direction';
import { lineOfSight } from './geometry';
import { gunLead } from './gun';
import { pewLead, pewMuzzle } from './pew';
import { shipSeen } from './science';
import { classOf, CREW_SLOT, type TacticalState } from './state';
import { AUTOCANNON_AUTO_RANGE, PEW_RANGE } from './tuning';
import type { ShipInput } from './weapons';   // type only: weapons.ts imports this file

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
 * MAN (gunsManual): the selected gun (input.weaponSel) slews toward the reticle (input.turretAim) at its MAN traverse; the
 * other holds; no reticle or the torpedo selected, nothing slews. AUTO: each powered gun slews toward its solution
 * (autoSolution) at its AUTO traverse, or back to the nose with none, and reports on solution when it sits exactly on it.
 * It slews in the hold too; only firing waits (§4.3, applyWeaponsInput).
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
    if (s.gunsManual) {
      if (input.weaponSel !== slot || input.turretAim < 0) continue;
      next = slewTurret(now, heading, input.turretAim, turret.traverse[1], turret.arcSteps);
    } else {
      const sol = autoSolution(state, i, gun);
      next = slewTurret(now, heading, turretWorldAim(heading, sol ?? 0), turret.traverse[0], turret.arcSteps);
      out[gun] = sol !== null && next === sol;
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
git add src/renderer/src/sim/tactical/turret.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/weapons.ts tests/w4Turret.test.ts
git commit -m "feat(w4b): the turrets slew: AUTO onto its lead (pewLead, gunLead), MAN onto the reticle; rounds fly along the turrets (W-4 spec §3.4, §4.2, §5, §6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The reticle, Z and LMB by mode, in both runtimes

**Files:**
- Modify: `src/renderer/src/app/duel/mapRequests.ts`, `app/duel/scene.ts`, `app/duel/duelMode.ts`, `app/duel/runtime.ts`, `app/duel/onlineDuel.ts`, `app/duel/input.ts`, `app/duel/weaponsSeat.ts`, `app/controlsList.ts`, `ui/duel/WeaponsStation.tsx` (the BEAM tag's press), `scripts/network/duel-app-smoke.ts` (Decision 12)
- Modify (kind (a) renames): `tests/manualLaserScene.test.ts`, `tests/manualLaserInput.test.ts`, `tests/manualLaserUi.test.tsx`, `tests/onlineDuelSession.test.ts`, `tests/duelCheckpoint.test.ts` (each `presses.laserMode` / `press('laserMode')` / `aimLaser` / `laserAim()` / `resetLaserAim` they use)
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

Append to `tests/w4Runtime.test.ts`, in its own idiom (its `rt` factory with `triggerHeld` and the new `reticleAim` dep, seated at the Hound's Weapons seat), these `it`s with every named assertion:
- `Z queues gunMode {manual: true}, a second Z queues {manual: false}; the laser fit's Weapons seat still queues laserMode`;
- `in AUTO a left click with pew pew selected queues nothing and refuses nothing; in MAN it queues pewFire {}`;
- `in AUTO the held trigger with the autocannon selected puts no gunHeld in the held frame and refuses nothing; in MAN it puts gunHeld and a dead trigger refuses NO POWER`;
- `the held frame carries turretAim from deps.reticleAim, and none while it returns null`.

Append to `tests/w4Online.test.ts`:

```ts
describe('the online reticle and mode (W-4 spec §11, W-4b)', () => {
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

and, in the idiom of `tests/onlineDuelSession.test.ts` (its session rig), the cases: (1) Z sends `gunMode {manual: true}` once, a second Z in a later pump before the result sends `{manual: false}` (from `gunModeSent`, not the replica); (2) in AUTO a left click with pew pew selected sends nothing; after Z it sends `pewFire {}`; (3) a change of the reticle alone is stamped as a held change.

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

`app/duel/onlineDuel.ts`: `const laserAimNow = (): number | null => requests.laserAim();` → `const reticleNow = (): number | null => requests.reticleAim();   // W-2, W-4: the reticle (kept, not drained)`, and its use `laserAimNow()` → `reticleNow()`. **Inside `pump` and `play` the name `requests` is the ContactRequests**; read the map requests only through closures declared beside `reticleNow` (`takeSteer0` is the precedent). If W-4a's code reads `requests.triggerHeld()` there, it must already go through such a closure (W-4a's executor fixed it, or tsc would fail); use the same closure, here called `triggerNow`.

Rename the uses in `tests/manualLaserScene.test.ts` and the `onlineDuelSession.test.ts` fakes (`aimLaser` → `reticle`, `laserAim()` → `reticleAim()`, `resetLaserAim()` → `resetReticle()`), kind (a), citing W-4 spec §9.

- [ ] **Step 4: Z is `weaponMode`**

`app/duel/input.ts`: in `KeyAction`, `'laserMode'` → `'weaponMode'`; `PRESS_CODES.KeyZ: 'weaponMode'`; `emptyPresses`'s `laserMode: 0` → `weaponMode: 0`; the doc: "W-2, W-4 spec §9: Z toggles AUTO / MAN at Weapons: both guns on the Hound (gunMode), the laser on the laser fit (laserMode)".

`ui/duel/WeaponsStation.tsx`: the BEAM tag's `actions.console.press('laserMode')` → `press('weaponMode')`.

`app/controlsList.ts`: in `DUEL_ACTION`, replace the `laserMode` entry with `weaponMode: 'At Weapons, switch both guns between AUTO (they aim and fire by themselves) and MAN (the reticle aims, the left button fires); with the laser fit, the laser\'s AUTO / MANUAL'`; and add after W-4a's rows: `{ keys: 'Mouse', action: "At Weapons, the reticle: the selected gun's turret follows it, inside its arc (MAN)" }`.

In the laser class's Weapons branch of `runtime.ts` and `onlineDuel.ts`, `p.laserMode` → `p.weaponMode` (the code is otherwise unchanged).

Rename `presses.laserMode` / `press('laserMode')` / `laserMode:` (the press field) in `tests/manualLaserInput.test.ts`, `tests/manualLaserUi.test.tsx`, `tests/onlineDuelSession.test.ts`, `tests/duelCheckpoint.test.ts` and any other test tsc names (kind (a); the `laserMode` **command** kind is unchanged).

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
6. In `pump`, replace W-4a's `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: <the trigger closure>() })` with

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

Run: `npx tsc -b` then `npx vitest run tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/manualLaserScene.test.ts tests/manualLaserInput.test.ts tests/manualLaserUi.test.tsx tests/onlineDuelSession.test.ts tests/duelCheckpoint.test.ts tests/duelRuntime.test.ts tests/settingsAndControls.test.ts tests/scienceInput.test.ts`
Expected: tsc clean; all PASS (a `duelCheckpoint` whole-run pin may stay known-red). Then `npm run test:duel-app-runtime`: the smoke passes.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/controlsList.ts src/renderer/src/ui/duel/WeaponsStation.tsx scripts/network/duel-app-smoke.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts <each renamed test>
git commit -m "feat(w4b): the reticle drives turretAim, Z toggles both guns (gunMode), LMB fires only in MAN, local and online (W-4 spec §4.1, §4.3, §9, §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: AUTO fires: the pew on each third, the autocannon to 80 % heat, nothing in the hold; the scripted gunner on AUTO

**Files:**
- Modify: `src/renderer/src/sim/tactical/gun.ts` (`tickGun`), `sim/tactical/weapons.ts` (`applyWeaponsInput`), `sim/duel/step.ts` (`pewFire`'s AUTO refusal), `sim/duel/scripted.ts` (`houndGunner`)
- Create: `tests/w4Auto.test.ts`
- Modify: `tests/w4Manual.test.ts`, `tests/duelScripted.test.ts` (kind (a): W-4a's stand-in tests), `tests/w4PewFire.test.ts` (its admission now needs MAN: kind (a))

**Interfaces:**
- Consumes: `slewTurrets` → `AutoOnSolution` (Task 4), `enemyHostile(t)` (science.ts L29), `GUN_AUTO_HEAT_STOP` (tuning.ts), W-4a's `tickGun` (quoted in Step 3), W-4a's `houndGunner` (quoted in Step 5), W-4a's `pewFire` admission block (quoted in Step 4).
- Produces: `tickGun(state, i, input, auto = false)`.

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §4.2, §4.3: AUTO fires only at a seen, hostile enemy ship in range, arc and line of sight, on solution, attended
// and powered: the pew one round per stored third (Decision 4), the autocannon at its interval until 80 % heat (it never
// locks; it settles at the cooling rate); in the hold (hostileAt −1) both track and fire nothing, and the first AUTO round
// comes the tick after a crew shot or the clock ends the hold; a torpedo crossing a round aimed at the ship is still hit.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { stepPew } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
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
  it('the pew: its stored thirds, then one round per charged third (60 ticks at 1 bar), on solution only', () => {
    const st = scene([1, 0, 1]), at: number[] = [];
    for (let k = 0; k < 400; k++) if (tick(st).pew) at.push(k);
    expect(at.length).toBeGreaterThanOrEqual(8);
    const later = at.slice(3).map((t, j, a) => (j === 0 ? 0 : t - a[j - 1]!)).slice(1);
    expect(new Set(later)).toEqual(new Set([PEW_RECHARGE_TICKS]));   // 1 bar: a third every 60 ticks
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
```

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

In `sim/tactical/gun.ts`, add `GUN_AUTO_HEAT_STOP` to the tuning import, change the signature to `export function tickGun(state: TacticalState, i: number, input: ShipInput, auto = false): void {`, and replace W-4a's two lines

```ts
  if (!input.weapons || !input.gunHeld || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  if (g.turret !== null && gunInterval(state, i) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  fireRound(state, i, g);
```

(W-4a puts `fireRound(state, i, g);` right after them) with

```ts
  if (!input.weapons || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  if (g.turret === null) { if (input.gunHeld) fireRound(state, i, g); return; }   // the Valkyrn: its trigger, as before
  if (gunInterval(state, i) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  // W-4 spec §4.3, §5: MAN fires on the held trigger (the step sets it only with the autocannon selected); AUTO fires on
  // solution once hostile (`auto`, applyWeaponsInput) while below the 80 % heat stop, so it never locks; no hysteresis.
  if (s.gunsManual ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g);
```

and extend its doc comment: "W-4 spec §4.3: a turret gun fires in MAN on the trigger, in AUTO on `auto` (on solution and hostile) below GUN_AUTO_HEAT_STOP." For the Valkyrn the checks and their order are equivalent to master's single condition (each is a pure read before the one `fireRound`).

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

and replace W-4a's

```ts
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's pewFire, along the turret; last, as before
  else if (input.pewAim >= 0) firePew(state, i, input.pewAim);   // W-1 (pew pew spec §1): the Hunter's aim; attended (above)
```

with

```ts
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's MAN pewFire, along the turret; last, as before
  else if (auto.pew && hostile) firePewTrigger(state, i);   // W-4 spec §4.3: AUTO, a round whenever on solution with a third stored (firePew checks pewReady)
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

Fix `tests/w4PewFire.test.ts` (W-4a): its admission test now sets MAN first (`d.tactical.systems[0].gunsManual = true` after creating the duel), citing W-4 spec §6 (kind (a)).

- [ ] **Step 5: The scripted gunner on AUTO (spec §12)**

In `sim/duel/scripted.ts` `houndGunner`, delete the stand-in pew block:

```ts
  const s = t.ships[0], e = t.ships[target]!;
  if (e.active && pewReady(t, 0) && weaponBars(sys, WeaponSlot.Pew) > 0 && t.tick - pair.lastPew >= SCRIPTED_PEW_GAP) {
    const dx = e.x - s.x, dy = e.y - s.y;
    if (dx * dx + dy * dy <= PEW_RANGE * PEW_RANGE && inArc(s.heading, dx, dy, PEW_ARC_COS)) { out.push({ kind: 'pewFire' }); pair.lastPew = t.tick; }
  }
```

and rewrite its doc comment: "W-4 spec §12: the gunner on a turret class (the Hound). Its first seated tick spends the spare bar on the autocannon (pre-checked, so both commands are admitted) and does nothing else that tick. The guns stay AUTO (no gunMode, no held aim, no pewFire): they track and, once the enemy is hostile, fire by themselves (applyWeaponsInput). Its torpedo rule (a torpLock while the target is seen, canLaunch and the gap) launches the AUTO torpedo, which also ends the 30 s hold if the clock has not. No laser command." Remove imports that are now unused (tsc names them; `gunnerPew` on other classes still uses some).

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

and in the whole-duel kinds expectation drop `'pewFire'`: `['shipPower', 'sit', 'stand', 'torpLock', 'weaponPower']` (comment: "W-4 spec §12, §14 (kind a): AUTO guns, so no pewFire (W-4b removed W-4a's stand-in)"); if the seed's duel no longer uses every kind, re-pick it as W-4a's Task 8 says. Drop helpers (`pewFires`, `movedPair`) and imports that are now unused.

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4Turret.test.ts tests/w4PewFire.test.ts tests/w4Autocannon.test.ts tests/duelScripted.test.ts tests/valkyrnIdentity.test.ts tests/valkyrnRounds.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/manualLaserBeam.test.ts tests/manualLaserMode.test.ts`
Expected: tsc clean; all PASS except `duelScripted`'s known-red whole-run values. The laser fit's AUTO beam still fires in the hold (W-2's tests on the laser fit, unchanged).

Then: `npx vitest run tests/duelGates.test.ts` and `npx tsx scripts/duel-telemetry.ts`. Record in the report under `## W-4b` the per-seed lines (pew rounds, gun rounds, launches, hold end rt and cause) and the summary. A failing per-seed test is the known-red window until Task 10.

- [ ] **Step 7: Classify the fallout**

Run: `npx electron-vite build` then `npx vitest run --maxWorkers=4 2>&1 | tail -80`
Expected: only the known-red window. Any other red test: apply the fallout rule (a test that expects the Hound's pew to fire in AUTO on `pewFire`, or the old held trigger in AUTO, is kind (a)); list each in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4PewFire.test.ts tests/duelScripted.test.ts docs/superpowers/research/2026-11-19-w4-report.md <each kind (a) test fixed in Step 7>
git commit -m "feat(w4b): AUTO fires at a seen, hostile ship on solution (the pew per third, the autocannon to 80 % heat), holds fire in the hold; pewFire is MAN only; the scripted gunner leaves the guns on AUTO (W-4 spec §4.3, §6, §12)" -m "<kind (a) tests changed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
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

Add, in the idiom of `tests/onlineDuelSession.test.ts`, one case: after Z in a pump whose `gunMode` result has not come back, the source's `turret(0)` moves toward the reticle at MAN's traverse with `unacked` k > 0 (the mode in flight is used), and once the result comes back the replica's mode is the base again.

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

`app/duel/runtime.ts`, in the returned object after W-4a's `weaponSel: () => weaponSel,` add `turret: (slot: 0 | 1) => (slot === 0 ? d.tactical.systems[0].pewTurret : d.tactical.systems[0].gunTurret),   // W-4 spec §11: no lag locally`.

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
- Consumes: `combatModel(input)` locals `own` (the interpolated own ship, `h` its fractional heading), `ownS`, `cls`, `z`, `enemyS`, `enemyShown`; `headingAngle(h)`, `drawnScale(z)` (tacticalModel.ts); `hasTurret`, `autoSolution`, `enemyHostile`, `weaponBars`, `WeaponSlot`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`, `AIM_STEPS`, `SHIP_RADIUS`; `DuelViewSource.turret?` / `weaponSel?`; the scene's `reticlePointer` (Task 5).
- Produces: `CombatModelInput.turrets?: { pew: number; gun: number } | null`, `weaponSel?: number`, `reticle?: Point | null`; `CombatDraw.turretArc: ArcDraw | null`, `muzzles: MuzzleDraw[]`, `reticle: Point | null`, `bracket: BracketDraw | null`; `interface MuzzleDraw extends Segment { selected: boolean }`, `interface BracketDraw { x: number; y: number; r: number; live: boolean }`.

- [ ] **Step 1: Write the failing test**

Build the combat model input the way `tests/pewViews.test.ts` (W-1) does for the Weapons console (its camera, viewport and `fx` helpers), on a Hound tactical state, then:

```ts
// W-4 spec §10 (W-4b): on the Hound's Weapons map the selected gun's arc about the nose (dim), each gun's muzzle line along
// its turret (the selected one mid, the other dim; the pew to PEW_RANGE, the autocannon to 600), the reticle at the pointer,
// and in AUTO a bracket on the enemy while a gun is on solution (hot once hostile, dim in the hold); no W-1 cone or aim line;
// on the Helm and Science maps the muzzle lines only, dim, and no reticle.
describe("the Hound's Weapons map (W-4 spec §10)", () => {
  it('the selected arc is the selected gun\'s; none with the torpedo selected', () => {
    // weaponSel 0: turretArc.half === PEW_ARC_STEPS / AIM_STEPS * 2π; weaponSel 1: AUTOCANNON_ARC_STEPS / AIM_STEPS * 2π; weaponSel 2: turretArc null; pewCone and pewAim null
  });
  it('the muzzle lines follow the turrets (input.turrets wins over the state) and the selection', () => {
    // turrets { pew: 16384 / 4 (a quarter of the arc... use 2731), gun: -2731 }: two muzzles; the first's angle from ownS equals headingAngle(own.h) + 2731 / AIM_STEPS * 2π (atan2(dx, -dy)); its length PEW_RANGE * zoom; selected flags [true, false] at weaponSel 0
  });
  it('the reticle is the pointer on the Weapons map only', () => {});
  it('the AUTO bracket: present on solution (live when hostileAt ≥ 0, not live in the hold), absent in MAN or off solution', () => {});
  it('on the Helm map: two dim muzzle lines, no arc, no reticle, no bracket', () => {});
  it('the laser fit\'s Weapons map draws no muzzle lines (no turret)', () => {});
});
```

Fill each `it` with the assertions its comment names, using the real numbers (`PEW_ARC_STEPS`, `AUTOCANNON_ARC_STEPS`, `AIM_STEPS`, `PEW_RANGE`, `AUTOCANNON_AUTO_RANGE`). For the bracket, put the Hunter 300 u ahead and set `systems[0].pewTurret = autoSolution(st, 0, 'pew')!`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Map.test.ts`
Expected: FAIL (no `turretArc` / `muzzles`).

- [ ] **Step 3: The model**

In `render/tactical/weaponsModel.ts`:

1. Imports: `hasTurret` from `../../sim/tactical/defs`; `autoSolution` from `../../sim/tactical/turret`; `enemyHostile` from `../../sim/tactical/science` (beside `pointSeen`); `weaponBars, WeaponSlot` from `../../sim/tactical/bars`; add `AUTOCANNON_AUTO_RANGE` to the tuning import.
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
  // Weapons map, dim elsewhere), the reticle at the pointer, and in AUTO a bracket on the enemy while a gun sits on its
  // solution (the sim's own test, on the replica's turrets; hot once hostile, dim in the hold).
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
      if (weaponBars(sys, gun === 'pew' ? WeaponSlot.Pew : WeaponSlot.Autocannon) < 1) return false;
      const s = autoSolution(state, 0, gun);
      return s !== null && s === (gun === 'pew' ? sys.pewTurret : sys.gunTurret);
    };
    if (onWeapons && !sys.gunsManual && enemyShown && (on('pew') || on('gun'))) bracket = { x: enemyS.x, y: enemyS.y, r: SHIP_RADIUS * drawnScale(z) + 6, live: enemyHostile(state) };
  }
```

(`enemyShown` is declared earlier in `combatModel`; if it is declared after this point, move this block below it.) Add `drawnScale` to the tacticalModel import.
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
- Consumes: W-4a's `WeaponsPanel.autocannon` / `selected` and its `weaponsPanel()` spread (quoted in Step 3), `HoundWeapons`, `weaponCard('autocannon')`, `Button` (`ui/stage/Button.tsx`), `enemyHostile`.
- Produces: `WeaponsPanel.gunsManual?: boolean`, `gunsHold?: boolean`; Buttons `gun-mode-pew`, `gun-mode-autocannon` (testids `console-gun-mode-pew`, `console-gun-mode-autocannon`, following `Button`'s `console-${name}` rule as W-3's `console-torp-mode`).

- [ ] **Step 1: Write the failing test**

Append to `tests/w4Ui.test.tsx`, in its own rig (W-4a's), these `it`s with real assertions:
- `the two gun tags read AUTO once hostile, HOLD in the hold, MAN (both lit) in MAN`: set `hostileAt` 0 / −1 and `gunsManual` on the duel, render, read the text of `[data-testid="console-gun-mode-pew"]` and `[data-testid="console-gun-mode-autocannon"]` and their lit state (the attribute `Button` sets for `lit`, as W-3's `console-torp-mode` test reads it);
- `a click on either tag presses weaponMode` (the store's console input records `press('weaponMode')`);
- `the hint row reads LMB FIRE · A/D SELECT · W/S POWER · Z AUTO/MAN`;
- `the laser fit's BEAM tag presses weaponMode too`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Ui.test.tsx`
Expected: FAIL (no gun tags).

- [ ] **Step 3: The model**

In `render/duel/consoleModel.ts`, in `WeaponsPanel` after W-4a's `autocannon?` / `selected?`, add:

```ts
  /** W-4 spec §10 (W-4b): both guns' mode (the one shared tag), and whether the 30 s hold keeps AUTO guns quiet (the tag
   *  then reads HOLD instead of AUTO). */
  gunsManual?: boolean; gunsHold?: boolean;
```

and in W-4a's `weaponsPanel()` spread (the `...(hasTurret(classOf(t, 0)) && classOf(t, 0).slots.gun ? { autocannon: { ... }, selected: i.weaponSel ?? 0 } : {})` entry), add after `selected: i.weaponSel ?? 0` the fields `gunsManual: sys.gunsManual, gunsHold: !sys.gunsManual && !enemyHostile(t)` (import `enemyHostile` from `../../sim/tactical/science`).

- [ ] **Step 4: The station**

In `ui/duel/WeaponsStation.tsx`, in W-4a's `HoundWeapons`:
- add a helper `const gunTag = (): string => (weapons.gunsManual ? 'MAN' : weapons.gunsHold ? 'HOLD' : 'AUTO');`;
- on the PEW PEW row, right of its `PEW PEW` label: `<Button name="gun-mode-pew" label={gunTag()} x={x0 + textPx('PEW PEW', 1) + 8} y={top + 2} w={36} h={18} lit={weapons.gunsManual === true} onPress={() => actions.console.press('weaponMode')} />`;
- in the AUTOCANNON card's header, where W-2's BEAM tag sat (`x={lx + 66} y={L.y + 2}` with `L = weaponCard('autocannon')`, `lx` its text x): `<Button name="gun-mode-autocannon" label={gunTag()} x={lx + 66} y={L.y + 2} w={36} h={18} lit={weapons.gunsManual === true} onPress={() => actions.console.press('weaponMode')} />`;
- the hint text `LMB FIRE · A/D SELECT · W/S POWER` → `LMB FIRE · A/D SELECT · W/S POWER · Z AUTO/MAN`;
- update the file's header comment: "W-4 spec §10 (W-4b): the two gun tags are one AUTO / MAN switch (Z), reading HOLD while the hold keeps AUTO quiet."

If the PEW PEW button's x overlaps W-4a's `1` hint, move the button left of the hint (`x={right - 36 - textPx('1', 1) - 12}`) instead; the test reads it by testid, not position.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Ui.test.tsx tests/manualLaserUi.test.tsx tests/manualTorpedoUi.test.tsx tests/targetingUi.test.tsx`
Expected: tsc clean; all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/w4Ui.test.tsx
git commit -m "feat(w4b): the shared AUTO / MAN / HOLD tag on both gun cards, and Z in the hint row (W-4 spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The tuning ladder (spec §12)

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (`AUTOCANNON_HITS_PER_HULL`), `sim/tactical/defs.ts` (`AUTOCANNON.hitsPerHull`), `sim/duel/scripted.ts` (`HOUND_MISSILE_GAP`, `HOUND_GUNNER_AUTOCANNON_BARS`, `houndGunner`)
- Modify: `tests/w4Loadout.test.ts` (W-4a's "its hit numbers are the Valkyrn's" rest-equality: `hitsPerHull` joins the excluded fields), `docs/superpowers/research/2026-11-19-w4-report.md`

**Interfaces:**
- Consumes: `AUTOCANNON`, `GUN_HITS_PER_HULL`, `AUTOCANNON_AUTO_RANGE`, `MISSILE_GAP`, `houndGunner` (Task 6), `runDuel`, `telemetryLine`, `gateSummary` (`tests/helpers/scriptedDuel.ts`), `scripts/duel-telemetry.ts`.
- Produces: `AUTOCANNON_HITS_PER_HULL`, `HOUND_MISSILE_GAP`, `HOUND_GUNNER_AUTOCANNON_BARS` (Decision 11), and the shipped values.

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
export const HOUND_GUNNER_AUTOCANNON_BARS: 1 | 2 = 1;
```

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

- [ ] **Step 2: The base result**

From `../w4b-ladder-base.txt` take `crew wins N` and run `npx vitest run tests/duelGates.test.ts`. If N ≥ 1 and every per-seed test passes, the ladder stops here: go to Step 4 with the base numbers.

- [ ] **Step 3: The rungs, in order (spec §12)**

Try each setting below in order, with every earlier knob back at its base value. For each: change the one constant, run `npx tsx scripts/duel-telemetry.ts > ../w4b-ladder-<name>.txt` and `npx vitest run tests/duelGates.test.ts`, and record a row (setting, crew wins, crew losses, median length, per-seed pass or the failing seeds). Stop at the first setting with crew wins ≥ 1 and every per-seed test passing, and keep it.

1. `AUTOCANNON_HITS_PER_HULL`: 10, then 8, then 6.
2. `AUTOCANNON_AUTO_RANGE` (tuning.ts): 450.
3. `HOUND_MISSILE_GAP`: 1125, then 750.
4. `HOUND_GUNNER_AUTOCANNON_BARS`: 2.

Never touch a Hunter or a Valkyrn knob. If no setting meets the target, restore every knob to its base value; the base numbers ship.

- [ ] **Step 4: The report**

Under `## W-4b` in `docs/superpowers/research/2026-11-19-w4-report.md` write: the ladder table (every setting tried, in order), the setting kept (or "none met the target: base numbers ship; the owner decides"), and for the kept setting the per-seed table (seed, length s, outcome, pew rounds, gun rounds, torpedo launches, hold end rt, hold cause) from `telemetryLine` and the `gateSummary` lines. The aggregate gate stays `it.skip` (kind (c)); its numbers are these.

Run: `npx tsc -b` then `npx vitest run tests/duelGates.test.ts tests/w4Loadout.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts`
Expected: the per-seed gates PASS (if no setting met the target and a per-seed test still fails, stop and report to the controller with the table: the owner decides, spec §12); the fences PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/duel/scripted.ts tests/w4Loadout.test.ts docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "tune(w4b): the spec §12 ladder on the Hound-only knobs; <the setting kept, or base numbers>" -m "<the ladder table, one line per setting>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
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

Run: `git diff --stat W4_BASE -- tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/w4HunterIdentity.test.ts` then `git diff W4_BASE -- tests/valkyrnIdentity.test.ts | grep "^[-+] *'" ` then `npx vitest run tests/valkyrnIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: no diff in the first four (`w4HunterIdentity` unchanged since W-4a's Task 1); no changed pinned digest line in `valkyrnIdentity` (only Task 1's flatten helper); all PASS.

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

- [x] Automated (W-4b): `npx vitest run` passes (<files> files, <tests> tests). This includes the turret state (hashed, bounded per class), the slew law (rate, arc, wrap, integers), MAN slewing only the selected gun at 455 / 341 and AUTO at 364 / 273, AUTO's solutions (seen, range, line of sight, arc, ship only) and firing (the pew per third, the autocannon to 80 % heat and never locking, nothing in the 30 s hold), MAN's fire-rate tables, `gunMode` and `pewFire`'s AUTO refusal, `turretAim` in every held schema, Z and the shared tag, the map's arc, muzzle lines, reticle and bracket, the online turret prediction equal to the stepped turret, and the scripted gunner on AUTO guns (`tests/w4*.test.ts`). `npx tsc -b` is clean; SIM_VERSION V (60 today), goldens blessed at V, no bump; `tests/valkyrnIdentity.test.ts`'s digests and `tests/w4HunterIdentity.test.ts` unchanged; determinism passes on Node, Electron and Firefox. Tuning ladder: <the setting kept, or "base numbers">.
- [ ] Manual (owner): play a Single player duel at the Hound's Weapons seat.
  1. Move the mouse over the map: the reticle follows; in MAN (Z) the selected gun's muzzle line trails it and stops at the arc's edge.
  2. Press Z: both tags flip between AUTO and MAN together.
  3. In the first 30 s, on AUTO, the guns track the enemy and the tags read HOLD; nothing fires.
  4. Once hostile, on AUTO, both guns track and fire at the ship with no input; the bracket lights on the enemy.
  5. MAN feels quicker to traverse and fire than AUTO.

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
- **Placeholders:** the app-rig tests in Tasks 5, 7, 8 and 9 name every assertion and the file whose rig to copy, as W-4a's Tasks 10-12 do, because those rigs are long and file-local. Every sim test is written in full.
- **Type consistency:** `turretOffset`, `slewTurret`, `turretWorldAim`, `autoSolution`, `AutoOnSolution`, `slewTurrets`, `gunLead`, `tickGun(…, auto)`, `heldTurretAim`, `predictTurret`, `weaponsSeatHeld(sel, trigger, aim)`, `sessionHeld(…, { sel, trigger, aim })`, `gunModeSent`, `gunModeBase`, `DuelViewSource.turret`, `MapRequests.reticle/reticleAim/resetReticle`, `DuelRuntimeDeps.reticleAim`, `KeyAction 'weaponMode'`, `CombatModelInput.turrets/weaponSel/reticle`, `CombatDraw.turretArc/muzzles/reticle/bracket` and `WeaponsPanel.gunsManual/gunsHold` are each defined once and used with the same signature in later tasks.
- **Seen in W-4a's plan that W-4b depends on (for the controller):** W-4a Task 3's `validateTacticalValues(Array.from(flattenTactical(st)), st)` has its arguments reversed (the export is `(shape, values, offset)`; W-4a tells its executor to check); W-4a Tasks 10 and 11 call `requests.triggerHeld()` inside `play` / `pump`, where `requests` is the ContactRequests (online, inside `pump`; local `play`'s `requests` parameter likewise), so the trigger must be read through a closure or a dep (`deps.triggerHeld?.()` locally): W-4b's Task 5 relies on that closure existing and calls it `triggerNow`.
