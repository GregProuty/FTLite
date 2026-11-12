import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const HEADINGS = ['Lobby', 'Join', 'Start', 'Sit', 'Fire', 'Debris', 'Jump', 'Event', 'Shop', 'Boarding', 'Game over', 'Restart'];

describe('docs/playtest.md (spec Demo-i section 8)', () => {
  const lines = readFileSync('docs/playtest.md', 'utf8').split(/\r?\n/);
  it('has the four header fields', () => {
    for (const f of ['Date:', 'Players:', 'Seed:', 'Build (commit):']) expect(lines.some((l) => l.startsWith(f))).toBe(true);
  });
  it('has exactly twelve steps in order, each with a non-empty See: line and a Notes: line', () => {
    const at = lines.flatMap((l, i) => (l.startsWith('- [ ] ') ? [i] : []));
    expect(at.map((i) => lines[i]!.slice(6))).toHaveLength(12);
    at.forEach((i, k) => {
      expect(lines[i]!.slice(6).startsWith(HEADINGS[k]!)).toBe(true);
      expect(lines[i + 1]).toMatch(/^\s+See: \S/);
      expect(lines[i + 2]).toMatch(/^\s+Notes:/);
    });
  });
});
