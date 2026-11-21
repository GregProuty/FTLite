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
