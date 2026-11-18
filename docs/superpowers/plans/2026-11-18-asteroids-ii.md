# Billiard Asteroids (Spike ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn spike i's destructible rock pool into billiard asteroids (spec `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md`): rocks are two-body physics objects that take laser pushes, wake, bounce and crack each other, burst under a torpedo's area blast, fly into ships, and can be targeted on purpose with a new `rockLock` command; with satisfying view-only feedback, measured feel proxies and costs, a playable solo build and a report.

**Architecture:** The rock pool stays one `Float64Array` in the tactical state's `space` module (hashed, snapshotted, cloned as spike i wired it). New rules live in focused sim modules beside `rocks.ts` (pool basics and broad phase): `rockTuning.ts` (every number), `rockBreak.ts` (damage, push, dust, break patterns, slot use and eviction, rock-target clearing), `rockContacts.ts` (motion and rock-rock pairs), `rockBlast.ts` (the torpedo blast), `rockWeapons.ts` (the laser's rock rules); `contacts.ts` gains the two-body ship-rock contact. Two per-tick transient masks (`rockBorn`, `rockDone`) sit on the state, outside the hash. The `rockLock` command goes through the duel step's weapon-command validation and folds into `ShipInput.rockLock`. Feedback is view-only (`render/tactical/rockFx.ts`, `audio/rockSounds.ts`) and driven by the tick's `rock` events and the live pool.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Pixi.js v8 render models, React UI (`ui/duel`), zod codec, `tsx` scripts, Electron + playwright-core for screenshots.

## Global Constraints

- Work only in `/c/Users/djuar/FTLite/.worktrees/asteroids-ii` (branch `spike/asteroids-ii`). Never `git stash`. Never merge or push. Commit only the files a task names.
- Spike only: SIM_VERSION goes 52 → **53** on this branch only, in Task 10, by the two-step bless (same-version `npm run bless` of the gameplay at 52, then `canonical-trace.ts baseline` and `duel-oracle.ts baseline` at 52, then the bump to 53 and a version-only `npm run bless`). No `--fresh`.
- Determinism guard (`tests/helpers/determinismGuard.ts`): sim files may use only `+ − × ÷`, `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`; no `Math.cos`/`sin`/`atan2`/`hypot`, no `**`. Break directions come from literal cos/sin tables rotated onto the hit direction by multiplication.
- Tick order (fixed): `beginRockTick` (masks cleared), hunter think, weapon commands per active ship in slot order (`applyWeaponsInput`: laserLock, torpLock, rockLock, then stepBurst, charge, auto-fire, launch, auto-launch), ships fly, missiles fly, `stepRocks` (part 1: motion of every kind-2, not-born rock ascending; part 2: contacts, live outer loop ascending), ship contacts (each active ship in slot order: the planet, then `rocksNear` taken once, ascending, skipping born or dead slots; then later ships), missile contacts (owner order), weapon clocks, hostility, scan, salvage, outcome, tick++.
- Rock-rock pair: wake, separate, bounce, then both damage amounts worked out, applied a then b, then breaks a then b.
- Blast: the in-radius list is taken once, ascending, before the direct hit's pieces are written; then the `blast` event, the direct hit's burst, each listed rock in order (skipping born or dead), then ships in slot order; the torpedo ends with cause `'asteroid'`.
- Slot use: piece 0 keeps the broken rock's slot; the others take the lowest empty slots ascending; with none free, evict the smallest kind-2 rock that is not born and not a body of the contact being resolved and is smaller than the new piece (ties: lowest slot); otherwise the piece is dust with an event. Every dust emits an event.
- Transient masks `rockBorn`, `rockDone`: one flag per slot, not hashed, not snapshotted, fresh in a clone, cleared at the start of every `stepDuel` tick. Born slots: do not move, are skipped as either body in rock-rock contacts, skipped by ship contacts, missile contacts and `firstBlocker`, are not hit by the blast that made them, never evicted, and take no damage or push.
- A rock target clears itself: whenever a slot is cleared or rewritten, every active ship's `laserRock`/`torpRock` equal to it becomes −1 and `torpRockFlying` becomes −2.
- `AUTO_DIG = false`. Hostility unchanged (every crew shot and launch counts).
- Single-ship flight paths (`stepFlight`, `stepSoloFlight`) keep today's `hitStatic` contact: no wake, no ram damage, no break, no born mask.
- Spec values, exact: `ROCK_RESERVE 96`, `SHIP_MASS 900`, `m = r²`, `hp = ceil(r/10)`, `ROCK_WAKE_SPEED 40`, `ROCK_GRAVITY 1.0`, `ROCK_DRAG 0.1`, `ROCK_MAX_SPEED 300`, `ROCK_RESTITUTION 0.8`, `ROCK_CRUSH_SPEED 30`, `ROCK_CRUSH_STEP 40`, `ROCK_MIN_R 8`, `ROCK_FLING 150`, `ROCK_BLAST_FLING 200`, `LASER_ROCK_DAMAGE 2`, `LASER_ROCK_PUSH 4000`, `BLAST_RADIUS 120`, `BLAST_ROCK_DAMAGE_MIN 2`, `BLAST_ROCK_DAMAGE_MAX 6`, `BLAST_PUSH 60000`, `BLAST_SHIP_PUSH 120`, ship hull `min(4, 1 + floor(max(0, impact − 40) / 40))`, ship restitution `RESTITUTION 0.5`, static contact hull `ASTEROID_CONTACT_HULL 1`.
- Single player is the gate. No online fx work: guests see rock positions through the snapshot as in spike i. The `rockLock` command is on the wire (codec) so the sim's seat rule is the same online.
- All new colours are CRT ramp constants (`CRT.*`); `tests/crtColours.test.ts` covers every new drawing.
- Goldens and trajectory-pinned tests (`tests/golden.test.ts`, `duelGolden`, `duelRematchGolden`, `determinismHarness`, `duelCheckpoint`, `duelModules`' pinned ticks, telemetry-count tests) are expected to fail from Task 1 until Task 10. Tasks 1–9 run only their targeted tests plus `npm run typecheck`. Task 10 runs the whole suite.
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands run from the worktree root in Git Bash: `cd /c/Users/djuar/FTLite/.worktrees/asteroids-ii`.

## Deviations and clarifications (justified)

1. **Effective `torpRock` for `missileLaunch` admission** (spec §6.1 says "the last accepted `rockLock(torpedo)` of this tick, else the stored value"): when no `rockLock(torpedo)` was accepted but a `torpLock` was, the effective value is −1, because `applyWeaponsInput` applies the `torpLock` first and it clears `torpRock` (spec §6.1 "An accepted `torpLock` sets `torpRock = −1`"). This keeps the spec's stated goal: the admission result matches what `applyWeaponsInput` then does.
2. **Event fields** (spec §8 lists the shape): `split` carries `pieces: number[]` (the slots written, piece 0 first; the spec says only "carries `pieces`"), and `bump` from a rock-rock contact also carries `other` (the second rock's slot), so the feel proxy of §9.4 can tell whether either body belongs to the blast. A piece lost for want of a slot emits `dust` with `rock: −1`. Eviction dust carries the requesting break's `by`, no `ship` (spec: "`ship` is absent for ... eviction"; it does not name a `by`) and `evicted: true`, so the break shake, the crunch sound and the feel proxy's break count skip it (spec §8: eviction is not a break); it still gets a dust puff.
3. **`hit` events** are emitted for laser and blast damage only; collision and ram damage emit one `bump` event per damaging contact instead (spec §8 defines `bump` for those). `rockHits` counts `hit` events.
4. **`pickRock` hit radius**: the drawn circle `r · zoom`, floored at `ROCK_PICK_MIN_PX = 6` px so a rock drawn as a 2 px dot at map zoom can still be clicked. Ties and nearest-centre as specced.
5a. **`lineOfSight` skips born slots** like `firstBlocker` (spec §6.2's rule applied to both), so a piece born earlier in the weapon phase cannot block a shot without being the body that takes it.
5. **A rock-targeted shot that is not on target** follows spike i's miss path (`laserRockTarget`: the blocked enemy line or the nose ray); when that finds nothing, the miss beam is drawn to the nose ray's end, not to the enemy (the shot was not aimed at the enemy).
6. **The status sentence** at the top of the map names the rock when the laser has a rock target (`ROCK OUT OF RANGE: CLOSE TO 450`, `ROCK OUT OF ARC: TURN RIGHT`); the Weapons card keeps today's words exactly as specced. The FIRING SOLUTION bracket about the enemy is not drawn while the laser has a rock target (it would point at the wrong body).
7. **Optional UI fields**: `ConsoleInput.rockLock` and the new `WeaponsPanel` fields are optional, so the six existing test fakes and `app/uiProbe.ts` compile untouched.
8. **Blast fall-off test** (spec §9.3 "blast damage and push fall off linearly to zero at the radius"): the §4.2 formula gives push `BLAST_PUSH · fall` (linear to 0) and damage `2 + 4 · fall` (linear to 2 at the edge, then nothing at and beyond the radius). The test checks exactly that formula.
9. **Stress script driver** (spec §9.1 does not say how the crew reaches the belt): the script parks the crew 300 u outward of the biggest live belt rock when nothing is within torpedo range, keeps the crew's hull full and tops the magazine up before each 10 s torpedo, and turns the nose straight onto the laser's rock (script-side writes, identical in both twins). The Hunter is switched off as an inactive slot.
10. **Fan 2-piece threshold** (spec §3.4): tuned 2026-11-18 from r ≥ 25 to r ≥ 13 (`FAN_SPLIT_MIN_R`; 3 pieces at `FAN_TRIPLE_MIN_R` 40 unchanged) after the §9.4 feel proxy (1/10) so chain breaks keep making pieces. The task code blocks below show the original 25.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/rockTuning.ts` | Every rock-rule number (spec §3–§5), one block per task. |
| `src/renderer/src/sim/tactical/rockBreak.ts` | Damage (`wearRock`, `hitRock`), `pushRock`, `dustRock`, `vacate` (with rock-target clearing), the fan and burst patterns (literal tables), slot use and eviction, `breakRock`, `crushDamage`. |
| `src/renderer/src/sim/tactical/rockContacts.ts` | `stepRocks` (§3.2 motion, §3.3 contacts with the processed mask) and `resolveRockPair`. |
| `src/renderer/src/sim/tactical/rockBlast.ts` | `blastFall`, `detonateTorpedo` (§4.2). |
| `src/renderer/src/sim/tactical/rockWeapons.ts` | `rockOnTarget`, `rockShotLine`, `laserStrikesRock` (§4.1, §6.2). |
| `src/renderer/src/render/tactical/rockFx.ts` | View-only rock feedback: chips, specks, shockwave, core flash, sparks, shakes, and their screen draws (§7 items 1, 4–7). |
| `src/renderer/src/audio/rockSounds.ts` | Rock sounds with the six-a-second limiter (§7 item 8). |
| `tests/helpers/rockArena.ts` | Test rigs: an empty arena with the Hunter off, rock writers, pool fill, the tick's rock events. |
| `tests/rockPool.test.ts`, `tests/rockBreak.test.ts`, `tests/rockContacts.test.ts`, `tests/rockLaser.test.ts`, `tests/rockBlast.test.ts`, `tests/rockShips.test.ts`, `tests/rockLock.test.ts`, `tests/rockTargetModel.test.ts`, `tests/rockTargetUi.test.tsx`, `tests/rockFx.test.ts`, `tests/rockSounds.test.ts` | One test file per task's rules. |
| `scripts/spike-asteroids-ii-measure.ts` | §9.1 stress (twins, save/restore, cost gate, moving counts), §9.4 feel proxies, §9.5 sizes. |
| `scripts/spike-asteroids-find-split.ts` | Re-finds `duelCheckpoint.test.ts`'s SPLIT tick and end summary after a gameplay change. |
| `scripts/spike-asteroids-ii-shots.cjs` | §9.7 screenshots through the solo hook. |
| `docs/superpowers/research/2026-11-18-asteroid-spike-ii.md` | The §10 report. |

Modified:

| File | Change |
|---|---|
| `src/renderer/src/sim/tactical/rocks.ts` | Reserve 96, real hp, mass, wake helpers, masks, `writeRock`; spike i's break and fragment code moved out; `firstBlocker` skips born. |
| `src/renderer/src/sim/tactical/state.ts` | `RockCause`, the new `rock` event, counters, masks, the four ship-system fields. |
| `src/renderer/src/sim/tactical/hash.ts` | The new fields in the space and ship modules, validation bounds, fresh masks in the clone, `notSnapshotted`, `rockLock` in the ship module's commands. |
| `src/renderer/src/sim/tactical/duel.ts` | `beginRockTick`, `stepRocks` from `rockContacts.ts`, `resolveContacts(state, true)`. |
| `src/renderer/src/sim/tactical/weapons.ts` | Rock-targeted shots, auto-fire on target, rock torpedo range, `ShipInput.rockLock`, `validRockLock`, the fold. |
| `src/renderer/src/sim/tactical/missiles.ts` | Detonation, rock homing, `torpRockFlying` copy and reset, born skip. |
| `src/renderer/src/sim/tactical/contacts.ts` | The two-body ship-rock contact in the duel. |
| `src/renderer/src/sim/tactical/hunter.ts` | `rockLock` in its ShipInput literal. |
| `src/renderer/src/sim/duel/step.ts` | `rockLock` validation, order, effective torpRock for launch admission. |
| `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts` | The `rockLock` command and its wire schema. |
| `src/renderer/src/render/duel/situationModel.ts` | The laser's rock situation (card words, status sentence). |
| `src/renderer/src/render/duel/consoleModel.ts` | `laserRock`, `torpRock`, `torpRockFlying`, `rocks` on the Weapons panel. |
| `src/renderer/src/render/tactical/tacticalModel.ts` | `pickRock`, rock marks, streaks, wear from hp/hpMax. |
| `src/renderer/src/render/tactical/tacticalLayer.ts` | Rock brackets, streaks, the new effect kinds. |
| `src/renderer/src/render/tactical/weaponsModel.ts` | Rock effect draws; no enemy bracket while the laser has a rock target. |
| `src/renderer/src/render/tactical/fxModel.ts` | New FxItem kinds and fields, a seeded view random; spike i's rock fx lines removed. |
| `src/renderer/src/app/duel/contactController.ts` | `pickRock`, the `rockLock` request. |
| `src/renderer/src/app/duel/input.ts`, `src/renderer/src/ui/actions.ts` | `ConsoleInput.rockLock`, `KeySample.rockTo`. |
| `src/renderer/src/app/duel/scene.ts` | Rock click and hover, rock fx and shakes. |
| `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/onlineDuel.ts` | Send `rockLock`. |
| `src/renderer/src/app/duel/duelAudio.ts` | Rock sounds. |
| `src/renderer/src/app/duel/duelMode.ts` | The staging hook. |
| `src/renderer/src/ui/duel/WeaponsStation.tsx` | `TGT ROCK`, right-click clears, `ROCKS n`. |
| `scripts/spike-asteroids-measure.ts` | One call ported so it compiles (spike i's script, kept for the master/spike i comparison). |
| `scripts/profile-duel-publication.ts` | `--movers N`. |
| Tests: `tests/tacticalDeterminism.test.ts`, `tests/tacticalWeapons.test.ts`, `tests/ftlTargeting.test.ts`, `tests/duelModules.test.ts`, `tests/crtColours.test.ts`, `tests/contactScene.test.ts`, `tests/duelRuntime.test.ts`; `tests/asteroidSpike.test.ts` deleted (Task 2, its cases move to the new files). |

---

### Task 1: Pool, constants, masks, events and the new state fields

**Files:**
- Create: `src/renderer/src/sim/tactical/rockTuning.ts`
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (whole file, below), `src/renderer/src/sim/tactical/state.ts:20-62` (ShipSystems), `:101-135` (DuelEvent, TacticalState), `:158-169` (systemsFor, emptySystems), `:199-214` (createTacticalState), `src/renderer/src/sim/tactical/hash.ts:22-23, 85-89, 112-116, 171-182, 199-217, 226-228`, `src/renderer/src/sim/tactical/duel.ts:9, 351`
- Modify tests: `tests/tacticalDeterminism.test.ts:116-125`, `tests/asteroidSpike.test.ts:36`
- Test: `tests/rockPool.test.ts`

**Interfaces:**
- Consumes: spike i's pool (`rocks.ts`), the module field helpers in `hash.ts`.
- Produces:
  - `rockTuning.ts`: `export const ROCK_HP_PER = 10; export const ROCK_WAKE_SPEED = 40;`
  - `rocks.ts`: `ROCK_RESERVE = 96`, `rockHp(r: number): number`, `rockHpMax(r: number): number`, `rockMass(r: number): number`, `wakesAt(vc: number): boolean`, `wakeRock(s: TacticalState, k: number): void`, `beginRockTick(s: TacticalState): void`, `rockBorn(s: TacticalState, k: number): boolean`, `writeRock(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number): void`, `export type { RockCause }`.
  - `state.ts`: `export type RockCause = 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' | 'edge';` the `rock` DuelEvent `{ kind: 'rock'; what: 'hit' | 'split' | 'dust' | 'blast' | 'bump'; by: RockCause; rock: number; x: number; y: number; r: number; vx: number; vy: number; ship?: number; pieces?: number[]; other?: number; evicted?: true }`; `TacticalState` gains `rockDust, rockBlasts, rockCollisions, rockEvictions: number` (rockShatters renamed rockDust) and `rockBorn, rockDone: Uint8Array`; `ShipSystems` gains `laserRock, torpRock, torpRockFlying, rocksBroken: number`.

- [ ] **Step 1: Write the failing test** `tests/rockPool.test.ts`:

```ts
// Spike ii (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md §3.1, §6.1, §8): the pool's reserve, real hp and
// mass, the wake rule, the per-ship rock targets and tally, the six rock counters, and the transient masks.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, hashTactical, shipModule, spaceModule, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { beginRockTick, rockAlive, rockAt, rockBorn, rockCapacity, rockHp, rockHpMax, RockKind, rockMass, rockSlots, ROCK_RESERVE, wakeRock, wakesAt } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_WAKE_SPEED } from '../src/renderer/src/sim/tactical/rockTuning';

/** The flat index of a space or ship field (the space module's values come first). */
function fieldIndex(st: TacticalState, name: string): number {
  let index = 0;
  for (const f of [...spaceModule.fields(st), ...shipModule.fields(st)]) { if (f.name === name) return index; index += f.count; }
  throw Error(name);
}

describe('the spike ii rock pool (spec §3.1)', () => {
  it('has 96 reserve slots after the seeded rocks, every seeded rock static at full hp ceil(r / 10)', () => {
    const st = createTacticalState(3);
    expect(ROCK_RESERVE).toBe(96);
    expect(rockSlots(st)).toBe(st.map.asteroids.length + 96);
    expect(rockCapacity(st.map)).toBe(rockSlots(st));
    st.map.asteroids.forEach((a, k) => {
      expect(rockAt(st, k)).toEqual({ kind: RockKind.Static, x: a.x, y: a.y, vx: 0, vy: 0, r: a.r, hp: rockHp(a.r) });
      expect(rockHpMax(a.r)).toBe(Math.ceil(a.r / 10));
    });
    for (let k = st.map.asteroids.length; k < rockSlots(st); k++) expect(rockAlive(st, k)).toBe(false);
    expect([rockHp(15), rockHp(55), rockMass(30)]).toEqual([2, 6, 900]);
  });
  it('wakes a static rock only above ROCK_WAKE_SPEED, and never puts it back', () => {
    expect([ROCK_WAKE_SPEED, wakesAt(40), wakesAt(40.0001)]).toEqual([40, false, true]);
    const st = createTacticalState(3);
    wakeRock(st, 0);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    wakeRock(st, 0);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    const empty = st.map.asteroids.length;
    wakeRock(st, empty);
    expect(rockAt(st, empty).kind).toBe(RockKind.Gone);
  });
});

describe('the rock targets, the tally and the counters (spec §6.1, §8)', () => {
  it('every ship system has a laser and torpedo rock target and a break tally; the space module closes with six counters', () => {
    const st = createTacticalState(3), s = st.systems[0];
    expect([s.laserRock, s.torpRock, s.torpRockFlying, s.rocksBroken]).toEqual([-1, -1, -1, 0]);
    expect([st.rockHits, st.rockSplits, st.rockDust, st.rockBlasts, st.rockCollisions, st.rockEvictions]).toEqual([0, 0, 0, 0, 0, 0]);
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const f of ['laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken']) expect(ship).toContain(`systems.0.${f}`);
    expect(spaceModule.fields(st).map((f) => f.name).slice(-7)).toEqual(['rocks', 'rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions']);
    const three = createTacticalState(3, 3), off = three.systems[2];
    expect([off.laserRock, off.torpRock, off.torpRockFlying, off.rocksBroken]).toEqual([0, 0, 0, 0]);   // an inactive slot holds zeros
    expect(() => validateTacticalValues(three, flattenTactical(three))).not.toThrow();
  });
  it('validation bounds the rock targets to the pool (torpRockFlying also −2) and the counters to whole counts', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), cap = rockSlots(st);
    const cases: [string, number][] = [['systems.0.laserRock', cap], ['systems.0.laserRock', -2], ['systems.0.torpRock', cap], ['systems.0.torpRockFlying', -3],
      ['systems.0.torpRockFlying', cap], ['systems.0.rocksBroken', -1], ['rockDust', -1], ['rockEvictions', 0.5]];
    for (const [name, value] of cases) {
      const bad = [...base]; bad[fieldIndex(st, name)] = value;
      expect(() => validateTacticalValues(st, bad), `${name} ${value}`).toThrow(new RegExp(name.replace(/\./g, '\\.')));
    }
    const ok = [...base]; ok[fieldIndex(st, 'systems.0.laserRock')] = cap - 1; ok[fieldIndex(st, 'systems.0.torpRockFlying')] = -2;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
  });
});

describe('the transient masks (spec §3.1, §3.3)', () => {
  it('are not hashed, are fresh in a clone, and are cleared at the start of every tick', () => {
    const st = createTacticalState(3), before = hashTactical(st);
    st.rockBorn[4] = 1; st.rockDone[5] = 1;
    expect(hashTactical(st)).toBe(before);
    expect(spaceModule.notSnapshotted).toHaveProperty('rockBorn');
    expect(spaceModule.notSnapshotted).toHaveProperty('rockDone');
    const c = cloneTactical(st);
    expect(c.rockBorn).not.toBe(st.rockBorn);
    expect([c.rockBorn[4], c.rockDone[5]]).toEqual([0, 0]);
    expect(rockBorn(st, 4)).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockBorn[4], st.rockDone[5]]).toEqual([0, 0]);
    st.rockBorn[4] = 1; beginRockTick(st);
    expect(rockBorn(st, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockPool.test.ts`
Expected: FAIL (`rockTuning` module not found; `rockHpMax`, `beginRockTick` not exported).

- [ ] **Step 3: Create `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts
// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): every number of the rock
// rules in one place, so the report and any tuning name one file. Each block names the spec section it comes from.

/** §3.1: hp at birth (and hpMax for the cracks) is ceil(r / ROCK_HP_PER): 2 to 6 for the seeded rocks. */
export const ROCK_HP_PER = 10;
/** §3.1: a static rock wakes on a rock-rock contact or a ship's ram only above this closing speed (u/s). */
export const ROCK_WAKE_SPEED = 40;
```

- [ ] **Step 4: Replace `src/renderer/src/sim/tactical/rocks.ts`** (spike i's split rules stay until Task 2; only the reserve, hp, helpers, masks and event shapes change):

```ts
// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md), on spike i's pool: the map's
// asteroids as rock bodies. `state.rocks` is a fixed-capacity pool, ROCK_STRIDE values per slot: kind (0 gone, 1 static,
// 2 moving), x, y, vx, vy, r, hp (a real number). Slots 0 .. n − 1 start as the seeded map's asteroids (index for index);
// the ROCK_RESERVE slots after them start empty. Static becomes moving, never the reverse (§3.1).
// Broad phase: the seeded grid (grid.ts) is never rebuilt. It indexes slots 0 .. n − 1 at their seeded footprints, and a
// static rock never moves, so a grid hit counts only while its slot still holds a static rock; moving rocks are found by
// a linear scan. rocksNear merges both, ascending, so every caller still meets rocks in one fixed slot order.
// Two per-tick transient masks sit beside the pool (§3.1, §3.3): `rockBorn` (slots written with a new piece this tick)
// and `rockDone` (slots that had their contact turn this tick); not hashed, cleared at the start of every stepDuel tick.
import { queryGrid } from './grid';
import type { MapDef } from './map';
import { gravityAccel } from './physics';
import { ROCK_HP_PER, ROCK_WAKE_SPEED } from './rockTuning';
import type { RockCause, TacticalState } from './state';
import { DT, R_MAP } from './tuning';
export type { RockCause } from './state';

export const ROCK_STRIDE = 7;
export const RockKind = { Gone: 0, Static: 1, Moving: 2 } as const;
/** §3.1: spare slots for pieces. */
export const ROCK_RESERVE = 96;
/** Spike i's split rules, kept until Task 2 replaces them. */
export const LASER_ROCK_DAMAGE = 1;
export const TORPEDO_ROCK_DAMAGE = 4;
export const FRAGMENT_ROCK_DAMAGE = 1;
export const ROCK_SPLIT_R = 30;
export const ROCK_SPLIT_SCALE = 0.55;
export const ROCK_FLING = 40;
export const ROCK_MIN_R = 10;
/** The crew laser fires on its own at a rock that blocks its in-arc, in-range target (it digs). */
export const AUTO_DIG = true;

/** The pool's capacity for a map: its asteroids plus the reserve. Also the number of rock bodies in a ship's graceUntil. */
export function rockCapacity(map: MapDef): number { return map.asteroids.length + ROCK_RESERVE; }
/** §3.1: the hp a rock of radius r is born with. */
export function rockHp(r: number): number { return Math.ceil(r / ROCK_HP_PER); }
/** §3.1: the cracks read hp / hpMax, with hpMax recomputed from r. */
export const rockHpMax = rockHp;
/** §3.1: a rock's mass, r² (no unit). */
export function rockMass(r: number): number { return r * r; }

export function initRocks(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * ROCK_STRIDE);
  map.asteroids.forEach((a, k) => { out.set([RockKind.Static, a.x, a.y, 0, 0, a.r, rockHp(a.r)], k * ROCK_STRIDE); });
  return out;
}

export const rockKind = (s: TacticalState, k: number): number => s.rocks[k * ROCK_STRIDE]!;
export const rockAlive = (s: TacticalState, k: number): boolean => s.rocks[k * ROCK_STRIDE]! !== RockKind.Gone;
export interface RockView { x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: number }
export function rockAt(s: TacticalState, k: number): RockView {
  const b = k * ROCK_STRIDE, v = s.rocks;
  return { kind: v[b]!, x: v[b + 1]!, y: v[b + 2]!, vx: v[b + 3]!, vy: v[b + 4]!, r: v[b + 5]!, hp: v[b + 6]! };
}
export function rockSlots(s: TacticalState): number { return s.rocks.length / ROCK_STRIDE; }

/** §3.1: whether a contact closing at vc wakes a static rock. */
export function wakesAt(vc: number): boolean { return vc > ROCK_WAKE_SPEED; }
/** §3.1: a static rock becomes moving for good (its velocity is still 0); any other kind is left alone. */
export function wakeRock(s: TacticalState, k: number): void { if (s.rocks[k * ROCK_STRIDE] === RockKind.Static) s.rocks[k * ROCK_STRIDE] = RockKind.Moving; }
/** §3.1, §3.3: the start of a tick: both transient masks cleared (made again at the pool's size if it changed). */
export function beginRockTick(s: TacticalState): void {
  const n = rockSlots(s);
  if (s.rockBorn.length !== n || s.rockDone.length !== n) { s.rockBorn = new Uint8Array(n); s.rockDone = new Uint8Array(n); return; }
  s.rockBorn.fill(0); s.rockDone.fill(0);
}
/** §3.1: whether slot k was written with a new piece this tick. */
export function rockBorn(s: TacticalState, k: number): boolean { return s.rockBorn[k] === 1; }

/** Slots of every live rock whose bounding box may overlap the square around (x, y) of half-size h, ascending, no repeats. */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (const k of queryGrid(s.grid, x, y, h)) if (v[k * ROCK_STRIDE] === RockKind.Static) out.push(k);
  let moving = false;
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const r = v[b + 5]!;
    if (Math.abs(v[b + 1]! - x) <= h + r && Math.abs(v[b + 2]! - y) <= h + r) { out.push(k); moving = true; }
  }
  if (moving) out.sort((a, b) => a - b);
  return out;
}

/** Write slot k's seven values. */
export function writeRock(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number): void {
  s.rocks.set([kind, x, y, vx, vy, r, hp], k * ROCK_STRIDE);
}
function clear(s: TacticalState, k: number): void { s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE); }
/** A reused slot starts with no contact grace: every ship's grace for that body is cleared. */
function freshGrace(s: TacticalState, k: number): void { for (const ship of s.ships) ship.graceUntil[k + 1] = 0; }

/** Spike i: damage rock k by `dmg` from direction (dx, dy) (need not be unit; zero falls back to north). At 0 hp it breaks. */
export function damageRock(s: TacticalState, k: number, dmg: number, dx: number, dy: number, by: RockCause): void {
  if (!rockAlive(s, k)) return;
  const b = k * ROCK_STRIDE, hp = s.rocks[b + 6]! - dmg;
  s.rocks[b + 6] = Math.max(0, hp);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: s.rocks[b + 1]!, y: s.rocks[b + 2]!, r: s.rocks[b + 5]!, vx: s.rocks[b + 3]!, vy: s.rocks[b + 4]! });
  s.rockHits++;
  if (hp <= 0) breakRock(s, k, dx, dy, by);
}

/** Spike i: radius ≥ ROCK_SPLIT_R splits into two fragments thrown forward along the hit direction at ±45°, else it is dust. */
export function breakRock(s: TacticalState, k: number, dx: number, dy: number, by: RockCause): void {
  const a = rockAt(s, k), d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const cr = a.r * ROCK_SPLIT_SCALE;
  if (a.r < ROCK_SPLIT_R || cr < ROCK_MIN_R) {
    clear(s, k); s.rockDust++;
    s.events.push({ kind: 'rock', what: 'dust', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy });
    return;
  }
  const px = -uy, py = ux, h = 0.7071067811865476, off = a.r * 0.6;
  const sides = [-1, 1] as const;
  clear(s, k);
  let second = -1;
  for (let j = 0, n = rockSlots(s); j < n; j++) if (j !== k && !rockAlive(s, j)) { second = j; break; }
  sides.forEach((side, n) => {
    const slot = n === 0 ? k : second;
    if (slot < 0) return;
    const fx = (ux + side * px) * h, fy = (uy + side * py) * h;
    writeRock(s, slot, RockKind.Moving, a.x + side * px * off, a.y + side * py * off, a.vx + fx * ROCK_FLING, a.vy + fy * ROCK_FLING, cr, rockHp(cr));
    freshGrace(s, slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces: second >= 0 ? [k, second] : [k] });
}

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/** Spike i: one tick of the moving fragments, ascending slot order: gravity (no drag), semi-implicit Euler, then contacts. */
export function stepRocks(s: TacticalState): void {
  const v = s.rocks, movers: number[] = [];
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) if (v[k * ROCK_STRIDE] === RockKind.Moving) movers.push(k);
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    v[b + 3]! += gx * DT; v[b + 4]! += gy * DT;
    v[b + 1]! += v[b + 3]! * DT; v[b + 2]! += v[b + 4]! * DT;
  }
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, p = s.map.planet, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) {
      const vx = v[b + 3]!, vy = v[b + 4]!;
      clear(s, k); s.rockDust++;
      s.events.push({ kind: 'rock', what: 'dust', by: planet ? 'planet' : 'edge', rock: k, x, y, r, vx, vy });
      continue;
    }
    for (const j of rocksNear(s, x, y, r)) {
      if (j === k) continue;
      const o = rockAt(s, j);
      if (!touching(x, y, r, o.x, o.y, o.r)) continue;
      const vx = v[b + 3]!, vy = v[b + 4]!;
      clear(s, k); s.rockDust++;
      s.events.push({ kind: 'rock', what: 'dust', by: 'collision', rock: k, x, y, r, vx, vy });
      damageRock(s, j, FRAGMENT_ROCK_DAMAGE, vx - o.vx, vy - o.vy, 'collision');
      break;
    }
  }
}

/** Where the segment a → b first enters circle (cx, cy, r), as t in [0, 1], or −1 when it never does. Starting inside is 0. */
export function segmentEntry(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const ex = bx - ax, ey = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  const a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const bb = fx * ex + fy * ey, disc = bb * bb - a * c;
  if (disc < 0 || bb > 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

/** The first solid body along a → b: the planet (−1), a rock slot (≥ 0), or null; with the entry t. */
export function firstBlocker(s: TacticalState, ax: number, ay: number, bx: number, by: number): { rock: number; t: number } | null {
  let best: { rock: number; t: number } | null = null;
  const p = s.map.planet, tp = segmentEntry(ax, ay, bx, by, p.x, p.y, p.r);
  if (tp >= 0) best = { rock: -1, t: tp };
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of rocksNear(s, (ax + bx) / 2, (ay + by) / 2, half)) {
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
    if (t >= 0 && (!best || t < best.t)) best = { rock: k, t };   // ascending k: a tie keeps the lower slot (the planet wins ties)
  }
  return best;
}
```

- [ ] **Step 5: Edit `src/renderer/src/sim/tactical/state.ts`**

In `ShipSystems` (after the `magazine`/`magazineClock` member, before the telemetry counters), add:

```ts
  /** Spike ii §6.1: the laser's rock target (a slot, −1 none); the next torpedo's rock target (a slot, −1 none, a single
   *  shot like torpLock); the flying torpedo's rock (a slot, −1 none: today's rules, −2 its rock broke: unguided). §8:
   *  the rocks this ship broke this round (its laser, its torpedo's direct hit or blast, its ram). */
  laserRock: number; torpRock: number; torpRockFlying: number; rocksBroken: number;
```

Replace the last DuelEvent member (`| { kind: 'rock'; what: 'hit' | 'split' | 'shatter'; ... }`) and its comment with:

```ts
  /** Spike ii §8: rock slot `rock` was hit, split (its `pieces`, piece 0 in its own slot), turned to dust (`rock` −1: a
   *  piece that found no slot), was the torpedo's detonation (`blast`: x, y the blast point, r the radius), or took a
   *  damaging contact (`bump`: x, y the contact point; `other` the second rock of a rock-rock contact). `ship`: the ship
   *  whose laser, torpedo or ram caused it (absent for collisions, the planet, the edge and eviction). */
  | { kind: 'rock'; what: 'hit' | 'split' | 'dust' | 'blast' | 'bump'; by: RockCause; rock: number; x: number; y: number; r: number; vx: number; vy: number; ship?: number; pieces?: number[]; other?: number };

/** Spike ii §8: what caused a rock event. */
export type RockCause = 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' | 'edge';
```

In `TacticalState`, replace `rocks: Float64Array; rockHits: number; rockSplits: number; rockShatters: number;` (and its comment) with:

```ts
  /** Spike ii (rocks.ts): the mutable rock pool and its counters (§8), then the per-tick transient masks (§3.1, §3.3: not
   *  hashed, not snapshotted, cleared at the start of every stepDuel tick). */
  rocks: Float64Array; rockHits: number; rockSplits: number; rockDust: number; rockBlasts: number; rockCollisions: number; rockEvictions: number;
  rockBorn: Uint8Array; rockDone: Uint8Array;
```

In `systemsFor`, in the returned object after `magazine: c.slots.missile.magazine, magazineClock: 0,` add `laserRock: -1, torpRock: -1, torpRockFlying: -1, rocksBroken: 0,`. In `emptySystems`, after `magazine: 0, magazineClock: 0,` add `laserRock: 0, torpRock: 0, torpRockFlying: 0, rocksBroken: 0,`.

In `createTacticalState`, replace `rocks: initRocks(map), rockHits: 0, rockSplits: 0, rockShatters: 0,` with:

```ts
rocks: initRocks(map), rockHits: 0, rockSplits: 0, rockDust: 0, rockBlasts: 0, rockCollisions: 0, rockEvictions: 0,
    rockBorn: new Uint8Array(rockCapacity(map)), rockDone: new Uint8Array(rockCapacity(map)),
```

- [ ] **Step 6: Edit `src/renderer/src/sim/tactical/hash.ts`**

1. Line 12: `import { rockCapacity, ROCK_RESERVE, ROCK_STRIDE } from './rocks';`
2. `SYSTEMS_TAIL` (lines 22-23): append the four fields at the end:

```ts
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'freq', 'laserTargeted', 'torpLock', 'torpRoom', 'laserBurst', 'laserBurstClock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost', 'laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken'] as const satisfies readonly (keyof ShipSystems)[];
```

3. Lines 85-89 (the rock pool block) become:

```ts
  // Spike ii (§8): the rock pool and its six counters, last in the space module.
  fields.push(vector('rocks', (asteroids + ROCK_RESERVE) * ROCK_STRIDE, (s) => s.rocks),
    ...(['rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions'] as const).map((k) => scalar<TacticalState>(k, (s) => s[k], (s, v) => { s[k] = v; })));
```

4. `spaceModule.notSnapshotted` (lines 112-116): add two entries:

```ts
    events: 'per-tick events for the views, cleared every tick',
    rockBorn: 'spike ii §3.1: slots written with a new piece this tick; cleared at the start of every stepDuel tick',
    rockDone: 'spike ii §3.3: slots that had their contact turn this tick; cleared at the start of every stepDuel tick'
```

5. `cloneTacticalFromModule` (line 172): after `rocks: new Float64Array(s.rocks.length),` add `rockBorn: new Uint8Array(s.rockBorn.length), rockDone: new Uint8Array(s.rockDone.length),`.
6. `systemsRules` (lines 199-205): give it the pool size and bound the new fields:

```ts
const systemsRules = (slots: number, rocks: number): Readonly<Record<string, (v: number) => boolean>> => ({
  cls: within(0, SHIP_CLASSES.length - 1), target: within(0, slots - 1), hull: (v) => v >= 0 && v <= most((c) => c.hull), rooms: room,
  shields: within(0, most((c) => c.shields.layers) + 1), freq: within(0, 2), shieldClock: count, laserCharge: within(0, most((c) => c.slots.laser.chargeUnits)), laserHold: count,
  fireHeld: flagBit, lock: room, laserTargeted: flagBit, torpLock: within(-1, 2), torpRoom: within(-1, 2), laserBurst: within(0, most((c) => c.slots.laser.shots) - 1), laserBurstClock: within(0, most((c) => c.slots.laser.burstGapTicks)),
  magazine: within(0, most((c) => c.slots.missile.magazine)), magazineClock: count,
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count,
  // Spike ii §6.1, §8: the rock targets name a pool slot (torpRockFlying also −2, its rock broke); the tally is a count.
  laserRock: within(-1, rocks - 1), torpRock: within(-1, rocks - 1), torpRockFlying: within(-2, rocks - 1), rocksBroken: count
});
```

7. `topRules` (line 208): replace `rockHits: count, rockSplits: count, rockShatters: count,` with `rockHits: count, rockSplits: count, rockDust: count, rockBlasts: count, rockCollisions: count, rockEvictions: count,`.
8. `validateTacticalValues` (line 228): `sys = systemsRules(slots, rockCapacity(shape.map))`.

- [ ] **Step 7: Edit `src/renderer/src/sim/tactical/duel.ts`**

Line 9: `import { beginRockTick, stepRocks } from './rocks';`. In `stepDuel`, replace `state.events = [];` with `state.events = []; beginRockTick(state);   // spike ii §3.1: the transient masks start empty every tick`.

- [ ] **Step 8: Update the key guard and spike i's test**

`tests/tacticalDeterminism.test.ts` line 116, systems keys become:

```ts
    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', 'freq', 'hull', 'laserBurst', 'laserBurstClock', 'laserCharge', 'laserHits', 'laserHold', 'laserRock', 'laserTargeted', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'rocksBroken', 'rooms', 'shieldClock', 'shields', 'shots', 'target', 'torpLock', 'torpRock', 'torpRockFlying', 'torpRoom']);
```

Line 117, state keys become:

```ts
    expect(Object.keys(st).sort()).toEqual(['derelict', 'designated', 'events', 'grid', 'hostileAt', 'hunter', 'known', 'map', 'missiles', 'outcome', 'rng', 'rockBlasts', 'rockBorn', 'rockCollisions', 'rockDone', 'rockDust', 'rockEvictions', 'rockHits', 'rockSplits', 'rocks', 'scan', 'seed', 'ships', 'startTick', 'systems', 'tick', 'weakFreq']);
```

Lines 124-125 become:

```ts
    // SPIKE ii: the graceUntil bodies cover the rock pool (asteroids + ROCK_RESERVE); the pool plus 6 counters close the space
    // module; each systems record has 27 scalars (the four rock fields) and the 3 rooms.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 30 + 17);
```

`tests/asteroidSpike.test.ts` line 36: `expect(st.rockShatters).toBe(1);` → `expect(st.rockDust).toBe(1);`.

- [ ] **Step 9: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockPool.test.ts tests/tacticalDeterminism.test.ts tests/asteroidSpike.test.ts tests/duelModules.test.ts tests/ftlTargeting.test.ts`
Expected: typecheck clean; `rockPool`, `tacticalDeterminism`'s key guard, `asteroidSpike` PASS. In `duelModules` and `ftlTargeting` only trajectory-pinned cases may fail (golden-class; Task 10); the module-contract cases ("every TacticalState member is a space or ship field or declared", "every exclusion names a real member") PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/duel.ts tests/rockPool.test.ts tests/tacticalDeterminism.test.ts tests/asteroidSpike.test.ts
git commit -m "feat(spike-ii): rock pool 96 reserve, real hp, masks, rock targets and counters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Breaking: fan and burst patterns, slot use, eviction, target clearing

**Files:**
- Create: `src/renderer/src/sim/tactical/rockBreak.ts`, `src/renderer/src/sim/tactical/rockContacts.ts` (spike i's fragment step, ported; Task 3 replaces it), `tests/helpers/rockArena.ts`, `tests/rockBreak.test.ts`
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append), `src/renderer/src/sim/tactical/rocks.ts` (whole file), `src/renderer/src/sim/tactical/duel.ts:9`, `src/renderer/src/sim/tactical/weapons.ts:6, 126`, `src/renderer/src/sim/tactical/missiles.ts:8, 109-113`, `src/renderer/src/app/duel/duelMode.ts:19, 70`, `scripts/spike-asteroids-measure.ts:73-75`
- Delete: `tests/asteroidSpike.test.ts` (its rules are gone; its hash/clone and firstBlocker cases move here, its broad-phase case to Task 3)

**Interfaces:**
- Consumes: Task 1's `writeRock`, `wakeRock`, masks, `RockCause`, ship-system rock fields.
- Produces (`rockBreak.ts`):
  - `export type BreakPattern = 'fan' | 'burst';`
  - `export const FAN_DIRS: Readonly<Record<2 | 3, readonly (readonly [number, number])[]>>; export const BURST_DIRS: Readonly<Record<4 | 6, readonly (readonly [number, number])[]>>;`
  - `export function pieceCount(r: number, pattern: BreakPattern): 0 | 2 | 3 | 4 | 6;`
  - `export function pieceRadius(r: number, n: number): number;`
  - `export function vacate(s: TacticalState, k: number): void;`
  - `export function dustRock(s: TacticalState, k: number, by: RockCause, ship?: number, evicted?: boolean): void;` (an eviction's dust event carries `evicted: true`)
  - `export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void;`
  - `export function wearRock(s: TacticalState, k: number, dmg: number): boolean;`
  - `export function hitRock(s: TacticalState, k: number, dmg: number, ux: number, uy: number, by: RockCause, ship?: number): void;`
  - `export function breakRock(s: TacticalState, k: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude?: readonly number[]): void;`
  - `rockContacts.ts`: `export function stepRocks(s: TacticalState): void;`
  - `rockTuning.ts`: `ROCK_MIN_R = 8`, `ROCK_FLING = 150`, `ROCK_BLAST_FLING = 200`.
  - `tests/helpers/rockArena.ts`: `arena(seed?)`, `mover(st, k, x, y, vx, vy, r, hp?)`, `seeded(st, k)`, `fillPool(st, r, except?)`, `rockEvents(st, what?)`, `type RockEvent`.

- [ ] **Step 1: Write the test helper** `tests/helpers/rockArena.ts`:

```ts
// Spike ii (billiard asteroids) test rigs: an empty rock arena with the Hunter switched off, rock writers, a full pool,
// and the tick's rock events.
import { createTacticalState, type DuelEvent, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { beginRockTick, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from '../../src/renderer/src/sim/tactical/rocks';

export type RockEvent = Extract<DuelEvent, { kind: 'rock' }>;

/** A tactical state with every rock removed (the seeded grid ignores empty slots), the Hunter switched off (slot 1
 *  inactive) and the crew ship parked at rest at (0, −2500), heading north; a fresh tick's masks. */
export function arena(seed = 5): TacticalState {
  const st = createTacticalState(seed);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: -2500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.ships[1].active = false;
  beginRockTick(st);
  return st;
}
/** A moving (kind 2) rock in slot k. */
export function mover(st: TacticalState, k: number, x: number, y: number, vx: number, vy: number, r: number, hp = rockHp(r)): void {
  writeRock(st, k, RockKind.Moving, x, y, vx, vy, r, hp);
}
/** Seeded asteroid k back in its own slot as a static rock at full hp (the grid indexes it there). */
export function seeded(st: TacticalState, k: number): void {
  const a = st.map.asteroids[k]!;
  writeRock(st, k, RockKind.Static, a.x, a.y, 0, 0, a.r, rockHp(a.r));
}
/** Every empty slot (but `except`) gets a moving rock of radius r on a far grid, x −2000..1800, y −1600..200. */
export function fillPool(st: TacticalState, r: number, except: readonly number[] = []): void {
  for (let k = 0; k < rockSlots(st); k++)
    if (st.rocks[k * ROCK_STRIDE] === RockKind.Gone && !except.includes(k)) mover(st, k, -2000 + (k % 20) * 200, -1600 + Math.floor(k / 20) * 200, 0, 0, r);
}
/** This tick's rock events, optionally of one kind. */
export function rockEvents(st: TacticalState, what?: RockEvent['what']): RockEvent[] {
  return st.events.filter((e): e is RockEvent => e.kind === 'rock' && (what === undefined || e.what === what));
}
```

- [ ] **Step 2: Write the failing test** `tests/rockBreak.test.ts`:

```ts
// Spike ii §3.4, §3.5, §6.1: breaking (the fan and the burst), slot use and eviction, dust, damage and push, and a rock
// target clearing itself; with spike i's hash/clone and firstBlocker cases.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { firstBlocker, rockAlive, rockAt, rockBorn, RockKind } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, dustRock, hitRock, pieceCount, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { arena, fillPool, mover, rockEvents, seeded } from './helpers/rockArena';

const deg = (a: number): number => (a * Math.PI) / 180;

describe('the fan (laser, blast-secondary, collision, ram; spec §3.4)', () => {
  it('r 42 gives 3 pieces, r 30 gives 2, r 20 dust; each 0.9 r / √n at hp ceil(rp / 10), fanned across the 120° ahead at 150 u/s plus the parent', () => {
    for (const [r, n] of [[42, 3], [30, 2], [20, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 10, 0, r);
      breakRock(st, 100, 1, 0, 'laser', 0, 'fan');
      expect(pieceCount(r, 'fan')).toBe(n);
      expect(st.systems[0].rocksBroken, `r ${r}`).toBe(1);
      if (n === 0) {
        expect(rockEvents(st, 'split')).toEqual([]);
        expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0, r, x: 0, y: 2000, vx: 10, vy: 0 }]);
        expect(rockAlive(st, 100)).toBe(false);
        continue;
      }
      const pieces = rockEvents(st, 'split')[0]!.pieces!, rp = (0.9 * r) / Math.sqrt(n), angles = n === 2 ? [-30, 30] : [-40, 0, 40];
      expect(pieces).toHaveLength(n);
      expect(pieces[0]).toBe(100);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg(angles[j]!);
        expect(p.kind).toBe(RockKind.Moving);
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.hp).toBe(Math.ceil(rp / 10));
        expect(p.x).toBeCloseTo(0.6 * r * Math.cos(a), 9);
        expect(p.y).toBeCloseTo(2000 + 0.6 * r * Math.sin(a), 9);
        expect(p.vx).toBeCloseTo(10 + 150 * Math.cos(a), 9);
        expect(p.vy).toBeCloseTo(150 * Math.sin(a), 9);
        expect(rockBorn(st, slot)).toBe(true);
      });
      expect(n * rp * rp).toBeLessThanOrEqual(r * r);   // total piece area ≤ the parent's
    }
  });
  it('a zero hit direction is north', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 42);
    breakRock(st, 100, 0, 0, 'ram', 0, 'fan');
    const p = rockAt(st, 100);
    expect(p.vx).toBeCloseTo(-150 * Math.sin(deg(40)), 9);   // piece 0 at −40° from north (anticlockwise on the y-down map): (−sin 40°, −cos 40°)
    expect(p.vy).toBeCloseTo(-150 * Math.cos(deg(40)), 9);
  });
});

describe('the burst (a torpedo direct hit; spec §3.4)', () => {
  it('r 50 and r 35 give 6 pieces, r 30 gives 4, r 20 dust; a full circle from u, one piece straight on, 200 u/s plus the parent', () => {
    for (const [r, n] of [[50, 6], [35, 6], [30, 4], [20, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 0, 0, r);
      breakRock(st, 100, 0, -3, 'torpedo', 0, 'burst');   // u north (any length)
      expect(pieceCount(r, 'burst')).toBe(n);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0 }]); continue; }
      const pieces = rockEvents(st, 'split')[0]!.pieces!, rp = (0.9 * r) / Math.sqrt(n);
      expect(pieces).toHaveLength(n);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg((360 * j) / n);   // from u = (0, −1): (sin θ, −cos θ)
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.x).toBeCloseTo(0.6 * r * Math.sin(a), 9);
        expect(p.y).toBeCloseTo(2000 - 0.6 * r * Math.cos(a), 9);
        expect(p.vx).toBeCloseTo(200 * Math.sin(a), 9);
        expect(p.vy).toBeCloseTo(-200 * Math.cos(a), 9);
      });
      expect(rockAt(st, pieces[0]!).vy).toBeCloseTo(-200, 9);   // one piece flies straight on
      expect(n * rp * rp).toBeLessThanOrEqual(r * r);
    }
  });
});

describe('slot use and eviction (spec §3.4)', () => {
  it('piece 0 keeps the slot; the others take the lowest empty slots, ascending', () => {
    const st = arena();
    for (const k of [0, 1, 3, 4]) mover(st, k, -2000 + 200 * k, -1000, 0, 0, 10);
    mover(st, 100, 0, 2000, 0, 0, 42);
    breakRock(st, 100, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([100, 2, 5]);
  });
  it('with no free slot it evicts the smallest moving rock smaller than the piece (ties: lowest slot), never a born or excluded one', () => {
    for (const [exclude, evicted] of [[[40], 60], [[], 40]] as const) {
      const st = arena();
      mover(st, 0, 0, 2000, 0, 0, 30);
      fillPool(st, 9);
      mover(st, 60, -2000, 1000, 0, 0, 8.5); mover(st, 40, -1800, 1000, 0, 0, 8.5); mover(st, 20, -1600, 1000, 0, 0, 8.2);
      st.rockBorn[20] = 1;
      breakRock(st, 0, 1, 0, 'collision', -1, 'fan', exclude);   // r 30: 2 pieces of 19.09
      expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, evicted]);
      expect(st.rockEvictions).toBe(1);
      const dust = rockEvents(st, 'dust');
      expect(dust).toMatchObject([{ rock: evicted, by: 'collision', r: 8.5, evicted: true }]);
      expect(dust[0]).not.toHaveProperty('ship');
      expect(rockAt(st, evicted).r).toBeCloseTo((0.9 * 30) / Math.SQRT2, 12);
    }
  });
  it('with nothing smaller the piece is dust with an event (rock −1), and the break still counts once', () => {
    const st = arena();
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 30);
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0]);
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: -1, by: 'laser', ship: 0 }]);
    expect(rockEvents(st, 'dust')[0]!.r).toBeCloseTo((0.9 * 30) / Math.SQRT2, 12);
    expect([st.rockDust, st.rockSplits, st.rockEvictions, st.systems[0].rocksBroken]).toEqual([1, 1, 0, 1]);
  });
});

describe('a rock target clears itself (spec §6.1)', () => {
  it('when its rock breaks: laser and torpedo targets to −1, a flying torpedo\'s to −2; an inactive ship\'s record is left alone', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 0, 0, 2000, 0, 0, 30);
    s.laserRock = 0; s.torpRock = 0; s.torpRockFlying = 0; st.systems[1].laserRock = 0;
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect([s.laserRock, s.torpRock, s.torpRockFlying, st.systems[1].laserRock]).toEqual([-1, -1, -2, 0]);
  });
  it('when its slot is evicted and reused for a piece', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 9);
    mover(st, 7, -1000, 1000, 0, 0, 8);
    s.laserRock = 7; s.torpRock = 7; s.torpRockFlying = 7;
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, 7]);
    expect([s.laserRock, s.torpRock, s.torpRockFlying]).toEqual([-1, -1, -2]);
  });
});

describe('damage, push and dust (spec §3.4, §3.5)', () => {
  it('hitRock takes hp, emits a hit and counts it; at hp ≤ 0 it fan-breaks; a born or empty slot takes nothing', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 30, 3);
    hitRock(st, 100, 2, 1, 0, 'laser', 0);
    expect(rockAt(st, 100).hp).toBe(1);
    expect(rockEvents(st, 'hit')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]);
    hitRock(st, 100, 1.5, 1, 0, 'laser', 0);   // −0.5: breaks into 2
    const piece = rockEvents(st, 'split')[0]!.pieces![1]!, hp = rockAt(st, piece).hp, vx = rockAt(st, piece).vx;
    hitRock(st, piece, 99, 1, 0, 'laser', 0);
    pushRock(st, piece, 50, 0);
    expect([rockAt(st, piece).hp, rockAt(st, piece).vx]).toEqual([hp, vx]);
    hitRock(st, 150, 5, 1, 0, 'laser', 0);
    expect(st.rockHits).toBe(2);
  });
  it('pushRock wakes a static rock and adds Δv; dustRock clears the slot with a dust event', () => {
    const st = arena();
    seeded(st, 0);
    pushRock(st, 0, 3, 4);
    expect(rockAt(st, 0)).toMatchObject({ kind: RockKind.Moving, vx: 3, vy: 4 });
    dustRock(st, 0, 'edge');
    expect(rockAlive(st, 0)).toBe(false);
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 0, by: 'edge', vx: 3, vy: 4 }]);
    expect(rockEvents(st, 'dust')[0]).not.toHaveProperty('ship');
    expect(st.rockDust).toBe(1);
  });
});

describe('spike i cases kept: the hash, the clone and firstBlocker', () => {
  it('a chipped rock changes the hash, and a clone runs on identically', () => {
    const a = createTacticalState(5), b = createTacticalState(5);
    hitRock(b, 0, 1, 1, 0, 'laser');
    expect(hashTactical(a)).not.toBe(hashTactical(b));
    const k = a.map.asteroids.findIndex((r) => r.r >= 40);
    breakRock(a, k, 0, -1, 'laser', 0, 'fan');
    const c = cloneTactical(a);
    expect(c.rocks).not.toBe(a.rocks);
    for (let t = 0; t < 600; t++) { stepDuel(a, IDLE_INPUT); stepDuel(c, IDLE_INPUT); }
    expect(hashTactical(c)).toBe(hashTactical(a));
  });
  it('firstBlocker finds the nearest rock along a segment', () => {
    const st = createTacticalState(5), a = rockAt(st, 0);
    const hit = firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y);
    expect(hit?.rock).toBe(0);
    expect(hit!.t).toBeCloseTo((200 - a.r) / 400, 9);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/rockBreak.test.ts`
Expected: FAIL (`rockBreak` module not found).

- [ ] **Step 4: Append to `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts

/** §3.4: a piece under this radius is dust instead. */
export const ROCK_MIN_R = 8;
/** §3.4: the fan pattern's piece speed (laser, blast-secondary, collision or ram break), u/s, on top of the parent's velocity. */
export const ROCK_FLING = 150;
/** §3.4: the burst pattern's piece speed (a torpedo's direct hit), u/s, on top of the parent's velocity. */
export const ROCK_BLAST_FLING = 200;
```

- [ ] **Step 5: Create `src/renderer/src/sim/tactical/rockBreak.ts`**

```ts
// Spike ii §3.4, §3.5, §6.1 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): how a rock takes a hit, a push,
// turns to dust and breaks. A break's pieces fan across the 120° ahead of the hit direction (laser, blast-secondary,
// collision, ram) or burst in a full circle (a torpedo's direct hit). Directions come from literal cos/sin tables
// rotated onto the hit direction by multiplication (the determinism guard allows no trigonometry). Piece 0 keeps the
// broken rock's slot, the others take the lowest empty slots, else evict the smallest moving rock smaller than the
// piece that is not born this tick and not a body of the contact being resolved, else the piece is dust. Every slot
// cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage, push or break.
import { ROCK_BLAST_FLING, ROCK_FLING, ROCK_MIN_R } from './rockTuning';
import { rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, wakeRock, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'fan' | 'burst';
const C30 = 0.8660254037844386, C40 = 0.766044443118978, S40 = 0.6427876096865393, S60 = 0.8660254037844386;
/** The fan's piece directions as (cos θ, sin θ) of the turn from the hit direction, piece 0 first: θk = −60° + 120°(k + ½)/n
 *  (2 pieces ±30°, 3 pieces −40°, 0°, +40°; θ clockwise on the y-down map). */
export const FAN_DIRS: Readonly<Record<2 | 3, readonly (readonly [number, number])[]>> = {
  2: [[C30, -0.5], [C30, 0.5]],
  3: [[C40, -S40], [1, 0], [C40, S40]]
};
/** The burst's: θk = 360° · k / n from the hit direction, so piece 0 flies straight on. */
export const BURST_DIRS: Readonly<Record<4 | 6, readonly (readonly [number, number])[]>> = {
  4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  6: [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]]
};

/** §3.4: the pieces a break of a rock of radius r makes (0: dust). */
export function pieceCount(r: number, pattern: BreakPattern): 0 | 2 | 3 | 4 | 6 {
  if (pattern === 'fan') return r >= 40 ? 3 : r >= 25 ? 2 : 0;
  return r >= 35 ? 6 : r >= 25 ? 4 : 0;
}
/** §3.4: a piece's radius, 0.9 r / √n. */
export function pieceRadius(r: number, n: number): number { return (0.9 * r) / Math.sqrt(n); }

/** Clear slot k and every active ship's rock target that names it (§6.1: laser and torpedo to −1, a flying torpedo's to −2). */
export function vacate(s: TacticalState, k: number): void {
  s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE);
  s.systems.forEach((sys, i) => {
    if (!s.ships[i]!.active) return;   // an inactive slot's record holds zeros, and keeps them
    if (sys.laserRock === k) sys.laserRock = -1;
    if (sys.torpRock === k) sys.torpRock = -1;
    if (sys.torpRockFlying === k) sys.torpRockFlying = -2;
  });
}
const shipField = (ship: number): { ship?: number } => (ship >= 0 ? { ship } : {});

/** §3.5: rock k turns to dust: a dust event with its position, radius and velocity, then the slot is vacated. Not a break. */
export function dustRock(s: TacticalState, k: number, by: RockCause, ship = -1, evicted = false): void {
  const a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'dust', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship), ...(evicted ? { evicted: true as const } : {}) });
  s.rockDust++;
  vacate(s, k);
}
/** §3.1, §4: add (dvx, dvy) to rock k's velocity, waking a static rock (a push always wakes it). Born or gone: nothing. */
export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  wakeRock(s, k);
  const b = k * ROCK_STRIDE;
  s.rocks[b + 3]! += dvx; s.rocks[b + 4]! += dvy;
}
/** Take dmg off rock k's hp (born or gone: nothing, false); true when it is now at or below 0 (the caller breaks it). */
export function wearRock(s: TacticalState, k: number, dmg: number): boolean {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return false;
  const b = k * ROCK_STRIDE + 6;
  s.rocks[b]! -= dmg;
  return s.rocks[b]! <= 0;
}
/** A weapon's hit (§4.1, §4.2): wear, a hit event (rockHits + 1), and at hp ≤ 0 a fan break along (ux, uy). */
export function hitRock(s: TacticalState, k: number, dmg: number, ux: number, uy: number, by: RockCause, ship = -1): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const broke = wearRock(s, k, dmg), a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship) });
  s.rockHits++;
  if (broke) breakRock(s, k, ux, uy, by, ship, 'fan');
}

/** §3.4: a slot for a new piece of radius rp: the lowest empty one, else evict (rockEvictions + 1, a dust event without a
 *  ship) the smallest moving rock smaller than rp that is not born and not in `exclude` (ties: the lowest slot), else −1. */
function allocate(s: TacticalState, rp: number, exclude: readonly number[], by: RockCause): number {
  const v = s.rocks, n = rockSlots(s);
  for (let j = 0; j < n; j++) if (v[j * ROCK_STRIDE] === RockKind.Gone) return j;
  let best = -1;
  for (let j = 0; j < n; j++) {
    const b = j * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving || s.rockBorn[j] === 1 || exclude.includes(j) || v[b + 5]! >= rp) continue;
    if (best < 0 || v[b + 5]! < v[best * ROCK_STRIDE + 5]!) best = j;
  }
  if (best < 0) return -1;
  s.rockEvictions++;
  dustRock(s, best, by, -1, true);   // eviction: not a break (the views and the feel proxy skip `evicted` dust)
  return best;
}

/**
 * §3.4: rock k breaks, its hit direction (ux, uy) (need not be unit; zero: north), its cause and ship (−1 none) and the
 * pattern. rocksBroken + 1 for `ship`, once. Too small for pieces (or pieces under ROCK_MIN_R): dust. Otherwise piece j
 * starts at centre + dir · 0.6 r with the parent's velocity plus dir · the pattern's speed, radius 0.9 r / √n, hp
 * ceil(rp / 10), kind 2, born, with fresh contact grace; then one split event naming the slots written.
 */
export function breakRock(s: TacticalState, k: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), n = pieceCount(a.r, pattern), rp = n > 0 ? pieceRadius(a.r, n) : 0;
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (n === 0 || rp < ROCK_MIN_R) { dustRock(s, k, by, ship); return; }
  const d = Math.sqrt(ux * ux + uy * uy), hx = d > 0 ? ux / d : 0, hy = d > 0 ? uy / d : -1;
  const dirs = pattern === 'fan' ? FAN_DIRS[n as 2 | 3] : BURST_DIRS[n as 4 | 6], speed = pattern === 'fan' ? ROCK_FLING : ROCK_BLAST_FLING;
  const off = 0.6 * a.r, pieces: number[] = [];
  vacate(s, k);
  dirs.forEach(([c, sn], j) => {
    const dx = hx * c - hy * sn, dy = hx * sn + hy * c;
    const px = a.x + dx * off, py = a.y + dy * off, vx = a.vx + dx * speed, vy = a.vy + dy * speed;
    const slot = j === 0 ? k : allocate(s, rp, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: px, y: py, r: rp, vx, vy, ...shipField(ship) });
      s.rockDust++;
      return;
    }
    writeRock(s, slot, RockKind.Moving, px, py, vx, vy, rp, rockHp(rp));
    s.rockBorn[slot] = 1;
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    pieces.push(slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces, ...shipField(ship) });
}
```

- [ ] **Step 6: Replace `src/renderer/src/sim/tactical/rocks.ts`** with the pool basics only (spike i's break and fragment code leaves; three spike i numbers stay until Tasks 4 and 5):

```ts
// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md), on spike i's pool: the map's
// asteroids as rock bodies. `state.rocks` is a fixed-capacity pool, ROCK_STRIDE values per slot: kind (0 gone, 1 static,
// 2 moving), x, y, vx, vy, r, hp (a real number). Slots 0 .. n − 1 start as the seeded map's asteroids (index for index);
// the ROCK_RESERVE slots after them start empty. Static becomes moving, never the reverse (§3.1).
// Broad phase: the seeded grid (grid.ts) is never rebuilt. It indexes slots 0 .. n − 1 at their seeded footprints, and a
// static rock never moves, so a grid hit counts only while its slot still holds a static rock; moving rocks are found by
// a linear scan. rocksNear merges both, ascending, so every caller still meets rocks in one fixed slot order.
// Two per-tick transient masks sit beside the pool (§3.1, §3.3): `rockBorn` (slots written with a new piece this tick)
// and `rockDone` (slots that had their contact turn this tick); not hashed, cleared at the start of every stepDuel tick.
// Breaking is rockBreak.ts, motion and rock-rock contacts rockContacts.ts, every number rockTuning.ts.
import { queryGrid } from './grid';
import type { MapDef } from './map';
import { ROCK_HP_PER, ROCK_WAKE_SPEED } from './rockTuning';
import type { TacticalState } from './state';
export type { RockCause } from './state';

export const ROCK_STRIDE = 7;
export const RockKind = { Gone: 0, Static: 1, Moving: 2 } as const;
/** §3.1: spare slots for pieces. */
export const ROCK_RESERVE = 96;
/** Spike i's numbers still in use until their rules are replaced: the laser's and AUTO_DIG (Task 4), the torpedo's (Task 5). */
export const LASER_ROCK_DAMAGE = 1;
export const TORPEDO_ROCK_DAMAGE = 4;
export const AUTO_DIG = true;

/** The pool's capacity for a map: its asteroids plus the reserve. Also the number of rock bodies in a ship's graceUntil. */
export function rockCapacity(map: MapDef): number { return map.asteroids.length + ROCK_RESERVE; }
/** §3.1: the hp a rock of radius r is born with. */
export function rockHp(r: number): number { return Math.ceil(r / ROCK_HP_PER); }
/** §3.1: the cracks read hp / hpMax, with hpMax recomputed from r. */
export const rockHpMax = rockHp;
/** §3.1: a rock's mass, r² (no unit). */
export function rockMass(r: number): number { return r * r; }

export function initRocks(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * ROCK_STRIDE);
  map.asteroids.forEach((a, k) => { out.set([RockKind.Static, a.x, a.y, 0, 0, a.r, rockHp(a.r)], k * ROCK_STRIDE); });
  return out;
}

export const rockKind = (s: TacticalState, k: number): number => s.rocks[k * ROCK_STRIDE]!;
export const rockAlive = (s: TacticalState, k: number): boolean => s.rocks[k * ROCK_STRIDE]! !== RockKind.Gone;
export interface RockView { x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: number }
export function rockAt(s: TacticalState, k: number): RockView {
  const b = k * ROCK_STRIDE, v = s.rocks;
  return { kind: v[b]!, x: v[b + 1]!, y: v[b + 2]!, vx: v[b + 3]!, vy: v[b + 4]!, r: v[b + 5]!, hp: v[b + 6]! };
}
export function rockSlots(s: TacticalState): number { return s.rocks.length / ROCK_STRIDE; }

/** §3.1: whether a contact closing at vc wakes a static rock. */
export function wakesAt(vc: number): boolean { return vc > ROCK_WAKE_SPEED; }
/** §3.1: a static rock becomes moving for good (its velocity is still 0); any other kind is left alone. */
export function wakeRock(s: TacticalState, k: number): void { if (s.rocks[k * ROCK_STRIDE] === RockKind.Static) s.rocks[k * ROCK_STRIDE] = RockKind.Moving; }
/** §3.1, §3.3: the start of a tick: both transient masks cleared (made again at the pool's size if it changed). */
export function beginRockTick(s: TacticalState): void {
  const n = rockSlots(s);
  if (s.rockBorn.length !== n || s.rockDone.length !== n) { s.rockBorn = new Uint8Array(n); s.rockDone = new Uint8Array(n); return; }
  s.rockBorn.fill(0); s.rockDone.fill(0);
}
/** §3.1: whether slot k was written with a new piece this tick. */
export function rockBorn(s: TacticalState, k: number): boolean { return s.rockBorn[k] === 1; }

/** Slots of every live rock whose bounding box may overlap the square around (x, y) of half-size h, ascending, no repeats. */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (const k of queryGrid(s.grid, x, y, h)) if (v[k * ROCK_STRIDE] === RockKind.Static) out.push(k);
  let moving = false;
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const r = v[b + 5]!;
    if (Math.abs(v[b + 1]! - x) <= h + r && Math.abs(v[b + 2]! - y) <= h + r) { out.push(k); moving = true; }
  }
  if (moving) out.sort((a, b) => a - b);
  return out;
}

/** Write slot k's seven values. */
export function writeRock(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number): void {
  s.rocks.set([kind, x, y, vx, vy, r, hp], k * ROCK_STRIDE);
}

/** Where the segment a → b first enters circle (cx, cy, r), as t in [0, 1], or −1 when it never does. Starting inside is 0. */
export function segmentEntry(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const ex = bx - ax, ey = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  const a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const bb = fx * ex + fy * ey, disc = bb * bb - a * c;
  if (disc < 0 || bb > 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

/** The first solid body along a → b: the planet (−1), a rock slot (≥ 0), or null; with the entry t. */
export function firstBlocker(s: TacticalState, ax: number, ay: number, bx: number, by: number): { rock: number; t: number } | null {
  let best: { rock: number; t: number } | null = null;
  const p = s.map.planet, tp = segmentEntry(ax, ay, bx, by, p.x, p.y, p.r);
  if (tp >= 0) best = { rock: -1, t: tp };
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of rocksNear(s, (ax + bx) / 2, (ay + by) / 2, half)) {
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
    if (t >= 0 && (!best || t < best.t)) best = { rock: k, t };   // ascending k: a tie keeps the lower slot (the planet wins ties)
  }
  return best;
}
```

- [ ] **Step 7: Create `src/renderer/src/sim/tactical/rockContacts.ts`** (spike i's fragment step on the new calls; Task 3 replaces the whole file):

```ts
// Spike ii: the moving rocks' turn in stepDuel. This is spike i's fragment step carried over onto the new dust and hit
// calls (spec §3.5, §3.4); Task 3 of the plan replaces it with §3.2's motion and §3.3's rock-rock contacts.
import { gravityAccel } from './physics';
import { dustRock, hitRock } from './rockBreak';
import { rockAt, RockKind, rocksNear, ROCK_STRIDE } from './rocks';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

const FRAGMENT_ROCK_DAMAGE = 1;
function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

export function stepRocks(s: TacticalState): void {
  const v = s.rocks, movers: number[] = [];
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) if (v[k * ROCK_STRIDE] === RockKind.Moving) movers.push(k);
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    v[b + 3]! += gx * DT; v[b + 4]! += gy * DT;
    v[b + 1]! += v[b + 3]! * DT; v[b + 2]! += v[b + 4]! * DT;
  }
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, p = s.map.planet, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) { dustRock(s, k, planet ? 'planet' : 'edge'); continue; }
    for (const j of rocksNear(s, x, y, r)) {
      if (j === k) continue;
      const o = rockAt(s, j);
      if (!touching(x, y, r, o.x, o.y, o.r)) continue;
      const vx = v[b + 3]!, vy = v[b + 4]!;
      dustRock(s, k, 'collision');
      hitRock(s, j, FRAGMENT_ROCK_DAMAGE, vx - o.vx, vy - o.vy, 'collision');
      break;
    }
  }
}
```

- [ ] **Step 8: Point the callers at the new functions**

- `src/renderer/src/sim/tactical/duel.ts` line 9: `import { beginRockTick } from './rocks';` plus a new line `import { stepRocks } from './rockContacts';`.
- `src/renderer/src/sim/tactical/weapons.ts` line 6: `import { AUTO_DIG, firstBlocker, LASER_ROCK_DAMAGE } from './rocks';` plus a new line `import { hitRock } from './rockBreak';`. Line 126: `damageRock(state, r.rock, LASER_ROCK_DAMAGE, r.x - a.x, r.y - a.y, 'laser');` → `hitRock(state, r.rock, LASER_ROCK_DAMAGE, r.x - a.x, r.y - a.y, 'laser', i);`.
- `src/renderer/src/sim/tactical/missiles.ts` line 8: `import { rockAt, rocksNear, TORPEDO_ROCK_DAMAGE } from './rocks';` plus `import { hitRock } from './rockBreak';`. Line 112 (the torpedo-rock block, L109-113): `damageRock(state, rock, TORPEDO_ROCK_DAMAGE, mvx, mvy, 'torpedo');` → `hitRock(state, rock, TORPEDO_ROCK_DAMAGE, mvx, mvy, 'torpedo', m.owner);`.
- `src/renderer/src/app/duel/duelMode.ts` line 19: `import { rockAt, rockSlots } from '../../sim/tactical/rocks';` plus `import { hitRock } from '../../sim/tactical/rockBreak';`. Line 70: `... = { duel: () => runtime.duel, rockAt, hitRock, rockSlots };`.
- `scripts/spike-asteroids-measure.ts` lines 73-75: replace the `require` line and the `damageRock` call with:

```ts
    const mod = require('../src/renderer/src/sim/tactical/rockBreak') as typeof import('../src/renderer/src/sim/tactical/rockBreak');
    let broken = 0;
    for (let k = 0; k < d.tactical.map.asteroids.length && broken < 5; k++) if (rk[k * 7] === 1 && rk[k * 7 + 5]! >= 30) { mod.hitRock(d.tactical, k, 99, 1, 0, 'laser'); broken++; }
```

- Delete spike i's test: `git rm tests/asteroidSpike.test.ts`.

- [ ] **Step 9: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockBreak.test.ts tests/rockPool.test.ts tests/tacticalWeapons.test.ts tests/boundary.test.ts`
Expected: all PASS (the laser still does spike i's 1 damage until Task 4; `boundary.test.ts` covers `rockBreak.ts` and `rockContacts.ts`).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/app/duel/duelMode.ts scripts/spike-asteroids-measure.ts tests/helpers/rockArena.ts tests/rockBreak.test.ts tests/asteroidSpike.test.ts
git commit -m "feat(spike-ii): fan and burst breaks, slot use and eviction, rock targets clear themselves" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Motion and rock-on-rock contacts (`stepRocks` parts 1 and 2)

**Files:**
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append), `src/renderer/src/sim/tactical/rockBreak.ts` (append `crushDamage`), `src/renderer/src/sim/tactical/rockContacts.ts` (whole file)
- Test: `tests/rockContacts.test.ts`

**Interfaces:**
- Consumes: Task 2's `breakRock`, `dustRock`, `wearRock`; Task 1's `wakeRock`, `wakesAt`, `rockMass`, masks.
- Produces:
  - `rockTuning.ts`: `ROCK_GRAVITY = 1.0`, `ROCK_DRAG = 0.1`, `ROCK_MAX_SPEED = 300`, `ROCK_RESTITUTION = 0.8`, `ROCK_CRUSH_SPEED = 30`, `ROCK_CRUSH_STEP = 40`.
  - `rockBreak.ts`: `export function crushDamage(vc: number, own: number, other: number): number;` (`(vc − 30)/40 · 2·other/(own + other)` above 30, else 0).
  - `rockContacts.ts`: `export function stepRocks(s: TacticalState): void; export function resolveRockPair(s: TacticalState, a: number, b: number): void;`

- [ ] **Step 1: Write the failing test** `tests/rockContacts.test.ts`:

```ts
// Spike ii §3.2, §3.3, §9.2, §9.3: rock motion (gravity, drag, the speed cap, born rocks hold), the planet and the edge,
// rock-rock pairs (momentum, the crush threshold, the lighter takes more, a static rock that does not wake, a pair once
// per tick, a rock woken later in the pass takes its turn), and the broad phase against brute force while rocks move.
import { describe, expect, it } from 'vitest';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { rockAlive, rockAt, RockKind, rockKind, rocksNear, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, crushDamage, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { resolveRockPair, stepRocks } from '../src/renderer/src/sim/tactical/rockContacts';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';

const momentum = (st: ReturnType<typeof arena>, ks: number[]): [number, number] => ks.reduce<[number, number]>((p, k) => { const a = rockAt(st, k), m = a.r * a.r; return [p[0] + m * a.vx, p[1] + m * a.vy]; }, [0, 0]);

describe('motion (spec §3.2)', () => {
  it('gravity, then drag, then the 300 u/s cap, then semi-implicit Euler; a rock born this tick does not move', () => {
    const st = arena();
    mover(st, 100, 2000, 0, 400, 0, 10);
    mover(st, 101, -2000, 0, 100, 0, 10);
    mover(st, 102, 0, 2000, 50, 0, 10); st.rockBorn[102] = 1;
    stepRocks(st);
    expect(rockAt(st, 100).vx).toBeCloseTo(300, 9);
    expect(rockAt(st, 100).vy).toBeCloseTo(0, 12);
    expect(rockAt(st, 100).x).toBeCloseTo(2000 + 300 * DT, 9);
    const [gx] = gravityAccel(-2000, 0);
    expect(rockAt(st, 101).vx).toBeCloseTo((100 + gx * DT) * (1 - 0.1 * DT), 12);
    expect(rockAt(st, 102)).toMatchObject({ x: 0, y: 2000, vx: 50, vy: 0 });
  });
  it('a rock touching the planet, or whose centre leaves the map, turns to dust', () => {
    const st = arena();
    mover(st, 100, 0, -85, 0, 0, 20);
    mover(st, 101, 2810, 0, 0, 0, 10);
    stepRocks(st);
    expect([rockAlive(st, 100), rockAlive(st, 101)]).toEqual([false, false]);
    expect(rockEvents(st, 'dust').map((e) => [e.rock, e.by])).toEqual([[100, 'planet'], [101, 'edge']]);
  });
});

describe('rock-rock pairs (spec §3.3)', () => {
  it('conserve momentum along n (and as a vector) within 1e-9 relative', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 50, 10, 20, 10); mover(st, 101, 35, 2005, -40, 0, 30, 10);
    const dx = 0 - 35, dy = 2000 - 2005, d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
    const [px, py] = momentum(st, [100, 101]);
    resolveRockPair(st, 100, 101);
    const [qx, qy] = momentum(st, [100, 101]);
    expect(Math.abs(qx * nx + qy * ny - (px * nx + py * ny))).toBeLessThanOrEqual(1e-9 * Math.abs(px * nx + py * ny));
    expect(Math.abs(qx - px)).toBeLessThanOrEqual(1e-9 * Math.abs(px));
    expect(Math.abs(qy - py)).toBeLessThanOrEqual(1e-9 * Math.abs(py));
    expect(Math.hypot(rockAt(st, 100).x - rockAt(st, 101).x, rockAt(st, 100).y - rockAt(st, 101).y)).toBeCloseTo(50, 9);   // separated
  });
  it('do no damage at a closing speed of 30 (but bounce with restitution 0.8)', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 39, 2000, -30, 0, 20, 10);
    resolveRockPair(st, 100, 101);
    expect([rockAt(st, 100).hp, rockAt(st, 101).hp, st.rockCollisions]).toEqual([10, 10, 0]);
    expect(rockEvents(st, 'bump')).toEqual([]);
    expect(rockAt(st, 100).vx).toBeCloseTo(-27, 9);
    expect(rockAt(st, 101).vx).toBeCloseTo(-3, 9);
  });
  it('above 30 the lighter rock takes more: base (vc − 30) / 40 shared by 2·m_other / (ma + mb)', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 59, 2000, -110, 0, 40, 10);
    resolveRockPair(st, 100, 101);
    expect(rockAt(st, 100).hp).toBeCloseTo(10 - 3.2, 12);
    expect(rockAt(st, 101).hp).toBeCloseTo(10 - 0.8, 12);
    expect([crushDamage(110, 400, 1600), crushDamage(110, 1600, 400), crushDamage(30, 400, 400)]).toEqual([3.2, 0.8, 0]);
    expect(rockEvents(st, 'bump')).toMatchObject([{ by: 'collision', rock: 100, other: 101 }]);
    expect(rockEvents(st, 'bump')[0]).not.toHaveProperty('ship');
    expect(st.rockCollisions).toBe(1);
  });
  it('apply both amounts before any break; a breaks first, then b, along n and −n', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 100, 0, 30, 1); mover(st, 101, 59, 2000, -100, 0, 30, 1);
    resolveRockPair(st, 100, 101);
    expect(rockEvents(st).map((e) => `${e.what}:${e.rock}`)).toEqual(['bump:100', 'split:100', 'split:101']);
    const [a, b] = rockEvents(st, 'split');
    expect(rockAt(st, a!.pieces![0]!).vx).toBeLessThan(0);   // a's pieces fly away from b (n points from b to a: west)
    expect(rockAt(st, b!.pieces![0]!).vx).toBeGreaterThan(0);
    expect(a!.vx).toBeCloseTo(-80, 9);   // the parent velocity is the post-bounce one
  });
  it('a static rock touched at vc ≤ 40 stays static and does not move; above 40 it wakes and takes the impulse', () => {
    for (const [speed, wakes] of [[40, false], [41, true]] as const) {
      const st = arena();
      seeded(st, 0);
      const a0 = st.map.asteroids[0]!, before = rockAt(st, 0);
      mover(st, 100, a0.x - (a0.r + 10) + 1, a0.y, speed, 0, 10, 10);
      resolveRockPair(st, 100, 0);
      if (wakes) { expect(rockKind(st, 0)).toBe(RockKind.Moving); expect(rockAt(st, 0).vx).toBeGreaterThan(0); continue; }
      const after = rockAt(st, 0);
      expect([after.kind, after.x, after.y, after.vx, after.vy]).toEqual([RockKind.Static, before.x, before.y, 0, 0]);
      expect(after.hp).toBeLessThan(before.hp);   // cracked (vc 40 > 30), never moved
      expect(rockAt(st, 100).vx).toBeCloseTo(-32, 9);   // all of the bounce to the mover
    }
  });
  it('a pair is resolved once per tick', () => {
    const st = arena();
    mover(st, 100, -30, 2000, 60, 0, 20, 10); mover(st, 101, 5, 2000, -60, 0, 20, 10);
    stepRocks(st);
    expect(rockEvents(st, 'bump')).toHaveLength(1);
    expect(st.rockCollisions).toBe(1);
    expect([st.rockDone[100], st.rockDone[101]]).toEqual([1, 1]);
  });
  it('a static rock woken at a higher slot takes its own turn in the same pass', () => {
    const st = arena();
    seeded(st, 5);
    const a5 = st.map.asteroids[5]!;
    mover(st, 2, a5.x - (a5.r + 10) + 3, a5.y, 100, 0, 10, 10);
    stepRocks(st);
    expect(rockKind(st, 5)).toBe(RockKind.Moving);
    expect(st.rockDone[5]).toBe(1);
    expect(rockAt(st, 5).vx).toBeGreaterThan(0);
  });
});

describe('the broad phase (spec §9.2)', () => {
  it('rocksNear matches brute force while seeded rocks move and pieces fly', () => {
    const st = createTacticalState(4);
    const brute = (x: number, y: number, h: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const a = rockAt(st, k); if (Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r) out.push(k); }
      return out;
    };
    let broken = 0, pushed = 0;
    for (let k = 0; k < st.map.asteroids.length; k++) {
      if (st.map.asteroids[k]!.r >= 40 && broken < 6) { breakRock(st, k, 1, 1, 'laser', 0, 'fan'); broken++; }
      else if (pushed < 6) { pushRock(st, k, 30, -20); pushed++; }
    }
    for (let t = 0; t < 400; t++) {
      if (t % 50 === 0) for (let q = 0; q < 40; q++) {
        const x = -2600 + ((q * 977) % 5200), y = -2600 + ((q * 571) % 5200), h = 20 + (q % 7) * 60;
        const got = rocksNear(st, x, y, h).filter((k) => { const a = rockAt(st, k); return Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r; });
        expect(got).toEqual(brute(x, y, h));
      }
      stepDuel(st, IDLE_INPUT);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockContacts.test.ts`
Expected: FAIL (`resolveRockPair`, `crushDamage` not exported).

- [ ] **Step 3: Append to `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts

/** §3.2: rock gravity as a share of the ships', drag per second, and the speed cap applied at each motion step (u/s). */
export const ROCK_GRAVITY = 1.0;
export const ROCK_DRAG = 0.1;
export const ROCK_MAX_SPEED = 300;
/** §3.3: rock-rock restitution, and the crush rule: damage only above ROCK_CRUSH_SPEED, (vc − 30) / ROCK_CRUSH_STEP. */
export const ROCK_RESTITUTION = 0.8;
export const ROCK_CRUSH_SPEED = 30;
export const ROCK_CRUSH_STEP = 40;
```

- [ ] **Step 4: Append to `src/renderer/src/sim/tactical/rockBreak.ts`** (and add `ROCK_CRUSH_SPEED, ROCK_CRUSH_STEP` to its `./rockTuning` import):

```ts

/** §3.3, §5.1: the damage a body of mass `own` takes from a contact closing at vc against a body of mass `other`:
 *  (vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·other / (own + other) above the crush speed, else 0. */
export function crushDamage(vc: number, own: number, other: number): number {
  return vc > ROCK_CRUSH_SPEED ? (((vc - ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP) * 2 * other) / (own + other) : 0;
}
```

- [ ] **Step 5: Replace `src/renderer/src/sim/tactical/rockContacts.ts`**

```ts
// Spike ii §3.2, §3.3 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the moving rocks' turn in stepDuel,
// after the missiles fly and before the ship contacts.
// Part 1, motion: every moving rock not born this tick, ascending: gravity (× ROCK_GRAVITY), drag, the speed cap, then
// semi-implicit Euler. All motion happens before any contact.
// Part 2, contacts, a live outer loop: slot a from 0 upward, reading kinds as they stand now, takes a turn when it is
// moving and not born. Its turn: the planet and edge test (dust, turn over); else rocksNear(a) once, ascending, and each
// b ≠ a still alive, not born and not processed is resolved if it touches; a break of a ends its turn. Then a is marked
// processed (rockDone). A pair: wake, separate by inverse mass (a static b is infinitely heavy), bounce above zero
// closing speed, and above the crush speed both damage amounts are worked out, applied a then b, then any breaks, a's first.
import { gravityAccel } from './physics';
import { breakRock, crushDamage, dustRock, wearRock } from './rockBreak';
import { rockAlive, rockMass, RockKind, rocksNear, rockSlots, ROCK_STRIDE, wakeRock, wakesAt } from './rocks';
import { ROCK_CRUSH_SPEED, ROCK_DRAG, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCK_RESTITUTION } from './rockTuning';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * §3.3: moving rock a and rock b (static or moving) touch. Normal n from b to a (zero distance: north), closing speed
 * vc = (vb − va) · n. A static b wakes above ROCK_WAKE_SPEED, else counts as infinitely heavy (no velocity or position
 * change). Separate by the overlap, shared by inverse mass. Bounce when vc > 0: j = (1 + e) vc / (1/ma + 1/mb). Above
 * ROCK_CRUSH_SPEED: rockCollisions + 1, a bump event, both amounts applied (a then b), then breaks (a along n, b along −n,
 * each with its post-bounce velocity), neither able to evict a or b.
 */
export function resolveRockPair(s: TacticalState, a: number, b: number): void {
  const v = s.rocks, A = a * ROCK_STRIDE, B = b * ROCK_STRIDE;
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  const vc = (v[B + 3]! - v[A + 3]!) * nx + (v[B + 4]! - v[A + 4]!) * ny;
  if (v[B] === RockKind.Static && wakesAt(vc)) wakeRock(s, b);
  const moving = v[B] === RockKind.Moving, ra = v[A + 5]!, rb = v[B + 5]!, ma = rockMass(ra), mb = rockMass(rb);
  const ia = 1 / ma, ib = moving ? 1 / mb : 0, overlap = ra + rb - d;
  if (overlap > 0) {
    const sa = (overlap * ia) / (ia + ib), sb = (overlap * ib) / (ia + ib);
    v[A + 1]! += nx * sa; v[A + 2]! += ny * sa;
    if (moving) { v[B + 1]! -= nx * sb; v[B + 2]! -= ny * sb; }
  }
  if (vc > 0) {
    const j = ((1 + ROCK_RESTITUTION) * vc) / (ia + ib);
    v[A + 3]! += nx * j * ia; v[A + 4]! += ny * j * ia;
    if (moving) { v[B + 3]! -= nx * j * ib; v[B + 4]! -= ny * j * ib; }
  }
  if (vc <= ROCK_CRUSH_SPEED) return;
  const da = crushDamage(vc, ma, mb), db = crushDamage(vc, mb, ma);   // masses r² even for a static b
  const aBreaks = wearRock(s, a, da), bBreaks = wearRock(s, b, db);
  s.rockCollisions++;
  s.events.push({ kind: 'rock', what: 'bump', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]! });
  if (aBreaks) breakRock(s, a, nx, ny, 'collision', -1, 'fan', [a, b]);
  if (bBreaks) breakRock(s, b, -nx, -ny, 'collision', -1, 'fan', [a, b]);
}

export function stepRocks(s: TacticalState): void {
  const v = s.rocks, n = rockSlots(s), keep = 1 - ROCK_DRAG * DT;
  for (let k = 0; k < n; k++) {   // part 1: motion
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving || s.rockBorn[k] === 1) continue;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    let vx = (v[b + 3]! + gx * ROCK_GRAVITY * DT) * keep, vy = (v[b + 4]! + gy * ROCK_GRAVITY * DT) * keep;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > ROCK_MAX_SPEED) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
    v[b + 3] = vx; v[b + 4] = vy;
    v[b + 1]! += vx * DT; v[b + 2]! += vy * DT;
  }
  const p = s.map.planet;
  for (let a = 0; a < n; a++) {   // part 2: contacts, reading kinds as they stand now
    const A = a * ROCK_STRIDE;
    if (v[A] !== RockKind.Moving || s.rockBorn[a] === 1) continue;
    const x = v[A + 1]!, y = v[A + 2]!, r = v[A + 5]!, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) { dustRock(s, a, planet ? 'planet' : 'edge'); s.rockDone[a] = 1; continue; }
    for (const o of rocksNear(s, x, y, r)) {
      if (o === a || !rockAlive(s, o) || s.rockBorn[o] === 1 || s.rockDone[o] === 1) continue;
      const B = o * ROCK_STRIDE;
      if (!touching(v[A + 1]!, v[A + 2]!, v[A + 5]!, v[B + 1]!, v[B + 2]!, v[B + 5]!)) continue;
      resolveRockPair(s, a, o);
      if (v[A] !== RockKind.Moving || s.rockBorn[a] === 1) break;   // a broke: its turn ends
    }
    s.rockDone[a] = 1;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockContacts.test.ts tests/rockBreak.test.ts tests/boundary.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/rockContacts.ts tests/rockContacts.test.ts
git commit -m "feat(spike-ii): rock motion and rock-on-rock billiards contacts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The laser on rocks (push and damage 2, rock targets, AUTO_DIG off, card words)

**Files:**
- Create: `src/renderer/src/sim/tactical/rockWeapons.ts`, `tests/rockLaser.test.ts`
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append), `src/renderer/src/sim/tactical/rocks.ts` (remove `LASER_ROCK_DAMAGE` and `AUTO_DIG`; `firstBlocker` skips born), `src/renderer/src/sim/tactical/geometry.ts:22-31` (`lineOfSight` skips born), `src/renderer/src/sim/tactical/weapons.ts:4-8, 99-131, 175`, `src/renderer/src/render/duel/situationModel.ts:1-12, 26-50, 57-92`, `src/renderer/src/render/tactical/weaponsModel.ts` (the solution bracket guard), `tests/tacticalWeapons.test.ts:104`

**Interfaces:**
- Consumes: Task 2's `pushRock`, `hitRock`; `firstBlocker`, `rockMass`, `inArc`.
- Produces:
  - `rockTuning.ts`: `LASER_ROCK_DAMAGE = 2`, `LASER_ROCK_PUSH = 4000`, `AUTO_DIG = false`.
  - `rockWeapons.ts`: `export function rockOnTarget(state: TacticalState, i: number, k: number): boolean; export function rockShotLine(state: TacticalState, i: number, k: number): { rock: number; x: number; y: number } | null; export function laserStrikesRock(state: TacticalState, i: number, k: number, x: number, y: number): void;`
  - `situationModel.ts`: `LaserSituation` `range` and `arc` variants gain `rock?: true`.

- [ ] **Step 1: Write the failing test** `tests/rockLaser.test.ts`:

```ts
// Spike ii §4.1, §6.2, §6.3: a laser shot on a rock (push J / m, then 2 damage, a static rock wakes), the rock target's
// on-target rule, the shot line (the planet misses, a rock in the way takes it), the fan break, the burst re-aims,
// firstBlocker skips born slots, AUTO_DIG is off, and the Weapons card's words.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { classOf } from '../src/renderer/src/sim/tactical/state';
import { firstBlocker, rockAt, RockKind } from '../src/renderer/src/sim/tactical/rocks';
import { AUTO_DIG } from '../src/renderer/src/sim/tactical/rockTuning';
import { rockOnTarget } from '../src/renderer/src/sim/tactical/rockWeapons';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { laserCardReason, laserSituation, statusSentence } from '../src/renderer/src/render/duel/situationModel';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';

/** The arena with the crew facing east (heading 64) at (0, −2500), its laser full and targeted (the round's opener). */
function east() { const st = arena(); st.ships[0].heading = 64; return st; }
const laserEvent = (st: ReturnType<typeof arena>) => st.events.find((e) => e.kind === 'laser') as Extract<(typeof st.events)[number], { kind: 'laser' }> | undefined;

describe('a laser shot on a rock (spec §4.1)', () => {
  it('pushes it Δv = J / m along the shot line, then does 2 damage; the beam ends at the impact point', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 30, 3);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);   // on target, full and targeted: auto-fire
    const r = rockAt(st, 100), shot = laserEvent(st)!;
    expect(r.vx).toBeCloseTo(4000 / 900, 12);
    expect(r.vy).toBe(0);
    expect(r.hp).toBe(1);
    expect(shot).toMatchObject({ ship: 0, hit: false, rock: 100 });
    expect(shot.x2).toBeCloseTo(170, 9);
    expect(st.systems[0].shots).toBe(1);
  });
  it('wakes a static rock', () => {
    const st = east();
    seeded(st, 0);
    const a = st.map.asteroids[0]!;
    Object.assign(st.ships[0], { x: a.x - 200, y: a.y });
    st.systems[0].laserRock = 0;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    expect(rockAt(st, 0).vx).toBeCloseTo(4000 / (a.r * a.r), 12);
    expect(rockAt(st, 0).hp).toBe(Math.ceil(a.r / 10) - 2);
  });
  it('a laser break on r 42 gives 3 pieces, on r 30 gives 2, on r 20 dust; the target clears and the tally counts', () => {
    for (const [r, n] of [[42, 3], [30, 2], [20, 0]] as const) {
      const st = east();
      mover(st, 100, 200, -2500, 0, 0, r, 2);
      st.systems[0].laserRock = 100;
      applyWeaponsInput(st, 0, IDLE_INPUT);
      if (n > 0) expect(rockEvents(st, 'split')[0]).toMatchObject({ rock: 100, by: 'laser', ship: 0, pieces: expect.any(Array) });
      if (n > 0) expect(rockEvents(st, 'split')[0]!.pieces).toHaveLength(n);
      else expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]);
      expect([st.systems[0].laserRock, st.systems[0].rocksBroken]).toEqual([-1, 1]);
    }
  });
});

describe('born pieces and line of sight (spec §6.2)', () => {
  it('lineOfSight passes through a piece born this tick, as firstBlocker does, and is blocked once it is not born', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 30);
    st.rockBorn[100] = 1;
    expect(lineOfSight(st, 0, -2500, 400, -2500)).toBe(true);
    expect(firstBlocker(st, 0, -2500, 400, -2500)).toBeNull();
    st.rockBorn[100] = 0;
    expect(lineOfSight(st, 0, -2500, 400, -2500)).toBe(false);
  });
});

describe('the laser with a rock target (spec §6.2)', () => {
  it('is on target with the centre in arc and the surface within range', () => {
    const st = east();
    mover(st, 100, 480, -2500, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(true);    // surface 450
    mover(st, 100, 481, -2500, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(false);   // surface 451
    mover(st, 100, 0, -2200, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(false);   // south: out of the ±60° arc
    expect(rockOnTarget(st, 0, 101)).toBe(false);   // an empty slot
  });
  it('off target a press follows the miss path: the nose ray, here meeting nothing', () => {
    const st = east();
    mover(st, 100, 0, -2200, 0, 0, 30, 3);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserCharge: true });
    const shot = laserEvent(st)!;
    expect(shot.rock).toBeUndefined();
    expect([shot.x2, shot.y2]).toEqual([450, -2500]);
    expect(rockAt(st, 100).hp).toBe(3);
  });
  it('the line decides: another rock in the way takes the hit; the planet first is a miss', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 20, 10); mover(st, 101, 400, -2500, 0, 0, 30, 3);
    st.systems[0].laserRock = 101;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(laserEvent(st)!.rock).toBe(100);
    expect([rockAt(st, 100).hp, rockAt(st, 101).hp]).toEqual([8, 3]);
    const p = east();
    Object.assign(p.ships[0], { x: -200, y: 0 });
    mover(p, 101, 200, 0, 0, 0, 30, 3);
    p.systems[0].laserRock = 101;
    applyWeaponsInput(p, 0, IDLE_INPUT);
    const miss = laserEvent(p)!;
    expect(miss.rock).toBeUndefined();
    expect(miss.x2).toBeCloseTo(-70, 9);
    expect(rockAt(p, 101).hp).toBe(3);
  });
  it('a burst\'s later shot re-aims; once the rock broke it follows the enemy rules', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 20, 2);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(st.systems[0].laserRock).toBe(-1);
    for (let t = 0; t < classOf(st, 0).slots.laser.burstGapTicks; t++) { st.events = []; applyWeaponsInput(st, 0, IDLE_INPUT); }
    const second = laserEvent(st);
    expect(second).toBeDefined();
    expect(second!.rock).toBeUndefined();
    expect(st.systems[0].shots).toBe(2);
  });
  it('firstBlocker skips a slot born this tick', () => {
    const st = createTacticalState(5), a = rockAt(st, 0);
    st.rockBorn[0] = 1;
    expect(firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y)?.rock ?? -2).not.toBe(0);
  });
});

describe('AUTO_DIG and the card (spec §6.2, §6.3)', () => {
  it('AUTO_DIG is false: a rock between the laser and its in-arc target does not make it fire', () => {
    const st = east();
    st.ships[1].active = true;
    Object.assign(st.ships[1], { x: 400, y: -2500, vx: 0, vy: 0 });
    mover(st, 100, 200, -2500, 0, 0, 20);
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(AUTO_DIG).toBe(false);
    expect(st.systems[0].shots).toBe(0);
  });
  it('the card and the status sentence read the rock: OUT OF RANGE, OUT OF ARC, FIRING', () => {
    const st = east();
    st.systems[0].laserRock = 100;
    mover(st, 100, 530, -2500, 0, 0, 30);
    expect(laserSituation(st)).toEqual({ kind: 'range', range: 500, reach: 450, rock: true });
    expect(laserCardReason(laserSituation(st))).toBe('OUT OF RANGE 500/450');
    expect(statusSentence(laserSituation(st))).toBe('ROCK OUT OF RANGE: CLOSE TO 450');
    mover(st, 100, 0, -2200, 0, 0, 30);
    expect(laserCardReason(laserSituation(st))).toBe('OUT OF ARC: HELM TURN RIGHT');
    expect(statusSentence(laserSituation(st))).toBe('ROCK OUT OF ARC: TURN RIGHT');
    mover(st, 100, 200, -2500, 0, 0, 30);
    expect(laserCardReason(laserSituation(st))).toBe('FIRING');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockLaser.test.ts`
Expected: FAIL (`rockWeapons` module not found).

- [ ] **Step 3: Append to `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts

/** §4.1: a laser shot that meets a rock: damage, and the push J along the shot line (Δv = J / m). */
export const LASER_ROCK_DAMAGE = 2;
export const LASER_ROCK_PUSH = 4000;
/** §6.3: the crew laser never fires on its own because a rock is in the way; digging is a rock target. */
export const AUTO_DIG = false;
```

- [ ] **Step 4: Edit `src/renderer/src/sim/tactical/rocks.ts`**

Delete the lines `export const LASER_ROCK_DAMAGE = 1;` and `export const AUTO_DIG = true;` (keep `TORPEDO_ROCK_DAMAGE` and change the comment above it to `/** Spike i's torpedo damage, still in use until Task 5's blast. */`). In `firstBlocker`'s loop, add as its first statement: `if (s.rockBorn[k] === 1) continue;   // §6.2: a piece made earlier this tick is not in the way`.

Edit `src/renderer/src/sim/tactical/geometry.ts`: in `lineOfSight`'s rock loop, add as its first statement `if (state.rockBorn[k] === 1) continue;   // spike ii §6.2: as firstBlocker, a piece made this tick is not in the way`, so a piece born earlier in this tick's weapon phase never blocks a shot it would not take (clarification of §6.2).

- [ ] **Step 5: Create `src/renderer/src/sim/tactical/rockWeapons.ts`**

```ts
// Spike ii §4.1, §6.2 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the laser and rocks. A rock target is
// on target when its centre is inside the laser's arc and its surface within range. The shot's line runs to the rock's
// centre and firstBlocker decides what it meets: the planet (a miss), another rock (an accident) or the target. A shot
// that meets a rock pushes it LASER_ROCK_PUSH along the line (Δv = J / m, waking a static rock), then does LASER_ROCK_DAMAGE.
import { inArc } from './geometry';
import { hitRock, pushRock } from './rockBreak';
import { firstBlocker, rockAlive, rockAt, rockMass } from './rocks';
import { LASER_ROCK_DAMAGE, LASER_ROCK_PUSH } from './rockTuning';
import { classOf, type TacticalState } from './state';

/** §6.2: whether rock k is alive with its centre in ship i's laser arc and its surface within the laser's range. */
export function rockOnTarget(state: TacticalState, i: number, k: number): boolean {
  if (k < 0 || !rockAlive(state, k)) return false;
  const a = state.ships[i]!, r = rockAt(state, k), laser = classOf(state, i).slots.laser, dx = r.x - a.x, dy = r.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) - r.r <= laser.range && inArc(a.heading, dx, dy, laser.arcCos);
}

/** §6.2: what the line from ship i to rock k's centre meets first, with the impact point: rock −1 the planet, else a rock
 *  slot (k, or one in the way); null when nothing (the line ends inside k, so only a gone k gives null). */
export function rockShotLine(state: TacticalState, i: number, k: number): { rock: number; x: number; y: number } | null {
  const a = state.ships[i]!, c = rockAt(state, k), f = firstBlocker(state, a.x, a.y, c.x, c.y);
  if (!f) return null;
  return { rock: f.rock, x: a.x + (c.x - a.x) * f.t, y: a.y + (c.y - a.y) * f.t };
}

/** §4.1: ship i's laser shot meets rock k at (x, y): push first, then damage (a fan break along the line at hp ≤ 0). */
export function laserStrikesRock(state: TacticalState, i: number, k: number, x: number, y: number): void {
  const a = state.ships[i]!, dx = x - a.x, dy = y - a.y, d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const j = LASER_ROCK_PUSH / rockMass(rockAt(state, k).r);
  pushRock(state, k, ux * j, uy * j);
  hitRock(state, k, LASER_ROCK_DAMAGE, ux, uy, 'laser', i);
}
```

- [ ] **Step 6: Edit `src/renderer/src/sim/tactical/weapons.ts`**

Imports (lines 4-8): replace the spike i rock import and the Task 2 `hitRock` import with:

```ts
import { firstBlocker } from './rocks';
import { AUTO_DIG } from './rockTuning';
import { laserStrikesRock, rockOnTarget, rockShotLine } from './rockWeapons';
```

(`firstBlocker` is still used by `laserRockTarget`.) In `shoot` (lines 106-131), make the rock target the first branch and port spike i's blocked-shot strike:

```ts
function shoot(state: TacticalState, i: number): void {
  if (state.systems[i]!.laserRock >= 0) { shootRock(state, i); return; }   // spike ii §6.2: a rock target
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) {
    as.laserHits++;
    if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
      const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
      bs.shields -= n; bs.shieldClock = 0; as.layersStripped += n; stripped = true;
    }
    else {
      room = as.lock;
      if (bs.rooms[as.lock]! < 2) bs.rooms[as.lock as 0 | 1 | 2]++;
      bs.hull = Math.max(0, bs.hull - classOf(state, i).slots.laser.hull);
    }
  }
  if (!hit) {   // spike i, kept (spec §6.3): a blocked or aimless shot strikes the first rock on its line instead
    const r = laserRockTarget(state, i);
    if (r) {
      state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: r.x, y2: r.y, rock: r.rock });
      laserStrikesRock(state, i, r.rock, r.x, r.y);
      return;
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

/** Spike ii §6.2: one shot of ship i with a rock target. On target, the line to the rock's centre decides what it meets
 *  (the planet: a miss; another rock: that rock); off target, spike i's miss path (the blocked enemy line or the nose ray).
 *  A shot that meets no rock is a miss beam to the planet's entry point or the nose ray's end. */
function shootRock(state: TacticalState, i: number): void {
  const a = state.ships[i]!, as = state.systems[i]!, range = classOf(state, i).slots.laser.range;
  as.shots++;
  const line = rockOnTarget(state, i, as.laserRock) ? rockShotLine(state, i, as.laserRock) : laserRockTarget(state, i);
  if (line && line.rock >= 0) {
    state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: line.x, y2: line.y, rock: line.rock });
    laserStrikesRock(state, i, line.rock, line.x, line.y);
    return;
  }
  const end = line ?? { x: a.x + hx(a.heading) * range, y: a.y + hy(a.heading) * range };
  state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: end.x, y2: end.y });
}
```

The auto-fire line (175) becomes:

```ts
  // Auto-fire: on the enemy when eligible; spike ii §6.2: on a rock target when it is on target (AUTO_DIG is false).
  if (crew && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i) && !laserFrozen(state, i, input) && (s.laserRock >= 0 ? rockOnTarget(state, i, s.laserRock) : laserEligible(state, i, s.target) || laserDiggable(state, i))) fireLaser(state, i);
```

- [ ] **Step 7: Edit `src/renderer/src/render/duel/situationModel.ts`**

Add the import `import { rockAlive, rockAt } from '../../sim/tactical/rocks';`. Change the `LaserSituation` type's first two variants to:

```ts
  | { kind: 'range'; range: number; reach: number; rock?: true }
  | { kind: 'arc'; turn: 'LEFT' | 'RIGHT'; rock?: true }
```

In `laserSituation`, right after the `if (t.outcome !== Outcome.Running) return { kind: 'none' };` line, insert the rock branch:

```ts
  const own = t.ships[CREW_SLOT], sysRock = t.systems[CREW_SLOT];
  if (sysRock.laserRock >= 0 && rockAlive(t, sysRock.laserRock)) {   // spike ii §6.2: the laser aims at its rock target
    const r = rockAt(t, sysRock.laserRock), reach = classOf(t, CREW_SLOT).slots.laser, rx = r.x - own.x, ry = r.y - own.y, surface = Math.sqrt(rx * rx + ry * ry) - r.r;
    if (surface > reach.range) return { kind: 'range', range: Math.round(surface), reach: reach.range, rock: true };
    if (!inArc(own.heading, rx, ry, reach.arcCos)) return { kind: 'arc', turn: (sideOf(own.heading, rx, ry) || 1) > 0 ? 'RIGHT' : 'LEFT', rock: true };
    if (laserOffline(t, CREW_SLOT)) return { kind: 'offline' };
    if (sysRock.laserBurst > 0 || sinceShot < SOLUTION_HOLD_S) return { kind: 'solution', targeted: sysRock.laserTargeted };
    if (!gunner) return { kind: 'nogunner' };
    if (missileOf(t, CREW_SLOT)) return { kind: 'frozen' };
    return laserFull(t, CREW_SLOT) ? { kind: 'solution', targeted: sysRock.laserTargeted } : { kind: 'charging', targeted: sysRock.laserTargeted };
  }
```

In `statusSentence`, the first two cases become:

```ts
    case 'range': return s.rock ? `ROCK OUT OF RANGE: CLOSE TO ${s.reach}` : `ENEMY OUT OF RANGE: CLOSE TO ${s.reach}`;
    case 'arc': return s.rock ? `ROCK OUT OF ARC: TURN ${s.turn}` : `ENEMY OUT OF ARC: TURN ${s.turn}`;
```

(`laserCardReason` stays as it is: the card's words are today's.)

- [ ] **Step 8: Edit `src/renderer/src/render/tactical/weaponsModel.ts`**

In `combatModel`, the line `if (lined && input.fx.solutionAge >= 0 && enemyShown && input.console !== 'science') {` becomes:

```ts
  if (lined && input.fx.solutionAge >= 0 && enemyShown && input.console !== 'science' && state.systems[0]!.laserRock < 0) {   // spike ii: no enemy bracket while the laser aims at a rock
```

- [ ] **Step 9: Update `tests/tacticalWeapons.test.ts` line 104** (the laser now does 2 and pushes, waking the rock):

```ts
      else { expect((shot as { rock?: number }).rock, name).toBe(0); expect(st.rocks[6], name).toBe(Math.ceil(st.map.asteroids[0]!.r / 10) - 2); expect(st.rocks[0], name).toBe(2); }
```

- [ ] **Step 10: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockLaser.test.ts tests/tacticalWeapons.test.ts tests/rockBreak.test.ts tests/ftlTargeting.test.ts tests/boundary.test.ts`
Expected: `rockLaser`, `tacticalWeapons`, `rockBreak`, `boundary` PASS; `ftlTargeting` passes except any golden-class trajectory case.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/rockWeapons.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/tactical/weaponsModel.ts tests/rockLaser.test.ts tests/tacticalWeapons.test.ts
git commit -m "feat(spike-ii): laser pushes and cracks rocks, rock targets, AUTO_DIG off" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The torpedo blast and the rock-targeted torpedo

**Files:**
- Create: `src/renderer/src/sim/tactical/rockBlast.ts`, `tests/rockBlast.test.ts`
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append), `src/renderer/src/sim/tactical/rocks.ts` (remove `TORPEDO_ROCK_DAMAGE`), `src/renderer/src/sim/tactical/missiles.ts:15-26 (launchMissile), 28-33 (end), 46-61 (homingTurn), 109-113 (the rock contact)`, `src/renderer/src/sim/tactical/weapons.ts:41-54, 180`

**Interfaces:**
- Consumes: Task 2's `breakRock`, `hitRock`, `pushRock`; `rocksNear`.
- Produces:
  - `rockTuning.ts`: `BLAST_RADIUS = 120`, `BLAST_ROCK_DAMAGE_MIN = 2`, `BLAST_ROCK_DAMAGE_MAX = 6`, `BLAST_PUSH = 60000`, `BLAST_SHIP_PUSH = 120`.
  - `rockBlast.ts`: `export function blastFall(d: number): number; export function detonateTorpedo(s: TacticalState, owner: number, x: number, y: number, mvx: number, mvy: number, rock: number): void;`
  - `weapons.ts`: `export function torpedoInRange(state: TacticalState, i: number, torpRock?: number): boolean; export function canLaunch(state: TacticalState, i: number, torpRock?: number): boolean;` (default `state.systems[i].torpRock`).
  - `missiles.ts`: `homingTurn` homes on `torpRockFlying`'s rock (−2: 0); `launchMissile` copies `torpRock` → `torpRockFlying`; the end resets it to −1.

- [ ] **Step 1: Write the failing test** `tests/rockBlast.test.ts`:

```ts
// Spike ii §4.2, §6.4, §9.3: the torpedo's direct hit bursts its rock whatever its hp, the blast cracks and throws the
// rocks in its radius with a linear fall-off and pushes ships without damage, the list is taken before the direct hit's
// pieces (a reused slot is not hit), and a rock-targeted torpedo launches on the rock's range, homes on the moving rock
// and hits it; −2 flies unguided.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { homingTurn } from '../src/renderer/src/sim/tactical/missiles';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { canLaunch, IDLE_INPUT, torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { rockAt } from '../src/renderer/src/sim/tactical/rocks';
import { blastFall, detonateTorpedo } from '../src/renderer/src/sim/tactical/rockBlast';
import { arena, fillPool, mover, rockEvents } from './helpers/rockArena';

describe('the direct hit (spec §4.2 item 1)', () => {
  it('bursts the touched rock whatever its hp: r 50 and r 35 give 6, r 30 gives 4, r 20 dust; piece 0 straight on at 200 plus the rock', () => {
    for (const [r, n] of [[50, 6], [35, 6], [30, 4], [20, 0]] as const) {
      const st = arena();
      mover(st, 100, -54, 2000, 5, 0, r, 99);
      detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
      expect(rockEvents(st, 'blast')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0, x: 0, y: 2000, r: 120 }]);
      expect([st.rockBlasts, st.systems[0].rocksBroken]).toEqual([1, 1]);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0 }]); continue; }
      const pieces = rockEvents(st, 'split')[0]!.pieces!;
      expect(pieces).toHaveLength(n);
      expect(rockAt(st, pieces[0]!).vx).toBeCloseTo(5 - 200, 9);   // u: the torpedo's velocity relative to the rock (west)
      expect(rockAt(st, pieces[0]!).vy).toBeCloseTo(0, 9);
    }
  });
});

describe('the blast (spec §4.2 items 2 and 3)', () => {
  it('falls off linearly: damage 2 + 4·fall and push 60000·fall / m along the blast-to-rock line; nothing at or beyond the radius', () => {
    const st = arena();
    mover(st, 100, -60, 2000, 0, 0, 25, 99);   // the touched rock
    mover(st, 101, 0, 2005, 0, 0, 10, 20);     // surface 0: fall 1
    mover(st, 102, 70, 2000, 0, 0, 10, 20);    // surface 60: fall 0.5
    mover(st, 103, 0, 1871, 0, 0, 10, 20);     // surface 119: fall 1/120
    mover(st, 104, -78, 2104, 0, 0, 10, 20);   // surface 120: outside
    mover(st, 105, 210, 2000, 0, 0, 10, 20);   // surface 200: outside
    detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
    expect([blastFall(0), blastFall(60), blastFall(120), blastFall(200)]).toEqual([1, 0.5, 0, 0]);
    expect(rockAt(st, 101)).toMatchObject({ hp: 14, vx: 0, vy: 600 });
    expect(rockAt(st, 102)).toMatchObject({ hp: 16, vx: 300, vy: 0 });
    expect(rockAt(st, 103).hp).toBeCloseTo(20 - (2 + 4 / 120), 12);
    expect(rockAt(st, 103).vy).toBeCloseTo(-60000 / 120 / 100, 9);   // fall 1/120, m 100: −5
    expect(rockAt(st, 104)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    expect(rockAt(st, 105)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    expect(rockEvents(st, 'hit').map((e) => e.rock)).toEqual([101, 102, 103]);
  });
  it('pushes ships in its radius 120·fall away from the blast and costs them no hull', () => {
    const st = arena();
    mover(st, 100, -60, 2000, 0, 0, 25, 99);
    Object.assign(st.ships[0], { x: 0, y: 2080, vx: 0, vy: 0 });   // surface 60: fall 0.5
    st.ships[1].active = true; Object.assign(st.ships[1], { x: 0, y: 1800, vx: 0, vy: 0 });   // surface 180: outside
    const hulls = [st.systems[0].hull, st.systems[1].hull];
    detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
    expect([st.ships[0].vx, st.ships[0].vy]).toEqual([0, 60]);
    expect([st.ships[1].vx, st.ships[1].vy]).toEqual([0, 0]);
    expect([st.systems[0].hull, st.systems[1].hull]).toEqual(hulls);
  });
  it('takes its list before the direct hit: a slot the pieces reuse (born) is not hit by the blast', () => {
    const st = arena();
    mover(st, 100, -54, 2000, 0, 0, 50, 1);
    fillPool(st, 9);
    mover(st, 120, 60, 2000, 0, 0, 8.5, 5);   // in the radius and the smallest: evicted first
    detonateTorpedo(st, 0, 0, 2000, -200, 0, 100);
    const pieces = rockEvents(st, 'split')[0]!.pieces!, p = rockAt(st, 120);
    expect(pieces).toHaveLength(6);
    expect(pieces[1]).toBe(120);
    expect(p.r).toBeCloseTo((0.9 * 50) / Math.sqrt(6), 12);
    expect(p.hp).toBe(2);
    expect(p.vx).toBeCloseTo(-200 * 0.5, 9);                    // its own burst velocity (u west, +60°), no blast push
    expect(p.vy).toBeCloseTo(-200 * 0.8660254037844386, 9);
    expect(rockEvents(st, 'hit').some((e) => e.rock === 120)).toBe(false);
    expect(st.rockEvictions).toBe(5);
  });
});

describe('a torpedo with a rock target (spec §6.4)', () => {
  it('reads the rock\'s range, launches on it, homes on the moving rock and hits it; the end resets torpRockFlying', () => {
    const st = arena(), s = st.systems[0];
    Object.assign(st.ships[0], { x: 0, y: -1500, heading: 128 });
    mover(st, 100, 0, -1250, 40, 0, 30);
    expect(torpedoInRange(st, 0)).toBe(false);   // no rock target, and the Hunter is off
    s.torpRock = 100;
    expect([torpedoInRange(st, 0), canLaunch(st, 0), canLaunch(st, 0, -1)]).toEqual([true, true, false]);
    stepDuel(st, IDLE_INPUT);
    expect([s.torpRock, s.torpRockFlying, s.missilesLaunched]).toEqual([-1, 100, 1]);
    let blast: ReturnType<typeof rockEvents>[number] | undefined;
    for (let t = 0; t < 300 && !blast; t++) {
      stepDuel(st, IDLE_INPUT);
      if (t === 10) expect(s.torpRockFlying).toBe(100);
      blast = rockEvents(st, 'blast')[0];
    }
    expect(blast).toMatchObject({ rock: 100, ship: 0 });
    expect(st.events.find((e) => e.kind === 'missileEnd')).toMatchObject({ cause: 'asteroid' });
    expect(s.torpRockFlying).toBe(-1);
  });
  it('a manual launch with a rock target copies it too', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 100, 0, -2250, 0, 0, 30);
    s.torpRock = 100;
    stepDuel(st, { ...IDLE_INPUT, missileLaunch: true });
    expect([s.torpRock, s.torpRockFlying]).toEqual([-1, 100]);
  });
  it('flies unguided at −2 (its rock broke)', () => {
    const st = arena();
    st.ships[1].active = true; Object.assign(st.ships[1], { x: 300, y: -2400 });
    const m = placeMissile(st, 0, { x: 0, y: -2400, vx: 0, vy: -100, heading: 0, headingAcc: 0, age: 30 });
    expect(homingTurn(st, 0, m)).not.toBe(0);   // the enemy to the east: it turns
    st.systems[0].torpRockFlying = -2;
    expect(homingTurn(st, 0, m)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockBlast.test.ts`
Expected: FAIL (`rockBlast` module not found).

- [ ] **Step 3: Append to `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts

/** §4.2: the torpedo's area blast: radius; rock damage from MIN at the edge to MAX at the centre; the push J on rocks
 *  (Δv = J · fall / m) and the speed given to ships (u/s, · fall). Ships take no hull from the blast. */
export const BLAST_RADIUS = 120;
export const BLAST_ROCK_DAMAGE_MIN = 2;
export const BLAST_ROCK_DAMAGE_MAX = 6;
export const BLAST_PUSH = 60000;
export const BLAST_SHIP_PUSH = 120;
```

- [ ] **Step 4: Create `src/renderer/src/sim/tactical/rockBlast.ts`**

```ts
// Spike ii §4.2 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): a torpedo that touches a rock detonates. The
// rocks whose surface lies within BLAST_RADIUS of the blast point are listed once, ascending, before anything changes;
// then the blast event, the touched rock's burst (whatever its hp), each listed rock in order (skipping any slot now
// born or gone: push first, then damage, a fan break along the blast-to-rock line), then every active ship in the radius
// is pushed away. The caller ends the torpedo with cause 'asteroid'.
import { breakRock, hitRock, pushRock } from './rockBreak';
import { rockAlive, rockAt, rockMass, rocksNear } from './rocks';
import { BLAST_PUSH, BLAST_RADIUS, BLAST_ROCK_DAMAGE_MAX, BLAST_ROCK_DAMAGE_MIN, BLAST_SHIP_PUSH } from './rockTuning';
import { classOf, type TacticalState } from './state';

/** §4.2: the fall-off for a surface distance d: 1 − d / BLAST_RADIUS inside the radius, 0 at and beyond it. */
export function blastFall(d: number): number { return d < BLAST_RADIUS ? 1 - d / BLAST_RADIUS : 0; }

/** §4.2: ship `owner`'s torpedo at (x, y), velocity (mvx, mvy), touched rock `rock`. */
export function detonateTorpedo(s: TacticalState, owner: number, x: number, y: number, mvx: number, mvy: number, rock: number): void {
  const near: number[] = [];
  for (const k of rocksNear(s, x, y, BLAST_RADIUS)) {   // taken once, ascending, before the direct hit's pieces exist
    if (k === rock || !rockAlive(s, k) || s.rockBorn[k] === 1) continue;
    const a = rockAt(s, k), dx = a.x - x, dy = a.y - y;
    if (Math.max(0, Math.sqrt(dx * dx + dy * dy) - a.r) < BLAST_RADIUS) near.push(k);
  }
  s.rockBlasts++;
  s.events.push({ kind: 'rock', what: 'blast', by: 'torpedo', rock, x, y, r: BLAST_RADIUS, vx: mvx, vy: mvy, ship: owner });
  const t = rockAt(s, rock);
  breakRock(s, rock, mvx - t.vx, mvy - t.vy, 'torpedo', owner, 'burst');
  for (const k of near) {
    if (!rockAlive(s, k) || s.rockBorn[k] === 1) continue;   // evicted, or reused for a piece of this blast
    const a = rockAt(s, k), dx = a.x - x, dy = a.y - y, dist = Math.sqrt(dx * dx + dy * dy);
    const fall = blastFall(Math.max(0, dist - a.r)), ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1, dv = (BLAST_PUSH * fall) / rockMass(a.r);
    pushRock(s, k, ux * dv, uy * dv);
    hitRock(s, k, BLAST_ROCK_DAMAGE_MIN + (BLAST_ROCK_DAMAGE_MAX - BLAST_ROCK_DAMAGE_MIN) * fall, ux, uy, 'torpedo', owner);
  }
  s.ships.forEach((ship, i) => {
    if (!ship.active) return;
    const dx = ship.x - x, dy = ship.y - y, dist = Math.sqrt(dx * dx + dy * dy), fall = blastFall(Math.max(0, dist - classOf(s, i).radius));
    if (fall <= 0) return;
    const ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1;
    ship.vx += ux * BLAST_SHIP_PUSH * fall; ship.vy += uy * BLAST_SHIP_PUSH * fall;
  });
}
```

- [ ] **Step 5: Edit `src/renderer/src/sim/tactical/rocks.ts`**: delete `TORPEDO_ROCK_DAMAGE` and its comment.

- [ ] **Step 6: Edit `src/renderer/src/sim/tactical/missiles.ts`**

Imports: replace the rock imports with `import { rockAlive, rockAt, rocksNear } from './rocks';` and `import { detonateTorpedo } from './rockBlast';` (drop the `hitRock` import). In `launchMissile`, after `sys.torpRoom = sys.torpLock; sys.torpLock = -1;` add:

```ts
  // Spike ii §6.4: the rock target too is a single shot: the flying torpedo homes on it.
  sys.torpRockFlying = sys.torpRock; sys.torpRock = -1;
```

In `end`, after `state.systems[m.owner]!.torpRoom = -1;` add `state.systems[m.owner]!.torpRockFlying = -1;`. Replace `homingTurn`'s first three lines (`const k = ...` through `const dx = t.x - m.x, ...`) and the later uses of `t.vx`/`t.vy` so it reads:

```ts
export function homingTurn(state: TacticalState, i: number, m: Missile): number {
  const sys = state.systems[i]!, fly = sys.torpRockFlying;
  let tx: number, ty: number, tvx: number, tvy: number;
  if (fly === -2) return 0;   // spike ii §6.4: its rock broke: unguided
  if (fly >= 0) {             // spike ii §6.4: a rock target: that rock's position and velocity
    if (!rockAlive(state, fly)) return 0;
    const r = rockAt(state, fly); tx = r.x; ty = r.y; tvx = r.vx; tvy = r.vy;
  } else {
    const k = sys.target, t = state.ships[k];
    if (!t || !t.active || k === i) return 0;
    tx = t.x; ty = t.y; tvx = t.vx; tvy = t.vy;
  }
  const dx = tx - m.x, dy = ty - m.y, dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return 0;
  const closing = ((m.vx - tvx) * dx + (m.vy - tvy) * dy) / dist;
  const tgo = Math.min(dist / Math.max(closing, MISSILE_MIN_CLOSING), MISSILE_LEAD_CAP_S);
  const ax = dx + tvx * tgo, ay = dy + tvy * tgo, al = Math.sqrt(ax * ax + ay * ay);
  if (al === 0) return 0;
  const speed = Math.max(Math.sqrt(m.vx * m.vx + m.vy * m.vy), MISSILE_CRUISE_SPEED);
  const ex = (ax / al) * speed - m.vx, ey = (ay / al) * speed - m.vy, el = Math.sqrt(ex * ex + ey * ey);
  if (el === 0) return 0;
  const dot = hx(m.heading) * ex + hy(m.heading) * ey, cross = hx(m.heading) * ey - hy(m.heading) * ex;
  if (dot > 0 && Math.abs(cross) < STEP_SIN * el) return 0;
  return sideOf(m.heading, ex, ey) || 1;
}
```

In `resolveMissiles`, the rock lines (306-310) become:

```ts
    const rock = rocksNear(state, m.x, m.y, def.radius).find((k) => { if (state.rockBorn[k] === 1) return false; const a = rockAt(state, k); return touches(m, def.radius, a.x, a.y, a.r); });
    if (rock !== undefined) {   // spike ii §4.2: it detonates on the first rock it touches (on purpose or not)
      detonateTorpedo(state, m.owner, m.x, m.y, m.vx, m.vy, rock); end(state, m, 'asteroid'); continue;
    }
```

- [ ] **Step 7: Edit `src/renderer/src/sim/tactical/weapons.ts`**

Add `rockAlive, rockAt` to the `./rocks` import. Replace `torpedoInRange` and `canLaunch` (lines 41-54) with:

```ts
/** Weapons update spec §2: whether ship i's target ship is active and its centre within the class's torpedo range of
 *  ship i's, from any bearing. Spike ii §6.4: with a rock target (`torpRock` ≥ 0, default the stored one) the rock's
 *  centre is tested instead. */
export function torpedoInRange(state: TacticalState, i: number, torpRock = state.systems[i]!.torpRock): boolean {
  const a = state.ships[i]!, range = classOf(state, i).slots.missile.range;
  if (torpRock >= 0) {
    if (!rockAlive(state, torpRock)) return false;
    const r = rockAt(state, torpRock), dx = r.x - a.x, dy = r.y - a.y;
    return dx * dx + dy * dy <= range * range;
  }
  const j = state.systems[i]!.target, b = state.ships[j];
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy <= range * range;
}
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine, Weapons below level 2 and the
 *  target (spike ii: the rock target, `torpRock`) within torpedo range (weapons update spec §2). */
export function canLaunch(state: TacticalState, i: number, torpRock = state.systems[i]!.torpRock): boolean {
  const s = state.systems[i]!;
  return missileOf(state, i) === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2 && torpedoInRange(state, i, torpRock);
}
```

The auto-launch line (180) becomes:

```ts
  if (crew && (s.torpLock >= 0 || s.torpRock >= 0) && canLaunch(state, i)) launchMissile(state, i);   // auto-launch, once (spike ii: or on a rock target)
```

- [ ] **Step 8: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockBlast.test.ts tests/rockLaser.test.ts tests/rockBreak.test.ts tests/ftlTargeting.test.ts tests/boundary.test.ts`
Expected: all PASS (`ftlTargeting` except golden-class trajectory cases).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/rockBlast.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/weapons.ts tests/rockBlast.test.ts
git commit -m "feat(spike-ii): torpedo area blast and rock-targeted torpedoes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ship-rock contacts (two bodies, hull cost by impact, ram damage)

**Files:**
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append), `src/renderer/src/sim/tactical/contacts.ts` (imports and new functions; `hitStatic`, `shipShip`, `hitStatics` unchanged), `src/renderer/src/sim/tactical/duel.ts` (`resolveContacts(state, true)`)
- Test: `tests/rockShips.test.ts`

**Interfaces:**
- Consumes: `breakRock`, `wearRock`, `crushDamage`, `wakeRock`, `wakesAt`, `rockMass`.
- Produces:
  - `rockTuning.ts`: `SHIP_MASS = 900`, `RAM_HULL_FREE = 40`, `RAM_HULL_STEP = 40`, `RAM_HULL_MAX = 4`.
  - `contacts.ts`: `export function ramHull(impact: number): number; export function resolveContacts(state: TacticalState, rocks?: boolean): void;` (`rocks` true: the duel's two-body rock contacts; false, the default: today's `hitStatics`, used by `stepFlight`).

- [ ] **Step 1: Write the failing test** `tests/rockShips.test.ts`:

```ts
// Spike ii §5.1, §9.3: the duel's ship-rock contact: a moving rock is a second body (momentum, hull cost by impact),
// a static rock that does not wake is today's infinitely heavy contact, a hard ram wakes it, ram damage can break a
// rock, the pair's grace holds both, born slots are skipped, and the single-ship flight keeps today's contact.
import { describe, expect, it } from 'vitest';
import { ramHull, resolveContacts } from '../src/renderer/src/sim/tactical/contacts';
import { stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { rockAlive, rockAt, RockKind } from '../src/renderer/src/sim/tactical/rocks';
import { SHIP_MASS } from '../src/renderer/src/sim/tactical/rockTuning';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';

/** A moving rock of radius r touching the crew ship (at rest at (0, −2500), radius 20) from the east, closing at `speed`. */
function incoming(r: number, speed: number, hp = 99) { const st = arena(); mover(st, 100, 20 + r - 1, -2500, -speed, 0, r, hp); return st; }

describe('a moving rock is a second body (spec §5.1 case 3)', () => {
  it('costs hull min(4, 1 + floor(max(0, impact − 40) / 40)): r 15 at 200 is 1, r 30 at 200 is 2, r 45 at 250 is 4', () => {
    for (const [r, speed, cost] of [[15, 200, 1], [30, 200, 2], [45, 250, 4]] as const) {
      const st = incoming(r, speed), hull = st.systems[0].hull;
      resolveContacts(st, true);
      expect(hull - st.systems[0].hull, `r ${r} at ${speed}`).toBe(cost);
      expect(st.ships[0].asteroidHits).toBe(1);
    }
    expect([ramHull(40), ramHull(100), ramHull(173.08), ramHull(138.46), ramHull(10000)]).toEqual([1, 2, 4, 3, 4]);
  });
  it('conserves momentum along n', () => {
    const st = incoming(30, 200), before = SHIP_MASS * st.ships[0].vx + 900 * rockAt(st, 100).vx;
    resolveContacts(st, true);
    const after = SHIP_MASS * st.ships[0].vx + 900 * rockAt(st, 100).vx;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1e-9 * Math.abs(before));
    expect(st.ships[0].vx).toBeLessThan(0);   // thrown west, away from the rock
  });
  it('ram damage (vc − 30) / 40 · 2·900 / (900 + m) can break a rock: a bump then the break, both named for the ship', () => {
    const st = incoming(15, 200, 99);
    resolveContacts(st, true);
    expect(rockAt(st, 100).hp).toBeCloseTo(99 - (170 / 40) * 1800 / 1125, 12);
    const small = incoming(15, 200, 2);
    resolveContacts(small, true);
    expect(rockEvents(small).map((e) => [e.what, e.by, e.ship])).toEqual([['bump', 'ram', 0], ['dust', 'ram', 0]]);
    expect([rockAlive(small, 100), small.systems[0].rocksBroken]).toEqual([false, 1]);
  });
  it('inside the pair\'s grace there is no hull cost and no ram damage', () => {
    const st = incoming(30, 200);
    resolveContacts(st, true);
    const hull = st.systems[0].hull, hp = rockAt(st, 100).hp;
    mover(st, 100, st.ships[0].x + 20 + 30 - 1, st.ships[0].y, -200, 0, 30, hp);
    resolveContacts(st, true);
    expect([st.systems[0].hull, rockAt(st, 100).hp]).toEqual([hull, hp]);
  });
  it('skips a rock born this tick', () => {
    const st = incoming(30, 200);
    st.rockBorn[100] = 1;
    resolveContacts(st, true);
    expect([st.ships[0].x, st.ships[0].vx, st.ships[0].asteroidHits]).toEqual([0, 0, 0]);
  });
});

describe('a static rock (spec §5.1 cases 1 and 2)', () => {
  it('rammed at 40 u/s stays static and unmoved: today\'s push-out, restitution 0.5, hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, before = rockAt(st, 5), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) + 1, y: a.y, vx: 40, vy: 0, heading: 64 });
    resolveContacts(st, true);
    const after = rockAt(st, 5);
    expect([after.kind, after.x, after.y, after.vx, after.vy]).toEqual([RockKind.Static, before.x, before.y, 0, 0]);
    expect(st.ships[0].x).toBeCloseTo(a.x - (20 + a.r), 9);
    expect(st.ships[0].vx).toBeCloseTo(-20, 9);
    expect(hull - st.systems[0].hull).toBe(1);
  });
  it('rammed at 200 u/s wakes and becomes a two-body contact: r 44.6, impact about 138, hull 3', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) + 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    resolveContacts(st, true);
    expect(rockAt(st, 5).kind).toBe(RockKind.Moving);
    expect(rockAt(st, 5).vx).toBeGreaterThan(0);
    expect(hull - st.systems[0].hull).toBe(3);
  });
  it('the single-ship flight keeps today\'s contact: no wake, hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) - 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(rockAt(st, 5)).toMatchObject({ kind: RockKind.Static, vx: 0, vy: 0, x: a.x, y: a.y });
    expect(hull - st.systems[0].hull).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockShips.test.ts`
Expected: FAIL (`ramHull`, `SHIP_MASS` not exported).

- [ ] **Step 3: Append to `src/renderer/src/sim/tactical/rockTuning.ts`**

```ts

/** §5.1: every ship's mass for rock contacts (all classes in this spike). */
export const SHIP_MASS = 900;
/** §5.1: a moving rock's hull cost, min(RAM_HULL_MAX, 1 + floor(max(0, impact − RAM_HULL_FREE) / RAM_HULL_STEP)). */
export const RAM_HULL_FREE = 40;
export const RAM_HULL_STEP = 40;
export const RAM_HULL_MAX = 4;
```

- [ ] **Step 4: Edit `src/renderer/src/sim/tactical/contacts.ts`**

Replace the imports with:

```ts
import { breakRock, crushDamage, wearRock } from './rockBreak';
import { rockAlive, rockAt, rockMass, RockKind, rocksNear, ROCK_STRIDE, wakeRock, wakesAt } from './rocks';
import { RAM_HULL_FREE, RAM_HULL_MAX, RAM_HULL_STEP, SHIP_MASS } from './rockTuning';
import { classOf, shipBody, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL } from './tuning';
```

After `hitStatics` add:

```ts
/** Spike ii §5.1: a moving rock's hull cost for an impact vc · mk / (mk + ms). */
export function ramHull(impact: number): number { return Math.min(RAM_HULL_MAX, 1 + Math.floor(Math.max(0, impact - RAM_HULL_FREE) / RAM_HULL_STEP)); }

/**
 * Spike ii §5.1: ship i meets rock k in the duel. Normal n from the rock to the ship, closing speed vc = (vk − vs) · n.
 * A static rock wakes above ROCK_WAKE_SPEED; one that does not is today's infinitely heavy contact (full push-out,
 * RESTITUTION, ASTEROID_CONTACT_HULL). A moving (or just woken) rock is a two-body contact: the overlap shared by inverse
 * mass, the impulse (1 + RESTITUTION) vc / (1/ms + 1/mk) when closing, hull by ramHull. Outside the pair's grace: the
 * hull cost, then the rock's ram damage (the §3.3 formula with the ship as the other body; a fan break along −n).
 */
function shipRock(state: TacticalState, i: number, k: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, v = state.rocks, b = k * ROCK_STRIDE, radius = classOf(state, i).radius;
  const dx = s.x - v[b + 1]!, dy = s.y - v[b + 2]!, rr = radius + v[b + 5]!, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1, body = k + 1;
  const vc = (v[b + 3]! - s.vx) * nx + (v[b + 4]! - s.vy) * ny;
  if (v[b] === RockKind.Static && wakesAt(vc)) wakeRock(state, k);
  const mk = rockMass(v[b + 5]!);
  let hull: number;
  if (v[b] === RockKind.Static) {   // case 2: exactly today's hitStatic against a still rock
    s.x = v[b + 1]! + nx * rr; s.y = v[b + 2]! + ny * rr;
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
    hull = ASTEROID_CONTACT_HULL;
  } else {                          // case 3: two bodies
    const is = 1 / SHIP_MASS, ik = 1 / mk, overlap = rr - d, ss = (overlap * is) / (is + ik), sk = (overlap * ik) / (is + ik);
    s.x += nx * ss; s.y += ny * ss; v[b + 1]! -= nx * sk; v[b + 2]! -= ny * sk;
    if (vc > 0) {
      const j = ((1 + RESTITUTION) * vc) / (is + ik);
      s.vx += nx * j * is; s.vy += ny * j * is; v[b + 3]! -= nx * j * ik; v[b + 4]! -= ny * j * ik;
    }
    hull = ramHull((vc * mk) / (mk + SHIP_MASS));
  }
  if (state.tick < s.graceUntil[body]!) return;
  sys.hull = Math.max(0, sys.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  s.asteroidHits++;
  const dmg = crushDamage(vc, mk, SHIP_MASS);
  if (dmg <= 0) return;
  const broke = wearRock(state, k, dmg), a = rockAt(state, k);
  state.events.push({ kind: 'rock', what: 'bump', by: 'ram', rock: k, x: s.x - nx * radius, y: s.y - ny * radius, r: a.r, vx: a.vx, vy: a.vy, ship: i });
  if (broke) breakRock(state, k, -nx, -ny, 'ram', i, 'fan', [k]);
}

/** Spike ii §5.1: ship slot i's static contacts in the duel: the planet as today, then each rock of rocksNear (taken once,
 *  ascending), skipping slots born this tick or no longer alive. */
function duelStatics(state: TacticalState, i: number): void {
  const { map } = state, s = state.ships[i]!;
  if (hitStatic(state, i, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  for (const k of rocksNear(state, s.x, s.y, classOf(state, i).radius)) {
    if (!rockAlive(state, k) || state.rockBorn[k] === 1) continue;
    shipRock(state, i, k);
  }
}
```

Replace `resolveContacts` with:

```ts
/** Spec §4 order, per active body in slot order: its static contacts, then its contacts with every later active ship.
 *  `rocks` (spike ii §5.1, the duel): rocks are bodies (duelStatics); without it (stepFlight) today's hitStatics. */
export function resolveContacts(state: TacticalState, rocks = false): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    if (!state.ships[i]!.active) continue;
    if (rocks) duelStatics(state, i); else hitStatics(state, i);
    for (let j = i + 1; j < n; j++) if (state.ships[j]!.active) shipShip(state, i, j);
  }
}
```

- [ ] **Step 5: Edit `src/renderer/src/sim/tactical/duel.ts`**: `resolveContacts(state);` → `resolveContacts(state, true);   // spike ii §5.1: rocks are bodies in the duel`.

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockShips.test.ts tests/rockContacts.test.ts tests/rockBlast.test.ts tests/tacticalContacts.test.ts tests/tacticalSoloFlight.test.ts tests/tacticalFlight.test.ts tests/boundary.test.ts`
Expected: all PASS (`stepFlight` and `stepSoloFlight` keep today's contact: `resolveContacts`' default `rocks = false` and `hitStatics`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/duel.ts tests/rockShips.test.ts
git commit -m "feat(spike-ii): two-body ship-rock contacts, impact hull cost and ram damage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `rockLock` command end to end in the sim

**Files:**
- Modify: `src/renderer/src/net/contracts.ts:76-80` (DuelCommand), `src/renderer/src/net/codec.ts:117-118`, `src/renderer/src/sim/duel/step.ts:17, 30-32, 186-200`, `src/renderer/src/sim/tactical/weapons.ts:10-34, 56-58, 156-163`, `src/renderer/src/sim/tactical/hunter.ts:90`, `src/renderer/src/sim/tactical/hash.ts:125`
- Modify tests: `tests/ftlTargeting.test.ts:169`, `tests/duelModules.test.ts:144`
- Test: `tests/rockLock.test.ts`

**Interfaces:**
- Consumes: Tasks 4–5's `laserRock`/`torpRock` semantics, `canLaunch(state, i, torpRock)`.
- Produces:
  - `DuelCommand` member `{ kind: 'rockLock'; weapon: 'laser' | 'torpedo'; rock: number }`.
  - `ShipInput.rockLock: { laser: number | null; torpedo: number | null }`.
  - `export function validRockLock(state: TacticalState, weapon: unknown, rock: number): boolean;` in `weapons.ts`.
  - `shipModule.commands = ['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch']`.

- [ ] **Step 1: Write the failing test** `tests/rockLock.test.ts`:

```ts
// Spike ii §6.1: the rockLock command: the wire, validation in the duel step (stale, the seat, malformed, noop), its
// order after laserLock and torpLock (a same-tick rockLock wins for its weapon), its effects on the laser and the
// torpedo, and missileLaunch's admission with this tick's effective torpedo rock target.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { shipModule } from '../src/renderer/src/sim/tactical/hash';
import { rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { createSeatedDuel } from './helpers/duelSeat';

const layout = parseShip(cutter), NONE = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
const why = (rs: ReturnType<typeof step>) => rs.map((r) => r.reason ?? r.status);

describe('rockLock validation (spec §6.1)', () => {
  it('stale first, then the seat, then malformed, then noop for an empty slot; the gunner\'s applies', () => {
    const d = createSeatedDuel(layout, 5), t = d.tactical, s = t.systems[0], empty = rockSlots(t) - 1;
    try {
      const stale = { ...cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 }), requestedTick: d.interior.tick + 1 };
      const r = step(d, [stale,
        cmd(d, 0, { kind: 'rockLock', weapon: 'laser', rock: 0 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'gun', rock: 0 } as unknown as DuelCommand),
        cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: rockSlots(t) }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: -2 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 1.5 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: empty }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 })]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed', 'malformed', 'malformed', 'malformed', 'noop', 'applied']);
      expect([s.laserRock, s.laserTargeted, s.torpRock]).toEqual([0, true, -1]);
    } finally { disposeDuel(d); }
  });
});

describe('rockLock effects and order (spec §6.1)', () => {
  it('the laser: −1 clears it and laserTargeted; a laserLock clears the rock first; a same-tick rockLock beats a laserLock', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
    try {
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 })]);
      expect([s.laserRock, s.laserTargeted]).toEqual([0, true]);
      step(d, [cmd(d, 1, { kind: 'laserLock', room: 2 })]);
      expect([s.laserRock, s.lock, s.laserTargeted]).toEqual([-1, 2, true]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 }), cmd(d, 1, { kind: 'laserLock', room: 0 })]);
      expect([s.laserRock, s.lock, s.laserTargeted]).toEqual([0, 0, true]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: -1 })]);
      expect([s.laserRock, s.laserTargeted]).toEqual([-1, false]);
    } finally { disposeDuel(d); }
  });
  it('the torpedo: rockLock sets torpRock and clears torpLock; a torpLock clears torpRock; the same tick the rock wins', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
    try {
      step(d, [cmd(d, 1, { kind: 'torpLock', room: 1 })]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 })]);
      expect([s.torpRock, s.torpLock]).toEqual([0, -1]);   // the crew is far from rock 0: no launch
      step(d, [cmd(d, 1, { kind: 'torpLock', room: 2 })]);
      expect([s.torpRock, s.torpLock]).toEqual([-1, 2]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 }), cmd(d, 1, { kind: 'torpLock', room: 1 })]);
      expect([s.torpRock, s.torpLock]).toEqual([0, -1]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: -1 })]);
      expect(s.torpRock).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('missileLaunch is admitted with this tick\'s effective torpRock: a same-tick rockLock counts, a same-tick torpLock clears it', () => {
    const near = (d: DuelState): void => { const a = d.tactical.map.asteroids[0]!; Object.assign(d.tactical.ships[0], { x: a.x, y: a.y - 200, vx: 0, vy: 0 }); };
    const d = createSeatedDuel(layout, 5);
    try {
      near(d);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['unavailable']);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' }), cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 })]))).toEqual(['applied', 'applied']);
      expect([d.tactical.systems[0].torpRockFlying, d.tactical.systems[0].missilesLaunched]).toEqual([0, 1]);
    } finally { disposeDuel(d); }
    const e = createSeatedDuel(layout, 5);
    try {
      near(e); e.tactical.systems[0].torpRock = 0;
      expect(why(step(e, [cmd(e, 1, { kind: 'missileLaunch' }), cmd(e, 1, { kind: 'torpLock', room: 1 })]))).toEqual(['unavailable', 'applied']);
      expect([e.tactical.systems[0].torpRock, e.tactical.systems[0].torpLock, e.tactical.systems[0].missilesLaunched]).toEqual([-1, 1, 0]);
    } finally { disposeDuel(e); }
  });
});

describe('the wire and the module (spec §6.1)', () => {
  it('the ship module owns rockLock right after torpLock, and the duel codec carries it', () => {
    expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch']);
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const command of [{ kind: 'rockLock', weapon: 'laser', rock: 0 }, { kind: 'rockLock', weapon: 'torpedo', rock: -1 }, { kind: 'rockLock', weapon: 'laser', rock: 181 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(command)))).toEqual(envelope(command));
    for (const command of [{ kind: 'rockLock', weapon: 'gun', rock: 0 }, { kind: 'rockLock', weapon: 'laser', rock: -2 }, { kind: 'rockLock', weapon: 'laser', rock: 1.5 }, { kind: 'rockLock', rock: 0 }, { kind: 'rockLock', weapon: 'laser', rock: 0, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(command))).toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockLock.test.ts`
Expected: FAIL (typecheck of the `rockLock` command literal fails, or results are `not-in-duel`).

- [ ] **Step 3: Edit `src/renderer/src/net/contracts.ts`**: after the `torpLock` member of `DuelCommand` add:

```ts
  /** Spike ii §6.1: a weapon's rock target, a rock pool slot, or −1 to clear it. */
  | { kind: 'rockLock'; weapon: 'laser' | 'torpedo'; rock: number }
```

- [ ] **Step 4: Edit `src/renderer/src/net/codec.ts`**: after the `torpLock` schema line add:

```ts
      z.object({ kind: z.literal('rockLock'), weapon: z.enum(['laser', 'torpedo']), rock: z.number().int().min(-1).max(MAX_INDEX) }).strict(),   // spike ii §6.1
```

- [ ] **Step 5: Edit `src/renderer/src/sim/tactical/weapons.ts`**

In `ShipInput`, after `torpLock: number | null;` add:

```ts
  /** Spike ii §6.1: `rockLock {weapon, rock}` folded per weapon: a slot, −1 to clear, or null for no command this tick
   *  (the crew only). Applied after laserLock and torpLock, so it wins over a same-tick room lock for its weapon. */
  rockLock: { laser: number | null; torpedo: number | null };
```

`IDLE_INPUT` and `UNCREWED_INPUT` each gain `rockLock: { laser: null, torpedo: null },` after `torpLock: null,`. Add `rockSlots` to the `./rocks` import. After `validTarget` add:

```ts
/** Spike ii §6.1: a rockLock command's weapon is the laser or the torpedo, and its rock a whole slot −1 .. rockSlots − 1. */
export function validRockLock(state: TacticalState, weapon: unknown, rock: number): boolean {
  return (weapon === 'laser' || weapon === 'torpedo') && Number.isInteger(rock) && rock >= -1 && rock < rockSlots(state);
}
```

In `applyWeaponsInput`, replace the laserLock and torpLock lines (158-162) with:

```ts
  if (input.weapons && input.laserLock !== null && validTarget(input.laserLock)) {   // first: a burst shot reads this tick's lock
    s.laserRock = -1;   // spike ii §6.1: an accepted laserLock clears the laser's rock target first
    if (validLock(input.laserLock)) { s.lock = input.laserLock; if (crew) s.laserTargeted = true; }
    else if (crew) s.laserTargeted = false;
  }
  if (input.weapons && crew && input.torpLock !== null && validTarget(input.torpLock)) { s.torpRock = -1; s.torpLock = input.torpLock; }
  if (input.weapons && crew) {   // spike ii §6.1: rockLock, after laserLock and torpLock, before the burst
    const rl = input.rockLock, live = (k: number): boolean => k >= 0 && k < rockSlots(state) && rockAlive(state, k);
    if (rl.laser !== null) { if (live(rl.laser)) { s.laserRock = rl.laser; s.laserTargeted = true; } else if (rl.laser === -1) { s.laserRock = -1; s.laserTargeted = false; } }
    if (rl.torpedo !== null) { if (live(rl.torpedo)) { s.torpRock = rl.torpedo; s.torpLock = -1; } else if (rl.torpedo === -1) s.torpRock = -1; }
  }
```

(The old laserLock branch's `else if (input.laserLock === -1 && crew)` is the same as `validTarget(−1) && !validLock(−1) && crew`.)

- [ ] **Step 6: Edit `src/renderer/src/sim/tactical/hunter.ts` line 90**: add `rockLock: { laser: null, torpedo: null },` after `torpLock: null,`.

- [ ] **Step 7: Edit `src/renderer/src/sim/tactical/hash.ts` line 125**: `commands: ['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch'],`.

- [ ] **Step 8: Edit `src/renderer/src/sim/duel/step.ts`**

Line 17: `import { canCharge, canLaunch, validRockLock, validTarget, type ShipInput } from '../tactical/weapons';` and add `import { rockAlive } from '../tactical/rocks';`. Lines 30 and 32:

```ts
const WEAPON_ORDER = ['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch'] as const;
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];
```

Replace lines 189-200 (the crew ShipInput and the weapon-command loop) with:

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, scanner: true };
  // Spike ii §6.1: missileLaunch is admitted with this tick's effective torpedo rock target: the last accepted
  // rockLock(torpedo), else −1 after an accepted torpLock (it clears torpRock first), else the stored value.
  let torpRockNext: number | null = null, torpLocked = false;
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'rockLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }   // −1 clears the target
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; torpLocked = true; }
    else if (c.kind === 'rockLock') {
      if (!validRockLock(d.tactical, c.weapon, c.rock)) { result(e, 'malformed'); continue; }
      if (c.rock >= 0 && !rockAlive(d.tactical, c.rock)) { result(e, undefined, 'noop'); continue; }
      if (c.weapon === 'laser') crew.rockLock.laser = c.rock; else { crew.rockLock.torpedo = c.rock; torpRockNext = c.rock; }
    }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else {
      const torpRock = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);
      if (!canLaunch(d.tactical, 0, torpRock)) { result(e, 'unavailable'); continue; }
      crew.missileLaunch = true;
    }
    result(e);
  }
```

- [ ] **Step 9: Update the module lists in two existing tests**

- `tests/ftlTargeting.test.ts` line 169: `expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch']);`
- `tests/duelModules.test.ts` line 144: `expect(kinds).toEqual(['contactScan', 'designate', 'heading', 'laserCharge', 'laserFrequency', 'laserLock', 'missileLaunch', 'presence', 'rematch', 'rockLock', 'sit', 'stand', 'throttle', 'torpLock']);`

- [ ] **Step 10: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockLock.test.ts tests/ftlTargeting.test.ts tests/duelModules.test.ts tests/codecModeWire.test.ts tests/netCodec.test.ts tests/rockBlast.test.ts tests/rockLaser.test.ts tests/boundary.test.ts`
Expected: all PASS except golden-class trajectory cases in `duelModules`/`ftlTargeting`.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/hash.ts tests/rockLock.test.ts tests/ftlTargeting.test.ts tests/duelModules.test.ts
git commit -m "feat(spike-ii): rockLock command: wire, validation, order and folding" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: UI: dropping a weapon on a rock, brackets, TGT ROCK, right-click

**Files:**
- Modify: `src/renderer/src/app/duel/contactController.ts:37-41, 70-81, 85-155`, `src/renderer/src/render/tactical/tacticalModel.ts` (inputs, draw, `pickRock`), `src/renderer/src/render/tactical/tacticalLayer.ts` (after the asteroid loop), `src/renderer/src/app/duel/scene.ts:26, 178-179, 249-253`, `src/renderer/src/app/duel/input.ts:36, 47-51, 101, 120-121, 132-133, 143-144`, `src/renderer/src/ui/actions.ts:46-53`, `src/renderer/src/app/duel/runtime.ts:228, 282-290, 396-405`, `src/renderer/src/app/duel/onlineDuel.ts:235`, `src/renderer/src/render/duel/consoleModel.ts:26-27, 89-92`, `src/renderer/src/ui/duel/WeaponsStation.tsx:30, 37-43, 70-85`
- Modify tests: `tests/contactScene.test.ts` (append a case), `tests/duelRuntime.test.ts:48, 52` and append a case, `tests/crtColours.test.ts` (rock marks in the full frame)
- Test: `tests/rockTargetModel.test.ts`, `tests/rockTargetUi.test.tsx`

**Interfaces:**
- Consumes: the `rockLock` command (Task 7); the ship-system rock fields.
- Produces:
  - `contactController.ts`: `ContactRequests.rockLock?: { weapon: Weapon; rock: number }`; `ContactController.pickRock(slot: number): void`.
  - `tacticalModel.ts`: `export const ROCK_PICK_MIN_PX = 6; export function pickRock(input: Pick<TacticalModelInput, 'state' | 'camera' | 'viewport'>, p: Point): number | null; export interface RockMarkDraw { x: number; y: number; r: number; weapon: 'laser' | 'torpedo'; hover: boolean }`; `TacticalModelInput.rockHover?: { rock: number; weapon: 'laser' | 'torpedo' } | null`; `TacticalDraw.rockMarks?: RockMarkDraw[]`.
  - `input.ts`: `ConsoleInput.rockLock?(weapon: 'laser' | 'torpedo', rock: number): void`; `KeySample.rockTo?: { weapon: 'laser' | 'torpedo'; rock: number } | null`.
  - `consoleModel.ts`: `WeaponsPanel.laserRock?: boolean; torpRock?: boolean; torpRockFlying?: boolean`.
  - `WeaponsStation.tsx`: `targetText(room: number, rock?: boolean): string`.

- [ ] **Step 1: Write the failing tests**

`tests/rockTargetModel.test.ts`:

```ts
// Spike ii §6.5: the pure pieces of dropping a weapon on a rock: the pickRock hit test, the rock brackets in the map
// model, and the contact controller's pickRock request.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { pickRock, ROCK_PICK_MIN_PX, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { arena, mover } from './helpers/rockArena';

const vp = { w: 1280, h: 720 };

describe('pickRock (spec §6.5)', () => {
  it('returns the live rock whose drawn circle holds the pointer, the nearest centre first, ties to the lower slot', () => {
    const st = arena(), camera = createCamera(0, 2000, 1), at = (x: number, y: number) => worldToScreen(camera, vp, x, y), input = { state: st, camera, viewport: vp };
    mover(st, 10, 0, 2000, 0, 0, 40); mover(st, 5, 30, 2000, 0, 0, 40);
    expect(pickRock(input, at(15, 2000))).toBe(5);    // equidistant: the lower slot
    expect(pickRock(input, at(25, 2000))).toBe(5);
    expect(pickRock(input, at(5, 2000))).toBe(10);
    expect(pickRock(input, at(200, 2000))).toBeNull();
    mover(st, 20, 300, 2000, 0, 0, 2);
    expect(ROCK_PICK_MIN_PX).toBe(6);
    expect(pickRock(input, at(305, 2000))).toBe(20);  // a 2 px rock picks within 6 px
  });
});

describe('the rock brackets (spec §6.5)', () => {
  it('a targeted rock wears its weapon\'s mark (the torpedo\'s while it flies too); a hover mark under the pointer; none outside the duel', () => {
    const st = arena(), camera = createCamera(0, 2000, 1);
    mover(st, 10, 0, 2000, 0, 0, 30); mover(st, 11, 100, 2000, 0, 0, 30); mover(st, 12, -100, 2000, 0, 0, 30);
    st.systems[0].laserRock = 10; st.systems[0].torpRockFlying = 11;
    const input: TacticalModelInput = { state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera, viewport: vp, console: 'weapons', axes: NO_AXES,
      ships: [0], paused: false, reserveRight: 0, contacts: true, rockHover: { rock: 12, weapon: 'torpedo' } };
    const marks = tacticalModel(input).rockMarks!;
    expect(marks.map((m) => [m.weapon, m.hover])).toEqual([['laser', false], ['torpedo', false], ['torpedo', true]]);
    expect(marks[0]).toMatchObject({ x: 640, y: 360, r: 35 });
    expect(tacticalModel({ ...input, contacts: false }).rockMarks).toBeUndefined();
  });
});

describe('the contact controller\'s pickRock (spec §6.5)', () => {
  const live: ContactSync = { shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, enemyKnown: 2 };
  it('with a weapon picked up: a rockLock request, the pick-up disarmed and the window closed; with none: nothing', () => {
    const c = createContactController();
    c.sync(live);
    c.pickRock(7);
    expect(c.takeRequests().rockLock).toBeUndefined();
    c.pickUp('torpedo');
    c.pickRock(7);
    expect(c.takeRequests().rockLock).toEqual({ weapon: 'torpedo', rock: 7 });
    expect([c.state(), c.aimWeapon()]).toEqual([null, null]);
    expect(c.takeRequests().rockLock).toBeUndefined();   // taken once
  });
});
```

`tests/rockTargetUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// Spike ii §6.5: the Weapons cards read TGT ROCK while a weapon has a rock target, and a right-click clears the rock
// target (rockLock −1) when one is set, else the room target as today.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView, WeaponsPanel } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { targetText } from '../src/renderer/src/ui/duel/WeaponsStation';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
function mount(over: Partial<WeaponsPanel>) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), rockLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  const console: ConsoleView = {
    station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
    helm: null, science: null, side: null,
    weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
  };
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  const view: DuelUiView = { readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, contact: null };
  act(() => duel.frame(view));
  return { input };
}
const card = (w: 'laser' | 'torpedo') => (document.querySelector(`[data-testid="console-card-${w}"]`) as HTMLElement).firstElementChild as HTMLElement;
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => (e as HTMLElement).dataset.text);

describe('the Weapons cards with rock targets (spec §6.5)', () => {
  it('read TGT ROCK for the laser\'s rock and for the torpedo\'s (next or flying)', () => {
    expect([targetText(1), targetText(1, true), targetText(-1)]).toEqual(['TGT SHLD', 'TGT ROCK', 'TGT --']);
    mount({ laserRock: true, torpRockFlying: true });
    expect(texts().filter((t) => t === 'TGT ROCK')).toHaveLength(2);
  });
  it('a right-click clears the rock target when set, else the room target as today', () => {
    const a = mount({ laserRock: true, torpRock: true });
    fireEvent.pointerDown(card('laser'), { button: 2 }); fireEvent.pointerDown(card('torpedo'), { button: 2 });
    expect(a.input.rockLock.mock.calls).toEqual([['laser', -1], ['torpedo', -1]]);
    expect([a.input.lock.mock.calls.length, a.input.torpLock.mock.calls.length]).toEqual([0, 0]);
    cleanup();
    const b = mount({ torpRockFlying: true });   // a flying torpedo's rock is not the next shot's: the card clears the room
    fireEvent.pointerDown(card('laser'), { button: 2 }); fireEvent.pointerDown(card('torpedo'), { button: 2 });
    expect(b.input.rockLock).not.toHaveBeenCalled();
    expect([b.input.lock.mock.calls, b.input.torpLock.mock.calls]).toEqual([[[-1]], [[-1]]]);
  });
});
```

Append to `tests/contactScene.test.ts` (inside its `describe`; add `import { RockKind, rockSlots, writeRock } from '../src/renderer/src/sim/tactical/rocks';` at the top):

```ts
  it('spike ii §6.5: with a weapon picked up, a click on a rock (no ship under it) drops it there: a rockLock request, the window closes', () => {
    const r = rig();
    try {
      const t = r.rt.duel.tactical, me = t.ships[0], slot = rockSlots(t) - 1;
      writeRock(t, slot, RockKind.Moving, me.x + 150, me.y, 0, 0, 25, 3);
      r.contact.pickUp('laser'); r.scene.draw(r.rt, 1 / 60, LIVE);
      r.clicks.push(worldToScreen(r.rt.cameras.weapons, vp, me.x + 150, me.y)); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.takeRequests().rockLock).toEqual({ weapon: 'laser', rock: slot });
      expect(r.contact.state()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
```

In `tests/duelRuntime.test.ts`: add `import type { ContactRequests } from '../src/renderer/src/app/duel/contactController';`; line 48's requests type becomes `requests: ContactRequests = { designate: null, scan: null }`; line 52's reset becomes `keys = { ...k, presses: emptyPresses(), lockTo: null, torpTo: null, rockTo: null };`. Append inside its first `describe`:

```ts
  it('spike ii §6.5: a rock drop and a card\'s clear send rockLock from Weapons only; the sim\'s targets follow', () => {
    const { rt, ask, tick } = rig();
    rt.frame(1 / 60); tick();
    ask({ rockLock: { weapon: 'laser', rock: 0 } }); tick();
    expect(rt.duel.tactical.systems[0].laserRock).toBe(-1);   // at the Helm: no weapons commands
    rt.dispose();
    const g = rig(); g.press('switch'); g.tick();
    const s = g.rt.duel.tactical.systems[0];
    g.ask({ rockLock: { weapon: 'laser', rock: 0 } }); g.tick(); expect([s.laserRock, s.laserTargeted]).toEqual([0, true]);
    g.ask({ rockLock: { weapon: 'torpedo', rock: 0 } }); g.tick(); expect([s.torpRock, s.torpLock]).toEqual([0, -1]);
    g.hold({ rockTo: { weapon: 'laser', rock: -1 } }); g.tick(); expect([s.laserRock, s.laserTargeted]).toEqual([-1, false]);
    g.hold({ rockTo: { weapon: 'torpedo', rock: -1 } }); g.tick(); expect(s.torpRock).toBe(-1);
    expect(g.rt.lastResults().filter((r) => r.status === 'rejected')).toEqual([]);
    g.rt.dispose();
  });
```

In `tests/crtColours.test.ts`, `fullFrame`'s `d` gains (after `stars`): `rockMarks: [{ x: 300, y: 600, r: 20, weapon: 'laser', hover: false }, { x: 360, y: 600, r: 24, weapon: 'torpedo', hover: false }, { x: 300, y: 640, r: 12, weapon: 'laser', hover: true }, { x: 340, y: 640, r: 12, weapon: 'torpedo', hover: true }],`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/rockTargetModel.test.ts tests/rockTargetUi.test.tsx tests/contactScene.test.ts tests/duelRuntime.test.ts`
Expected: FAIL (`pickRock`, `rockMarks`, `pickRock` on the controller, `rockTo` missing; typecheck errors in the test files).

- [ ] **Step 3: Edit `src/renderer/src/app/duel/contactController.ts`**

`ContactRequests` becomes:

```ts
export interface ContactRequests { designate: number | null; scan: ContactId | null; torpStep?: number; rockLock?: { weapon: Weapon; rock: number } }
```

In the `ContactController` interface, after `pick(...)` add:

```ts
  /** Spike ii §6.5: a rock click while a weapon is picked up: request rockLock { weapon, rock: slot }, then disarm the
   *  pick-up and close the window. A no-op with no weapon picked up. */
  pickRock(slot: number): void;
```

In `createContactController`, add `let rockLock: { weapon: Weapon; rock: number } | null = null;` beside the other `let`s; add the method after `pick`:

```ts
    pickRock(slot) {
      if (!st?.aim) return;
      rockLock = { weapon, rock: slot };
      st = null;
    },
```

and `takeRequests` becomes:

```ts
    takeRequests() {
      const out: ContactRequests = { designate, scan: scanned, ...(torpStep !== 0 ? { torpStep } : {}), ...(rockLock ? { rockLock } : {}) };
      designate = null; scanned = null; torpStep = 0; rockLock = null;
      return out;
    }
```

- [ ] **Step 4: Edit `src/renderer/src/render/tactical/tacticalModel.ts`**

Imports: `import { rockAlive, rockAt, rockHp, rockSlots } from '../../sim/tactical/rocks';` stays (Task 9 changes `rockHp`). After `LockRingDraw` add:

```ts
/** Spike ii §6.5: a bracket about a rock: a weapon's rock target, or the rock under the pointer while a weapon is picked up. */
export interface RockMarkDraw { x: number; y: number; r: number; weapon: 'laser' | 'torpedo'; hover: boolean }
```

`TacticalDraw` gains `/** Spike ii §6.5 (only with contacts): the rock brackets. */ rockMarks?: RockMarkDraw[];`. `TacticalModelInput` gains:

```ts
  /** Spike ii §6.5: the rock under the pointer while a weapon is picked up (the scene's pickRock), for its hover bracket. */
  rockHover?: { rock: number; weapon: 'laser' | 'torpedo' } | null;
```

In `tacticalModel`, just before the final `return`, add:

```ts
  // Spike ii §6.5: the laser's rock target, the torpedo's (the next shot's, else the one in flight) and the hover.
  let rockMarks: RockMarkDraw[] | undefined;
  if (input.contacts) {
    rockMarks = [];
    const sys = state.systems[CREW_SLOT]!, list = rockMarks;
    const mark = (k: number, weapon: 'laser' | 'torpedo', hover: boolean): void => {
      if (k < 0 || !rockAlive(state, k)) return;
      const a = rockAt(state, k);
      if (!onScreen(a.x, a.y, a.r)) return;
      const p = toS(a.x, a.y);
      list.push({ x: p.x, y: p.y, r: Math.max(a.r * z, ROCK_PICK_MIN_PX) + 5, weapon, hover });
    };
    mark(sys.laserRock, 'laser', false);
    mark(sys.torpRock >= 0 ? sys.torpRock : sys.torpRockFlying, 'torpedo', false);
    if (input.rockHover) mark(input.rockHover.rock, input.rockHover.weapon, true);
  }
```

and add `...(rockMarks ? { rockMarks } : {}),` to the returned object. After `pickContact` add:

```ts
/** Spike ii §6.5: a rock drawn smaller than this (a dot at map zoom) is picked as if it were this big, in internal px. */
export const ROCK_PICK_MIN_PX = 6;
/** Spike ii §6.5: the live rock under a map click: among the rocks whose drawn circle (r · zoom, at least ROCK_PICK_MIN_PX)
 *  holds the point, the nearest centre; ties go to the lowest slot. null when none. */
export function pickRock(input: Pick<TacticalModelInput, 'state' | 'camera' | 'viewport'>, p: Point): number | null {
  let best: number | null = null, bestD = Infinity;
  for (let k = 0, n = rockSlots(input.state); k < n; k++) {
    if (!rockAlive(input.state, k)) continue;
    const a = rockAt(input.state, k), s = worldToScreen(input.camera, input.viewport, a.x, a.y), d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= Math.max(a.r * input.camera.zoom, ROCK_PICK_MIN_PX) && d < bestD) { best = k; bestD = d; }
  }
  return best;
}
```

- [ ] **Step 5: Edit `src/renderer/src/render/tactical/tacticalLayer.ts`**

In `draw`, right after the asteroid loop (the `for (const a of d.asteroids) { ... }` block, before `// Weapons update spec §2: the torpedo's range circle`) add:

```ts
      // Spike ii §6.5: rock brackets: the laser's four hot corners, the torpedo's dashed main ring; a hover mark in mid.
      for (const m of d.rockMarks ?? []) {
        const colour = m.hover ? CRT.mid : m.weapon === 'laser' ? CRT.hot : CRT.main;
        if (m.weapon === 'laser') {
          const k = Math.max(4, m.r * 0.45);
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
            marks.moveTo(m.x + sx * m.r, m.y + sy * (m.r - k)).lineTo(m.x + sx * m.r, m.y + sy * m.r).lineTo(m.x + sx * (m.r - k), m.y + sy * m.r).stroke({ width: 2, color: colour });
        } else segments(marks, dashCircle(m.x, m.y, m.r, DASH, GAP, seg), 2, colour);
      }
```

- [ ] **Step 6: Edit `src/renderer/src/app/duel/input.ts`**

`ConsoleInput` (line 36) becomes:

```ts
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; torpLock(room: number): void; throttle(level: number): void; frequency(freq: number): void;
  /** Spike ii §6.5: a weapon card's right-click clear of a rock target (rock −1); optional so older fakes still fit. */
  rockLock?(weapon: 'laser' | 'torpedo', rock: number): void }
```

`KeySample` gains, after `torpTo`:

```ts
  /** Spike ii §6.5: the last rock target request from the console (a card's clear, rock −1) since the previous sample, or null. */
  rockTo?: { weapon: 'laser' | 'torpedo'; rock: number } | null;
```

In `createDuelKeyboard`: add `rockTo: { weapon: 'laser' | 'torpedo'; rock: number } | null = null` to the `let` list (line 101); set `rockTo = null;` in `clearUi` and `clear`; add `rockLock(weapon, rock) { rockTo = { weapon, rock }; },` to `consoleInput` after `torpLock`; in `sample()`, add `rockTo` to `out` and `rockTo = null;` to the reset line.

- [ ] **Step 7: Edit `src/renderer/src/ui/actions.ts`**: in `consoleActions`, after `torpLock`, add `rockLock: (weapon, rock) => consoleInput?.rockLock?.(weapon, rock),`.

- [ ] **Step 8: Edit `src/renderer/src/app/duel/scene.ts`**

Line 26: `import { interpolatedShip, pickContact, pickRock, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';`. Lines 178-179 become:

```ts
      if (contact && click && onMap) {
        // Spike ii §6.5: a ship contact under the pointer wins; else, with a weapon picked up, a rock under it takes the drop.
        const at = { state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport }, ship = pickContact(at, click);
        const rock = ship === null && contact.aimWeapon() !== null ? pickRock(at, click) : null;
        if (rock !== null) contact.pickRock(rock); else contact.click(ship);
      }
```

In the map branch (`else {`, just before `const input = {`) add:

```ts
        // Spike ii §6.5: with a weapon picked up, the rock under the pointer (no ship contact there) wears a hover bracket.
        const point = aimed !== null ? options.pointer?.() ?? null : null, pickAt = { state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport };
        const hoverRock = point && pickContact(pickAt, point) === null ? pickRock(pickAt, point) : null;
```

and add `rockHover: hoverRock !== null && aimed !== null ? { rock: hoverRock, weapon: aimed } : null,` inside the `input` object (after `alert, pings`).

- [ ] **Step 9: Edit `src/renderer/src/app/duel/runtime.ts`**

Line 228: `const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserLock' || c.kind === 'torpLock' || c.kind === 'rockLock' || c.kind === 'laserCharge' || c.kind === 'missileLaunch';`. In `onTick`, replace `let launched = false;` with:

```ts
    let launched = false;
    // Spike ii §6.1: a launch is judged with this batch's torpedo rock target, as the sim admits it.
    const rockCmd = [...pending].reverse().find((c) => c.command.kind === 'rockLock' && c.command.weapon === 'torpedo')?.command;
    const torpRock = rockCmd && rockCmd.kind === 'rockLock' ? rockCmd.rock : pending.some((c) => c.command.kind === 'torpLock') ? -1 : d.tactical.systems[0].torpRock;
```

and `if (launched || !canLaunch(d.tactical, 0)) continue;` → `if (launched || !canLaunch(d.tactical, 0, torpRock)) continue;`. In `play`, after the `requests.torpStep` block add:

```ts
    // Spike ii §6.5: a rock drop (the contact controller) or a card's clear (a right-click) sends rockLock.
    if (requests.rockLock) queue({ kind: 'rockLock', weapon: requests.rockLock.weapon, rock: requests.rockLock.rock });
    if (k.rockTo) queue({ kind: 'rockLock', weapon: k.rockTo.weapon, rock: k.rockTo.rock });
```

- [ ] **Step 10: Edit `src/renderer/src/app/duel/onlineDuel.ts`**: after line 235 (`if (requests.torpStep) send(...)`) add:

```ts
    if (requests.rockLock) send({ kind: 'rockLock', weapon: requests.rockLock.weapon, rock: requests.rockLock.rock });   // spike ii §6.5
    if (k.rockTo) send({ kind: 'rockLock', weapon: k.rockTo.weapon, rock: k.rockTo.rock });
```

- [ ] **Step 11: Edit `src/renderer/src/render/duel/consoleModel.ts`**

`WeaponsPanel` (lines 26-27) gains, before the closing brace: `laserRock?: boolean; torpRock?: boolean; torpRockFlying?: boolean`, with a doc line above the interface: `/** Spike ii §6.5: whether the laser's rock target, the torpedo's next rock target and the flying torpedo's rock are set. */`. In the `weapons` object (line 90), after `burst: ...,` add `laserRock: sys.laserRock >= 0, torpRock: sys.torpRock >= 0, torpRockFlying: sys.torpRockFlying >= 0,`.

- [ ] **Step 12: Edit `src/renderer/src/ui/duel/WeaponsStation.tsx`**

Line 30:

```tsx
/** A target's words on a card: `TGT SHLD`, `TGT --` with none, or `TGT ROCK` with a rock target (spike ii §6.5). */
export const targetText = (room: number, rock = false): string => (rock ? 'TGT ROCK' : `TGT ${room >= 0 ? ROOM_LABELS[room] ?? '--' : '--'}`);
```

`Card` gains a `rock` prop and its right-click clears the rock target when set:

```tsx
function Card({ weapon, lit, crt, flash = false, glow = false, now = 0, rock = false }: { weapon: Weapon; lit: boolean; crt: boolean; flash?: boolean; glow?: boolean; now?: number; rock?: boolean }) {
  const actions = useActions(), c = weaponCard(weapon);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button === 2) {   // clear its target: spike ii §6.5, the rock target when set, else the room
      if (rock) actions.console.rockLock?.(weapon, -1);
      else if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1);
      return;
    }
    if (e.button === 0) actions.contact.pickUp(weapon);
  };
```

(the rest of `Card` is unchanged). In `WeaponsStation`: `const laserRock = weapons.laserRock === true, torpRock = weapons.torpRock === true || weapons.torpRockFlying === true;` after the `reason` line; the LASER card becomes `<Card weapon="laser" lit={aim === 'laser'} crt={crt} flash={firing} glow={weapons.goal === true && aim !== 'laser'} now={now} rock={laserRock} />`; the laser target line `<PixelText text={targetText(weapons.laserTarget, laserRock)} x={lx} y={L.y + 56} size={FONT_NATIVE} tint={weapons.laserTarget >= 0 || laserRock ? hot : dim} />`; the TORPEDO card `<Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} rock={weapons.torpRock === true} />`; its target line `<PixelText text={targetText(weapons.torpTarget, torpRock)} x={tx} y={T.y + 56} size={FONT_NATIVE} tint={weapons.torpTarget >= 0 || torpRock ? hot : dim} />`.

- [ ] **Step 13: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockTargetModel.test.ts tests/rockTargetUi.test.tsx tests/contactScene.test.ts tests/duelRuntime.test.ts tests/crtColours.test.ts tests/contactController.test.ts tests/targetingUi.test.tsx tests/uiActions.test.ts tests/duelConsoleModel.test.ts`
Expected: all PASS (`duelRuntime` and `contactScene` trajectory-free cases; any golden-class failure is Task 10's).

- [ ] **Step 14: Commit**

```bash
git add src/renderer/src/app/duel/contactController.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/input.ts src/renderer/src/ui/actions.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/rockTargetModel.test.ts tests/rockTargetUi.test.tsx tests/contactScene.test.ts tests/duelRuntime.test.ts tests/crtColours.test.ts
git commit -m "feat(spike-ii): drop a weapon on a rock: pick, brackets, TGT ROCK, right-click clear" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Feel: fx, shake, streaks, cracks, sound and the ROCKS tally (view-only)

**Files:**
- Create: `src/renderer/src/render/tactical/rockFx.ts`, `src/renderer/src/audio/rockSounds.ts`, `tests/rockFx.test.ts`, `tests/rockSounds.test.ts`
- Modify: `src/renderer/src/render/tactical/fxModel.ts:30-59, 85-102`, `src/renderer/src/render/tactical/weaponsModel.ts:55, 201-210`, `src/renderer/src/render/tactical/tacticalLayer.ts` (asteroid loop, effect loop), `src/renderer/src/render/tactical/tacticalModel.ts:8, 50-51, 316-323`, `src/renderer/src/app/duel/scene.ts:20, 211`, `src/renderer/src/app/duel/duelAudio.ts`, `src/renderer/src/render/duel/consoleModel.ts`, `src/renderer/src/ui/duel/WeaponsStation.tsx`
- Modify tests: `tests/crtColours.test.ts` (streak, new effects), `tests/rockTargetUi.test.tsx` (append the tally)

**Interfaces:**
- Consumes: the `rock` and `laser` events (Tasks 1–6), the live pool, `startShake`.
- Produces:
  - `fxModel.ts`: `FxItem.kind` adds `'chip' | 'speck' | 'shock' | 'core'`; `FxItem.vx?, vy?, size?: number`; `FxState.seed: number`; `export function fxRandom(fx: FxState): number;`
  - `rockFx.ts`: `CHIP_S = 0.4`, `CHIP_TAIL_S = 0.04`, `SPECK_S = 0.6`, `PUFF_S = 0.5`, `SHOCK_S = 0.35`, `CORE_FLASH_S = 0.15`, `BLAST_SPECK_S = 0.7`, `BLAST_SHAKE = { px: 8, s: 0.35, fade: 1500 }`, `BREAK_SHAKE = { px: 2, s: 0.12 }`; `export function pushRockFx(fx: FxState, events: readonly ViewEvent[]): void; export function pushRockShakes(fx: FxState, events: readonly ViewEvent[], crew: Point, onScreen: (x: number, y: number) => boolean): void; export function rockEffectDraw(it: FxItem, toS: (x: number, y: number) => Point, z: number): EffectDraw | null;`
  - `EffectDraw.kind` adds `'chip' | 'speck' | 'shock' | 'core'`.
  - `tacticalModel.ts`: `AsteroidDraw.streak?: { x: number; y: number; alpha: number }`; `STREAK_MIN_SPEED = 20`, `STREAK_S = 0.25`, `STREAK_MAX_U = 90`; wear `= clamp(1 − hp / hpMax, 0, 1)`.
  - `rockSounds.ts`: `ROCK_SOUNDS_PER_S = 6`, `ROCK_CRACK`, `ROCK_CRUNCH`, `ROCK_BOOM`, `ROCK_KNOCK: SoundRequest`; `export interface RockSoundWatch { played: number[] }`; `export function rockSounds(w: RockSoundWatch | null, events: readonly ViewEvent[], pan: Pan, now: number): { watch: RockSoundWatch; sounds: SoundRequest[] };`
  - `WeaponsPanel.rocks?: number`.

- [ ] **Step 1: Write the failing tests**

`tests/rockFx.test.ts`:

```ts
// Spike ii §7 items 1, 3, 4, 5, 6, 7: the view-only rock feedback: chips thrown back along the shot, a break's burst and
// specks, a dust puff, the blast's shockwave, core flash and spray, sparks on damaging rock-rock contacts only, the
// shakes (strong for a blast, falling with distance; light for a break; never past the strongest), the shockwave's
// growth, the moving-rock streaks and the cracks from hp / hpMax.
import { describe, expect, it } from 'vitest';
import { createFx, type FxItem, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { BLAST_SHAKE, CHIP_S, pushRockFx, pushRockShakes, rockEffectDraw, SHOCK_S } from '../src/renderer/src/render/tactical/rockFx';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { arena, mover, seeded } from './helpers/rockArena';

const rock = (what: 'split' | 'dust' | 'blast' | 'bump' | 'hit', by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' = 'laser', x = 100, y = 0): ViewEvent =>
  ({ kind: 'rock', what, by, rock: 3, x, y, r: what === 'blast' ? 120 : 30, vx: 20, vy: 0, ...(what === 'split' ? { pieces: [3, 4] } : {}) });
const of = (items: FxItem[], kind: FxItem['kind']) => items.filter((i) => i.kind === kind);

describe('rock fx (spec §7)', () => {
  it('a laser hit on a rock: a flare and 5 to 8 chips thrown back along the shot, living 0.4 s', () => {
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    const chips = of(fx.items, 'chip');
    expect(chips.length).toBeGreaterThanOrEqual(5); expect(chips.length).toBeLessThanOrEqual(8);
    for (const c of chips) { expect(c.vx!).toBeLessThan(0); expect(c.life).toBe(CHIP_S); }
    expect(of(fx.items, 'flare')).toHaveLength(1);
    const again = createFx(); pushRockFx(again, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    expect(of(again.items, 'chip').length).toBe(chips.length);   // seeded: the same frame gives the same spray
  });
  it('a break: a burst sized by the rock and 10 to 16 specks; dust: a burst and a puff; a hit alone: nothing', () => {
    const fx = createFx();
    pushRockFx(fx, [rock('split')]);
    expect(of(fx.items, 'burst')).toMatchObject([{ size: 30 }]);
    expect(of(fx.items, 'speck').length).toBeGreaterThanOrEqual(10); expect(of(fx.items, 'speck').length).toBeLessThanOrEqual(16);
    const dust = createFx(); pushRockFx(dust, [rock('dust')]);
    expect(of(dust.items, 'burst')).toHaveLength(1);
    expect(of(dust.items, 'speck').length).toBeGreaterThanOrEqual(6);
    const hit = createFx(); pushRockFx(hit, [rock('hit')]);
    expect(hit.items).toEqual([]);
  });
  it('a blast: a shockwave to its radius over 0.35 s, a core flash, 18 to 24 specks; a damaging rock-rock bump: one spark; a ram: none', () => {
    const fx = createFx();
    pushRockFx(fx, [rock('blast', 'torpedo')]);
    expect(of(fx.items, 'shock')).toMatchObject([{ life: SHOCK_S, size: 120 }]);
    expect(of(fx.items, 'core')).toHaveLength(1);
    expect(of(fx.items, 'speck').length).toBeGreaterThanOrEqual(18); expect(of(fx.items, 'speck').length).toBeLessThanOrEqual(24);
    const bump = createFx(); pushRockFx(bump, [rock('bump', 'collision'), rock('bump', 'ram')]);
    expect(bump.items.map((i) => i.kind)).toEqual(['spark']);
  });
  it('the shockwave grows to its radius with an ease-out; chips fly at their velocity', () => {
    const toS = (x: number, y: number) => ({ x, y });
    const shock: FxItem = { kind: 'shock', age: SHOCK_S / 2, life: SHOCK_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: 0, size: 120 };
    expect(rockEffectDraw(shock, toS, 0.5)!.r).toBeCloseTo(120 * 0.5 * 0.75, 9);
    const chip: FxItem = { kind: 'chip', age: 0.1, life: CHIP_S, x1: 10, y1: 0, x2: 10, y2: 0, colour: 0, vx: -100, vy: 0 };
    expect(rockEffectDraw(chip, toS, 1)).toMatchObject({ kind: 'chip', x1: 0, y1: 0 });
    expect(rockEffectDraw({ ...chip, kind: 'beam' }, toS, 1)).toBeNull();
  });
  it('shakes: a blast on screen 8 px falling with distance from the crew; off screen none; a break 2 px, never past a stronger one', () => {
    const crew = { x: 0, y: 0 }, all = () => true, none = () => false;
    const fx = createFx();
    pushRockShakes(fx, [rock('blast', 'torpedo', 300, 0)], crew, all);
    expect(fx.shakePx).toBeCloseTo(BLAST_SHAKE.px * (1 - 300 / BLAST_SHAKE.fade), 9);
    expect(fx.shake).toBe(BLAST_SHAKE.s);
    pushRockShakes(fx, [rock('split')], crew, all);
    expect(fx.shakePx).toBeCloseTo(BLAST_SHAKE.px * (1 - 300 / BLAST_SHAKE.fade), 9);
    const off = createFx(); pushRockShakes(off, [rock('blast', 'torpedo')], crew, none);
    expect(off.shake).toBe(0);
    const light = createFx(); pushRockShakes(light, [rock('split')], crew, all);
    expect([light.shakePx, light.shake]).toEqual([2, 0.12]);
  });
});

describe('streaks and cracks in the map model (spec §7 items 2, 3)', () => {
  const model = (st: ReturnType<typeof arena>) => tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(0, 2000, 1),
    viewport: { w: 1280, h: 720 }, console: 'weapons', axes: NO_AXES, ships: [0], paused: false, reserveRight: 0 } as TacticalModelInput);
  it('a rock faster than 20 u/s streaks behind it (length with speed); slower or static rocks do not', () => {
    const st = arena();
    mover(st, 10, 0, 2000, 100, 0, 10); mover(st, 11, 100, 2000, 10, 0, 10); seeded(st, 0);
    const m = model(st), fast = m.asteroids.find((a) => a.index === 10)!, slow = m.asteroids.find((a) => a.index === 11)!;
    expect(fast.streak).toMatchObject({ x: 640 - 25, y: 360 });
    expect(fast.streak!.alpha).toBeCloseTo(80 / 120, 9);
    expect(slow.streak).toBeUndefined();
  });
  it('wear is 1 − hp / hpMax', () => {
    const st = arena();
    mover(st, 10, 0, 2000, 0, 0, 30, 1.5);
    expect(model(st).asteroids.find((a) => a.index === 10)!.wear).toBeCloseTo(0.5, 12);
  });
});
```

`tests/rockSounds.test.ts`:

```ts
// Spike ii §7 item 8: the rock sounds: a crack on a laser hit, a crunch on a break, a deep boom on a blast, a soft knock
// on a damaging rock-rock contact, at most six a second, the boom first.
import { describe, expect, it } from 'vitest';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { ROCK_BOOM, ROCK_CRACK, ROCK_CRUNCH, ROCK_KNOCK, ROCK_SOUNDS_PER_S, rockSounds } from '../src/renderer/src/audio/rockSounds';

const pan = () => 0.1;
const ev = (what: 'hit' | 'split' | 'dust' | 'blast' | 'bump', by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet', rock = 1): ViewEvent =>
  ({ kind: 'rock', what, by, rock, x: 0, y: 0, r: 30, vx: 0, vy: 0 });

describe('rock sounds (spec §7 item 8)', () => {
  it('maps each event to its sound, the boom, then crunches, cracks and knocks', () => {
    const r = rockSounds(null, [ev('bump', 'collision'), ev('hit', 'laser'), ev('split', 'laser'), ev('blast', 'torpedo'), ev('bump', 'ram'), ev('dust', 'planet'), ev('hit', 'torpedo')], pan, 0);
    expect(r.sounds).toEqual([{ ...ROCK_BOOM, pan: 0.1 }, { ...ROCK_CRUNCH, pan: 0.1 }, { ...ROCK_CRACK, pan: 0.1 }, { ...ROCK_KNOCK, pan: 0.1 }]);
  });
  it('plays at most six a second', () => {
    expect(ROCK_SOUNDS_PER_S).toBe(6);
    let r = rockSounds(null, Array.from({ length: 10 }, (_, k) => ev('blast', 'torpedo', k)), pan, 0);
    expect(r.sounds).toHaveLength(6);
    r = rockSounds(r.watch, [ev('blast', 'torpedo')], pan, 0.5);
    expect(r.sounds).toHaveLength(0);
    r = rockSounds(r.watch, [ev('blast', 'torpedo')], pan, 1.01);
    expect(r.sounds).toHaveLength(1);
  });
});
```

Append to `tests/rockTargetUi.test.tsx` (inside its `describe`):

```tsx
  it('shows the ROCKS tally (spec §7 item 9)', () => {
    mount({ rocks: 3 });
    expect(texts()).toContain('ROCKS 3');
  });
```

In `tests/crtColours.test.ts` `fullFrame`: add to `asteroids` the entry `{ index: 6, x: 400, y: 600, r: 12, dot: false, streak: { x: 380, y: 610, alpha: 0.7 } }`; add to `effects`:

```ts
      { kind: 'chip', x1: 450, y1: 300, x2: 444, y2: 302, r: 0, colour: CRT.hot, alpha: 0.8 }, { kind: 'speck', x1: 460, y1: 300, x2: 460, y2: 300, r: 1.5, colour: CRT.main, alpha: 0.4 },
      { kind: 'speck', x1: 470, y1: 300, x2: 470, y2: 300, r: 1.5, colour: CRT.mid, alpha: 0.9 }, { kind: 'shock', x1: 500, y1: 300, x2: 500, y2: 300, r: 60, colour: CRT.hot, alpha: 0.5, width: 2.5 },
      { kind: 'core', x1: 520, y1: 300, x2: 520, y2: 300, r: 12, colour: CRT.hot, alpha: 0.9 }, { kind: 'burst', x1: 540, y1: 300, x2: 540, y2: 300, r: 36, colour: BURST, alpha: 0.6 }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockTargetUi.test.tsx tests/crtColours.test.ts`
Expected: FAIL (modules not found; `streak` and the new kinds unknown to the types).

- [ ] **Step 3: Edit `src/renderer/src/render/tactical/fxModel.ts`**

`FxItem` becomes:

```ts
/** `crew` (Feel-i): a crew beam, drawn thicker with its core; `side` its burst offset (-1 or 1). A `flare` is a crew hit's
 *  impact; a `pop` the enemy shield bubble flashing out (x1, y1 its centre); a `boom` the kill's explosion. Spike ii §7: a
 *  `chip` or `speck` flies from (x1, y1) at (vx, vy) world u/s; a `shock` ring grows to `size` world units; a `core` flash
 *  of `size`; a `burst` with a `size` is sized by its rock. */
export interface FxItem { kind: 'beam' | 'burst' | 'spark' | 'flare' | 'pop' | 'boom' | 'chip' | 'speck' | 'shock' | 'core'; age: number; life: number; x1: number; y1: number; x2: number; y2: number; colour: number; crew?: boolean; side?: number; vx?: number; vy?: number; size?: number }
```

`FxState` gains `/** Spike ii: the view's own seeded random (fxRandom), for the rock sprays. */ seed: number;`. `createFx` returns `..., beamSide: 1, seed: 1 }`; `resetFx` adds `fx.seed = 1;`. After `startShake` add:

```ts
/** Spike ii: the view's seeded random in [0, 1) (an xorshift on fx.seed): render-only, never the sim's. */
export function fxRandom(fx: FxState): number {
  let r = fx.seed >>> 0 || 1;
  r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0;
  fx.seed = r;
  return r / 4294967296;
}
```

In `pushEvents`, delete spike i's two rock lines: `if (rock) fx.items.push({ kind: 'spark', ... });   // SPIKE: the impact flare` and `} else if (e.kind === 'rock' && e.what !== 'hit') fx.items.push({ kind: 'burst', ... });   // SPIKE: a split or shatter` (so the next `else if (e.kind === 'missileEnd')` follows the laser branch); keep `const rock = ...` (it still colours the beam).

- [ ] **Step 4: Create `src/renderer/src/render/tactical/rockFx.ts`**

```ts
// Spike ii §7 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the rock feedback, view-owned and never hashed,
// driven by each tick's events: chips thrown back along a laser shot that met a rock, a burst sized by the rock and a
// ring of specks for a break, a puff for dust, a shockwave, core flash and heavy spray for a torpedo blast, a spark for a
// damaging rock-rock contact; the shakes for a blast and a break on screen; and their screen draws. On the CRT ramp only.
import type { Point } from './camera';
import { CRT } from './crtTheme';
import { BURST, BURST_S, FLARE_S, fxRandom, SPARK_S, startShake, type FxItem, type FxState, type ViewEvent } from './fxModel';
import type { EffectDraw } from './weaponsModel';

export const CHIP_S = 0.4, CHIP_TAIL_S = 0.04, SPECK_S = 0.6, PUFF_S = 0.5, SHOCK_S = 0.35, CORE_FLASH_S = 0.15, BLAST_SPECK_S = 0.7;
/** §7 item 6: a blast on screen shakes strongly, falling with distance from the crew ship (to 0 at `fade` u); a break lightly. */
export const BLAST_SHAKE = { px: 8, s: 0.35, fade: 1500 } as const, BREAK_SHAKE = { px: 2, s: 0.12 } as const;

/** An integer lo..hi from the view's random. */
const between = (fx: FxState, lo: number, hi: number): number => lo + Math.floor(fxRandom(fx) * (hi - lo + 1));
/** One flying particle from (x, y): its angle within ±spread of `angle`, its speed speed0..speed1, plus (bvx, bvy). */
function fling(fx: FxState, kind: 'chip' | 'speck', life: number, x: number, y: number, angle: number, spread: number, speed0: number, speed1: number, bvx: number, bvy: number, colour: number): void {
  const a = angle + (fxRandom(fx) * 2 - 1) * spread, sp = speed0 + fxRandom(fx) * (speed1 - speed0);
  fx.items.push({ kind, age: 0, life, x1: x, y1: y, x2: x, y2: y, vx: bvx + Math.cos(a) * sp, vy: bvy + Math.sin(a) * sp, colour });
}

/** Queue one tick's rock effects. */
export function pushRockFx(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind === 'laser' && (e.rock ?? -1) >= 0) {   // §7 item 1: the flare and the chips, back along the shot
      fx.items.push({ kind: 'flare', age: 0, life: FLARE_S, x1: e.x2, y1: e.y2, x2: e.x2, y2: e.y2, colour: CRT.hot });
      const back = Math.atan2(e.y1 - e.y2, e.x1 - e.x2);
      for (let n = between(fx, 5, 8); n > 0; n--) fling(fx, 'chip', CHIP_S, e.x2, e.y2, back, 0.6, 60, 160, 0, 0, CRT.hot);
      continue;
    }
    if (e.kind !== 'rock') continue;
    if (e.what === 'split' || e.what === 'dust') {   // §7 item 4 and §3.5
      fx.items.push({ kind: 'burst', age: 0, life: BURST_S * 2, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST, size: e.r });
      if (e.what === 'split') for (let n = between(fx, 10, 16), j = 0; j < n; j++) fling(fx, 'speck', SPECK_S, e.x, e.y, (2 * Math.PI * j) / n, 0.25, 80, 200, e.vx, e.vy, CRT.main);
      else {
        const moving = Math.hypot(e.vx, e.vy) > 1, along = moving ? Math.atan2(e.vy, e.vx) : 0;
        for (let n = between(fx, 6, 9); n > 0; n--) fling(fx, 'speck', PUFF_S, e.x, e.y, along, moving ? 0.8 : Math.PI, 20, 90, e.vx, e.vy, CRT.mid);
      }
    } else if (e.what === 'blast') {   // §7 item 5
      fx.items.push({ kind: 'shock', age: 0, life: SHOCK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r },
        { kind: 'core', age: 0, life: CORE_FLASH_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r * 0.3 });
      for (let n = between(fx, 18, 24), j = 0; j < n; j++) fling(fx, 'speck', BLAST_SPECK_S, e.x, e.y, (2 * Math.PI * j) / n, 0.3, 150, 320, 0, 0, CRT.hot);
    } else if (e.what === 'bump' && e.by === 'collision') fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });   // §7 item 7
  }
}

/** §7 item 6: the shakes for this tick's rock events on screen; startShake keeps the strongest running one. */
export function pushRockShakes(fx: FxState, events: readonly ViewEvent[], crew: Point, onScreen: (x: number, y: number) => boolean): void {
  for (const e of events) {
    if (e.kind !== 'rock' || !onScreen(e.x, e.y)) continue;
    if (e.what === 'blast') {
      const px = BLAST_SHAKE.px * Math.max(0, 1 - Math.hypot(e.x - crew.x, e.y - crew.y) / BLAST_SHAKE.fade);
      if (px >= 0.5) startShake(fx, px, BLAST_SHAKE.s);
    } else if (e.what === 'split' || (e.what === 'dust' && e.rock >= 0 && !e.evicted && e.by !== 'planet' && e.by !== 'edge')) startShake(fx, BREAK_SHAKE.px, BREAK_SHAKE.s);
  }
}

/** The screen draw of a rock effect at its age, or null for the other kinds: chips and specks at their world velocity,
 *  fading; the shockwave grows to its size with an ease-out, thinning; the core flash shrinks; a sized burst grows with its rock. */
export function rockEffectDraw(it: FxItem, toS: (x: number, y: number) => Point, z: number): EffectDraw | null {
  const k = Math.min(1, it.age / it.life), vx = it.vx ?? 0, vy = it.vy ?? 0, x = it.x1 + vx * it.age, y = it.y1 + vy * it.age, a = toS(x, y);
  const at = { x1: a.x, y1: a.y, x2: a.x, y2: a.y, colour: it.colour, alpha: 1 - k };
  if (it.kind === 'chip') { const b = toS(x - vx * CHIP_TAIL_S, y - vy * CHIP_TAIL_S); return { kind: 'chip', ...at, x2: b.x, y2: b.y, r: 0 }; }
  if (it.kind === 'speck') return { kind: 'speck', ...at, r: 1.5 };
  if (it.kind === 'shock') return { kind: 'shock', ...at, r: (it.size ?? 0) * z * (1 - (1 - k) * (1 - k)), width: 1 + 3 * (1 - k) };
  if (it.kind === 'core') return { kind: 'core', ...at, r: Math.max(4, (it.size ?? 0) * z) * (1 - 0.6 * k) };
  if (it.kind === 'burst' && it.size !== undefined) return { kind: 'burst', ...at, r: Math.max(6, it.size * z * (0.6 + 1.2 * k)) };
  return null;
}
```

- [ ] **Step 5: Edit `src/renderer/src/render/tactical/weaponsModel.ts`**

Line 55: `export interface EffectDraw { kind: 'beam' | 'burst' | 'spark' | 'flare' | 'pop' | 'boom' | 'shard' | 'chip' | 'speck' | 'shock' | 'core'; x1: number; y1: number; x2: number; y2: number; r: number; colour: number; alpha: number; width?: number; core?: boolean }`. Add `import { rockEffectDraw } from './rockFx';`. In the `effects` map, make the first statement inside the callback:

```ts
    const rockDraw = rockEffectDraw(it, toS, z);   // spike ii §7: chips, specks, the shockwave, the core flash, sized bursts
    if (rockDraw) return rockDraw;
```

- [ ] **Step 6: Edit `src/renderer/src/render/tactical/tacticalLayer.ts`**

At the top of the asteroid loop body (`for (const a of d.asteroids) {`), before `if (a.dot) ...`, add:

```ts
        if (a.streak) {   // spike ii §7 item 3: a moving rock's fading streak behind it
          const mx = (a.x + a.streak.x) / 2, my = (a.y + a.streak.y) / 2;
          bodies.moveTo(a.x, a.y).lineTo(mx, my).stroke({ width: Math.max(1, Math.min(3, a.r * 0.5)), color: CRT.mid, alpha: a.streak.alpha });
          bodies.moveTo(mx, my).lineTo(a.streak.x, a.streak.y).stroke({ width: 1, color: CRT.dim, alpha: a.streak.alpha * 0.6 });
        }
```

In the effect loop, before the final `else for (let k = 0; k < 4; k++) {...}` (the spark's X), add:

```ts
        else if (e.kind === 'chip') combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 1.5, color: colour, alpha: e.alpha });   // spike ii §7
        else if (e.kind === 'speck') combat.circle(e.x1, e.y1, e.r).fill({ color: colour, alpha: e.alpha });
        else if (e.kind === 'shock') combat.circle(e.x1, e.y1, Math.max(1, e.r)).stroke({ width: e.width ?? 2, color: colour, alpha: e.alpha });
        else if (e.kind === 'core') combat.circle(e.x1, e.y1, e.r).fill({ color: CRT.hot, alpha: e.alpha });
```

- [ ] **Step 7: Edit `src/renderer/src/render/tactical/tacticalModel.ts`**

Line 8: `import { rockAlive, rockAt, rockHpMax, RockKind, rockSlots } from '../../sim/tactical/rocks';`. `AsteroidDraw` (lines 50-51) becomes:

```ts
/** Spike ii: `wear` 0 (whole) .. 1 from hp / hpMax, drawn as cracks and a dimmer fill; `streak` (§7 item 3) the screen end of
 *  a moving rock's fading streak behind it, with its alpha. */
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean; wear?: number; streak?: { x: number; y: number; alpha: number } }
/** Spike ii §7 item 3: rocks faster than STREAK_MIN_SPEED (u/s) streak STREAK_S seconds of their motion, at most STREAK_MAX_U. */
export const STREAK_MIN_SPEED = 20, STREAK_S = 0.25, STREAK_MAX_U = 90;
```

The asteroid push (lines 321-322) becomes:

```ts
    const p = toS(a.x, a.y), speed = Math.hypot(a.vx, a.vy);
    const tail = a.kind === RockKind.Moving && speed > STREAK_MIN_SPEED ? Math.min(STREAK_MAX_U, speed * STREAK_S) / speed : 0;
    const streak = tail > 0 ? { ...toS(a.x - a.vx * tail, a.y - a.vy * tail), alpha: Math.min(1, (speed - STREAK_MIN_SPEED) / 120) } : null;
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX, wear: Math.max(0, Math.min(1, 1 - a.hp / rockHpMax(a.r))), ...(streak ? { streak } : {}) });
```

- [ ] **Step 8: Edit `src/renderer/src/app/duel/scene.ts`**

Line 20: add `import { pushRockFx, pushRockShakes } from '../../render/tactical/rockFx';`. After line 211 (`pushEvents(fx, events); pushHits(fx, events, d.tactical);`) add:

```ts
      pushRockFx(fx, events);   // spike ii §7: chips, breaks, blasts, sparks
      if (view !== 'interior') {   // spike ii §7 item 6: a blast or a break on this screen shakes it
        const cam = source.cameras[view], crewAt = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        pushRockShakes(fx, events, crewAt, (x, y) => { const p = worldToScreen(cam, viewport, x, y); return p.x >= 0 && p.x <= viewport.w && p.y >= 0 && p.y <= viewport.h; });
      }
```

- [ ] **Step 9: Create `src/renderer/src/audio/rockSounds.ts`**

```ts
// Spike ii §7 item 8: the rock sounds, from the same per-frame events the effects use (types only from the sim): a crack on
// a laser hit, a crunch on a break, a deep boom on a torpedo blast, a soft knock on a damaging rock-rock contact. A chain
// reaction plays at most ROCK_SOUNDS_PER_S in any second, the loudest kinds first. Volumes go through the SFX volume.
import type { ViewEvent } from '../render/tactical/fxModel';
import type { Pan } from './duelSounds';
import type { SoundRequest } from './soundBank';

export const ROCK_SOUNDS_PER_S = 6;
export const ROCK_CRACK: SoundRequest = { key: 'impactMetal', gain: 0.45, rate: 1.7, dur: 0.25 };
export const ROCK_CRUNCH: SoundRequest = { key: 'explosionCrunch', gain: 0.55, rate: 1.3 };
export const ROCK_BOOM: SoundRequest = { key: 'lowBoom', gain: 0.9 };
export const ROCK_KNOCK: SoundRequest = { key: 'impactMetal', gain: 0.25, rate: 0.6, dur: 0.2, filter: { type: 'lowpass', from: 900 } };
/** The play times (seconds of the audio clock) in the last second. */
export interface RockSoundWatch { played: number[] }

export function rockSounds(w: RockSoundWatch | null, events: readonly ViewEvent[], pan: Pan, now: number): { watch: RockSoundWatch; sounds: SoundRequest[] } {
  const played = (w?.played ?? []).filter((t) => t > now - 1), sounds: SoundRequest[] = [];
  const tiers: { sound: SoundRequest; x: number; y: number }[][] = [[], [], [], []];
  for (const e of events) {
    if (e.kind !== 'rock') continue;
    if (e.what === 'blast') tiers[0]!.push({ sound: ROCK_BOOM, x: e.x, y: e.y });
    else if ((e.what === 'split' || (e.what === 'dust' && !e.evicted)) && e.by !== 'planet' && e.by !== 'edge') tiers[1]!.push({ sound: ROCK_CRUNCH, x: e.x, y: e.y });
    else if (e.what === 'hit' && e.by === 'laser') tiers[2]!.push({ sound: ROCK_CRACK, x: e.x, y: e.y });
    else if (e.what === 'bump' && e.by === 'collision') tiers[3]!.push({ sound: ROCK_KNOCK, x: e.x, y: e.y });
  }
  for (const tier of tiers) for (const c of tier) {
    if (played.length >= ROCK_SOUNDS_PER_S) break;
    sounds.push({ ...c.sound, pan: pan(c.x, c.y) }); played.push(now);
  }
  return { watch: { played }, sounds };
}
```

- [ ] **Step 10: Edit `src/renderer/src/app/duel/duelAudio.ts`**

Add `import { rockSounds, type RockSoundWatch } from '../../audio/rockSounds';`. Add `let rockWatch: RockSoundWatch | null = null;` beside the other watches. In `frame`, after `lock = tone.watch;` add `const rocks = rockSounds(rockWatch, f.events, f.pan, clock); rockWatch = rocks.watch;` and append `...rocks.sounds` to `list`. In `reset`, add `rockWatch = null;`.

- [ ] **Step 11: The tally** — `src/renderer/src/render/duel/consoleModel.ts`: `WeaponsPanel` gains `rocks?: number` (doc: `/** Spike ii §7 item 9: the rocks the crew broke this round. */`); the `weapons` object adds `rocks: sys.rocksBroken,`. `src/renderer/src/ui/duel/WeaponsStation.tsx`: after the `3/4/5` PixelText add:

```tsx
      <PixelText text={`ROCKS ${weapons.rocks ?? 0}`} x={right} y={y0 + 134} size={FONT_NATIVE} tint={(weapons.rocks ?? 0) > 0 ? main : dim} anchorX={1} />
```

- [ ] **Step 12: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockTargetUi.test.tsx tests/crtColours.test.ts tests/audioDuel.test.ts tests/feelIiInput.test.ts tests/tacticalModel.test.ts tests/duelWeaponsView.test.ts tests/contactScene.test.ts`
Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/rockFx.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/audio/rockSounds.ts src/renderer/src/app/duel/duelAudio.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockTargetUi.test.tsx tests/crtColours.test.ts
git commit -m "feat(spike-ii): rock feel: chips, breaks, blasts, shakes, streaks, sounds, ROCKS tally" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: duelGates, goldens at SIM 53, the whole suite, the app smoke

**Files:**
- Create: `scripts/spike-asteroids-find-split.ts`
- Modify: `src/renderer/src/sim/tuning.ts:7` (SIM_VERSION 53), `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json` (by `npm run bless` only), trajectory-pinned tests found failing (only their pinned values and comments), and `src/renderer/src/sim/tactical/rockTuning.ts` only if duelGates needs a named knob.

**Interfaces:**
- Consumes: everything above. Produces: no new interfaces; the blessed goldens at SIM_VERSION 53.

- [ ] **Step 1: Typecheck and the gates first (before any bless)**

Run: `npm run typecheck && npx vitest run tests/duelGates.test.ts`
Expected: typecheck clean; duelGates PASS (median round 180–300 s; the crew both wins and loses). Read the printed telemetry lines and keep them for the report.

- [ ] **Step 2: If duelGates fails, tune only the spec's named knobs (§11.5), one step at a time, re-running Step 1 after each**

If the median round is under 180 s (pieces shorten rounds): (a) `ROCK_FLING` 150 → 120; (b) then `RAM_HULL_MAX` 4 → 3; (c) then `BLAST_SHIP_PUSH` 120 → 80. Stop at the first step that passes. If the median is over 300 s, or the crew never wins or never loses after (a)–(c), revert the knobs to the spec values and stop: record the numbers for the report and report BLOCKED to the controller. Every changed value goes in the report's "Tuning" section with the before and after gate lines. Commit any knob change by itself:

```bash
git add src/renderer/src/sim/tactical/rockTuning.ts
git commit -m "tune(spike-ii): <knob> <old> -> <new> for duelGates (spec §11.5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Same-version bless of the gameplay at SIM 52**

Run: `npm run bless`
Expected: it writes `tests/golden/basic.json`, `duel-1.json`, `duel-rematch.json` and `tests/fixtures/determinism-v2.json` at simVersion 52 (a same-version bless is a deliberate gameplay change); no refusal.

- [ ] **Step 4: Record the baselines at 52**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline && npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `baseline at sim version 52: ...` and `duel oracle baseline at sim version 52: ...`.

- [ ] **Step 5: Bump SIM_VERSION to 53 and bless version-only**

Edit `src/renderer/src/sim/tuning.ts` line 7: `export const SIM_VERSION = 53;`. Then run:

```bash
npx tsx scripts/golden/canonical-trace.ts check && npx tsx scripts/golden/duel-oracle.ts check && npm run bless && npx tsx scripts/golden/canonical-trace.ts golden
```

Expected: both checks report identical per-tick traces (52 → 53, no alias table needed: the schema did not change between the baseline and now); the bless writes all four artifacts at 53; `golden` reports basic.json differs only in version, content digest and hashes.

- [ ] **Step 6: Commit the goldens**

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(spike-ii): SIM_VERSION 53, goldens re-blessed by the two-step procedure" -m "Same-version bless of the billiard-asteroid gameplay at 52, canonical-trace and duel-oracle baselines at 52, then a version-only bump bless to 53 (verified per tick). No --fresh." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Write the SPLIT finder** `scripts/spike-asteroids-find-split.ts`:

```ts
// Re-finds tests/duelCheckpoint.test.ts's SPLIT after a gameplay change: per seed 1..10, the scripted duel's outcome and
// end tick, the first tick from 5000 on that ends with a missile in flight, a damaged crew room and a repair in progress
// (−1: none), and the end summary the test pins. Usage: npx tsx scripts/spike-asteroids-find-split.ts
// The duel helpers read the bundler-defined __GAMEPLAY_CONTENT_DIGEST__ at call time; tsx defines nothing, so it is
// supplied here before any duelInit (as vitest.config.ts does).
import { computeContentDigest } from '../build/contentDigest';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createDriver, duelCore, duelInit, stepScripted } from '../tests/helpers/duelAuthority';

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
for (let seed = 1; seed <= 10; seed++) {
  const h = duelCore(duelInit(seed)), driver = createDriver(seed);
  let split = -1;
  try {
    while (h.state.duel.tactical.outcome === Outcome.Running) {
      stepScripted(h, driver);
      const d = h.state.duel, tick = duelRules.tick(h.state);
      if (split < 0 && tick >= 5000 && d.tactical.missiles.some((m) => m.active) && d.tactical.systems[0].rooms.some((r) => r > 0) && d.repair.some((r) => r > 0)) split = tick;
    }
    console.log(`seed ${seed}: outcome ${h.state.duel.tactical.outcome} at tick ${duelRules.tick(h.state)}, SPLIT ${split}, summary ${JSON.stringify(h.state.summary)}`);
  } finally { h.core.dispose(); }
}
```

- [ ] **Step 8: Run the whole suite and fix trajectory-pinned fixtures only**

Run: `npx vitest run`
Expected: everything passes except tests that pin a scripted trajectory (a tick, a count or a summary from a scripted duel). For each such failure:
- `tests/duelCheckpoint.test.ts`: run `npx tsx scripts/spike-asteroids-find-split.ts`; keep `SEED = 1` if it has a SPLIT, else take the lowest seed that has one; set `SEED`, `SPLIT` and the `toMatchObject` summary to the printed values, and prepend the history comment with `Seed N's scripted duel is a crew win/loss at tick T (SIM_VERSION 53, spike ii billiard asteroids; at SPLIT S).`
- Any other test that names a pinned tick in its comment (for example `duelModules.test.ts`' `played(6, 2808)` "has a missile in flight"): find the new tick by the rule its comment states (step the same scripted duel and print the first qualifying tick), update the number and add `(SIM_VERSION 53, spike ii)` to its history comment.
- A failure that is not a pinned trajectory (a real rule break) is a bug in Tasks 1–9: fix it there with a failing test first; do not edit the expectation. After any such sim fix: re-run `npm run bless` (a same-version bless at 53, which `scripts/golden/blessGuard.ts` allows), re-run Step 1's duelGates, and commit the re-blessed goldens together with the fix.

Re-run `npx vitest run` until it is green. Commit only the test files changed plus the finder:

```bash
git add scripts/spike-asteroids-find-split.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts
git commit -m "test(spike-ii): re-find trajectory-pinned fixtures at SIM 53" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any other re-pinned test file to the `git add`.)

- [ ] **Step 9: The two-process app smoke**

Run: `npm run test:duel-app-runtime`
Expected: PASS (two processes, hash agreement, peer-lost pause and rejoin). Note its duration for the report.

---

### Task 11: Measurement: the stress script, the feel proxies, the cost gate

**Files:**
- Create: `scripts/spike-asteroids-ii-measure.ts`
- Modify: `scripts/profile-duel-publication.ts` (`--movers N`)
- Conditional (only if the p99 gate fails): `src/renderer/src/sim/tactical/rocks.ts`, `src/renderer/src/sim/tactical/state.ts`, `src/renderer/src/sim/tactical/hash.ts`, `src/renderer/src/sim/tactical/rockContacts.ts`, `src/renderer/src/sim/tactical/contacts.ts`, `src/renderer/src/sim/tactical/duel.ts`, `tests/rockContacts.test.ts`, `tests/tacticalDeterminism.test.ts`

**Interfaces:**
- Consumes: the whole sim. Produces: JSON results (in the scratchpad) for the report; conditionally the moving-rock grid (`MoverGrid`, `buildMoverGrid`, `dropMoverGrid`, `moverMoved`, `moverAdded` in `rocks.ts`).

- [ ] **Step 1: Write `scripts/spike-asteroids-ii-measure.ts`**

```ts
// Spike ii (billiard asteroids) measurements (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md §9.1, §9.4, §9.5):
//   npx tsx scripts/spike-asteroids-ii-measure.ts [--json <path>] [--only stress|feel|sizes]
// 1. Stress (§9.1, §9.5): seeds 1..20, 4,000 tactical ticks each with the Hunter switched off, a torpedo into the belt
//    every 10 s and the laser at the nearest rock whenever charged; twin runs hashed every 500 ticks; a save (flatten)
//    and restore (validate, unflatten into a fresh state) at tick 4,000, then 1,000 more ticks on both; stepDuel's cost
//    per tick (the gate: p99 under 0.5 ms) and the moving-rock count every 10 s. The driver parks the crew 300 u outward
//    of the biggest live belt rock when nothing is in torpedo range, keeps its hull full, tops the magazine up before each
//    torpedo and turns the nose onto the laser's rock (script-side writes, identical in both twins).
// 2. Feel proxies (§9.4): seed 2026, the 10 largest belt rocks, one rock-targeted torpedo each from 300 u outward, at
//    rest, facing the rock; pieces made and damaging collisions among the blast's family within 5 s; breaks, the farthest
//    piece travel and the moving count 30 s after the blast.
// 3. Sizes (§9.5): the duel snapshot, its full image and its 20 Hz delta images with 0 and with 60 moving rocks.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { flattenTactical, hashTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, rockAlive, rockAt, RockKind, rockSlots, ROCK_STRIDE, type RockView } from '../src/renderer/src/sim/tactical/rocks';
import { classOf, createTacticalState, missileOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT, laserFull, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { duelPublicationToImage, type DuelPublication } from '../src/network/modes/duelStream';
import { encodeDelta, encodeFull, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const argAt = (name: string): string | null => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] ?? null : null; };
const only = argAt('--only'), want = (part: string): boolean => only === null || only === part;
const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const quantile = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const round = (v: number, d = 4): number => Number(v.toFixed(d));
function movingCount(st: TacticalState): number { let n = 0; for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * ROCK_STRIDE] === RockKind.Moving) n++; return n; }

/** Switch slot i off as an inactive slot holds it (zeros): the Hunter neither thinks nor collides, and validation accepts it. */
function switchOff(st: TacticalState, i: number): void {
  const ship = st.ships[i]!, sys = st.systems[i]! as unknown as Record<string, unknown>;
  Object.assign(ship, { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 });
  ship.graceUntil.fill(0);
  for (const key of Object.keys(sys)) sys[key] = key === 'rooms' ? [0, 0, 0] : typeof sys[key] === 'boolean' ? false : 0;
}
/** The heading index (0 north, 64 east) nearest the bearing from (x, y) to (tx, ty). Script-side trigonometry. */
const headingTo = (x: number, y: number, tx: number, ty: number): number => ((Math.round((Math.atan2(tx - x, -(ty - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
/** Park ship 0 at rest `gap` u outward of rock k (away from the planet), facing it. */
function parkOutward(st: TacticalState, k: number, gap = 300): void {
  const a = rockAt(st, k), d = Math.hypot(a.x, a.y), x = a.x + (a.x / d) * gap, y = a.y + (a.y / d) * gap;
  Object.assign(st.ships[0], { x, y, vx: 0, vy: 0, heading: headingTo(x, y, a.x, a.y), headingAcc: 0 });
}
function nearest(st: TacticalState, dist: (a: RockView) => number, within: number): number {
  let best = -1, bd = Infinity;
  for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const d = dist(rockAt(st, k)); if (d <= within && d < bd) { best = k; bd = d; } }
  return best;
}
function biggestBelt(st: TacticalState): number {
  let best = -1;
  for (let k = 0; k < st.map.beltCount; k++) if (rockAlive(st, k) && (best < 0 || rockAt(st, k).r > rockAt(st, best).r)) best = k;
  return best;
}
/** The stress driver's input for this tick (see the header). */
function drive(st: TacticalState): ShipInput {
  const sys = st.systems[0]!, me = st.ships[0]!, input: ShipInput = { ...IDLE_INPUT, rockLock: { laser: null, torpedo: null } };
  sys.hull = classOf(st, 0).hull;
  if (st.tick % 600 === 0 && !missileOf(st, 0)) {
    sys.magazine = classOf(st, 0).slots.missile.magazine;
    let k = nearest(st, (a) => Math.hypot(a.x - me.x, a.y - me.y), classOf(st, 0).slots.missile.range);
    if (k < 0) { k = biggestBelt(st); if (k >= 0) parkOutward(st, k); }
    if (k >= 0) input.rockLock.torpedo = k;
  }
  if (sys.laserBurst === 0 && laserFull(st, 0) && sys.laserRock < 0) {
    const k = nearest(st, (a) => Math.hypot(a.x - me.x, a.y - me.y) - a.r, classOf(st, 0).slots.laser.range);
    if (k >= 0) { const a = rockAt(st, k); me.heading = headingTo(me.x, me.y, a.x, a.y); me.headingAcc = 0; input.rockLock.laser = k; }
  }
  return input;
}

const stress = want('stress') ? (() => {
  const times: number[] = [], failures: string[] = [], moving: number[][] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const a = createTacticalState(seed), b = createTacticalState(seed), marks: number[] = [];
    switchOff(a, 1); switchOff(b, 1);
    for (let k = 0; k < 4000; k++) {
      const ia = drive(a), ib = drive(b), t0 = performance.now();
      stepDuel(a, ia); times.push(performance.now() - t0);
      stepDuel(b, ib);
      if (a.tick % 600 === 0) marks.push(movingCount(a));
      if ((k + 1) % 500 === 0 && hashTactical(a) !== hashTactical(b)) { failures.push(`seed ${seed} tick ${k + 1}: twin runs differ`); break; }
    }
    moving.push(marks);
    const values = flattenTactical(a), c = createTacticalState(seed);
    validateTacticalValues(c, values); unflattenTactical(c, values);
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: the restored state's hash differs`);
    for (let k = 0; k < 1000; k++) { stepDuel(a, drive(a)); stepDuel(c, drive(c)); }
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: save and restore diverged`);
  }
  const p99 = quantile(times, 0.99), marks = moving[0]?.length ?? 0;
  return {
    seeds: 20, ticks: 4000, restoreTicks: 1000, failures,
    stepDuelMs: { median: round(median(times)), p99: round(p99), max: round(Math.max(...times)) }, p99GateMs: 0.5, p99Pass: p99 < 0.5,
    movingEvery10s: { max: Array.from({ length: marks }, (_, j) => Math.max(...moving.map((m) => m[j] ?? 0))), median: Array.from({ length: marks }, (_, j) => median(moving.map((m) => m[j] ?? 0))) }
  };
})() : null;

function feelShot(rock: number) {
  const st = createTacticalState(2026), family = new Set<number>();
  switchOff(st, 1); parkOutward(st, rock);
  let blastAt = -1, bx = 0, by = 0, blastRock = -1, pieces = 0, breaks = 0, collisions = 0, far = 0, movingAt30s = -1;
  for (let k = 0; k < 3000 && (blastAt < 0 || st.tick - 1 < blastAt + 1800); k++) {
    stepDuel(st, { ...IDLE_INPUT, rockLock: { laser: null, torpedo: k === 0 ? rock : null } });
    const now = st.tick - 1;
    for (const e of st.events) {
      if (e.kind !== 'rock') continue;
      if (e.what === 'blast' && blastAt < 0) { blastAt = now; bx = e.x; by = e.y; blastRock = e.rock; family.add(e.rock); }
      if (blastAt < 0 || now > blastAt + 300) continue;
      if (e.what === 'hit' && e.by === 'torpedo' && now === blastAt) family.add(e.rock);
      else if (e.what === 'split') {
        const fam = family.has(e.rock);
        for (const p of e.pieces ?? []) { if (fam) family.add(p); else family.delete(p); }
        if (fam) { pieces += (e.pieces ?? []).length; breaks++; }
      } else if (e.what === 'dust' && e.rock >= 0 && family.has(e.rock)) { family.delete(e.rock); if (!e.evicted && e.by !== 'planet' && e.by !== 'edge') breaks++; }
      else if (e.what === 'bump' && e.by === 'collision' && (family.has(e.rock) || family.has(e.other ?? -1))) collisions++;
    }
    if (blastAt >= 0 && now <= blastAt + 300) for (const s of family) if (rockAlive(st, s)) { const a = rockAt(st, s); far = Math.max(far, Math.hypot(a.x - bx, a.y - by)); }
    if (blastAt >= 0 && now === blastAt + 1800) movingAt30s = movingCount(st);
  }
  return { rock, r: round(st.map.asteroids[rock]!.r, 1), blasted: blastAt >= 0, blastRock, pieces, breaks, collisions, farthestTravel: Math.round(far), movingAt30s };
}
const feel = want('feel') ? (() => {
  const shape = createTacticalState(2026), big = Array.from({ length: shape.map.beltCount }, (_, k) => k).sort((x, y) => shape.map.asteroids[y]!.r - shape.map.asteroids[x]!.r || x - y).slice(0, 10);
  const rows = big.map(feelShot), passing = rows.filter((r) => r.pieces >= 8 && r.collisions >= 2).length;
  return { seed: 2026, rows, passing, floor: '>= 8 pieces and >= 2 damaging collisions in >= 7 of 10', floorPass: passing >= 7 };
})() : null;

const sizes = want('sizes') ? (() => {
  const contentDigest = computeContentDigest(process.cwd()), layout = DUEL_LAYOUT;
  const options = { resolveLayout: (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; }, contentDigest };
  let seed = 2026;
  while (validateMap(createTacticalState(seed).map).length > 0) seed++;
  const publication = (d: DuelState, sequence: number): DuelPublication => {
    const snapshot = saveDuelSnapshot(d, contentDigest);
    return { runId: 'profile', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
      pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
  };
  const deltas = (d: DuelState, pair: ReturnType<typeof createScriptedPair>, ticks: number, first: number): number[] => {
    let previous: StateImage = duelPublicationToImage(publication(d, first), options);
    const out: number[] = [];
    for (let k = 0; k < ticks; k++) {
      stepDuelTick(d, scriptedInput(pair, d));
      if (k % 3 !== 2) continue;   // a 20 Hz publication every third tick
      const image = duelPublicationToImage(publication(d, first + k + 1), options);
      out.push(encodeDelta(previous, image).byteLength); previous = image;
    }
    return out;
  };
  const d = createDuel(layout, seed), pair = createScriptedPair(seed);
  try {
    for (let k = 0; k < 3000; k++) stepDuelTick(d, scriptedInput(pair, d));
    const snap = saveDuelSnapshot(d, contentDigest), full = encodeFull(duelPublicationToImage(publication(d, 1), options)).byteLength;
    const still = deltas(d, pair, 600, 2), t = d.tactical;
    beginRockTick(t);
    for (let k = 0; k < t.map.asteroids.length && movingCount(t) < 60; k++) if (t.rocks[k * ROCK_STRIDE] === RockKind.Static && rockAt(t, k).r >= 25) breakRock(t, k, 1, 0, 'collision', -1, 'fan');
    const moversAtStart = movingCount(t), flying = deltas(d, pair, 300, 1000), moversAtEnd = movingCount(t);
    return { seed, tick: 3000, values: snap.values.length, jsonBytes: JSON.stringify(snap).length, fullImageBytes: full,
      delta0: { median: median(still), max: Math.max(...still) }, delta60: { moversAtStart, moversAtEnd, median: median(flying), max: Math.max(...flying) } };
  } finally { disposeDuel(d); }
})() : null;

const result = { simVersion: SIM_VERSION, stress, feel, sizes };
console.log(JSON.stringify(result, null, 2));
const out = argAt('--json');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
if ((stress && (!stress.p99Pass || stress.failures.length > 0)) || (feel && !feel.floorPass)) process.exitCode = 1;
```

- [ ] **Step 2: Add `--movers N` to `scripts/profile-duel-publication.ts`**

Add imports `import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';` and `import { beginRockTick, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';`. After the warm loop (`for (let k = 0; k < WARM; k++) ...`) insert:

```ts
  // Spike ii §9.5: `--movers N` breaks static rocks (fan) until N rocks move, then samples (they decay while sampling).
  const moversAt = process.argv.indexOf('--movers'), movers = moversAt > 0 ? Number(process.argv[moversAt + 1]) : 0;
  const moving = (): number => { let n = 0; for (let k = 0; k < d.tactical.rocks.length; k += ROCK_STRIDE) if (d.tactical.rocks[k] === RockKind.Moving) n++; return n; };
  if (movers > 0) {
    beginRockTick(d.tactical);
    for (let k = 0; k < d.tactical.map.asteroids.length && moving() < movers; k++)
      if (d.tactical.rocks[k * ROCK_STRIDE] === RockKind.Static && d.tactical.rocks[k * ROCK_STRIDE + 5]! >= 25) breakRock(d.tactical, k, 1, 0, 'collision', -1, 'fan');
  }
  const moversAtStart = moving();
```

and add `movers: moversAtStart,` to `result`.

- [ ] **Step 3: Run the measurements on this branch**

```bash
SCR=/c/Users/djuar/AppData/Local/Temp/claude/86da55dbee83ee65/e5d2d162-fb66-4ee0-85a9-584b0a19138f/scratchpad/spike-ii
npx tsx scripts/spike-asteroids-ii-measure.ts --json $SCR/ii.json
npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-ii-0.json
npx tsx scripts/profile-duel-publication.ts --movers 60 --json $SCR/pub-ii-60.json
```

Expected: `stress.failures` empty, `stress.p99Pass` true, `feel.floorPass` true; both publication runs within budget (host < 1.5 ms, client < 1.0 ms; the script exits non-zero otherwise).
- If `feel.floorPass` is false: do not tune (no knob is named for it); record the rows for the report and report it to the controller as a failed acceptance item.
- If `stress.p99Pass` is false: do Steps 4–7 (the moving-rock grid), then re-run this step once. If p99 still fails with the grid in place, do not tune: record `stepDuelMs` in the report and stop with BLOCKED (spec §9.5 acceptance failed). Otherwise skip to Step 8.

- [ ] **Step 4 (only if p99 failed): Write the failing grid test** — append to `tests/rockContacts.test.ts` (add `buildMoverGrid, dropMoverGrid, moverAdded, moverMoved, writeRock, wakeRock, beginRockTick` to its `rocks` import):

```ts
describe('the moving-rock grid (spec §9.5 fallback)', () => {
  it('returns exactly the linear scan\'s rocks while rocks move, are written and wake mid-tick', () => {
    const st = createTacticalState(4);
    for (let k = 0, broken = 0; k < st.map.asteroids.length && broken < 8; k++) if (st.map.asteroids[k]!.r >= 35) { breakRock(st, k, 1, 1, 'laser', 0, 'fan'); broken++; }
    for (let t = 0; t < 120; t++) stepDuel(st, IDLE_INPUT);
    beginRockTick(st); buildMoverGrid(st);
    let shifted = 0;
    for (let k = 0; k < rockSlots(st) && shifted < 20; k++) if (st.rocks[k * 7] === RockKind.Moving) { st.rocks[k * 7 + 1]! += 30; moverMoved(st, k); shifted++; }
    const free = (): number => { for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * 7] === 0) return k; return -1; };
    for (const [x, y] of [[100, 1500], [-900, 400]] as const) { const k = free(); writeRock(st, k, RockKind.Moving, x, y, 0, 0, 12, 2); moverAdded(st, k); }
    const s = st.map.asteroids.findIndex((_, k) => st.rocks[k * 7] === RockKind.Static); wakeRock(st, s); moverAdded(st, s);
    const boxes = Array.from({ length: 60 }, (_, q) => [-2600 + ((q * 977) % 5200), -2600 + ((q * 571) % 5200), 20 + (q % 7) * 60] as const);
    const viaGrid = boxes.map(([x, y, h]) => rocksNear(st, x, y, h));
    dropMoverGrid(st);
    expect(viaGrid).toEqual(boxes.map(([x, y, h]) => rocksNear(st, x, y, h)));
  });
});
```

Run: `npx vitest run tests/rockContacts.test.ts` — Expected: FAIL (`buildMoverGrid` not exported).

- [ ] **Step 5 (only if p99 failed): Implement the grid**

In `src/renderer/src/sim/tactical/rocks.ts` add (and route `rocksNear`'s moving part through it):

```ts
/** Spike ii §9.5 fallback: the moving rocks bucketed by MOVER_CELL, built once a tick at the start of stepRocks' contacts
 *  and dropped at the tick's end and at its start. A query widens its box by the largest moving radius and by how far any
 *  bucketed rock has moved since the build (moverMoved), and scans the rocks added since (moverAdded) in full, so it sees a
 *  superset of the linear scan's rocks; the exact box test then gives the same ascending, no-repeat result. Not hashed. */
export const MOVER_CELL = 200, MOVER_SPAN = 64;
export interface MoverGrid { built: boolean; cells: Map<number, number[]>; at: Float64Array; maxR: number; drift: number; extra: number[]; stamp: Uint32Array; epoch: number }
export function createMoverGrid(slots: number): MoverGrid { return { built: false, cells: new Map(), at: new Float64Array(2 * slots), maxR: 0, drift: 0, extra: [], stamp: new Uint32Array(slots), epoch: 0 }; }
const cellOf = (v: number): number => Math.max(-MOVER_SPAN, Math.min(MOVER_SPAN - 1, Math.floor(v / MOVER_CELL)));
const cellKey = (cx: number, cy: number): number => (cx + MOVER_SPAN) * (2 * MOVER_SPAN) + (cy + MOVER_SPAN);
export function buildMoverGrid(s: TacticalState): void {
  const n = rockSlots(s);
  if (s.moverGrid.at.length !== 2 * n) s.moverGrid = createMoverGrid(n);
  const g = s.moverGrid, v = s.rocks;
  g.cells.clear(); g.extra.length = 0; g.maxR = 0; g.drift = 0;
  for (let k = 0; k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const x = v[b + 1]!, y = v[b + 2]!, key = cellKey(cellOf(x), cellOf(y)), list = g.cells.get(key);
    g.at[2 * k] = x; g.at[2 * k + 1] = y; g.maxR = Math.max(g.maxR, v[b + 5]!);
    if (list) list.push(k); else g.cells.set(key, [k]);
  }
  g.built = true;
}
export function dropMoverGrid(s: TacticalState): void { s.moverGrid.built = false; }
/** A moving rock k changed position after the build (a separation): widen every later query by how far it went. */
export function moverMoved(s: TacticalState, k: number): void {
  const g = s.moverGrid;
  if (!g.built) return;
  const b = k * ROCK_STRIDE, dx = s.rocks[b + 1]! - g.at[2 * k]!, dy = s.rocks[b + 2]! - g.at[2 * k + 1]!;
  g.drift = Math.max(g.drift, Math.sqrt(dx * dx + dy * dy));
}
/** Slot k became a moving rock after the build (a new piece, a woken rock): every later query scans it. */
export function moverAdded(s: TacticalState, k: number): void {
  const g = s.moverGrid;
  if (!g.built) return;
  const b = k * ROCK_STRIDE;
  g.extra.push(k); g.at[2 * k] = s.rocks[b + 1]!; g.at[2 * k + 1] = s.rocks[b + 2]!; g.maxR = Math.max(g.maxR, s.rocks[b + 5]!);
}
```

`rocksNear` becomes:

```ts
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (const k of queryGrid(s.grid, x, y, h)) if (v[k * ROCK_STRIDE] === RockKind.Static) out.push(k);
  let moving = false;
  const take = (k: number): void => {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) return;
    const r = v[b + 5]!;
    if (Math.abs(v[b + 1]! - x) <= h + r && Math.abs(v[b + 2]! - y) <= h + r) { out.push(k); moving = true; }
  };
  const g = s.moverGrid;
  if (g.built) {
    const reach = h + g.maxR + g.drift, epoch = ++g.epoch;
    const once = (k: number): void => { if (g.stamp[k] === epoch) return; g.stamp[k] = epoch; take(k); };
    for (let cx = cellOf(x - reach); cx <= cellOf(x + reach); cx++) for (let cy = cellOf(y - reach); cy <= cellOf(y + reach); cy++) for (const k of g.cells.get(cellKey(cx, cy)) ?? []) once(k);
    for (const k of g.extra) once(k);
  } else for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) take(k);
  if (moving) out.sort((a, b) => a - b);
  return out;
}
```

Hooks: in `writeRock` add after the `set`: `if (kind === RockKind.Moving) moverAdded(s, k);`; in `wakeRock`, inside the `if`, after setting the kind: `moverAdded(s, k);`; in `beginRockTick` (both paths) add `dropMoverGrid(s);` first. `state.ts`: `TacticalState` gains `/** Spike ii §9.5: the moving-rock grid, transient (rocks.ts). */ moverGrid: MoverGrid;` (import the type from `./rocks`), `createTacticalState` adds `moverGrid: createMoverGrid(rockCapacity(map)),` (import `createMoverGrid`). `hash.ts`: `notSnapshotted` adds `moverGrid: 'spike ii §9.5: the moving-rock grid, rebuilt every tick'`; the clone adds `moverGrid: createMoverGrid(s.rocks.length / ROCK_STRIDE),` (import `createMoverGrid`). `rockContacts.ts`: import `buildMoverGrid, moverMoved` and call `buildMoverGrid(s);` right before part 2's loop; in `resolveRockPair`, after the separation block add `moverMoved(s, a); if (moving) moverMoved(s, b);`. `contacts.ts` (`shipRock` case 3): after the separation line add `moverMoved(state, k);` (import it). `duel.ts`: after `resolveMissiles(state);` add `dropMoverGrid(state);` (import it). `tests/tacticalDeterminism.test.ts` state keys: insert `'moverGrid'` after `'missiles'`.

- [ ] **Step 6 (only if p99 failed): Prove the grid changes nothing**

Run: `npm run typecheck && npx vitest run tests/rockContacts.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/golden.test.ts tests/determinismHarness.test.ts tests/boundary.test.ts`
Expected: all PASS with the goldens unchanged (the grid returns the linear scan's exact results).

- [ ] **Step 7 (only if p99 failed): Commit the grid**

```bash
git add src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/duel.ts tests/rockContacts.test.ts tests/tacticalDeterminism.test.ts
git commit -m "perf(spike-ii): moving-rock grid for rocksNear (spec §9.5 fallback)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then re-run Step 3 once (its BLOCKED rule applies if p99 still fails).

- [ ] **Step 8: Measure master and spike i for the comparison table**

```bash
SCR=/c/Users/djuar/AppData/Local/Temp/claude/86da55dbee83ee65/e5d2d162-fb66-4ee0-85a9-584b0a19138f/scratchpad/spike-ii
git worktree add --detach $SCR/master-wt 21b41758
cmd //c mklink /J "$(cygpath -w $SCR/master-wt/node_modules)" "C:\\Users\\djuar\\FTLite\\node_modules"
git show 577bb00c:scripts/spike-asteroids-measure.ts > $SCR/master-wt/scripts/spike-asteroids-measure.ts
(cd $SCR/master-wt && npx tsx scripts/spike-asteroids-measure.ts --json $SCR/master.json && npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-master.json)
(cd /c/Users/djuar/FTLite/.worktrees/spike-asteroids && npx tsx scripts/spike-asteroids-measure.ts --json $SCR/spike-i.json && npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-spike-i.json)
git worktree remove --force $SCR/master-wt
```

Expected: four JSON files. The spike i worktree (`.worktrees/spike-asteroids`) is only read and run, never edited. If `mklink` fails because the junction exists, skip it.

- [ ] **Step 9: Commit the scripts**

```bash
git add scripts/spike-asteroids-ii-measure.ts scripts/profile-duel-publication.ts
git commit -m "chore(spike-ii): stress, feel-proxy and size measurements; publication profile with movers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The staging hook, the screenshots, the report

**Files:**
- Modify: `src/renderer/src/app/duel/duelMode.ts:19, 69-70`
- Create: `scripts/spike-asteroids-ii-shots.cjs`, `docs/superpowers/research/2026-11-18-asteroid-spike-ii.md`
- Output (not committed): `C:\Users\djuar\FTLite-shots\asteroid-spike-ii\*.png`

**Interfaces:**
- Consumes: the whole build; the JSON from Task 11; the duelGates lines from Task 10.
- Produces: `globalThis.__spikeAsteroids = { duel, rockAt, rockSlots, writeRock, RockKind, hitRock, breakRock, pushRock, beginRockTick, seatWeapons }` (solo only).

- [ ] **Step 1: Extend the solo staging hook** in `src/renderer/src/app/duel/duelMode.ts`:

Imports (line 19 and the Task 2 `hitRock` line) become:

```ts
import { beginRockTick, rockAt, RockKind, rockSlots, writeRock } from '../../sim/tactical/rocks';
import { breakRock, hitRock, pushRock } from '../../sim/tactical/rockBreak';
import { sitDown } from '../../sim/stations';
```

Lines 69-70 become:

```ts
  // SPIKE ii (billiard asteroids): a staging hook for the screenshots, solo only. Never in a shipped build. `seatWeapons`
  // sits the active character at Weapons (the tests' seatDuelCrew way), so the shots need no walking.
  (globalThis as unknown as { __spikeAsteroids?: unknown }).__spikeAsteroids = {
    duel: () => runtime.duel, rockAt, rockSlots, writeRock, RockKind, hitRock, breakRock, pushRock, beginRockTick,
    seatWeapons: () => { const d = runtime.duel; sitDown(d.interior, runtime.active(), d.weapons); }
  };
```

Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 2: Write `scripts/spike-asteroids-ii-shots.cjs`**

```js
// Spike ii (billiard asteroids) screenshots, spec §9.7: single player at Weapons on the CRT map, staged through the solo
// hook globalThis.__spikeAsteroids (app/duel/duelMode.ts). The crew is pinned at rest outward of a big belt rock, the
// Hunter pinned far off. Usage: install playwright-core@1.48.2 in a scratch folder, copy this file there, run
// `npm run build` in the worktree, then `node spike-asteroids-ii-shots.cjs [out dir] [worktree]`.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/asteroid-spike-ii';
  const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/asteroids-ii';
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast2-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(2500);
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(800);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
  const read = (key) => page.evaluate((k) => { const t = globalThis.__spikeAsteroids.duel().tactical; return k === 'asteroidHits' ? t.ships[0].asteroidHits : t[k]; }, key);
  const waitMore = (key, from, ms = 12000) => page.waitForFunction(([k, f]) => { const t = globalThis.__spikeAsteroids.duel().tactical; return (k === 'asteroidHits' ? t.ships[0].asteroidHits : t[k]) > f; }, [key, from], { polling: 16, timeout: ms });
  // Park the crew `gap` u outward of a big static belt rock at least 900 u from the ones used before, facing it; pin the Hunter far off.
  const stage = (gap) => page.evaluate((g) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, belt = [];
    for (let k = 0; k < t.map.beltCount; k++) { const a = h.rockAt(t, k); if (a.kind === 1 && a.r >= 38) belt.push({ k, ...a }); }
    belt.sort((p, q) => q.r - p.r);
    const used = globalThis.__used || [], pick = belt.find((b) => used.every((u) => Math.hypot(b.x - u.x, b.y - u.y) > 900)) || belt[0];
    used.push(pick); globalThis.__used = used;
    const d = Math.hypot(pick.x, pick.y), ux = pick.x / d, uy = pick.y / d, x = pick.x + ux * g, y = pick.y + uy * g;
    const heading = ((Math.round((Math.atan2(pick.x - x, -(pick.y - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
    clearInterval(globalThis.__pin);
    const pin = () => { const tt = h.duel().tactical; Object.assign(tt.ships[0], { x, y, vx: 0, vy: 0, heading, headingAcc: 0 }); Object.assign(tt.ships[1], { x: -x - 400, y: -y, vx: 0, vy: 0 }); };
    pin(); globalThis.__pin = setInterval(pin, 5);
    return { rock: pick.k, r: pick.r, x, y, ux, uy };
  }, gap);
  const sys = (patch, rock) => page.evaluate(([p, k]) => { const s = globalThis.__spikeAsteroids.duel().tactical.systems[0]; for (const [key, v] of Object.entries(p)) s[key] = v === 'ROCK' ? k : v; }, [patch, rock]);

  // b0, b1: the laser chips a rock (sparks), then splits it (pieces streaking).
  const a = await stage(220);
  const hits0 = await read('rockHits'), splits0 = await read('rockSplits');
  await sys({ laserRock: 'ROCK', laserTargeted: true }, a.rock);
  await waitMore('rockHits', hits0); await page.waitForTimeout(60); await shot('b0-laser-chip');
  await waitMore('rockSplits', splits0); await page.waitForTimeout(250); await shot('b1-laser-split');
  // b2, b3: a rock-targeted torpedo's blast mid-expansion, then the belt seconds after.
  const c = await stage(300);
  const blasts0 = await read('rockBlasts');
  await sys({ laserRock: -1, torpLock: -1, torpRock: 'ROCK' }, c.rock);
  await waitMore('rockBlasts', blasts0); await page.waitForTimeout(140); await shot('b2-blast-shockwave');
  await page.waitForTimeout(3000); await shot('b3-belt-after-blast');
  // b4: a piece strikes the crew ship (thrown in from outside the belt).
  const e = await stage(260);
  const touch0 = await read('asteroidHits');
  await page.evaluate((s) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, me = t.ships[0];
    let slot = -1; for (let k = 0; k < h.rockSlots(t); k++) if (h.rockAt(t, k).kind === 0) { slot = k; break; }
    h.writeRock(t, slot, h.RockKind.Moving, me.x + s.ux * 170, me.y + s.uy * 170, -s.ux * 220, -s.uy * 220, 18, 2);
  }, e);
  await waitMore('asteroidHits', touch0, 4000); await shot('b4-piece-hits-crew');
  // b5: a rock wearing the laser's target bracket (its surface beyond laser range, so it only wears the mark).
  const f = await stage(600);
  await sys({ torpRock: -1, laserRock: 'ROCK', laserTargeted: true }, f.rock);
  await page.waitForTimeout(400); await shot('b5-laser-target-bracket');
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Build and take the shots**

```bash
SCR=/c/Users/djuar/AppData/Local/Temp/claude/86da55dbee83ee65/e5d2d162-fb66-4ee0-85a9-584b0a19138f/scratchpad/spike-ii
npm run build
mkdir -p $SCR/pw && (cd $SCR/pw && npm init -y >/dev/null && npm install playwright-core@1.48.2)
cp scripts/spike-asteroids-ii-shots.cjs $SCR/pw/
node $SCR/pw/spike-asteroids-ii-shots.cjs C:/Users/djuar/FTLite-shots/asteroid-spike-ii C:/Users/djuar/FTLite/.worktrees/asteroids-ii
```

Expected: six PNGs `b0-laser-chip`, `b1-laser-split`, `b2-blast-shockwave`, `b3-belt-after-blast`, `b4-piece-hits-crew`, `b5-laser-target-bracket` in `C:\Users\djuar\FTLite-shots\asteroid-spike-ii\`, and `errors []`. Open each PNG (Read tool) and check it shows what its name says; if one does not (for example the shot fired before the screenshot), adjust only that stage's wait in the script and re-run.

- [ ] **Step 4: The ROCK_GRAVITY note**

```bash
SCR=/c/Users/djuar/AppData/Local/Temp/claude/86da55dbee83ee65/e5d2d162-fb66-4ee0-85a9-584b0a19138f/scratchpad/spike-ii
sed -i 's/^export const ROCK_GRAVITY = 1.0;/export const ROCK_GRAVITY = 0.0;/' src/renderer/src/sim/tactical/rockTuning.ts
npx tsx scripts/spike-asteroids-ii-measure.ts --only feel --json $SCR/feel-g0.json; true
git checkout -- src/renderer/src/sim/tactical/rockTuning.ts
git diff --exit-code src/renderer/src/sim/tactical/rockTuning.ts
```

Expected: `feel-g0.json` written; the tuning file restored (the diff is empty). Compare `movingAt30s` and `farthestTravel` with `ii.json`'s feel rows for the report.

- [ ] **Step 5: Write the report** `docs/superpowers/research/2026-11-18-asteroid-spike-ii.md` with exactly these sections, filled from the files named:

1. `# Spike report: billiard asteroids (2026-11-18)` — one paragraph: spec link, branch, SIM 52 → 53 on the branch only, not for merge.
2. `## What was built` — one bullet per task 1–9 (the modules and rules in one line each, in the spec's words), plus the deviations list from this plan's "Deviations and clarifications".
3. `## Numbers` with tables:
   - **Determinism** (from `ii.json` `stress`): twin runs seeds 1–20 × 4,000 ticks (agree or the failure lines), save/restore at 4,000 + 1,000 ticks, the checkpoint continuation test (Task 10 Step 8's seed and SPLIT), goldens re-blessed by the two-step procedure, `boundary.test.ts`.
   - **Cost**: `stepDuelMs.median`, `.p99`, `.max` and the gate (p99 < 0.5 ms: PASS/FAIL); whether the moving-rock grid was built.
   - **Snapshot and publication** (columns master / spike i / spike ii; from `master.json`, `spike-i.json` `sizes`, and `ii.json` `sizes`; publication from `pub-master.json`, `pub-spike-i.json`, `pub-ii-0.json`, `pub-ii-60.json`): snapshot values, snapshot JSON bytes, full image bytes, 20 Hz delta median and max with 0 moving rocks, with 60 (`delta60`, noting `moversAtStart` and `moversAtEnd`), host ms per tick (budget 1.5), client ms per publication (budget 1.0).
   - **Feel proxies** (from `ii.json` `feel.rows`): one row per rock: slot, r, blasted rock, pieces, breaks, damaging collisions, farthest travel, moving at 30 s; then `passing` / 10 against the floor.
   - **Moving rocks over a stress round** (`movingEvery10s.median` and `.max` per 10 s mark).
   - **duelGates** (Task 10 Step 1's printed lines): median round, wins and losses, and any tuning applied with its before and after lines.
   - **App smoke**: `npm run test:duel-app-runtime` result and duration.
4. `## ROCK_GRAVITY` — 1.0 versus 0.0 from `ii.json` and `feel-g0.json` (moving count at 30 s, farthest travel), and what that means for a pushed belt rock (with gravity it never rests and drifts in at about 1.7 u/s² at the belt; without it, it coasts under drag).
5. `## Screenshots` — the six files in `C:\Users\djuar\FTLite-shots\asteroid-spike-ii\`, one line each saying what it shows.
6. `## What felt good, and what did not` — from the shots and the numbers (as spike i's report did), honest both ways.
7. `## Risks` — spec §11's five, each with what the measurements showed.
8. `## Recommendation` — ship / ship simpler / drop, with the reason in one paragraph.
9. `## Owner's play test` — numbered steps: Single player; sit at Weapons; click TORPEDO, then a belt rock near the Hunter (watch the blast, the pieces, the cracks); click LASER, then a rock (watch the chips, the push, the split); right-click LASER to clear; take the Helm (Tab) and ram a moving piece; read ROCKS n on the Weapons card.
10. `## Reproduce` — the exact commands of Task 11 Steps 3 and 8 and Task 12 Steps 3–4.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/duelMode.ts scripts/spike-asteroids-ii-shots.cjs docs/superpowers/research/2026-11-18-asteroid-spike-ii.md
git commit -m "docs(spike-ii): staging hook, screenshots script and the spike ii report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (section → task):

| Spec | Task |
|---|---|
| §0 owner decisions 1–8 | 4, 5 (weapons unchanged, billiards, blasts), 3 (rock-on-rock damage), 4/7/8 (targets on purpose and by accident), 6 (pieces hurt ships; torpedoes meet pieces in 5), 5 (blast pushes ships only), Global Constraints (spike, single player) |
| §2 starting point (merge already done at 674a8768; AUTO_DIG off) | 1 (on the merged tip), 4 |
| §3.1 pool, mass, real hp, hpMax, wake, born mask, single-ship paths | 1, 2 (born writes), 6 (single-ship paths), 9 (cracks from hp/hpMax) |
| §3.2 motion | 3 |
| §3.3 rock-on-rock | 3 |
| §3.4 breaking, tables, slot use, eviction, rewritten slot | 2 |
| §3.5 dust | 2, 9 (puff) |
| §4.1 laser shot | 4 |
| §4.2 blast | 5 |
| §5.1 ship contact, hull cost, ram damage | 6 |
| §5.2 torpedoes and pieces | 5 (detonation on any rock, born skipped) |
| §6.1 fields, command, wire, order, admission, validation, folding, effects, self-clearing | 1 (fields), 2 (self-clearing), 7 (command) |
| §6.2 laser with a rock target, card words | 4 |
| §6.3 accidental hits, AUTO_DIG, hostility | 4 (hostility unchanged: `shots++` kept) |
| §6.4 torpedo with a rock target | 5 |
| §6.5 UI | 8 |
| §7 items 1–7, 9 | 9 (8 is sound, also 9) |
| §8 events and counters | 1 (shape, counters), 2–6 (emitters), 9 (consumers) |
| §9.1 determinism | 11 (stress twins, save/restore), 10 (checkpoint, goldens, boundary) |
| §9.2 broad phase | 3 (and 11 for the grid fallback) |
| §9.3 physics tests | 2 (burst/fan counts, radii, areas, eviction, target clearing, reused slot), 3 (momentum, ≤30, lighter, static ≤40, pair once), 4 (Δv = J/m, laser break counts), 5 (blast fall-off, direct hit counts, born reuse, homing torpedo), 6 (hull examples, static ≤40) |
| §9.4 feel proxies | 11 |
| §9.5 cost gate, grid fallback, sizes, publication | 11 |
| §9.6 existing gates | 10 |
| §9.7 screenshots | 12 |
| §10 deliverables | 10–12 |
| §11 risks | 12 (report), 10 (duelGates knobs) |

**Placeholder scan:** every code step is complete; the only fill-from-data step is the report (Task 12 Step 5), whose numbers come from named JSON fields; Task 10 Step 8's fixture re-pinning is a procedure with a committed finder script, because the new pinned values only exist after the change.

**Name and type consistency:** `breakRock(s, k, ux, uy, by, ship, pattern, exclude?)` (Tasks 2, 3, 5, 6, 11), `hitRock(s, k, dmg, ux, uy, by, ship?)` (2, 4, 5), `pushRock`, `wearRock`, `dustRock(s, k, by, ship?)`, `crushDamage(vc, own, other)` (3, 6), `resolveRockPair` (3), `detonateTorpedo(s, owner, x, y, mvx, mvy, rock)` (5), `rockOnTarget`/`rockShotLine`/`laserStrikesRock` (4), `torpedoInRange`/`canLaunch(state, i, torpRock?)` (5, 7, 8), `ShipInput.rockLock` (7, 11), `ContactRequests.rockLock` and `KeySample.rockTo` (8), `rockMarks`/`rockHover`/`pickRock` (8), `FxItem.vx/vy/size`, `rockEffectDraw` (9), state fields `laserRock`, `torpRock`, `torpRockFlying`, `rocksBroken`, `rockDust`, `rockBlasts`, `rockCollisions`, `rockEvictions`, `rockBorn`, `rockDone` (1 onward) are used with one spelling throughout.
