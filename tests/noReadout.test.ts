// UI round spec §2.2: the info box (readout panel) is gone from every view; its model keeps only the helpers other views use.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as readout from '../src/renderer/src/render/duel/readoutModel';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';

describe('no info box (spec §2.2)', () => {
  it('the panel and its row list are gone', () => {
    expect(existsSync('src/renderer/src/ui/duel/ReadoutPanel.tsx')).toBe(false);
    expect(Object.keys(readout).sort()).toEqual(['HEALTH_LOW', 'chargeRow', 'crewStatus', 'healthRow', 'level'].sort());
    expect(readFileSync('src/renderer/src/ui/views.ts', 'utf8')).not.toMatch(/readout:/);
    expect(readFileSync('src/renderer/src/app/duel/scene.ts', 'utf8')).not.toMatch(/readoutRows|readoutHelp|READOUT_COLUMN/);
  });
  it('the ship fills the whole width under the tab strip', () => {
    expect(INTERIOR_BAND).toEqual({ x: 0, y: 42, w: INTERNAL_W, h: INTERNAL_H - 42 });
  });
});
