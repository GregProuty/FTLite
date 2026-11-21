# Asteroids-iv-a (Cell Rocks: Real Pieces With True Shapes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase iv-a of `docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md`: every seeded rock is a fixed set of hexagonal cells, a break divides those cells into real pieces of the original rock (a straight cut, or a six-sector shatter for a torpedo's direct hit), and shots, ships and other rocks meet the cells, not a circle round them. Nothing turns yet; spin is phase iv-b and gets its own plan after the owner has played this one.

**Architecture:** A new pure module `sim/tactical/rockCells.ts` holds the lattice, the per-asteroid templates and the mask maths (connectivity, the cut, the shatter). The tactical state gains one hashed array beside the pool, `rockCells` (2 values a slot: template + 1, and the cell mask); `rocks.ts` reads it and offers thin-shot tests against cells; a new `sim/tactical/rockShape.ts` answers body contacts. `rockBreak.ts` is rewritten round the cut. The renderer gains `render/tactical/rockOutline.ts` (the outline and seams of a mask). A rock without a template (a "plain rock", used by tests) is one round cell of radius r and behaves bit for bit as today.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Pixi.js v8 render models, `tsx` scripts, Electron + playwright-core for screenshots.

## Global Constraints

- **Where.** Work only in `C:/Users/djuar/FTLite/.worktrees/asteroids-iv` (branch `asteroids-iv`, made from master in Task 0). Never edit `C:/Users/djuar/FTLite` or another worktree. Never `git stash`. Never push. Commit only the files a task names.
- **Commands** run from the worktree root in Git Bash. Targeted tests: `npx vitest run <files>`. Types: `npx tsc -b`. Whole suite: `npm run build` first (one test reads `out/`), then `npx vitest run`.
- **Determinism guard** (`tests/helpers/determinismGuard.ts`, run by `tests/boundary.test.ts` over every file under `src/renderer/src/sim`): sim code may use only `+ − × ÷`, bit operations, and `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `**`, `Math.pow`, `Math.hypot`, `Math.clz32`, trigonometry, `Date`, `performance`. Fixed constants are literals. Renderer files (`src/renderer/src/render/**`) may use any Math.
- **Plain rocks stay exact.** A slot with no template must give today's results bit for bit. Each task says how; the proof is that the existing plain-rock tests named in the task pass unedited.
- **Expected red until Task 8.** From Task 2 the state has a new hashed field, so the goldens and trajectory-pinned tests fail until Task 8 re-blesses them: `golden`, `duelGolden`, `duelRematchGolden`, `determinismHarness`, `duelCheckpoint`, `duelModules` (pinned ticks only), `duelSnapshot`, `duelScripted`, `tacticalSlots`, `contactScene`, pinned telemetry. Any other failure is a bug in the task at hand.
- **Tests that pin a number on a `seeded()` rock.** Seeded rocks now have cells, so a pinned mass, impulse or impact changes. Recompute the expectation from the same formula with `rockMassOf(st, k)` in place of `rockMass(r)` and say so in the test's comment. Never loosen an assertion on a plain rock (`mover`, `rail`): those must not change.
- **SIM_VERSION** goes up by one in Task 8 only, from whatever master holds then (63 today; Helm round 2 may take 64 first), by the two-step bless.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- **Numbers** (all in `src/renderer/src/sim/tactical/rockTuning.ts`): `RIM_DROP = 30`, `CRATER_K = 0.75`, `CUT_KICK = 0.12`, `TIDAL_CUT_KICK = 0.04`, `TIDAL_MIN_CELLS = 4`. Kept: `ROCK_MIN_R = 8`, `BURST_KICK_MIN = 0.3`, `BURST_KICK_SPAN = 0.3`, `GOLDEN_FRAC`.

## Deviations from the spec (the spec is amended to match in Task 0)

1. **No `rockTurn` in this phase.** Orientation is the identity and ω is 0 everywhere in iv-a, so storing them would hash and send constants. iv-b adds the array with its own version bump.
2. **One array, not two.** `rockCells: Float64Array`, 2 values a slot (`template + 1`, `mask`), in place of `rockTmpl: Int16Array` and `rockMask: Uint32Array`. The module field helper, the clone and the wire already take a `Float64Array` as they take `rocks`, and a gone or plain slot holds zeros like every other free entry.
3. **A template is a function of the map.** Its hash salt comes from the asteroid's index and place, not from the seed directly (the map is itself a function of the seed), so `templateFor(map, index)` needs no state.
4. **Spacing fits the dropped template.** After the rim drops, the cells are re-centred on their own centre of mass and the spacing is `R / (farthest cell centre in spacings + 0.5773502691896258)`. A seeded rock's `(x, y)` is then its centre of mass and its bounding radius is exactly R. The spec's table gives the spacing of a template with no drop.
5. **The shatter's point** is the centre of the cell nearest the torpedo, not the torpedo's own place, so the crater always takes at least one cell and the three lines pass through the rock. If the three lines still leave one group, that group is cut once through its centre of mass.
6. **World cells are worked out on demand** into a scratch (at most 31 additions), with no per-slot memo. Task 7 measures the cost; a memo is added only if the budget fails.
7. **Drawn corners are fixed per template.** The spec eased a rim corner by the cells a rock has now; the plan eases it by the template's own rim, so no corner moves when a rock is divided and two pieces fit exactly along their cut. A fresh cut face is therefore jagged, and the original rim smooth.
8. **Circles kept:** the single-ship flight view's `hitStatics`, the Helm's predicted path, the Hunter's avoidance and `rockOnTarget` read the bounding circle, as the spec's §6 says for predictions; `predictMissile`'s rock check (the Weapons torpedo-path preview) likewise stops at the bounding circle, which errs on the safe side.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/renderer/src/sim/tactical/rockCells.ts` (new) | Pure: lattice constants, `Template`, `buildTemplate`, `templateFor`, `popcount`, `components`, `shapeOf`, `cutSides`, `shatterGroups`. |
| `src/renderer/src/sim/tactical/rocks.ts` | The pool plus `rockCells` accessors, `rockMassOf`, world cells, the thin-shot tests (`rockEntry`, `rockNear`, `rockTouch`), `rockAimPoint`, `firstBlocker`. |
| `src/renderer/src/sim/tactical/rockShape.ts` (new) | Body contacts from cells: `rockCircleContact`, `rockPairContact`, `rockNearestCell`, `rockSurfaceDistance`. |
| `src/renderer/src/sim/tactical/rockBreak.ts` | Rewritten: `breakRock` (cut, shatter, tidal), `hitRock` with an impact point; the fan and burst tables removed. |
| `src/renderer/src/sim/tactical/{state,hash}.ts` | The `rockCells` member, its field, clone and validation. |
| `src/renderer/src/sim/tactical/{contacts,rockContacts,rockBlast,rockWeapons,gun,pew,missiles,geometry}.ts` | Callers moved to cells. |
| `src/renderer/src/render/tactical/rockOutline.ts` (new) | A mask's outline loops and seams, cached. |
| `src/renderer/src/render/tactical/{tacticalModel,tacticalLayer}.ts` | Rocks drawn from the outline; the invented cracks and the drawing-only spin removed. |
| `tests/helpers/rockArena.ts` | `shaped`, `tmplOf`; `arena` and `seeded` handle `rockCells`. |

---

### Task 0: The worktree and the spec amendments

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md`

- [ ] **Step 1: Make the worktree**

```bash
cd /c/Users/djuar/FTLite
git worktree add .worktrees/asteroids-iv -b asteroids-iv master
```

Then in PowerShell (junctions; a worktree without the second one fails the online smoke):

```powershell
New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\asteroids-iv\node_modules -Target C:\Users\djuar\FTLite\node_modules
New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\asteroids-iv\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules
```

- [ ] **Step 2: Amend the spec.** In the worktree's copy of the spec, add this section before `## 11. Tests`, unchanged:

```markdown
## 10a. Amendments from planning (2026-11-20; these win over the sections above)

1. iv-a stores no `rockTurn`. Orientation is the identity and ω is 0 until iv-b adds the array.
2. §3.3's two arrays are one: `rockCells: Float64Array`, 2 values a slot (template + 1, then the mask). A gone or plain
   slot holds zeros.
3. §3.2's hash salt comes from the asteroid's index and place on the map, not from the seed directly.
4. §3.2's spacing is fitted after the rim drops: the cells are re-centred on their centre of mass and
   d = R / (the farthest cell centre in spacings + 0.5773502691896258). The table's divisors are those of a template
   with no drop.
5. §5.3's point P is the centre of the cell nearest the torpedo. If the three lines leave one group, it is cut once
   through its centre of mass along u.
6. §9's per-slot memo of world cells is built only if the measured cost needs it.
7. §7's easing of a rim corner (the notch out, the tip in) is decided by the template's own rim, not by the cells a rock
   has now. A corner's drawn place is then fixed per template, two pieces fit exactly along their cut, and a fresh cut
   face is jagged where the original rim is smooth.
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/djuar/FTLite/.worktrees/asteroids-iv
git add docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md
git commit -m "spec(asteroids-iv): amendments from planning (one cells array, no rockTurn in iv-a, fitted spacing, the shatter's point)"
```

---

### Task 1: The cells (pure lattice, templates, masks)

**Files:**
- Create: `src/renderer/src/sim/tactical/rockCells.ts`
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (append two constants)
- Test: `tests/rockCells.test.ts`

**Interfaces:**
- Consumes: `MapDef` (`./map`).
- Produces: `S3`, `HIT_K`, `CONTACT_K`, `CELL_MAX`, `NEIGHBOURS`, `shellFor(R)`, `cellHash(index, q, r, salt)`, `interface Template { index, R, d, n, fullCount, full, q, r, x, y, nb, hitR, contactR, shapes }`, `interface Shape { mask, n, gx, gy, r, ox, oy, aim }`, `interface CutOut { left, right, ux, uy }`, `buildTemplate(index, R, salt): Template`, `templateFor(map, index): Template`, `popcount(mask): number`, `components(t, mask, out): number`, `shapeOf(t, mask): Shape`, `cutSides(t, mask, px, py, ux, uy, out): void`, `shatterGroups(t, mask, px, py, ux, uy, out): number`.

- [ ] **Step 1: Add the two tuning constants.** Append to `src/renderer/src/sim/tactical/rockTuning.ts`:

```ts
// ---- Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md) ----
/** §3.2: a rim cell is a candidate to drop when its hash mod 100 is under RIM_DROP. §5.3: a shatter's crater takes the
 *  cells whose centre lies within CRATER_K spacings of the struck cell's centre. */
export const RIM_DROP = 30, CRATER_K = 0.75;
```

- [ ] **Step 2: Write the failing test** `tests/rockCells.test.ts`:

```ts
// Asteroids-iv spec §3.1, §3.2, §5.2, §5.3: the lattice, the templates and the mask maths (pure).
import { describe, expect, it } from 'vitest';
import { buildTemplate, cellHash, components, cutSides, HIT_K, popcount, shapeOf, shatterGroups, shellFor, type CutOut } from '../src/renderer/src/sim/tactical/rockCells';

const out: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
const each = (run: (index: number, R: number) => void): void => { for (let i = 0; i < 120; i++) run(i, 15 + (i * 7) % 41); };

describe('templates (spec §3.2)', () => {
  it('7, 19 or 31 cells before the drops by radius, and never under the floor of 4, 13 or 25', () => {
    expect([shellFor(15).full, shellFor(20).full, shellFor(20.1).full, shellFor(40).full, shellFor(40.1).full, shellFor(55).full]).toEqual([7, 7, 19, 19, 31, 31]);
    each((i, R) => { const t = buildTemplate(i, R, i * 13), sh = shellFor(R); expect(t.fullCount).toBe(sh.full); expect(t.n).toBeGreaterThanOrEqual(sh.floor); expect(t.n).toBeLessThanOrEqual(sh.full); expect(popcount(t.full)).toBe(t.n); });
  });
  it('is the same for the same inputs, and the drops vary with the index and the salt', () => {
    const a = buildTemplate(4, 44, 99), b = buildTemplate(4, 44, 99);
    expect(Array.from(a.x)).toEqual(Array.from(b.x)); expect(a.full).toBe(b.full);
    const counts = new Set<number>(); for (let i = 0; i < 40; i++) counts.add(buildTemplate(i, 44, i * 31).n);
    expect(counts.size).toBeGreaterThan(2);
    expect(cellHash(1, 0, 0, 5)).not.toBe(cellHash(1, 0, 0, 6));
  });
  it('is connected, centred on its centre of mass, and its farthest hit circle touches R exactly', () => {
    const groups: number[] = [];
    each((i, R) => {
      const t = buildTemplate(i, R, i);
      expect(components(t, t.full, groups)).toBe(1);
      let sx = 0, sy = 0, far = 0;
      for (let c = 0; c < t.n; c++) { sx += t.x[c]!; sy += t.y[c]!; far = Math.max(far, Math.hypot(t.x[c]!, t.y[c]!)); }
      expect(Math.abs(sx / t.n)).toBeLessThan(1e-9); expect(Math.abs(sy / t.n)).toBeLessThan(1e-9);
      expect(far + t.hitR).toBeCloseTo(R, 9);
      expect(t.hitR).toBeCloseTo(t.d * HIT_K, 12); expect(t.contactR).toBeCloseTo(t.d / 2, 12);
    });
  });
  it('neighbours are one spacing apart and the relation is symmetric', () => {
    each((i, R) => {
      const t = buildTemplate(i, R, 3);
      for (let a = 0; a < t.n; a++) for (let b = 0; b < t.n; b++) {
        const near = ((t.nb[a]! >>> b) & 1) === 1;
        expect(near).toBe(((t.nb[b]! >>> a) & 1) === 1);
        if (near) expect(Math.hypot(t.x[a]! - t.x[b]!, t.y[a]! - t.y[b]!)).toBeCloseTo(t.d, 9);
      }
    });
  });
});

describe('masks (spec §3.3, §5.2 step 4)', () => {
  const t = buildTemplate(2, 50, 7);
  it('popcount counts bits', () => { expect([popcount(0), popcount(1), popcount(0b1011), popcount(0x7fffffff)]).toEqual([0, 1, 3, 31]); });
  it('components: removing a band through the middle leaves two groups that share no cell', () => {
    let column = 0;   // rows are offset by half a spacing, so a band three half-columns wide is what parts the two sides
    for (let c = 0; c < t.n; c++) if (Math.abs(t.x[c]!) < t.d * 0.75) column |= 1 << c;
    const rest = t.full & ~column, groups: number[] = [], n = components(t, rest, groups);
    expect(n).toBe(2);
    expect(groups[0]! & groups[1]!).toBe(0); expect(groups[0]! | groups[1]!).toBe(rest);
    expect(groups[0]! & -groups[0]!).toBeLessThan(groups[1]! & -groups[1]!);   // ascending by lowest cell
  });
  it('shapeOf: the count, the centre of mass, the bounding radius, the aim cell; memoised per mask', () => {
    const half = (() => { let m = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < 0) m |= 1 << c; return m; })(), s = shapeOf(t, half);
    expect(s.n).toBe(popcount(half)); expect(shapeOf(t, half)).toBe(s);
    let gx = 0; for (let c = 0; c < t.n; c++) if ((half >>> c) & 1) gx += t.x[c]!;
    expect(s.gx).toBeCloseTo(gx / s.n, 12); expect(s.gx).toBeLessThan(0);
    let far = 0, near = Infinity, aim = -1;
    for (let j = 0; j < s.n; j++) { const d = Math.hypot(s.ox[j]!, s.oy[j]!); far = Math.max(far, d); if (d < near) { near = d; aim = j; } }
    expect(s.r).toBeCloseTo(far + t.hitR, 12); expect(s.aim).toBe(aim);
    expect(() => shapeOf(t, 0)).toThrow();
  });
});

describe('the cut (spec §5.2)', () => {
  const t = buildTemplate(2, 50, 7);
  it('a line through the middle puts each cell on its side: left is cross(u, cell − P) ≥ 0', () => {
    cutSides(t, t.full, 0, 0, 0, 1, out);
    expect(out.left | out.right).toBe(t.full); expect(out.left & out.right).toBe(0);
    expect(out.left).not.toBe(0); expect(out.right).not.toBe(0);
    for (let c = 0; c < t.n; c++) expect(((out.left >>> c) & 1) === 1).toBe(0 * (t.y[c]! - 0) - 1 * (t.x[c]! - 0) >= 0);
    expect([out.ux, out.uy]).toEqual([0, 1]);
  });
  it('a line that misses the rock is moved through the centre of mass', () => {
    cutSides(t, t.full, 500, 0, 0, 1, out);
    expect(out.left).not.toBe(0); expect(out.right).not.toBe(0); expect(out.left | out.right).toBe(t.full);
  });
  it('two cells lying along u are still divided (the quarter turn)', () => {
    const a = 0, b = (() => { for (let c = 1; c < t.n; c++) if ((t.nb[a]! >>> c) & 1) return c; return -1; })(), mask = (1 << a) | (1 << b);
    const ux = t.x[b]! - t.x[a]!, uy = t.y[b]! - t.y[a]!;
    cutSides(t, mask, t.x[a]!, t.y[a]!, ux / t.d, uy / t.d, out);
    expect(popcount(out.left)).toBe(1); expect(popcount(out.right)).toBe(1);
  });
});

describe('the shatter (spec §5.3, amendment 5)', () => {
  it('takes the struck cell as the crater and leaves at least two groups that share no cell, for every cell of every template', () => {
    const groups: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = buildTemplate(i, 25 + (i % 4) * 10, i * 5);
      for (let c = 0; c < t.n; c++) {
        const n = shatterGroups(t, t.full, t.x[c]!, t.y[c]!, 0.6, -0.8, groups);
        let all = 0;
        for (let g = 0; g < n; g++) { expect(all & groups[g]!).toBe(0); all |= groups[g]!; }
        expect((all >>> c) & 1).toBe(0);                       // the struck cell is dust
        expect(n).toBeGreaterThanOrEqual(2);
        for (let k = 0; k < t.n; k++) if (!((all >>> k) & 1)) expect(Math.hypot(t.x[k]! - t.x[c]!, t.y[k]! - t.y[c]!)).toBeLessThanOrEqual(0.75 * t.d + 1e-9);
      }
    }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/rockCells.test.ts`
Expected: FAIL, cannot resolve `rockCells`.

- [ ] **Step 4: Write** `src/renderer/src/sim/tactical/rockCells.ts`:

```ts
// Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md §3.1, §3.2, §5.2, §5.3, §10a): the
// cells a rock is built of. Pure: no state. Only + − × ÷, bit operations, Math.sqrt, floor, max and imul (the determinism
// guard). Cells sit on a hexagonal lattice: cell (q, r) is at (q + r / 2, r · S3) spacings, and two cells are neighbours
// one lattice step apart. A template is seeded asteroid `index`'s fixed cell set, centred on its centre of mass, its
// farthest hit circle exactly at the asteroid's map radius R. A rock is a template and a mask of its cells (bit i: cell i;
// at most 31 cells, so every mask is a positive 32-bit integer).
import type { MapDef } from './map';
import { CRATER_K, RIM_DROP } from './rockTuning';

export const S3 = 0.8660254037844386, HIT_K = 0.5773502691896258, CONTACT_K = 0.5, CELL_MAX = 31;
/** The six lattice steps to a cell's neighbours, by rising angle from +x on the y-down map: 0°, 60°, ... 300°. */
export const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** §3.2: a size class: cells out to squared lattice distance l2 (q² + qr + r²), the rim beyond inner2, the floor the rim
 *  drops stop at, and the count before any drop. */
export interface Shell { readonly l2: number; readonly inner2: number; readonly floor: number; readonly full: number }
const SHELLS: readonly Shell[] = [{ l2: 1, inner2: 0, floor: 4, full: 7 }, { l2: 4, inner2: 1, floor: 13, full: 19 }, { l2: 7, inner2: 4, floor: 25, full: 31 }];
export function shellFor(R: number): Shell { return R <= 20 ? SHELLS[0]! : R <= 40 ? SHELLS[1]! : SHELLS[2]!; }

/** A 32-bit hash of an asteroid's index, a lattice cell and a salt. */
export function cellHash(index: number, q: number, r: number, salt: number): number {
  let h = Math.imul((index + 1) ^ 0x9e3779b9, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ ((q + 8) * 16 + (r + 8)), 0x85ebca6b) >>> 0; h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h ^ (salt | 0), 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h;
}

/** What a mask of a template comes to: its cell count, its centre of mass (gx, gy) in the template's frame, its bounding
 *  radius r about that centre (the farthest cell centre plus the hit radius), each live cell's offset from the centre of
 *  mass in rising cell order, and `aim`, the index (into ox, oy) of the cell nearest the centre of mass. */
export interface Shape { readonly mask: number; readonly n: number; readonly gx: number; readonly gy: number; readonly r: number; readonly ox: Float64Array; readonly oy: Float64Array; readonly aim: number }
export interface Template {
  readonly index: number; readonly R: number; readonly d: number; readonly n: number;
  /** The cell count before the rim drops (7, 19 or 31: the mass share), and the mask with every cell. */
  readonly fullCount: number; readonly full: number;
  readonly q: Int8Array; readonly r: Int8Array; readonly x: Float64Array; readonly y: Float64Array;
  /** nb[i]: the mask of cell i's neighbours in the template. */
  readonly nb: Int32Array;
  readonly hitR: number; readonly contactR: number;
  readonly shapes: Map<number, Shape>;
}

/** §3.2, §10a 4: the template of an asteroid of map radius R. */
export function buildTemplate(index: number, R: number, salt: number): Template {
  const sh = shellFor(R), all: { q: number; r: number; rim: boolean; h: number }[] = [];
  for (let r = -3; r <= 3; r++) for (let q = -3; q <= 3; q++) {
    const d2 = q * q + q * r + r * r;
    if (d2 <= sh.l2) all.push({ q, r, rim: d2 > sh.inner2, h: cellHash(index, q, r, salt) });
  }
  const cand = all.filter((c) => c.rim && c.h % 100 < RIM_DROP).sort((a, b) => a.h - b.h || a.r - b.r || a.q - b.q);
  const dropped = new Set(cand.slice(0, all.length - sh.floor)), kept = all.filter((c) => !dropped.has(c)), n = kept.length;
  let cx = 0, cy = 0;
  for (const c of kept) { cx += c.q + c.r / 2; cy += c.r * S3; }
  cx /= n; cy /= n;
  let far = 0;
  for (const c of kept) { const lx = c.q + c.r / 2 - cx, ly = c.r * S3 - cy; far = Math.max(far, Math.sqrt(lx * lx + ly * ly)); }
  const d = R / (far + HIT_K), q = new Int8Array(n), r = new Int8Array(n), x = new Float64Array(n), y = new Float64Array(n), nb = new Int32Array(n);
  kept.forEach((c, i) => { q[i] = c.q; r[i] = c.r; x[i] = (c.q + c.r / 2 - cx) * d; y[i] = (c.r * S3 - cy) * d; });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const dq = q[j]! - q[i]!, dr = r[j]! - r[i]!;
    if (dq * dq + dq * dr + dr * dr === 1) nb[i] = nb[i]! | (1 << j);
  }
  return { index, R, d, n, fullCount: sh.full, full: n === 31 ? 0x7fffffff : (1 << n) - 1, q, r, x, y, nb, hitR: d * HIT_K, contactR: d * CONTACT_K, shapes: new Map() };
}

const templates = new WeakMap<MapDef, (Template | undefined)[]>();
/** §10a 3: seeded asteroid `index`'s template, built once per map (its salt from the asteroid's place). */
export function templateFor(map: MapDef, index: number): Template {
  let list = templates.get(map);
  if (!list) { list = []; templates.set(map, list); }
  let t = list[index];
  if (!t) {
    const a = map.asteroids[index];
    if (!a) throw new Error(`no seeded asteroid ${index}`);
    t = buildTemplate(index, a.r, Math.floor(a.x * 4) * 7919 + Math.floor(a.y * 4));
    list[index] = t;
  }
  return t;
}

export function popcount(mask: number): number { let n = 0; for (let v = mask; v !== 0; v &= v - 1) n++; return n; }

/** §5.2 step 4: the connected groups of `mask` (neighbour connectivity), written to out[0 .. count) in rising order of
 *  each group's lowest cell; the count. */
export function components(t: Template, mask: number, out: number[]): number {
  let rest = mask, count = 0;
  while (rest !== 0) {
    let comp = rest & -rest;
    for (;;) {
      let grow = comp;
      for (let i = 0; i < t.n; i++) if ((comp >>> i) & 1) grow |= t.nb[i]!;
      grow &= mask;
      if (grow === comp) break;
      comp = grow;
    }
    out[count++] = comp; rest &= ~comp;
  }
  return count;
}

/** The shape of a non-empty mask, memoised per template. */
export function shapeOf(t: Template, mask: number): Shape {
  let s = t.shapes.get(mask);
  if (s) return s;
  const n = popcount(mask);
  if (n === 0) throw new Error('an empty rock has no shape');
  const ox = new Float64Array(n), oy = new Float64Array(n);
  let gx = 0, gy = 0;
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) { gx += t.x[i]!; gy += t.y[i]!; }
  gx /= n; gy /= n;
  let far2 = 0, near2 = Infinity, aim = 0, j = 0;
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) {
    const x = t.x[i]! - gx, y = t.y[i]! - gy, d2 = x * x + y * y;
    ox[j] = x; oy[j] = y;
    if (d2 > far2) far2 = d2;
    if (d2 < near2) { near2 = d2; aim = j; }
    j++;
  }
  s = { mask, n, gx, gy, r: Math.sqrt(far2) + t.hitR, ox, oy, aim };
  t.shapes.set(mask, s);
  return s;
}

/** The cells of `mask` left of the line through (px, py) along (ux, uy): cross(u, cell − P) ≥ 0. Template frame. */
function leftOf(t: Template, mask: number, px: number, py: number, ux: number, uy: number): number {
  let left = 0;
  for (let i = 0; i < t.n; i++) if (((mask >>> i) & 1) && ux * (t.y[i]! - py) - uy * (t.x[i]! - px) >= 0) left |= 1 << i;
  return left;
}
export interface CutOut { left: number; right: number; ux: number; uy: number }
/** §5.2 steps 2 and 3: divide `mask` by the line through (px, py) along the unit direction (ux, uy), template frame. A
 *  line with one side empty is moved through the centre of mass; if a side is still empty, u is turned a quarter turn.
 *  `out`: the two sides and the direction finally used. A mask of two or more cells is always divided. */
export function cutSides(t: Template, mask: number, px: number, py: number, ux: number, uy: number, out: CutOut): void {
  let left = leftOf(t, mask, px, py, ux, uy);
  if (left === 0 || left === mask) { const s = shapeOf(t, mask); px = s.gx; py = s.gy; left = leftOf(t, mask, px, py, ux, uy); }
  if (left === 0 || left === mask) { const tx = -uy; uy = ux; ux = tx; left = leftOf(t, mask, px, py, ux, uy); }
  out.left = left; out.right = mask & ~left; out.ux = ux; out.uy = uy;
}

const C60 = 0.5, C120 = -0.5;
const sectors: number[] = [0, 0, 0, 0, 0, 0, 0, 0], cutScratch: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
/** §5.3, §10a 5: the shatter about (px, py) (a cell's centre) with hit direction (ux, uy), template frame. Cells within
 *  CRATER_K spacings of the point are the crater (left out). The rest is divided by three lines through the point (along u,
 *  and u turned 60° and 120°) and each sector's connected groups are written to out; the count. One group only: it is cut
 *  once through its centre of mass along u. */
export function shatterGroups(t: Template, mask: number, px: number, py: number, ux: number, uy: number, out: number[]): number {
  const reach2 = CRATER_K * t.d * CRATER_K * t.d, vx = ux * C60 - uy * S3, vy = ux * S3 + uy * C60, wx = ux * C120 - uy * S3, wy = ux * S3 + uy * C120;
  let rest = 0;
  sectors.fill(0);
  for (let i = 0; i < t.n; i++) {
    if (!((mask >>> i) & 1)) continue;
    const dx = t.x[i]! - px, dy = t.y[i]! - py;
    if (dx * dx + dy * dy <= reach2) continue;
    const k = (ux * dy - uy * dx >= 0 ? 1 : 0) | (vx * dy - vy * dx >= 0 ? 2 : 0) | (wx * dy - wy * dx >= 0 ? 4 : 0);
    sectors[k] = sectors[k]! | (1 << i); rest |= 1 << i;
  }
  let count = 0;
  const part: number[] = [];
  for (let k = 0; k < 8; k++) {
    if (sectors[k] === 0) continue;
    const n = components(t, sectors[k]!, part);
    for (let j = 0; j < n; j++) out[count++] = part[j]!;
  }
  if (count === 1 && popcount(rest) >= 2) {
    const s = shapeOf(t, rest);
    cutSides(t, rest, s.gx, s.gy, ux, uy, cutScratch);
    count = components(t, cutScratch.left, out);
    const n = components(t, cutScratch.right, part);
    for (let j = 0; j < n; j++) out[count++] = part[j]!;
  }
  return count;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/rockCells.test.ts tests/boundary.test.ts && npx tsc -b`
Expected: PASS, typecheck clean. If the shatter test finds a cell with one group, the fallback in `shatterGroups` did not run: check `count === 1`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/rockCells.ts src/renderer/src/sim/tactical/rockTuning.ts tests/rockCells.test.ts
git commit -m "feat(asteroids-iv): the cells: hex lattice, per-asteroid templates, connectivity, the cut and the shatter on masks (spec §3.1, §3.2, §5.2, §5.3)"
```

---

### Task 2: `rockCells` in the state: the array, the hash, the clone, validation, mass

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts` (the `TacticalState` member; `createTacticalState`)
- Modify: `src/renderer/src/sim/tactical/rocks.ts`
- Modify: `src/renderer/src/sim/tactical/hash.ts`
- Modify: `src/renderer/src/sim/tactical/rockBreak.ts` (`vacate` only)
- Modify: `src/renderer/src/sim/tactical/{contacts,gun,rockBlast,rockContacts,rockWeapons}.ts` (mass only)
- Modify: `tests/helpers/rockArena.ts`
- Test: `tests/rockCellState.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (rocks.ts): `CELL_STRIDE = 2`, `initRockCells(map): Float64Array`, `rockTmpl(s, k): number` (−1 plain), `rockMaskOf(s, k): number`, `setRockCells(s, k, tmpl, mask): void`, `rockMassOf(s, k): number`, `interface Cells { n, x, y, hitR, contactR }`, `makeCells(): Cells`, `rockCellsInto(s, k, out): void`. `TacticalState.rockCells: Float64Array`. Helpers: `shaped(st, k, tmpl, x, y, vx?, vy?, mask?)`, `tmplOf(st, full)`.

- [ ] **Step 1: Write the failing test** `tests/rockCellState.test.ts`:

```ts
// Asteroids-iv spec §3.3, §8, §10a 2: the rockCells array beside the pool: seeded, hashed, cloned, validated; mass and
// world cells read from it; a plain rock is one round cell.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, hashTactical, TACTICAL_MODULES, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { CELL_STRIDE, makeCells, rockCapacity, rockCellsInto, rockMass, rockMassOf, rockMaskOf, rockTmpl, rockX, rockY, setRockCells } from '../src/renderer/src/sim/tactical/rocks';
import { vacate } from '../src/renderer/src/sim/tactical/rockBreak';
import { arena, mover, seeded, shaped, tmplOf } from './helpers/rockArena';

const offsetOf = (st: ReturnType<typeof arena>, name: string): number => { let at = 0; for (const m of TACTICAL_MODULES) for (const f of m.fields(st)) { if (f.name === name) return at; at += f.count; } throw new Error(name); };

describe('the rockCells array (spec §3.3)', () => {
  it('a new state: every seeded slot is its own template with every cell; the reserve holds zeros', () => {
    const st = createTacticalState(5), n = st.map.asteroids.length;
    expect(st.rockCells).toHaveLength(rockCapacity(st.map) * CELL_STRIDE);
    for (let k = 0; k < n; k++) { expect(rockTmpl(st, k)).toBe(k); expect(rockMaskOf(st, k)).toBe(templateFor(st.map, k).full); }
    for (let k = n; k < rockCapacity(st.map); k++) expect([st.rockCells[k * 2], st.rockCells[k * 2 + 1]]).toEqual([0, 0]);
  });
  it('writeRock makes a plain rock (no cells); vacate clears the slot\'s cells; the arena starts with none', () => {
    const st = arena();
    expect(st.rockCells.every((v) => v === 0)).toBe(true);
    seeded(st, 3); expect(rockTmpl(st, 3)).toBe(3);
    mover(st, 3, 0, 2000, 0, 0, 20); expect([rockTmpl(st, 3), rockMaskOf(st, 3)]).toEqual([-1, 0]);
    shaped(st, 4, tmplOf(st, 19), 100, 2000); expect(rockTmpl(st, 4)).toBe(tmplOf(st, 19));
    vacate(st, 4); expect([st.rockCells[8], st.rockCells[9]]).toEqual([0, 0]);
  });
  it('is hashed, cloned and round-tripped', () => {
    const st = createTacticalState(5), h = hashTactical(st), copy = cloneTactical(st);
    expect(copy.rockCells).not.toBe(st.rockCells); expect(Array.from(copy.rockCells)).toEqual(Array.from(st.rockCells));
    const t = templateFor(st.map, 0);
    setRockCells(st, 0, 0, t.full & ~1);
    expect(hashTactical(st)).not.toBe(h); expect(hashTactical(copy)).toBe(h);
    const fresh = createTacticalState(5);
    unflattenTactical(fresh, flattenTactical(st));
    expect(rockMaskOf(fresh, 0)).toBe(t.full & ~1);
  });
  it('validation: a gone slot holds no cells; a template is a seeded index; its mask is a non-empty subset; a plain rock has no mask', () => {
    const st = createTacticalState(5), at = offsetOf(st, 'rockCells'), n = st.map.asteroids.length, full = templateFor(st.map, 2).full;
    const bad = (k: number, tmpl1: number, mask: number): boolean => { const v = flattenTactical(st); v[at + k * 2] = tmpl1; v[at + k * 2 + 1] = mask; try { validateTacticalValues(st, v); return false; } catch { return true; } };
    expect(bad(2, 3, full)).toBe(false);                      // unchanged values pass
    expect(bad(n + 5, 1, 1)).toBe(true);                      // a gone slot with cells
    expect(bad(2, n + 1, 1)).toBe(true);                      // no such template
    expect(bad(2, 3, 0)).toBe(true);                          // a template with no cells
    expect(bad(2, 3, full + 1)).toBe(true);                   // a cell outside the template
    expect(bad(2, 0, 1)).toBe(true);                          // a plain rock with a mask
    expect(bad(2, 2.5, full)).toBe(true);
    expect(bad(2, 0, 0)).toBe(false);                         // a plain rock
  });
});

describe('mass and world cells (spec §3.3)', () => {
  it('a plain rock weighs rockMass(r); a cell rock its cell count times rockMass(R) / the full count', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    mover(st, 0, 0, 2000, 0, 0, 30); expect(rockMassOf(st, 0)).toBe(rockMass(30));
    shaped(st, 1, tm, 300, 2000); expect(rockMassOf(st, 1)).toBeCloseTo((t.n * rockMass(t.R)) / 31, 9);
    const half = t.full & 0x5555; shaped(st, 2, tm, 600, 2000, 0, 0, half);
    expect(rockMassOf(st, 2)).toBeCloseTo((popcount(half) * rockMass(t.R)) / 31, 9);
  });
  it('rockCellsInto: a plain rock is one cell of radius r at its place; a cell rock\'s cells are its place plus the shape\'s offsets', () => {
    const st = arena(), cells = makeCells(), tm = tmplOf(st, 19), t = templateFor(st.map, tm);
    mover(st, 0, 10, 2000, 0, 0, 30); rockCellsInto(st, 0, cells);
    expect([cells.n, cells.x[0], cells.y[0], cells.hitR, cells.contactR]).toEqual([1, 10, 2000, 30, 30]);
    shaped(st, 1, tm, 300, 2000); rockCellsInto(st, 1, cells);
    const sh = shapeOf(t, t.full);
    expect(cells.n).toBe(t.n); expect([cells.hitR, cells.contactR]).toEqual([t.hitR, t.contactR]);
    for (let c = 0; c < cells.n; c++) { expect(cells.x[c]).toBe(300 + sh.ox[c]!); expect(cells.y[c]).toBe(2000 + sh.oy[c]!); }
    seeded(st, 7); rockCellsInto(st, 7, cells);   // a rail: read at its accessor place
    expect(cells.x[0]! - shapeOf(templateFor(st.map, 7), templateFor(st.map, 7).full).ox[0]!).toBeCloseTo(rockX(st, 7), 9);
    expect(cells.y[0]! - shapeOf(templateFor(st.map, 7), templateFor(st.map, 7).full).oy[0]!).toBeCloseTo(rockY(st, 7), 9);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockCellState.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: The state member.** In `src/renderer/src/sim/tactical/state.ts`:

In `interface TacticalState`, after the line beginning `rocks: Float64Array; rockHits: number;` add:

```ts
  /** Asteroids-iv spec §3.3, §10a 2: 2 values a slot beside the pool: the seeded asteroid this rock is a piece of + 1
   *  (0: a plain round rock), then the mask of that template's cells it still has (0 when plain). */
  rockCells: Float64Array;
```

In `createTacticalState`'s returned object, after `rockCapHits: 0,` add `rockCells: initRockCells(map),` and add `initRockCells` to the import from `./rocks`.

- [ ] **Step 4: The accessors.** In `src/renderer/src/sim/tactical/rocks.ts`, add to the imports:

```ts
import { popcount, shapeOf, templateFor, CELL_MAX } from './rockCells';
```

Add after `initRocks`:

```ts
// ---- Asteroids-iv spec §3.3, §10a 2: the cells beside the pool ----
export const CELL_STRIDE = 2;
/** Every seeded rock is its own template with every cell; the reserve holds zeros. */
export function initRockCells(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * CELL_STRIDE);
  map.asteroids.forEach((_, k) => { out[k * CELL_STRIDE] = k + 1; out[k * CELL_STRIDE + 1] = templateFor(map, k).full; });
  return out;
}
/** Slot k's template (a seeded asteroid index), or −1 for a plain round rock. */
export function rockTmpl(s: TacticalState, k: number): number { return s.rockCells[k * CELL_STRIDE]! - 1; }
export function rockMaskOf(s: TacticalState, k: number): number { return s.rockCells[k * CELL_STRIDE + 1]!; }
export function setRockCells(s: TacticalState, k: number, tmpl: number, mask: number): void { s.rockCells[k * CELL_STRIDE] = tmpl + 1; s.rockCells[k * CELL_STRIDE + 1] = mask; }
/** Slot k's mass: a plain rock's rockMass(r); a cell rock's cell count times its template's rockMass(R) / full count. */
export function rockMassOf(s: TacticalState, k: number): number {
  const tm = rockTmpl(s, k);
  if (tm < 0) return rockMass(s.rocks[k * ROCK_STRIDE + 5]!);
  const t = templateFor(s.map, tm);
  return (popcount(rockMaskOf(s, k)) * rockMass(t.R)) / t.fullCount;
}
/** A rock's cells in the world: n centres and the two radii (§3.1). A caller's scratch, reused. */
export interface Cells { n: number; x: Float64Array; y: Float64Array; hitR: number; contactR: number }
export function makeCells(): Cells { return { n: 0, x: new Float64Array(CELL_MAX), y: new Float64Array(CELL_MAX), hitR: 0, contactR: 0 }; }
/** Slot k's cells at its accessor position: a plain rock is one cell of radius r; a cell rock's are its centre of mass
 *  plus its shape's offsets (§10a 1: no orientation in iv-a). */
export function rockCellsInto(s: TacticalState, k: number, out: Cells): void {
  const X = rockX(s, k), Y = rockY(s, k), tm = rockTmpl(s, k);
  if (tm < 0) { out.n = 1; out.x[0] = X; out.y[0] = Y; out.hitR = out.contactR = s.rocks[k * ROCK_STRIDE + 5]!; return; }
  const t = templateFor(s.map, tm), sh = shapeOf(t, rockMaskOf(s, k));
  out.n = sh.n; out.hitR = t.hitR; out.contactR = t.contactR;
  for (let i = 0; i < sh.n; i++) { out.x[i] = X + sh.ox[i]!; out.y[i] = Y + sh.oy[i]!; }
}
```

In `writeRock`, after the line that writes the eight values, add (a rock written here is plain until `setRockCells` says otherwise):

```ts
  s.rockCells[k * CELL_STRIDE] = 0; s.rockCells[k * CELL_STRIDE + 1] = 0;
```

and extend its doc comment with: `Asteroids-iv: the slot's cells are cleared (a plain rock); setRockCells after it makes a cell rock.`

- [ ] **Step 5: `vacate`.** In `src/renderer/src/sim/tactical/rockBreak.ts`, in `vacate`, after `s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE);` add:

```ts
  s.rockCells[k * CELL_STRIDE] = 0; s.rockCells[k * CELL_STRIDE + 1] = 0;
```

and add `CELL_STRIDE` to its import from `./rocks`.

- [ ] **Step 6: The hash, the clone and validation.** In `src/renderer/src/sim/tactical/hash.ts`:

Imports: add `CELL_STRIDE` to the `./rocks` import, and `import { templateFor } from './rockCells';`.

In `spaceFields`, replace the `fields.push(vector('rocks', ...` statement's closing so the cells follow the nine counters:

```ts
  fields.push(vector('rocks', (asteroids + ROCK_RESERVE) * ROCK_STRIDE, (s) => s.rocks),
    ...(['rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions', 'rockTouches', 'rockSlotDust', 'rockCapHits'] as const).map((k) => scalar<TacticalState>(k, (s) => s[k], (s, v) => { s[k] = v; })),
    vector('rockCells', (asteroids + ROCK_RESERVE) * CELL_STRIDE, (s) => s.rockCells));   // asteroids-iv spec §3.3: last in the space module
```

In `cloneTacticalFromModule`, after `rocks: new Float64Array(s.rocks.length),` add `rockCells: new Float64Array(s.rockCells.length),`.

After `rockSlotProblem`, add:

```ts
/** Asteroids-iv spec §8, §10a 2: what is wrong with slot k's cells (template + 1, mask) given its pool kind, or null: a
 *  gone slot holds zeros; template + 1 is a whole number 0..asteroids; a plain rock (0) has mask 0; a cell rock's mask is
 *  a whole, non-empty subset of its template. */
function rockCellsProblem(shape: TacticalState, kind: number, tmpl1: number, mask: number): string | null {
  if (kind === RockKind.Gone) return tmpl1 !== 0 || mask !== 0 ? 'a gone slot holds cells' : null;
  if (!Number.isInteger(tmpl1) || tmpl1 < 0 || tmpl1 > shape.map.asteroids.length) return 'the template is not a seeded asteroid';
  if (tmpl1 === 0) return mask !== 0 ? 'a plain rock holds a mask' : null;
  const full = templateFor(shape.map, tmpl1 - 1).full;
  if (!Number.isInteger(mask) || mask <= 0 || mask > full || (mask & ~full) !== 0) return 'the mask is not a non-empty subset of its template';
  return null;
}
```

In `validateTacticalValues`: declare `let rockKinds: number[] = [];` beside `tickSeen`. Extend the `rocks` line and add the cells line after it:

```ts
    if (f.name === 'rocks') { rockKinds = []; for (let k = 0; k * ROCK_STRIDE < slice.length; k++) { rockKinds.push(slice[k * ROCK_STRIDE]!); const why = rockSlotProblem(slice, k * ROCK_STRIDE, tickSeen); if (why) bad(`slot ${k}: ${why}`); } }
    if (f.name === 'rockCells') for (let k = 0; k * CELL_STRIDE < slice.length; k++) { const why = rockCellsProblem(shape, rockKinds[k] ?? 0, slice[k * CELL_STRIDE]!, slice[k * CELL_STRIDE + 1]!); if (why) bad(`slot ${k}: ${why}`); }
```

Update the file's comment at the `rocks` field ("its nine counters, last in the space module") to say the cells close the module.

- [ ] **Step 7: Mass.** Replace each sim use of a slot's `rockMass(...)` with `rockMassOf` (import it from `./rocks`, and drop `rockMass` from an import it no longer uses):

| File | Today | Becomes |
| --- | --- | --- |
| `contacts.ts` (`shipRock`) | `mk = rockMass(v[b + 5]!)` | `mk = rockMassOf(state, k)` |
| `gun.ts` (`roundStrikesRock`) | `rd.pushPerRound / rockMass(rockAt(state, k).r)` | `rd.pushPerRound / rockMassOf(state, k)` |
| `rockBlast.ts` | `(BLAST_PUSH * fall) / rockMass(a.r)` | `(BLAST_PUSH * fall) / rockMassOf(s, k)` |
| `rockContacts.ts` (`resolveRockPair`) | `ma = rockMass(ra), mb = rockMass(rb)` | `ma = rockMassOf(s, a), mb = rockMassOf(s, b)` |
| `rockWeapons.ts` (`laserStrikesRock`) | `LASER_ROCK_PUSH / rockMass(r.r)` | `LASER_ROCK_PUSH / rockMassOf(state, k)` |

For a plain rock `rockMassOf` returns `rockMass(r)` of the same r, so plain results do not change.

- [ ] **Step 8: The test helpers.** In `tests/helpers/rockArena.ts`:

Imports: add `setRockCells, CELL_STRIDE` to the `rocks` import and `import { shapeOf, templateFor } from '../../src/renderer/src/sim/tactical/rockCells';`.

In `arena`, after `st.rocks.fill(0);` add `st.rockCells.fill(0);`.

Replace `seeded` and add the two helpers:

```ts
/** Seeded asteroid k back in its own slot as the map makes it (a rail at t = 0, full hp, every cell of its template). */
export function seeded(st: TacticalState, k: number): void {
  st.rocks.set(initRocks(st.map).subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE), k * ROCK_STRIDE);
  setRockCells(st, k, k, templateFor(st.map, k).full);
}
/** Asteroids-iv: a Free rock in slot k built of seeded asteroid `tmpl`'s cells (all of them, or `mask`), its centre of
 *  mass at (x, y), r its shape's bounding radius, full hp. */
export function shaped(st: TacticalState, k: number, tmpl: number, x: number, y: number, vx = 0, vy = 0, mask: number = templateFor(st.map, tmpl).full): void {
  const sh = shapeOf(templateFor(st.map, tmpl), mask);
  writeRock(st, k, RockKind.Free, x, y, vx, vy, sh.r, rockHp(sh.r));
  setRockCells(st, k, tmpl, mask);
}
/** The lowest seeded asteroid whose template has `full` cells before its drops. */
export function tmplOf(st: TacticalState, full: 7 | 19 | 31): number {
  const k = st.map.asteroids.findIndex((_, i) => templateFor(st.map, i).fullCount === full);
  if (k < 0) throw new Error(`this map has no ${full}-cell asteroid`);
  return k;
}
```

(`CELL_STRIDE` is imported only if used; drop it otherwise.)

- [ ] **Step 9: Typecheck and fix every object literal that builds a `TacticalState`.**

Run: `npx tsc -b`
Expected: errors only where a `TacticalState` is built without `rockCells` (a test fixture or a script). Give each `rockCells: initRockCells(map)` (or a `Float64Array` of `rockCapacity(map) * 2` zeros where its rocks are zeros). Re-run until clean.

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/rockCellState.test.ts tests/rockPool.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockLaser.test.ts tests/w4Rocks.test.ts tests/rockBlast.test.ts tests/boundary.test.ts tests/duelModules.test.ts`
Expected: `rockCellState` passes. In `rockPool`, the test "the space module closes with nine counters" now fails: change its expectation so the space module's last field is `rockCells` with `rockCapacity * 2` values, after the nine counters. `duelModules` may fail on a pinned tick only (allowed, see Global Constraints) and must pass its completeness check. A test on a `seeded()` rock that pins a mass-dependent number is updated by the Global Constraints rule. Tests on `mover` and `rail` rocks pass unedited.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/rockBlast.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockWeapons.ts tests/helpers/rockArena.ts tests/rockCellState.test.ts tests/rockPool.test.ts
git commit -m "feat(asteroids-iv): rockCells beside the pool (template + 1 and mask a slot): seeded, hashed, cloned, validated; mass and world cells from it (spec §3.3, §8)"
```

(Add any fixture Step 9 touched and any re-pinned `seeded()` test.)

---

### Task 3: Thin shots meet the cells, and the aim point

**Files:**
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (`rockEntry`, `rockNear`, `rockTouch`, `rockAimPoint`, `firstBlocker`)
- Modify: `src/renderer/src/sim/tactical/{gun,pew,geometry,missiles,rockWeapons}.ts`
- Test: `tests/rockShapeHits.test.ts`

**Interfaces:**
- Consumes: Task 2's `rockCellsInto`, `makeCells`, `rockTmpl`.
- Produces (rocks.ts): `type CircleEntry = (ax, ay, bx, by, cx, cy, r) => number`, `type CircleNear = (ax, ay, bx, by, cx, cy, r) => boolean`, `rockEntry(s, k, ax, ay, bx, by, entry?: CircleEntry): number`, `rockNear(s, k, ax, ay, bx, by, near: CircleNear): boolean`, `rockTouch(s, k, cx, cy, radius): boolean`, `rockAimPoint(s, k, out: { x: number; y: number }): void`.

- [ ] **Step 1: Write the failing test** `tests/rockShapeHits.test.ts`:

```ts
// Asteroids-iv spec §6: thin things (beams, rounds, torpedoes, sight lines) meet a rock's cells by the hit radius, after
// the bounding circle; a plain rock gives today's circle answer; weapons aim at the cell nearest the centre of mass.
import { describe, expect, it } from 'vitest';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { homingTurn } from '../src/renderer/src/sim/tactical/missiles';
import { shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { firstBlocker, makeCells, rockAimPoint, rockCellsInto, rockEntry, rockTouch, segmentEntry } from '../src/renderer/src/sim/tactical/rocks';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { rockShotLine } from '../src/renderer/src/sim/tactical/rockWeapons';
import { arena, mover, shaped, tmplOf } from './helpers/rockArena';

/** A 31-cell rock in slot 3 with `mask`, placed so each cell stands where the full rock's would, about (0, 2000). */
function place(st: ReturnType<typeof arena>, mask?: number): { tm: number; far: number; fx: number; fy: number } {
  const tm = tmplOf(st, 31), t = templateFor(st.map, tm), m = mask ?? t.full, sh = shapeOf(t, m);
  shaped(st, 3, tm, sh.gx, 2000 + sh.gy, 0, 0, m);
  let far = 0; for (let c = 1; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) > Math.hypot(t.x[far]!, t.y[far]!)) far = c;
  return { tm, far, fx: t.x[far]!, fy: 2000 + t.y[far]! };
}

describe('a segment and the cells (spec §6)', () => {
  it('rockEntry is the first entry into any cell, and −1 through a gap inside the bounding circle', () => {
    const st = arena(), { tm, far, fx, fy } = place(st), t = templateFor(st.map, tm), cells = makeCells();
    const len = Math.hypot(fx, fy - 2000), ux = fx / len, uy = (fy - 2000) / len, sx = ux * (t.R + 50), sy = 2000 + uy * (t.R + 50);
    const whole = firstBlocker(st, sx, sy, fx, fy)!;
    expect(whole.rock).toBe(3); expect(whole.t).toBeGreaterThan(0);
    rockCellsInto(st, 3, cells);
    let want = 2; for (let c = 0; c < cells.n; c++) { const e = segmentEntry(sx, sy, fx, fy, cells.x[c]!, cells.y[c]!, cells.hitR); if (e >= 0 && e < want) want = e; }
    expect(rockEntry(st, 3, sx, sy, fx, fy)).toBe(want);
    place(st, t.full & ~(1 << far));                 // the farthest cell gone: the same segment now ends in its empty place
    expect(rockEntry(st, 3, sx, sy, fx, fy)).toBe(-1);
    expect(firstBlocker(st, sx, sy, fx, fy)).toBeNull();
    expect(lineOfSight(st, sx, sy, fx, fy)).toBe(true);
  });
  it('a plain rock answers exactly as its circle', () => {
    const st = arena(); mover(st, 3, 0, 2000, 0, 0, 30);
    for (const [ax, ay, bx, by] of [[-200, 2000, 200, 2000], [-200, 2040, 200, 2040], [-200, 2029.999, 200, 2029.999], [0, 2000, 50, 2000]] as const)
      expect(rockEntry(st, 3, ax, ay, bx, by)).toBe(segmentEntry(ax, ay, bx, by, 0, 2000, 30));
    expect(lineOfSight(st, -200, 2000, 200, 2000)).toBe(false);
  });
});

describe('a small circle and the cells (the torpedo, spec §6)', () => {
  it('rockTouch is true on a cell and false in a bay', () => {
    const st = arena(), { tm, far, fx, fy } = place(st), t = templateFor(st.map, tm);
    expect(rockTouch(st, 3, fx, fy, 3)).toBe(true);
    place(st, t.full & ~(1 << far));
    expect(rockTouch(st, 3, fx, fy, 3)).toBe(false);
    mover(st, 4, 500, 2000, 0, 0, 20);
    expect(rockTouch(st, 4, 522.9, 2000, 3)).toBe(true); expect(rockTouch(st, 4, 523, 2000, 3)).toBe(false);   // strictly inside radius + r
  });
});

describe('the aim point (spec §6)', () => {
  it('is the centre of the live cell nearest the centre of mass; a plain rock\'s is its centre', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), p = { x: 0, y: 0 };
    let ring = t.full; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 1.2) ring &= ~(1 << c);   // hollow: the middle gone
    const sh = shapeOf(t, ring);
    shaped(st, 3, tm, 0, 2000, 0, 0, ring); rockAimPoint(st, 3, p);
    expect(p).toEqual({ x: 0 + sh.ox[sh.aim]!, y: 2000 + sh.oy[sh.aim]! });
    expect(Math.hypot(p.x, p.y - 2000)).toBeGreaterThan(t.d * 0.5);                     // not the empty middle
    Object.assign(st.ships[0], { x: 0, y: 2600 });                                      // south of the rock: the planet is not on the line
    expect(rockShotLine(st, 0, 3)!.rock).toBe(3);                                       // the laser's line ends in a cell
    mover(st, 4, 500, 2000, 0, 0, 20); rockAimPoint(st, 4, p); expect(p).toEqual({ x: 500, y: 2000 });
  });
  it('a rock-targeted torpedo homes on the aim point: it steers as it would at a plain rock standing there', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), p = { x: 0, y: 0 };
    let ring = t.full; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 1.2) ring &= ~(1 << c);
    shaped(st, 3, tm, 0, 2000, 0, 0, ring); rockAimPoint(st, 3, p);
    // Fly at the centre of mass from the side the aim cell is not on, so the aim cell lies well off the nose.
    const sh = shapeOf(t, ring), north = Math.abs(sh.ox[sh.aim]!) >= Math.abs(sh.oy[sh.aim]!);
    const flight = north ? { x: 0, y: 2150, vx: 0, vy: -60, heading: 0, headingAcc: 0, age: 30 } : { x: -150, y: 2000, vx: 60, vy: 0, heading: 64, headingAcc: 0, age: 30 };
    const turn = (setup: (s: ReturnType<typeof arena>) => void): number => { const s = arena(); setup(s); s.systems[0].torpRockFlying = 3; return homingTurn(s, 0, placeMissile(s, 0, flight)); };
    expect(turn((s) => shaped(s, 3, tm, 0, 2000, 0, 0, ring))).toBe(turn((s) => mover(s, 3, p.x, p.y, 0, 0, 10)));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockShapeHits.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: The helpers.** In `src/renderer/src/sim/tactical/rocks.ts`, add after `segmentEntry`:

```ts
// ---- Asteroids-iv spec §6: thin things meet the cells (hit radius), after the bounding circle ----
export type CircleEntry = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) => number;
export type CircleNear = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) => boolean;
const hitCells = makeCells();
/** Where the segment a → b first enters rock k, by the caller's own circle rule `entry` (so each caller keeps its exact
 *  tie rules): the bounding circle first; a plain rock's answer is that circle's; a cell rock's the least entry over its
 *  cells, or −1 when the segment passes through a gap. */
export function rockEntry(s: TacticalState, k: number, ax: number, ay: number, bx: number, by: number, entry: CircleEntry = segmentEntry): number {
  const t0 = entry(ax, ay, bx, by, rockX(s, k), rockY(s, k), s.rocks[k * ROCK_STRIDE + 5]!);
  if (t0 < 0 || rockTmpl(s, k) < 0) return t0;
  rockCellsInto(s, k, hitCells);
  let best = -1;
  for (let c = 0; c < hitCells.n; c++) { const t = entry(ax, ay, bx, by, hitCells.x[c]!, hitCells.y[c]!, hitCells.hitR); if (t >= 0 && (best < 0 || t < best)) best = t; }
  return best;
}
/** Whether the segment a → b passes within rock k by the caller's own circle rule `near`: the bounding circle, then any cell. */
export function rockNear(s: TacticalState, k: number, ax: number, ay: number, bx: number, by: number, near: CircleNear): boolean {
  if (!near(ax, ay, bx, by, rockX(s, k), rockY(s, k), s.rocks[k * ROCK_STRIDE + 5]!)) return false;
  if (rockTmpl(s, k) < 0) return true;
  rockCellsInto(s, k, hitCells);
  for (let c = 0; c < hitCells.n; c++) if (near(ax, ay, bx, by, hitCells.x[c]!, hitCells.y[c]!, hitCells.hitR)) return true;
  return false;
}
/** Whether a circle of `radius` at (cx, cy) touches rock k: strictly inside radius + r of the bounding circle, then of any cell. */
export function rockTouch(s: TacticalState, k: number, cx: number, cy: number, radius: number): boolean {
  const dx0 = cx - rockX(s, k), dy0 = cy - rockY(s, k), rr0 = radius + s.rocks[k * ROCK_STRIDE + 5]!;
  if (!(dx0 * dx0 + dy0 * dy0 < rr0 * rr0)) return false;
  if (rockTmpl(s, k) < 0) return true;
  rockCellsInto(s, k, hitCells);
  const rr = radius + hitCells.hitR;
  for (let c = 0; c < hitCells.n; c++) { const dx = cx - hitCells.x[c]!, dy = cy - hitCells.y[c]!; if (dx * dx + dy * dy < rr * rr) return true; }
  return false;
}
/** §6: where a weapon aims at rock k: the centre of its live cell nearest its centre of mass (a plain rock: its centre). */
export function rockAimPoint(s: TacticalState, k: number, out: { x: number; y: number }): void {
  const X = rockX(s, k), Y = rockY(s, k), tm = rockTmpl(s, k);
  if (tm < 0) { out.x = X; out.y = Y; return; }
  const sh = shapeOf(templateFor(s.map, tm), rockMaskOf(s, k));
  out.x = X + sh.ox[sh.aim]!; out.y = Y + sh.oy[sh.aim]!;
}
```

`makeCells` is declared above these (Task 2 put it after `initRocks`); `hitCells` is a module constant, so place this block after `makeCells`' definition in the file.

In `firstBlocker`, replace the loop body's two lines

```ts
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
```

with

```ts
    const t = rockEntry(s, k, ax, ay, bx, by);
```

- [ ] **Step 4: The callers.**

`gun.ts`, `stepRounds`: replace `const a = rockAt(state, k), t = segmentEntry(ox, oy, r.x, r.y, a.x, a.y, a.r);` with `const t = rockEntry(state, k, ox, oy, r.x, r.y, segmentEntry);` (gun.ts's own `segmentEntry`). Import `rockEntry` from `./rocks`.

`pew.ts`, `stepPew`: replace `const a = rockAt(state, q), t = segmentEntry(ox, oy, r.x, r.y, a.x, a.y, a.r);` with `const t = rockEntry(state, q, ox, oy, r.x, r.y, segmentEntry);` (the `segmentEntry` pew.ts already imports from gun.ts). Import `rockEntry`.

`geometry.ts`, `lineOfSight`: replace

```ts
    const a = rockAt(state, k);
    if (segmentNear(ax, ay, bx, by, a.x, a.y, a.r)) return false;
```

with `if (rockNear(state, k, ax, ay, bx, by, segmentNear)) return false;`. Import `rockNear`.

`missiles.ts`, `resolveMissiles`: replace `const a = rockAt(state, k); if (touches(m, def.radius, a.x, a.y, a.r)) { rock = k; break; }` with `if (rockTouch(state, k, m.x, m.y, def.radius)) { rock = k; break; }`. Import `rockTouch`.

`missiles.ts`, `homingTurn`: replace `const r = rockAt(state, fly); tx = r.x; ty = r.y; tvx = r.vx; tvy = r.vy;` with

```ts
    const r = rockAt(state, fly); rockAimPoint(state, fly, aimAt); tx = aimAt.x; ty = aimAt.y; tvx = r.vx; tvy = r.vy;
```

and add `const aimAt = { x: 0, y: 0 };` at module level and `rockAimPoint` to the import.

`rockWeapons.ts`, `rockShotLine`: replace its body with

```ts
  const a = state.ships[i]!;
  rockAimPoint(state, k, aimAt);
  const f = firstBlocker(state, a.x, a.y, aimAt.x, aimAt.y);
  if (!f) return null;
  return { rock: f.rock, x: a.x + (aimAt.x - a.x) * f.t, y: a.y + (aimAt.y - a.y) * f.t };
```

with `const aimAt = { x: 0, y: 0 };` at module level and `rockAimPoint` imported. Remove imports each file no longer uses (`rockAt` where it was only this).

- [ ] **Step 5: Run the tests**

Run: `npx tsc -b && npx vitest run tests/rockShapeHits.test.ts tests/rockLaser.test.ts tests/rockBlast.test.ts tests/w4Rocks.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewRounds.test.ts tests/rockBreak.test.ts tests/boundary.test.ts`
Expected: the new file passes; the others pass unedited (their rocks are plain), except a `seeded()` pin under the Global Constraints rule.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/geometry.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/rockWeapons.ts tests/rockShapeHits.test.ts
git commit -m "feat(asteroids-iv): beams, rounds, torpedoes and sight lines meet a rock's cells; weapons aim at the cell nearest the centre of mass (spec §6)"
```

---

### Task 4: Bodies meet the cells (ships, rocks, the planet)

**Files:**
- Create: `src/renderer/src/sim/tactical/rockShape.ts`
- Modify: `src/renderer/src/sim/tactical/contacts.ts` (`shipRock`)
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (`resolveRockPair`, `stepRocks`)
- Test: `tests/rockShapeContacts.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (rockShape.ts): `interface Contact { nx, ny, depth, d, rr, ax, ay, ra }`, `makeContact(): Contact`, `rockCircleContact(s, k, cx, cy, r, out): boolean`, `rockPairContact(s, a, b, out): boolean`, `interface NearCell { x, y, d, r }`, `rockNearestCell(s, k, x, y, out): void`, `rockSurfaceDistance(s, k, x, y): number`.

`Contact` fields: `(nx, ny)` the unit normal (for a circle: from the cell to the circle's centre; for a pair: from b's cell to a's cell; a zero distance gives north, (0, −1)); `d` the two centres' distance; `rr` the sum of the two contact radii; `depth = rr − d` (negative when apart); `(ax, ay)` rock k's (or a's) cell centre minus that rock's own centre; `ra` that cell's contact radius. Both functions always fill `out` with the deepest (least separated) pair and return `depth > 0`.

- [ ] **Step 1: Write the failing test** `tests/rockShapeContacts.test.ts`:

```ts
// Asteroids-iv spec §6: a ship, another rock and the planet meet a rock's cells by the contact radius; a flat face
// inside the bounding circle touches nothing.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { makeCells, rockAt, rockCellsInto } from '../src/renderer/src/sim/tactical/rocks';
import { makeContact, rockCircleContact, rockNearestCell, rockPairContact, rockSurfaceDistance } from '../src/renderer/src/sim/tactical/rockShape';
import { classOf } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { circularVelocity } from '../src/renderer/src/sim/tactical/rails';
import { arena, mover, shaped, tmplOf } from './helpers/rockArena';

const cells = makeCells();
/** A tall thin slab in `slot`: the cells of a 31-cell rock left of x = −0.9 spacings, standing where the full rock's would
 *  about (0, 2000). Its bounding circle reaches far east of its flat face. */
function slab(st: ReturnType<typeof arena>, slot: number) {
  const tm = tmplOf(st, 31), t = templateFor(st.map, tm);
  let mask = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < -0.9 * t.d) mask |= 1 << c;
  if (popcount(mask) < 4) throw new Error('the slab is too small on this map');
  const sh = shapeOf(t, mask);
  shaped(st, slot, tm, sh.gx, 2000 + sh.gy, 0, 0, mask);
  let west = -1; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1 && (west < 0 || t.x[c]! < t.x[west]!)) west = c;
  return { t, wx: t.x[west]!, wy: 2000 + t.y[west]! };
}
/** The first point east of the slab's centre of mass that a circle of `radius` can stand on with 1 u to spare from every
 *  cell, still inside the slab's bounding circle plus that radius. */
function clearPoint(st: ReturnType<typeof arena>, slot: number, radius: number): { x: number; y: number } {
  const a = rockAt(st, slot); rockCellsInto(st, slot, cells);
  for (let s = 0; s < a.r + radius; s++) {
    const x = a.x + s, y = a.y;
    let free = true; for (let c = 0; c < cells.n; c++) if (Math.hypot(x - cells.x[c]!, y - cells.y[c]!) < radius + cells.contactR + 1) free = false;
    if (free) return { x, y };
  }
  throw new Error('no clear point inside the bounding circle');
}

describe('a circle against the cells', () => {
  it('finds the deepest cell: the normal from that cell to the circle, the depth, the cell\'s offset', () => {
    const st = arena(), hit = makeContact(), { t, wx, wy } = slab(st, 3);
    expect(rockCircleContact(st, 3, wx - t.contactR - 9, wy, 10, hit)).toBe(true);
    expect(hit.nx).toBeCloseTo(-1, 9); expect(hit.ny).toBeCloseTo(0, 9); expect(hit.depth).toBeCloseTo(1, 9);
    expect(hit.ax).toBeCloseTo(wx - rockAt(st, 3).x, 9); expect(hit.ay).toBeCloseTo(wy - rockAt(st, 3).y, 9); expect(hit.ra).toBe(t.contactR);
  });
  it('a circle off the flat face, inside the bounding circle, touches nothing', () => {
    const st = arena(), hit = makeContact(); slab(st, 3);
    const p = clearPoint(st, 3, 4), a = rockAt(st, 3);
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + 4);
    expect(rockCircleContact(st, 3, p.x, p.y, 4, hit)).toBe(false);
    expect(hit.depth).toBeLessThan(0);
  });
  it('a plain rock is its circle', () => {
    const st = arena(), hit = makeContact(); mover(st, 3, 0, 2000, 0, 0, 30);
    expect(rockCircleContact(st, 3, 39, 2000, 10, hit)).toBe(true);
    expect([hit.nx, hit.ny, hit.d, hit.rr, hit.depth, hit.ax, hit.ay, hit.ra]).toEqual([1, 0, 39, 40, 1, 0, 0, 30]);
    expect(rockCircleContact(st, 3, 40, 2000, 10, hit)).toBe(false);
    expect(rockSurfaceDistance(st, 3, 100, 2000)).toBe(70); expect(rockSurfaceDistance(st, 3, 10, 2000)).toBe(0);
    const near = { x: 0, y: 0, d: 0, r: 0 }; rockNearestCell(st, 3, 100, 2000, near); expect(near).toEqual({ x: 0, y: 2000, d: 100, r: 30 });
  });
  it('the crew ship parked off the flat face, inside the bounding circle, takes no hull and counts no hit', () => {
    const st = arena(); slab(st, 3);
    const radius = classOf(st, 0).radius, p = clearPoint(st, 3, radius), a = rockAt(st, 3), [vx, vy] = circularVelocity(p.x, p.y);
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + radius);   // today's circle test would call this a contact
    Object.assign(st.ships[0], { x: p.x, y: p.y, vx, vy }); st.rocks[3 * 8 + 3] = vx; st.rocks[3 * 8 + 4] = vy;
    const hull = st.systems[0].hull;
    stepDuel(st, IDLE_INPUT);
    expect(st.systems[0].hull).toBe(hull); expect(st.ships[0].asteroidHits).toBe(0);
  });
});

describe('two rocks', () => {
  it('bounding circles that overlap with no two cells touching are not in contact', () => {
    const st = arena(), pair = makeContact(); slab(st, 3);
    const p = clearPoint(st, 3, 8), a = rockAt(st, 3);
    mover(st, 4, p.x, p.y, 0, 0, 8);   // a small plain rock off the slab's flat face
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + 8);
    expect(rockPairContact(st, 4, 3, pair)).toBe(false);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockTouches, st.rockCollisions]).toEqual([0, 0]);
  });
  it('touching cells are: the normal runs from b\'s cell to a\'s cell', () => {
    const st = arena(), pair = makeContact(), { t, wx, wy } = slab(st, 3);
    mover(st, 4, wx - t.contactR - 9, wy, 0, 0, 10);
    expect(rockPairContact(st, 4, 3, pair)).toBe(true);
    expect(pair.nx).toBeCloseTo(-1, 9); expect(pair.depth).toBeCloseTo(1, 9); expect([pair.ax, pair.ay, pair.ra]).toEqual([0, 0, 10]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockShapeContacts.test.ts`
Expected: FAIL, cannot resolve `rockShape`.

- [ ] **Step 3: Write** `src/renderer/src/sim/tactical/rockShape.ts`:

```ts
// Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md §6): bodies meet a rock's cells by the
// contact radius d / 2. A plain rock (no template) is one cell of radius r, and every answer here is then today's circle
// answer, written in today's order of operations so plain results stay bit for bit. Callers test the bounding circle
// first. Only + − × ÷ and Math.sqrt.
import { makeCells, rockCellsInto, rockX, rockY, ROCK_STRIDE } from './rocks';
import type { TacticalState } from './state';

/** The deepest (least separated) contact found: the unit normal (nx, ny), the two centres' distance d, the sum rr of the
 *  two contact radii, depth = rr − d (negative when apart), the first rock's cell centre minus that rock's own centre
 *  (ax, ay) and that cell's contact radius ra. */
export interface Contact { nx: number; ny: number; depth: number; d: number; rr: number; ax: number; ay: number; ra: number }
export function makeContact(): Contact { return { nx: 0, ny: -1, depth: -Infinity, d: 0, rr: 0, ax: 0, ay: 0, ra: 0 }; }
const cellsA = makeCells(), cellsB = makeCells();

/** Rock k against the circle (cx, cy, r): the normal from the deepest cell to the circle's centre (zero distance: north).
 *  True when they overlap (d² < rr², as today's test). */
export function rockCircleContact(s: TacticalState, k: number, cx: number, cy: number, r: number, out: Contact): boolean {
  rockCellsInto(s, k, cellsA);
  const rr = r + cellsA.contactR, X = rockX(s, k), Y = rockY(s, k);
  let best = -1, bestD2 = Infinity;
  for (let c = 0; c < cellsA.n; c++) { const dx = cx - cellsA.x[c]!, dy = cy - cellsA.y[c]!, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; best = c; } }
  const dx = cx - cellsA.x[best]!, dy = cy - cellsA.y[best]!, d = Math.sqrt(bestD2);
  out.nx = d > 0 ? dx / d : 0; out.ny = d > 0 ? dy / d : -1; out.d = d; out.rr = rr; out.depth = rr - d;
  out.ax = cellsA.x[best]! - X; out.ay = cellsA.y[best]! - Y; out.ra = cellsA.contactR;
  return bestD2 < rr * rr;
}

/** Rock a against rock b: the normal from b's cell to a's cell over the least separated pair of cells (zero distance:
 *  north). True when they overlap. A cell of a out of reach of b's bounding circle is skipped. */
export function rockPairContact(s: TacticalState, a: number, b: number, out: Contact): boolean {
  rockCellsInto(s, a, cellsA); rockCellsInto(s, b, cellsB);
  const rr = cellsA.contactR + cellsB.contactR, bx = rockX(s, b), by = rockY(s, b), reach = s.rocks[b * ROCK_STRIDE + 5]! + cellsA.contactR;
  let bi = 0, bj = 0, bestD2 = Infinity;
  for (let i = 0; i < cellsA.n; i++) {
    const ax = cellsA.x[i]!, ay = cellsA.y[i]!, ex = ax - bx, ey = ay - by;
    if (cellsA.n > 1 && ex * ex + ey * ey >= reach * reach && bestD2 < Infinity) continue;
    for (let j = 0; j < cellsB.n; j++) { const dx = ax - cellsB.x[j]!, dy = ay - cellsB.y[j]!, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; bi = i; bj = j; } }
  }
  const dx = cellsA.x[bi]! - cellsB.x[bj]!, dy = cellsA.y[bi]! - cellsB.y[bj]!, d = Math.sqrt(bestD2);
  out.nx = d > 0 ? dx / d : 0; out.ny = d > 0 ? dy / d : -1; out.d = d; out.rr = rr; out.depth = rr - d;
  out.ax = cellsA.x[bi]! - rockX(s, a); out.ay = cellsA.y[bi]! - rockY(s, a); out.ra = cellsA.contactR;
  return bestD2 < rr * rr;
}

/** A cell's centre, its distance d from a point and its hit radius r. */
export interface NearCell { x: number; y: number; d: number; r: number }
/** Rock k's cell whose centre is nearest (x, y) (ties: the lowest cell). */
export function rockNearestCell(s: TacticalState, k: number, x: number, y: number, out: NearCell): void {
  rockCellsInto(s, k, cellsA);
  let best = 0, bestD2 = Infinity;
  for (let c = 0; c < cellsA.n; c++) { const dx = cellsA.x[c]! - x, dy = cellsA.y[c]! - y, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; best = c; } }
  out.x = cellsA.x[best]!; out.y = cellsA.y[best]!; out.d = Math.sqrt(bestD2); out.r = cellsA.hitR;
}
const nearScratch: NearCell = { x: 0, y: 0, d: 0, r: 0 };
/** §6: the distance from (x, y) to rock k's nearest cell's surface (hit radius), at least 0. */
export function rockSurfaceDistance(s: TacticalState, k: number, x: number, y: number): number {
  rockNearestCell(s, k, x, y, nearScratch);
  return Math.max(0, nearScratch.d - nearScratch.r);
}
```

Note on `rockPairContact`'s skip: it never skips before one pair has been measured, so `out` is always filled.

- [ ] **Step 4: `shipRock`.** In `src/renderer/src/sim/tactical/contacts.ts`, replace the head of `shipRock` (from `const s = ...` through the `regridRock(state, k);` line) with:

```ts
  const s = state.ships[i]!, sys = state.systems[i]!, v = state.rocks, b = k * ROCK_STRIDE, radius = classOf(state, i).radius;
  const dx = s.x - rockX(state, k), dy = s.y - rockY(state, k), rr = radius + v[b + 5]!, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;                                              // the bounding circle
  if (!rockCircleContact(state, k, s.x, s.y, radius, shipHit)) return;    // asteroids-iv spec §6: no cell touches
  freeRock(state, k); markTouched(state, k); restartClock(state, k);
  const nx = shipHit.nx, ny = shipHit.ny, body = k + 1;
  const vc = (v[b + 3]! - s.vx) * nx + (v[b + 4]! - s.vy) * ny, mk = rockMassOf(state, k);
  const is = 1 / SHIP_MASS, ik = 1 / mk, overlap = shipHit.depth, sk = Math.min(ROCK_SEPARATE_MAX, (overlap * ik) / (is + ik)), ss = overlap - sk;
  s.x += nx * ss; s.y += ny * ss; v[b + 1]! -= nx * sk; v[b + 2]! -= ny * sk;
  regridRock(state, k);
```

Add `const shipHit = makeContact();` at module level and `import { makeContact, rockCircleContact } from './rockShape';`. The rest of `shipRock` is unchanged. Extend its doc comment: `Asteroids-iv spec §6: the contact is with the rock's deepest cell (contact radius), after the bounding circle.` For a plain rock `shipHit.depth` is `rr − d` with the same `rr` and `d` as before, and the normal the same division.

- [ ] **Step 5: `resolveRockPair` and `stepRocks`.** In `src/renderer/src/sim/tactical/rockContacts.ts`:

Add `import { makeContact, rockCircleContact, rockPairContact } from './rockShape';`, `rockTmpl` to the `./rocks` import, and module constants `const pair = makeContact(), planetHit = makeContact();`.

In `resolveRockPair`, replace these three lines

```ts
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
```
```ts
  const fix = SEPARATE_SHARE * Math.max(0, ra + rb - d - SEPARATE_SLOP);
```

with

```ts
  rockPairContact(s, a, b, pair);   // asteroids-iv spec §6: the least separated pair of cells (a plain pair: the two circles)
  const nx = pair.nx, ny = pair.ny, cax = pair.ax, cay = pair.ay, cra = pair.ra;
```
```ts
  const fix = SEPARATE_SHARE * Math.max(0, pair.rr - pair.d - SEPARATE_SLOP);
```

and in the two event pushes replace `x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra` with `x: v[A + 1]! + cax - nx * cra, y: v[A + 2]! + cay - ny * cra`. The line `const ra = v[A + 5]!, rb = v[B + 5]!, ...` keeps `ra` for the events' `r: ra`. (`pair` is read into locals because the breaks at the end may reuse the scratch.) Extend the doc comment with the same sentence as Step 4.

In `stepRocks` part 2, replace the planet line and the pair test:

```ts
    const x = v[A + 1]!, y = v[A + 2]!, r = v[A + 5]!;
    const planet = touching(x, y, r, p.x, p.y, p.r) && (rockTmpl(s, a) < 0 || rockCircleContact(s, a, p.x, p.y, p.r, planetHit));   // spec §6: any cell on the planet
```
```ts
      if (!touching(v[A + 1]!, v[A + 2]!, v[A + 5]!, rockX(s, o), rockY(s, o), v[o * ROCK_STRIDE + 5]!)) continue;
      if ((rockTmpl(s, a) >= 0 || rockTmpl(s, o) >= 0) && !rockPairContact(s, a, o, pair)) continue;   // spec §6: bounding circles overlap but no two cells touch
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b && npx vitest run tests/rockShapeContacts.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockMotion.test.ts tests/rockGrid.test.ts tests/rockSettle.test.ts tests/boundary.test.ts`
Expected: the new file passes; the plain-rock tests in the others pass unedited. This is the parity proof for contacts: if a `mover`/`rail` contact test changes by even the last digit, the order of operations in Step 4 or 5 differs from today's; fix the code, not the test.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/rockShape.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/rockContacts.ts tests/rockShapeContacts.test.ts
git commit -m "feat(asteroids-iv): ships, rocks and the planet meet a rock's cells by the contact radius; a bay or a flat face touches nothing (spec §6)"
```

---

### Task 5: Breaking: the cut and the shatter

**Files:**
- Modify: `src/renderer/src/sim/tactical/rockBreak.ts` (rewritten below `vacate`)
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts`
- Modify: `src/renderer/src/sim/tactical/{rockBlast,rockWeapons,gun,contacts,rockContacts}.ts`
- Modify: `scripts/profile-duel-publication.ts`, `scripts/spike-asteroids-iii-idle.ts`, `scripts/spike-asteroids-iii-measure.ts`, `scripts/spike-asteroids-iii-frames.cjs` (call arguments only)
- Test: `tests/rockBreak.test.ts` (rewritten), `tests/rockBlast.test.ts`, `tests/rockLaser.test.ts`, `tests/rockShips.test.ts`, `tests/rockContacts.test.ts`, `tests/rockMotion.test.ts`, `tests/rockGrid.test.ts`, `tests/w4Rocks.test.ts`, `tests/duelRounds.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces (rockBreak.ts): `type BreakPattern = 'cut' | 'shatter' | 'tidal'`; `breakRock(s, k, px, py, ux, uy, by, ship, pattern, exclude?)` with (px, py) the world point of the break; `hitRock(s, k, dmg, px, py, ux, uy, by, ship?)`; `kickFraction(j)` kept; `vacate`, `dustRock`, `pushRock`, `wearRock`, `crushDamage` unchanged. Removed exports: `FAN_DIRS`, `BURST_DIRS`, `pieceCount`, `pieceRadius`, `pieceOffset`, `pieceKick`.

- [ ] **Step 1: Tuning.** In `src/renderer/src/sim/tactical/rockTuning.ts`:

Delete `FAN_TRIPLE_MIN_R`, `FAN_SPLIT_MIN_R` (with their comment), `BURST_8_MIN_R`, `BURST_6_MIN_R`, `BURST_4_MIN_R`, `BURST_OFFSET`, `FAN_OFFSET`, `FAN_KICK_MIN`, `FAN_KICK_SPAN`, `TIDAL_KICK_MIN`, `TIDAL_KICK_SPAN`. Keep `BURST_KICK_MIN`, `BURST_KICK_SPAN`, `GOLDEN_FRAC`, `ROCHE_R`, `ROCHE_MIN_AGE`, `ROCK_MIN_R`. Rewrite the comments of the lines touched so they describe what remains. Append to the asteroids-iv block:

```ts
/** §5.4: a cut parts its two sides at v_esc(ρ) · CUT_KICK along the line's normal (a tidal cut: TIDAL_CUT_KICK), shared by
 *  inverse mass. §5.1: a free rock breaks tidally only with at least TIDAL_MIN_CELLS cells. */
export const CUT_KICK = 0.12, TIDAL_CUT_KICK = 0.04, TIDAL_MIN_CELLS = 4;
```

- [ ] **Step 2: Rewrite the break tests.** Replace `tests/rockBreak.test.ts` with:

```ts
// Asteroids-iv spec §5: a break divides a rock's cells. The cut (laser, gun, ram, collision, blast, tidal), the shatter (a
// torpedo's direct hit), a piece's birth, dust, slot use and eviction, a rock target clearing itself, damage and push;
// with spike i's hash/clone and firstBlocker cases.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { firstBlocker, makeCells, rockAlive, rockAt, rockBorn, rockCellsInto, rockHp, RockKind, rockMaskOf, rockMassOf, rockTmpl } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, dustRock, hitRock, kickFraction, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { CUT_KICK, TIDAL_CUT_KICK } from '../src/renderer/src/sim/tactical/rockTuning';
import { arena, fillPool, mover, rockEvents, seeded, shaped, tmplOf } from './helpers/rockArena';

const ve = escapeSpeed(2000), cells = makeCells();
/** A template x between two columns of cells near the middle: a vertical cut there has no cell on the line. */
const midX = (t: ReturnType<typeof templateFor>): number => { const xs = Array.from(t.x).sort((a, b) => a - b), i = xs.findIndex((x) => x > 0.1 * t.d); return (xs[i - 1]! + xs[i]!) / 2; };
const worldCells = (st: ReturnType<typeof arena>, k: number): string[] => { rockCellsInto(st, k, cells); return Array.from({ length: cells.n }, (_, c) => `${cells.x[c]!.toFixed(6)},${cells.y[c]!.toFixed(6)}`); };

describe('the cut (spec §5.2, §5.4)', () => {
  it('a cut through the middle gives pieces of the original: the same cells in the same places, no cell twice, none invented', () => {
    for (const full of [7, 19, 31] as const) {
      const st = arena(), tm = tmplOf(st, full), t = templateFor(st.map, tm);
      shaped(st, 100, tm, 0, 2000, 3, -2);
      const before = worldCells(st, 100).sort();
      breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
      expect(pieces.length).toBeGreaterThanOrEqual(2); expect(pieces[0]).toBe(100); expect(split.burst).toBeUndefined();
      let all = 0; const after: string[] = [];
      for (const p of pieces) {
        const m = rockMaskOf(st, p);
        expect(rockTmpl(st, p)).toBe(tm); expect(all & m).toBe(0); all |= m; expect(popcount(m)).toBeGreaterThanOrEqual(2);
        const a = rockAt(st, p), sh = shapeOf(t, m);
        expect([a.kind, a.r, a.hp]).toEqual([RockKind.Free, sh.r, rockHp(sh.r)]); expect(rockBorn(st, p)).toBe(true);
        after.push(...worldCells(st, p));
      }
      expect(all & ~t.full).toBe(0);
      const dustCells = popcount(t.full & ~all);
      expect(after.length + dustCells).toBe(before.length);
      for (const c of after) expect(before).toContain(c);                    // no cell moved at the break
      expect(popcount(rockMaskOf(st, pieces[0]!))).toBe(Math.max(...pieces.map((p) => popcount(rockMaskOf(st, p)))));   // the largest keeps the slot
      expect([st.rockSplits, st.systems[0].rocksBroken]).toEqual([1, 1]);
    }
  });
  it('the sides part along the line\'s normal at v_esc · CUT_KICK, shared by inverse cell count; a tidal cut at TIDAL_CUT_KICK', () => {
    for (const [pattern, kick] of [['cut', CUT_KICK], ['tidal', TIDAL_CUT_KICK]] as const) {
      const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
      shaped(st, 100, tm, 0, 2000, 3, -2);
      const mx = midX(t);
      breakRock(st, 100, mx, 2000, 0, 1, 'collision', -1, pattern);   // u south: left is cross(u, c − P) ≥ 0, here x < mx; the normal is (−1, 0)
      let left = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < mx) left |= 1 << c;
      const nl = popcount(left), nr = t.n - nl, sp = ve * kick;
      for (const p of rockEvents(st, 'split')[0]!.pieces!) {
        const a = rockAt(st, p), onLeft = (rockMaskOf(st, p) & left) !== 0;
        expect(a.vx).toBeCloseTo(3 + (onLeft ? -1 : 1) * (sp * (onLeft ? nr : nl)) / t.n, 9);
        expect(a.vy).toBeCloseTo(-2, 9);
      }
    }
  });
  it('a zero direction is north; a line that misses is moved through the centre of mass', () => {
    const st = arena(), tm = tmplOf(st, 19);
    shaped(st, 100, tm, 0, 2000);
    breakRock(st, 100, 900, 2000, 0, 0, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!;
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    const vxs = pieces.map((p) => rockAt(st, p).vx);   // u north: the sides part east and west
    expect(Math.min(...vxs)).toBeLessThan(0); expect(Math.max(...vxs)).toBeGreaterThan(0);
    for (const p of pieces) expect(rockAt(st, p).vy).toBeCloseTo(0, 9);
  });
  it('a plain rock, and a rock whose every group is one cell, turn to dust whole; a single cell shaved off is dust with rock −1', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    mover(st, 100, 0, 2000, 0, 0, 30);
    breakRock(st, 100, 0, 2000, 1, 0, 'laser', 0, 'cut');
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0, r: 30 }]); expect(rockAlive(st, 100)).toBe(false);
    const b = (() => { for (let c = 1; c < t.n; c++) if ((t.nb[0]! >>> c) & 1) return c; return -1; })();
    const st2 = arena(); shaped(st2, 100, tmplOf(st2, 31), 0, 2000, 0, 0, 1 | (1 << b));
    breakRock(st2, 100, 0, 2000, 1, 0, 'gun', 0, 'cut');
    expect(rockEvents(st2, 'dust')).toMatchObject([{ rock: 100, by: 'gun' }]); expect(rockEvents(st2, 'split')).toEqual([]);
    const st3 = arena(), far = (() => { let f = 0; for (let c = 1; c < t.n; c++) if (t.x[c]! > t.x[f]!) f = c; return f; })();
    shaped(st3, 100, tmplOf(st3, 31), 0, 2000);
    breakRock(st3, 100, t.x[far]! - t.d * 0.25, 2000, 0, 1, 'laser', 0, 'cut');   // a line just west of the easternmost column: its cells are not neighbours, so each is a crumb
    const crumbs = rockEvents(st3, 'dust');
    expect(crumbs.length).toBeGreaterThanOrEqual(1); expect(crumbs.every((e) => e.rock === -1)).toBe(true);
    expect(st3.rockSlotDust).toBe(0); expect(st3.rockDust).toBe(crumbs.length);
  });
});

describe('the shatter (spec §5.3, §5.4)', () => {
  it('the struck cell is the crater, the rest flies as real chunks away from it at v_esc · (0.30 + 0.30 f_j)', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    shaped(st, 100, tm, 0, 2000, 5, 0);
    const px = t.x[3]!, py = 2000 + t.y[3]!;
    breakRock(st, 100, px, py, -1, 0, 'torpedo', 0, 'shatter');
    const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
    expect(split.burst).toBe(true); expect(pieces.length).toBeGreaterThanOrEqual(2);
    let all = 0;
    pieces.forEach((p, j) => {
      const a = rockAt(st, p), m = rockMaskOf(st, p), kick = ve * (0.3 + 0.3 * kickFraction(j));
      expect(all & m).toBe(0); all |= m; expect((m >>> 3) & 1).toBe(0);
      expect(Math.hypot(a.vx - 5, a.vy)).toBeCloseTo(kick, 6);
      expect((a.vx - 5) * (a.x - px) + a.vy * (a.y - py)).toBeGreaterThan(0);   // away from the point
    });
    expect(rockEvents(st, 'dust').every((e) => e.rock === -1)).toBe(true);
  });
});

describe('slot use and eviction (spec §5.4)', () => {
  it('the largest piece keeps the slot; the others take the lowest empty slots, ascending', () => {
    const st = arena();
    for (const k of [0, 1, 3, 4]) mover(st, k, -2000 + 200 * k, -1000, 0, 0, 10);
    shaped(st, 100, tmplOf(st, 31), 0, 2000);
    breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!;
    expect(pieces[0]).toBe(100); expect(pieces.slice(1)).toEqual([2, 5, 6, 7, 8].slice(0, pieces.length - 1));
  });
  it('with no free slot it evicts the smallest rock smaller than the piece (ties: lowest slot), never a born or excluded one', () => {
    for (const [exclude, evicted] of [[[40], 60], [[], 40]] as const) {
      const st = arena();
      shaped(st, 0, tmplOf(st, 31), 0, 2000);
      fillPool(st, 9);
      mover(st, 60, -2000, 1000, 0, 0, 8.5); mover(st, 40, -1800, 1000, 0, 0, 8.5); mover(st, 20, -1600, 1000, 0, 0, 8.2);
      st.rockBorn[20] = 1;
      breakRock(st, 0, 0, 2000, 0, 1, 'collision', -1, 'cut', exclude);
      expect(rockEvents(st, 'split')[0]!.pieces!.slice(0, 2)).toEqual([0, evicted]);
      expect(rockEvents(st, 'dust').find((e) => e.evicted)).toMatchObject({ rock: evicted, by: 'collision', r: 8.5, evicted: true });
      expect(rockTmpl(st, evicted)).toBe(tmplOf(st, 31));
    }
  });
  it('with nothing smaller a piece is dust with an event (rock −1) and rockSlotDust counts it; the break still counts once', () => {
    const st = arena();
    shaped(st, 0, tmplOf(st, 31), 0, 2000);
    fillPool(st, 60);
    breakRock(st, 0, 0, 2000, 0, 1, 'laser', 0, 'cut');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0]);
    expect(st.rockSlotDust).toBeGreaterThanOrEqual(1);
    expect([st.rockSplits, st.rockEvictions, st.systems[0].rocksBroken]).toEqual([1, 0, 1]);
  });
});

describe('a rock target clears itself (spec §6.1 of spike ii)', () => {
  it('when its rock breaks: laser and torpedo targets to −1, a flying torpedo\'s to −2; an inactive ship\'s record is left alone', () => {
    const st = arena(), s = st.systems[0];
    shaped(st, 0, tmplOf(st, 19), 0, 2000);
    s.laserRock = 0; s.torpRock = 0; s.torpRockFlying = 0; st.systems[1].laserRock = 0;
    breakRock(st, 0, 0, 2000, 1, 0, 'laser', 0, 'cut');
    expect([s.laserRock, s.torpRock, s.torpRockFlying, st.systems[1].laserRock]).toEqual([-1, -1, -2, 0]);
  });
});

describe('damage, push and dust', () => {
  it('hitRock takes hp, emits a hit and counts it; at hp ≤ 0 it cuts along the hit through its point; a born or empty slot takes nothing', () => {
    const st = arena();
    shaped(st, 100, tmplOf(st, 31), 0, 2000);
    const hp = rockAt(st, 100).hp;
    hitRock(st, 100, 1, 0, 2000, 0, 1, 'laser', 0);
    expect(rockAt(st, 100).hp).toBe(hp - 1); expect(rockEvents(st, 'hit')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]); expect(st.rockHits).toBe(1);
    hitRock(st, 100, hp, 0, 2000, 0, 1, 'laser', 0);
    expect(rockEvents(st, 'split')).toHaveLength(1);
    const piece = rockEvents(st, 'split')[0]!.pieces![0]!, was = rockAt(st, piece).hp;
    hitRock(st, piece, 1, 0, 2000, 0, 1, 'laser', 0);   // born this tick
    expect(rockAt(st, piece).hp).toBe(was);
    hitRock(st, 150, 1, 0, 0, 0, 1, 'laser', 0);
    expect(st.rockHits).toBe(2);
  });
  it('pushRock frees a rail rock and adds Δv to its rail velocity; dustRock clears the slot and its cells with a dust event', () => {
    const st = arena();
    seeded(st, 7);
    const before = rockAt(st, 7);
    pushRock(st, 7, 2, -1);
    const after = rockAt(st, 7);
    expect(after.kind).toBe(RockKind.Free); expect(after.vx).toBeCloseTo(before.vx + 2, 9); expect(after.vy).toBeCloseTo(before.vy - 1, 9);
    expect(rockTmpl(st, 7)).toBe(7);
    dustRock(st, 7, 'planet');
    expect(rockAlive(st, 7)).toBe(false); expect([st.rockCells[14], st.rockCells[15]]).toEqual([0, 0]);
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 7, by: 'planet' }]);
  });
  it('mass is kept by a cut, less the dust', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    shaped(st, 100, tm, 0, 2000);
    const whole = rockMassOf(st, 100);
    breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!, kept = pieces.reduce((n, p) => n + popcount(rockMaskOf(st, p)), 0);
    expect(pieces.reduce((m, p) => m + rockMassOf(st, p), 0)).toBeCloseTo((whole * kept) / t.n, 9);
  });
});

describe('spike i cases kept: the hash, the clone and firstBlocker', () => {
  it('a chipped rock changes the hash, and a clone runs on identically', () => {
    const st = createTacticalState(11), h = hashTactical(st);
    st.rocks[6] = st.rocks[6]! - 0.5;
    expect(hashTactical(st)).not.toBe(h);
    const copy = cloneTactical(st);
    for (let i = 0; i < 30; i++) { stepDuel(st, IDLE_INPUT); stepDuel(copy, IDLE_INPUT); }
    expect(hashTactical(copy)).toBe(hashTactical(st));
  });
  it('firstBlocker finds the nearest rock along a segment', () => {
    const st = arena();
    mover(st, 5, 300, 2000, 0, 0, 20); mover(st, 2, 600, 2000, 0, 0, 20);
    expect(firstBlocker(st, 0, 2000, 900, 2000)).toMatchObject({ rock: 5 });
    expect(firstBlocker(st, 0, 2000, 900, 2000)!.t).toBeCloseTo(280 / 900, 12);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/rockBreak.test.ts`
Expected: FAIL (the new `breakRock` arguments and `'cut'` do not exist).

- [ ] **Step 4: Rewrite `rockBreak.ts`.** Replace the file's header comment, imports, and everything from `export type BreakPattern` down to (not including) `/** Clear slot k and every active ship's rock target` and replace `hitRock` and `breakRock`. The result (keep `vacate` as Task 2 left it, `dustRock`, `pushRock`, `wearRock`, `allocate` and `crushDamage` as they are):

Header and imports:

```ts
// Asteroids-iv §5 (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md), on spike ii's and asteroids-iii's
// rockBreak: how a rock takes a hit, a push, turns to dust and breaks. A break divides the rock's cells and never invents a
// shape. Every break but a torpedo's direct hit is one straight cut through a world point along a direction (§5.2): the
// cells left and right of the line, each side's connected groups. A torpedo's direct hit is a shatter (§5.3): a crater at
// the struck cell and six sectors round it. A group of two or more cells whose bounding radius is at least ROCK_MIN_R is a
// piece: it keeps its cells where they stood, at the parent's velocity plus a kick (§5.4). Any other group is dust (an
// event with rock −1). A rock with no piece (a plain rock, or only crumbs) turns to dust whole. The largest piece keeps
// the broken rock's slot, the others take the lowest empty slots, else evict the smallest rock (any live kind) smaller
// than the piece that is not born this tick and not in `exclude` (ties: the lowest slot), else the piece is dust
// (rockSlotDust + 1). Pieces are Free with t = the phase tick (siblings share t) and are linked into the rock grid at
// birth. Every slot cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage,
// push or break. A push frees a rail first, restarts the rock's clock and touches it.
import { escapeSpeed } from './rails';
import { components, cutSides, popcount, shapeOf, shatterGroups, templateFor, type CutOut } from './rockCells';
import { BURST_KICK_MIN, BURST_KICK_SPAN, CUT_KICK, GOLDEN_FRAC, ROCK_CRUSH_SPEED, ROCK_CRUSH_STEP, ROCK_MIN_R, TIDAL_CUT_KICK } from './rockTuning';
import { CELL_STRIDE, freeRock, markTouched, regridRock, restartClock, rockAlive, rockAt, rockHp, RockKind, rockMaskOf, rockSlots, rockTmpl, ROCK_STRIDE, setRockCells, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'cut' | 'shatter' | 'tidal';
/** §5.4: f_j, the fractional part of j · GOLDEN_FRAC (a shatter's piece j flies at v_esc · (BURST_KICK_MIN + BURST_KICK_SPAN · f_j)). */
export function kickFraction(j: number): number { const p = j * GOLDEN_FRAC; return p - Math.floor(p); }
```

`hitRock`:

```ts
/** A weapon's hit at world point (px, py) along (ux, uy): wear, a hit event (rockHits + 1), and at hp ≤ 0 a cut. */
export function hitRock(s: TacticalState, k: number, dmg: number, px: number, py: number, ux: number, uy: number, by: RockCause, ship = -1): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const broke = wearRock(s, k, dmg), a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship) });
  s.rockHits++;
  if (broke) breakRock(s, k, px, py, ux, uy, by, ship, 'cut');
}
```

`breakRock`:

```ts
interface Group { mask: number; n: number; kx: number; ky: number }
const groupScratch: number[] = [], cutOut: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
/**
 * §5: rock k breaks at world point (px, py) along (ux, uy) (need not be unit; zero: north), with its cause, its ship (−1
 * none) and the pattern. rocksBroken + 1 for `ship`, once. The point is taken into the rock's frame (§10a 1: no
 * orientation in iv-a, so only the shift by its centre of mass). 'cut' and 'tidal': cutSides, each side's groups; the left
 * side (cross(u, cell − P) ≥ 0) takes +n · S · (right cells) / (all cells) and the right −n · S · (left cells) / (all), n =
 * (−uy, ux) of the direction used and S = v_esc(ρ) · CUT_KICK (tidal: TIDAL_CUT_KICK). 'shatter': shatterGroups; piece j
 * (largest first) flies from the point toward its centre of mass at v_esc(ρ) · (BURST_KICK_MIN + BURST_KICK_SPAN · f_j).
 * Then one split event naming the slots written (`burst: true` for a shatter), and a dust event (rock −1) per dust group.
 */
export function breakRock(s: TacticalState, k: number, px: number, py: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), tm = rockTmpl(s, k);
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (tm < 0) { dustRock(s, k, by, ship); return; }   // a plain rock is one cell
  const t = templateFor(s.map, tm), mask = rockMaskOf(s, k), parent = shapeOf(t, mask);
  const len = Math.sqrt(ux * ux + uy * uy), hx = len > 0 ? ux / len : 0, hy = len > 0 ? uy / len : -1;
  const lx = px - a.x + parent.gx, ly = py - a.y + parent.gy, ve = escapeSpeed(Math.sqrt(a.x * a.x + a.y * a.y));
  const pieces: Group[] = [], dust: Group[] = [];
  const sort = (g: number, kx: number, ky: number): void => { const n = popcount(g); (n >= 2 && shapeOf(t, g).r >= ROCK_MIN_R ? pieces : dust).push({ mask: g, n, kx, ky }); };
  if (pattern === 'shatter') {
    const count = shatterGroups(t, mask, lx, ly, hx, hy, groupScratch);
    for (let i = 0; i < count; i++) sort(groupScratch[i]!, 0, 0);
  } else {
    cutSides(t, mask, lx, ly, hx, hy, cutOut);
    const nl = popcount(cutOut.left), nr = popcount(cutOut.right), sp = ve * (pattern === 'tidal' ? TIDAL_CUT_KICK : CUT_KICK), nx = -cutOut.uy, ny = cutOut.ux;
    const kl = (sp * nr) / (nl + nr), kr = (sp * nl) / (nl + nr), right = cutOut.right;
    let count = components(t, cutOut.left, groupScratch);
    for (let i = 0; i < count; i++) sort(groupScratch[i]!, nx * kl, ny * kl);
    count = components(t, right, groupScratch);
    for (let i = 0; i < count; i++) sort(groupScratch[i]!, -nx * kr, -ny * kr);
  }
  if (pieces.length === 0) { dustRock(s, k, by, ship); return; }
  pieces.sort((p, q) => q.n - p.n || (p.mask & -p.mask) - (q.mask & -q.mask));
  if (pattern === 'shatter') pieces.forEach((p, j) => {
    const sh = shapeOf(t, p.mask), dx = sh.gx - lx, dy = sh.gy - ly, dd = Math.sqrt(dx * dx + dy * dy), kick = ve * (BURST_KICK_MIN + BURST_KICK_SPAN * kickFraction(j));
    p.kx = (dd > 0 ? dx / dd : hx) * kick; p.ky = (dd > 0 ? dy / dd : hy) * kick;
  });
  const written: number[] = [];
  vacate(s, k);
  pieces.forEach((p, j) => {
    const sh = shapeOf(t, p.mask), x = a.x + sh.gx - parent.gx, y = a.y + sh.gy - parent.gy, vx = a.vx + p.kx, vy = a.vy + p.ky;
    const slot = j === 0 ? k : allocate(s, sh.r, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent (rockSlotDust)
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x, y, r: sh.r, vx, vy, ...shipField(ship) });
      s.rockDust++; s.rockSlotDust++;
      return;
    }
    writeRock(s, slot, RockKind.Free, x, y, vx, vy, sh.r, rockHp(sh.r));
    setRockCells(s, slot, tm, p.mask);
    s.rockBorn[slot] = 1;
    regridRock(s, slot);
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    written.push(slot);
  });
  for (const g of dust) {
    const sh = shapeOf(t, g.mask);
    s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: a.x + sh.gx - parent.gx, y: a.y + sh.gy - parent.gy, r: sh.r, vx: a.vx + g.kx, vy: a.vy + g.ky, ...shipField(ship) });
    s.rockDust++;
  }
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces: written, ...shipField(ship), ...(pattern === 'shatter' ? { burst: true as const } : {}) });
}
```

Remove `C30 ... S60`, `FAN_DIRS`, `BURST_DIRS`, `pieceCount`, `pieceRadius`, `pieceOffset`, `pieceKick`. In `allocate`'s caller above, `allocate(s, sh.r, ...)` passes the piece's radius as before. Drop any import the file no longer uses (`ROCK_STRIDE`, `CELL_STRIDE`, `freeRock`... only if unused; `tsc` will say).

- [ ] **Step 5: The callers.**

`rockWeapons.ts`, `laserStrikesRock`: the last line becomes `hitRock(state, k, LASER_ROCK_DAMAGE, x, y, ux, uy, 'laser', i);`.

`gun.ts`: `roundStrikesRock` gains the impact point:

```ts
function roundStrikesRock(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number, t: number, rd: GunRockDef): void {
  const dx = nx - ox, dy = ny - oy, d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const j = rd.pushPerRound / rockMassOf(state, k);
  pushRock(state, k, ux * j, uy * j);
  hitRock(state, k, 1 / rd.roundsPerHp, ox + dx * t, oy + dy * t, ux, uy, 'gun', owner);
}
```

and its call in `stepRounds` passes `best` before `g.rock`: `roundStrikesRock(state, r.owner, rock, ox, oy, r.x, r.y, best, g.rock);`. Update its doc comment: "a cut along the round through the point it struck".

`contacts.ts`, `shipRock`'s last line: `if (broke) breakRock(state, k, s.x - nx * radius, s.y - ny * radius, -nx, -ny, 'ram', i, 'cut', [k]);`.

`rockContacts.ts`, `resolveRockPair`: before the `if (vc <= ROCK_CRUSH_SPEED) return;` line nothing changes; replace the two break lines with

```ts
  const cx = v[A + 1]! + cax - nx * cra, cy = v[A + 2]! + cay - ny * cra;   // the contact point, read before a break rewrites slot a
  if (aBreaks) breakRock(s, a, cx, cy, nx, ny, 'collision', -1, 'cut', [a, b]);
  if (bBreaks) breakRock(s, b, cx, cy, -nx, -ny, 'collision', -1, 'cut', [a, b]);
```

`rockContacts.ts`, `stepRocks` part 1: replace the tidal condition and call with

```ts
    if (ROCK_SWITCHES.rocheBreak && rx * rx + ry * ry < ROCHE_R * ROCHE_R && T1 - v[b + 7]! >= ROCHE_MIN_AGE && rockTmpl(s, k) >= 0 && popcount(rockMaskOf(s, k)) >= TIDAL_MIN_CELLS) {
      breakRock(s, k, rx, ry, v[b + 3]!, v[b + 4]!, 'tidal', -1, 'tidal');   // spec §5.2: a cut through the centre of mass along its velocity; its pieces are born, so they hold this tick
      continue;
    }
```

with `popcount` imported from `./rockCells`, `rockMaskOf` from `./rocks`, `TIDAL_MIN_CELLS` from `./rockTuning` (and `FAN_SPLIT_MIN_R` dropped). Rewrite the file's header lines that describe the fan to describe the cut.

`rockBlast.ts`: replace the body of `detonateTorpedo` with

```ts
  const near: number[] = [];
  const nn = rocksNear(s, x, y, BLAST_RADIUS, blastNear);   // taken once, ascending, before the direct hit's pieces exist
  for (let ii = 0; ii < nn; ii++) {
    const k = blastNear[ii]!;
    if (k === rock || !rockAlive(s, k) || s.rockBorn[k] === 1) continue;
    if (rockSurfaceDistance(s, k, x, y) < BLAST_RADIUS) near.push(k);   // asteroids-iv spec §6: to the nearest cell's surface
  }
  s.rockBlasts++;
  s.events.push({ kind: 'rock', what: 'blast', by: 'torpedo', rock, x, y, r: BLAST_RADIUS, vx: mvx, vy: mvy, ship: owner });
  const t = rockAt(s, rock);
  rockNearestCell(s, rock, x, y, cell);   // §10a 5: the shatter's point is the struck cell's centre
  breakRock(s, rock, cell.x, cell.y, mvx - t.vx, mvy - t.vy, 'torpedo', owner, 'shatter');
  for (const k of near) {
    if (!rockAlive(s, k) || s.rockBorn[k] === 1) continue;   // evicted, or reused for a piece of this blast
    const a = rockAt(s, k), dx = a.x - x, dy = a.y - y, dist = Math.sqrt(dx * dx + dy * dy);
    rockNearestCell(s, k, x, y, cell);
    const cx = cell.x, cy = cell.y;
    const fall = blastFall(Math.max(0, cell.d - cell.r)), ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1, dv = Math.min((BLAST_PUSH * fall) / rockMassOf(s, k), BLAST_PUSH_CAP * escapeSpeed(Math.sqrt(a.x * a.x + a.y * a.y)));
    pushRock(s, k, ux * dv, uy * dv);
    hitRock(s, k, BLAST_ROCK_DAMAGE_MIN + (BLAST_ROCK_DAMAGE_MAX - BLAST_ROCK_DAMAGE_MIN) * fall, cx, cy, cx - x, cy - y, 'torpedo', owner);   // spec §5.2: a cut through its nearest cell, away from the blast
  }
```

followed by the unchanged ship loop. Add `const cell: NearCell = { x: 0, y: 0, d: 0, r: 0 };` at module level and `import { rockNearestCell, rockSurfaceDistance, type NearCell } from './rockShape';`. For a plain rock the nearest cell is its centre, `cell.d` is `dist` and `cell.r` its r, so the fall-off and the push are today's. Rewrite the header comment's "burst" and "fan break" to "shatter" and "cut".

`src/renderer/src/app/duel/duelMode.ts`: the staging hook only passes the functions through; no change.

- [ ] **Step 6: Scripts (arguments only).** A break now takes its world point after the slot:

| File | Today | Becomes |
| --- | --- | --- |
| `scripts/profile-duel-publication.ts:51` | `breakRock(d.tactical, k, 1, 0, 'collision', -1, 'fan')` | `{ const a = rockAt(d.tactical, k); breakRock(d.tactical, k, a.x, a.y, 1, 0, 'collision', -1, 'cut'); }` (import `rockAt` if it is not there) |
| `scripts/spike-asteroids-iii-idle.ts:77` | `breakRock(t, rock, -a.x, -a.y, 'torpedo', 0, 'burst')` | `breakRock(t, rock, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter')` |
| `scripts/spike-asteroids-iii-measure.ts:228` | `breakRock(st, big, -a.x, -a.y, 'torpedo', 0, 'burst')` | `breakRock(st, big, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter')` |
| `scripts/spike-asteroids-iii-frames.cjs:66` | `h.breakRock(t, kk, -a.x, -a.y, 'torpedo', 0, 'burst')` | `h.breakRock(t, kk, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter')` |

In `scripts/spike-asteroids-iii-measure.ts`, the two `rockMass(rockAt(st, p).r)` reads (lines 60 and 77) become `rockMassOf(st, p)`.

- [ ] **Step 7: The other tests.** Run `npx tsc -b`, then fix each test by these rules (a test not listed that fails is a bug):

- **Call shape.** `breakRock(st, k, ux, uy, by, ship, 'fan' | 'burst' | 'tidal')` becomes `{ const a = rockAt(st, k); breakRock(st, k, a.x, a.y, ux, uy, by, ship, 'cut' | 'shatter' | 'tidal'); }`; `hitRock(st, k, dmg, ux, uy, by, ship)` gains the rock's centre as the point the same way. This covers `tests/rockGrid.test.ts:30,78`, `tests/rockContacts.test.ts:102`, `tests/duelRounds.test.ts:164`.
- **A test that broke a plain rock and counted fan or burst pieces** now builds the rock with `shaped(st, slot, tmplOf(st, 31), x, y, vx, vy)` and asserts the new rule: a `split` event whose pieces all have `rockTmpl === tmplOf(st, 31)`, disjoint masks, at least 2 pieces, `burst: true` only for a torpedo's direct hit. This covers:
  - `tests/rockBlast.test.ts` "bursts the touched rock whatever its hp..." (retitle "shatters the touched rock whatever its hp: real chunks of it, the struck cell dust"; place the torpedo at the rock's westernmost cell's surface and detonate; keep the blast event and counter assertions);
  - `tests/rockBlast.test.ts` "takes its list before the direct hit..." (keep the scene with a `shaped` 31-cell rock and assert the slot the pieces reuse got no `hit` event);
  - `tests/rockLaser.test.ts` "a laser break on r 42 gives 3 pieces..." (retitle "a laser break cuts the rock along the shot: two sides of it; a plain rock is dust; the target clears and the tally counts");
  - `tests/rockShips.test.ts` "ram damage ... can break a rock" (keep the bump-then-break order and names; the break is a `split` of a `shaped` rock or a whole `dust` of the plain one it uses, whichever the scene has);
  - `tests/rockContacts.test.ts` "apply both amounts before any break; a breaks first, then b, along n and −n" (plain rocks now dust: assert the two `dust` events in the order a then b, or rebuild with `shaped` rocks and assert two `split` events in that order);
  - `tests/w4Rocks.test.ts` "an r 15 rock (2 hp) breaks on the 8th round, in the fan pattern..." (retitle "...breaks on the 8th round: a plain rock to dust, a cell rock cut along the round"; keep the 8th-round and `rocksBroken` assertions);
  - `tests/rockMotion.test.ts` "a free rock inside ρ 175, r ≥ 13 ... fan-breaks along its velocity" (retitle "a free cell rock of at least 4 cells inside ρ 175 and at least 30 ticks old is cut through its centre of mass along its velocity, cause tidal, its sides parting at 0.04 of v_esc; a plain rock is not"; build it with `shaped`).
- **A test that only needs "some pieces exist"** (`rockGrid`, `duelRounds`) already runs on seeded rocks and needs only the call shape.

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b && npx vitest run tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockLaser.test.ts tests/rockShips.test.ts tests/rockContacts.test.ts tests/rockMotion.test.ts tests/rockGrid.test.ts tests/w4Rocks.test.ts tests/duelRounds.test.ts tests/rockSettle.test.ts tests/rockShapeHits.test.ts tests/rockShapeContacts.test.ts tests/rockCellState.test.ts tests/boundary.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical tests scripts
git commit -m "feat(asteroids-iv): a break divides the rock's cells: the cut and the shatter, pieces of the original where they stood; the fan and burst patterns removed (spec §5)"
```

(Check `git status` first: only the files this task names.)

---

### Task 6: Drawing the cells

**Files:**
- Create: `src/renderer/src/render/tactical/rockOutline.ts`
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`
- Delete: `tests/rockCracks.test.ts`
- Test: `tests/rockOutline.test.ts` (new), `tests/rockLook.test.ts`, `tests/rockTrack.test.ts`, `tests/rockFx.test.ts`, `tests/crtColours.test.ts`

**Interfaces:**
- Consumes: `Template`, `shapeOf`, `NEIGHBOURS`, `S3`, `templateFor` (Task 1); `rockTmpl`, `rockMaskOf` (Task 2).
- Produces: `interface RockOutline { loops: number[][]; seams: number[] }` (world units about the rock's centre of mass; a loop is flat x, y pairs; seams are flat x1, y1, x2, y2), `rockOutline(t, mask): RockOutline` (cached), `CORNER_JITTER = 0.18`, `NOTCH_OUT = 0.2`, `TIP_IN = 0.13`. `AsteroidDraw` gains `outline?: RockOutline; scale?: number` and loses `spin`. `SEAM_MIN_PX = 6` replaces `CRACK_MIN_PX`; `CRACK_ALPHA` is kept as the seams' full alpha.

- [ ] **Step 1: Write the failing test** `tests/rockOutline.test.ts`:

```ts
// Asteroids-iv spec §7: a mask's outline is the boundary of its cells (closed loops, every rim edge once), its seams the
// edges between two live neighbours; both about the rock's centre of mass, cached per template and mask.
import { describe, expect, it } from 'vitest';
import { buildTemplate, components, popcount, shapeOf } from '../src/renderer/src/sim/tactical/rockCells';
import { rockOutline } from '../src/renderer/src/render/tactical/rockOutline';

const t = buildTemplate(2, 50, 7);
const rimEdges = (mask: number): number => { let n = 0; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1) n += 6 - popcount(t.nb[c]! & mask); return n; };
const pairs = (mask: number): number => { let n = 0; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1) n += popcount(t.nb[c]! & mask); return n / 2; };

describe('rockOutline (spec §7)', () => {
  it('a whole rock: one closed loop with one corner per rim edge, and a seam per pair of neighbours', () => {
    const o = rockOutline(t, t.full);
    expect(o.loops).toHaveLength(1);
    expect(o.loops[0]!.length / 2).toBe(rimEdges(t.full));
    expect(o.seams.length / 4).toBe(pairs(t.full));
    expect(rockOutline(t, t.full)).toBe(o);
  });
  it('every point lies within the bounding radius plus the jitter and easing of the centre of mass', () => {
    for (const mask of [t.full, t.full & 0x2aaaaaaa | 1, 0b111]) {
      const groups: number[] = []; const n = components(t, mask, groups);
      for (let g = 0; g < n; g++) {
        if (popcount(groups[g]!) < 2) continue;
        const o = rockOutline(t, groups[g]!), r = shapeOf(t, groups[g]!).r + 0.4 * t.d;
        for (const loop of o.loops) for (let i = 0; i < loop.length; i += 2) expect(Math.hypot(loop[i]!, loop[i + 1]!)).toBeLessThanOrEqual(r);
      }
    }
  });
  it('two halves of a cut fit exactly: every corner along the cut is the same point in both outlines (no corner moves when a rock is divided)', () => {
    let left = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < 0) left |= 1 << c;
    const right = t.full & ~left, a = rockOutline(t, left), b = rockOutline(t, right), ga = shapeOf(t, left), gb = shapeOf(t, right);
    const key = (x: number, y: number): string => `${x.toFixed(6)},${y.toFixed(6)}`;
    const ptsA = new Set<string>(), ptsB = new Set<string>();
    for (const loop of a.loops) for (let i = 0; i < loop.length; i += 2) ptsA.add(key(loop[i]! + ga.gx, loop[i + 1]! + ga.gy));
    for (const loop of b.loops) for (let i = 0; i < loop.length; i += 2) ptsB.add(key(loop[i]! + gb.gx, loop[i + 1]! + gb.gy));
    let shared = 0; for (const p of ptsA) if (ptsB.has(p)) shared++;
    let cutEdges = 0; for (let c = 0; c < t.n; c++) if ((left >>> c) & 1) cutEdges += popcount(t.nb[c]! & right);
    expect(shared).toBe(cutEdges + 1);   // a cut of n edges is a path of n + 1 corners, each in both outlines
  });
  it('a ring (the middle cell gone) has two loops, the larger first', () => {
    let mid = -1; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 0.6) mid = c;
    const o = rockOutline(t, t.full & ~(1 << mid));
    expect(o.loops).toHaveLength(2); expect(o.loops[0]!.length).toBeGreaterThan(o.loops[1]!.length);
  });
});
```

A corner's place depends only on the template (§10a 7), so it is the same point in every piece; the third test relies on that. (If a template's cut is not one path, for instance it crosses a bay, `cutEdges + 1` undercounts: then assert `toBeGreaterThanOrEqual(cutEdges + 1)`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rockOutline.test.ts`
Expected: FAIL, cannot resolve `rockOutline`.

- [ ] **Step 3: Write** `src/renderer/src/render/tactical/rockOutline.ts`:

```ts
// Asteroids-iv spec §7, §10a 7 (renderer only, any Math): the drawn outline and seams of a rock's cells. Each cell is a
// hexagon; a lattice corner is shared by three cells and is named by the sum of their lattice coordinates, so neighbours
// always agree on it. A corner's place is fixed per template, whatever cells a rock still has: it is moved by a hashed
// offset (up to CORNER_JITTER spacings), and a corner on the template's own rim is eased so the rim reads as stone, not as
// a cog: one shared by two template cells (the notch between them) moves NOTCH_OUT spacings away from them, one that
// belongs to a single template cell (a tip) moves TIP_IN spacings toward it. A corner where three template cells meet is
// not eased. Because no corner moves when a rock is divided, two pieces fit exactly along their cut. Points are world
// units about the mask's centre of mass. Cached per template and mask; drawing only (shots and contacts meet the cells'
// circles).
import { NEIGHBOURS, S3, shapeOf, type Template } from '../../sim/tactical/rockCells';

export const CORNER_JITTER = 0.18, NOTCH_OUT = 0.2, TIP_IN = 0.13;
/** `loops`: closed boundary loops as flat x, y pairs, the largest first (any others are holes). `seams`: the edges between
 *  two live neighbours as flat x1, y1, x2, y2. */
export interface RockOutline { loops: number[][]; seams: number[] }
const cache = new WeakMap<Template, Map<number, RockOutline>>(), cornerCache = new WeakMap<Template, Map<string, { x: number; y: number }>>();
const mix = (a: number, b: number, c: number): number => { let h = Math.imul((a + 1) ^ 0x9e3779b9, 0x85ebca6b) >>> 0; h = Math.imul(h ^ (b + 4096), 0xc2b2ae35) >>> 0; h = Math.imul(h ^ (c + 4096), 0x27d4eb2f) >>> 0; return (h ^ (h >>> 15)) >>> 0; };
/** Corner c of cell i lies between its neighbours c and c + 1: thrice its lattice place is 3·cell + step c + step c + 1. */
const keyOf = (t: Template, i: number, c: number): string => { const a = NEIGHBOURS[c]!, b = NEIGHBOURS[(c + 1) % 6]!; return `${3 * t.q[i]! + a[0] + b[0]},${3 * t.r[i]! + a[1] + b[1]}`; };

/** Every lattice corner of the template's cells at its fixed drawn place, in the template's frame. */
function cornersOf(t: Template): Map<string, { x: number; y: number }> {
  const cached = cornerCache.get(t);
  if (cached) return cached;
  const acc = new Map<string, { n: number; sx: number; sy: number; x: number; y: number }>();
  for (let i = 0; i < t.n; i++) for (let c = 0; c < 6; c++) {
    const a = NEIGHBOURS[c]!, b = NEIGHBOURS[(c + 1) % 6]!, fq = a[0] + b[0], fr = a[1] + b[1], k = keyOf(t, i, c);
    let e = acc.get(k);
    if (!e) { e = { n: 0, sx: 0, sy: 0, x: t.x[i]! + ((fq + fr / 2) / 3) * t.d, y: t.y[i]! + ((fr * S3) / 3) * t.d }; acc.set(k, e); }
    e.n++; e.sx += t.x[i]!; e.sy += t.y[i]!;
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [k, e] of acc) {
    const [kq, kr] = k.split(',').map(Number) as [number, number], h = mix(t.index, kq, kr), ang = (h % 6283) / 1000, amp = (((h >>> 13) % 1000) / 1000) * CORNER_JITTER * t.d;
    let x = e.x, y = e.y;
    if (e.n < 3) {
      const dx = x - e.sx / e.n, dy = y - e.sy / e.n, l = Math.hypot(dx, dy) || 1, by = (e.n === 2 ? NOTCH_OUT : -TIP_IN) * t.d;
      x += (dx / l) * by; y += (dy / l) * by;
    }
    out.set(k, { x: x + Math.cos(ang) * amp, y: y + Math.sin(ang) * amp });
  }
  cornerCache.set(t, out);
  return out;
}

export function rockOutline(t: Template, mask: number): RockOutline {
  let byMask = cache.get(t);
  if (!byMask) { byMask = new Map(); cache.set(t, byMask); }
  const hit = byMask.get(mask);
  if (hit) return hit;
  const sh = shapeOf(t, mask), corners = cornersOf(t), live = new Map<string, number>();
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) live.set(`${t.q[i]},${t.r[i]}`, i);
  // The edge facing neighbour c runs from corner c − 1 to corner c. A rim edge (no live neighbour) joins the boundary.
  const next = new Map<string, string>(), seams: number[] = [];
  for (const i of live.values()) for (let c = 0; c < 6; c++) {
    const nb = NEIGHBOURS[c]!, j = live.get(`${t.q[i]! + nb[0]},${t.r[i]! + nb[1]}`), from = keyOf(t, i, (c + 5) % 6), to = keyOf(t, i, c);
    if (j === undefined) next.set(from, to);
    else if (i < j) { const p = corners.get(from)!, q = corners.get(to)!; seams.push(p.x - sh.gx, p.y - sh.gy, q.x - sh.gx, q.y - sh.gy); }
  }
  const loops: number[][] = [];
  while (next.size > 0) {
    const loop: number[] = [];
    for (let k = next.keys().next().value as string; next.has(k);) { const e = corners.get(k)!; loop.push(e.x - sh.gx, e.y - sh.gy); const to = next.get(k)!; next.delete(k); k = to; }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  const out = { loops, seams };
  byMask.set(mask, out);
  return out;
}
```

- [ ] **Step 4: Run the outline tests**

Run: `npx vitest run tests/rockOutline.test.ts`
Expected: PASS. If the loop count is wrong, a rim edge's `from`/`to` are swapped: every cell's rim edges must run the same way round.

- [ ] **Step 5: The model.** In `src/renderer/src/render/tactical/tacticalModel.ts`:

- `AsteroidDraw` becomes:

```ts
/** `wear` 0 (whole) .. 1 from hp / hpMax, drawn as the seams' strength; asteroids-iv spec §7: `outline` a cell rock's
 *  outline and seams in world units about its centre, drawn at `scale` (the zoom). A rock with no outline is plain. */
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean; wear?: number; outline?: RockOutline; scale?: number }
```

- In the asteroid loop, the push becomes:

```ts
    const tm = rockTmpl(state, index);
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX, wear: Math.max(0, Math.min(1, 1 - a.hp / rockHpMax(a.r))),
      ...(tm >= 0 ? { outline: rockOutline(templateFor(map, tm), rockMaskOf(state, index)), scale: z } : {}) });
```

with `rockTmpl, rockMaskOf` added to the `rocks` import, `import { templateFor } from '../../sim/tactical/rockCells';` and `import { rockOutline, type RockOutline } from './rockOutline';`.

- Delete `asteroidSpin`, `CRACK_COUNT`, `CRACK_INSET`, `CrackLine`, `CRACK_TAU`, `CRACK_DEG`, `outlineRadius`, `crackRandom`, `clampInside`, `lineLength`, `FullCrack`, `crackCache`, `fullCracks`, `cutLine`, `crackPaths`, `CrackSegDraw`, `crackDraw`. Keep `asteroidShape` (a plain rock's outline) and replace the constants line with:

```ts
/** Asteroids-iv spec §7: a rock's seams show at CRACK_ALPHA · wear, once the rock is at least SEAM_MIN_PX across on screen. */
export const CRACK_ALPHA = 0.6, SEAM_MIN_PX = 6;
```

- Remove `rockDrawTick` from the import if nothing else uses it (the rails still use it in `rockTrack.ts`).

- [ ] **Step 6: The layer.** In `src/renderer/src/render/tactical/tacticalLayer.ts`, replace the rock body block (from `const shape = asteroidShape(a.index), pts: number[] = [];` through the crack line) with:

```ts
        // Asteroids-iv spec §7: a cell rock is its cells' outline (holes in the tube's colour), a plain rock the old
        // nine-sided shape; both the same CRT.dim fill and CRT.mid outline at any wear. The seams fade in with wear.
        const pts: number[] = [];
        if (a.outline) {
          const z = a.scale ?? 1;
          a.outline.loops.forEach((loop, li) => {
            pts.length = 0;
            for (let i = 0; i < loop.length; i += 2) pts.push(a.x + loop[i]! * z, a.y + loop[i + 1]! * z);
            bodies.poly(pts).fill(li === 0 ? CRT.dim : CRT.glass).stroke({ width: 1, color: CRT.mid });
          });
          const wear = a.wear ?? 0, seams = a.outline.seams;
          if (wear > 0 && a.r >= SEAM_MIN_PX && seams.length > 0) {
            for (let i = 0; i < seams.length; i += 4) bodies.moveTo(a.x + seams[i]! * z, a.y + seams[i + 1]! * z).lineTo(a.x + seams[i + 2]! * z, a.y + seams[i + 3]! * z);
            bodies.stroke({ width: 1, color: CRT.faint, alpha: CRACK_ALPHA * wear });
          }
        } else {
          const shape = asteroidShape(a.index);
          shape.forEach((m, k) => { const ang = (k / shape.length) * Math.PI * 2; pts.push(a.x + Math.cos(ang) * a.r * m, a.y + Math.sin(ang) * a.r * m); });
          bodies.poly(pts).fill(CRT.dim).stroke({ width: 1, color: CRT.mid });
        }
```

and change the import from `./tacticalModel` to drop `crackDraw` and add `SEAM_MIN_PX`.

- [ ] **Step 7: The view tests.**

- Delete `tests/rockCracks.test.ts` (`git rm`).
- `tests/rockTrack.test.ts`: delete the test "every outline turns at its own hashed rate..." and the `spin` assertions in "on a guest seeing every third tick..." (its `spinEnd`, `spin(0)`, `spin(0.5)` lines and their helpers); drop `asteroidSpin` from the import.
- `tests/crtColours.test.ts`: the asteroid literals need no `spin`; give one a cell outline so the frame covers it: add `import { buildTemplate } from '../src/renderer/src/sim/tactical/rockCells';` and `import { rockOutline } from '../src/renderer/src/render/tactical/rockOutline';`, and add `{ index: 7, x: 440, y: 600, r: 30, dot: false, wear: 0.6, outline: rockOutline(buildTemplate(7, 44, 3), buildTemplate(7, 44, 3).full), scale: 0.7 }` to `asteroids`.
- Replace `tests/rockLook.test.ts`'s `rock` builder and its tests' expectations with the cell rock: 

```ts
const tpl = buildTemplate(5, 44, 3), outline = rockOutline(tpl, tpl.full);
const rock = (wear: number): AsteroidDraw => ({ index: 5, x: 400, y: 300, r: 40, dot: false, wear, outline, scale: 0.9 });
```

  with the imports of the previous bullet. The four tests keep their titles' meaning: a whole rock adds exactly `[{ fill, CRT.dim, 1 }, { stroke, CRT.mid, 1 }]`; a worn rock's first two entries are the same at every wear; what follows them is one `stroke` in `CRT.faint` whose alpha is `0.6 * wear` (assert `toBeCloseTo(0.6 * wear, 9)` and `toBeLessThanOrEqual(0.6)`); nothing is `CRT.main` or `CRT.hot`. Add a fifth: a plain rock (`{ index: 5, x: 400, y: 300, r: 40, dot: false, wear: 0.8 }`) adds only the fill and the outline (no seams).

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b && npx vitest run tests/rockOutline.test.ts tests/rockLook.test.ts tests/rockTrack.test.ts tests/rockFx.test.ts tests/crtColours.test.ts tests/tacticalModel.test.ts tests/rockTargetModel.test.ts`
Expected: PASS (`tacticalModel.test.ts` keeps its three `asteroidShape` assertions).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/render/tactical/rockOutline.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts tests/rockOutline.test.ts tests/rockLook.test.ts tests/rockTrack.test.ts tests/crtColours.test.ts
git rm tests/rockCracks.test.ts
git commit -m "feat(asteroids-iv): rocks drawn from their cells: an eased, jittered outline and faint seams that fade in with wear; the invented cracks and the drawing-only spin removed (spec §7)"
```

---

### Task 7: The cost and the feel measurements

**Files:**
- Modify: `scripts/spike-asteroids-iii-measure.ts`
- Create: `docs/superpowers/research/2026-11-20-asteroids-iv-a.md`

- [ ] **Step 1: The gates.** In `scripts/spike-asteroids-iii-measure.ts`:

- The header comment's `feel` line (a): "≥ 6 real pieces" becomes "≥ 3 real pieces (asteroids-iv: a shatter gives real chunks of the rock, about four to six)". Change the constant or literal the code compares the piece count with from 6 to 3 (search the `feel` block for the count read from `e.pieces!.length`).
- The `cost` gate: `p99GateMs: 0.5, p99Pass: p99 < 0.5` becomes `p99GateMs: 0.6, p99Pass: p99 < 0.6`, and the header's "under 0.5 ms" becomes "under 0.6 ms (asteroids-iv spec §9)".
- In `costRun`, the fill rocks are plain. So that the cost run exercises cells, after the fill add one line that shatters the six largest seeded rocks before timing starts:

```ts
    { let done = 0; for (let k = 0; k < st.map.asteroids.length && done < 6; k++) if (st.map.asteroids[k]!.r >= 40 && rockAlive(st, k)) { const a = rockAt(st, k); breakRock(st, k, a.x, a.y, 1, 0, 'torpedo', 0, 'shatter'); beginRockTick(st); done++; } }
```

  (use the state variable's name in that function; import what is missing).

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/spike-asteroids-iii-measure.ts --json out/asteroids-iv-a-measure.json`
Expected: exit 0: `stress.safetyPass` true with no failures (twins hash equal, save and restore equal, grid matches brute force), `cost.p99Pass` true, `feel.allOn.gatePass` true.

- If `cost` fails: add the per-slot memo of world cells the spec's §9 names. In `rocks.ts`, key a `WeakMap<Float64Array, { tick, ok: Uint8Array, x: Float64Array, y: Float64Array }>` on `s.rocks` beside the rail table, fill a slot's 31 pairs on first `rockCellsInto` of a tick, and clear the slot's `ok` wherever `railRowChanged` is called and in `moveFreeSlot`'s caller, the separation fixes and `setRockCells`. Add a test that a moved rock's cells are fresh. Re-run.
- If `feel` fails on (b), (c) or (d) (touches, mass alive, turning): record the numbers; these are the owner's playtest questions (spec §12), not a blocker. A failure on (a) means shatters give fewer than 3 chunks: check `shatterGroups`.

- [ ] **Step 3: Write the report** `docs/superpowers/research/2026-11-20-asteroids-iv-a.md`: the script's JSON summary as a table (stress, cost p99 for flying and settled, feel 10 shots with the four criteria, idle, burst), the piece counts per shot, and one paragraph on each gate that changed and why.

- [ ] **Step 4: Commit**

```bash
git add scripts/spike-asteroids-iii-measure.ts docs/superpowers/research/2026-11-20-asteroids-iv-a.md
git commit -m "test(asteroids-iv): the measure script on cell rocks: cost under 0.6 ms with shattered rocks in the scene, the feel proxy's piece count for real chunks; the report"
```

---

### Task 8: The duel gates, the version bump, the whole suite, the app, the gates entry

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts` (SIM_VERSION), the goldens and fixtures (by `npm run bless` only), trajectory-pinned tests (their pinned values and history comments only)
- Modify: `docs/gates.md`
- Modify: `scripts/spike-asteroids-iii-shots.cjs` (the cracks section, below)

- [ ] **Step 1: Bring master in.** `git merge master`. Resolve conflicts by keeping both sides' intent; if master's `SIM_VERSION` rose, this plan's bump starts from the new value. Re-run `npx tsc -b`.

- [ ] **Step 2: Full-suite triage before any bless**

Run: `npm run build && npx vitest run`
Expected: the only failures are the goldens and trajectory-pinned tests named in Global Constraints. Fix any other failure now, with a failing test first, and commit it: the bless below must record the final gameplay.

- [ ] **Step 3: The duel gates**

Run: `npx vitest run tests/duelGates.test.ts`
Expected: every per-seed gate passes. If one fails because the Hunter dies on rock pieces, change only `SHIP_HULL` in `src/renderer/src/sim/tactical/tuning.ts` by +10 % a step (rounded), at most three steps, re-running after each; commit a kept change by itself (`tune(asteroids-iv): SHIP_HULL <old> -> <new> for duelGates`). If three steps do not pass, revert and stop: report the gate's telemetry lines to the owner.

- [ ] **Step 4: The two-step bless.** With N the current `SIM_VERSION`:

```bash
npm run bless                                                              # same-version bless of the new gameplay at N
npx tsx scripts/golden/canonical-trace.ts baseline && npx tsx scripts/golden/duel-oracle.ts baseline
git add tests/golden tests/fixtures
git commit -m "test(asteroids-iv): same-version bless at SIM_VERSION N for cell rocks (duel goldens re-recorded)"
```

Edit `src/renderer/src/sim/tuning.ts` to `export const SIM_VERSION = N + 1;`, then:

```bash
npx tsx scripts/golden/canonical-trace.ts check && npx tsx scripts/golden/duel-oracle.ts check && npm run bless && npx tsx scripts/golden/canonical-trace.ts golden
git add src/renderer/src/sim/tuning.ts tests/golden tests/fixtures
git commit -m "chore(asteroids-iv): SIM_VERSION N -> N+1 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)"
```

Expected: both checks report identical per-tick traces; `golden` reports `basic.json` differs only in version, digest and hashes. (Write the real numbers in the messages.)

- [ ] **Step 5: Re-pin trajectory fixtures only.** Run `npx vitest run`. For each remaining failure that pins a scripted trajectory (`duelCheckpoint`: run `npx tsx scripts/spike-asteroids-find-split.ts` and set `SEED`, `SPLIT` and the summary to what it prints; `duelModules`, `duelSnapshot`, `duelScripted`, `tacticalSlots`, `contactScene`: find the new value by the rule the test's own comment states), update the number and add `(SIM_VERSION N+1, asteroids-iv-a)` to its history comment. A failure that is not a pinned trajectory is a bug: fix it in its task's file with a failing test first, then repeat Step 4's same-version bless at N+1 (the bless guard allows it) and Step 3. Commit the re-pinned tests alone.

- [ ] **Step 6: Determinism and the app**

Run: `npm run test:determinism`
Expected: Node, Electron and Firefox agree.

Run: `npm run test:duel-app-runtime`
Expected: the duel app smoke passes.

- [ ] **Step 7: Screenshots.** In `scripts/spike-asteroids-iii-shots.cjs`, the last section staged cracks by writing hp; keep it (seams now) and add after it a cut and a shatter:

```js
  // asteroids-iv: a laser cut through the middle of the largest main-lane rock, then a torpedo's direct hit on another
  const c = await stage({ gap: 200, triple: false });
  await page.evaluate((k) => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical, a = h.rockAt(t, k); h.beginRockTick(t); h.breakRock(t, k, a.x, a.y, 0, 1, 'laser', 0, 'cut'); h.beginRockTick(t); }, c.rock);
  await page.waitForTimeout(150); await shot('cut-00s'); await page.waitForTimeout(3000); await shot('cut-03s'); await page.waitForTimeout(12000); await shot('cut-15s');
```

Install `playwright-core@1.48.2` in a scratch folder, copy the script there, and run `node spike-asteroids-iii-shots.cjs C:/Users/djuar/FTLite-shots/asteroids-iv C:/Users/djuar/FTLite/.worktrees/asteroids-iv` after `npm run build`. Look at `belt-000s`, `burst-00s`, `burst-02s`, `burst-10s`, `cracks-025-050-100`, `cut-00s`, `cut-03s`, `cut-15s`: rocks are dim cell outlines; a cut leaves two halves that fit together at 0 s and have drifted apart by 15 s; a torpedo hit leaves chunks round a gap; worn rocks show faint seams; nothing bright belongs to a rock.

- [ ] **Step 8: The gates entry.** Append to `docs/gates.md` a section `## Asteroids-iv-a: cell rocks, real pieces with true shapes (<date>)` in the file's form: the spec and plan paths; an `- [x] Automated` line with the suite's file and test counts and what the new tests cover (`rockCells`, `rockCellState`, `rockShapeHits`, `rockShapeContacts`, `rockBreak`, `rockOutline`, `rockLook`), the measure script's results, determinism, the app smoke, and "SIM_VERSION N -> N+1, goldens re-blessed"; an `- [x] Screenshots` line naming the folder; and an `- [ ] Manual (owner)` list:

```markdown
- [ ] Manual (owner): play a Single player duel and sit at Weapons.
  1. Look at the belt before touching anything. Do the rocks read as rock, and are the blocks the right size?
  2. Target a big rock with the laser and fire until it breaks. It parts in two along the beam, and the two halves fit together where they were.
  3. In MANUAL, graze a rock's edge until it breaks. A small chunk comes off the side.
  4. Hit a big rock with a torpedo. It leaves real chunks round a small gap, not round rocks.
  5. Fly the ship into the gap between two fresh halves, and past a half's flat face. You touch only what is drawn.
  6. Shoot through a bay in a rock at something behind it. The beam passes.

  Starting numbers, all in `src/renderer/src/sim/tactical/rockTuning.ts`: `RIM_DROP` 30 (how ragged), `CUT_KICK` 0.12 (how fast halves part), `CRATER_K` 0.75. The cell counts (7, 19, 31) are `SHELLS` in `rockCells.ts`. Nothing spins yet: that is iv-b.
```

- [ ] **Step 9: Commit and report**

```bash
git add docs/gates.md scripts/spike-asteroids-iii-shots.cjs
git commit -m "docs(gates): asteroids-iv-a entry (counts, measurements, screenshots, the owner's play steps)"
```

Report to the owner: what was built, the test counts, the measured cost, the screenshots' folder, and that the branch is ready to merge on their word (no merge, no push in this plan).

---

## Self-review notes

- **Spec coverage.** §3.1 and §3.2: Task 1. §3.3 and §8: Task 2 (with amendments 1 to 4). §5.1 to §5.4: Task 5 (amendment 5). §6: Tasks 3 and 4 (thin shots, the aim point, body contacts, the blast's reach in Task 5; the inertia terms and pushes at a point are iv-b). §7: Task 6 (orientation is iv-b). §9: Task 7. §10 iv-a's merge readiness and §11's tests: Tasks 1 to 8. §4 (motion), the rotational parts of §6 and `rockTurn` are iv-b, on purpose.
- **Not built here:** spin, friction, per-bond damage, a memo of world cells (unless Task 7 needs it).
