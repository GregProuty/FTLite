import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The couch playtest checklist for the Skiff (rewritten 2026-11-13, replacing the Demo-i script).
describe('docs/playtest.md (the couch checklist)', () => {
  const lines = readFileSync('docs/playtest.md', 'utf8').split(/\r?\n/);
  it('has the header fields', () => {
    for (const f of ['Date:', 'Players (who sat where):', 'Seed', 'Build (commit):']) expect(lines.some((l) => l.startsWith(f)), f).toBe(true);
  });
  it('has the sections 1 to 7 in order; each but section 6 has at least one checkbox line', () => {
    const at = [1, 2, 3, 4, 5, 6, 7].map((n) => lines.findIndex((l) => l.startsWith(`## ${n}.`)));
    for (const i of at) expect(i).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < at.length; k++) expect(at[k]!).toBeGreaterThan(at[k - 1]!);
    at.forEach((start, k) => {
      if (k + 1 === 6) return;   // section 6 is a numbered list of questions
      const end = k + 1 < at.length ? at[k + 1]! : lines.length;
      expect(lines.slice(start + 1, end).some((l) => l.startsWith('- [ ] ')), `section ${k + 1}`).toBe(true);
    });
  });
});
