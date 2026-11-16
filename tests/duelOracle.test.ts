// The duel migration oracle (engine refactor spec §5, R-2): the alias table refuses an unmapped old field, a new field
// mapped twice or unaccounted for, and a count change; a re-run in the baseline's schema matches itself; a wrong alias
// is caught at the first tick it shows, naming the fields; and the version rules (a bump is the baseline plus 1, a
// same-version check needs the same version) hold.
import { describe, expect, it } from 'vitest';
import { aliasPlan, duelSchema, judgeDuelOracle, MIGRATIONS, ORACLE_RUNS, recordRun, runDifferences, type Migration, type OracleRunSpec, type OracleTrace } from '../scripts/golden/duelOracle';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { CUTTER } from './helpers/scriptedDuel';

const none: Migration = { change: 'none', rename: () => undefined, derived: [], added: [] };
const SHORT: OracleRunSpec = { id: 'scripted-3', seed: 3, crew: 'scripted', cap: 240 };

describe('the alias table', () => {
  it('maps unchanged names to themselves and leaves the version field out on both sides', () => {
    const plan = aliasPlan(['a', 'interior.$simVersion', 'b'], [1, 1, 2], ['b', 'interior.$simVersion', 'a'], [2, 1, 1]);
    expect(plan.problems).toEqual([]);
    expect(Array.from(plan.build([5, 6, 38, 7]))).toEqual([7, 5, 6]);
  });
  it('refuses an unmapped old field, a new field mapped twice or not at all, and a count change', () => {
    expect(aliasPlan(['a', 'gone'], [1, 1], ['a'], [1]).problems).toEqual(['old field gone is unmapped']);
    const twice: Migration = { ...none, rename: (o) => (o === 'b' ? 'a' : undefined) };
    expect(aliasPlan(['a', 'b'], [1, 1], ['a'], [1], twice).problems).toEqual(['new field a is mapped from two old fields (a and b)']);
    expect(aliasPlan(['a'], [1], ['a', 'fresh'], [1, 1]).problems).toEqual(['new field fresh is neither mapped nor declared added']);
    expect(aliasPlan(['a'], [1], ['a', 'fresh'], [1, 1], { ...none, added: [/^fresh$/] }).problems).toEqual([]);
    expect(aliasPlan(['a'], [2], ['a'], [3]).problems).toEqual(['old field a has 2 values, its new field a 3']);
  });
  it('rebuilds a derived old field from the new fields it reads, which then count as mapped', () => {
    const keyed: Migration = { ...none, derived: [{ old: /^pair$/, reads: /^slot\.\d$/, value: (_o, read, names) => names.flatMap((n) => Array.from(read(n))).reverse() }] };
    const plan = aliasPlan(['pair'], [2], ['slot.0', 'slot.1'], [1, 1], keyed);
    expect(plan.problems).toEqual([]);
    expect(Array.from(plan.build([3, 4]))).toEqual([4, 3]);
  });
  it('names every duel field once: the modules in flattenDuel order with the interior expanded', () => {
    const d = createDuel(CUTTER, 1);
    try {
      const { names, counts } = duelSchema(d);
      expect(new Set(names).size).toBe(names.length);
      expect(names.slice(0, 3)).toEqual(['space.tick', 'space.seed', 'space.rng.s']);
      expect(names).toContain('presence.present.1');
      expect(names).toContain('interior.$simVersion');
      expect(counts.every((c) => Number.isInteger(c) && c >= 0)).toBe(true);   // a layout with no airlocks has empty arrays
    } finally { disposeDuel(d); }
  });
});

describe('the R-2 alias table (37 → 38)', () => {
  it('moves the systems fields to the ship module and finds each old per-ship missile slot by its owner', () => {
    const m = MIGRATIONS[37]!;
    expect([m.rename('space.ships.1.hull'), m.rename('space.ships.0.rooms'), m.rename('space.ships.0.missilesLost')]).toEqual(['ship.systems.1.hull', 'ship.systems.0.rooms', 'ship.systems.0.missilesLost']);
    expect([m.rename('space.ships.0.x'), m.rename('space.ships.0.graceUntil'), m.rename('space.missiles.0')]).toEqual([undefined, undefined, undefined]);
    const pool = [0, 1].flatMap((k) => [`space.missiles.${k}.active`, `space.missiles.${k}.owner`, `space.missiles.${k}.flight`]);
    const plan = aliasPlan(['space.missiles.0', 'space.missiles.1'], [8, 8], pool, [1, 1, 7, 1, 1, 7], m);
    expect(plan.problems).toEqual([]);
    // Pool entry 0 holds ship 1's missile and entry 1 is free: the old slot 0 is empty, the old slot 1 is that missile.
    expect(Array.from(plan.build([1, 1, 10, 11, 12, 13, 14, 0.5, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 10, 11, 12, 13, 14, 0.5, 15]);
    expect(Array.from(plan.build([1, 1, 10, 11, 12, 13, 14, 0.5, 15, 1, 0, 20, 21, 22, 23, 24, -0.5, 25]))).toEqual([1, 20, 21, 22, 23, 24, -0.5, 25, 1, 10, 11, 12, 13, 14, 0.5, 15]);
    const added = ['space.ships.length', 'space.ships.0.active', 'ship.systems.0.cls', 'ship.systems.0.target'];
    expect(aliasPlan(['space.ships.0.hull'], [1], ['ship.systems.0.hull', ...added], [1, 1, 1, 1, 1], m).problems).toEqual([]);
    expect(aliasPlan(['space.ships.0.hull'], [1], ['ship.systems.0.hull', 'ship.systems.0.newGauge'], [1, 1], m).problems).toEqual(['new field ship.systems.0.newGauge is neither mapped nor declared added']);
  });
});

describe('the per-tick record', () => {
  it('a re-run in the baseline schema matches it; a wrong alias fails at its first tick, naming the fields', () => {
    const was = recordRun(SHORT).run;
    expect(was.perTick).toHaveLength(240);
    const same = recordRun(SHORT, { names: was.names, counts: was.counts });
    expect(same.problems).toEqual([]);
    expect(runDifferences(was, same.run)).toEqual([]);
    const swap: Migration = { ...none, rename: (o) => (o === 'space.ships.0.x' ? 'space.ships.1.x' : o === 'space.ships.1.x' ? 'space.ships.0.x' : undefined) };
    const wrong = recordRun(SHORT, { names: was.names, counts: was.counts, migration: swap });
    expect(wrong.problems).toEqual([]);
    const diff = runDifferences(was, wrong.run);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatch(/^scripted-3: first difference at tick 1 \(fields\); fields that differ during the run: space\.ships\.0\.x, space\.ships\.1\.x$/);
  }, 30_000);
});

describe('the judge', () => {
  const trace = (over: Partial<OracleTrace> = {}): OracleTrace => ({ simVersion: 37, cwd: '/repo', head: 'abc', runs: [], ...over });
  const rerun = () => { throw new Error('not reached'); };
  it('refuses without a baseline, from another repo root, and on a version that is not the baseline plus 1', () => {
    expect(judgeDuelOracle(undefined, rerun, '/repo', 'bump', 38).message).toMatch(/no duel oracle baseline/);
    expect(judgeDuelOracle(trace({ cwd: '/elsewhere' }), rerun, '/repo', 'bump', 38).message).toMatch(/recorded from \/elsewhere/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'bump', 39).message).toMatch(/a bump must be to 38, not 39/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'bump', 37).message).toMatch(/a bump must be to 38, not 37/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'same', 38).message).toMatch(/use `check` for a bump/);
  });
  it('re-runs every run in the baseline schema, through the migration only for a bump', () => {
    const runs = ORACLE_RUNS.map((s) => ({ id: s.id, names: ['a'], counts: [1], ticks: 2, outcome: 1, perTick: ['x', 'y'], chains: ['c'] }));
    const seen: (string | undefined)[] = [], migration: Migration = { ...none, change: 'R-test' };
    const ok = judgeDuelOracle(trace({ runs }), (spec, schema) => { seen.push(schema.migration?.change); return { problems: [], run: runs.find((r) => r.id === spec.id)! }; }, '/repo', 'bump', 38, { 37: migration });
    expect(ok.ok).toBe(true);
    expect(ok.message).toMatch(/20 runs, 40 ticks, 1 named fields, .* through the 37 → 38 alias table \(R-test\)/);
    expect(seen).toEqual(ORACLE_RUNS.map(() => 'R-test'));
    const bad = judgeDuelOracle(trace({ runs }), (spec) => ({ problems: [], run: { ...runs.find((r) => r.id === spec.id)!, perTick: ['x', 'z'], chains: ['d'] } }), '/repo', 'same', 37);
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/scripted-1: first difference at tick 2 \(fields\); fields that differ during the run: a/);
  });
});
