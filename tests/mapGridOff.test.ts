// UI round spec §1.3: the 'off' grid draws no lines but keeps the square names; it is the default; a version 2 settings
// record (the old default 'gravity' was saved on every first save) reads 'off'.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_GRID, MAP_GRID_LABELS, MAP_GRID_SETTINGS, validMapGrid } from '../src/renderer/src/render/tactical/mapGrid';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel } from '../src/renderer/src/render/tactical/tacticalModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

const mem = (raw: string) => { const m = new Map([[SETTINGS_KEY, raw]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const model = (mapGrid: 'off' | 'gravity' | 'square') => {
  const st = createTacticalState(1);
  return tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc })), alpha: 1, camera: createCamera(0, 0, 0.5), viewport: { w: 1280, h: 720 }, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, mapGrid });
};

describe('the off grid (spec §1.3)', () => {
  it('is a setting, the default, and labelled Off', () => {
    expect(MAP_GRID_SETTINGS).toEqual(['off', 'gravity', 'square']);
    expect(DEFAULT_MAP_GRID).toBe('off');
    expect(MAP_GRID_LABELS.off).toBe('Off');
    expect(validMapGrid('off')).toBe(true);
  });
  it('draws no lines or curves, but keeps the column and row names', () => {
    const g = model('off').grid;
    expect(g.lines).toEqual([]);
    expect(g.curves).toBeUndefined();
    expect(g.columns.length).toBeGreaterThan(0);
    expect(g.rows.length).toBeGreaterThan(0);
    expect(model('square').grid.lines.length).toBeGreaterThan(0);
    expect(model('gravity').grid.curves!.length).toBeGreaterThan(0);
  });
  it('settings: version 3; a version 2 record keeps its fields but reads the grid off; a version 3 record keeps its grid', () => {
    expect(DEFAULT_SETTINGS.version).toBe(3);
    expect(DEFAULT_SETTINGS.mapGrid).toBe('off');
    const v2 = loadSettings(mem('{"version":2,"master":0.25,"music":1,"effects":0.5,"shake":"low","mapGrid":"gravity","throttleTapMs":250}'));
    expect(v2).toMatchObject({ version: 3, master: 0.25, music: 1, effects: 0.5, shake: 'low', mapGrid: 'off', throttleTapMs: 250 });
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"mapGrid":"square"}')).mapGrid).toBe('square');
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"mapGrid":"round"}')).mapGrid).toBe('off');
  });
});
