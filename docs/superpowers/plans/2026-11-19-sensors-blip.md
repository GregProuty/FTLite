# Sensors blip: an enemy beyond sensor range shows as a rough ping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While the enemy ship is alive and beyond the crew's sensor range, every console map shows a rough blip in place of today's exact last-seen ghost: a dotted circle with a `?`, re-pinged every 120 game ticks at a new guess, with a `BLIP ~<n>` edge arrow when its centre is off screen, a rough range in the OUTSIDE readout, and a sit-down card that follows the ping's centre.

**Architecture:**

- **The ping is view state in `render/tactical/fogModel.ts`.** `FogTracker` holds one ping (`index`, `madeAt`, centre, radius). `stepFog` makes a new one on an unseen frame when none is held or the tick has passed into a new 120-tick period, drops it when the enemy is seen or not active, and clears it with the round. The offset comes from a 32-bit hash of the round's `epoch` and the ping's index. `FogView.blip` carries the held ping and its age. `stepFog` no longer makes a ghost of kind `'enemy'`.
- **The map model (`render/tactical/tacticalModel.ts`)** turns `fog.blip` into `TacticalDraw.blip` (screen pixels, drawn when its ring crosses the view or its centre is in it) and into an edge arrow of the new target `'blip'`, built by the existing `arrow()` helper, with the range rounded to the nearest 100. A pure `blipMark(draw)` says where the `?` goes: only where the circle is drawn and the centre has no edge arrow.
- **The layer (`render/tactical/tacticalLayer.ts`)** draws the dotted circle with `dashCircle` in `CRT.mid` at the ping's alpha, the `?` from its pool of small map words, and the `'blip'` arrow hollow.
- **The readout (`render/duel/readoutModel.ts`)** takes an optional `fog` and writes `ENEMY  BLIP ~<n>`. **The scene (`app/duel/scene.ts`)** passes the frame's fog view to the one `readoutRows` call that draws, and picks the sit-down card's place from the ping's centre through a new pure `sitCardBelow`.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, Pixi.js 8 (map), React + zustand (console), Electron/electron-vite.

**Spec:** `docs/superpowers/specs/2026-11-19-sensors-blip-design.md` (converged at 0ef87a6c). Cited below as "spec §n". It amends the Engineering spike's fog (`2026-11-18-engineering-spike-design.md` §10.4): the enemy ship's ghost becomes a blip, and the rest of §10.4 stands.

**Worktree:** a new worktree `C:\Users\djuar\FTLite\.worktrees\sensors-blip` on a new branch `sensors-blip` cut from master, with its four junctions (Task 1 makes them). Every command from Task 2 on runs from the worktree root. This plan and the spec are read from the main checkout (`C:\Users\djuar\FTLite\docs\superpowers\`) if the branch does not carry them.

**Other branches:** W-4b's map task also edits `tacticalModel.ts` and `tacticalLayer.ts`, in the Weapons draws (spec §5). Whichever lands on master second merges; nothing here depends on W-4.

## Global Constraints

- **Drawing only (spec, opening).** This plan changes no file under `src/renderer/src/sim/`, no wire schema (`src/renderer/src/net/`, `src/renderer/src/authority/`), no hash, no golden and no fixture, and SIM_VERSION is untouched. `tests/golden*.test.ts`, `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts` and the determinism fixture (`tests/fixtures/determinism-v2.json`) must pass untouched. Never run `npm run bless`. Task 6 proves it with a diff against the base.
- **Files this plan may change, and no others:** `src/renderer/src/render/tactical/fogModel.ts`, `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`, `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/app/duel/scene.ts`, `tests/engineeringFog.test.ts`, `docs/gates.md`, and the four new test files `tests/sensorsBlipFog.test.ts`, `tests/sensorsBlipMap.test.ts`, `tests/sensorsBlipLayer.test.ts`, `tests/sensorsBlipReadout.test.ts`.
- **Exact names and values (binding):**
  - **`render/tactical/fogModel.ts`:** `BLIP_R_MIN = 150`, `BLIP_GROW = 0.25`, `BLIP_R_MAX = 600`, `BLIP_PING_TICKS = 120`; `interface Blip { x: number; y: number; r: number; age: number }` (world units, `age` 0..1); `FogView.blip?: Blip | null`; `FogTracker.ping: Ping | null` with the private `interface Ping { index: number; madeAt: number; x: number; y: number; r: number }`; `blipHash(epoch: number, index: number): { u: number; v: number }`; `blipRadius(beyond: number): number`. `GhostKind` keeps `'enemy'`.
  - **`render/tactical/tacticalModel.ts`:** `ArrowTarget` gains `'blip'`; `ARROW_NAMES.blip = 'BLIP'`; `ArrowDraw.alpha?: number` (set only on a `'blip'` arrow); `interface BlipDraw { x: number; y: number; r: number; alpha: number }` (screen pixels); `TacticalDraw.blip?: BlipDraw | null`; `blipMark(d: Pick<TacticalDraw, 'blip' | 'arrows'>): BlipDraw | null`.
  - **`render/duel/readoutModel.ts`:** `ReadoutInput.fog?: FogView | null`.
  - **`app/duel/scene.ts`:** `sitCardBelow(t: TacticalState, fog: FogView): boolean`.
  - **Words:** the arrow's label `` `BLIP ~${distance}` ``; the readout row `ENEMY` with the value `` `BLIP ~${n}` ``.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b` (the spec's `npm run typecheck`); the full suite `npx vitest run --maxWorkers=4` (the spec's `npm test`), always after `npm run build` (`electron-vite build`); `npm run test:duel-app-runtime`. Never two vitest processes at once, and never a smoke while vitest runs. A full-suite timeout under load is re-run alone before it counts (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`).
- **Line endings:** working copies are CRLF (`core.autocrlf=true`). Change existing files with the Edit tool; never hand-convert endings and never rewrite an existing file with the Write tool. New files may be LF.
- **Match every edit by the quoted text**, not a line number: the code was read on master at `4912030e` (the spec quotes `eaf84426`; the lines it names have moved since, the text has not). In source files the old text is quoted one line at a time, and a replacement may be several lines; the two test cases Task 2 rewrites are replaced as whole blocks, each named by its first line. Task 1 checks that every source anchor is still there.
- **Worktrees:** never delete a `node_modules` junction (including `services/signalling/node_modules`); a missing one is recreated, never "cleaned". Touch nothing under any other `.worktrees/` folder.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with a `Co-Authored-By:` line as its last `-m`, written here as `-m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"` (a session whose attribution reminder names another model uses that line instead). After writing any file, check it is not all null bytes (`head -c 64 <file> | od -c | head -1`: the first line must show text, not `\0 \0 \0`). Commit at the end of every task.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "sensors blip spec §n" on changed lines that need a reason.
- **Render code rules:** these files are view code, so any `Math` is allowed. The blip reads no `Math.random` and nothing of the sim's random state (`TacticalState.rng`); it only reads `TacticalState.tick`, the ships and the crew's systems.

## Decisions where the spec leaves room, and where the code forces a choice

1. **The hash and the radius are exported functions.** Spec §4 pins the hash's `u` and `v` for fixed pairs and the radius at three distances, so `blipHash(epoch, index)` and `blipRadius(beyond)` are exported from `fogModel.ts` with the four constants.
2. **The offset's axes.** Spec §2.3 gives the offset a length and "its direction is 2 pi v". The plan reads it as the vector `(cos(2 pi v), sin(2 pi v)) × length` on (x, y). Any fixed reading is as uniform; Task 2 pins this one.
3. **"Unseen" is `fogModel`'s own fact.** `stepFog` already computes `present` (`e.active`) and `seen` (`e.active && contactSeen(t, Contact.Enemy)`) for the enemy. The blip uses them: a blip while `present && !seen` (spec §2.1). The readout keeps its own `shipSeen(t, target)`, which is the call `contactSeen` makes.
4. **The radius "at 0 beyond range".** At exactly the sensor range the enemy is seen (`pointSeen` is `<=`), so `stepFog` never makes a ping at `beyond` 0. Task 2 pins 150 on `blipRadius(0)`, and through `stepFog` pins 150.25 at 1 u beyond, 400 at 1000 and 600 at 3000.
5. **The age never reads 1 from `stepFog`.** The formula reaches 1 on the tick the next ping is due, and that frame makes the new ping (age 0). Task 2 pins 0 at the start, the exact fraction in between and 41 / 42 on the last tick of a ping made 78 ticks in.
6. **`ArrowDraw.alpha`.** Spec §3 has the `'blip'` arrow stroked "at the ping's alpha", and the arrow shows exactly when the circle may be off screen (`TacticalDraw.blip` null). So the arrow carries its own optional `alpha`, set only for `'blip'`. No other arrow gains the key, so no existing arrow test changes.
7. **`blipMark` carries the `?` rule.** Spec §3 fixes `TacticalDraw.blip` as `{ x, y, r, alpha }` and says the `?` is drawn only when the centre is on screen by the edge arrow's test. The model keeps that shape, and `blipMark(d)` returns the blip when it is drawn and `d.arrows` holds no `'blip'` arrow, else null. The arrow helper returns no arrow only for a point inside the inset rectangle (and not under the avoid window), which is inside the view, so the circle is then always drawn: the centre gets the `?` or the arrow, never both and never neither.
8. **"Its centre is on screen", for the circle,** is the view itself (the model's `onScreen` with no margin). It differs from the `?`'s test only in the arrow margin and the reserves: there the circle is drawn with the arrow and without the `?`.
9. **The `?` comes from the layer's pool of small map words** (`notes`, `FONT_NATIVE`, a tint and an alpha per word), centred on the ping. No display object is added. The pool's worst case becomes 12 of 13 (2 gravity labels, the `?`, COLLISION or SLINGSHOT, EVADE, 6 pings, HEAT).
10. **The `'blip'` arrow's label** is drawn by the arrows' shared text pool, as every arrow's is (`CRT.main`, alpha 1). Spec §3 fixes the glyph only.
11. **The arrow pool stays at 4.** The `'enemy'` arrow needs the enemy in `ships`, which the scene passes only while it is seen; the blip exists only while it is unseen. So the map never has more than ship, enemy or blip, planet and torpedo.
12. **`sitCardBelow` lives in `scene.ts`,** beside its other exported pure helpers (`torpedoTone`, `fogPan`, `rockHoverAt`), so `render/duel/sitModel.ts` is not edited (spec §5's file list does not name it) and the rule has a unit test.
13. **The tests' files.** Four new files, one per task, and `tests/engineeringFog.test.ts`'s two `stepFog` cases rewritten (spec §4). That file's map case builds a ghost of kind `'enemy'` by hand; it becomes `'derelict'`, since no enemy ghost exists any more (the model still passes any ghost through).
14. **The base commit is recorded by an empty commit** on the branch (Task 1), and read back with `git merge-base master HEAD`.
15. **Final checks.** The spec's `npm run typecheck`, `npm test` and `npm run build` are run as the house rules run them (`npx tsc -b`, `npm run build`, then `npx vitest run --maxWorkers=4`), plus the duel app smoke, since the scene changed.

---

### Task 1: The worktree, its junctions and the base

**Files:**
- Create: the worktree `C:\Users\djuar\FTLite\.worktrees\sensors-blip` (branch `sensors-blip`), four junctions
- No source file changes

**Interfaces:**
- Consumes: master.
- Produces: the worktree every later task runs in; `BASE`, the commit the branch was cut from (`git merge-base master HEAD`).

- [ ] **Step 1: Make the worktree and the junctions (PowerShell, from the main checkout)**

```powershell
cd C:\Users\djuar\FTLite
git worktree add .worktrees/sensors-blip -b sensors-blip master
New-Item -ItemType Junction -Path .worktrees\sensors-blip\node_modules -Target C:\Users\djuar\FTLite\node_modules
New-Item -ItemType Junction -Path .worktrees\sensors-blip\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules
New-Item -ItemType Junction -Path .worktrees\sensors-blip\.art -Target C:\Users\djuar\FTLite\.art
New-Item -ItemType Junction -Path .worktrees\sensors-blip\public\assets\paid -Target C:\Users\djuar\FTLite\public\assets\paid
cd .worktrees\sensors-blip
Get-Item node_modules, services\signalling\node_modules, .art, public\assets\paid | Select-Object Name, LinkType
```

Expected: `git worktree add` prints `Preparing worktree (new branch 'sensors-blip')`, and the last command lists four rows with `LinkType` `Junction`.

- [ ] **Step 2: Check every anchor this plan edits by (Git Bash, from the worktree root)**

```bash
cd /c/Users/djuar/FTLite/.worktrees/sensors-blip
grep -cF "export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[] }" src/renderer/src/render/tactical/fogModel.ts
grep -cF "export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile';" src/renderer/src/render/tactical/tacticalModel.ts
grep -cF "...(input.fog ? { sensor, ghosts } : {})," src/renderer/src/render/tactical/tacticalModel.ts
grep -cF "function arrowGlyph(g: Graphics, x: number, y: number, angle: number, target: ArrowTarget): void {" src/renderer/src/render/tactical/tacticalLayer.ts
grep -cF "      if (d.planet) {" src/renderer/src/render/tactical/tacticalLayer.ts
grep -cF "if (!shipSeen(t, target)) rows.push(row('ENEMY', 'NO CONTACT'));" src/renderer/src/render/duel/readoutModel.ts
grep -cF "(d.tactical.ships[enemySlot]?.y ?? 0) > d.tactical.ships[CREW_SLOT].y" src/renderer/src/app/duel/scene.ts
grep -cF "readoutRows({ duel: d, mode: view === 'flight' ? 'helm' : view, active: source.active(), console: onConsole })" src/renderer/src/app/duel/scene.ts
```

Expected: eight lines, each `1`. If any is `0` or more than `1`, stop and report: master has moved under the plan.

- [ ] **Step 3: The smoke passes in the new worktree**

Run: `npm run test:duel-app-runtime`
Expected: the build completes and the last line begins `ACTUAL DUEL APP:`. (A failure here that names the signalling service is a missing `services\signalling\node_modules` junction: recreate it, do not "clean".)

- [ ] **Step 4: Record the base**

```bash
git rev-parse --short HEAD
```

Expected: one short hash. Call it BASE and put it in the message below.

```bash
git commit --allow-empty -m "chore(sensors-blip): branch cut from master at BASE" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
git merge-base master HEAD
```

Expected: the commit is made (`[sensors-blip ...] chore(sensors-blip): branch cut from master at <hash>`), and `git merge-base` prints the full hash that BASE abbreviates.

---

### Task 2: The ping in `fogModel`: the hash, the held ping, the blip in the fog view, no enemy ghost

**Files:**
- Modify: `src/renderer/src/render/tactical/fogModel.ts`
- Create: `tests/sensorsBlipFog.test.ts`
- Modify: `tests/engineeringFog.test.ts` (its two `stepFog` enemy cases, one hand-built ghost, its header and one import)

**Interfaces:**
- Consumes: `contactSeen(t, contact)`, `derelictPos(t)`, `pointSeen(t, x, y)`, `sensorRange(sys)` (`sim/tactical/science.ts`); `Contact`, `CREW_SLOT`, `missileOf(state, i)`, `targetOf(state, i)`, `TacticalState.tick`, `TacticalState.ships` (`sim/tactical/state.ts`). All read only.
- Produces: `BLIP_R_MIN`, `BLIP_GROW`, `BLIP_R_MAX`, `BLIP_PING_TICKS`; `Blip`; `FogView.blip?: Blip | null`; `FogTracker.ping`; `blipHash(epoch, index): { u, v }`; `blipRadius(beyond): number`. `stepFog(f, t, now, epoch)` and `createFog()` keep their signatures. Tasks 3 and 5 read `FogView.blip`.

- [ ] **Step 1: Write the failing tests (the new file)**

Create `tests/sensorsBlipFog.test.ts`:

```ts
// Sensors blip spec §2, §4 (fogModel): while the enemy ship is active and beyond sensor range the fog view carries a blip, a
// ping made on the game's tick (every BLIP_PING_TICKS) at the enemy's place plus a hashed offset inside the circle, held
// until the next one. No ghost of kind 'enemy' is produced; the derelict's ghost is as before.
import { describe, expect, it } from 'vitest';
import { BLIP_GROW, BLIP_PING_TICKS, BLIP_R_MAX, BLIP_R_MIN, blipHash, blipRadius, createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
import { derelictPos, sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

/** The crew ship at (1000, 2000), the enemy `beyond` units past sensor range due east of it, the state's tick set by hand. */
function scene(beyond: number, tick = 0) {
  const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!, range = sensorRange(t.systems[0]!);
  Object.assign(own, { x: 1000, y: 2000 });
  Object.assign(e, { x: 1000 + range + beyond, y: 2000, active: true });
  t.tick = tick;
  return { t, own, e, range, f: createFog() };
}

describe('the blip (sensors blip spec §2.1, §2.2)', () => {
  it('unseen from the first frame: a blip at once, with no earlier sighting, and no enemy ghost', () => {
    const { t, f } = scene(1000), v = stepFog(f, t, 0, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.blip).toMatchObject({ r: 400, age: 0 });
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
  });
  it('the radius: 150 just beyond range, 400 at 1000 u beyond, 600 from 1800 u beyond', () => {
    expect([BLIP_R_MIN, BLIP_GROW, BLIP_R_MAX, BLIP_PING_TICKS]).toEqual([150, 0.25, 600, 120]);
    expect([blipRadius(0), blipRadius(1000), blipRadius(1800), blipRadius(3000), blipRadius(-50)]).toEqual([150, 400, 600, 600, 150]);
    for (const [beyond, r] of [[1, 150.25], [1000, 400], [3000, 600]] as const) {
      const s = scene(beyond);
      expect(stepFog(s.f, s.t, 0, 0).blip!.r).toBe(r);
    }
    const edge = scene(0), v = stepFog(edge.f, edge.t, 0, 0);   // at exactly the range the enemy is seen (pointSeen is <=)
    expect(v.seen.enemy).toBe(true); expect(v.blip ?? null).toBeNull();
  });
});

describe('the ping (sensors blip spec §2.3)', () => {
  it('the hash of (epoch, index) gives pinned u and v', () => {
    expect(blipHash(0, 0)).toEqual({ u: 8705 / 65536, v: 10503 / 65536 });
    expect(blipHash(3, 17)).toEqual({ u: 18494 / 65536, v: 40792 / 65536 });
    expect(blipHash(12345, 4)).toEqual({ u: 40159 / 65536, v: 61642 / 65536 });
  });
  it('the centre is the enemy\'s place plus 0.8 r sqrt(u) along the angle 2 pi v, always within 0.8 r of the enemy', () => {
    const { t, e, f } = scene(1000), b = stepFog(f, t, 0, 0).blip!;
    const { u, v } = blipHash(0, 0), len = 0.8 * 400 * Math.sqrt(u), a = 2 * Math.PI * v;
    expect(b.x).toBeCloseTo(e.x + Math.cos(a) * len, 9); expect(b.y).toBeCloseTo(e.y + Math.sin(a) * len, 9);
    expect(b.x).toBeCloseTo(2962.328351, 5); expect(b.y).toBeCloseTo(2098.573521, 5);   // pinned: the enemy at (2900, 2000)
    const s = scene(1000);
    for (let epoch = 0; epoch < 5; epoch++) for (let index = 0; index < 40; index++) {
      s.t.tick = index * BLIP_PING_TICKS + 7;
      const p = stepFog(createFog(), s.t, 0, epoch).blip!;
      expect(Math.hypot(p.x - s.e.x, p.y - s.e.y), `epoch ${epoch} index ${index}`).toBeLessThanOrEqual(0.8 * p.r + 1e-9);
    }
  });
  it('the same round and ping index give the same centre; another index or another round gives another', () => {
    const at = (epoch: number, tick: number) => { const s = scene(1000, tick), b = stepFog(s.f, s.t, 0, epoch).blip!; return [b.x, b.y]; };
    expect(at(0, 130)).toEqual(at(0, 130));
    expect(at(0, 239)).toEqual(at(0, 120));       // both in ping 1
    expect(at(0, 240)).not.toEqual(at(0, 239));   // ping 2
    expect(at(1, 0)).not.toEqual(at(0, 0));       // another round
  });
  it('the circle holds its centre and radius for 120 ticks while the enemy moves, its age running 0 to 1; then a new ping', () => {
    const { t, e, f } = scene(3000, 240), first = stepFog(f, t, 0, 0).blip!;
    expect(first).toMatchObject({ r: 600, age: 0 });
    for (let k = 1; k < BLIP_PING_TICKS; k++) {
      t.tick = 240 + k; e.x += 5;
      const b = stepFog(f, t, k / 60, 0).blip!;
      expect([b.x, b.y, b.r]).toEqual([first.x, first.y, first.r]);
      expect(b.age).toBe(k / BLIP_PING_TICKS);
    }
    expect(Math.hypot(e.x - first.x, e.y - first.y)).toBeGreaterThan(first.r);   // the enemy has left the held circle: the roughness
    t.tick = 360; e.x += 5;
    const next = stepFog(f, t, 2, 0).blip!;
    expect(next.age).toBe(0);
    expect([next.x, next.y]).not.toEqual([first.x, first.y]);
    expect(Math.hypot(next.x - e.x, next.y - e.y)).toBeLessThanOrEqual(0.8 * next.r + 1e-9);
  });
  it('a ping made 78 ticks into a period starts at age 0 and runs to the period\'s end, kept within 0..1', () => {
    const { t, f } = scene(1000, 78), age = () => stepFog(f, t, 0, 0).blip!.age;
    expect(age()).toBe(0);
    t.tick = 70; expect(age()).toBe(0);                       // a tick behind the ping (an online correction): never below 0
    t.tick = 99; expect(age()).toBe(0.5);                     // 21 of its 42 ticks
    t.tick = 119; expect(age()).toBeCloseTo(41 / 42, 12);     // its last tick; at 120 the formula reads 1 and the next ping is made
    t.tick = 120; expect(age()).toBe(0);
    t.tick = 180; expect(age()).toBe(0.5);                    // the next ping lasts the full 120
  });
  it('a state whose tick does not advance keeps one ping across 10 s of the presentation clock', () => {
    const { t, f } = scene(1000, 500), first = stepFog(f, t, 0, 0).blip!;
    for (let k = 1; k <= 600; k++) expect(stepFog(f, t, k / 60, 0).blip).toEqual(first);
  });
  it('seen again: no blip; unseen again: a new ping at once', () => {
    const { t, e, own, range, f } = scene(1000, 250);
    expect(stepFog(f, t, 0, 0).blip!.age).toBe(0);
    t.tick = 300;
    expect(stepFog(f, t, 1, 0).blip!.age).toBe(50 / 110);     // held: made at 250, due at 360
    e.x = own.x + range / 2;
    const seen = stepFog(f, t, 2, 0);
    expect(seen.seen.enemy).toBe(true); expect(seen.blip ?? null).toBeNull();
    t.tick = 310; e.x = own.x + range + 1000;
    expect(stepFog(f, t, 3, 0).blip).toMatchObject({ age: 0 });   // the held ping would read 60 / 110
  });
  it('a new round clears the held ping; a destroyed enemy has no blip', () => {
    const { t, e, f } = scene(1000, 50), first = stepFog(f, t, 0, 0).blip!;
    t.tick = 60;
    const next = stepFog(f, t, 1, 1).blip!;   // epoch 1, the same ping index: the held ping would read 10 / 70 at the old centre
    expect(next.age).toBe(0);
    expect([next.x, next.y]).not.toEqual([first.x, first.y]);
    e.active = false;
    const gone = stepFog(f, t, 2, 1);
    expect(gone.blip ?? null).toBeNull();
    expect(gone.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
  });
});

describe('the ghosts (sensors blip spec §2.1)', () => {
  it('no ghost of kind enemy is ever produced, seen then unseen; the derelict still leaves its fading ghost', () => {
    const { t, e, own, range, f } = scene(1000);
    e.x = own.x + range / 2; stepFog(f, t, 100, 0);   // seen
    e.x = own.x + range * 2;
    for (const now of [100.5, 101, 105, 109.9, 111]) expect(stepFog(f, t, now, 0).ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    expect(f.tracks.has('enemy')).toBe(false);
    const w = derelictPos(t);
    Object.assign(own, { x: w.x, y: w.y });
    expect(stepFog(f, t, 200, 0).seen.derelict).toBe(true);
    own.x = w.x + range * 2;
    expect(stepFog(f, t, 201, 0).ghosts.find((g) => g.kind === 'derelict')).toEqual({ kind: 'derelict', x: w.x, y: w.y, h: 0, alpha: 1 - 1 / GHOST_SECONDS });
    expect(stepFog(f, t, 200 + GHOST_SECONDS, 0).ghosts.find((g) => g.kind === 'derelict')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rewrite the enemy-ghost cases in `tests/engineeringFog.test.ts` (spec §4: rewritten, not added)**

Five edits, each matched by its quoted text.

1. The header. Replace the line

```ts
// The map hides an unseen derelict's mark, draws the range ring and the ghosts; the contact window says CONTACT LOST.
```

with

```ts
// The map hides an unseen derelict's mark, draws the range ring and the ghosts; the contact window says CONTACT LOST.
// Sensors blip spec §2.1 (2026-11-19) amends it: the enemy ship leaves no ghost; unseen, it is a blip (tests/sensorsBlip*.test.ts).
```

2. The import. Replace `import { createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';` with:

```ts
import { BLIP_GROW, BLIP_R_MIN, createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
```

3. Replace the whole `it` block that starts with the line `  it('the enemy inside the range is seen; moved out it is a ghost at its last place, fading over 10 s, then gone', () => {` (through its closing `  });`) with:

```ts
  it('the enemy inside the range is seen and has no blip; moved out it leaves no ghost but a blip, at once and past the old 10 s fade (sensors blip spec §2.1)', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r / 2; e.y = own.y; e.active = true;
    let v = stepFog(f, t, 100, 0);
    expect(v.range).toBe(r); expect(v.seen.enemy).toBe(true); expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]); expect(v.blip ?? null).toBeNull();
    e.x = own.x + r * 2;
    v = stepFog(f, t, 101, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    expect(v.blip!.r).toBeCloseTo(BLIP_R_MIN + BLIP_GROW * r, 6); expect(v.blip!.age).toBe(0);   // r beyond the range
    v = stepFog(f, t, 100 + GHOST_SECONDS, 0);
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]); expect(v.blip ?? null).not.toBeNull();   // it never fades away for good
  });
```

4. Replace the whole `it` block that starts with the line `  it('a destroyed enemy leaves no ghost; a new round clears every ghost; never seen, never a ghost', () => {` (through its closing `  });`) with:

```ts
  it('never seen, a blip from the first frame and no ghost; a new round makes a new ping; a destroyed enemy has neither (sensors blip spec §2.1, §2.3)', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r * 3; e.y = own.y; e.active = true;   // on the crew ship's line, so the r / 2 step below is inside the range
    const first = stepFog(f, t, 0, 0);
    expect(first.ghosts.some((g) => g.kind === 'enemy')).toBe(false); expect(first.blip).toMatchObject({ age: 0 });   // never seen: a blip at once
    e.x = own.x + r / 2; expect(stepFog(f, t, 1, 0).blip ?? null).toBeNull();   // seen: no blip
    e.x = own.x + r * 3;
    const again = stepFog(f, t, 2, 0);
    expect(again.ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // unseen again: still no ghost
    expect(again.blip).toEqual(first.blip);   // the same round and ping index: the same ping
    const next = stepFog(f, t, 2.5, 1).blip!;   // a new round
    expect([next.x, next.y]).not.toEqual([first.blip!.x, first.blip!.y]);
    e.active = false;
    const gone = stepFog(f, t, 4, 1);
    expect(gone.blip ?? null).toBeNull(); expect(gone.ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // destroyed: neither
  });
```

5. The hand-built ghost in the map case (Decision 13). Replace `ghosts: [{ kind: 'enemy', x: w.x, y: w.y, h: 0, alpha: 0.5 }]` with `ghosts: [{ kind: 'derelict', x: w.x, y: w.y, h: 0, alpha: 0.5 }]`, and replace `expect(fogged.ghosts).toEqual([{ kind: 'enemy', x: vp.w / 2, y: vp.h / 2, angle: 0, alpha: 0.5 }]);` with:

```ts
    expect(fogged.ghosts).toEqual([{ kind: 'derelict', x: vp.w / 2, y: vp.h / 2, angle: 0, alpha: 0.5 }]);   // sensors blip spec §2.1: no enemy ghost exists
```

The third `stepFog` case (`'the enemy torpedo is seen by distance; gone while seen, it leaves no ghost'`) and every other case in the file stay as they are.

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/sensorsBlipFog.test.ts tests/engineeringFog.test.ts`
Expected: FAIL. Every case of `tests/sensorsBlipFog.test.ts` fails (`blipHash is not a function`, `blipRadius is not a function`, or a `blip` that is `undefined`), and the two rewritten cases of `tests/engineeringFog.test.ts` fail (an enemy ghost is still produced, `blip` is `undefined`). Its other 20 cases pass.

- [ ] **Step 4: Implement the ping in `src/renderer/src/render/tactical/fogModel.ts`**

Eight edits with the Edit tool, each matched by its quoted text.

1. Replace the line `// always shown (Decision 15).` with:

```ts
// always shown (Decision 15).
// Sensors blip spec §2 (2026-11-19) amends the above: the enemy ship leaves no ghost. While it is active and unseen it
// has a blip: a ping (a centre and a radius fixed when it is made) held until the next one. Pings are timed on the
// tactical state's tick, not the presentation clock, so a paused or frozen state makes no new ping. Each screen makes
// its own; the offset is a hash of the round and the ping's index, and reads no Math.random and none of the sim's
// random state.
```

2. Replace the line `export const GHOST_SECONDS = 10;` with:

```ts
export const GHOST_SECONDS = 10;
/** Sensors blip spec §2.2, §2.3: the blip's radius in world units is BLIP_R_MIN just beyond sensor range, grows by
 *  BLIP_GROW a unit beyond it and stops at BLIP_R_MAX; a new ping every BLIP_PING_TICKS game ticks (2 s at TICK_HZ 60). */
export const BLIP_R_MIN = 150, BLIP_GROW = 0.25, BLIP_R_MAX = 600, BLIP_PING_TICKS = 120;
```

3. Replace the line `export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[] }` with:

```ts
/** Sensors blip spec §2.4: the held ping in world units, and its age 0..1 across its life (the draw fades by it). */
export interface Blip { x: number; y: number; r: number; age: number }
/** `seen` keeps the enemy's flag, but no ghost of kind 'enemy' is produced (sensors blip spec §2.1). `blip`: absent or
 *  null means none. */
export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[]; blip?: Blip | null }
```

4. Replace the line `export interface FogTracker { tracks: Map<GhostKind, Track>; epoch: number | null }` with:

```ts
/** The held ping (sensors blip spec §2.3): its index (floor(tick / BLIP_PING_TICKS)), the tick it was made at, and its
 *  centre and radius in world units. */
interface Ping { index: number; madeAt: number; x: number; y: number; r: number }
export interface FogTracker { tracks: Map<GhostKind, Track>; epoch: number | null; ping: Ping | null }
```

5. Replace the line `export function createFog(): FogTracker { return { tracks: new Map(), epoch: null }; }` with:

```ts
export function createFog(): FogTracker { return { tracks: new Map(), epoch: null, ping: null }; }

/** Sensors blip spec §2.3: the hash of the round (`epoch`) and the ping's `index`, in 32-bit integer arithmetic, as two
 *  numbers in 0..1. The same round and index give the same pair. Plain view code: no Math.random, no sim state. */
export function blipHash(epoch: number, index: number): { u: number; v: number } {
  let h = Math.imul(epoch ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return { u: (h & 0xffff) / 65536, v: (h >>> 16) / 65536 };
}
/** Sensors blip spec §2.2: the blip's radius for an enemy `beyond` world units past sensor range (never below 0). */
export function blipRadius(beyond: number): number { return Math.min(BLIP_R_MAX, BLIP_R_MIN + BLIP_GROW * Math.max(0, beyond)); }
```

6. Replace the line `  if (f.epoch !== epoch) { f.tracks.clear(); f.epoch = epoch; }` with:

```ts
  if (f.epoch !== epoch) { f.tracks.clear(); f.ping = null; f.epoch = epoch; }   // sensors blip spec §2.3: a new round clears the ping too
```

7. Replace the line `    seen[kind] = k.seen;` with:

```ts
    seen[kind] = k.seen;
    if (kind === 'enemy') continue;   // sensors blip spec §2.1: the enemy ship leaves no ghost (its blip is made below)
```

8. Replace the line `  return { range, seen, ghosts };` with:

```ts
  // Sensors blip spec §2.1, §2.3: a blip while the enemy ship is active and unseen. A new ping is made when none is held
  // or the held one's index is not this tick's: the enemy's true place plus an offset of length 0.8 r sqrt(u) along the
  // angle 2 pi v, so the enemy is inside the circle when the ping is made and the centre is not a good guess of it.
  // Between pings the circle holds still. Seen, destroyed or absent: the held ping is dropped at once.
  let blip: Blip | null = null;
  const en = facts.enemy;
  if (en.present && !en.seen) {
    const index = Math.floor(t.tick / BLIP_PING_TICKS);
    let p = f.ping;
    if (!p || p.index !== index) {
      const own = t.ships[CREW_SLOT]!, dx = en.x - own.x, dy = en.y - own.y, r = blipRadius(Math.sqrt(dx * dx + dy * dy) - range);
      const { u, v } = blipHash(epoch, index), len = 0.8 * r * Math.sqrt(u), a = 2 * Math.PI * v;
      p = f.ping = { index, madeAt: t.tick, x: en.x + Math.cos(a) * len, y: en.y + Math.sin(a) * len, r };
    }
    // Its age: 0 when made (a ping made partway through a period too), 1 as the next is due.
    blip = { x: p.x, y: p.y, r: p.r, age: Math.min(1, Math.max(0, (t.tick - p.madeAt) / ((p.index + 1) * BLIP_PING_TICKS - p.madeAt))) };
  } else f.ping = null;
  return { range, seen, ghosts, blip };
```

After the eight edits, the body of `stepFog` reads (check it against the file):

```ts
export function stepFog(f: FogTracker, t: TacticalState, now: number, epoch: number): FogView {
  if (f.epoch !== epoch) { f.tracks.clear(); f.ping = null; f.epoch = epoch; }   // sensors blip spec §2.3: a new round clears the ping too
  const range = sensorRange(t.systems[CREW_SLOT]!), slot = targetOf(t, CREW_SLOT), e = t.ships[slot], m = missileOf(t, slot), w = derelictPos(t);
  const facts: Record<GhostKind, { present: boolean; seen: boolean; x: number; y: number; h: number }> = {
    enemy: { present: e?.active === true, seen: e?.active === true && contactSeen(t, Contact.Enemy), x: e?.x ?? 0, y: e?.y ?? 0, h: e ? e.heading + e.headingAcc : 0 },
    derelict: { present: true, seen: contactSeen(t, Contact.Derelict), x: w.x, y: w.y, h: 0 },
    missile: { present: m !== null, seen: m !== null && pointSeen(t, m.x, m.y), x: m?.x ?? 0, y: m?.y ?? 0, h: m ? m.heading + m.headingAcc : 0 }
  };
  const seen = { enemy: false, derelict: false, missile: false }, ghosts: Ghost[] = [];
  for (const kind of KINDS) {
    const k = facts[kind];
    seen[kind] = k.seen;
    if (kind === 'enemy') continue;   // sensors blip spec §2.1: the enemy ship leaves no ghost (its blip is made below)
    if (!k.present) { f.tracks.delete(kind); continue; }
    if (k.seen) { f.tracks.set(kind, { x: k.x, y: k.y, h: k.h, seenAt: now }); continue; }
    const tr = f.tracks.get(kind);
    if (!tr) continue;
    const alpha = 1 - (now - tr.seenAt) / GHOST_SECONDS;
    if (alpha <= 0) { f.tracks.delete(kind); continue; }
    ghosts.push({ kind, x: tr.x, y: tr.y, h: tr.h, alpha });
  }
  // Sensors blip spec §2.1, §2.3: a blip while the enemy ship is active and unseen. A new ping is made when none is held
  // or the held one's index is not this tick's: the enemy's true place plus an offset of length 0.8 r sqrt(u) along the
  // angle 2 pi v, so the enemy is inside the circle when the ping is made and the centre is not a good guess of it.
  // Between pings the circle holds still. Seen, destroyed or absent: the held ping is dropped at once.
  let blip: Blip | null = null;
  const en = facts.enemy;
  if (en.present && !en.seen) {
    const index = Math.floor(t.tick / BLIP_PING_TICKS);
    let p = f.ping;
    if (!p || p.index !== index) {
      const own = t.ships[CREW_SLOT]!, dx = en.x - own.x, dy = en.y - own.y, r = blipRadius(Math.sqrt(dx * dx + dy * dy) - range);
      const { u, v } = blipHash(epoch, index), len = 0.8 * r * Math.sqrt(u), a = 2 * Math.PI * v;
      p = f.ping = { index, madeAt: t.tick, x: en.x + Math.cos(a) * len, y: en.y + Math.sin(a) * len, r };
    }
    // Its age: 0 when made (a ping made partway through a period too), 1 as the next is due.
    blip = { x: p.x, y: p.y, r: p.r, age: Math.min(1, Math.max(0, (t.tick - p.madeAt) / ((p.index + 1) * BLIP_PING_TICKS - p.madeAt))) };
  } else f.ping = null;
  return { range, seen, ghosts, blip };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/sensorsBlipFog.test.ts tests/engineeringFog.test.ts tests/contactScene.test.ts`
Expected: PASS, 3 files, no failure (`tests/sensorsBlipFog.test.ts` has 11 cases; `tests/engineeringFog.test.ts` keeps its 22).

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
head -c 64 tests/sensorsBlipFog.test.ts | od -c | head -1
head -c 64 tests/engineeringFog.test.ts | od -c | head -1
head -c 64 src/renderer/src/render/tactical/fogModel.ts | od -c | head -1
git add src/renderer/src/render/tactical/fogModel.ts tests/sensorsBlipFog.test.ts tests/engineeringFog.test.ts
git commit -m "feat(fog): the enemy's ghost becomes a blip, a ping held on the game tick (sensors blip spec §2)" -m "stepFog makes no ghost of kind 'enemy'. While the enemy ship is active and unseen, FogView.blip carries a ping: the enemy's place plus a hashed offset inside a circle of 150 to 600 units, made every 120 game ticks and held between. View state only: no sim, wire or hash change." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected: each `od` line shows text (`/  /` and letters), and the commit lists 3 files.

---

### Task 3: The map model: `TacticalDraw.blip`, the on-screen rule and the `'blip'` edge arrow

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts`
- Create: `tests/sensorsBlipMap.test.ts`

**Interfaces:**
- Consumes: `FogView.blip?: Blip | null` with `Blip = { x, y, r, age }` in world units (Task 2); in `tacticalModel.ts`, `ringCrossesRect(x, y, r, w, h)`, the `tacticalModel` closure's `toS(x, y)`, `onScreen(x, y, r)` (world units against the visible world), `own` (the crew ship's interpolated body) and the `arrow` helper with `edgePoint` and `aroundAvoid`; `combatModel(input: CombatModelInput)` with `enemyArrow` and `goal` (`render/tactical/weaponsModel.ts`, read only); `pickContact(input, point)`.
- Produces: `ArrowTarget` with `'blip'`; `ArrowDraw.alpha?: number`; `BlipDraw`; `TacticalDraw.blip?: BlipDraw | null` (present, null or set, whenever `input.fog` is given); `blipMark(d): BlipDraw | null`. Task 4 draws them.

- [ ] **Step 1: Write the failing tests**

Create `tests/sensorsBlipMap.test.ts`:

```ts
// Sensors blip spec §3, §4 (the map model): the fog view's blip becomes TacticalDraw.blip in screen pixels, drawn when its
// ring crosses the view or its centre is in it, with the alpha for its age. A centre that is off screen by the edge arrow's
// own test gets a 'blip' arrow labelled BLIP ~<n> (the range to the nearest 100) and no ?; the 'enemy' arrow, the goal
// glow and the FIRING SOLUTION mark never attach to it, and a click on it picks nothing.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { createFog, stepFog, type FogView } from '../src/renderer/src/render/tactical/fogModel';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { blipMark, pickContact, tacticalModel, type TacticalDraw, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
/** The crew ship at (1000, 2000). The default camera is on it at zoom 0.5: the view shows x -280..2280, y 1280..2720. */
function state(): TacticalState { const t = createTacticalState(5); Object.assign(t.ships[0]!, { x: 1000, y: 2000 }); return t; }
const input = (t: TacticalState, over: Partial<TacticalModelInput> = {}): TacticalModelInput => ({
  state: t, prev: [], alpha: 1, camera: createCamera(1000, 2000, 0.5), viewport: vp, console: 'weapons', axes: { turn: 0, thrust: 0 },
  ships: [0], paused: false, reserveRight: 0, contacts: true, ...over });
/** A hand-built fog view with the enemy unseen and a ping at (x, y) of radius r and age `age`. */
const fogOf = (x: number, y: number, r: number, age: number): FogView => ({ range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [], blip: { x, y, r, age } });
const blipArrow = (d: TacticalDraw) => d.arrows.find((a) => a.target === 'blip');
/** The enemy `beyond` units past sensor range, due east of the crew ship. */
function unseen(t: TacticalState, beyond: number): void { Object.assign(t.ships[1]!, { x: 1000 + sensorRange(t.systems[0]!) + beyond, y: 2000, active: true }); }

describe('the blip on the map (sensors blip spec §3)', () => {
  it('centre on screen: the circle at the ping\'s place and size with the alpha for its age, the ?, no arrow and no enemy ship', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 0.5) }));
    expect(d.blip).toEqual({ x: 740, y: 310, r: 150, alpha: 1 - 0.6 * 0.5 });
    expect(blipArrow(d)).toBeUndefined();
    expect(blipMark(d)).toEqual(d.blip);
    expect(d.ships.map((s) => s.index)).toEqual([0]);
    expect(d.arrows.some((a) => a.target === 'enemy')).toBe(false);
  });
  it('the alpha runs from 1 at age 0 to 0.4 at age 1', () => {
    expect(tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 0) })).blip!.alpha).toBe(1);
    expect(tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 1) })).blip!.alpha).toBeCloseTo(0.4, 12);
  });
  it('centre off screen, ring across the view: the circle without the ?, and a blip edge arrow, no enemy arrow', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(2480, 2000, 600, 0) }));
    expect(d.blip).toEqual({ x: 1380, y: 360, r: 300, alpha: 1 });
    expect(blipMark(d)).toBeNull();
    const a = blipArrow(d)!;
    expect(a.x).toBeCloseTo(1280 - 28, 9); expect(a.y).toBeCloseTo(360, 9); expect(a.angle).toBeCloseTo(Math.PI / 2, 9);   // ARROW_MARGIN is 28
    expect([a.distance, a.label, a.alpha]).toEqual([1500, 'BLIP ~1500', 1]);   // 1480 u from the crew ship
    expect(d.arrows.some((x) => x.target === 'enemy')).toBe(false);
  });
  it('the circle wholly off screen: nothing is drawn but the arrow, at the ping\'s alpha', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(6000, 2000, 150, 1) }));
    expect(d.blip).toBeNull(); expect(blipMark(d)).toBeNull();
    expect(blipArrow(d)).toMatchObject({ distance: 5000, label: 'BLIP ~5000' });
    expect(blipArrow(d)!.alpha).toBeCloseTo(0.4, 12);
  });
  it('centre inside the view but under a reserve: the circle and the arrow, never the ? as well', () => {
    const d = tacticalModel(input(state(), { reserveRight: 236, fog: fogOf(2120, 2000, 150, 0) }));
    expect(d.blip).toEqual({ x: 1200, y: 360, r: 75, alpha: 1 });
    expect(blipArrow(d)!.x).toBeCloseTo(1280 - 236 - 28, 9);
    expect(blipArrow(d)!.label).toBe('BLIP ~1100');
    expect(blipMark(d)).toBeNull();
  });
  it('the arrow rounds the range from the crew ship to the ping\'s centre to the nearest 100', () => {
    const label = (x: number, y: number) => blipArrow(tacticalModel(input(state(), { fog: fogOf(x, y, 150, 0) })))!.label;
    expect([label(2760, 2000), label(2749, 2000), label(1000, 2000 - 1651)]).toEqual(['BLIP ~1800', 'BLIP ~1700', 'BLIP ~1700']);
  });
  it('no fog, or a fog with no blip (the enemy seen, destroyed or absent): no circle, no ? and no blip arrow', () => {
    const t = state();
    expect(tacticalModel(input(t)).blip).toBeUndefined();
    const none = tacticalModel(input(t, { fog: { range: 900, seen: { enemy: true, derelict: false, missile: false }, ghosts: [] } }));
    expect(none.blip).toBeNull(); expect(blipMark(none)).toBeNull(); expect(blipArrow(none)).toBeUndefined();
  });
  it('through stepFog: a seen enemy draws its ship and neither circle nor arrow; unseen, the blip and no ship', () => {
    const t = state(), e = t.ships[1]!;
    Object.assign(e, { x: 1600, y: 2000, active: true });   // 600 u away, inside the start range of 900
    t.known[0] = 1;                                         // Sci-1: an identified enemy is drawn as a ship
    const seen = tacticalModel(input(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0, 1] }));
    expect(seen.ships.map((s) => s.index)).toEqual([0, 1]);
    expect(seen.blip).toBeNull(); expect(blipArrow(seen)).toBeUndefined();
    unseen(t, 1000);
    const fog = stepFog(createFog(), t, 0, 0), out = tacticalModel(input(t, { fog, ships: fog.seen.enemy ? [0, 1] : [0] }));   // the scene's own rule for `ships`
    expect(out.ships.map((s) => s.index)).toEqual([0]);
    expect(out.blip).toBeNull();                                      // the ping at (2962, 2099), r 400: wholly off the view
    expect(blipArrow(out)).toMatchObject({ label: 'BLIP ~2000' });    // 1965 u from the crew ship
  });
});

describe('nothing of the enemy\'s attaches to the blip (sensors blip spec §3)', () => {
  const combat = (t: TacticalState, over: Partial<TacticalModelInput>) => {
    const base = input(t, { console: 'helm', ...over }), model = tacticalModel(base);
    const enemyArrow = model.arrows.find((a) => a.target === 'enemy') ?? null;   // the scene's own pick (scene.ts)
    return { model, enemyArrow, c: combatModel({ ...base, missilePrev: [null, null], fx: createFx(), t: 0, enemyArrow, goal: true }) };
  };
  it('with a blip arrow there is no enemy arrow, so no goal glow and no FIRING SOLUTION bracket', () => {
    const t = state(); unseen(t, 1000);
    const r = combat(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0] });
    expect(blipArrow(r.model)).toBeDefined(); expect(r.enemyArrow).toBeNull();
    expect(r.c.goal ?? null).toBeNull(); expect(r.c.solution ?? null).toBeNull();
  });
  it('a seen enemy off screen keeps its own arrow and the goal glow (the contrast)', () => {
    const t = state(); Object.assign(t.ships[1]!, { x: 1800, y: 2000, active: true });   // 800 u away: seen; at zoom 1.2 it is off screen
    const r = combat(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0, 1], camera: createCamera(1000, 2000, 1.2) });
    expect(r.enemyArrow).not.toBeNull(); expect(blipArrow(r.model)).toBeUndefined();
    expect(r.c.goal ?? null).not.toBeNull();
  });
  it('a click on the blip picks nothing, and nor does a click on the unseen enemy\'s true place', () => {
    const t = state(); unseen(t, 1000);
    const fog = stepFog(createFog(), t, 0, 0), b = fog.blip!, e = t.ships[1]!;
    const at = { state: t, prev: [], alpha: 1, camera: createCamera(b.x, b.y, 0.5), viewport: vp, fog };
    expect(pickContact(at, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
    expect(pickContact({ ...at, camera: createCamera(e.x, e.y, 0.5) }, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/sensorsBlipMap.test.ts`
Expected: FAIL. The cases that read `d.blip`, `blipMark` or a `'blip'` arrow fail (`blipMark is not a function`, `expected undefined to equal ...`). The contrast case and the click case may already pass.

- [ ] **Step 3: The draw types**

In `src/renderer/src/render/tactical/tacticalModel.ts`, five edits, each matched by its quoted text.

1. Replace the line `export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile';` with:

```ts
/** `'blip'` (sensors blip spec §3): the ping of an enemy beyond sensor range. It is not the `'enemy'` arrow, so the goal
 *  glow and the FIRING SOLUTION mark (weaponsModel.ts), which read the enemy arrow, never attach to it. */
export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile' | 'blip';
```

2. Replace the line

```ts
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string; edge?: 'avoidRight' | 'avoidBottom' }
```

with

```ts
/** `alpha` (sensors blip spec §3): set only on a `'blip'` arrow, the ping's alpha; `distance` is then rounded to the nearest 100. */
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string; edge?: 'avoidRight' | 'avoidBottom'; alpha?: number }
```

3. Replace the line `export interface GhostDraw { kind: GhostKind; x: number; y: number; angle: number; alpha: number }` with:

```ts
export interface GhostDraw { kind: GhostKind; x: number; y: number; angle: number; alpha: number }
/** Sensors blip spec §3: the ping in screen pixels: its centre, its radius and its alpha (1 at age 0 down to 0.4 at age 1). */
export interface BlipDraw { x: number; y: number; r: number; alpha: number }
```

4. Replace the line `  sensor?: CircleDraw | null; ghosts?: GhostDraw[];` with:

```ts
  sensor?: CircleDraw | null; ghosts?: GhostDraw[];
  /** Sensors blip spec §3 (only with `fog`): the ping's circle, or null when there is none or it is wholly off the view.
   *  Its `?` is blipMark's. */
  blip?: BlipDraw | null;
```

5. Replace `planet: 'PLANET', missile: 'TORPEDO' };` with `planet: 'PLANET', missile: 'TORPEDO', blip: 'BLIP' };` (the line that defines `ARROW_NAMES`; its trailing comment stays).

- [ ] **Step 4: The arrow helper and the blip**

Still in `tacticalModel.ts`, inside `tacticalModel`, five edits.

1. Replace the line `  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number): void => {` with:

```ts
  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number, fade?: number): void => {
```

(The new argument is named `fade`, not `alpha`: `alpha` is already the model's interpolation fraction in this function.)

2. Replace the line `    const distance = Math.round(Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2));` with:

```ts
    // Sensors blip spec §3: every arrow's distance is the exact rounded length, but the blip's is rounded to the nearest
    // 100 and labelled `BLIP ~<n>`, as rough as the circle.
    const len = Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2), distance = target === 'blip' ? Math.round(len / 100) * 100 : Math.round(len);
    const name = target === 'enemy' && input.contacts && state.known[Contact.Enemy] === 0 ? 'CONTACT' : ARROW_NAMES[target];
```

3. Replace the whole line that begins `    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: ` (it ends `...(e.edge ? { edge: e.edge } : {}) });`) with:

```ts
    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: target === 'blip' ? `${name} ~${distance}` : `${name} ${distance}`, ...(fade !== undefined ? { alpha: fade } : {}), ...(e.edge ? { edge: e.edge } : {}) });
```

4. Replace the line

```ts
  if (input.ships.includes(foe)) { const en = interpolatedShip(state, prev, alpha, foe); arrow('enemy', en.x, en.y, own.x, own.y); }
```

with

```ts
  if (input.ships.includes(foe)) { const en = interpolatedShip(state, prev, alpha, foe); arrow('enemy', en.x, en.y, own.x, own.y); }
  // Sensors blip spec §3: the ping. The circle is drawn when its ring crosses the view or its centre is in it (the
  // ghosts' 40 px test would drop a large circle whose centre is just off the view). While the enemy is unseen the scene
  // leaves it out of `ships`, so the 'enemy' arrow above is not built; a centre that is off screen by the helper's own
  // test gets a 'blip' arrow instead, its range from the crew ship.
  let blip: BlipDraw | null = null;
  const ping = input.fog?.blip ?? null;
  if (ping) {
    const c = toS(ping.x, ping.y), r = ping.r * z, fade = 1 - 0.6 * ping.age;
    if (ringCrossesRect(c.x, c.y, r, vp.w, vp.h) || onScreen(ping.x, ping.y, 0)) blip = { x: c.x, y: c.y, r, alpha: fade };
    arrow('blip', ping.x, ping.y, own.x, own.y, fade);
  }
```

5. Replace the line `    ...(input.fog ? { sensor, ghosts } : {}),` with:

```ts
    ...(input.fog ? { sensor, ghosts, blip } : {}),
```

- [ ] **Step 5: `blipMark`**

Still in `tacticalModel.ts`. Replace the line

```ts
/** Enemy ship window spec §3: a map click's hit radius in internal px at zoom z, the ships loop's cull radius in screen
```

with

```ts
/** Sensors blip spec §3: where the blip's `?` goes, or null. Only while the circle is drawn and the ping's centre has no
 *  edge arrow: "off screen" is the arrow helper's own test, so the centre gets the `?` or the arrow, never both, and
 *  never neither (a point with no arrow is inside the view, where the circle is always drawn). */
export function blipMark(d: Pick<TacticalDraw, 'blip' | 'arrows'>): BlipDraw | null {
  return d.blip && !d.arrows.some((a) => a.target === 'blip') ? d.blip : null;
}

/** Enemy ship window spec §3: a map click's hit radius in internal px at zoom z, the ships loop's cull radius in screen
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/sensorsBlipMap.test.ts tests/tacticalModel.test.ts tests/engineeringFog.test.ts tests/scienceMap.test.ts tests/duelWeaponsView.test.ts tests/crtColours.test.ts tests/tacticalLayer.test.ts`
Expected: PASS, 7 files, no failure (`tests/sensorsBlipMap.test.ts` has 11 cases).

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0. (`ARROW_NAMES` is a `Record<ArrowTarget, string>`, so a missing `blip` name is a type error here.)

- [ ] **Step 8: Commit**

```bash
head -c 64 tests/sensorsBlipMap.test.ts | od -c | head -1
head -c 64 src/renderer/src/render/tactical/tacticalModel.ts | od -c | head -1
git add src/renderer/src/render/tactical/tacticalModel.ts tests/sensorsBlipMap.test.ts
git commit -m "feat(map): the blip in the map model, its on-screen rule and the BLIP edge arrow (sensors blip spec §3)" -m "TacticalDraw.blip is the ping in screen pixels, drawn when its ring crosses the view or its centre is in it. A centre off screen by the arrow helper's test gets a 'blip' arrow labelled BLIP ~n (the range to the nearest 100), never the 'enemy' arrow. blipMark places the ?: the centre gets it or the arrow, never both." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected: each `od` line shows text, and the commit lists 2 files.

---

### Task 4: The layer: the dotted circle, the `?` and the hollow blip arrow

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts`
- Create: `tests/sensorsBlipLayer.test.ts`

**Interfaces:**
- Consumes: `TacticalDraw.blip?: BlipDraw | null`, `ArrowDraw.alpha?: number`, `ArrowTarget 'blip'`, `blipMark(d)` (Task 3); in the layer, `segments(g, s, width, color, alpha)`, `dashCircle(x, y, r, dash, gap, out)`, the `words` list of `draw` (`{ text, x, y, tint, alpha? }`, drawn from the `notes` pool, each anchored at its top left), `textPx(s, scale)`, `CRT.mid`.
- Produces: the drawing. The layer has unit tests today that run in node without a renderer (`tests/tacticalLayer.test.ts`, `tests/crtColours.test.ts`, `tests/scienceMap.test.ts`): they read each `Graphics`' `context.instructions` and each `BitmapText`'s `visible`, `text`, `tint`. This task's test reads them the same way.

- [ ] **Step 1: Write the failing tests**

Create `tests/sensorsBlipLayer.test.ts`:

```ts
// Sensors blip spec §3, §4 (the layer): the ping is a dotted circle in CRT.mid at the ping's alpha with a small ? at its
// centre in the same tint and alpha; a 'blip' edge arrow is hollow, stroked in CRT.mid at the ping's alpha, and takes the
// ?'s place. Only ramp colours, and nothing allocated per frame. The layer runs in node without a renderer: the test reads
// each Graphics' instructions and each BitmapText, as tests/crtColours.test.ts does.
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { createTacticalLayer, type TacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import type { ArrowDraw, TacticalDraw } from '../src/renderer/src/render/tactical/tacticalModel';
import { textPx } from '../src/renderer/src/render/theme';

const vp = { w: 1280, h: 720 };
/** A frame with nothing on it but what `over` adds. */
const frame = (over: Partial<TacticalDraw> = {}): TacticalDraw => ({
  grid: { spacing: 500, lines: [], columns: [], rows: [] }, contours: [], edge: null, planet: null, asteroids: [], ships: [], helm: null, arrows: [],
  overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 100, units: 200 }, snapHint: false, paused: false }, stars: { x: 0, y: 0 }, ...over });
const BLIP = { x: 400, y: 300, r: 120, alpha: 0.7 };
const CIRCLE = { action: 'stroke', color: CRT.mid, alpha: 0.7, width: 1 };
const ARROW: ArrowDraw = { target: 'blip', x: 1252, y: 360, angle: Math.PI / 2, distance: 1500, label: 'BLIP ~1500', alpha: 0.4 };
const ENEMY: ArrowDraw = { target: 'enemy', x: 1252, y: 360, angle: Math.PI / 2, distance: 1500, label: 'ENEMY 1500' };

interface Ink { action: 'fill' | 'stroke'; color: number; alpha: number; width: number }
/** Every fill and stroke drawn under `root`, with its colour, alpha and (a stroke's) width. */
function ink(root: Container): Ink[] {
  const out: Ink[] = [];
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) {
      if (ins.action === 'stroke') out.push({ action: 'stroke', color: ins.data.style.color, alpha: ins.data.style.alpha, width: ins.data.style.width });
      else if (ins.action === 'fill') out.push({ action: 'fill', color: ins.data.style.color, alpha: ins.data.style.alpha, width: 0 });
    }
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
/** The layer's visible texts that read `s`. */
const texts = (layer: TacticalLayer, s: string): BitmapText[] =>
  [...layer.bloom.children, ...layer.container.children].filter((k): k is BitmapText => k instanceof BitmapText && k.visible && k.text === s);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);

describe('the layer draws the blip (sensors blip spec §3)', () => {
  it('a dotted circle in CRT.mid at the ping\'s alpha, and a small ? at its centre in the same tint and alpha', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame(), null, 0);
    expect(ink(layer.container)).not.toContainEqual(CIRCLE);
    expect(texts(layer, '?')).toEqual([]);
    layer.draw(frame({ blip: BLIP }), null, 0);
    expect(ink(layer.container)).toContainEqual(CIRCLE);
    const q = texts(layer, '?');
    expect(q).toHaveLength(1);
    expect([Number(q[0]!.tint), q[0]!.alpha, q[0]!.x, q[0]!.y]).toEqual([CRT.mid, 0.7, Math.round(400 - textPx('?', 1) / 2), 292]);
    layer.draw(frame(), null, 0);   // the next frame without it: both go
    expect(ink(layer.container)).not.toContainEqual(CIRCLE);
    expect(texts(layer, '?')).toEqual([]);
  });
  it('the ? gives way to the edge arrow: with a blip arrow the circle stays and the ? goes', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame({ blip: BLIP, arrows: [ARROW] }), null, 0);
    expect(texts(layer, '?')).toEqual([]);
    expect(ink(layer.container)).toContainEqual(CIRCLE);
  });
  it('the blip arrow is hollow, stroked in CRT.mid at the ping\'s alpha, with its label; the enemy arrow keeps its own look', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame(), null, 0);
    const fills = ink(layer.container).filter((k) => k.action === 'fill').length;   // the background and the stars
    layer.draw(frame({ arrows: [ARROW] }), null, 0);
    const blip = ink(layer.container);
    expect(blip.filter((k) => k.action === 'fill')).toHaveLength(fills);   // no fill: hollow
    expect(blip).toContainEqual({ action: 'stroke', color: CRT.mid, alpha: 0.4, width: 2 });
    expect(texts(layer, 'BLIP ~1500')).toHaveLength(1);
    layer.draw(frame({ arrows: [ENEMY] }), null, 0);
    const enemy = ink(layer.container);
    expect(enemy.filter((k) => k.action === 'fill')).toHaveLength(fills + 1);
    expect(enemy).toContainEqual({ action: 'stroke', color: CRT.main, alpha: 1, width: 2 });
    expect(enemy).not.toContainEqual({ action: 'stroke', color: CRT.mid, alpha: 0.4, width: 2 });
  });
  it('only ramp colours, and 60 frames with the blip and its arrow add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), a = frame({ blip: BLIP }), b = frame({ blip: BLIP, arrows: [ARROW] });
    for (const f of [a, b]) {
      layer.draw(f, null, 0.3);
      for (const k of ink(layer.container)) expect(CRT_RAMP, k.color.toString(16)).toContain(k.color);
      for (const t of texts(layer, '?')) expect(CRT_RAMP).toContain(Number(t.tint));
    }
    const n0 = count(layer.container);
    for (let k = 0; k < 60; k++) layer.draw(k % 2 ? a : b, null, k / 7);
    expect(count(layer.container)).toBe(n0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/sensorsBlipLayer.test.ts`
Expected: FAIL. The first three cases fail (no circle and no `?` are drawn; the blip arrow is filled like the torpedo's). The fourth may already pass.

- [ ] **Step 3: Draw the circle and the `?`**

In `src/renderer/src/render/tactical/tacticalLayer.ts`, four edits, each matched by its quoted text.

1. The import. Replace `import { asteroidShape, CHEVRON_SIZE, crackDraw, type ArrowTarget,` with `import { asteroidShape, blipMark, CHEVRON_SIZE, crackDraw, type ArrowTarget,` (the rest of the line stays).

2. Replace the line `/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows. */` with:

```ts
/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows (the
 *  enemy's arrow and the blip's never show together: sensors blip spec §3). */
```

3. Replace the line ` *  the gun's HEAT word (Valkyrn spec §7.4). */` with:

```ts
 *  the gun's HEAT word (Valkyrn spec §7.4) and the blip's ? (sensors blip spec §3): 12 at most. */
```

4. Replace the line `      if (d.planet) {` with:

```ts
      // Sensors blip spec §3: the ping of an enemy beyond sensor range: a dotted circle (the sensor ring's 2 px dashes
      // and 6 px gaps) in CRT.mid, fading from full to 40 % across the ping's age, and a small ? at its centre in the same
      // tint and alpha while the centre has no edge arrow (blipMark). Nothing else of the enemy is drawn.
      const bl = d.blip ?? null, bq = blipMark(d);
      if (bl) segments(contours, dashCircle(bl.x, bl.y, Math.max(1, bl.r), 2, 6, seg), 1, CRT.mid, bl.alpha);
      if (bq) words.push({ text: '?', x: bq.x - textPx('?', 1) / 2, y: bq.y - 8, tint: CRT.mid, alpha: bq.alpha });

      if (d.planet) {
```

- [ ] **Step 4: The blip arrow's glyph**

Still in `tacticalLayer.ts`, three edits.

1. Replace the line `  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, target: ArrowTarget): void {` with:

```ts
  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, target: ArrowTarget, alpha = 1): void {
```

2. Replace the line `    else if (target === 'enemy') g.fill(CRT.glass).stroke({ width: 2, color: CRT.main });` with:

```ts
    else if (target === 'enemy') g.fill(CRT.glass).stroke({ width: 2, color: CRT.main });
    else if (target === 'blip') g.stroke({ width: 2, color: CRT.mid, alpha });   // sensors blip spec §3: hollow, the circle's tint, at the ping's alpha
```

3. Replace the line `      d.arrows.forEach((a) => arrowGlyph(overlay, a.x, a.y, a.angle, a.target));` with:

```ts
      d.arrows.forEach((a) => arrowGlyph(overlay, a.x, a.y, a.angle, a.target, a.alpha ?? 1));
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/sensorsBlipLayer.test.ts tests/sensorsBlipMap.test.ts tests/crtColours.test.ts tests/tacticalLayer.test.ts tests/scienceMap.test.ts tests/duelWeaponsView.test.ts tests/duelHitFeedback.test.ts tests/crtFilter.test.ts`
Expected: PASS, 8 files, no failure (`tests/sensorsBlipLayer.test.ts` has 4 cases).

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
head -c 64 tests/sensorsBlipLayer.test.ts | od -c | head -1
head -c 64 src/renderer/src/render/tactical/tacticalLayer.ts | od -c | head -1
git add src/renderer/src/render/tactical/tacticalLayer.ts tests/sensorsBlipLayer.test.ts
git commit -m "feat(map): the layer draws the blip's dotted circle, its ? and the hollow blip arrow (sensors blip spec §3)" -m "The circle uses the sensor ring's dashes in CRT.mid at the ping's alpha; the ? comes from the pool of small map words; the 'blip' arrow is stroked, not filled, so it does not read as the enemy's or the torpedo's. No display object is added." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected: each `od` line shows text, and the commit lists 2 files.

---

### Task 5: The readout's rough range, the scene passing the fog, and the sit card's place

**Files:**
- Modify: `src/renderer/src/render/duel/readoutModel.ts`
- Modify: `src/renderer/src/app/duel/scene.ts`
- Create: `tests/sensorsBlipReadout.test.ts`

**Interfaces:**
- Consumes: `FogView` and its `blip` (Task 2); `readoutRows(input: ReadoutInput): ReadoutRow[]` and its OUTSIDE rows, `shipSeen(t, i)`; in `scene.ts`, the frame's `fogView` (`stepFog`'s result, made near the top of `draw`), `targetOf`, `CREW_SLOT`, `sitCard(seat, age, acted, enemyBelow = false, notice = false)` (`render/duel/sitModel.ts`, not edited); `lockRefusal(d: DuelState): string | null` (`render/duel/situationModel.ts`, read only).
- Produces: `ReadoutInput.fog?: FogView | null`; `sitCardBelow(t: TacticalState, fog: FogView): boolean` exported from `scene.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/sensorsBlipReadout.test.ts`:

```ts
// Sensors blip spec §3, §4: the OUTSIDE readout's ENEMY row reads BLIP ~<n>, the range from the crew ship to the ping's
// centre to the nearest 100, when the frame's fog view is passed and the enemy is unseen; NO CONTACT with none; today's
// rows when seen. The scene passes the fog to the drawn readout, and the sit-down card's place follows the ping's centre
// while the enemy is unseen. The lock refusal is unchanged.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { readoutRows, READOUT_W, type ReadoutRow } from '../src/renderer/src/render/duel/readoutModel';
import { sitCard } from '../src/renderer/src/render/duel/sitModel';
import { lockRefusal } from '../src/renderer/src/render/duel/situationModel';
import type { FogView } from '../src/renderer/src/render/tactical/fogModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene, sitCardBelow } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const vp = { w: 1280, h: 720 };
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
/** A hand-built fog view with the enemy unseen: a ping centred at (x, y), or no blip. */
const fogAt = (x: number, y: number, blip = true): FogView => ({ range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [], blip: blip ? { x, y, r: 375, age: 0 } : null });
const enemyRow = (rows: readonly ReadoutRow[]): string | undefined => rows.find((x) => x.label === 'ENEMY')?.value;

describe('the OUTSIDE readout (sensors blip spec §3)', () => {
  it('ENEMY BLIP ~1800 for a ping centre 1760 u away with the fog passed; NO CONTACT with none; today\'s rows when seen', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      const blip = readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(crew!.x + 1760, crew!.y) });
      expect(enemyRow(blip)).toBe('BLIP ~1800');
      expect(blip.some((x) => x.label === 'BEARING')).toBe(false);   // no bearing row, as today
      expect(textPx('ENEMY') + 6 + textPx('BLIP ~1800')).toBeLessThanOrEqual(READOUT_W - 2 * PAD);   // it fits the column, as NO CONTACT does
      const plain = readoutRows({ duel: d, mode: 'interior', active: 0 });   // no fog passed (the count-only calls, the old tests)
      expect(enemyRow(plain)).toBe('NO CONTACT');
      expect(blip.length).toBe(plain.length);                         // so the count-only calls count the drawn rows
      expect(enemyRow(readoutRows({ duel: d, mode: 'interior', active: 0, fog: null }))).toBe('NO CONTACT');
      expect(enemyRow(readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(0, 0, false) }))).toBe('NO CONTACT');   // a fog with no blip
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      const seen = readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(crew!.x + 1760, crew!.y) });   // seen: a blip in the view is ignored
      expect(enemyRow(seen)).toBe(String(Math.round(r / 2)));
      expect(seen.find((x) => x.label === 'BEARING')?.value).toBe('090');
    } finally { disposeDuel(d); }
  });
  it('the lock refusal still reads NO CONTACT on an unseen enemy', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      expect(lockRefusal(d)).toBe('NO CONTACT');
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      expect(lockRefusal(d)).toBeNull();
    } finally { disposeDuel(d); }
  });
});

describe('the sit-down card\'s place (sensors blip spec §3)', () => {
  it('unseen, it follows the ping\'s centre, not the enemy; with no blip, the enemy as today', () => {
    const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!;
    Object.assign(own, { x: 1000, y: 2000 });
    Object.assign(e, { x: 3000, y: 1500, active: true });       // the enemy is above the crew ship
    expect(sitCardBelow(t, fogAt(2900, 2300))).toBe(true);      // the ping's centre is below it
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(false);    // no blip: the enemy's own place
    e.y = 2500;                                                 // the enemy below
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(true);
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);     // still the ping's centre while there is one
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 2300)))!.top).toBe(true);
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 1700)))!.top).toBe(false);
  });
});

describe('the scene passes the frame\'s fog to the drawn readout (sensors blip spec §3)', () => {
  it('standing with the enemy beyond sensor range, the OUTSIDE strip reads ENEMY BLIP ~<n>; in range, the exact range', () => {
    const now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: vp, layout: parseShip(hound), scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    const shown = (): string => enemyRow(store.getState().duel?.readout.rows ?? []) ?? '';
    try {
      const ships = () => rt.duel.tactical.ships;   // read again after each frame: the test holds no ship across a step
      Object.assign(ships()[1]!, { x: ships()[0]!.x + 3000, y: ships()[0]!.y, active: true });   // far beyond the start range of 900
      rt.frame(1 / 60); scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      expect(rt.view()).toBe('interior');   // both stand at the start: the ship view, with the OUTSIDE strip
      expect(shown()).toMatch(/^BLIP ~\d+00$/);
      const n = Number(shown().slice('BLIP ~'.length)), dist = Math.hypot(ships()[1]!.x - ships()[0]!.x, ships()[1]!.y - ships()[0]!.y);
      expect(Math.abs(n - dist)).toBeLessThanOrEqual(0.8 * 600 + 50);   // within the largest circle's offset, plus the rounding
      Object.assign(ships()[1]!, { x: ships()[0]!.x + 600, y: ships()[0]!.y });   // inside the range
      scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      expect(shown()).toMatch(/^\d+$/);
    } finally { scene.dispose(); rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/sensorsBlipReadout.test.ts`
Expected: FAIL. The readout case fails (`expected 'NO CONTACT' to be 'BLIP ~1800'`), the sit card case fails (`sitCardBelow is not a function`) and the scene case fails (`NO CONTACT` does not match). The lock refusal case passes: that rule does not change.

- [ ] **Step 3: The readout's optional fog**

In `src/renderer/src/render/duel/readoutModel.ts`, three edits, each matched by its quoted text.

1. Replace the line `import { bearingDeg } from '../tactical/weaponsModel';` with:

```ts
import { bearingDeg } from '../tactical/weaponsModel';
import type { FogView } from '../tactical/fogModel';
```

2. Replace the line `  console?: boolean;` with:

```ts
  console?: boolean;
  /** Sensors blip spec §3: the frame's fog view. With its blip set and the enemy unseen, the OUTSIDE strip's ENEMY row reads
   *  the rough range to the ping's centre. Absent or null (the scene's calls that only count rows, the tests): NO CONTACT. */
  fog?: FogView | null;
```

3. Replace the line `    if (!shipSeen(t, target)) rows.push(row('ENEMY', 'NO CONTACT'));   // Engineering spike §10.4: no range or bearing unseen` with:

```ts
    if (!shipSeen(t, target)) {   // Engineering spike §10.4: no range or bearing unseen
      // Sensors blip spec §3: with the frame's blip, the range to the ping's centre (not to the enemy) to the nearest 100,
      // so the number is as rough as the circle. One row either way, so the count-only calls agree with the drawn rows.
      const b = input.fog?.blip ?? null;
      rows.push(row('ENEMY', b ? `BLIP ~${Math.round(Math.sqrt((b.x - crew.x) ** 2 + (b.y - crew.y) ** 2) / 100) * 100}` : 'NO CONTACT'));
    }
```

(The `else {` on the next line stays and now follows the block.)

- [ ] **Step 4: The scene: the fog to the drawn readout, the ping's centre to the sit card**

In `src/renderer/src/app/duel/scene.ts`, four edits, each matched by its quoted text.

1. Replace the line `import { createFog, stepFog } from '../../render/tactical/fogModel';` with:

```ts
import { createFog, stepFog, type FogView } from '../../render/tactical/fogModel';
```

2. Replace the line `export interface DuelSceneOptions {` with:

```ts
/** Sensors blip spec §3: whether the sit-down card's test point is below the crew ship (the card then sits at the top of
 *  the map). While the enemy is unseen the point is the ping's centre, so the card's place tells no more than the blip
 *  does; with no blip it is the enemy ship, as before. */
export function sitCardBelow(t: TacticalState, fog: FogView): boolean {
  return (fog.blip ? fog.blip.y : t.ships[targetOf(t, CREW_SLOT)]?.y ?? 0) > t.ships[CREW_SLOT].y;
}

export interface DuelSceneOptions {
```

3. Replace `readoutRows({ duel: d, mode: view === 'flight' ? 'helm' : view, active: source.active(), console: onConsole })` with:

```ts
readoutRows({ duel: d, mode: view === 'flight' ? 'helm' : view, active: source.active(), console: onConsole, fog: fogView })
```

(This is the one call that draws the rows, in `options.ui.frame`. The three calls that only count rows, which pass `mode: view` or `mode: 'weapons'` to `onWeaponsMap`, are not edited: spec §3.)

4. Replace `(d.tactical.ships[enemySlot]?.y ?? 0) > d.tactical.ships[CREW_SLOT].y` with `sitCardBelow(d.tactical, fogView)` (inside the `sitCard(...)` call; the rest of that line and its comment stay).

- [ ] **Step 5: Check the scene's calls**

```bash
grep -c "readoutRows(" src/renderer/src/app/duel/scene.ts
grep "readoutRows(" src/renderer/src/app/duel/scene.ts | grep -c "fog: fogView })"
grep -c "sitCardBelow(d.tactical, fogView)" src/renderer/src/app/duel/scene.ts
```

Expected: `4`, then `1`, then `1`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/sensorsBlipReadout.test.ts tests/duelReadout.test.ts tests/engineeringFog.test.ts tests/contactScene.test.ts tests/feelPresentation.test.ts tests/crewSeats.test.ts`
Expected: PASS, 6 files, no failure (`tests/sensorsBlipReadout.test.ts` has 4 cases; `tests/engineeringFog.test.ts`'s `NO CONTACT` readout case passes unchanged, as the no-fog case).

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
head -c 64 tests/sensorsBlipReadout.test.ts | od -c | head -1
head -c 64 src/renderer/src/render/duel/readoutModel.ts | od -c | head -1
head -c 64 src/renderer/src/app/duel/scene.ts | od -c | head -1
git add src/renderer/src/render/duel/readoutModel.ts src/renderer/src/app/duel/scene.ts tests/sensorsBlipReadout.test.ts
git commit -m "feat(readout): ENEMY BLIP ~n from the frame's fog; the sit card follows the ping's centre (sensors blip spec §3)" -m "readoutRows takes an optional fog view: unseen with a blip, the OUTSIDE strip's ENEMY row is the range to the ping's centre to the nearest 100. The scene passes the fog to the one call that draws the rows, and sitCardBelow picks the card's place from the ping's centre while the enemy is unseen." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected: each `od` line shows text, and the commit lists 3 files.

---

### Task 6: The full verification, the gate entry and the report

**Files:**
- Modify: `docs/gates.md` (one new entry at the end)

**Interfaces:**
- Consumes: Tasks 2 to 5, committed; `BASE` (Task 1).
- Produces: the gate entry (its Automated box checked, its Manual box open for the owner) and the report.

- [ ] **Step 1: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `electron-vite build` builds main, preload and renderer and ends with a `built in` line; exit 0.

- [ ] **Step 3: The full suite**

Run: `npx vitest run --maxWorkers=4`
Expected: every test file passes, no failure. Note the two totals it prints (`Test Files  <F> passed`, `Tests  <T> passed`) for Step 6. A timeout in one of the heavy files named in Global Constraints is re-run alone (`npx vitest run <that file>`) before it counts. The goldens and the determinism fixture pass without any bless.

- [ ] **Step 4: The duel app smoke (after vitest has ended)**

Run: `npm run test:duel-app-runtime`
Expected: the last line begins `ACTUAL DUEL APP:`.

- [ ] **Step 5: Prove nothing outside the plan's list changed**

```bash
BASE=$(git merge-base master HEAD)
git diff --stat "$BASE" HEAD -- src/renderer/src/sim src/renderer/src/net src/renderer/src/authority tests/golden tests/fixtures scripts/golden
git diff --name-only "$BASE" HEAD
git status --short -- src tests
```

Expected: the first command prints nothing (no sim, wire, golden or fixture file changed). The second prints exactly these ten paths:

```
src/renderer/src/app/duel/scene.ts
src/renderer/src/render/duel/readoutModel.ts
src/renderer/src/render/tactical/fogModel.ts
src/renderer/src/render/tactical/tacticalLayer.ts
src/renderer/src/render/tactical/tacticalModel.ts
tests/engineeringFog.test.ts
tests/sensorsBlipFog.test.ts
tests/sensorsBlipLayer.test.ts
tests/sensorsBlipMap.test.ts
tests/sensorsBlipReadout.test.ts
```

The third prints nothing (no uncommitted code).

- [ ] **Step 6: The gate entry**

Read the last line of `docs/gates.md` (`tail -n 1 docs/gates.md`). With the Edit tool, replace that line with itself followed by a blank line and the entry below, with `<F>` and `<T>` replaced by the two totals from Step 3:

```markdown
## Sensors blip: an enemy beyond sensor range is a rough ping (2026-11-19)

Spec `docs/superpowers/specs/2026-11-19-sensors-blip-design.md`; plan `docs/superpowers/plans/2026-11-19-sensors-blip.md`.

- [x] Automated (sensors blip): `npx vitest run` passes (<F> files, <T> tests). This includes the ping (a blip from the first unseen frame, the radius 150 to 600 by the distance beyond range, the centre within 0.8 r of the enemy by the pinned hash, held for 120 game ticks and aged 0 to 1, no new ping while the tick stands still, dropped when seen or destroyed, cleared by a new round, no enemy ghost), the map model (the circle's on-screen rule, the `?` or the `BLIP ~n` edge arrow and never both, no enemy arrow, goal glow or FIRING SOLUTION on it, no pick), the layer (the dotted circle, the `?` and the hollow arrow in the ramp, nothing allocated), the readout's `ENEMY  BLIP ~n` and the sit card's place (`tests/sensorsBlip*.test.ts`, `tests/engineeringFog.test.ts`). `npx tsc -b` is clean and `npm run build` passes. Drawing only: no file under `src/renderer/src/sim/`, no wire schema and no golden changed, and SIM_VERSION is untouched.
- [ ] Manual (owner): play a Single player duel.
  1. At the round's start the Hunter is beyond sensor range. At the Helm an arrow at the map's edge reads `BLIP ~<n>`. Zoom out until the dotted circle with a `?` is on screen: it jumps to a new guess about every 2 s and fades between jumps. Press Esc: while paused it does not jump.
  2. Fly toward it. The circle shrinks as you close, and at sensor range the Hunter's ship takes its place. Fly away again: the ship turns into a blip at once, with no fading ghost left behind.
  3. With the Hunter in sight, lower the Sensors power until the range ring falls short of it: it turns into a blip. Raise it again: the ship is back.
  4. Stand up (the ship view): the OUTSIDE strip reads `ENEMY  BLIP ~<n>`, a round number close to the arrow's.
  5. At Weapons, click the blip and press T: nothing is picked, and a lock still reads NO CONTACT.

  Does the blip read as a rough fix on the amber CRT, is the 2 s ping comfortable to watch, and is the circle the right size near and far? The numbers are starting values: `BLIP_R_MIN`, `BLIP_GROW`, `BLIP_R_MAX` and `BLIP_PING_TICKS` in `src/renderer/src/render/tactical/fogModel.ts`.
```

- [ ] **Step 7: Commit**

```bash
head -c 64 docs/gates.md | od -c | head -1
tail -c 200 docs/gates.md | od -c | tail -3
git add docs/gates.md
git commit -m "docs(gates): the sensors blip gate entry (automated checked, the owner's look check open)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
git status --short -- src tests docs/gates.md
```

Expected: both `od` outputs show text, the commit lists 1 file, and the last command prints nothing.

- [ ] **Step 8: Report**

The executor's final message to the controller carries, and nothing is written to a file for it:

1. BASE (Task 1) and the branch's head (`git rev-parse --short HEAD`), with the six commits' subjects (`git log --oneline master..HEAD`).
2. The full suite's totals (files, tests), `npx tsc -b` clean, `npm run build` passed, the smoke's `ACTUAL DUEL APP:` line.
3. That Step 5's three checks matched: no sim, wire, golden or fixture change, and exactly the ten code and test files.
4. Any step whose result differed from its Expected line, and what was done about it. A changed assertion or a skipped step is named here, never left silent.
5. What is still open: the owner's manual box in `docs/gates.md`, and the merge to master (not part of this plan; W-4b's map task edits the same two map files, so whichever lands second merges).

---

## Self-review (done while writing; the executor need not repeat it)

**Spec coverage.**

| Spec | Where |
| --- | --- |
| §2.1 when there is a blip; none when seen, destroyed or absent; no earlier sighting needed; the enemy ghost removed; the derelict's and the torpedo's ghosts unchanged | Task 2 (Step 4 edits 7 and 8; tests "unseen from the first frame", "seen again", "a new round ... destroyed", "the ghosts"; the rewritten `engineeringFog` cases; its torpedo case untouched) |
| §2.2 the radius and its three constants | Task 2 (`blipRadius`; test "the radius") |
| §2.3 the tick clock, `BLIP_PING_TICKS`, when a ping is made, the centre and the hash, holding between pings, the age, dropped when seen, cleared by a new round | Task 2 (`blipHash`, `stepFog`; tests "the hash", "the centre", "the same round", "the circle holds", "78 ticks", "does not advance", "seen again", "a new round") |
| §2.4 `FogView.blip`, `Blip`, the tracker's held ping, `GhostKind` keeps `'enemy'` | Task 2 (Step 4 edits 3 to 5) |
| §3 the map: the dotted circle, its tint and alpha, the `?`, nothing else of the enemy | Task 3 (`TacticalDraw.blip`, the alpha), Task 4 (the drawing) |
| §3 when it is drawn (`ringCrossesRect` or the centre on screen; the `?` by the arrow's test) | Task 3 (Step 4 edit 4, `blipMark`; tests 1, 3, 4, 5) |
| §3 the edge arrow: `'blip'`, `ARROW_NAMES`, the rounded distance and label, the hollow glyph, never the enemy's arrow, goal glow or FIRING SOLUTION | Task 3 (Steps 3 and 4; the "nothing of the enemy's" tests), Task 4 (Step 4) |
| §3 every console map that draws ghosts (Helm, Weapons, Science, Flight) | The scene builds one `tacticalModel` input with `fog: fogView` for every map view (unchanged), so Tasks 3 and 4 reach all four |
| §3 the OUTSIDE readout, `ReadoutInput.fog`, only the drawn call passes it | Task 5 (Steps 3 to 5) |
| §3 the sit-down card's place | Task 5 (`sitCardBelow`, Step 4 edit 4) |
| §3 unchanged: the contact window, the lock refusal, the situation line, picking, the camera, the sparks and sounds, AUTO fire | No edit. Pinned: picking (Task 3's click test), `lockRefusal` (Task 5); the rest stay under `tests/engineeringFog.test.ts`'s existing cases, which Tasks 2, 3 and 5 run |
| §4 tests | Tasks 2 to 5, one new file each; "No sim test changes" by Task 6 Step 5 |
| §4 final checks | Task 6 Steps 1 to 3 |
| §5 its own branch; one gate entry | Task 1; Task 6 Step 6 |
| §6 not in this build | Nothing planned for it |

**Placeholders.** None: every code step shows its code, and every command its expected result. `BASE`, `<F>` and `<T>` are values a named command prints during the run.

**Names across tasks.** `FogView.blip` / `Blip { x, y, r, age }` (Task 2) is what Task 3's model and Task 5's readout and `sitCardBelow` read. `TacticalDraw.blip` / `BlipDraw { x, y, r, alpha }`, `ArrowDraw.alpha` and `blipMark` (Task 3) are what Task 4's layer and its test use. `sitCardBelow(t, fog)` is defined and used in Task 5 only.
