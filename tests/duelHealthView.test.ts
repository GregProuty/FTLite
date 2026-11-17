// Duel health views (duel-health spec §2): the HEALTH readout row, OTHER DOWNED on the local and online sources, the
// interior health bars and the downed label, and the help line.
import { describe, expect, it } from 'vitest';
import { Health, Life, LifeState, Position, Seated } from '../src/renderer/src/sim/components';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { emptyPresses } from '../src/renderer/src/app/duel/input';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { interiorOverlay } from '../src/renderer/src/render/duel/interiorModel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx, TEXT, WARN } from '../src/renderer/src/render/theme';
import { TILE_PX } from '../src/shared/resolution';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const healthRow = (d: DuelState, active: 0 | 1, mode: ReadoutMode = 'interior') => readoutRows({ duel: d, mode, active, other: 'WALKING' }).find((r) => r.label === 'HEALTH')!;

describe('duel health views (spec §2)', () => {
  it('the HEALTH row shows the shown character: 72/100, red under 30, DOWNED when downed', () => {
    const d = createDuel(CUTTER, 5);
    try {
      for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) expect(healthRow(d, 0, mode)).toMatchObject({ value: '100/100', valueTint: TEXT });
      Health.cur[d.interior.crew[0]!] = 71.4;
      expect(healthRow(d, 0)).toMatchObject({ value: '72/100', valueTint: TEXT });
      expect(healthRow(d, 1).value).toBe('100/100');
      Health.cur[d.interior.crew[0]!] = 29;
      expect(healthRow(d, 0)).toMatchObject({ value: '29/100', valueTint: WARN, emphasis: 'alert' });
      Health.cur[d.interior.crew[0]!] = 0.01;
      expect(healthRow(d, 0).value).toBe('1/100');
      Health.cur[d.interior.crew[0]!] = 0; Life.state[d.interior.crew[0]!] = LifeState.Downed;
      expect(healthRow(d, 0)).toMatchObject({ value: 'DOWNED', valueTint: WARN, emphasis: 'alert' });
      const labels = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'DOWNED' }).map((r) => [r.label, r.value]);
      expect(labels.slice(-3)).toEqual([['HEALTH', 'DOWNED'], ['OTHER', 'PRESENT'], ['', 'DOWNED']]);
    } finally { disposeDuel(d); }
  });
  it('every row, the longest list and the help fit the 220-px column, with STAND BY DOWNED TO REVIVE', () => {
    expect(readoutHelp('interior')).toContain('STAND BY DOWNED TO REVIVE');
    const d = createDuel(CUTTER, 5);
    try {
      Life.state[d.interior.crew[0]!] = LifeState.Downed;
      for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) {
        const rows = readoutRows({ duel: d, mode, active: 0, other: 'DOWNED' });
        expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
        for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value))).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
        expect(readoutHelp(mode).length).toBeLessThanOrEqual(5);
        for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      }
    } finally { disposeDuel(d); }
  });
  it('the interior draws a health bar below full, and DOWNED - STAY CLOSE while a downed character is picked up', () => {
    const d = createDuel(CUTTER, 5), [a, b] = d.interior.crew as [number, number];
    try {
      expect(interiorOverlay(d).crew.map((c) => [c.bar, c.downed, c.label])).toEqual([[false, false, ''], [false, false, '']]);
      Health.cur[a] = 40;
      expect(interiorOverlay(d).crew[0]).toMatchObject({ pid: 0, x: Position.x[a]! * TILE_PX, y: Position.y[a]! * TILE_PX, fill: 0.4, bar: true, downed: false, label: '' });
      Health.cur[b] = 0; Life.state[b] = LifeState.Downed;
      expect(interiorOverlay(d).crew[1]).toMatchObject({ bar: false, downed: true, revive: 0, label: 'DOWNED' });
      Life.reviveProgress[b] = 0.5;
      expect(interiorOverlay(d).crew[1]).toMatchObject({ revive: 0.5, label: 'DOWNED - STAY CLOSE' });
    } finally { disposeDuel(d); }
  });
  it('the local runtime shows the other character DOWNED', () => {
    const rt = createDuelRuntime({
      now: () => 0, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 }, layout: CUTTER,
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    try {
      expect(rt.otherStatus()).toBe('AT WEAPONS');
      const e = rt.duel.interior.crew[1]!;
      Seated.station[e] = -1; rt.duel.interior.stations.occupant[rt.duel.weapons] = -1; Life.state[e] = LifeState.Downed;
      expect(rt.otherStatus()).toBe('DOWNED');
    } finally { rt.dispose(); }
  });
  it('the online source shows the other character DOWNED', () => {
    const d = createDuel(CUTTER, 5);
    let replica: DuelState | null = null;
    const client = { state: () => replica, publication: () => (replica ? { publicationSequence: 1, tick: d.interior.tick, phase: 'running' } : null) };
    const source = createOnlineDuelSource({ client: client as never, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      const e = d.interior.crew[1]!;
      Seated.station[e] = -1; d.interior.stations.occupant[d.weapons] = -1; Health.cur[e] = 0; Life.state[e] = LifeState.Downed;
      replica = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      source.frame(1 / 60, null, null);
      expect(source.otherStatus()).toBe('DOWNED');
    } finally { disposeDuel(d); if (replica) disposeDuel(replica); }
  });
});
