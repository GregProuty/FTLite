// Structural sharing for per-frame views (React UI spec §2): equal subtrees keep their identity so memoised panels skip.
import { describe, expect, it } from 'vitest';
import { replaceEqualDeep } from '../src/renderer/src/ui/share';

describe('replaceEqualDeep', () => {
  it('returns prev itself when next is deeply equal', () => {
    const prev = { a: [1, { b: 'x' }], c: null, d: { e: true } };
    expect(replaceEqualDeep(prev, { a: [1, { b: 'x' }], c: null, d: { e: true } })).toBe(prev);
  });
  it('keeps the identity of unchanged subtrees and replaces changed ones', () => {
    const prev = { rows: [{ v: 1 }, { v: 2 }], help: ['h'], end: null as { t: string } | null };
    const out = replaceEqualDeep(prev, { rows: [{ v: 1 }, { v: 3 }], help: ['h'], end: { t: 'x' } });
    expect(out).not.toBe(prev); expect(out.help).toBe(prev.help); expect(out.rows[0]).toBe(prev.rows[0]);
    expect(out.rows[1]).toEqual({ v: 3 }); expect(out.rows).not.toBe(prev.rows); expect(out.end).toEqual({ t: 'x' });
  });
  it('treats arrays of different length, primitives, nulls and type changes as changes', () => {
    expect(replaceEqualDeep([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(replaceEqualDeep(1, 2)).toBe(2); expect(replaceEqualDeep('a', 'a')).toBe('a');
    expect(replaceEqualDeep(null, { a: 1 })).toEqual({ a: 1 }); expect(replaceEqualDeep({ a: 1 }, null)).toBeNull();
    expect(replaceEqualDeep({ a: 1 }, [1])).toEqual([1]); expect(replaceEqualDeep({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(replaceEqualDeep({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
  });
});
