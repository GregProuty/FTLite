// UI round Part 3: the amber filter's luminance-to-ramp tables.
import { describe, expect, it } from 'vitest';
import { amberTables } from '../src/renderer/src/render/amberFilter';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';

const ch = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const r3 = (v: number): number => Math.round((v / 255) * 1000) / 1000;

describe('amberTables', () => {
  it('six values per channel, glass first and hot last', () => {
    const t = amberTables();
    const parse = (s: string): number[] => s.split(' ').map(Number);
    const [r, g, b] = [parse(t.r), parse(t.g), parse(t.b)];
    for (const v of [r, g, b]) expect(v.length).toBe(6);
    const glass = ch(CRT.glass), hot = ch(CRT.hot);
    expect([r[0], g[0], b[0]]).toEqual(glass.map(r3));
    expect([r[5], g[5], b[5]]).toEqual(hot.map(r3));
  });
});
